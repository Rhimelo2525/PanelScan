package com.example.panelscan.feature.measurement.ar.quality

import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.feature.measurement.ar.PlaneSignature
import com.example.panelscan.feature.measurement.ar.WorldPoint3
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.sqrt

/** What a surface is, from its normal in ARCore world space (+Y is up, against gravity). */
enum class SurfaceOrientation { VERTICAL, HORIZONTAL_UP, HORIZONTAL_DOWN, SLANTED }

internal fun WorldPoint3.minus(o: WorldPoint3) = WorldPoint3(x - o.x, y - o.y, z - o.z)
internal fun WorldPoint3.plus(o: WorldPoint3) = WorldPoint3(x + o.x, y + o.y, z + o.z)
internal fun WorldPoint3.times(s: Float) = WorldPoint3(x * s, y * s, z * s)
internal fun WorldPoint3.dot(o: WorldPoint3) = x * o.x + y * o.y + z * o.z
internal fun WorldPoint3.cross(o: WorldPoint3) =
    WorldPoint3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
internal fun WorldPoint3.length() = sqrt(x * x + y * y + z * z)
internal fun WorldPoint3.normalisedOrNull(): WorldPoint3? {
    val l = length()
    return if (l <= 1e-6f) null else WorldPoint3(x / l, y / l, z / l)
}

/**
 * Wall / floor / ceiling decisions from a surface normal.
 *
 * ARCore's own plane type is used where a tracked plane exists, but depth-fitted surfaces
 * have no type, so the orientation is recomputed from geometry here and the same rule is
 * applied to both — a floor can never be accepted as a wall, whichever path found it.
 */
object SurfaceOrientationClassifier {

    /** A wall may lean this far from true vertical before it stops counting as a wall. */
    const val VERTICAL_TOLERANCE_DEGREES = 15f

    /** A floor or ceiling may tilt this far from level. */
    const val HORIZONTAL_TOLERANCE_DEGREES = 15f

    private val maxVerticalNy = kotlin.math.sin(Math.toRadians(VERTICAL_TOLERANCE_DEGREES.toDouble())).toFloat()
    private val minHorizontalNy = kotlin.math.cos(Math.toRadians(HORIZONTAL_TOLERANCE_DEGREES.toDouble())).toFloat()

    /** [normal] must already face the camera (see [orientTowardsCamera]). */
    fun classify(normal: WorldPoint3): SurfaceOrientation {
        val n = normal.normalisedOrNull() ?: return SurfaceOrientation.SLANTED
        return when {
            abs(n.y) <= maxVerticalNy -> SurfaceOrientation.VERTICAL
            n.y >= minHorizontalNy -> SurfaceOrientation.HORIZONTAL_UP
            n.y <= -minHorizontalNy -> SurfaceOrientation.HORIZONTAL_DOWN
            else -> SurfaceOrientation.SLANTED
        }
    }

    fun matches(surfaceType: SurfaceType, orientation: SurfaceOrientation): Boolean = when (surfaceType) {
        SurfaceType.WALL -> orientation == SurfaceOrientation.VERTICAL
        SurfaceType.CEILING -> orientation == SurfaceOrientation.HORIZONTAL_DOWN
    }

    /**
     * A fitted normal has no inherent sign. Flip it to face the camera, which makes "facing
     * down" mean ceiling and "facing up" mean floor regardless of how it was computed.
     */
    fun orientTowardsCamera(normal: WorldPoint3, pointOnSurface: WorldPoint3, camera: WorldPoint3): WorldPoint3 {
        val toCamera = camera.minus(pointOnSurface)
        return if (normal.dot(toCamera) < 0f) normal.times(-1f) else normal
    }

    /** Angle between two surface normals, ignoring sign. */
    fun angleBetweenDegrees(a: WorldPoint3, b: WorldPoint3): Float {
        val na = a.normalisedOrNull() ?: return 90f
        val nb = b.normalisedOrNull() ?: return 90f
        val dot = abs(na.dot(nb)).coerceIn(0f, 1f)
        return Math.toDegrees(acos(dot).toDouble()).toFloat()
    }
}

/** Least-squares plane through a handful of depth/feature hits. */
data class PlaneFitResult(
    val normal: WorldPoint3,
    val centroid: WorldPoint3,
    /** Root-mean-square distance of the points from the fitted plane, metres. */
    val rmsResidual: Float,
    val maxResidual: Float,
    val pointCount: Int,
    /** Largest distance of any point from the centroid; tiny spreads fit anything. */
    val spread: Float
) {
    fun signature(): PlaneSignature = PlaneSignature(
        normalX = normal.x, normalY = normal.y, normalZ = normal.z,
        centerX = centroid.x, centerY = centroid.y, centerZ = centroid.z
    )
}

object PlaneFitter {

    /**
     * Fits a plane by principal component analysis: the normal is the eigenvector of the
     * points' covariance with the smallest eigenvalue. Returns null for fewer than three
     * points or a degenerate (collinear / coincident) set.
     */
    fun fit(points: List<WorldPoint3>): PlaneFitResult? {
        if (points.size < 3) return null
        var cx = 0.0; var cy = 0.0; var cz = 0.0
        points.forEach { cx += it.x; cy += it.y; cz += it.z }
        val n = points.size.toDouble()
        cx /= n; cy /= n; cz /= n

        val c = Array(3) { DoubleArray(3) }
        var spread = 0.0
        points.forEach { p ->
            val dx = p.x - cx; val dy = p.y - cy; val dz = p.z - cz
            c[0][0] += dx * dx; c[0][1] += dx * dy; c[0][2] += dx * dz
            c[1][1] += dy * dy; c[1][2] += dy * dz; c[2][2] += dz * dz
            spread = maxOf(spread, sqrt(dx * dx + dy * dy + dz * dz))
        }
        c[1][0] = c[0][1]; c[2][0] = c[0][2]; c[2][1] = c[1][2]

        val (values, vectors) = jacobiEigen(c)
        val sorted = values.indices.sortedBy { values[it] }
        // The middle eigenvalue must be meaningful, otherwise the points lie on a line and
        // any plane containing that line fits equally well.
        if (values[sorted[1]] < 1e-7) return null
        val k = sorted[0]
        val normal = WorldPoint3(
            vectors[0][k].toFloat(),
            vectors[1][k].toFloat(),
            vectors[2][k].toFloat()
        ).normalisedOrNull() ?: return null
        val centroid = WorldPoint3(cx.toFloat(), cy.toFloat(), cz.toFloat())

        var sumSq = 0f
        var worst = 0f
        points.forEach { p ->
            val d = abs(p.minus(centroid).dot(normal))
            sumSq += d * d
            worst = maxOf(worst, d)
        }
        return PlaneFitResult(
            normal = normal,
            centroid = centroid,
            rmsResidual = sqrt(sumSq / points.size),
            maxResidual = worst,
            pointCount = points.size,
            spread = spread.toFloat()
        )
    }

    /** Cyclic Jacobi rotation for a symmetric 3x3; returns eigenvalues and column eigenvectors. */
    private fun jacobiEigen(input: Array<DoubleArray>): Pair<DoubleArray, Array<DoubleArray>> {
        val a = Array(3) { input[it].copyOf() }
        val v = Array(3) { i -> DoubleArray(3) { j -> if (i == j) 1.0 else 0.0 } }
        repeat(32) {
            var off = 0.0
            for (p in 0 until 3) for (q in p + 1 until 3) off += a[p][q] * a[p][q]
            if (off < 1e-18) return@repeat
            for (p in 0 until 3) {
                for (q in p + 1 until 3) {
                    if (abs(a[p][q]) < 1e-20) continue
                    val theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q])
                    val t = (if (theta >= 0) 1.0 else -1.0) / (abs(theta) + sqrt(theta * theta + 1.0))
                    val cos = 1.0 / sqrt(t * t + 1.0)
                    val sin = t * cos
                    for (k in 0 until 3) {
                        val akp = a[k][p]; val akq = a[k][q]
                        a[k][p] = cos * akp - sin * akq
                        a[k][q] = sin * akp + cos * akq
                    }
                    for (k in 0 until 3) {
                        val apk = a[p][k]; val aqk = a[q][k]
                        a[p][k] = cos * apk - sin * aqk
                        a[q][k] = sin * apk + cos * aqk
                    }
                    for (k in 0 until 3) {
                        val vkp = v[k][p]; val vkq = v[k][q]
                        v[k][p] = cos * vkp - sin * vkq
                        v[k][q] = sin * vkp + cos * vkq
                    }
                }
            }
        }
        return DoubleArray(3) { a[it][it] } to v
    }
}

object SurfaceMath {

    /** Distance of [point] from the plane, signed along the plane normal. */
    fun signedDistance(plane: PlaneSignature, point: WorldPoint3): Float {
        val n = WorldPoint3(plane.normalX, plane.normalY, plane.normalZ).normalisedOrNull() ?: return Float.MAX_VALUE
        return point.minus(WorldPoint3(plane.centerX, plane.centerY, plane.centerZ)).dot(n)
    }

    /** Orthogonal projection of [point] onto the plane. */
    fun project(plane: PlaneSignature, point: WorldPoint3): WorldPoint3 {
        val n = WorldPoint3(plane.normalX, plane.normalY, plane.normalZ).normalisedOrNull() ?: return point
        return point.minus(n.times(signedDistance(plane, point)))
    }

    /**
     * Rotation (x, y, z, w) taking +Y onto [normal] — the pose convention ARCore uses for
     * planes, so a lock anchor created with it reads back exactly like a plane centre pose.
     */
    fun quaternionFromUpTo(normal: WorldPoint3): FloatArray {
        val n = normal.normalisedOrNull() ?: return floatArrayOf(0f, 0f, 0f, 1f)
        val up = WorldPoint3(0f, 1f, 0f)
        val d = up.dot(n)
        if (d > 0.999999f) return floatArrayOf(0f, 0f, 0f, 1f)
        if (d < -0.999999f) return floatArrayOf(1f, 0f, 0f, 0f) // 180° about X
        val axis = up.cross(n)
        val w = 1f + d
        val len = sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z + w * w)
        return floatArrayOf(axis.x / len, axis.y / len, axis.z / len, w / len)
    }

    /** Rotates +Y by quaternion (x, y, z, w) — the inverse check of [quaternionFromUpTo]. */
    fun rotateUp(q: FloatArray): WorldPoint3 {
        val (x, y, z, w) = q
        return WorldPoint3(
            2f * (x * y - w * z),
            1f - 2f * (x * x + z * z),
            2f * (y * z + w * x)
        )
    }
}
