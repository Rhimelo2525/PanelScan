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
}
