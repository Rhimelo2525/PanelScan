package com.example.panelscan.feature.measurement.ar

import com.example.panelscan.core.model.SurfaceType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CornerEvidenceTest {

    @Test
    fun `test corner type labels`() {
        assertEquals("wall/wall", CornerType.WALL_WALL.label)
        assertEquals("wall/floor", CornerType.WALL_FLOOR.label)
        assertEquals("wall/ceiling", CornerType.WALL_CEILING.label)
        assertEquals("unknown", CornerType.UNKNOWN.label)
    }

    @Test
    fun `test corner evidence default values`() {
        val evidence = CornerEvidence()
        assertEquals(0f, evidence.score, 0.001f)
        assertFalse(evidence.geometryConfirmed)
        assertEquals(CornerType.UNKNOWN, evidence.cornerType)
    }

    @Test
    fun `test confirmed structural corner evidence`() {
        val confirmed = CornerEvidence(
            score = 0.85f,
            geometryConfirmed = true,
            planeNormalDeltaDegrees = 88.5f,
            cornerType = CornerType.WALL_WALL
        )
        assertTrue(confirmed.geometryConfirmed)
        assertEquals(CornerType.WALL_WALL, confirmed.cornerType)
        assertTrue(confirmed.score > 0.8f)
    }

    @Test
    fun `real wall corner needs intersecting wall planes and a boundary or depth bend`() {
        assertTrue(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.WALL_WALL, 88f, true, false, false))
        assertTrue(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.WALL_WALL, 83f, false, true, false))
        assertFalse(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.WALL_WALL, 88f, false, false, false))
    }

    @Test
    fun `flat wall doorway noisy depth floor and ceiling cannot lock as wall corners`() {
        // UNKNOWN covers flat walls, shadows, furniture, and doorway depth steps.
        assertFalse(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.UNKNOWN, 0f, true, true, false))
        assertFalse(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.UNKNOWN, 90f, true, true, false))
        assertFalse(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.WALL_WALL, 14f, true, true, false))
        assertFalse(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.WALL_FLOOR, 90f, true, true, false))
        assertFalse(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.WALL_CEILING, 90f, true, true, false))
        assertFalse(CornerGeometry.confirmsCorner(SurfaceType.WALL, CornerType.WALL_WALL, 90f, false, true, true))
    }
}
