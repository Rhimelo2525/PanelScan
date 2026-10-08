package com.example.panelscan.feature.measurement.ar

import androidx.compose.runtime.Immutable
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.feature.measurement.ar.quality.ConfidenceLevel
import com.example.panelscan.feature.measurement.ar.quality.LightingCondition
import com.example.panelscan.feature.measurement.ar.quality.ScanEnhancementSettings
import com.example.panelscan.feature.measurement.ar.quality.ScanIssue
import com.example.panelscan.feature.measurement.ar.quality.ScanStage
import com.example.panelscan.feature.measurement.ar.quality.SurfaceEvidenceSource
import com.example.panelscan.feature.measurement.ar.quality.TextureLevel

/**
 * Where the AR session is, from the user's point of view.
 *
 * This is the single gate on whether a point may be placed: only [Ready] permits it, and
 * [Ready] is only reached when the camera is tracking, the surface is confirmed (locked),
 * and the reticle is on that surface.
 */
@Immutable
sealed interface ArPhase {
    /** Session is starting; camera has not produced a usable frame yet. */
    data object Initializing : ArPhase

    /** Tracking is fine but no acceptable surface is under the reticle. */
    data object SearchingForSurface : ArPhase

    /** ARCore reported a tracking problem we can explain to the user. */
    data class TrackingLimited(val reason: ArTrackingIssue) : ArPhase

    /** Camera tracking plus a stable, validated hit — placement is allowed. */
    data object Ready : ArPhase

    /** All points for this surface are placed. */
    data object MeasurementComplete : ArPhase

    /** Unrecoverable-ish failure; the screen shows a message and a way out. */
    data class Error(val message: String) : ArPhase

    val allowsPlacement: Boolean get() = this is Ready
}

/** ARCore's failure reasons, translated into things a person can act on. */
enum class ArTrackingIssue {
    ExcessiveMotion,
    InsufficientLight,
    InsufficientFeatures,
    CameraUnavailable,
    Initializing,
    Unknown
}

/** The guided measurement workflow. Wall and ceiling share the same three-point shape. */
enum class MeasureStep {
    WidthStart,
    WidthEnd,
    Height,
    Complete;

    val pointIndex: Int get() = ordinal
}

/** Reticle appearance, driven only by validated state. */
enum class ReticleState {
    Neutral,
    Active,
    Warning
}

/** Stable customer-workflow states; technical ARCore and CV states stay internal. */
enum class CustomerArState {
    SEARCHING,
    SURFACE_DETECTED,
    LOOKING_FOR_POINT,
    POINT_CANDIDATE,
    POINT_LOCKED,
    MEASURING,
    MEASUREMENT_COMPLETE
}

/**
 * State of the assisted corner finder. Deliberately coarse — an internal score decides
 * these, and no percentage is ever shown to the user.
 */
enum class CornerAssistStatus {
    /** Assist is off, or not running (no tracking, or measurement finished). */
    Idle,

    /** Looking for edges; nothing usable yet. */
    Scanning,

    /**
     * Stage one: the image detector found an intersection. This is never shown to the user
     * as "corner found" — two lines crossing in a picture is not a corner.
     */
    VisualCandidate,

    /**
     * Stage one passed and ARCore accepted the point, but the geometry checks say this is
     * most likely flat surface texture.
     */
    GeometryWeak,

    /** Stage two passed: real geometric evidence, now settling. */
    GeometryConfirmed,

    /** Confirmed, steady and close to the reticle — safe to snap to. */
    Locked,

    /** Searched and found nothing usable — fall back to manual. */
    NotClear
}

/** Debug-only classification of a drawn candidate. */
enum class DebugCandidateKind { ImageOnly, ArValidGeometryWeak, Confirmed, RejectedTexture }

/** A candidate drawn on screen in DEBUG builds, in normalised view coordinates. */
@Immutable
data class DebugCandidate(
    val normalisedX: Float,
    val normalisedY: Float,
    val kind: DebugCandidateKind
)

/** The current corner suggestion, in normalised view coordinates so Compose can place it. */
@Immutable
data class CornerAssistState(
    val status: CornerAssistStatus = CornerAssistStatus.Idle,
    /** 0..1 across the view; only meaningful when status is Good or Locked. */
    val normalisedX: Float = 0.5f,
    val normalisedY: Float = 0.5f,
    val stableMillis: Long = 0,
    val cornerType: CornerType = CornerType.UNKNOWN
) {
    /** Only geometry-backed states get a marker; image evidence alone shows nothing. */
    val hasSuggestion: Boolean
        get() = status == CornerAssistStatus.GeometryConfirmed || status == CornerAssistStatus.Locked
}

/** How much we trust the surface the reticle is on. */
enum class HitConfidence {
    None,

    /** A tracked plane, but not the orientation we expected for this surface type. */
    Mismatched,

    /** A tracked plane of the expected orientation, with a settled pose. */
    Good
}

/** What kind of geometry the current hit landed on. Diagnostics + copy selection. */
enum class HitKind {
    None,
    VerticalPlane,
    HorizontalUpward,
    HorizontalDownward,
    Other
}

/**
 * Everything the AR overlay renders from. Deliberately a value type of primitives and
 * enums so that [androidx.compose.runtime.mutableStateOf]'s structural equality collapses
 * the ~60 identical updates per second the AR frame loop would otherwise produce.
 */
@Immutable
data class ArUiState(
    val surfaceType: SurfaceType = SurfaceType.WALL,
    val phase: ArPhase = ArPhase.Initializing,
    val step: MeasureStep = MeasureStep.WidthStart,
    val confidence: HitConfidence = HitConfidence.None,
    val hitKind: HitKind = HitKind.None,
    val surfaceDetected: Boolean = false,
    val pointCount: Int = 0,
    val widthMeters: Double = 0.0,
    val heightMeters: Double = 0.0,
    val transientMessage: String? = null,
    val assistEnabled: Boolean = true,
    /** Whether the active ARCore camera advertises flash hardware. */
    val torchAvailable: Boolean = false,
    val torchEnabled: Boolean = false,
    val assist: CornerAssistState = CornerAssistState(),
    val debugCandidates: List<DebugCandidate> = emptyList(),
    val diagnostics: ArDiagnostics? = null,
    /** Customer-facing stage: Scan → Move slowly → Detected → Confirmed → Measure → Result. */
    val scanStage: ScanStage = ScanStage.SCAN_SURFACE,
    /** The one problem worth telling the customer about, if any. */
    val issue: ScanIssue = ScanIssue.NONE,
    /** "Surface confirmed": a plane is locked and every point is measured on it. */
    val surfaceLocked: Boolean = false,
    val surfaceSource: SurfaceEvidenceSource? = null,
    /** 0..1 in quarter steps, so the frame loop cannot cause per-frame recomposition. */
    val lockProgress: Float = 0f,
    val lighting: LightingCondition = LightingCondition.UNKNOWN,
    val texture: TextureLevel = TextureLevel.UNKNOWN,
    val confidenceLevel: ConfidenceLevel = ConfidenceLevel.NONE,
    val depthSupported: Boolean = false,
    val enhancement: ScanEnhancementSettings = ScanEnhancementSettings.Default,
    /** Surface type may only change before the first point is placed. */
    val canChangeSurface: Boolean = true,
    val referenceEnabled: Boolean = false,
    val quickMode: Boolean = true,
    val autofocus: Boolean = true,
    val referenceConfigured: Boolean = false,
    val referenceStatus: String = "Reference image off",
    val replaying: Boolean = false
) {
    val areaSquareMeters: Double get() = widthMeters * heightMeters

    val canPlace: Boolean get() = phase.allowsPlacement && step != MeasureStep.Complete

    val canUndo: Boolean get() = pointCount > 0

    val canConfirm: Boolean
        get() = step == MeasureStep.Complete && widthMeters > 0.0 && heightMeters > 0.0 &&
            surfaceLocked && phase !is ArPhase.TrackingLimited && issue != ScanIssue.SURFACE_TRACKING_LOST && !replaying

    val reticle: ReticleState
        get() = when {
            step == MeasureStep.Complete -> ReticleState.Neutral
            assist.status == CornerAssistStatus.Locked && phase is ArPhase.Ready -> ReticleState.Active
            phase is ArPhase.Ready && confidence == HitConfidence.Good -> ReticleState.Active
            phase is ArPhase.Ready -> ReticleState.Warning
            phase is ArPhase.TrackingLimited -> ReticleState.Warning
            else -> ReticleState.Neutral
        }

    val customerState: CustomerArState
        get() = when {
            step == MeasureStep.Complete || phase is ArPhase.MeasurementComplete ->
                CustomerArState.MEASUREMENT_COMPLETE
            assist.status == CornerAssistStatus.Locked -> CustomerArState.POINT_LOCKED
            assist.status == CornerAssistStatus.VisualCandidate ||
                assist.status == CornerAssistStatus.GeometryConfirmed -> CustomerArState.POINT_CANDIDATE
            pointCount > 0 -> CustomerArState.MEASURING
            phase is ArPhase.Ready || surfaceLocked -> CustomerArState.LOOKING_FOR_POINT
            surfaceDetected -> CustomerArState.SURFACE_DETECTED
            else -> CustomerArState.SEARCHING
        }
}

/** Constructed for debug overlays or an explicitly requested diagnostic recording. */
@Immutable
data class ArDiagnostics(
    val cameraTracking: String,
    val failureReason: String,
    val sessionState: String,
    val hitValid: Boolean,
    val hitKind: String,
    val hitDistanceMeters: Float,
    val poseJitterMeters: Float,
    val anchorCount: Int,
    val step: String,
    val fps: Int,
    val cvPerSecond: Int,
    val cvMillis: Long,
    val analysisSize: String,
    val lineCount: Int,
    val candidateCount: Int,
    val cornerStatus: String,
    val cornerStableMillis: Long,
    val depthSupported: Boolean,
    val depthActive: Boolean,
    /** Full evidence for the current best candidate, so a false lock can be explained. */
    val evidence: CornerEvidence? = null,
    val surfaceSource: String = "NONE",
    val lockProgress: Float = 0f,
    val depthFitRms: Float? = null,
    val depthFitPoints: Int = 0,
    val confidence: String = "",
    val issue: String = "",
    val lumaMean: Float = 0f,
    val clippedPercent: Float = 0f,
    val texturePercent: Float = 0f,
    val lighting: String = "",
    val gradientThreshold: Int = 0,
    val enhancementGain: Float = 1f,
    val chromaUsed: Boolean = false,
    val cameraSpeed: Float = 0f,
    val cameraTurn: Float = 0f,
    /** Main-thread cost of the per-sample AR work, averaged. */
    val frameWorkMillis: Float = 0f,
    val cameraConfig: String = "",
    val depthTimestampNs: Long = 0L,
    val depthConfidentFraction: Float = 0f,
    val depthInlierFraction: Float = 0f,
    val depthCoverage: Int = 0,
    val localLumaMean: Float = 0f,
    val localClippedPercent: Float = 0f,
    val lockAnchorTracking: String = "NONE",
    val lockUsable: Boolean = false,
    val pointAnchorsTracking: String = "",
    val lockNormal: String = "",
    val trackedPlaneMatches: Boolean = false,
    val reticleBlock: String = "",
    val sessionId: String = "",
    val searchGeneration: Int = 0,
    val lockRecoveries: Int = 0
)
