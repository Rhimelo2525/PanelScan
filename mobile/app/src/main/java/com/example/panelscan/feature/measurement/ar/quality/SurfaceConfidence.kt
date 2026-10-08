package com.example.panelscan.feature.measurement.ar.quality

/** Camera tracking as the confidence model sees it. */
enum class TrackingQuality { NOT_TRACKING, TRACKING }

/** ARCore's reason for not tracking, reduced to what the model needs. */
enum class TrackingProblem { NONE, INITIALIZING, EXCESSIVE_MOTION, INSUFFICIENT_LIGHT, INSUFFICIENT_FEATURES, CAMERA_UNAVAILABLE, OTHER }

/**
 * The single most useful thing to tell the customer right now. Ordered by the pipeline, not
 * alphabetically: [TOO_BRIGHT] and [TRACKING_DIFFICULT] are deliberately different — a
 * blown-out frame is a lighting problem, not a "plain surface" problem.
 */
enum class ScanIssue {
    NONE,
    INITIALIZING,
    CAMERA_UNAVAILABLE,
    MOVING_TOO_FAST,
    TOO_DARK,
    TOO_BRIGHT,
    /** Tracking is struggling for visual features and exposure is fine: truly low texture. */
    TRACKING_DIFFICULT,
    /** Tracking is fine but no surface of the selected orientation has been found yet. */
    NO_SURFACE_YET,
    /** Searching for a while on a low-texture surface; offer the plain-wall workflow. */
    SURFACE_DIFFICULT,
    /** A retained anchor/measurement point has no usable tracked pose right now. */
    SURFACE_TRACKING_LOST,
    /** The reticle is on a floor while measuring a wall, etc. */
    WRONG_ORIENTATION,
    /** A surface is locked, but the reticle is on something else (another wall, the floor). */
    OFF_SURFACE,
    OUT_OF_RANGE
}

enum class ConfidenceLevel { NONE, LOW, MEDIUM, HIGH }

/** Everything the controller observed this sample, as plain values. */
data class SurfaceSignals(
    val tracking: TrackingQuality,
    val trackingProblem: TrackingProblem = TrackingProblem.NONE,
    /** An ARCore plane of the selected orientation is under (or next to) the reticle. */
    val trackedPlaneMatches: Boolean = false,
    /** A depth-fitted plane of the selected orientation is under the reticle. */
    val depthPlaneMatches: Boolean = false,
    val depthFitResidual: Float? = null,
    val depthSupported: Boolean = false,
    /** Something of the *wrong* orientation is what the reticle actually hits. */
    val wrongOrientation: Boolean = false,
    val surfaceLocked: Boolean = false,
    val surfaceTrackingLost: Boolean = false,
    /** 0..1 progress towards a lock, from [SurfaceLockTracker]. */
    val lockStability: Float = 0f,
    /** The reticle's real surface disagrees with the locked plane. */
    val offLockedSurface: Boolean = false,
    /** The locked plane intersection exists and is within measuring range. */
    val lockedHitInRange: Boolean = false,
    val lighting: LightingCondition = LightingCondition.UNKNOWN,
    val texture: TextureLevel = TextureLevel.UNKNOWN,
    val cameraSpeedMetresPerSecond: Float = 0f,
    val cameraTurnDegreesPerSecond: Float = 0f,
    /** How long the scanner has looked without detecting any matching surface. */
    val searchingMillis: Long = 0L
)

/**
 * Component scores are 0..1 and exist so diagnostics can explain a decision. Only
 * [measurementAllowed] gates anything, and it never depends on texture alone.
 */
data class SurfaceAssessment(
    val tracking: Float,
    val plane: Float,
    val depth: Float,
    val geometry: Float,
    val feature: Float,
    val overall: Float,
    val level: ConfidenceLevel,
    val measurementAllowed: Boolean,
    val issue: ScanIssue
)

/**
 * Multi-signal confidence model for "can this surface be measured right now?".
 *
 * The rule the client asked for, stated plainly:
 *
 *   camera tracking is stable
 *   AND the surface is locked (confirmed from a tracked plane or consistent depth)
 *   AND the reticle is actually on that surface (orientation + same plane)
 *   AND the camera is not being swung around
 *   → allow measurement, **even when visual texture is low**.
 *
 * Texture and exposure only choose the message. That is the fix for plain and white walls
 * being rejected as "too plain" when ARCore's geometry was in fact good enough.
 */
object SurfaceConfidenceModel {

    const val FAST_MOVE_METRES_PER_SECOND = 0.9f
    const val FAST_TURN_DEGREES_PER_SECOND = 80f

    /** After this long without any matching surface on a low-texture view, offer help. */
    const val DIFFICULT_AFTER_MILLIS = 6_000L

    fun assess(s: SurfaceSignals): SurfaceAssessment {
        val trackingScore = when {
            s.tracking != TrackingQuality.TRACKING -> 0f
            movingTooFast(s) -> 0.4f
            else -> 1f
        }
        val planeScore = if (s.trackedPlaneMatches) 1f else 0f
        val depthScore = when {
            !s.depthPlaneMatches -> 0f
            s.depthFitResidual == null -> 0.6f
            else -> (1f - s.depthFitResidual / 0.02f).coerceIn(0.2f, 1f)
        }
        val geometryScore = when {
            s.surfaceLocked && !s.offLockedSurface && !s.wrongOrientation -> 1f
            s.surfaceLocked -> 0.3f
            else -> s.lockStability.coerceIn(0f, 1f) * 0.8f
        }
        val featureScore = when (s.texture) {
            TextureLevel.HIGH -> 1f
            TextureLevel.NORMAL -> 0.8f
            TextureLevel.LOW -> 0.45f
            TextureLevel.VERY_LOW -> 0.2f
            TextureLevel.UNKNOWN -> 0.5f
        }

        val allowed = s.tracking == TrackingQuality.TRACKING &&
            !s.surfaceTrackingLost &&
            !movingTooFast(s) &&
            s.surfaceLocked &&
            s.lockedHitInRange &&
            !s.offLockedSurface &&
            !s.wrongOrientation

        // Feature quality is weighted lightly on purpose; geometry and tracking dominate.
        val overall = if (trackingScore == 0f) 0f else (
            trackingScore * 0.30f +
                maxOf(planeScore, depthScore) * 0.25f +
                geometryScore * 0.35f +
                featureScore * 0.10f
            ).coerceIn(0f, 1f)

        val level = when {
            allowed && overall >= 0.8f -> ConfidenceLevel.HIGH
            allowed -> ConfidenceLevel.MEDIUM
            overall >= 0.3f -> ConfidenceLevel.LOW
            else -> ConfidenceLevel.NONE
        }

        return SurfaceAssessment(
            tracking = trackingScore,
            plane = planeScore,
            depth = depthScore,
            geometry = geometryScore,
            feature = featureScore,
            overall = overall,
            level = level,
            measurementAllowed = allowed,
            issue = issueFor(s)
        )
    }

    private fun movingTooFast(s: SurfaceSignals): Boolean =
        s.cameraSpeedMetresPerSecond > FAST_MOVE_METRES_PER_SECOND ||
            s.cameraTurnDegreesPerSecond > FAST_TURN_DEGREES_PER_SECOND

    private fun bright(s: SurfaceSignals) =
        s.lighting == LightingCondition.OVEREXPOSED

    private fun dark(s: SurfaceSignals) =
        s.lighting == LightingCondition.TOO_DARK

    fun issueFor(s: SurfaceSignals): ScanIssue {
        if (s.tracking != TrackingQuality.TRACKING) {
            return when (s.trackingProblem) {
                TrackingProblem.CAMERA_UNAVAILABLE -> ScanIssue.CAMERA_UNAVAILABLE
                TrackingProblem.EXCESSIVE_MOTION -> ScanIssue.MOVING_TOO_FAST
                TrackingProblem.INSUFFICIENT_LIGHT -> ScanIssue.TOO_DARK
                // ARCore only says "not enough features". Whether that is glare or a truly
                // plain surface is decided from the frame itself.
                TrackingProblem.INSUFFICIENT_FEATURES -> when {
                    bright(s) -> ScanIssue.TOO_BRIGHT
                    dark(s) -> ScanIssue.TOO_DARK
                    else -> ScanIssue.TRACKING_DIFFICULT
                }
                TrackingProblem.INITIALIZING, TrackingProblem.NONE -> when {
                    bright(s) -> ScanIssue.TOO_BRIGHT
                    dark(s) -> ScanIssue.TOO_DARK
                    else -> ScanIssue.INITIALIZING
                }
                TrackingProblem.OTHER -> ScanIssue.INITIALIZING
            }
        }
        if (movingTooFast(s)) return ScanIssue.MOVING_TOO_FAST
        if (s.surfaceTrackingLost) return ScanIssue.SURFACE_TRACKING_LOST
        if (s.surfaceLocked) {
            return when {
                s.wrongOrientation || s.offLockedSurface -> ScanIssue.OFF_SURFACE
                !s.lockedHitInRange -> ScanIssue.OUT_OF_RANGE
                else -> ScanIssue.NONE
            }
        }
        if (s.wrongOrientation && !s.trackedPlaneMatches && !s.depthPlaneMatches) {
            return ScanIssue.WRONG_ORIENTATION
        }
        if (s.trackedPlaneMatches || s.depthPlaneMatches) return ScanIssue.NONE
        // Nothing found yet. Glare first — it is the one the customer can fix fastest.
        if (bright(s)) return ScanIssue.TOO_BRIGHT
        if (dark(s)) return ScanIssue.TOO_DARK
        val plain = s.texture == TextureLevel.VERY_LOW || s.texture == TextureLevel.LOW
        return if (plain && s.searchingMillis >= DIFFICULT_AFTER_MILLIS) {
            ScanIssue.SURFACE_DIFFICULT
        } else {
            ScanIssue.NO_SURFACE_YET
        }
    }
}

/** Why a tap would or would not place a point. */
enum class PlacementBlock { NONE, NOT_READY, SURFACE_NOT_CONFIRMED, OFF_SURFACE, TOO_CLOSE_TO_WIDTH_LINE, COMPLETE }

object MeasurementEligibility {

    /** A height point this close to the width axis is a mis-tap, not a measurement. */
    const val MIN_HEIGHT_METRES = 0.05

    fun check(
        assessment: SurfaceAssessment,
        pointCount: Int,
        surfaceLocked: Boolean,
        provisionalHeightMetres: Double? = null
    ): PlacementBlock = when {
        pointCount >= 3 -> PlacementBlock.COMPLETE
        !surfaceLocked -> PlacementBlock.SURFACE_NOT_CONFIRMED
        assessment.issue == ScanIssue.OFF_SURFACE || assessment.issue == ScanIssue.WRONG_ORIENTATION ->
            PlacementBlock.OFF_SURFACE
        !assessment.measurementAllowed -> PlacementBlock.NOT_READY
        pointCount == 2 && provisionalHeightMetres != null && provisionalHeightMetres < MIN_HEIGHT_METRES ->
            PlacementBlock.TOO_CLOSE_TO_WIDTH_LINE
        else -> PlacementBlock.NONE
    }
}

/** The six customer-facing stages of a scan, in order. */
enum class ScanStage(val label: String) {
    SCAN_SURFACE("Scan"),
    MOVE_SLOWLY("Move slowly"),
    SURFACE_DETECTED("Detected"),
    SURFACE_CONFIRMED("Confirmed"),
    MEASURE("Measure"),
    RESULT("Result");

    val number: Int get() = ordinal + 1
}

object ScanStageResolver {
    /**
     * Stages only move forward with evidence and fall back when it is lost, so the stepper
     * never claims more than the pipeline actually knows.
     */
    fun resolve(
        trackingStarted: Boolean,
        surfaceDetected: Boolean,
        surfaceLocked: Boolean,
        pointCount: Int
    ): ScanStage = when {
        pointCount >= 3 -> ScanStage.RESULT
        pointCount > 0 -> ScanStage.MEASURE
        surfaceLocked -> ScanStage.SURFACE_CONFIRMED
        surfaceDetected -> ScanStage.SURFACE_DETECTED
        trackingStarted -> ScanStage.MOVE_SLOWLY
        else -> ScanStage.SCAN_SURFACE
    }
}
