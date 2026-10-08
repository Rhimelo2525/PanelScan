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
}
