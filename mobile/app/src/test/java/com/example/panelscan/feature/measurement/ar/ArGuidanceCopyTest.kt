package com.example.panelscan.feature.measurement.ar

import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.feature.measurement.ar.quality.LightingCondition
import com.example.panelscan.feature.measurement.ar.quality.ScanIssue
import com.example.panelscan.feature.measurement.ar.quality.ScanStage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ArGuidanceCopyTest {

    private fun wall(
        stage: ScanStage,
        issue: ScanIssue = ScanIssue.NONE,
        phase: ArPhase = ArPhase.SearchingForSurface,
        step: MeasureStep = MeasureStep.WidthStart,
        assist: CornerAssistState = CornerAssistState()
    ) = ArUiState(
        quickMode = false,
        surfaceType = SurfaceType.WALL,
        phase = phase,
        step = step,
        scanStage = stage,
        issue = issue,
        assist = assist
    )

    @Test
    fun `no state ever reports surface too plain`() {
        ScanIssue.entries.forEach { issue ->
            ScanStage.entries.forEach { stage ->
                val copy = arCopy(wall(stage, issue))
                assertFalse(copy.headline.contains("too plain", ignoreCase = true))
                assertFalse(copy.instruction.contains("too plain", ignoreCase = true))
            }
        }
    }

    @Test
    fun `the six stages use the client wording`() {
        assertEquals("Point your camera at the wall.", arCopy(wall(ScanStage.SCAN_SURFACE)).headline)
        assertEquals("Keep the entire surface visible.", arCopy(wall(ScanStage.SCAN_SURFACE)).instruction)

        val scanning = arCopy(wall(ScanStage.MOVE_SLOWLY))
        assertEquals("Scanning surface...", scanning.headline)
        assertTrue(scanning.instruction.startsWith("Move your phone slowly from side to side."))

        val detected = arCopy(wall(ScanStage.SURFACE_DETECTED))
        assertEquals("Surface detected.", detected.headline)
        assertTrue(detected.instruction.contains("move closer to the corners"))

        val confirmed = arCopy(wall(ScanStage.SURFACE_CONFIRMED, phase = ArPhase.Ready))
        assertEquals("Surface confirmed.", confirmed.headline)
        assertTrue(confirmed.instruction.contains("or aim at any edge and tap to measure"))
        assertEquals(ArTone.Good, confirmed.tone)

        val measuring = arCopy(wall(ScanStage.MEASURE, step = MeasureStep.WidthEnd, phase = ArPhase.Ready))
        assertEquals("Measure the width", measuring.headline)

        val done = arCopy(wall(ScanStage.RESULT, step = MeasureStep.Complete, phase = ArPhase.MeasurementComplete))
        assertEquals("Measurement ready", done.headline)
    }

    @Test
    fun `glare is explained as lighting, texture as texture`() {
        val bright = arCopy(wall(ScanStage.MOVE_SLOWLY, ScanIssue.TOO_BRIGHT, ArPhase.TrackingLimited(ArTrackingIssue.InsufficientFeatures)))
        assertEquals("Lighting is too bright.", bright.headline)
        assertTrue(bright.instruction.contains("reflection"))
        assertTrue(bright.instruction.contains("reduce direct light"))

        val plain = arCopy(wall(ScanStage.MOVE_SLOWLY, ScanIssue.TRACKING_DIFFICULT, ArPhase.TrackingLimited(ArTrackingIssue.InsufficientFeatures)))
        assertEquals("Camera tracking lost", plain.headline)
        assertTrue(plain.instruction.contains("slowly sideways"))
        assertTrue(plain.instruction.contains("matte reference print"))

        assertNotEquals(bright.headline, arCopy(wall(ScanStage.MOVE_SLOWLY, ScanIssue.TOO_DARK)).headline)
    }

    @Test
    fun `too dark offers the light only when it is available and off`() {
        val state = wall(ScanStage.MOVE_SLOWLY, ScanIssue.TOO_DARK).copy(torchAvailable = true, lighting = LightingCondition.TOO_DARK)
        assertEquals(ArCopyAction.TurnOnLight, arCopy(state).action)
        assertEquals(null, arCopy(state.copy(torchEnabled = true)).action)
        assertEquals(null, arCopy(state.copy(torchAvailable = false)).action)
    }

    @Test
    fun `aiming at the floor in wall mode says so`() {
        val copy = arCopy(wall(ScanStage.MOVE_SLOWLY, ScanIssue.WRONG_ORIENTATION).copy(hitKind = HitKind.HorizontalUpward))
        assertEquals("That looks like the floor", copy.headline)
        assertEquals("Point your camera at the wall itself.", copy.instruction)

        val ceiling = ArUiState(
            surfaceType = SurfaceType.CEILING,
            phase = ArPhase.SearchingForSurface,
            scanStage = ScanStage.MOVE_SLOWLY,
            issue = ScanIssue.WRONG_ORIENTATION,
            hitKind = HitKind.VerticalPlane
        )
        assertEquals("That looks like a wall", arCopy(ceiling).headline)
    }

    @Test
    fun `problems take priority over stage copy`() {
        val copy = arCopy(wall(ScanStage.SURFACE_CONFIRMED, ScanIssue.OFF_SURFACE))
        assertEquals("Off the confirmed wall", copy.headline)
    }

    @Test
    fun `corner assist copy only after the surface is confirmed`() {
        val locked = CornerAssistState(status = CornerAssistStatus.Locked, cornerType = CornerType.WALL_WALL)
        assertEquals("Corner confirmed. Ready to measure.", arCopy(wall(ScanStage.SURFACE_CONFIRMED, assist = locked)).headline)
        // During detection, corner states are ignored — the surface comes first.
        assertEquals("Surface detected.", arCopy(wall(ScanStage.SURFACE_DETECTED, assist = locked)).headline)
    }

    @Test
    fun `ceiling copy names the ceiling`() {
        val copy = arCopy(
            ArUiState(surfaceType = SurfaceType.CEILING, phase = ArPhase.SearchingForSurface, scanStage = ScanStage.SCAN_SURFACE)
        )
        assertEquals("Point your camera at the ceiling.", copy.headline)
    }

    @Test
    fun `transient message wins`() {
        val copy = arCopy(wall(ScanStage.SURFACE_CONFIRMED).copy(transientMessage = "Keep the reticle on the same wall"))
        assertEquals("Try again", copy.headline)
    }

    @Test
    fun `stage label is numbered`() {
        assertEquals("Step 4 of 6 · Confirmed", stageLabel(ScanStage.SURFACE_CONFIRMED))
    }

    @Test
    fun `quick measure walks top-left, top-right, bottom`() {
        fun q(step: MeasureStep) = arCopy(wall(ScanStage.MEASURE, step = step, phase = ArPhase.Ready).copy(quickMode = true))
        assertTrue(q(MeasureStep.WidthStart).headline.contains("Top-left"))
        assertTrue(q(MeasureStep.WidthEnd).headline.contains("Top-right"))
        assertTrue(q(MeasureStep.Height).headline.contains("Bottom"))
    }
}
