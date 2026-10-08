package com.example.panelscan.feature.measurement.ar

import android.media.Image
import com.example.panelscan.core.model.SurfaceType
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.TrackingState
import dev.romainguy.kotlin.math.Float3
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** What kind of architectural boundary a candidate looks like, if any. */
enum class CornerType {
    WALL_WALL,
    WALL_FLOOR,
    WALL_CEILING,
    UNKNOWN;

    val label: String
        get() = when (this) {
            WALL_WALL -> "wall/wall"
            WALL_FLOOR -> "wall/floor"
            WALL_CEILING -> "wall/ceiling"
            UNKNOWN -> "unknown"
        }
}

/**
 * Everything known about one candidate after the geometry stage. Carried into the debug
 * overlay so a false lock can be explained rather than guessed at.
 */
data class CornerEvidence(
    val score: Float = 0f,
    val geometryConfirmed: Boolean = false,
    val rejectReason: String? = null,
    val lineStrength: Int = 0,
    val minLengthPx: Float = 0f,
    val maxLengthPx: Float = 0f,
    val reticleDistancePx: Float = 0f,
    /** Metres from the candidate to the nearest edge of its plane's polygon. */
    val planeBoundaryMetres: Float = Float.MAX_VALUE,
    /** Largest angle between normals of planes probed around the candidate. */
    val planeNormalDeltaDegrees: Float = 0f,
    /** Scale-free depth slope break across the candidate, horizontally and vertically. */
    val depthGradientX: Float = 0f,
    val depthGradientY: Float = 0f,
    val depthSampled: Boolean = false,
    val repetitionPenalty: Float = 0f,
    val quadrantContrast: Float = 0f,
    val cornerType: CornerType = CornerType.UNKNOWN
)

/**
 * Geometric evidence gathering for a corner candidate.
 *
 * The previous classifier scored candidates entirely on 2D image evidence plus reticle
 * proximity, which is exactly what a wallpaper cross scores highest on. Everything here
 * asks a different question: *is there a real change in the world at this point*, not *do
 * two strong lines meet in the picture*.
 */
object CornerGeometry {

    /** Offsets, in view pixels, at which the surrounding planes are probed. */
    private const val PROBE_OFFSET_PX = 46f

    /** Depth samples are taken this many depth-image pixels apart. */
    private const val DEPTH_STEP_PX = 3

    /** Samples per side of the candidate when fitting the two depth slopes. */
    private const val DEPTH_SAMPLES_PER_SIDE = 4

    /**
     * Scale-free slope-break above which a depth profile is considered to bend. Depth
     * changes per pixel scale with distance, so the raw break is divided by the candidate's
     * distance before comparison — a fixed millimetre threshold would pass everything close
     * up and nothing across a room.
     */
    private const val DEPTH_BREAK_THRESHOLD = 0.0016f

    /** Clamp so a noisy depth map cannot manufacture a huge apparent break. */
    private const val DEPTH_BREAK_CEILING = 0.02f

    /**
     * Below this angle two planes are the same surface as far as we are concerned.
     * Raised from 12° to 18°: ARCore plane estimation adds ~10–15° of angular noise even
     * on a perfectly flat wall, so the 12° threshold was falsely triggering on smooth
     * surfaces. 18° reliably separates "same wall" from "two walls meeting".
     */
    private const val SAME_SURFACE_DEGREES = 18f

    /** A candidate this close to a plane's polygon edge sits on a real boundary. */
    private const val BOUNDARY_NEAR_M = 0.12f

    /** Beyond this, the candidate is deep inside one flat plane. */
    private const val BOUNDARY_DEEP_M = 0.55f

    /**
     * Probes the planes immediately around a candidate. Four extra hit tests, run only for
     * the single best candidate per tick.
     */
    fun probeNormals(
        frame: Frame,
        viewX: Float,
        viewY: Float,
        primaryPlane: Plane
    ): NormalProbe {
        val planes = ArrayList<Plane>(5)
        planes += primaryPlane

        val offsets = floatArrayOf(
            -PROBE_OFFSET_PX, 0f,
            PROBE_OFFSET_PX, 0f,
            0f, -PROBE_OFFSET_PX,
            0f, PROBE_OFFSET_PX
        )
        var i = 0
        while (i < offsets.size) {
            val x = viewX + offsets[i]
            val y = viewY + offsets[i + 1]
            i += 2
            if (x < 0f || y < 0f) continue
            val hits = try {
                frame.hitTest(x, y)
            } catch (_: Throwable) {
                continue
            }
            for (hit in hits) {
                val trackable = hit.trackable
                if (trackable !is Plane) continue
                if (trackable.trackingState != TrackingState.TRACKING) continue
                if (planes.none { it == trackable }) planes += trackable
                break
            }
        }

        var maxAngle = 0f
        for (a in planes.indices) {
            for (b in a + 1 until planes.size) {
                maxAngle = max(maxAngle, normalAngleDegrees(planes[a], planes[b]))
            }
        }

        val cameraY = runCatching { frame.camera.pose.ty() }.getOrNull()
        return NormalProbe(planes = planes, maxNormalDeltaDegrees = maxAngle, cameraY = cameraY)
    }

    class NormalProbe(
        val planes: List<Plane>,
        val maxNormalDeltaDegrees: Float,
        val cameraY: Float? = null
    ) {

        /**
         * Names the boundary from the plane types actually found around the point, rather
         * than assuming one from the mode the user selected.
         */
        fun classify(): CornerType {
            // A floor near two walls must not hide their intersection, and two nearly
            // coplanar wall fragments must not inherit the angle of an unrelated floor.
            val vertical = planes.filter { it.type == Plane.Type.VERTICAL }
            if (vertical.indices.any { a ->
                    (a + 1 until vertical.size).any { b ->
                        normalAngleDegrees(vertical[a], vertical[b]) >= STRUCTURAL_ANGLE_DEGREES
                    }
                }) return CornerType.WALL_WALL
            val horizontal = planes.filter { it.type != Plane.Type.VERTICAL }
            if (vertical.none()) return CornerType.UNKNOWN
            if (horizontal.any { h ->
                    val ceiling = h.type == Plane.Type.HORIZONTAL_DOWNWARD_FACING ||
                        (cameraY != null && h.type == Plane.Type.HORIZONTAL_UPWARD_FACING && h.centerPose.ty() > cameraY + 0.12f)
                    ceiling && vertical.any { normalAngleDegrees(it, h) >= STRUCTURAL_ANGLE_DEGREES }
                }) return CornerType.WALL_CEILING
            if (horizontal.any { h ->
                    h.type == Plane.Type.HORIZONTAL_UPWARD_FACING &&
                        (cameraY == null || h.centerPose.ty() <= cameraY + 0.12f) &&
                        vertical.any { normalAngleDegrees(it, h) >= STRUCTURAL_ANGLE_DEGREES }
                }) return CornerType.WALL_FLOOR
            return CornerType.UNKNOWN
        }
    }

    private fun normalAngleDegrees(a: Plane, b: Plane): Float {
        val na = a.centerPose.yAxis
        val nb = b.centerPose.yAxis
        val dot = (na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]).coerceIn(-1f, 1f)
        // Planes are unoriented for this purpose: a flipped normal is the same surface.
        return Math.toDegrees(acos(abs(dot)).toDouble()).toFloat()
    }

    /**
     * Distance from a world point to the nearest edge of a plane's polygon, in metres.
     *
     * Room corners sit on the rim of a detected plane; wallpaper crosses sit in the middle
     * of one. This is the cheapest strong discriminator available, because ARCore has
     * already done the work of deciding where the surface stops.
     */
    fun distanceToPlaneBoundary(plane: Plane, world: Float3): Float {
        val polygon = try {
            plane.polygon
        } catch (_: Throwable) {
            return Float.MAX_VALUE
        }
        if (polygon == null || polygon.remaining() < 6) return Float.MAX_VALUE

        val local = worldToPlaneLocal(plane.centerPose, world)
        val px = local[0]
        val pz = local[2]

        polygon.rewind()
        val count = polygon.remaining() / 2
        val xs = FloatArray(count)
        val zs = FloatArray(count)
        for (i in 0 until count) {
            xs[i] = polygon.get()
            zs[i] = polygon.get()
        }
        polygon.rewind()

        var nearest = Float.MAX_VALUE
        for (i in 0 until count) {
            val j = (i + 1) % count
            nearest = min(nearest, distanceToSegment(px, pz, xs[i], zs[i], xs[j], zs[j]))
        }
        return nearest
    }

    private fun worldToPlaneLocal(centre: Pose, world: Float3): FloatArray {
        val point = floatArrayOf(world.x, world.y, world.z)
        return centre.inverse().transformPoint(point)
    }

    private fun distanceToSegment(px: Float, pz: Float, ax: Float, az: Float, bx: Float, bz: Float): Float {
        val dx = bx - ax
        val dz = bz - az
        val lengthSquared = dx * dx + dz * dz
        if (lengthSquared < 1e-6f) return sqrt((px - ax) * (px - ax) + (pz - az) * (pz - az))
        var t = ((px - ax) * dx + (pz - az) * dz) / lengthSquared
        t = t.coerceIn(0f, 1f)
        val cx = ax + t * dx
        val cz = az + t * dz
        return sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz))
    }

    /**
     * Measures whether the depth profile *bends* at the candidate, in both directions.
     *
     * This replaces the old 3x3 spread test, which was backwards for our purpose: texture
     * on a flat wall has almost no spread, so low spread was being read as good evidence. A
     * flat surface — however obliquely it is viewed — has a straight depth profile, so
     * fitting a slope either side of the candidate and comparing them separates "the wall
     * keeps going" from "the wall turns a corner", and does so regardless of viewing angle.
     *
     * Returns scale-free break magnitudes, already normalised by distance.
     */
    fun depthSlopeBreak(
        frame: Frame,
        depth: Image?,
        viewX: Float,
        viewY: Float
    ): DepthBreak {
        if (depth == null) return DepthBreak()
        return try {
            // ARCore's depth image uses texture coordinates, which include display
            // rotation and crop. Scaling VIEW pixels directly samples the wrong scene.
            val texture = FloatArray(2)
            frame.transformCoordinates2d(
                Coordinates2d.VIEW, floatArrayOf(viewX, viewY),
                Coordinates2d.TEXTURE_NORMALIZED, texture
            )
            if (!texture[0].isFinite() || !texture[1].isFinite() ||
                texture[0] !in 0f..1f || texture[1] !in 0f..1f
            ) return DepthBreak()
            val plane = depth.planes[0]
            val buffer = plane.buffer
            val rowStride = plane.rowStride
            val dw = depth.width
            val dh = depth.height

            val cx = (texture[0] * (dw - 1)).roundToInt()
            val cy = (texture[1] * (dh - 1)).roundToInt()

            val centreMm = sampleDepth(buffer, rowStride, dw, dh, cx, cy)
            if (centreMm <= 0) return DepthBreak()

            val horizontal = slopeBreak(buffer, rowStride, dw, dh, cx, cy, stepX = DEPTH_STEP_PX, stepY = 0)
            val vertical = slopeBreak(buffer, rowStride, dw, dh, cx, cy, stepX = 0, stepY = DEPTH_STEP_PX)

            DepthBreak(
                sampled = horizontal != null || vertical != null,
                gradientX = normaliseBreak(horizontal, centreMm),
                gradientY = normaliseBreak(vertical, centreMm),
                centreMillimetres = centreMm
            )
        } catch (_: Throwable) {
            DepthBreak()
        }
    }

    data class DepthBreak(
        val sampled: Boolean = false,
        val gradientX: Float = 0f,
        val gradientY: Float = 0f,
        val centreMillimetres: Int = 0
    ) {
        val strongest: Float get() = max(gradientX, gradientY)
        val indicatesEdge: Boolean get() = sampled && strongest >= DEPTH_BREAK_THRESHOLD
        /** Sampled, and both directions look like one continuous flat surface. */
        val indicatesFlat: Boolean get() = sampled && strongest < DEPTH_BREAK_THRESHOLD * 0.55f
    }

    private fun normaliseBreak(breakMmPerPx: Float?, centreMm: Int): Float {
        if (breakMmPerPx == null || centreMm <= 0) return 0f
        return (breakMmPerPx / centreMm).coerceAtMost(DEPTH_BREAK_CEILING)
    }

    /**
     * Fits a line to the depth samples on each side of the centre and returns how much the
     * slope changes across it, in millimetres per pixel. Null when either side lacks data.
     */
    private fun slopeBreak(
        buffer: java.nio.ByteBuffer,
        rowStride: Int,
        dw: Int,
        dh: Int,
        cx: Int,
        cy: Int,
        stepX: Int,
        stepY: Int
    ): Float? {
        val before = ArrayList<Pair<Float, Float>>(DEPTH_SAMPLES_PER_SIDE)
        val after = ArrayList<Pair<Float, Float>>(DEPTH_SAMPLES_PER_SIDE)

        for (k in 1..DEPTH_SAMPLES_PER_SIDE) {
            val negative = sampleDepth(buffer, rowStride, dw, dh, cx - stepX * k, cy - stepY * k)
            if (negative > 0) before += (-k).toFloat() to negative.toFloat()
            val positive = sampleDepth(buffer, rowStride, dw, dh, cx + stepX * k, cy + stepY * k)
            if (positive > 0) after += k.toFloat() to positive.toFloat()
        }

        if (before.size < 3 || after.size < 3) return null
        val slopeBefore = leastSquaresSlope(before) ?: return null
        val slopeAfter = leastSquaresSlope(after) ?: return null
        return abs(slopeAfter - slopeBefore)
    }

    private fun leastSquaresSlope(points: List<Pair<Float, Float>>): Float? {
        val n = points.size
        if (n < 2) return null
        var sumX = 0f
        var sumY = 0f
        var sumXY = 0f
        var sumXX = 0f
        points.forEach { (x, y) ->
            sumX += x; sumY += y; sumXY += x * y; sumXX += x * x
        }
        val denominator = n * sumXX - sumX * sumX
        if (abs(denominator) < 1e-6f) return null
        return (n * sumXY - sumX * sumY) / denominator
    }

    /** Median of a 3x3 neighbourhood, which rides over the zero holes ARCore leaves. */
    private fun sampleDepth(
        buffer: java.nio.ByteBuffer,
        rowStride: Int,
        dw: Int,
        dh: Int,
        x: Int,
        y: Int
    ): Int {
        if (x < 1 || y < 1 || x >= dw - 1 || y >= dh - 1) return 0
        var best = 0
        var count = 0
        var total = 0
        for (dy in -1..1) {
            for (dx in -1..1) {
                val index = (y + dy) * rowStride + (x + dx) * 2
                if (index < 0 || index + 1 >= buffer.capacity()) continue
                val raw = (buffer.get(index).toInt() and 0xFF) or
                    ((buffer.get(index + 1).toInt() and 0xFF) shl 8)
                val millimetres = raw // acquireDepthImage16Bits uses the full unsigned 16-bit range.
                if (millimetres <= 0) continue
                total += millimetres
                count++
                best = millimetres
            }
        }
        return if (count >= 3) total / count else if (count > 0) best else 0
    }

    /** Thresholds the rest of the pipeline shares, so tuning happens in one place. */
    const val BOUNDARY_NEAR_METRES = BOUNDARY_NEAR_M
    const val BOUNDARY_DEEP_METRES = BOUNDARY_DEEP_M
    const val SAME_SURFACE_ANGLE_DEGREES = SAME_SURFACE_DEGREES
    private const val STRUCTURAL_ANGLE_DEGREES = 45f

    /** Image edges and a depth step cannot create a corner without two intersecting planes. */
    fun confirmsCorner(
        mode: SurfaceType,
        type: CornerType,
        normalAngleDegrees: Float,
        nearPlaneBoundary: Boolean,
        depthEdge: Boolean,
        depthFlatAwayFromBoundary: Boolean
    ): Boolean {
        val expected = when (mode) {
            SurfaceType.WALL -> type == CornerType.WALL_WALL
            SurfaceType.CEILING -> type == CornerType.WALL_CEILING
        }
        return expected && normalAngleDegrees >= STRUCTURAL_ANGLE_DEGREES &&
            (nearPlaneBoundary || depthEdge) && !depthFlatAwayFromBoundary
    }
}
