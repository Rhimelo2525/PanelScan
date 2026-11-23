package com.example.panelscan.feature.measurement.ar

import com.example.panelscan.core.logic.WallPhotoGeometry
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

    /**
     * What a surface is from its (unit) normal: facing up is the floor, facing
     * down the ceiling, sideways a wall. Steep in-between slopes are [HitKind.Other],
     * which neither a wall nor a ceiling measurement accepts.
     */
    fun classifyNormal(normalY: Float): HitKind = when {
        normalY > 0.75f -> HitKind.HorizontalUpward
        normalY < -0.75f -> HitKind.HorizontalDownward
        abs(normalY) < 0.35f -> HitKind.VerticalPlane
        else -> HitKind.Other
    }

    /**
     * What the camera is pointed at when a hit has no surface direction of its
     * own, judged for the surface being measured. A wall is accepted unless the
     * phone points steeply up or down (its bottom corners are seen looking down
     * at an angle); a ceiling needs the phone tilted clearly upwards.
     */
    fun classifyViewDirection(surfaceType: SurfaceType, directionY: Float): HitKind {
        val steep = if (surfaceType == SurfaceType.WALL) 0.85f else 0.35f
        return when {
            directionY > steep -> HitKind.HorizontalDownward
            directionY < -steep -> HitKind.HorizontalUpward
            else -> HitKind.VerticalPlane
        }
    }

    fun acceptsSurface(surfaceType: SurfaceType, hitKind: HitKind): Boolean = when (surfaceType) {
        SurfaceType.WALL -> hitKind == HitKind.VerticalPlane
        SurfaceType.CEILING -> hitKind == HitKind.HorizontalDownward
    }

    /**
     * Whether the AR plane dot grid should be shown for the current reticle hit.
     *
     * Floor planes ([HitKind.HorizontalUpward]) never show dots in either mode:
     * wall mode only renders dots on vertical wall surfaces, and ceiling mode
     * only renders dots on downward-facing ceiling surfaces above the camera.
     */
    fun shouldShowSurfaceDots(
        surfaceType: SurfaceType,
        hitKind: HitKind,
        confidence: HitConfidence,
        wrongOrientation: Boolean,
        surfaceNormalY: Float,
        hitY: Float,
        cameraY: Float
    ): Boolean {
        if (wrongOrientation || confidence != HitConfidence.Good) return false
        if (!acceptsSurface(surfaceType, hitKind)) return false
        val normalKind = classifyNormal(surfaceNormalY)
        if (!acceptsSurface(surfaceType, normalKind)) return false
        if (surfaceType == SurfaceType.CEILING && hitY <= cameraY + 0.12f) return false
        return true
    }

    /**
     * Builds an axis-aligned [PlaneSignature] for a point hit without a tracked [com.google.ar.core.Plane]:
     * vertical (normalY = 0) for walls, straight down (0, -1, 0) for ceilings, and straight up (0, 1, 0)
     * for floors, so the visual dot grid and placed anchors sit flat on the real surface instead of
     * tilting with the camera's pitch angle.
     */
    fun surfacePlaneSignature(
        kind: HitKind,
        point: WorldPoint3,
        cameraDirection: WorldPoint3,
        estimatedNormal: WorldPoint3? = null
    ): PlaneSignature = when (kind) {
        HitKind.HorizontalDownward -> PlaneSignature(0f, -1f, 0f, point.x, point.y, point.z)
        HitKind.HorizontalUpward -> PlaneSignature(0f, 1f, 0f, point.x, point.y, point.z)
        HitKind.VerticalPlane -> {
            val horizontalFromNormal = estimatedNormal?.let { normalised(it.x, 0f, it.z) }
            val horizontalFromCamera = normalised(-cameraDirection.x, 0f, -cameraDirection.z)
            val n = horizontalFromNormal ?: horizontalFromCamera ?: WorldPoint3(0f, 0f, 1f)
            val flip = if (n.x * -cameraDirection.x + n.z * -cameraDirection.z < 0f) -1f else 1f
            PlaneSignature(n.x * flip, 0f, n.z * flip, point.x, point.y, point.z)
        }
        else -> {
            val n = estimatedNormal?.let { normalised(it.x, it.y, it.z) }
                ?: normalised(-cameraDirection.x, -cameraDirection.y, -cameraDirection.z)
                ?: WorldPoint3(0f, 0f, 1f)
            PlaneSignature(n.x, n.y, n.z, point.x, point.y, point.z)
        }
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
        // Allow shallow grazing angles (~89°) when panning to the far corner of a long wall.
        if (abs(denominator) < 0.015f) return null
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

    /** A 3D bar segment belonging to the fixed measurement structure on the surface. */
    data class GridSegment(
        val from: WorldPoint3,
        val to: WorldPoint3,
        val isOuterFrame: Boolean
    )

    /**
     * Builds the fixed 3D grid structure anchored to the measured rectangle defined by
     * [first], [second] and [third]: 4 outer frame beams plus evenly spaced interior
     * vertical and horizontal 3D grid lines lying flat on the measured surface.
     */
    fun buildFixedGridSegments(
        first: WorldPoint3,
        second: WorldPoint3,
        third: WorldPoint3,
        cellTargetMeters: Float = 0.30f,
        minDivisions: Int = 3,
        maxDivisions: Int = 10
    ): List<GridSegment> {
        val corners = WallPhotoGeometry.cornersFromTaps(
            WallPhotoGeometry.Vec(first.x, first.y, first.z),
            WallPhotoGeometry.Vec(second.x, second.y, second.z),
            WallPhotoGeometry.Vec(third.x, third.y, third.z)
        ).map { WorldPoint3(it.x, it.y, it.z) }
        if (corners.size < 4) return emptyList()
        val c0 = corners[0]
        val c1 = corners[1]
        val c2 = corners[2]
        val c3 = corners[3]

        val width = distance(c0, c1).toFloat()
        val height = distance(c0, c3).toFloat()
        if (width <= 0.02f || height <= 0.02f) return emptyList()

        val segments = ArrayList<GridSegment>()
        // 1. 4 outer perimeter frame beams
        segments += GridSegment(c0, c1, isOuterFrame = true)
        segments += GridSegment(c1, c2, isOuterFrame = true)
        segments += GridSegment(c2, c3, isOuterFrame = true)
        segments += GridSegment(c3, c0, isOuterFrame = true)

        // 2. Interior vertical 3D grid lines
        val cols = (width / cellTargetMeters).toInt().coerceIn(minDivisions, maxDivisions)
        for (col in 1 until cols) {
            val t = col.toFloat() / cols
            segments += GridSegment(lerpPoint(c0, c1, t), lerpPoint(c3, c2, t), isOuterFrame = false)
        }

        // 3. Interior horizontal 3D grid lines
        val rows = (height / cellTargetMeters).toInt().coerceIn(minDivisions, maxDivisions)
        for (row in 1 until rows) {
            val t = row.toFloat() / rows
            segments += GridSegment(lerpPoint(c0, c3, t), lerpPoint(c1, c2, t), isOuterFrame = false)
        }
        return segments
    }

    private fun lerpPoint(a: WorldPoint3, b: WorldPoint3, t: Float): WorldPoint3 = WorldPoint3(
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t
    )
}
