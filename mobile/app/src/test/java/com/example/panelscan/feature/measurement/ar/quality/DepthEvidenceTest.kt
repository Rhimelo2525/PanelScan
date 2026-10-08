package com.example.panelscan.feature.measurement.ar.quality

import com.example.panelscan.feature.measurement.ar.WorldPoint3
import org.junit.Assert.*
import org.junit.Test

class DepthEvidenceTest {
    private fun observation(t: Long, id: Long, source: SurfaceEvidenceSource = SurfaceEvidenceSource.RAW_DEPTH_FIT) =
        SurfaceObservation(WorldPoint3(0f, 0f, 1f), WorldPoint3(0f, 1f, -2f), source, t, 0.003f, id)

    @Test fun `cached depth votes never confirm a surface`() {
        val tracker = SurfaceLockTracker()
        repeat(30) { tracker.observe(observation(it * 80L, 100), true) }
        assertNull(tracker.locked)
    }
    @Test fun `raw and interpolated versions of same depth do not double vote`() {
        val tracker = SurfaceLockTracker()
        repeat(5) { i ->
            tracker.observe(observation(i * 140L, i.toLong()), true)
            tracker.observe(observation(i * 140L + 20L, i.toLong(), SurfaceEvidenceSource.DEPTH_FIT), true)
        }
        assertNull(tracker.locked)
        tracker.observe(observation(750, 5), true)
        assertEquals(SurfaceEvidenceSource.RAW_DEPTH_FIT, tracker.locked?.source)
        assertEquals(6, tracker.locked?.sampleCount)
    }
    @Test fun `tracking loss requires new acquisitions rather than replaying old votes`() {
        val tracker = SurfaceLockTracker()
        repeat(5) { tracker.observe(observation(it * 100L, it.toLong()), true) }
        tracker.clearSamples()
        repeat(20) { tracker.observe(observation(800L + it * 80, 4), true) }
        assertNull(tracker.locked)
    }
    @Test fun `reference evidence is identified separately and still must settle`() {
        val tracker = SurfaceLockTracker()
        tracker.observe(observation(0, 1, SurfaceEvidenceSource.REFERENCE_IMAGE), true)
        assertNull(tracker.locked)
        tracker.observe(observation(80, 2, SurfaceEvidenceSource.REFERENCE_IMAGE), true)
        tracker.observe(observation(160, 3, SurfaceEvidenceSource.REFERENCE_IMAGE), true)
        assertEquals(SurfaceEvidenceSource.REFERENCE_IMAGE, tracker.locked?.source)
    }

    @Test fun `tracked plane replaces an earlier depth lock before measurement`() {
        val tracker = SurfaceLockTracker()
        repeat(6) { tracker.observe(observation(it * 100L, it.toLong()), true) }
        assertEquals(SurfaceEvidenceSource.RAW_DEPTH_FIT, tracker.locked?.source)
        repeat(3) { tracker.observe(observation(650 + it * 100L, 20L + it, SurfaceEvidenceSource.TRACKED_PLANE), true) }
        assertEquals(SurfaceEvidenceSource.TRACKED_PLANE, tracker.locked?.source)
    }

    private fun patch(outliers: Int = 0): List<RobustDepthGeometry.Sample> = (0 until 81).map { i ->
        val u = (i % 9 - 4).toFloat()
        val v = (i / 9 - 4).toFloat()
        RobustDepthGeometry.Sample(WorldPoint3(u * 0.06f, v * 0.06f, if (i < outliers) -1.3f else -2f), u, v)
    }
    @Test fun `flat metric patch fits despite a small occluding object`() {
        val result = RobustDepthGeometry.fit(patch(8), 0.015f, 16)
        assertNotNull(result)
        assertEquals(-2f, result!!.fit.centroid.z, 0.005f)
        assertEquals(4, result.coverage)
        assertTrue(result.fraction > 0.85f)
    }
    @Test fun `large foreground obstruction prevents confirmation`() {
        assertNull(RobustDepthGeometry.fit(patch(30), 0.015f, 16))
    }
    @Test fun `depth confined to one corner of patch is rejected`() {
        val points = patch().filter { it.u < 0f && it.v < 0f }
        assertNull(RobustDepthGeometry.fit(points, 0.015f, 12))
    }
    @Test fun `collinear samples cannot define a wall`() {
        val points = (0 until 32).map { i -> RobustDepthGeometry.Sample(WorldPoint3(i * 0.02f, 0f, -2f), (i - 16).toFloat(), (i - 16).toFloat()) }
        assertNull(RobustDepthGeometry.fit(points, 0.015f, 16))
    }
    @Test fun `intrinsics unprojection preserves metric depth and camera axis signs`() {
        val p = RobustDepthGeometry.cameraPoint(150f, 50f, 2f, 100f, 100f, 100f, 100f)!!
        assertEquals(1f, p.x, 0.00001f)
        assertEquals(1f, p.y, 0.00001f)
        assertEquals(-2f, p.z, 0.00001f)
        assertNull(RobustDepthGeometry.cameraPoint(1f, 1f, 2f, 0f, 100f, 1f, 1f))
        assertNull(RobustDepthGeometry.cameraPoint(1f, 1f, Float.NaN, 100f, 100f, 1f, 1f))
    }
}
