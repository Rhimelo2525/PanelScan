package com.example.panelscan.feature.measurement.ar

import com.example.panelscan.core.model.SurfaceType
import kotlin.math.abs
import kotlin.math.sqrt

/** Small, Android-free geometry primitives used by the AR controller and local tests. */
data class WorldPoint3(val x: Float, val y: Float, val z: Float)

/** A tracked plane reduced to the values needed to decide whether two hits are coplanar. */
data class PlaneSignature(
    val normalX: Float,
    val normalY: Float,
    val normalZ: Float,
    val centerX: Float,
    val centerY: Float,
    val centerZ: Float
)

object ArMeasurementGeometry {
    private const val MAX_NORMAL_DELTA_DEGREES = 9.0
    private const val MAX_PLANE_SEPARATION_METRES = 0.08f
    private val minNormalDot = kotlin.math.cos(Math.toRadians(MAX_NORMAL_DELTA_DEGREES)).toFloat()

    fun acceptsSurface(surfaceType: SurfaceType, hitKind: HitKind): Boolean = when (surfaceType) {
        SurfaceType.WALL -> hitKind == HitKind.VerticalPlane
        SurfaceType.CEILING -> hitKind == HitKind.HorizontalDownward
    }

    /**
     * ARCore may represent one large wall as multiple plane trackables. Identity alone is
     * therefore too strict: parallel planes occupying the same geometric plane are accepted.
     */
    fun areCoplanar(first: PlaneSignature, candidate: PlaneSignature): Boolean {
        val a = normalised(first.normalX, first.normalY, first.normalZ) ?: return false
        val b = normalised(candidate.normalX, candidate.normalY, candidate.normalZ) ?: return false
        val parallel = abs(a.x * b.x + a.y * b.y + a.z * b.z) >= minNormalDot
        if (!parallel) return false

        val dx = candidate.centerX - first.centerX
        val dy = candidate.centerY - first.centerY
        val dz = candidate.centerZ - first.centerZ
        val separation = abs(dx * a.x + dy * a.y + dz * a.z)
        return separation <= MAX_PLANE_SEPARATION_METRES
    }

    fun distance(a: WorldPoint3, b: WorldPoint3): Double {
        val dx = (b.x - a.x).toDouble()
        val dy = (b.y - a.y).toDouble()
        val dz = (b.z - a.z).toDouble()
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    /** Returns a real world-space ray/plane intersection, or null for parallel/behind/range. */
    fun intersectRayWithPlane(
        origin: WorldPoint3,
        direction: WorldPoint3,
        plane: PlaneSignature,
        minDistance: Float,
        maxDistance: Float
    ): WorldPoint3? {
        val normal = normalised(plane.normalX, plane.normalY, plane.normalZ) ?: return null
        val ray = normalised(direction.x, direction.y, direction.z) ?: return null
        val denominator = ray.x * normal.x + ray.y * normal.y + ray.z * normal.z
        if (abs(denominator) < 0.05f) return null
        val distance = (
            (plane.centerX - origin.x) * normal.x +
                (plane.centerY - origin.y) * normal.y +
                (plane.centerZ - origin.z) * normal.z
            ) / denominator
        if (distance !in minDistance..maxDistance) return null
        return WorldPoint3(
            origin.x + ray.x * distance,
            origin.y + ray.y * distance,
            origin.z + ray.z * distance
        )
    }

    /**
     * Width and height of the rectangle the three taps mark: [first] to [second]
     * is one side, [third] gives the other (its distance square to that side).
     * On a wall the width is the level side and the height the upright one,
     * whichever was tapped first; AR's y axis points up. A ceiling keeps the
     * tap order, as neither side is upright there.
     */
    fun rectangleSize(first: WorldPoint3, second: WorldPoint3, third: WorldPoint3, surfaceType: SurfaceType): Pair<Double, Double> {
        val side = distance(first, second)
        val across = perpendicularExtent(first, second, third)
        if (surfaceType != SurfaceType.WALL || side <= 1e-6 || across <= 1e-6) return side to across
        // How upright the tapped side is: its rise over its length (0 level, 1 straight up).
        val sideRise = abs(second.y - first.y) / side
        // The other side's direction is what is left of first->third after its part along the tapped side.
        val ax = (second.x - first.x) / side; val ay = (second.y - first.y) / side; val az = (second.z - first.z) / side
        val vx = third.x - first.x; val vy = third.y - first.y; val vz = third.z - first.z
        val along = vx * ax + vy * ay + vz * az
        val acrossRise = abs(vy - along * ay) / across
        return if (sideRise > acrossRise) across to side else side to across
    }

    /** The middle value on each axis: one point that ignores a stray sample or two. */
    fun medianPoint(points: List<WorldPoint3>): WorldPoint3 {
        require(points.isNotEmpty())
        fun median(values: List<Float>): Float = values.sorted().let { sorted ->
            if (sorted.size % 2 == 1) sorted[sorted.size / 2] else (sorted[sorted.size / 2 - 1] + sorted[sorted.size / 2]) / 2f
        }
        return WorldPoint3(median(points.map { it.x }), median(points.map { it.y }), median(points.map { it.z }))
    }

    /** How far [point] is from [plane] (its infinite extension), in metres. */
    fun distanceToPlane(point: WorldPoint3, plane: PlaneSignature): Float {
        val normal = normalised(plane.normalX, plane.normalY, plane.normalZ) ?: return Float.MAX_VALUE
        return abs((point.x - plane.centerX) * normal.x + (point.y - plane.centerY) * normal.y + (point.z - plane.centerZ) * normal.z)
    }

    /** Perpendicular extent from the width line; sideways drift is not counted as height. */
    fun perpendicularExtent(widthStart: WorldPoint3, widthEnd: WorldPoint3, extent: WorldPoint3): Double {
        val axisX = widthEnd.x - widthStart.x
        val axisY = widthEnd.y - widthStart.y
        val axisZ = widthEnd.z - widthStart.z
        val axisLength = sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ)
        if (axisLength <= 1e-6f) return 0.0

        val nx = axisX / axisLength
        val ny = axisY / axisLength
        val nz = axisZ / axisLength
        val vx = extent.x - widthEnd.x
        val vy = extent.y - widthEnd.y
        val vz = extent.z - widthEnd.z
        val along = vx * nx + vy * ny + vz * nz
        val px = vx - along * nx
        val py = vy - along * ny
        val pz = vz - along * nz
        return sqrt((px * px + py * py + pz * pz).toDouble())
    }

    private fun normalised(x: Float, y: Float, z: Float): WorldPoint3? {
        val length = sqrt(x * x + y * y + z * z)
        if (length <= 1e-6f) return null
        return WorldPoint3(x / length, y / length, z / length)
    }
}
