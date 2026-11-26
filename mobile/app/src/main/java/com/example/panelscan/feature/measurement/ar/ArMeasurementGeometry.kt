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
     * Vertical tolerance at the wall-floor junction (baseboard) so slight ARCore floor-plane
     * elevation drift (1–4 cm) never treats the bottom edge of a wall as below the floor.
     */
    const val WALL_FLOOR_JUNCTION_TOLERANCE_M = 0.04f

    /**
     * Minimum distance by which a horizontal floor hit must lie in front of the wall ray
     * intersection before the floor is considered to occlude the wall under the center reticle.
     */
    const val FLOOR_OCCLUSION_MARGIN_M = 0.06f

    /**
     * Minimum ray-to-wall-normal incidence cosine (`|dot(ray, normal)|`) when intersecting a
     * locked wall plane, rejecting extreme grazing rays (> ~79°) that cause depth spikes.
     */
    const val MIN_WALL_RAY_INCIDENCE_COS = 0.18f

    /**
     * Maximum horizontal yaw deviation (cos 55° ≈ 0.5736) allowed between a single-point
     * estimated normal and the camera's horizontal viewing direction before snapping the initial
     * wall normal to face the camera. Allowing up to 55° ensures that aiming at the far left or
     * right corner of a wide (5+ m) wall from the center of the room preserves the wall's true
     * surface normal instead of rotating the plane to face the angled camera line of sight.
     */
    private const val MIN_POINT_NORMAL_CAMERA_ALIGNMENT = 0.5736f

    /**
     * Minimum horizontal span (in metres) between Point A and a second 3D wall point before
     * refining the vertical wall plane normal from the 2-point horizontal chord `A -> B`.
     */
    const val MIN_TWO_POINT_WALL_SPAN_M = 0.25f

    /**
     * Maximum horizontal angle (cos 38° ≈ 0.788) between Point A's initial wall normal and the
     * 2-point chord normal `perp(B - A)` so an adjacent perpendicular wall at 90° is rejected
     * while any 1°–35° single-point normal drift at Point A is corrected to the true wall plane.
     */
    private const val MIN_TWO_POINT_NORMAL_AGREEMENT_COS = 0.7880f

    /**
     * Locks a wall [plane] so its normal is strictly horizontal (`normalY = 0`, unit length in XZ),
     * making the measurement plane perfectly vertical. Optionally re-anchors the plane origin to
     * [anchorPoint] (such as Point A) so all measurements remain flush with that wall point.
     */
    fun verticalWallPlane(
        plane: PlaneSignature,
        anchorPoint: WorldPoint3? = null,
        fallbackCameraDir: WorldPoint3? = null
    ): PlaneSignature {
        val horiz = normalised(plane.normalX, 0f, plane.normalZ)
            ?: fallbackCameraDir?.let { normalised(-it.x, 0f, -it.z) }
            ?: WorldPoint3(0f, 0f, 1f)
        val center = anchorPoint ?: WorldPoint3(plane.centerX, plane.centerY, plane.centerZ)
        return PlaneSignature(
            normalX = horiz.x,
            normalY = 0f,
            normalZ = horiz.z,
            centerX = center.x,
            centerY = center.y,
            centerZ = center.z
        )
    }

    /**
     * Derives the exact vertical wall [PlaneSignature] passing through both 3D wall points
     * [anchorA] and [secondPoint].
     *
     * A single point [anchorA] at one corner of a wide wall (e.g. 5.13 m) often has a 4°–10°
     * normal error that tilts the extrapolated plane 25–45 cm closer to the camera at the far
     * end, causing systematic underestimation of both Width and Height. Fitting the vertical
     * wall plane normal perpendicular to the horizontal chord `(secondPoint - anchorA)` ensures
     * the plane passes through the true 3D depth of both ends of the wall.
     *
     * Returns `null` if the horizontal span is less than [MIN_TWO_POINT_WALL_SPAN_M] or if the
     * implied normal deviates from [referencePlane] by more than ~38° (e.g. an adjacent wall).
     */
    fun wallPlaneFromTwoPoints(
        anchorA: WorldPoint3,
        secondPoint: WorldPoint3,
        cameraOrigin: WorldPoint3? = null,
        referencePlane: PlaneSignature? = null
    ): PlaneSignature? {
        val dx = secondPoint.x - anchorA.x
        val dz = secondPoint.z - anchorA.z
        val horizSpan = sqrt(dx * dx + dz * dz)
        if (horizSpan < MIN_TWO_POINT_WALL_SPAN_M) return null

        // Perpendicular to horizontal chord (dx, 0, dz) in XZ is (-dz, 0, dx).
        val rawNormal = normalised(-dz, 0f, dx) ?: return null
        val refNormal = referencePlane?.let { normalised(it.normalX, 0f, it.normalZ) }
        if (refNormal != null) {
            val dot = abs(rawNormal.x * refNormal.x + rawNormal.z * refNormal.z)
            if (dot < MIN_TWO_POINT_NORMAL_AGREEMENT_COS) return null
        }

        val flip = when {
            cameraOrigin != null -> {
                val toCamX = cameraOrigin.x - anchorA.x
                val toCamZ = cameraOrigin.z - anchorA.z
                if (rawNormal.x * toCamX + rawNormal.z * toCamZ < 0f) -1f else 1f
            }
            refNormal != null -> {
                if (rawNormal.x * refNormal.x + rawNormal.z * refNormal.z < 0f) -1f else 1f
            }
            else -> 1f
        }
        return PlaneSignature(
            normalX = rawNormal.x * flip,
            normalY = 0f,
            normalZ = rawNormal.z * flip,
            centerX = anchorA.x,
            centerY = anchorA.y,
            centerZ = anchorA.z
        )
    }

    /**
     * Returns the wall's strictly horizontal unit width axis `cross(worldUp, wallNormal) = (nz, 0, -nx)`,
     * perpendicular to both `worldUp = (0, 1, 0)` and the horizontal wall normal `(nx, 0, nz)`.
     */
    fun wallHorizontalAxis(wallPlane: PlaneSignature): WorldPoint3 {
        val n = normalised(wallPlane.normalX, 0f, wallPlane.normalZ) ?: WorldPoint3(0f, 0f, 1f)
        // worldUp (0, 1, 0) x (n.x, 0, n.z) = (n.z, 0, -n.x)
        return normalised(n.z, 0f, -n.x) ?: WorldPoint3(1f, 0f, 0f)
    }

    /**
     * Constrains the Width point ([rawHit]) strictly along the locked vertical wall's horizontal
     * axis `cross(worldUp, wallNormal)` starting from [anchorA], keeping Y level with [anchorA]
     * and depth strictly flush with [wallPlane].
     */
    fun constrainWallWidthPoint(
        anchorA: WorldPoint3,
        rawHit: WorldPoint3,
        wallPlane: PlaneSignature
    ): WorldPoint3 {
        val uAxis = wallHorizontalAxis(wallPlane)
        val dx = rawHit.x - anchorA.x
        val dz = rawHit.z - anchorA.z
        val u = dx * uAxis.x + dz * uAxis.z
        return WorldPoint3(
            x = anchorA.x + u * uAxis.x,
            y = anchorA.y,
            z = anchorA.z + u * uAxis.z
        )
    }

    /**
     * Constrains the Height point ([rawHit]) strictly along the vertical Y-axis (`worldUp = (0, 1, 0)`)
     * from [anchorB] on the locked vertical [wallPlane], keeping (x, z) flush with the wall at [anchorB].
     */
    fun constrainWallHeightPoint(
        anchorA: WorldPoint3,
        anchorB: WorldPoint3,
        rawHit: WorldPoint3,
        wallPlane: PlaneSignature
    ): WorldPoint3 {
        val lockedB = constrainWallWidthPoint(anchorA, anchorB, wallPlane)
        return WorldPoint3(
            x = lockedB.x,
            y = rawHit.y,
            z = lockedB.z
        )
    }

    /**
     * Rejects raycast depth spikes on a locked wall plane: returns true if the ray hits the
     * wall plane at an extreme grazing angle or jumps to an implausible distance compared to
     * the anchor's distance from the camera.
     */
    fun isWallRaycastDepthSpike(
        cameraOrigin: WorldPoint3,
        rayDirection: WorldPoint3,
        wallPlane: PlaneSignature,
        hitPoint: WorldPoint3,
        anchorPoint: WorldPoint3?
    ): Boolean {
        val n = normalised(wallPlane.normalX, 0f, wallPlane.normalZ) ?: return true
        val ray = normalised(rayDirection.x, rayDirection.y, rayDirection.z) ?: return true
        val incidenceCos = abs(ray.x * n.x + ray.z * n.z)
        if (incidenceCos < MIN_WALL_RAY_INCIDENCE_COS) return true
        val hitDist = distance(cameraOrigin, hitPoint).toFloat()
        if (anchorPoint != null) {
            val anchorDist = distance(cameraOrigin, anchorPoint).toFloat().coerceAtLeast(0.4f)
            val spanFromAnchor = distance(anchorPoint, hitPoint).toFloat()
            if (hitDist > maxOf(anchorDist * 3.5f, 8.0f) || spanFromAnchor > 15.0f) return true
        }
        return false
    }

    /**
     * In Wall mode, whether a horizontal floor hit at the center reticle genuinely lies in front
     * of the vertical wall (meaning the center reticle itself is aimed below the baseboard onto
     * the floor). As long as the center ray intersects the wall at or above the floor junction
     * (`wallHitY >= floorPlaneY - WALL_FLOOR_JUNCTION_TOLERANCE_M`), the reticle is still aimed
     * at the wall/baseboard and the floor does NOT occlude it.
     */
    fun isFloorOccludingWall(
        wallHitY: Float,
        wallHitDistance: Float,
        floorPlaneY: Float,
        floorHitDistance: Float
    ): Boolean {
        val belowWallBase = wallHitY < floorPlaneY - WALL_FLOOR_JUNCTION_TOLERANCE_M
        val closerThanWall = floorHitDistance < wallHitDistance - FLOOR_OCCLUSION_MARGIN_M
        return belowWallBase && closerThanWall
    }

    /**
     * Clamps the vertical center Y of the wall dot grid so that when aiming near the bottom
     * edge or baseboard of a wall above a tracked floor at [floorY], the dot grid remains on
     * the wall above the baseboard instead of extending underground across the floor.
     */
    fun clampWallDotsCenterY(hitY: Float, floorY: Float?, radius: Float): Float {
        if (floorY == null) return hitY
        return maxOf(hitY, floorY + radius * 0.85f)
    }

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
        estimatedNormal: WorldPoint3? = null,
        fallbackWallNormal: WorldPoint3? = null
    ): PlaneSignature = when (kind) {
        HitKind.HorizontalDownward -> PlaneSignature(0f, -1f, 0f, point.x, point.y, point.z)
        HitKind.HorizontalUpward -> PlaneSignature(0f, 1f, 0f, point.x, point.y, point.z)
        HitKind.VerticalPlane -> {
            val horizontalFromCamera = normalised(-cameraDirection.x, 0f, -cameraDirection.z)
            val horizontalFromNormal = estimatedNormal?.let { normalised(it.x, 0f, it.z) }
            val horizontalFromFallback = fallbackWallNormal?.let { normalised(it.x, 0f, it.z) }
            val candidateNormal = horizontalFromNormal ?: horizontalFromFallback
            // Keep the surface normal (from depth/feature point or already-detected wall plane)
            // as long as the camera is viewing the wall within ~55° of its normal, so panning
            // to the left/right corners of a wide wall does not rotate the wall plane normal
            // to follow the angled camera ray.
            val alignedNormal = if (candidateNormal != null && horizontalFromCamera != null) {
                val dot = abs(candidateNormal.x * horizontalFromCamera.x + candidateNormal.z * horizontalFromCamera.z)
                if (dot >= MIN_POINT_NORMAL_CAMERA_ALIGNMENT) candidateNormal else (horizontalFromFallback ?: horizontalFromCamera)
            } else {
                candidateNormal ?: horizontalFromCamera
            }
            val n = alignedNormal ?: WorldPoint3(0f, 0f, 1f)
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

    /** Orthogonally projects [point] onto [plane] so the result lies strictly on that plane. */
    fun projectOntoPlane(point: WorldPoint3, plane: PlaneSignature): WorldPoint3 {
        val normal = normalised(plane.normalX, plane.normalY, plane.normalZ) ?: return point
        val signed = (point.x - plane.centerX) * normal.x +
            (point.y - plane.centerY) * normal.y +
            (point.z - plane.centerZ) * normal.z
        return WorldPoint3(
            x = point.x - normal.x * signed,
            y = point.y - normal.y * signed,
            z = point.z - normal.z * signed
        )
    }

    /**
     * Computes the initial 4 corners of the measured rectangle from the 3 placed points
     * ([first], [second], [third]) in bottom-left, bottom-right, top-right, top-left order.
     *
     * On a vertical wall, the 4 corners are constructed strictly along the wall's horizontal
     * axis `cross(worldUp, wallNormal)` (width) and the vertical Y-axis `worldUp` (height)
     * on the locked vertical plane through [first], guaranteeing a flat, coplanar rectangle
     * flush against the wall with zero depth skew.
     */
    fun initialGridCorners(
        first: WorldPoint3,
        second: WorldPoint3,
        third: WorldPoint3,
        plane: PlaneSignature? = null
    ): List<WorldPoint3> {
        val rawWallPlane = plane ?: run {
            val ab = WorldPoint3(second.x - first.x, second.y - first.y, second.z - first.z)
            val ac = WorldPoint3(third.x - first.x, third.y - first.y, third.z - first.z)
            val cross = WorldPoint3(
                ab.y * ac.z - ab.z * ac.y,
                ab.z * ac.x - ab.x * ac.z,
                ab.x * ac.y - ab.y * ac.x
            )
            val n = normalised(cross.x, cross.y, cross.z)
            if (n != null && abs(n.y) < 0.5f) {
                PlaneSignature(n.x, 0f, n.z, first.x, first.y, first.z)
            } else null
        }

        if (rawWallPlane != null && abs(rawWallPlane.normalY) < 0.5f) {
            val wallPlane = verticalWallPlane(rawWallPlane, anchorPoint = first)
            val uAxis = wallHorizontalAxis(wallPlane)
            val u1 = (second.x - first.x) * uAxis.x + (second.z - first.z) * uAxis.z
            val dy1 = second.y - first.y
            val u2 = (third.x - first.x) * uAxis.x + (third.z - first.z) * uAxis.z
            val dy2 = third.y - first.y

            // Determine which tap defined the horizontal width and which defined the vertical height.
            val firstTapIsHorizontal = abs(u1) >= abs(dy1)
            val widthU = if (firstTapIsHorizontal) u1 else u2
            val heightY = if (firstTapIsHorizontal) third.y else second.y

            val uMin = minOf(0f, widthU)
            val uMax = maxOf(0f, widthU)
            val yMin = minOf(first.y, heightY)
            val yMax = maxOf(first.y, heightY)

            val c0 = WorldPoint3(first.x + uMin * uAxis.x, yMin, first.z + uMin * uAxis.z)
            val c1 = WorldPoint3(first.x + uMax * uAxis.x, yMin, first.z + uMax * uAxis.z)
            val c2 = WorldPoint3(first.x + uMax * uAxis.x, yMax, first.z + uMax * uAxis.z)
            val c3 = WorldPoint3(first.x + uMin * uAxis.x, yMax, first.z + uMin * uAxis.z)
            return listOf(c0, c1, c2, c3)
        }

        val raw = WallPhotoGeometry.cornersFromTaps(
            WallPhotoGeometry.Vec(first.x, first.y, first.z),
            WallPhotoGeometry.Vec(second.x, second.y, second.z),
            WallPhotoGeometry.Vec(third.x, third.y, third.z)
        ).map { WorldPoint3(it.x, it.y, it.z) }
        return if (plane != null) raw.map { projectOntoPlane(it, plane) } else raw
    }

    /**
     * Average width and height (in metres) of the 4-corner planar quad [corners] ordered
     * `[bottomLeft, bottomRight, topRight, topLeft]`. For a rectangle this equals its exact
     * width and height; when individual corners are moved independently on the wall plane to
     * form a custom quadrilateral/trapezoid, this returns the mean opposite-edge width and
     * height in real time.
     */
    fun quadDimensions(corners: List<WorldPoint3>): Pair<Double, Double> {
        if (corners.size < 4) return 0.0 to 0.0
        val c0 = corners[0]
        val c1 = corners[1]
        val c2 = corners[2]
        val c3 = corners[3]
        val width = (distance(c0, c1) + distance(c3, c2)) * 0.5
        val height = (distance(c0, c3) + distance(c1, c2)) * 0.5
        return width to height
    }

    /**
     * Exact area (in m²) of the 4-corner planar quadrilateral [corners] ordered
     * `[bottomLeft, bottomRight, topRight, topLeft]`, computed by splitting the quad along
     * diagonal `c0 -> c2` into two triangles `(c0, c1, c2)` and `(c0, c2, c3)`:
     * `0.5 * ||(c1 - c0) x (c2 - c0)|| + 0.5 * ||(c2 - c0) x (c3 - c0)||`.
     */
    fun quadArea(corners: List<WorldPoint3>): Double {
        if (corners.size < 4) return 0.0
        val c0 = corners[0]
        val c1 = corners[1]
        val c2 = corners[2]
        val c3 = corners[3]
        return triangleArea(c0, c1, c2) + triangleArea(c0, c2, c3)
    }

    private fun triangleArea(a: WorldPoint3, b: WorldPoint3, c: WorldPoint3): Double {
        val abX = (b.x - a.x).toDouble()
        val abY = (b.y - a.y).toDouble()
        val abZ = (b.z - a.z).toDouble()
        val acX = (c.x - a.x).toDouble()
        val acY = (c.y - a.y).toDouble()
        val acZ = (c.z - a.z).toDouble()
        val crossX = abY * acZ - abZ * acY
        val crossY = abZ * acX - abX * acZ
        val crossZ = abX * acY - abY * acX
        return 0.5 * sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)
    }

    /**
     * Bilinearly interpolates a 3D point on the 4-corner quadrilateral
     * `[c0 = bottomLeft, c1 = bottomRight, c2 = topRight, c3 = topLeft]` at normalised
     * coordinates `([u], [v])` in `[0, 1] x [0, 1]`.
     */
    fun bilinearQuadPoint(
        c0: WorldPoint3,
        c1: WorldPoint3,
        c2: WorldPoint3,
        c3: WorldPoint3,
        u: Float,
        v: Float
    ): WorldPoint3 {
        val bottom = lerpPoint(c0, c1, u)
        val top = lerpPoint(c3, c2, u)
        return lerpPoint(bottom, top, v)
    }

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
    ): List<GridSegment> = buildFixedGridSegmentsFromCorners(
        corners = initialGridCorners(first, second, third),
        cellTargetMeters = cellTargetMeters,
        minDivisions = minDivisions,
        maxDivisions = maxDivisions
    )

    /**
     * Builds the 4 outer perimeter frame beams and interior vertical/horizontal 3D grid lines
     * using bilinear interpolation across the 4 independent corners
     * `[bottomLeft, bottomRight, topRight, topLeft]`, allowing the grid to form any custom
     * 4-sided quadrilateral or trapezoid matching the exact edges of the wall.
     */
    fun buildFixedGridSegmentsFromCorners(
        corners: List<WorldPoint3>,
        cellTargetMeters: Float = 0.30f,
        minDivisions: Int = 3,
        maxDivisions: Int = 10
    ): List<GridSegment> {
        if (corners.size < 4) return emptyList()
        val c0 = corners[0]
        val c1 = corners[1]
        val c2 = corners[2]
        val c3 = corners[3]

        val (w, h) = quadDimensions(corners)
        val width = w.toFloat()
        val height = h.toFloat()
        if (width <= 0.02f || height <= 0.02f) return emptyList()

        val segments = ArrayList<GridSegment>()
        // 1. 4 outer perimeter frame beams connecting the 4 independent corners
        segments += GridSegment(
            bilinearQuadPoint(c0, c1, c2, c3, 0f, 0f),
            bilinearQuadPoint(c0, c1, c2, c3, 1f, 0f),
            isOuterFrame = true
        )
        segments += GridSegment(
            bilinearQuadPoint(c0, c1, c2, c3, 1f, 0f),
            bilinearQuadPoint(c0, c1, c2, c3, 1f, 1f),
            isOuterFrame = true
        )
        segments += GridSegment(
            bilinearQuadPoint(c0, c1, c2, c3, 1f, 1f),
            bilinearQuadPoint(c0, c1, c2, c3, 0f, 1f),
            isOuterFrame = true
        )
        segments += GridSegment(
            bilinearQuadPoint(c0, c1, c2, c3, 0f, 1f),
            bilinearQuadPoint(c0, c1, c2, c3, 0f, 0f),
            isOuterFrame = true
        )

        // 2. Interior vertical 3D grid lines via bilinear interpolation along u
        val cols = (width / cellTargetMeters).toInt().coerceIn(minDivisions, maxDivisions)
        for (col in 1 until cols) {
            val u = col.toFloat() / cols
            segments += GridSegment(
                from = bilinearQuadPoint(c0, c1, c2, c3, u, 0f),
                to = bilinearQuadPoint(c0, c1, c2, c3, u, 1f),
                isOuterFrame = false
            )
        }

        // 3. Interior horizontal 3D grid lines via bilinear interpolation along v
        val rows = (height / cellTargetMeters).toInt().coerceIn(minDivisions, maxDivisions)
        for (row in 1 until rows) {
            val v = row.toFloat() / rows
            segments += GridSegment(
                from = bilinearQuadPoint(c0, c1, c2, c3, 0f, v),
                to = bilinearQuadPoint(c0, c1, c2, c3, 1f, v),
                isOuterFrame = false
            )
        }
        return segments
    }

    /**
     * Projects a 3D world [point] into normalised 2D screen coordinates `(0..1, 0..1)` (top-left
     * origin) using column-major 4x4 [viewMatrix] and [projectionMatrix]. Returns null if the
     * point lies behind the camera's near plane.
     */
    fun projectWorldToScreen(
        point: WorldPoint3,
        viewMatrix: FloatArray,
        projectionMatrix: FloatArray
    ): Pair<Float, Float>? {
        if (viewMatrix.size < 16 || projectionMatrix.size < 16) return null
        val cam = WallPhotoGeometry.transform(viewMatrix, WallPhotoGeometry.Vec(point.x, point.y, point.z))
        if (cam.z > -0.05f) return null
        val (ndcX, ndcY) = WallPhotoGeometry.project(projectionMatrix, cam)
        if (!ndcX.isFinite() || !ndcY.isFinite()) return null
        val normX = (ndcX + 1f) * 0.5f
        val normY = (1f - ndcY) * 0.5f
        return normX to normY
    }

    /**
     * Unprojects normalised 2D screen coordinates ([normX], [normY] in `0..1`, top-left origin)
     * through column-major 4x4 [viewMatrix] and [projectionMatrix] into a 3D world ray and
     * intersects it strictly with the locked surface [plane].
     */
    fun intersectScreenRayWithPlane(
        normX: Float,
        normY: Float,
        viewMatrix: FloatArray,
        projectionMatrix: FloatArray,
        plane: PlaneSignature,
        minDistance: Float = 0.20f,
        maxDistance: Float = 25.0f
    ): WorldPoint3? {
        if (viewMatrix.size < 16 || projectionMatrix.size < 16) return null
        val sx = projectionMatrix[0]
        val sy = projectionMatrix[5]
        if (abs(sx) <= 1e-6f || abs(sy) <= 1e-6f) return null

        val ndcX = normX * 2f - 1f
        val ndcY = 1f - normY * 2f
        val camDirX = (ndcX + projectionMatrix[8]) / sx
        val camDirY = (ndcY + projectionMatrix[9]) / sy
        val camDirZ = -1f

        // Transform camera-space ray direction and origin to world space using the transpose
        // of the rigid view matrix's orthonormal 3x3 rotation block.
        val worldDir = WorldPoint3(
            x = viewMatrix[0] * camDirX + viewMatrix[1] * camDirY + viewMatrix[2] * camDirZ,
            y = viewMatrix[4] * camDirX + viewMatrix[5] * camDirY + viewMatrix[6] * camDirZ,
            z = viewMatrix[8] * camDirX + viewMatrix[9] * camDirY + viewMatrix[10] * camDirZ
        )
        val tx = viewMatrix[12]
        val ty = viewMatrix[13]
        val tz = viewMatrix[14]
        val worldOrigin = WorldPoint3(
            x = -(viewMatrix[0] * tx + viewMatrix[1] * ty + viewMatrix[2] * tz),
            y = -(viewMatrix[4] * tx + viewMatrix[5] * ty + viewMatrix[6] * tz),
            z = -(viewMatrix[8] * tx + viewMatrix[9] * ty + viewMatrix[10] * tz)
        )
        return intersectRayWithPlane(worldOrigin, worldDir, plane, minDistance, maxDistance)
    }

    /**
     * Moves ONLY corner [cornerIndex] (`0 = bottomLeft, 1 = bottomRight, 2 = topRight, 3 = topLeft`)
     * to [targetPoint] on the locked surface [plane], leaving the other 3 corners 100% untouched
     * so all 4 corners move independently and can form any custom 4-sided quadrilateral/trapezoid
     * while staying coplanar on [plane] without crossing opposite edges by [minEdgeMeters].
     */
    fun moveGridCornerOnPlane(
        corners: List<WorldPoint3>,
        cornerIndex: Int,
        targetPoint: WorldPoint3,
        plane: PlaneSignature,
        minEdgeMeters: Float = 0.12f
    ): List<WorldPoint3> {
        if (corners.size < 4 || cornerIndex !in 0..3) return corners
        if (abs(plane.normalY) < 0.5f) {
            val wallPlane = verticalWallPlane(plane, anchorPoint = corners[0])
            val uAxis = wallHorizontalAxis(wallPlane)
            val origin = projectOntoPlane(corners[0], wallPlane)
            fun toU(p: WorldPoint3): Float = (p.x - origin.x) * uAxis.x + (p.z - origin.z) * uAxis.z

            val projectedCorners = corners.map { projectOntoPlane(it, wallPlane) }
            val u0 = toU(projectedCorners[0]); val y0 = projectedCorners[0].y
            val u1 = toU(projectedCorners[1]); val y1 = projectedCorners[1].y
            val u2 = toU(projectedCorners[2]); val y2 = projectedCorners[2].y
            val u3 = toU(projectedCorners[3]); val y3 = projectedCorners[3].y
            val leftIsMin = (u0 + u3) <= (u1 + u2)

            val projectedTarget = projectOntoPlane(targetPoint, wallPlane)
            val targetU = toU(projectedTarget)
            val targetY = projectedTarget.y

            fun clampLeftAgainst(u: Float, rightNeighborU: Float): Float =
                if (leftIsMin) minOf(u, rightNeighborU - minEdgeMeters) else maxOf(u, rightNeighborU + minEdgeMeters)
            fun clampRightAgainst(u: Float, leftNeighborU: Float): Float =
                if (leftIsMin) maxOf(u, leftNeighborU + minEdgeMeters) else minOf(u, leftNeighborU - minEdgeMeters)

            val clampedU: Float
            val clampedY: Float
            when (cornerIndex) {
                0 -> { // bottom-left: only clamp against bottom-right (u1) and top-left (y3)
                    clampedU = clampLeftAgainst(targetU, u1)
                    clampedY = minOf(targetY, y3 - minEdgeMeters)
                }
                1 -> { // bottom-right: only clamp against bottom-left (u0) and top-right (y2)
                    clampedU = clampRightAgainst(targetU, u0)
                    clampedY = minOf(targetY, y2 - minEdgeMeters)
                }
                2 -> { // top-right: only clamp against top-left (u3) and bottom-right (y1)
                    clampedU = clampRightAgainst(targetU, u3)
                    clampedY = maxOf(targetY, y1 + minEdgeMeters)
                }
                else -> { // top-left: only clamp against top-right (u2) and bottom-left (y0)
                    clampedU = clampLeftAgainst(targetU, u2)
                    clampedY = maxOf(targetY, y0 + minEdgeMeters)
                }
            }

            val moved = WorldPoint3(
                x = origin.x + clampedU * uAxis.x,
                y = clampedY,
                z = origin.z + clampedU * uAxis.z
            )
            return projectedCorners.toMutableList().also { it[cornerIndex] = moved }
        }

        val normal = normalised(plane.normalX, plane.normalY, plane.normalZ) ?: return corners
        val planarCorners = corners.map { projectOntoPlane(it, plane) }
        val c0 = planarCorners[0]
        val c1 = planarCorners[1]
        val c2 = planarCorners[2]
        val c3 = planarCorners[3]

        // Build an orthonormal 2D basis (uAxis across, vAxis up) lying strictly inside [plane].
        val rawAcross = WorldPoint3(
            x = (c1.x - c0.x) + (c2.x - c3.x),
            y = (c1.y - c0.y) + (c2.y - c3.y),
            z = (c1.z - c0.z) + (c2.z - c3.z)
        )
        val acrossDotN = rawAcross.x * normal.x + rawAcross.y * normal.y + rawAcross.z * normal.z
        val uAxis = normalised(
            rawAcross.x - normal.x * acrossDotN,
            rawAcross.y - normal.y * acrossDotN,
            rawAcross.z - normal.z * acrossDotN
        ) ?: return planarCorners

        var vAxis = normalised(
            normal.y * uAxis.z - normal.z * uAxis.y,
            normal.z * uAxis.x - normal.x * uAxis.z,
            normal.x * uAxis.y - normal.y * uAxis.x
        ) ?: return planarCorners
        val rawUp = WorldPoint3(
            x = (c3.x - c0.x) + (c2.x - c1.x),
            y = (c3.y - c0.y) + (c2.y - c1.y),
            z = (c3.z - c0.z) + (c2.z - c1.z)
        )
        if (vAxis.x * rawUp.x + vAxis.y * rawUp.y + vAxis.z * rawUp.z < 0f) {
            vAxis = WorldPoint3(-vAxis.x, -vAxis.y, -vAxis.z)
        }

        fun toU(p: WorldPoint3): Float = (p.x - c0.x) * uAxis.x + (p.y - c0.y) * uAxis.y + (p.z - c0.z) * uAxis.z
        fun toV(p: WorldPoint3): Float = (p.x - c0.x) * vAxis.x + (p.y - c0.y) * vAxis.y + (p.z - c0.z) * vAxis.z

        val u0 = 0f; val v0 = 0f
        val u1 = toU(c1); val v1 = toV(c1)
        val u2 = toU(c2); val v2 = toV(c2)
        val u3 = toU(c3); val v3 = toV(c3)

        val projectedTarget = projectOntoPlane(targetPoint, plane)
        val targetU = toU(projectedTarget)
        val targetV = toV(projectedTarget)

        val clampedU: Float
        val clampedV: Float
        when (cornerIndex) {
            0 -> {
                clampedU = minOf(targetU, u1 - minEdgeMeters)
                clampedV = minOf(targetV, v3 - minEdgeMeters)
            }
            1 -> {
                clampedU = maxOf(targetU, u0 + minEdgeMeters)
                clampedV = minOf(targetV, v2 - minEdgeMeters)
            }
            2 -> {
                clampedU = maxOf(targetU, u3 + minEdgeMeters)
                clampedV = maxOf(targetV, v1 + minEdgeMeters)
            }
            else -> {
                clampedU = minOf(targetU, u2 - minEdgeMeters)
                clampedV = maxOf(targetV, v0 + minEdgeMeters)
            }
        }

        val moved = WorldPoint3(
            x = c0.x + uAxis.x * clampedU + vAxis.x * clampedV,
            y = c0.y + uAxis.y * clampedU + vAxis.y * clampedV,
            z = c0.z + uAxis.z * clampedU + vAxis.z * clampedV
        )
        return planarCorners.toMutableList().also { it[cornerIndex] = moved }
    }

    private fun lerpPoint(a: WorldPoint3, b: WorldPoint3, t: Float): WorldPoint3 = WorldPoint3(
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t
    )
}
