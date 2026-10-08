package com.example.panelscan.feature.measurement.ar

import androidx.compose.runtime.Immutable
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.feature.measurement.ar.quality.ScanIssue
import com.example.panelscan.feature.measurement.ar.quality.ScanStage

/** Tone drives the status dot colour and the reticle, nothing else. */
enum class ArTone { Neutral, Caution, Good }

/** An inline action the status surface can offer, when one would actually help. */
enum class ArCopyAction { TurnOnLight, TurnOffLight, OpenTools }

@Immutable
data class ArCopy(
    val headline: String,
    val instruction: String,
    val tone: ArTone,
    val action: ArCopyAction? = null
)

/**
 * Plain-language guidance for the current AR state.
 *
 * Every string here is written for someone holding a phone at a wall — ARCore's own
 * vocabulary (TRACKING, INSUFFICIENT_FEATURES) stays in the debug overlay and Logcat.
 *
 * Order matters: a real problem (glare, darkness, moving too fast, aiming at the floor)
 * is explained before the stage copy, and it is named for what it actually is. A blown-out
 * white wall is reported as "Lighting is too bright", never as a plain surface.
 */
fun arCopy(state: ArUiState): ArCopy {
    state.transientMessage?.let {
        return ArCopy(headline = "Try again", instruction = it, tone = ArTone.Caution)
    }

    if (state.quickMode && state.phase == ArPhase.Ready && state.step != MeasureStep.Complete) {
        return when (state.step) {
            MeasureStep.WidthStart -> ArCopy("Step 1 of 3 · Top-left corner",
                "Aim the reticle at the top-left corner and tap.", ArTone.Good)
            MeasureStep.WidthEnd -> ArCopy("Step 2 of 3 · Top-right corner",
                "Move along the top edge to the right corner and tap.", ArTone.Good)
            else -> ArCopy("Step 3 of 3 · Bottom corner",
                "From the right point, aim straight down to the bottom corner and tap. That's it.", ArTone.Good)
        }
    }

    if (state.referenceEnabled && !state.surfaceLocked && state.phase !is ArPhase.Error && state.phase !is ArPhase.TrackingLimited) {
        return ArCopy(headline = "Reference-assisted scanning", instruction = state.referenceStatus +
            ". Keep the flat print in view; aim only at the same unobstructed surface.", tone = ArTone.Caution)
    }

    val surface = if (state.surfaceType == SurfaceType.WALL) "wall" else "ceiling"

    val phase = state.phase
    if (phase is ArPhase.Error) {
        return ArCopy(headline = "AR unavailable", instruction = phase.message, tone = ArTone.Caution)
    }
    if (phase == ArPhase.Initializing) {
        return ArCopy(
            headline = "Starting camera",
            instruction = "Point your camera at the $surface and give it a moment.",
            tone = ArTone.Neutral
        )
    }
    if ((state.step == MeasureStep.Complete || phase == ArPhase.MeasurementComplete) &&
        phase !is ArPhase.TrackingLimited && state.issue != ScanIssue.SURFACE_TRACKING_LOST) {
        return ArCopy(
            headline = "Measurement ready",
            instruction = "Check the numbers, then continue to your estimate.",
            tone = ArTone.Good
        )
    }

    issueCopy(state, surface)?.let { return it }

    return when (state.scanStage) {
        ScanStage.SCAN_SURFACE -> ArCopy(
            headline = "Point your camera at the $surface.",
            instruction = "Keep the entire surface visible.",
            tone = ArTone.Neutral
        )
        ScanStage.MOVE_SLOWLY -> ArCopy(
            headline = "Scanning surface...",
            instruction = "Move your phone slowly from side to side. Keep the entire surface visible.",
            tone = ArTone.Neutral
        )
        ScanStage.SURFACE_DETECTED -> ArCopy(
            headline = "Surface detected.",
            instruction = "Hold steady while the $surface is confirmed. If it doesn't lock, move closer to the corners.",
            tone = ArTone.Neutral
        )
        ScanStage.SURFACE_CONFIRMED -> cornerCopy(state) ?: ArCopy(
            headline = "Surface confirmed.",
            instruction = "Move toward a corner for assistance, or aim at any edge and tap to measure.",
            tone = ArTone.Good
        )
        ScanStage.MEASURE -> cornerCopy(state) ?: when (state.step) {
            MeasureStep.WidthEnd -> ArCopy(
                headline = "Measure the width",
                instruction = "Aim at the other edge of the area and tap.",
                tone = ArTone.Good
            )
            MeasureStep.Height -> ArCopy(
                headline = "Measure the height",
                instruction = "Aim straight up or down from the width line and tap.",
                tone = ArTone.Good
            )
            else -> ArCopy(
                headline = "Surface confirmed.",
                instruction = "Tap to measure.",
                tone = ArTone.Good
            )
        }
        ScanStage.RESULT -> ArCopy(
            headline = "Measurement ready",
            instruction = "Check the numbers, then continue to your estimate.",
            tone = ArTone.Good
        )
    }
}

private fun issueCopy(state: ArUiState, surface: String): ArCopy? = when (state.issue) {
    ScanIssue.NONE, ScanIssue.NO_SURFACE_YET -> null
    ScanIssue.INITIALIZING -> ArCopy(
        headline = "Point your camera at the $surface.",
        instruction = "Move your phone slowly from side to side.",
        tone = ArTone.Neutral
    )
    ScanIssue.CAMERA_UNAVAILABLE -> ArCopy(
        headline = "Camera busy",
        instruction = "Another app is using the camera.",
        tone = ArTone.Caution
    )
    ScanIssue.MOVING_TOO_FAST -> ArCopy(
        headline = "Move more slowly",
        instruction = "Move your phone slowly from side to side.",
        tone = ArTone.Caution
    )
    ScanIssue.TOO_DARK -> ArCopy(
        headline = "Too dark to scan",
        instruction = when {
            state.torchEnabled -> "The light is on — move somewhere brighter if this persists."
            state.torchAvailable -> "Turn on the flashlight or switch on the room lights."
            else -> "Switch on the room lights or move to a brighter area."
        },
        tone = ArTone.Caution,
        action = if (state.torchAvailable && !state.torchEnabled) ArCopyAction.TurnOnLight else null
    )
    ScanIssue.TOO_BRIGHT -> ArCopy(
        headline = "Lighting is too bright.",
        instruction = if (state.torchEnabled) {
            "Turn off the flashlight, and try reducing direct light."
        } else {
            "Move sideways to avoid the reflection, or reduce direct light."
        },
        tone = ArTone.Caution,
        action = if (state.torchEnabled) ArCopyAction.TurnOffLight else null
    )
    ScanIssue.TRACKING_DIFFICULT -> ArCopy(
        headline = "Camera tracking lost",
        instruction = if (state.referenceEnabled) {
            "Use even room lighting and move slowly sideways with the matte reference print fully visible."
        } else if (!state.depthSupported) {
            "Move slowly sideways near an edge or textured area. This phone has no depth fallback; try a matte reference print."
        } else {
            "Move slowly sideways near an edge or textured area. Avoid reflections; a matte reference print may help."
        },
        tone = ArTone.Caution,
        action = if (!state.referenceEnabled && state.pointCount == 0) ArCopyAction.OpenTools else null
    )
    ScanIssue.SURFACE_DIFFICULT -> ArCopy(
        headline = "Surface is difficult to detect.",
        instruction = "Start near an edge or trim, then move slowly sideways. Try reference assistance in AR tools if needed.",
        tone = ArTone.Caution,
        action = if (!state.referenceEnabled && state.pointCount == 0) ArCopyAction.OpenTools else null
    )
    ScanIssue.SURFACE_TRACKING_LOST -> ArCopy(
        headline = "Recovering $surface tracking",
        instruction = if (state.pointCount > 0) {
            "Keep the same $surface in view. Your points are kept; if tracking does not return, use Reset and measure again."
        } else {
            "Hold the $surface and a textured edge in view. An unavailable lock is cleared before checking fresh surface evidence."
        },
        tone = ArTone.Caution
    )
    ScanIssue.WRONG_ORIENTATION -> if (state.surfaceType == SurfaceType.WALL) {
        ArCopy(
            headline = if (state.hitKind == HitKind.HorizontalDownward) "That looks like the ceiling" else "That looks like the floor",
            instruction = "Point your camera at the wall itself.",
            tone = ArTone.Caution
        )
    } else {
        ArCopy(
            headline = if (state.hitKind == HitKind.VerticalPlane) "That looks like a wall" else "That looks like the floor",
            instruction = "Point your camera up at the ceiling.",
            tone = ArTone.Caution
        )
    }
    ScanIssue.OFF_SURFACE -> ArCopy(
        headline = "Off the confirmed $surface",
        instruction = "Keep the reticle on the same $surface you confirmed.",
        tone = ArTone.Caution
    )
    ScanIssue.OUT_OF_RANGE -> ArCopy(
        headline = "Move a little closer",
        instruction = "Stay within about 8 metres of the $surface.",
        tone = ArTone.Caution
    )
}

/** Corner Assist is optional; its copy only appears once the surface is confirmed. */
private fun cornerCopy(state: ArUiState): ArCopy? = when (state.assist.status) {
    CornerAssistStatus.Locked -> ArCopy(
        headline = "Corner confirmed. Ready to measure.",
        instruction = "Tap to place the point at this ${state.assist.cornerType.describe()}.",
        tone = ArTone.Good
    )
    CornerAssistStatus.GeometryConfirmed -> ArCopy(
        headline = "Corner detected.",
        instruction = "Hold steady while the corner is checked across several frames.",
        tone = ArTone.Good
    )
    CornerAssistStatus.VisualCandidate -> ArCopy(
        headline = "Checking corner...",
        instruction = "Keep the corner inside the marker. You can also tap to measure here.",
        tone = ArTone.Neutral
    )
    else -> null
}

/** "Step 3 of 6 · Detected" — the stepper's text alternative. */
fun stageLabel(stage: ScanStage): String = "Step ${stage.number} of ${ScanStage.entries.size} · ${stage.label}"

/** Minimal progress line for the measuring points. */
fun stepLabel(step: MeasureStep): String = when (step) {
    MeasureStep.WidthStart -> "Point A"
    MeasureStep.WidthEnd -> "Point B · width"
    MeasureStep.Height -> "Height point"
    MeasureStep.Complete -> "Review"
}

private fun CornerType.describe(): String = when (this) {
    CornerType.WALL_WALL -> "wall corner"
    CornerType.WALL_FLOOR -> "wall and floor corner"
    CornerType.WALL_CEILING -> "wall and ceiling corner"
    CornerType.UNKNOWN -> "corner"
}
