package com.example.panelscan.feature.measurement.ar.quality

import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.feature.measurement.ar.WorldPoint3
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class SurfaceConfidenceTest {

    // ------------------------------------------------------------ orientation

    @Test
    fun `orientation classification distinguishes wall floor ceiling`() {
        assertEquals(SurfaceOrientation.VERTICAL, SurfaceOrientationClassifier.classify(WorldPoint3(0f, 0f, 1f)))
        assertEquals(SurfaceOrientation.VERTICAL, SurfaceOrientationClassifier.classify(WorldPoint3(0.97f, 0.2f, 0f)))
        assertEquals(SurfaceOrientation.HORIZONTAL_UP, SurfaceOrientationClassifier.classify(WorldPoint3(0f, 1f, 0f)))
        assertEquals(SurfaceOrientation.HORIZONTAL_DOWN, SurfaceOrientationClassifier.classify(WorldPoint3(0f, -1f, 0.05f)))
        assertEquals(SurfaceOrientation.SLANTED, SurfaceOrientationClassifier.classify(WorldPoint3(0f, 0.7f, 0.7f)))
    }

    @Test
    fun `floor is never a valid wall and wall is never a valid ceiling`() {
        assertFalse(SurfaceOrientationClassifier.matches(SurfaceType.WALL, SurfaceOrientation.HORIZONTAL_UP))
        assertFalse(SurfaceOrientationClassifier.matches(SurfaceType.WALL, SurfaceOrientation.HORIZONTAL_DOWN))
        assertTrue(SurfaceOrientationClassifier.matches(SurfaceType.WALL, SurfaceOrientation.VERTICAL))
        assertTrue(SurfaceOrientationClassifier.matches(SurfaceType.CEILING, SurfaceOrientation.HORIZONTAL_DOWN))
        assertFalse(SurfaceOrientationClassifier.matches(SurfaceType.CEILING, SurfaceOrientation.VERTICAL))
        assertFalse(SurfaceOrientationClassifier.matches(SurfaceType.CEILING, SurfaceOrientation.HORIZONTAL_UP))
    }

    @Test
    fun `fitted normal is flipped to face the camera`() {
        // Ceiling 2.5 m up, camera at 1.4 m: normal must face down.
        val flipped = SurfaceOrientationClassifier.orientTowardsCamera(
            WorldPoint3(0f, 1f, 0f), WorldPoint3(0f, 2.5f, -1f), WorldPoint3(0f, 1.4f, 0f)
        )
        assertEquals(-1f, flipped.y, 1e-6f)
        assertEquals(SurfaceOrientation.HORIZONTAL_DOWN, SurfaceOrientationClassifier.classify(flipped))
    }

    // ---------------------------------------------------------------- geometry

    @Test
    fun `plane fit recovers a wall from noisy depth points`() {
        val points = listOf(
            WorldPoint3(0f, 1.5f, -2.000f),
            WorldPoint3(-0.3f, 1.5f, -2.004f),
            WorldPoint3(0.3f, 1.5f, -1.997f),
            WorldPoint3(0f, 1.2f, -2.003f),
            WorldPoint3(0f, 1.8f, -1.998f)
        )
        val fit = PlaneFitter.fit(points)
        assertNotNull(fit)
        assertTrue(abs(abs(fit!!.normal.z) - 1f) < 0.01f)
        assertTrue(fit.rmsResidual < 0.005f)
        assertTrue(fit.spread > 0.25f)
    }

    @Test
    fun `plane fit rejects collinear points`() {
        assertNull(PlaneFitter.fit(listOf(WorldPoint3(0f, 0f, 0f), WorldPoint3(1f, 0f, 0f), WorldPoint3(2f, 0f, 0f))))
    }

    @Test
    fun `points around a corner fit badly`() {
        // Two walls at 90 degrees: residual must be large enough for the sampler to reject.
        val points = listOf(
            WorldPoint3(-0.3f, 1.5f, -2f), WorldPoint3(-0.15f, 1.5f, -2f), WorldPoint3(0f, 1.5f, -2f),
            WorldPoint3(0f, 1.5f, -1.7f), WorldPoint3(0f, 1.2f, -1.85f)
        )
        val fit = PlaneFitter.fit(points)!!
        assertTrue(fit.rmsResidual > 0.03f)
    }

    @Test
    fun `lock anchor rotation maps up onto the surface normal`() {
        listOf(WorldPoint3(0f, 0f, 1f), WorldPoint3(0f, -1f, 0f), WorldPoint3(0.6f, 0f, -0.8f), WorldPoint3(0f, 1f, 0f)).forEach { n ->
            val back = SurfaceMath.rotateUp(SurfaceMath.quaternionFromUpTo(n))
            assertEquals(n.x, back.x, 1e-4f)
            assertEquals(n.y, back.y, 1e-4f)
            assertEquals(n.z, back.z, 1e-4f)
        }
    }

    // -------------------------------------------------------------------- lock

    private val wallNormal = WorldPoint3(0f, 0f, 1f)

    private fun wall(t: Long, source: SurfaceEvidenceSource, z: Float = -2f, residual: Float = 0.004f, normal: WorldPoint3 = wallNormal) =
        SurfaceObservation(normal, WorldPoint3(0f, 1.5f, z), source, t, residual)

    @Test
    fun `tracked plane confirms after three agreeing samples`() {
        val tracker = SurfaceLockTracker()
        assertEquals(LockPhase.DETECTED, tracker.observe(wall(0, SurfaceEvidenceSource.TRACKED_PLANE), true).phase)
        assertEquals(LockPhase.DETECTED, tracker.observe(wall(80, SurfaceEvidenceSource.TRACKED_PLANE), true).phase)
        val status = tracker.observe(wall(160, SurfaceEvidenceSource.TRACKED_PLANE), true)
        assertEquals(LockPhase.CONFIRMED, status.phase)
        assertNotNull(status.newlyLocked)
        assertEquals(SurfaceEvidenceSource.TRACKED_PLANE, status.newlyLocked!!.source)
    }

    @Test
    fun `plain wall confirms from consistent depth alone`() {
        val tracker = SurfaceLockTracker()
        var status: LockStatus? = null
        for (i in 0 until 7) {
            status = tracker.observe(wall(i * 100L, SurfaceEvidenceSource.DEPTH_FIT, z = -2f + (i % 2) * 0.01f), true)
        }
        assertEquals(LockPhase.CONFIRMED, status!!.phase)
        assertNotNull(tracker.locked)
        assertEquals(SurfaceEvidenceSource.DEPTH_FIT, tracker.locked!!.source)
    }

    @Test
    fun `inconsistent depth never confirms`() {
        val tracker = SurfaceLockTracker()
        for (i in 0 until 20) {
            val tilt = if (i % 2 == 0) WorldPoint3(0f, 0f, 1f) else WorldPoint3(0.5f, 0f, 0.866f)
            tracker.observe(wall(i * 100L, SurfaceEvidenceSource.DEPTH_FIT, normal = tilt), true)
        }
        assertNull(tracker.locked)
    }

    @Test
    fun `noisy depth residual does not count towards a lock`() {
        val tracker = SurfaceLockTracker()
        for (i in 0 until 12) tracker.observe(wall(i * 100L, SurfaceEvidenceSource.DEPTH_FIT, residual = 0.05f), true)
        assertNull(tracker.locked)
    }

    @Test
    fun `a different surface cannot replace the lock once measuring started`() {
        val tracker = SurfaceLockTracker()
        repeat(3) { tracker.observe(wall(it * 80L, SurfaceEvidenceSource.TRACKED_PLANE), true) }
        val first = tracker.locked!!
        // Adjacent wall, 90 degrees away.
        val side = WorldPoint3(1f, 0f, 0f)
        repeat(6) { tracker.observe(SurfaceObservation(side, WorldPoint3(1f, 1.5f, -2f), SurfaceEvidenceSource.TRACKED_PLANE, 1000L + it * 80), false) }
        assertEquals(first, tracker.locked)
        // …but can before any point is placed.
        repeat(3) { tracker.observe(SurfaceObservation(side, WorldPoint3(1f, 1.5f, -2f), SurfaceEvidenceSource.TRACKED_PLANE, 2000L + it * 80), true) }
        assertTrue(abs(tracker.locked!!.normal.x) > 0.9f)
    }

    // -------------------------------------------------------------- confidence

    private fun lockedWall(
        texture: TextureLevel = TextureLevel.VERY_LOW,
        lighting: LightingCondition = LightingCondition.BRIGHT
    ) = SurfaceSignals(
        tracking = TrackingQuality.TRACKING,
        depthPlaneMatches = true,
        depthFitResidual = 0.006f,
        depthSupported = true,
        surfaceLocked = true,
        lockStability = 1f,
        lockedHitInRange = true,
        lighting = lighting,
        texture = texture
    )

    @Test
    fun `plain white wall with confident geometry is measurable despite low texture`() {
        val a = SurfaceConfidenceModel.assess(lockedWall())
        assertTrue(a.measurementAllowed)
        assertEquals(ScanIssue.NONE, a.issue)
        assertTrue(a.feature < 0.5f)
    }

    @Test
    fun `texture alone never blocks and never allows`() {
        val rich = SurfaceConfidenceModel.assess(lockedWall(texture = TextureLevel.HIGH).copy(surfaceLocked = false))
        assertFalse("no geometry, no measurement, however textured", rich.measurementAllowed)
    }

    @Test
    fun `lost tracking blocks measurement`() {
        val a = SurfaceConfidenceModel.assess(lockedWall().copy(tracking = TrackingQuality.NOT_TRACKING, trackingProblem = TrackingProblem.INSUFFICIENT_FEATURES, lighting = LightingCondition.NORMAL))
        assertFalse(a.measurementAllowed)
        assertEquals(ScanIssue.TRACKING_DIFFICULT, a.issue)
    }

    @Test
    fun `glare is reported as too bright not as a plain surface`() {
        val a = SurfaceConfidenceModel.assess(
            SurfaceSignals(
                tracking = TrackingQuality.NOT_TRACKING,
                trackingProblem = TrackingProblem.INSUFFICIENT_FEATURES,
                lighting = LightingCondition.OVEREXPOSED,
                texture = TextureLevel.VERY_LOW
            )
        )
        assertEquals(ScanIssue.TOO_BRIGHT, a.issue)
    }

    @Test
    fun `dark room is too dark`() {
        val a = SurfaceConfidenceModel.assess(
            SurfaceSignals(tracking = TrackingQuality.NOT_TRACKING, trackingProblem = TrackingProblem.INSUFFICIENT_LIGHT)
        )
        assertEquals(ScanIssue.TOO_DARK, a.issue)
    }

    @Test
    fun `floor under the reticle in wall mode is wrong orientation`() {
        val a = SurfaceConfidenceModel.assess(
            SurfaceSignals(tracking = TrackingQuality.TRACKING, wrongOrientation = true, lighting = LightingCondition.NORMAL)
        )
        assertFalse(a.measurementAllowed)
        assertEquals(ScanIssue.WRONG_ORIENTATION, a.issue)
    }

    @Test
    fun `reticle off the locked wall blocks measurement`() {
        val a = SurfaceConfidenceModel.assess(lockedWall().copy(offLockedSurface = true))
        assertFalse(a.measurementAllowed)
        assertEquals(ScanIssue.OFF_SURFACE, a.issue)
    }

    @Test
    fun `swinging the phone blocks measurement`() {
        val a = SurfaceConfidenceModel.assess(lockedWall().copy(cameraTurnDegreesPerSecond = 140f))
        assertFalse(a.measurementAllowed)
        assertEquals(ScanIssue.MOVING_TOO_FAST, a.issue)
    }

    @Test
    fun `long search on a plain surface offers help, short search does not`() {
        val base = SurfaceSignals(tracking = TrackingQuality.TRACKING, lighting = LightingCondition.NORMAL, texture = TextureLevel.VERY_LOW)
        assertEquals(ScanIssue.NO_SURFACE_YET, SurfaceConfidenceModel.issueFor(base.copy(searchingMillis = 1_000)))
        assertEquals(ScanIssue.SURFACE_DIFFICULT, SurfaceConfidenceModel.issueFor(base.copy(searchingMillis = 7_000)))
    }

    // ------------------------------------------------------------- eligibility

    @Test
    fun `measurement eligibility follows lock and geometry`() {
        val ok = SurfaceConfidenceModel.assess(lockedWall())
        assertEquals(PlacementBlock.NONE, MeasurementEligibility.check(ok, 0, surfaceLocked = true))
        assertEquals(PlacementBlock.SURFACE_NOT_CONFIRMED, MeasurementEligibility.check(ok, 0, surfaceLocked = false))
        assertEquals(PlacementBlock.TOO_CLOSE_TO_WIDTH_LINE, MeasurementEligibility.check(ok, 2, true, provisionalHeightMetres = 0.01))
        assertEquals(PlacementBlock.NONE, MeasurementEligibility.check(ok, 2, true, provisionalHeightMetres = 2.4))
        assertEquals(PlacementBlock.COMPLETE, MeasurementEligibility.check(ok, 3, true))
        val off = SurfaceConfidenceModel.assess(lockedWall().copy(offLockedSurface = true))
        assertEquals(PlacementBlock.OFF_SURFACE, MeasurementEligibility.check(off, 1, true))
    }

    // ------------------------------------------------------------------ stages

    @Test
    fun `scan stages advance only with evidence`() {
        assertEquals(ScanStage.SCAN_SURFACE, ScanStageResolver.resolve(false, false, false, 0))
        assertEquals(ScanStage.MOVE_SLOWLY, ScanStageResolver.resolve(true, false, false, 0))
        assertEquals(ScanStage.SURFACE_DETECTED, ScanStageResolver.resolve(true, true, false, 0))
        assertEquals(ScanStage.SURFACE_CONFIRMED, ScanStageResolver.resolve(true, true, true, 0))
        assertEquals(ScanStage.MEASURE, ScanStageResolver.resolve(true, true, true, 1))
        assertEquals(ScanStage.RESULT, ScanStageResolver.resolve(true, true, true, 3))
        // Losing the surface before measuring steps back rather than pretending.
        assertEquals(ScanStage.MOVE_SLOWLY, ScanStageResolver.resolve(true, false, false, 0))
    }
}
