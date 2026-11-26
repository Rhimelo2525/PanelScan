package com.example.panelscan.feature.measurement.ar

import com.example.panelscan.core.model.SurfaceType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ArMeasurementGeometryTest {

    @Test
    fun `plain tracked wall is accepted without visual corner evidence`() {
        assertTrue(ArMeasurementGeometry.acceptsSurface(SurfaceType.WALL, HitKind.VerticalPlane))
        val hit = ArMeasurementGeometry.intersectRayWithPlane(
            origin = WorldPoint3(0f, 1.5f, 0f),
            direction = WorldPoint3(0f, 0f, -1f),
            plane = PlaneSignature(0f, 0f, 1f, 0f, 1.5f, -2f),
            minDistance = 0.25f,
            maxDistance = 8f
        )
        assertNotNull(hit)
        assertEquals(-2f, hit!!.z, 0.001f)
    }

    @Test
    fun `ceiling accepts downward plane and rejects floor plane`() {
        assertTrue(ArMeasurementGeometry.acceptsSurface(SurfaceType.CEILING, HitKind.HorizontalDownward))
        assertFalse(ArMeasurementGeometry.acceptsSurface(SurfaceType.CEILING, HitKind.HorizontalUpward))
    }

    @Test
    fun `wall measurement rejects floor and ceiling, ceiling rejects wall and floor`() {
        assertFalse(ArMeasurementGeometry.acceptsSurface(SurfaceType.WALL, HitKind.HorizontalUpward))
        assertFalse(ArMeasurementGeometry.acceptsSurface(SurfaceType.WALL, HitKind.HorizontalDownward))
        assertFalse(ArMeasurementGeometry.acceptsSurface(SurfaceType.WALL, HitKind.None))
        assertFalse(ArMeasurementGeometry.acceptsSurface(SurfaceType.CEILING, HitKind.VerticalPlane))
        assertFalse(ArMeasurementGeometry.acceptsSurface(SurfaceType.CEILING, HitKind.None))
    }

    @Test
    fun `surface normals classify floor, ceiling and wall`() {
        assertEquals(HitKind.HorizontalUpward, ArMeasurementGeometry.classifyNormal(0.98f))
        assertEquals(HitKind.HorizontalDownward, ArMeasurementGeometry.classifyNormal(-0.95f))
        assertEquals(HitKind.VerticalPlane, ArMeasurementGeometry.classifyNormal(0.1f))
        assertEquals(HitKind.Other, ArMeasurementGeometry.classifyNormal(0.55f))
    }

    @Test
    fun `camera direction is judged for the surface being measured`() {
        // Wall: looking down at a bottom corner (~-0.68) is still the wall; straight down is the floor.
        assertEquals(HitKind.VerticalPlane, ArMeasurementGeometry.classifyViewDirection(SurfaceType.WALL, -0.68f))
        assertEquals(HitKind.HorizontalUpward, ArMeasurementGeometry.classifyViewDirection(SurfaceType.WALL, -0.9f))
        assertEquals(HitKind.HorizontalDownward, ArMeasurementGeometry.classifyViewDirection(SurfaceType.WALL, 0.9f))
        // Ceiling: needs the phone tilted up; level is a wall, down is the floor.
        assertEquals(HitKind.HorizontalDownward, ArMeasurementGeometry.classifyViewDirection(SurfaceType.CEILING, 0.5f))
        assertEquals(HitKind.VerticalPlane, ArMeasurementGeometry.classifyViewDirection(SurfaceType.CEILING, 0.1f))
        assertEquals(HitKind.HorizontalUpward, ArMeasurementGeometry.classifyViewDirection(SurfaceType.CEILING, -0.5f))
    }

    @Test
    fun `free measurement computes middle section without a corner`() {
        val a = WorldPoint3(2f, 1f, -3f)
        val b = WorldPoint3(5f, 1f, -3f)
        val extent = WorldPoint3(5f, 3.5f, -3f)
        assertEquals(3.0, ArMeasurementGeometry.distance(a, b), 0.001)
        assertEquals(2.5, ArMeasurementGeometry.perpendicularExtent(a, b, extent), 0.001)
    }

    @Test
    fun `two point distance uses world coordinates`() {
        assertEquals(
            5.0,
            ArMeasurementGeometry.distance(WorldPoint3(1f, 2f, 3f), WorldPoint3(4f, 6f, 3f)),
            0.001
        )
    }

    @Test
    fun `coplanar segments of one large wall are accepted`() {
        val first = PlaneSignature(0f, 0f, 1f, 0f, 1.5f, -3f)
        val farSegment = PlaneSignature(0.02f, 0f, 0.9998f, 6f, 1.5f, -3.03f)
        assertTrue(ArMeasurementGeometry.areCoplanar(first, farSegment))
    }

    @Test
    fun `cross plane measurement is rejected`() {
        val wall = PlaneSignature(0f, 0f, 1f, 0f, 1.5f, -3f)
        val adjacentWall = PlaneSignature(1f, 0f, 0f, 4f, 1.5f, -3f)
        val offsetParallelWall = PlaneSignature(0f, 0f, 1f, 0f, 1.5f, -3.25f)
        assertFalse(ArMeasurementGeometry.areCoplanar(wall, adjacentWall))
        assertFalse(ArMeasurementGeometry.areCoplanar(wall, offsetParallelWall))
    }

    @Test
    fun `parallel or behind-camera planes do not create fallback points`() {
        val origin = WorldPoint3(0f, 1f, 0f)
        val wall = PlaneSignature(0f, 0f, 1f, 0f, 1f, -2f)
        assertNull(
            ArMeasurementGeometry.intersectRayWithPlane(
                origin, WorldPoint3(1f, 0f, 0f), wall, 0.25f, 8f
            )
        )
        assertNull(
            ArMeasurementGeometry.intersectRayWithPlane(
                origin, WorldPoint3(0f, 0f, 1f), wall, 0.25f, 8f
            )
        )
    }

    @Test
    fun `debug candidates never become measurement points`() {
        val state = ArUiState(
            phase = ArPhase.SearchingForSurface,
            debugCandidates = listOf(DebugCandidate(0.5f, 0.5f, DebugCandidateKind.Confirmed))
        )
        assertEquals(0, state.pointCount)
        assertFalse(state.canPlace)
    }

    @Test
    fun `on a wall the level side is the width, whichever side was tapped first`() {
        // The customer's wall: 1.85 m across, 1.32 m tall, 2 m away.
        val topLeft = WorldPoint3(0f, 2.1f, -2f)
        val topRight = WorldPoint3(1.85f, 2.1f, -2f)
        val bottomLeft = WorldPoint3(0f, 0.78f, -2f)
        val bottomRight = WorldPoint3(1.85f, 0.78f, -2f)

        // As the app asks: along the top, then down.
        val (width, height) = ArMeasurementGeometry.rectangleSize(topLeft, topRight, bottomRight, SurfaceType.WALL)
        assertEquals(1.85, width, 1e-4)
        assertEquals(1.32, height, 1e-4)
        // Down the left side first, then across: still 1.85 wide and 1.32 tall, not swapped.
        val (swappedWidth, swappedHeight) = ArMeasurementGeometry.rectangleSize(topLeft, bottomLeft, bottomRight, SurfaceType.WALL)
        assertEquals(1.85, swappedWidth, 1e-4)
        assertEquals(1.32, swappedHeight, 1e-4)
    }

    @Test
    fun `a ceiling keeps the tap order`() {
        val (width, height) = ArMeasurementGeometry.rectangleSize(
            WorldPoint3(0f, 2.6f, 0f), WorldPoint3(0f, 2.6f, -1.5f), WorldPoint3(3f, 2.6f, -1.5f), SurfaceType.CEILING
        )
        assertEquals(1.5, width, 1e-4)
        assertEquals(3.0, height, 1e-4)
    }

    @Test
    fun `the averaged point ignores a stray sample`() {
        val samples = listOf(
            WorldPoint3(1.00f, 2.00f, -2.00f), WorldPoint3(1.01f, 2.01f, -2.00f), WorldPoint3(0.99f, 1.99f, -2.01f),
            WorldPoint3(1.00f, 2.00f, -1.99f), WorldPoint3(1.40f, 2.30f, -2.20f) // one jumped onto the cove
        )
        val middle = ArMeasurementGeometry.medianPoint(samples)
        assertEquals(1.00f, middle.x, 1e-4f)
        assertEquals(2.00f, middle.y, 1e-4f)
        assertEquals(-2.00f, middle.z, 1e-4f)
    }

    @Test
    fun `distance to a wall plane counts only the depth off it`() {
        val wall = PlaneSignature(0f, 0f, 1f, 0f, 1.5f, -2f)
        assertEquals(0.03f, ArMeasurementGeometry.distanceToPlane(WorldPoint3(4f, 0.2f, -1.97f), wall), 1e-4f)
    }

    @Test
    fun `surface dots never show on the floor and only show on the selected surface`() {
        // Aiming at the floor in Wall mode: never show dots.
        assertFalse(
            ArMeasurementGeometry.shouldShowSurfaceDots(
                surfaceType = SurfaceType.WALL,
                hitKind = HitKind.HorizontalUpward,
                confidence = HitConfidence.Mismatched,
                wrongOrientation = true,
                surfaceNormalY = 1f,
                hitY = 0f,
                cameraY = 1.4f
            )
        )
        // Even if a hit were marked Good, an upward-facing floor normal is rejected in Wall mode.
        assertFalse(
            ArMeasurementGeometry.shouldShowSurfaceDots(
                surfaceType = SurfaceType.WALL,
                hitKind = HitKind.VerticalPlane,
                confidence = HitConfidence.Good,
                wrongOrientation = false,
                surfaceNormalY = 0.95f,
                hitY = 0f,
                cameraY = 1.4f
            )
        )
        // Valid vertical wall in Wall mode: show dots on the wall.
        assertTrue(
            ArMeasurementGeometry.shouldShowSurfaceDots(
                surfaceType = SurfaceType.WALL,
                hitKind = HitKind.VerticalPlane,
                confidence = HitConfidence.Good,
                wrongOrientation = false,
                surfaceNormalY = 0f,
                hitY = 1.4f,
                cameraY = 1.4f
            )
        )
        // Ceiling surface while in Wall mode: never show dots.
        assertFalse(
            ArMeasurementGeometry.shouldShowSurfaceDots(
                surfaceType = SurfaceType.WALL,
                hitKind = HitKind.HorizontalDownward,
                confidence = HitConfidence.Good,
                wrongOrientation = false,
                surfaceNormalY = -1f,
                hitY = 2.6f,
                cameraY = 1.4f
            )
        )
        // Valid ceiling above the camera in Ceiling mode: show dots on the ceiling.
        assertTrue(
            ArMeasurementGeometry.shouldShowSurfaceDots(
                surfaceType = SurfaceType.CEILING,
                hitKind = HitKind.HorizontalDownward,
                confidence = HitConfidence.Good,
                wrongOrientation = false,
                surfaceNormalY = -1f,
                hitY = 2.6f,
                cameraY = 1.4f
            )
        )
        // A horizontal plane below the camera (floor) in Ceiling mode: never show dots.
        assertFalse(
            ArMeasurementGeometry.shouldShowSurfaceDots(
                surfaceType = SurfaceType.CEILING,
                hitKind = HitKind.HorizontalDownward,
                confidence = HitConfidence.Good,
                wrongOrientation = false,
                surfaceNormalY = -1f,
                hitY = 0.2f,
                cameraY = 1.4f
            )
        )
    }

    @Test
    fun `point hit plane signatures stay vertical on walls and horizontal on ceilings`() {
        val point = WorldPoint3(0.5f, 1.6f, -2.0f)
        val tiltedCameraDir = WorldPoint3(0f, -0.45f, -0.89f)

        val wallSig = ArMeasurementGeometry.surfacePlaneSignature(HitKind.VerticalPlane, point, tiltedCameraDir)
        assertEquals(0f, wallSig.normalY, 1e-4f)
        assertEquals(1f, wallSig.normalZ, 1e-4f)

        val ceilingSig = ArMeasurementGeometry.surfacePlaneSignature(HitKind.HorizontalDownward, point, tiltedCameraDir)
        assertEquals(0f, ceilingSig.normalX, 1e-4f)
        assertEquals(-1f, ceilingSig.normalY, 1e-4f)
        assertEquals(0f, ceilingSig.normalZ, 1e-4f)
    }

    @Test
    fun `big wall ray intersection works across long spans and shallow panning angles`() {
        // Standing 1.8 m from a 12 m wide wall and panning to the far corner at x = 10.5 m.
        val origin = WorldPoint3(0f, 1.5f, 0f)
        val wall = PlaneSignature(0f, 0f, 1f, 0f, 1.5f, -1.8f)
        val farDirection = WorldPoint3(10.5f, 1.2f, -1.8f)
        val hit = ArMeasurementGeometry.intersectRayWithPlane(
            origin = origin,
            direction = farDirection,
            plane = wall,
            minDistance = 0.20f,
            maxDistance = 25.0f
        )
        assertNotNull(hit)
        assertEquals(10.5f, hit!!.x, 0.01f)
        assertEquals(-1.8f, hit.z, 0.01f)
    }

    @Test
    fun `connecting three points builds a fixed 3D grid structure coplanar with the measured surface`() {
        val p0 = WorldPoint3(0f, 2.2f, -2.0f)
        val p1 = WorldPoint3(2.4f, 2.2f, -2.0f)
        val p2 = WorldPoint3(2.4f, 0.4f, -2.0f)
        val wallPlane = PlaneSignature(0f, 0f, 1f, 0f, 1.3f, -2.0f)

        val segments = ArMeasurementGeometry.buildFixedGridSegments(p0, p1, p2)
        val outerCount = segments.count { it.isOuterFrame }
        val innerCount = segments.count { !it.isOuterFrame }

        assertEquals(4, outerCount)
        assertTrue(innerCount >= 4)
        // Every outer beam and interior grid line lies flat on the measured wall plane (z = -2.0 m).
        segments.forEach { seg ->
            assertEquals(0f, ArMeasurementGeometry.distanceToPlane(seg.from, wallPlane), 1e-4f)
            assertEquals(0f, ArMeasurementGeometry.distanceToPlane(seg.to, wallPlane), 1e-4f)
        }
    }

    @Test
    fun `floor visible on screen does not occlude wall when center reticle aims at wall or baseboard`() {
        val floorY = 0.0f
        // Center reticle aimed at the baseboard (3 cm above the floor, 2.42 m away) while a floor
        // plane is visible in the lower half of the camera view (~2.46 m away along the ray).
        assertFalse(
            ArMeasurementGeometry.isFloorOccludingWall(
                wallHitY = 0.03f,
                wallHitDistance = 2.42f,
                floorPlaneY = floorY,
                floorHitDistance = 2.46f
            )
        )
        // Center reticle aimed right at the bottom wall-floor crease (-2 cm within 4 cm junction tolerance).
        assertFalse(
            ArMeasurementGeometry.isFloorOccludingWall(
                wallHitY = -0.02f,
                wallHitDistance = 2.45f,
                floorPlaneY = floorY,
                floorHitDistance = 2.43f
            )
        )
        // Center reticle tilted below the baseboard directly onto the floor 25 cm in front of the wall:
        // wall ray projection falls 18 cm below the floor and the floor hit is 30 cm closer than the wall.
        assertTrue(
            ArMeasurementGeometry.isFloorOccludingWall(
                wallHitY = -0.18f,
                wallHitDistance = 2.55f,
                floorPlaneY = floorY,
                floorHitDistance = 2.25f
            )
        )
    }

    @Test
    fun `wall dot grid center stays above floor when aiming near baseboard`() {
        val floorY = 0.0f
        val radius = 0.80f
        // Aiming at the baseboard (y = 0.04 m): dot center is clamped upward onto the wall above the floor.
        val clampedY = ArMeasurementGeometry.clampWallDotsCenterY(hitY = 0.04f, floorY = floorY, radius = radius)
        assertEquals(0.68f, clampedY, 1e-4f)
        // Aiming higher up on the wall (y = 1.35 m): dot center follows the reticle unchanged.
        assertEquals(1.35f, ArMeasurementGeometry.clampWallDotsCenterY(hitY = 1.35f, floorY = floorY, radius = radius), 1e-4f)
    }

    @Test
    fun `dragging a grid corner moves only that corner independently on the locked wall plane and updates quad area and bilinear grid`() {
        val wallPlane = PlaneSignature(0f, 0f, 1f, 0f, 1.3f, -2.0f)
        val p0 = WorldPoint3(0f, 2.2f, -2.0f)
        val p1 = WorldPoint3(2.0f, 2.2f, -2.0f)
        val p2 = WorldPoint3(2.0f, 0.2f, -2.0f)

        val initial = ArMeasurementGeometry.initialGridCorners(p0, p1, p2, wallPlane)
        assertEquals(4, initial.size)
        val (initialW, initialH) = ArMeasurementGeometry.quadDimensions(initial)
        assertEquals(2.0, initialW, 1e-3)
        assertEquals(2.0, initialH, 1e-3)
        assertEquals(4.0, ArMeasurementGeometry.quadArea(initial), 1e-3)

        // Drag top-right corner (index 2) outward to x = 2.6 m, y = 2.5 m, even with an off-plane z = -1.6 m input:
        // moveGridCornerOnPlane must keep all 4 corners strictly on the locked wall plane (z = -2.0 m)
        // and move ONLY corner 2 while leaving corners 0 (BL), 1 (BR), and 3 (TL) 100% untouched.
        val draggedTR = ArMeasurementGeometry.moveGridCornerOnPlane(
            corners = initial,
            cornerIndex = 2,
            targetPoint = WorldPoint3(2.6f, 2.5f, -1.6f),
            plane = wallPlane
        )
        draggedTR.forEach { corner ->
            assertEquals(0f, ArMeasurementGeometry.distanceToPlane(corner, wallPlane), 1e-4f)
            assertEquals(-2.0f, corner.z, 1e-4f)
        }
        assertEquals(2.6f, draggedTR[2].x, 1e-3f)
        assertEquals(2.5f, draggedTR[2].y, 1e-3f)

        // The other 3 corners (0 = BL, 1 = BR, 3 = TL) must remain 100% unchanged.
        assertEquals(initial[0].x, draggedTR[0].x, 1e-4f)
        assertEquals(initial[0].y, draggedTR[0].y, 1e-4f)
        assertEquals(initial[1].x, draggedTR[1].x, 1e-4f)
        assertEquals(initial[1].y, draggedTR[1].y, 1e-4f)
        assertEquals(initial[3].x, draggedTR[3].x, 1e-4f)
        assertEquals(initial[3].y, draggedTR[3].y, 1e-4f)

        // Drag bottom-right corner (index 1) sideways to x = 2.6 m (keeping y = 0.2 m) so the bottom
        // width is 2.6 m and top edge is a trapezoid: corner 2 (TR) and corners 0, 3 stay untouched.
        val draggedBR = ArMeasurementGeometry.moveGridCornerOnPlane(
            corners = initial,
            cornerIndex = 1,
            targetPoint = WorldPoint3(2.8f, 0.2f, -2.0f),
            plane = wallPlane
        )
        assertEquals(2.8f, draggedBR[1].x, 1e-4f)
        assertEquals(0.2f, draggedBR[1].y, 1e-4f)
        // Top-right corner (index 2) did NOT move sideways when bottom-right (index 1) was dragged!
        assertEquals(initial[2].x, draggedBR[2].x, 1e-4f)
        assertEquals(initial[2].y, draggedBR[2].y, 1e-4f)
        assertEquals(initial[0].x, draggedBR[0].x, 1e-4f)
        assertEquals(initial[3].x, draggedBR[3].x, 1e-4f)

        // Trapezoid has bottom width = 2.8 m, top width = 2.0 m, vertical height = 2.0 m:
        // Two-triangle quadrilateral area = 0.5 * (2.8 + 2.0) * 2.0 = 4.8 m².
        // Average width = (2.8 + 2.0) / 2 = 2.4 m.
        val (trapW, trapH) = ArMeasurementGeometry.quadDimensions(draggedBR)
        assertEquals(2.4, trapW, 1e-3)
        assertTrue(trapH > 2.0)
        assertEquals(4.8, ArMeasurementGeometry.quadArea(draggedBR), 1e-3)

        // Bilinear grid segments interpolate across the custom quadrilateral and stay on the wall plane.
        val midPoint = ArMeasurementGeometry.bilinearQuadPoint(
            draggedBR[0],
            draggedBR[1],
            draggedBR[2],
            draggedBR[3],
            0.5f,
            0.5f
        )
        assertEquals(1.2f, midPoint.x, 1e-4f)
        assertEquals(1.2f, midPoint.y, 1e-4f)
        assertEquals(-2.0f, midPoint.z, 1e-4f)

        val segments = ArMeasurementGeometry.buildFixedGridSegmentsFromCorners(draggedBR)
        assertTrue(segments.isNotEmpty())
        segments.forEach { seg ->
            assertEquals(0f, ArMeasurementGeometry.distanceToPlane(seg.from, wallPlane), 1e-4f)
            assertEquals(0f, ArMeasurementGeometry.distanceToPlane(seg.to, wallPlane), 1e-4f)
        }
    }

    @Test
    fun `wall plane locks normal horizontal and constrains width horizontally and height vertically without depth skew`() {
        // Wall plane with a tilted normal and points with depth spikes:
        // verticalWallPlane locks normal.y = 0, constrainWallWidthPoint expands purely along
        // cross(worldUp, wallNormal), and constrainWallHeightPoint expands purely along worldUp.
        val tiltedWall = PlaneSignature(0.0f, 0.25f, 0.968f, 0f, 1.8f, -2.0f)
        val anchorA = WorldPoint3(0f, 1.8f, -2.0f)
        val lockedWall = ArMeasurementGeometry.verticalWallPlane(tiltedWall, anchorPoint = anchorA)
        assertEquals(0f, lockedWall.normalY, 1e-6f)
        assertEquals(1f, lockedWall.normalZ, 1e-5f)

        // Raw Point B hit with both a depth spike (z = -3.8 m) and vertical drift (y = 1.55 m):
        // constrained Point B stays at z = -2.0 m and y = 1.8 m, expanding purely horizontally.
        val rawB = WorldPoint3(1.65f, 1.55f, -3.8f)
        val widthB = ArMeasurementGeometry.constrainWallWidthPoint(anchorA, rawB, lockedWall)
        assertEquals(1.65f, widthB.x, 1e-4f)
        assertEquals(1.80f, widthB.y, 1e-4f)
        assertEquals(-2.0f, widthB.z, 1e-4f)

        // Raw Point C hit with sideways drift (x = 2.1 m) and depth spike (z = -4.2 m):
        // constrained Point C stays at x = 1.65 m and z = -2.0 m, expanding purely vertically along Y.
        val rawC = WorldPoint3(2.10f, 0.30f, -4.2f)
        val heightC = ArMeasurementGeometry.constrainWallHeightPoint(anchorA, widthB, rawC, lockedWall)
        assertEquals(1.65f, heightC.x, 1e-4f)
        assertEquals(0.30f, heightC.y, 1e-4f)
        assertEquals(-2.0f, heightC.z, 1e-4f)

        // All 4 corners of initialGridCorners form a flat coplanar rectangle flush against z = -2.0 m.
        val corners = ArMeasurementGeometry.initialGridCorners(anchorA, rawB, rawC, lockedWall)
        assertEquals(4, corners.size)
        corners.forEach { c ->
            assertEquals(-2.0f, c.z, 1e-4f)
            assertEquals(0f, ArMeasurementGeometry.distanceToPlane(c, lockedWall), 1e-4f)
        }
        val (w, h) = ArMeasurementGeometry.quadDimensions(corners)
        assertEquals(1.65, w, 1e-3)
        assertEquals(1.50, h, 1e-3)

        // Extreme grazing ray (> 80° off normal) is rejected as a raycast depth spike.
        val grazingRay = WorldPoint3(0.995f, 0f, -0.099f)
        val farSpikeHit = WorldPoint3(12f, 1.8f, -2.0f)
        assertTrue(
            ArMeasurementGeometry.isWallRaycastDepthSpike(
                cameraOrigin = WorldPoint3(0f, 1.5f, 0f),
                rayDirection = grazingRay,
                wallPlane = lockedWall,
                hitPoint = farSpikeHit,
                anchorPoint = anchorA
            )
        )
    }

    @Test
    fun `screen projection and ray unprojection round-trip onto the locked wall plane`() {
        // Identity view matrix (camera at origin looking down -Z) and standard perspective projection.
        val view = floatArrayOf(
            1f, 0f, 0f, 0f,
            0f, 1f, 0f, 0f,
            0f, 0f, 1f, 0f,
            0f, 0f, 0f, 1f
        )
        val projection = floatArrayOf(
            1.4f, 0f, 0f, 0f,
            0f, 1.0f, 0f, 0f,
            0f, 0f, -1f, -1f,
            0f, 0f, -0.1f, 0f
        )
        val wallPlane = PlaneSignature(0f, 0f, 1f, 0f, 0f, -2.5f)
        val original = WorldPoint3(0.65f, -0.45f, -2.5f)

        val screen = ArMeasurementGeometry.projectWorldToScreen(original, view, projection)
        assertNotNull(screen)

        val unprojected = ArMeasurementGeometry.intersectScreenRayWithPlane(
            normX = screen!!.first,
            normY = screen.second,
            viewMatrix = view,
            projectionMatrix = projection,
            plane = wallPlane
        )
        assertNotNull(unprojected)
        assertEquals(original.x, unprojected!!.x, 1e-4f)
        assertEquals(original.y, unprojected.y, 1e-4f)
        assertEquals(original.z, unprojected.z, 1e-4f)
    }

    @Test
    fun `two-point wall plane refinement eliminates wide-wall width and height underestimation from initial normal tilt`() {
        // Real wall at z = -2.50 m, width = 5.13 m (x from -2.565 m to +2.565 m), height = 2.18 m (y from 2.18 m down to 0.00 m).
        val cameraOrigin = WorldPoint3(0f, 1.45f, 0f)
        val pointA = WorldPoint3(-2.565f, 2.18f, -2.50f)
        val truePointB = WorldPoint3(2.565f, 2.18f, -2.50f)
        val rayToBottomRight = WorldPoint3(
            truePointB.x - cameraOrigin.x,
            0.00f - cameraOrigin.y,
            truePointB.z - cameraOrigin.z
        )

        // Suppose Point A's initial single-point normal was tilted 5° toward the camera (which previously
        // pulled the virtual wall plane ~45 cm closer to the camera at the right end, shrinking 5.13 m -> ~4.79 m
        // and 2.18 m -> ~1.98 m).
        val tiltedInitialPlane = PlaneSignature(
            normalX = -0.08715f,
            normalY = 0f,
            normalZ = 0.99619f,
            centerX = pointA.x,
            centerY = pointA.y,
            centerZ = pointA.z
        )

        // Refining the vertical wall plane from the 2-point horizontal chord (pointA -> truePointB)
        // recovers the exact wall plane (normal = (0, 0, 1) at z = -2.50 m).
        val refinedPlane = ArMeasurementGeometry.wallPlaneFromTwoPoints(
            anchorA = pointA,
            secondPoint = truePointB,
            cameraOrigin = cameraOrigin,
            referencePlane = tiltedInitialPlane
        )
        assertNotNull(refinedPlane)
        assertEquals(0f, refinedPlane!!.normalX, 1e-4f)
        assertEquals(0f, refinedPlane.normalY, 1e-4f)
        assertEquals(1f, refinedPlane.normalZ, 1e-4f)

        val constrainedB = ArMeasurementGeometry.constrainWallWidthPoint(pointA, truePointB, refinedPlane)
        val hitC = ArMeasurementGeometry.intersectRayWithPlane(
            origin = cameraOrigin,
            direction = rayToBottomRight,
            plane = refinedPlane,
            minDistance = 0.20f,
            maxDistance = 25.0f
        )
        assertNotNull(hitC)
        val constrainedC = ArMeasurementGeometry.constrainWallHeightPoint(pointA, constrainedB, hitC!!, refinedPlane)

        val corners = ArMeasurementGeometry.initialGridCorners(pointA, constrainedB, constrainedC, refinedPlane)
        val (measuredWidth, measuredHeight) = ArMeasurementGeometry.quadDimensions(corners)
        assertEquals(5.13, measuredWidth, 1e-3)
        assertEquals(2.18, measuredHeight, 1e-3)
    }
}
