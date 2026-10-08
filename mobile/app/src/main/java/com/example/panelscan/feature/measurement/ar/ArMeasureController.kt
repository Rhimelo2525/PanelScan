package com.example.panelscan.feature.measurement.ar

import android.os.SystemClock
import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.graphics.Bitmap
import android.net.Uri
import java.io.File
import com.google.ar.core.AugmentedImage
import com.google.ar.core.AugmentedImageDatabase
import com.example.panelscan.feature.measurement.ar.quality.DepthPatchSampler
import com.example.panelscan.feature.measurement.ar.diagnostics.ArSessionRecorder
import android.util.Log
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.feature.measurement.ar.cv.CornerAssistant
import com.example.panelscan.feature.measurement.ar.cv.ScreenCorner
import com.example.panelscan.feature.measurement.ar.cv.VisionPreviewFrame
import com.example.panelscan.feature.measurement.ar.quality.ConfidenceLevel
import com.example.panelscan.feature.measurement.ar.quality.LockPhase
import com.example.panelscan.feature.measurement.ar.quality.LockedSurface
import com.example.panelscan.feature.measurement.ar.quality.MeasurementEligibility
import com.example.panelscan.feature.measurement.ar.quality.PlaneFitResult
import com.example.panelscan.feature.measurement.ar.quality.PlaneFitter
import com.example.panelscan.feature.measurement.ar.quality.PlacementBlock
import com.example.panelscan.feature.measurement.ar.quality.ScanEnhancementSettings
import com.example.panelscan.feature.measurement.ar.quality.ScanIssue
import com.example.panelscan.feature.measurement.ar.quality.ScanStageResolver
import com.example.panelscan.feature.measurement.ar.quality.SurfaceAssessment
import com.example.panelscan.feature.measurement.ar.quality.SurfaceConfidenceModel
import com.example.panelscan.feature.measurement.ar.quality.SurfaceEvidenceSource
import com.example.panelscan.feature.measurement.ar.quality.SurfaceLockTracker
import com.example.panelscan.feature.measurement.ar.quality.SurfaceLockRecovery
import com.example.panelscan.feature.measurement.ar.quality.SurfaceMath
import com.example.panelscan.feature.measurement.ar.quality.SurfaceObservation
import com.example.panelscan.feature.measurement.ar.quality.SurfaceOrientation
import com.example.panelscan.feature.measurement.ar.quality.SurfaceOrientationClassifier
import com.example.panelscan.feature.measurement.ar.quality.SurfaceSignals
import com.example.panelscan.feature.measurement.ar.quality.TrackingProblem
import com.example.panelscan.feature.measurement.ar.quality.TrackingQuality
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.StateFlow
import com.google.ar.core.Anchor
import com.google.ar.core.CameraConfig
import com.google.ar.core.CameraConfigFilter
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.TrackingState
import dev.romainguy.kotlin.math.Float3
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.node.CubeNode
import io.github.sceneview.node.SphereNode
import java.util.EnumSet
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

private const val TAG = "ArMeasure"

/** Hit tests run at ~15Hz rather than every frame; the reticle cannot move meaningfully faster. */
private const val SAMPLE_INTERVAL_MS = 66L

/** Consecutive samples required before the reticle flips state, to stop it strobing. */
private const val VALID_STREAK_TO_ARM = 2
private const val INVALID_STREAK_TO_DISARM = 4

/** A hit closer or further than this is not a surface we can trust. */
private const val MIN_HIT_DISTANCE_M = 0.25f
private const val MAX_HIT_DISTANCE_M = 8.0f

/** Surface evidence older than this no longer counts as "surface detected". */
private const val DETECTED_HOLD_MS = 900L

/** Depth samples are reused for this long rather than re-hit-tested every tick. */
private const val DEPTH_REUSE_MS = 250L

/** A suggestion further than this from the reticle is not what the user is aiming at. */
private const val CONSIDER_RADIUS_PX = 130f

/** Tighter still to actually snap, so a lock never surprises the user. */
private const val LOCK_RADIUS_PX = 72f

/** Shorter edges than this are texture marks, not architecture (analysis pixels of 320). */
private const val MIN_STRUCTURAL_LENGTH_PX = 46f

/** Supporting pixels per unit length; low means a dashed or fragmented edge. */
private const val MIN_LINE_DENSITY = 0.35f

/** Score a candidate must reach before it may be offered at all. */
private const val MIN_CONFIRM_SCORE = 3.0f

/** Score required to actually lock. */
private const val MIN_LOCK_SCORE = 4.2f

private const val REPETITION_PENALTY = 2.5f

/** How long a candidate must hold the same world position before it can be snapped to. */
private const val CORNER_LOCK_MS = 420L

/** Movement below this counts as the same corner rather than a new one. */
private const val STABILITY_RADIUS_M = 0.05f

/** How level a candidate must be with point one to count as the same horizontal edge. */
private const val EDGE_ALIGN_TOLERANCE_M = 0.18f

/** A corner further than this off the locked surface is on some other surface. */
private const val CORNER_OFF_LOCK_M = 0.08f

/** Cap on hit tests per assist tick; each one costs, and the nearest few decide it. */
private const val MAX_CANDIDATES_PER_TICK = 3

/**
 * Owns every AR resource for one visit to the measurement screen: the [ARSceneView]
 * reference, the ARCore anchors and their scene nodes.
 *
 * Deliberately NOT a ViewModel. ARCore anchors are handles into the native session; when
 * they outlive the session — which is exactly what happens if they sit in an
 * Activity-scoped ViewModel — reading `anchor.pose` reads freed memory. The controller is
 * created and released alongside the composable, and hands the ViewModel plain numbers.
 *
 * ## Surface pipeline
 *
 * 1. **Evidence** under the reticle each sample, from two independent sources:
 *    an ARCore-tracked plane of the selected orientation, and — on devices with the
 *    Depth API — a confidence-filtered metric patch with consensus outlier rejection.
 *    Availability and reliability depend on the phone and surface.
 * 2. **Lock** ("Surface confirmed") once the evidence agrees with itself for a short
 *    window ([SurfaceLockTracker]). The lock is held as an ARCore anchor so it follows
 *    ARCore's map corrections.
 * 3. **Measure** by intersecting the centre ray with the locked plane. The point no longer
 *    needs to fall inside ARCore's (often tiny) polygon on a plain wall — only camera
 *    tracking must be good and the reticle must actually be on that surface.
 * 4. **Gate** with [SurfaceConfidenceModel]: tracking, geometry and orientation decide;
 *    visual texture only chooses the guidance message.
 */
class ArMeasureController(
    surfaceType: SurfaceType,
    private val debug: Boolean,
    private val scope: CoroutineScope,
    val recorder: ArSessionRecorder,
    private val playbackFile: File? = null,
    private val onPointPlaced: () -> Unit,
    private val onCornerLocked: () -> Unit = {},
    private val onSurfaceConfirmed: () -> Unit = {},
    /**
     * Experimental: place the point automatically once a corner has held still. Off by
     * default — a measurement should not commit itself without the user saying so.
     */
    private val autoConfirmCorners: Boolean = false
) {

    private var surfaceType: SurfaceType = surfaceType

    private val _state = mutableStateOf(ArUiState(surfaceType = surfaceType))

    /** Structural equality on [ArUiState] collapses the identical per-frame updates. */
    val state: State<ArUiState> get() = _state

    private var sceneView: ARSceneView? = null
    private var released = false

    private val placed = mutableListOf<PlacedPoint>()
    private var guideNodes = mutableListOf<CubeNode>()

    // Sampling / hysteresis
    private var lastSampleAt = 0L
    private var validStreak = 0
    private var invalidStreak = 0
    private var currentHit: ValidatedHit? = null
    /** Quick measure: point-to-point 3D distance, no surface lock or corner search. */
    private var quickMode = true
    private var transientMessageUntil = 0L

    // Surface lock
    private val lockTracker = SurfaceLockTracker()
    private val lockRecovery = SurfaceLockRecovery()
    private val diagnosticSessionId = java.util.UUID.randomUUID().toString()
    private var searchGeneration = 0
    private var lockRecoveryCount = 0
    private val sessionId = java.util.UUID.randomUUID().toString().take(8)
    private var lockAnchor: Anchor? = null
    private var lockSource: SurfaceEvidenceSource? = null
    private var lockProgress = 0f
    private var lastEvidenceAt = 0L
    private var everTracked = false
    private var searchingSince = 0L
    private var lastAssessment: SurfaceAssessment? = null

    // Depth
    private var depthSupported = false
    private var depthActive = false
    private var lastDepth: DepthSurface? = null
    private val depthSampler = DepthPatchSampler()
    private var depthTimestampNs = 0L
    private var depthConfidentFraction = 0f
    private var depthInlierFraction = 0f
    private var depthCoverage = 0
    private var playbackConfigured = false
    private var referenceEnabled = false
    private var referenceConfigured = false
    private var referenceDatabaseFile: File? = null
    private var referenceWidthMetres: Float? = null
    private var referenceStatus = "Reference image off"
    private var referenceAt = 0L
    private var referenceObservation: SurfaceObservation? = null
    private var trackedObservation: SurfaceObservation? = null
    private var pendingRecordEvent: String? = null
    private var cameraConfigLabel = "default"

    // Camera motion, smoothed
    private var lastCameraAt = 0L
    private val lastCameraT = FloatArray(3)
    private val lastCameraQ = FloatArray(4)
    private var cameraSpeed = 0f
    private var cameraTurn = 0f

    // Assisted corner detection
    private val assistant = CornerAssistant(scope, debug)
    val visionPreview: StateFlow<VisionPreviewFrame?> get() = assistant.preview
    private var candidateCount = 0
    private var assistStatus = CornerAssistStatus.Idle
    private var lockedCorner: LockedCorner? = null
    private var lastCornerAnalysisSequence = 0L
    private var lastCornerEvidenceAt = 0L
    private var lastLockAnchorAttemptAt = 0L
    private var snappedHit: ValidatedHit? = null
    private var assistEnabled = true
    private var torchAvailable = false
    private var torchEnabled = false
    private var latestEvidence: CornerEvidence? = null
    private var debugCandidates: List<DebugCandidate> = emptyList()
    private var enhancement = ScanEnhancementSettings.Default

    // Diagnostics
    private var frameCount = 0
    private var lastCountedCameraTimestampNs = 0L
    private var fpsWindowStart = 0L
    private var fps = 0
    private var workMillisAvg = 0f

    private class PlacedPoint(val anchor: Anchor, val node: AnchorNode)

    /** A suggestion that has survived AR validation and is being watched for steadiness. */
    private class LockedCorner(
        val world: Float3,
        val viewX: Float,
        val viewY: Float,
        val since: Long,
        val hit: ValidatedHit,
        val cornerType: CornerType,
        val confirmedFrames: Int
    )

    private class ValidatedHit(
        val hit: HitResult?,
        val plane: Plane?,
        val position: Float3,
        val kind: HitKind,
        val confidence: HitConfidence,
        val distance: Float,
        /** The geometric plane this point lies on, for same-surface checks. */
        val surface: PlaneSignature
    )

    /** A plane fitted to depth hits around the reticle. */
    private class DepthSurface(
        val fit: PlaneFitResult,
        val orientation: SurfaceOrientation,
        val matches: Boolean,
        val centreDistance: Float?,
        /** Residual rescaled to the 1.5 m noise level, so one threshold works at any range. */
        val normalisedResidual: Float,
        val at: Long,
        val evidenceId: Long,
        val source: SurfaceEvidenceSource
    )

    // ---------------------------------------------------------------- setup

    /**
     * Called once from the AndroidView factory. Configures the session and wires callbacks;
     * everything here is idempotent-safe because the factory runs a single time per screen.
     */
    fun attach(view: ARSceneView) {
        sceneView = view

        view.sessionConfiguration = { session, config ->
            config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
            config.focusMode = Config.FocusMode.AUTO
            config.lightEstimationMode = Config.LightEstimationMode.AMBIENT_INTENSITY
            config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
            // Depth is the plain-wall fallback: with it enabled, hit tests return DepthPoint
            // results on surfaces ARCore has not turned into a plane yet. Where the device
            // does not offer it the tracked-plane workflow is unchanged.
            depthSupported = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
            if (depthSupported) {
                config.depthMode = Config.DepthMode.AUTOMATIC
            }

            // Query the actual ARCore-selected camera. Session.isSupported() is deprecated
            // and always true, so it cannot establish whether a flashlight exists.
            torchAvailable = playbackFile == null && runCatching {
                val cameras = view.context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
                cameras.getCameraCharacteristics(session.cameraConfig.cameraId)
                    .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }.getOrDefault(false)
            config.flashMode = Config.FlashMode.OFF
            if (!playbackConfigured) playbackFile?.let {
                val databaseFile = File(it.parentFile, "reference.imgdb")
                if (databaseFile.exists()) {
                    databaseFile.inputStream().use { input -> config.augmentedImageDatabase = AugmentedImageDatabase.deserialize(session, input) }
                    referenceConfigured = true; referenceEnabled = true
                    referenceStatus = "Show the recorded reference print"
                }
                session.setPlaybackDatasetUri(Uri.fromFile(it)); playbackConfigured = true
            }
            update { it.copy(replaying = playbackFile != null) }
        }

        view.onSessionFailed = { error ->
            Log.e(TAG, "AR session failed", error)
            update {
                it.copy(phase = ArPhase.Error(sessionErrorMessage(error)))
            }
        }

        view.onSessionUpdated = { session, frame -> onFrame(session, frame) }
    }

    /**
     * Passed to [ARSceneView] as its camera-config selector. Prefers a configuration that
     * uses a hardware depth sensor (time-of-flight), then a stereo pair, at 30 fps. These may improve depth evidence; actual support and reliability vary by device.
     * Falls back to ARCore's default everywhere else.
     */
    fun selectCameraConfig(session: Session): CameraConfig {
        val fallback = session.cameraConfig
        fun pick(filter: CameraConfigFilter.() -> CameraConfigFilter): CameraConfig? = runCatching {
            session.getSupportedCameraConfigs(
                CameraConfigFilter(session)
                    .setTargetFps(EnumSet.of(CameraConfig.TargetFps.TARGET_FPS_30))
                    .filter()
            ).firstOrNull()
        }.getOrNull()

        pick { setDepthSensorUsage(EnumSet.of(CameraConfig.DepthSensorUsage.REQUIRE_AND_USE)) }?.let {
            cameraConfigLabel = "depth sensor"
            return it
        }
        pick { setStereoCameraUsage(EnumSet.of(CameraConfig.StereoCameraUsage.REQUIRE_AND_USE)) }?.let {
            cameraConfigLabel = "stereo"
            return it
        }
        cameraConfigLabel = "default"
        return fallback
    }

    /**
     * Per-frame entry point. Runs on the main thread via SceneView's Choreographer callback,
     * so it must stay cheap: sampling is throttled, depth probes are reused, and the state is
     * deduped structurally.
     */
    private fun onFrame(session: Session, frame: Frame) {
        if (released) return

        countFrame(frame.timestamp)

        val now = SystemClock.uptimeMillis()
        if (now - lastSampleAt < SAMPLE_INTERVAL_MS) return
        lastSampleAt = now

        val started = System.nanoTime()
        try {
            sample(session, frame, now)
            recorder.sample(session, frame, _state.value, pendingRecordEvent)
            pendingRecordEvent = null
            if (playbackFile != null && session.playbackStatus == com.google.ar.core.PlaybackStatus.FINISHED) {
                currentHit = null
                update { it.copy(phase = ArPhase.Error("Replay finished. Return to live camera or replay another recording.")) }
            }
        } finally {
            val ms = (System.nanoTime() - started) / 1_000_000f
            workMillisAvg = if (workMillisAvg == 0f) ms else workMillisAvg * 0.85f + ms * 0.15f
        }
    }

    private fun sample(session: Session, frame: Frame, now: Long) {
        val camera = frame.camera
        val tracking = camera.trackingState
        val quality = assistant.snapshot.quality

        // Frame quality is analysed even while tracking is limited: that is exactly when the
        // customer needs to hear "too bright" rather than "plain surface". Corner detection
        // itself only runs once there is a confirmed surface to snap onto.
        val lockReady = lockAnchor != null
        assistant.submitFrame(
            frame,
            detectCorners = tracking == TrackingState.TRACKING && assistEnabled && placed.size < 3 && lockReady,
            viewWidth = sceneView?.width ?: 0,
            viewHeight = sceneView?.height ?: 0
        )

        if (tracking != TrackingState.TRACKING) {
            onTrackingLimited(session, camera.trackingFailureReason, tracking, quality, now)
            return
        }

        val anchorState = lockAnchor?.trackingState
        if (lockRecovery.shouldRestartSearch(
                cameraTracking = true,
                anchorUnavailable = anchorState == TrackingState.PAUSED || anchorState == TrackingState.STOPPED,
                pointCount = placed.size,
                nowMs = now
            )) {
            // No placed points: release an unusable anchor, then start normal geometric
            // confirmation again. A cached depth acquisition still cannot add fresh votes.
            dropLock()
            lastDepth = null
            lastEvidenceAt = 0L
            searchingSince = now
            currentHit = null
            snappedHit = null
            validStreak = 0
            invalidStreak = 0
            clearAssist()
            lockRecoveryCount++
            pendingRecordEvent = "unused_lock_recovery"
        }

        if (!everTracked) {
            everTracked = true
            searchingSince = now
        }
        updateCameraMotion(camera.pose, now)
        updateReferenceImage(session, frame, now)

        val view = sceneView ?: return
        if (view.width <= 0 || view.height <= 0) return
        if (quickMode) { quickFrame(frame, view, now); return }
        val centreX = view.width / 2f
        val centreY = view.height / 2f
        val cameraPos = camera.pose.toWorldPoint()

        // ---- 1. evidence under the reticle
        val planeHit = runCatching { validateHitAt(frame, centreX, centreY) }.getOrNull()
        val projected = if (planeHit?.confidence == HitConfidence.Good) null else {
            runCatching { projectCentreRayToTrackedPlane(session, frame) }.getOrNull()
                // A wall behind the floor the reticle is actually on is not "under" it.
                ?.takeUnless { p -> planeHit != null && planeHit.distance < p.distance - occlusionTolerance(p.distance) }
        }
        val trackedEvidence = if (referenceEnabled) null else
            planeHit?.takeIf { it.confidence == HitConfidence.Good } ?: projected

        val depth = if (depthSupported) currentDepthSurface(frame, view, cameraPos, now) else null
        depthActive = depth != null
        val depthMatches = depth?.matches == true && trackedEvidence == null && !referenceEnabled
        // A noisy, slanted depth fit is "unknown", not "wrong": only a definite floor (or
        // wall, in ceiling mode) counts as the customer aiming at the wrong surface.
        val wrongOrientation = !referenceEnabled && trackedEvidence == null && (
            planeHit?.confidence == HitConfidence.Mismatched ||
                (depth != null && !depth.matches && depth.orientation != SurfaceOrientation.SLANTED)
            )

        // ---- 2. lock the surface once the evidence agrees with itself
        val observation = when {
            referenceEnabled -> referenceObservation
            trackedEvidence != null -> SurfaceObservation(
                normal = trackedEvidence.surface.normal(),
                point = trackedEvidence.position.toWorldPoint(),
                source = SurfaceEvidenceSource.TRACKED_PLANE,
                timestampMs = now,
                evidenceId = frame.timestamp
            )
            depthMatches -> SurfaceObservation(
                normal = depth.fit.normal,
                point = depth.fit.centroid,
                source = depth.source,
                timestampMs = depth.at,
                residual = depth.normalisedResidual,
                evidenceId = depth.evidenceId
            )
            else -> null
        }
        trackedObservation = observation?.takeIf { it.source == SurfaceEvidenceSource.TRACKED_PLANE }
        if (observation != null) {
            lastEvidenceAt = now
            val status = lockTracker.observe(observation, allowRelock = placed.isEmpty())
            lockProgress = status.stability
            // ARCore can reject anchor creation transiently even after the evidence
            // tracker confirms a surface. Keep the geometric lock and retry on later
            // tracking frames; newlyLocked is emitted only once by the tracker.
            val pendingLock = status.newlyLocked ?: lockTracker.locked?.takeIf {
                lockAnchor == null && now - lastLockAnchorAttemptAt >= 500L
            }
            if (pendingLock != null) {
                lastLockAnchorAttemptAt = now
                createLockAnchor(session, pendingLock)
            }
            if (status.phase == LockPhase.CONFIRMED && lockAnchor != null) lockProgress = 1f
        } else if (now - lastEvidenceAt > DETECTED_HOLD_MS && lockAnchor == null) {
            lockProgress = 0f
        }

        val lockedPlane = currentLockPlane()
        val surfaceLocked = lockedPlane != null
        val surfaceDetected = surfaceLocked || now - lastEvidenceAt <= DETECTED_HOLD_MS
        if (surfaceDetected) searchingSince = now

        // ---- 3. where a point would land
        val lockedHit = lockedPlane?.let { intersectCentreRay(frame, it) }
        val offLocked = lockedHit != null &&
            reticleIsOffLockedSurface(lockedHit, lockedPlane, planeHit, depth)

        val assisted = if (assistEnabled && lockedPlane != null && placed.size < 3) {
            runCatching { updateCornerAssist(frame, lockedPlane) }.getOrNull()
        } else {
            clearAssist()
            null
        }
        snappedHit = assisted
        val candidate = assisted ?: lockedHit?.takeUnless { offLocked }

        // ---- 4. decide
        val assessment = SurfaceConfidenceModel.assess(
            SurfaceSignals(
                tracking = TrackingQuality.TRACKING,
                trackedPlaneMatches = trackedEvidence != null || (referenceEnabled && referenceObservation != null),
                depthPlaneMatches = depthMatches,
                depthFitResidual = depth?.takeIf { it.matches }?.normalisedResidual,
                depthSupported = depthSupported,
                wrongOrientation = wrongOrientation,
                surfaceLocked = surfaceLocked,
                surfaceTrackingLost = lockAnchor != null && (
                    lockAnchor?.trackingState != TrackingState.TRACKING ||
                        placed.any { it.anchor.trackingState != TrackingState.TRACKING }
                    ),
                lockStability = lockProgress,
                offLockedSurface = offLocked,
                lockedHitInRange = lockedHit != null,
                lighting = assistant.snapshot.reticleQuality.takeIf { it.isKnown }?.lighting ?: quality.lighting,
                texture = quality.texture,
                cameraSpeedMetresPerSecond = cameraSpeed,
                cameraTurnDegreesPerSecond = cameraTurn,
                searchingMillis = now - searchingSince
            )
        )
        lastAssessment = assessment

        val placeable = candidate?.takeIf { assessment.measurementAllowed }
        if (placeable != null) {
            validStreak++
            invalidStreak = 0
        } else {
            invalidStreak++
            if (invalidStreak >= INVALID_STREAK_TO_DISARM) validStreak = 0
        }

        val armed = validStreak >= VALID_STREAK_TO_ARM
        currentHit = if (armed) placeable else null

        // Live anchor poses refine as ARCore learns the room, so the measurement is
        // recomputed from them rather than frozen at placement time.
        val measurement = computeMeasurement()
        val hitKind = planeHit?.kind ?: depth?.orientation?.toHitKind() ?: HitKind.None

        update { current ->
            val step = stepFor(placed.size)
            current.copy(
                surfaceType = surfaceType,
                step = step,
                phase = when {
                    step == MeasureStep.Complete -> ArPhase.MeasurementComplete
                    armed && placeable != null -> ArPhase.Ready
                    else -> ArPhase.SearchingForSurface
                },
                confidence = when {
                    placeable != null -> HitConfidence.Good
                    wrongOrientation -> HitConfidence.Mismatched
                    else -> HitConfidence.None
                },
                hitKind = hitKind,
                surfaceDetected = surfaceDetected,
                pointCount = placed.size,
                widthMeters = measurement.first,
                heightMeters = measurement.second,
                transientMessage = activeTransient(now),
                assistEnabled = assistEnabled,
                torchAvailable = torchAvailable,
                torchEnabled = torchEnabled,
                assist = assistState(),
                debugCandidates = debugCandidates,
                scanStage = ScanStageResolver.resolve(everTracked, surfaceDetected, surfaceLocked, placed.size),
                issue = assessment.issue,
                surfaceLocked = surfaceLocked,
                surfaceSource = lockSource?.takeIf { surfaceLocked },
                lockProgress = if (surfaceLocked) 1f else if (lockAnchor == null) quantise(lockProgress) else 0f,
                lighting = quality.lighting,
                texture = quality.texture,
                confidenceLevel = assessment.level,
                depthSupported = depthSupported,
                enhancement = enhancement,
                canChangeSurface = placed.isEmpty() && !recorder.state.value.recording,
                referenceEnabled = referenceEnabled,
                referenceConfigured = referenceConfigured,
                referenceStatus = referenceStatus,
                diagnostics = diagnostics(session, TrackingState.TRACKING, null, candidate, depth, assessment)
            )
        }

        updateGuides()

        if (autoConfirmCorners && assistStatus == CornerAssistStatus.Locked && armed) {
            placePoint()
        }
    }

    private fun onTrackingLimited(
        session: Session,
        reason: TrackingFailureReason?,
        tracking: TrackingState,
        quality: com.example.panelscan.feature.measurement.ar.quality.FrameQuality,
        now: Long
    ) {
        currentHit = null
        snappedHit = null
        clearAssist()
        validStreak = 0
        lastCameraAt = 0L
        lockTracker.clearSamples()
        lockRecovery.reset()
        lastDepth = null
        depthActive = false
        referenceObservation = null
        trackedObservation = null
        referenceStatus = if (referenceEnabled) "Waiting for camera tracking" else "Reference image off"

        val problem = trackingProblem(reason)
        val assessment = SurfaceConfidenceModel.assess(
            SurfaceSignals(
                tracking = TrackingQuality.NOT_TRACKING,
                trackingProblem = problem,
                surfaceLocked = lockAnchor != null,
                lighting = quality.lighting,
                texture = quality.texture,
                depthSupported = depthSupported
            )
        )
        lastAssessment = assessment
        val issue = trackingIssue(reason)
        update { current ->
            current.copy(
                surfaceType = surfaceType,
                surfaceLocked = false,
                surfaceDetected = false,
                surfaceSource = null,
                lockProgress = 0f,
                phase = if (current.step == MeasureStep.Complete) {
                    ArPhase.MeasurementComplete
                } else {
                    ArPhase.TrackingLimited(issue)
                },
                confidence = HitConfidence.None,
                hitKind = HitKind.None,
                transientMessage = activeTransient(now),
                assistEnabled = assistEnabled,
                torchAvailable = torchAvailable,
                torchEnabled = torchEnabled,
                assist = assistState(),
                debugCandidates = emptyList(),
                scanStage = ScanStageResolver.resolve(
                    everTracked,
                    surfaceDetected = false,
                    surfaceLocked = false,
                    pointCount = placed.size
                ),
                issue = assessment.issue,
                lighting = quality.lighting,
                texture = quality.texture,
                confidenceLevel = ConfidenceLevel.NONE,
                depthSupported = depthSupported,
                enhancement = enhancement,
                canChangeSurface = placed.isEmpty() && !recorder.state.value.recording,
                referenceEnabled = referenceEnabled,
                referenceConfigured = referenceConfigured,
                referenceStatus = referenceStatus,
                diagnostics = diagnostics(session, tracking, reason, null, null, assessment)
            )
        }
    }

    // ------------------------------------------------------------ surface lock

    private fun createLockAnchor(session: Session, lock: LockedSurface) {
        val pose = Pose(
            floatArrayOf(lock.point.x, lock.point.y, lock.point.z),
            SurfaceMath.quaternionFromUpTo(lock.normal)
        )
        val anchor = try {
            session.createAnchor(pose)
        } catch (error: Throwable) {
            Log.w(TAG, "Surface lock anchor failed", error)
            return
        }
        // The previous lock anchor is not attached to any node, so one detach is safe.
        lockAnchor?.let { old -> runCatching { old.detach() } }
        val firstLock = lockAnchor == null
        lockAnchor = anchor
        lockRecovery.reset()
        lockSource = lock.source
        if (firstLock) onSurfaceConfirmed()
    }

    /** The locked plane as it is now — anchors move as ARCore corrects its map. */
    private fun currentLockPlane(): PlaneSignature? {
        if (referenceEnabled && (referenceObservation == null || SystemClock.uptimeMillis() - referenceAt > 250L)) return null
        val now = SystemClock.uptimeMillis()
        val trackedRefresh = trackedObservation?.let { now - it.timestampMs <= 200L && lockTracker.belongsToLock(it) } == true
        if (lockSource?.isDepth == true && !trackedRefresh && (lastDepth == null || now - (lastDepth?.at ?: 0L) > DEPTH_REUSE_MS)) return null
        val anchor = lockAnchor ?: return null
        return when (anchor.trackingState) {
            TrackingState.TRACKING -> {
                if (placed.any { it.anchor.trackingState != TrackingState.TRACKING }) return null
                val pose = anchor.pose
                val normal = FloatArray(3)
                pose.getTransformedAxis(1, 1f, normal, 0)
                if (!SurfaceOrientationClassifier.matches(surfaceType,
                        SurfaceOrientationClassifier.classify(WorldPoint3(normal[0], normal[1], normal[2])))) return null
                lockTracker.refreshLock(
                    WorldPoint3(normal[0], normal[1], normal[2]),
                    WorldPoint3(pose.tx(), pose.ty(), pose.tz())
                )
                PlaneSignature(normal[0], normal[1], normal[2], pose.tx(), pose.ty(), pose.tz())
            }
            TrackingState.PAUSED -> null
            TrackingState.STOPPED -> {
                // Never replace a stopped measurement surface under existing points.
                if (placed.isEmpty()) dropLock()
                null
            }
        }
    }

    private fun dropLock() {
        lockAnchor?.let { runCatching { it.detach() } }
        lockAnchor = null
        lockSource = null
        lockProgress = 0f
        trackedObservation = null
        lockTracker.reset()
        lockRecovery.reset()
        searchGeneration++
    }

    /**
     * Centre ray against the locked plane. Unlike ARCore's own hit test this does not need
     * the reticle to be inside a detected polygon — which on a plain wall may be a small
     * patch — only that camera tracking is good.
     */
    private fun intersectCentreRay(frame: Frame, plane: PlaneSignature): ValidatedHit? {
        val cameraPose = frame.camera.pose
        val direction = FloatArray(3)
        cameraPose.getTransformedAxis(2, -1f, direction, 0)
        val origin = cameraPose.toWorldPoint()
        val intersection = ArMeasurementGeometry.intersectRayWithPlane(
            origin,
            WorldPoint3(direction[0], direction[1], direction[2]),
            plane,
            MIN_HIT_DISTANCE_M,
            MAX_HIT_DISTANCE_M
        ) ?: return null
        return ValidatedHit(
            hit = null,
            plane = null,
            position = Float3(intersection.x, intersection.y, intersection.z),
            kind = if (surfaceType == SurfaceType.WALL) HitKind.VerticalPlane else HitKind.HorizontalDownward,
            confidence = HitConfidence.Good,
            distance = ArMeasurementGeometry.distance(origin, intersection).toFloat(),
            surface = plane
        )
    }

    /**
     * The locked plane is infinite; the real wall is not. When other evidence says the
     * reticle is on something nearer or further (the floor, the adjacent wall, a doorway),
     * the locked intersection would be a point in mid-air, so it must not be offered.
     */
    private fun reticleIsOffLockedSurface(
        lockedHit: ValidatedHit,
        locked: PlaneSignature,
        planeHit: ValidatedHit?,
        depth: DepthSurface?
    ): Boolean {
        val tolerance = occlusionTolerance(lockedHit.distance)
        if (planeHit != null && !ArMeasurementGeometry.areCoplanar(locked, planeHit.surface)) {
            if (abs(planeHit.distance - lockedHit.distance) > tolerance) return true
        }
        val depthDistance = depth?.centreDistance
        if (depthDistance != null && abs(depthDistance - lockedHit.distance) > tolerance * 1.4f) return true
        return false
    }

    private fun occlusionTolerance(distance: Float): Float = max(0.10f, distance * 0.05f)

    // ------------------------------------------------------------------ depth

    private fun currentDepthSurface(frame: Frame, view: ARSceneView, cameraPos: WorldPoint3, now: Long): DepthSurface? {
        lastDepth?.let { if (now - it.at <= DEPTH_REUSE_MS) return it }
        val fresh = runCatching { sampleDepthSurface(frame, view, cameraPos, now) }.getOrNull()
        lastDepth = fresh
        return fresh
    }

    /**
     * Fits a confidence-filtered depth patch around the reticle. Returns null when there is
     * not enough depth, the patch is too small to judge, or the points do not lie on one
     * plane (a corner, furniture, clutter).
     */
    private fun sampleDepthSurface(frame: Frame, view: ARSceneView, cameraPos: WorldPoint3, now: Long): DepthSurface? {
        val patch = depthSampler.sample(frame, view.width, view.height) ?: return null
        depthTimestampNs = patch.timestamp
        depthConfidentFraction = patch.confidentFraction
        depthInlierFraction = patch.inlierFraction
        depthCoverage = patch.coverage
        val fit = patch.fit ?: return null
        val range = patch.centreDistance ?: ArMeasurementGeometry.distance(cameraPos, fit.centroid).toFloat()
        val maxRms = max(0.012f, 0.008f * range)
        val normal = SurfaceOrientationClassifier.orientTowardsCamera(fit.normal, fit.centroid, cameraPos)
        val orientation = SurfaceOrientationClassifier.classify(normal)
        val matches = SurfaceOrientationClassifier.matches(surfaceType, orientation) &&
            (surfaceType != SurfaceType.CEILING || fit.centroid.y > cameraPos.y + 0.1f)
        return DepthSurface(fit.copy(normal = normal), orientation, matches, patch.centreDistance,
            fit.rmsResidual * (0.012f / maxRms), now, patch.timestamp, patch.source)
    }

    /** Register the exact source image and the measured printed-image width, never a wall size. */
    fun configureReference(bitmap: Bitmap, widthMetres: Float): Boolean {
        if (released || placed.isNotEmpty() || recorder.state.value.recording || playbackFile != null) return false
        val session = sceneView?.session ?: return false
        if (!widthMetres.isFinite() || widthMetres !in 0.05f..1f || min(bitmap.width, bitmap.height) < 300) {
            showTransient("Use an image at least 300 pixels wide and high, with a measured print width of 5–100 cm")
            return false
        }
        var pendingFile: File? = null
        return runCatching {
            val database = AugmentedImageDatabase(session)
            database.addImage("customer_flat_reference", bitmap, widthMetres)
            val file = File(sceneView!!.context.noBackupFilesDir, "reference_${System.nanoTime()}.imgdb")
            pendingFile = file
            file.outputStream().use { database.serialize(it) }
            val config = session.config
            config.augmentedImageDatabase = database
            session.configure(config)
            referenceDatabaseFile?.delete()
            referenceDatabaseFile = file
            referenceWidthMetres = widthMetres
            referenceConfigured = true
            pendingFile = null
            setReferenceEnabled(true, updateDatabase = false)
        }.getOrElse {
            pendingFile?.delete()
            setReferenceEnabled(false)
            referenceEnabled = false
            referenceConfigured = false
            referenceStatus = "Reference image not configured"
            referenceObservation = null
            referenceDatabaseFile?.delete()
            referenceDatabaseFile = null
            dropLock()
            publishChrome()
            showTransient("Image could not be registered. Choose a detailed photograph with unique features.")
            false
        }
    }

    fun setReferenceEnabled(enabled: Boolean, updateDatabase: Boolean = true): Boolean {
        if (playbackFile != null || placed.isNotEmpty() || recorder.state.value.recording || (enabled && !referenceConfigured)) return false
        if (updateDatabase) {
            val session = sceneView?.session ?: return false
            val applied = runCatching {
                val config = session.config
                config.setAugmentedImageDatabase(if (enabled) referenceDatabaseFile?.inputStream()?.use {
                    AugmentedImageDatabase.deserialize(session, it)
                } ?: error("Reference image database is missing") else null)
                session.configure(config)
            }.isSuccess
            if (!applied) { showTransient("Reference mode could not change. Try reopening AR."); return false }
        }
        referenceEnabled = enabled
        referenceObservation = null
        referenceStatus = if (enabled) "Show the flat reference print" else "Reference image off"
        dropLock(); lastDepth = null; lastEvidenceAt = 0L; currentHit = null; snappedHit = null; validStreak = 0
        update { it.copy(referenceEnabled = enabled, referenceConfigured = referenceConfigured,
            referenceStatus = referenceStatus, surfaceLocked = false, surfaceDetected = false,
            surfaceSource = null, lockProgress = 0f, phase = ArPhase.SearchingForSurface) }
        return true
    }

    private fun updateReferenceImage(session: Session, frame: Frame, now: Long) {
        if (!referenceEnabled) return
        referenceObservation = null
        val image = session.getAllTrackables(AugmentedImage::class.java).firstOrNull {
            it.trackingState == TrackingState.TRACKING && it.trackingMethod == AugmentedImage.TrackingMethod.FULL_TRACKING
        }
        if (image == null) { referenceStatus = "Keep the reference print visible"; return }
        val pose = image.centerPose
        val axis = FloatArray(3)
        pose.getTransformedAxis(1, 1f, axis, 0)
        val point = pose.toWorldPoint()
        val normal = SurfaceOrientationClassifier.orientTowardsCamera(WorldPoint3(axis[0], axis[1], axis[2]), point, frame.camera.pose.toWorldPoint())
        val orientation = SurfaceOrientationClassifier.classify(normal)
        if (!SurfaceOrientationClassifier.matches(surfaceType, orientation) ||
            (surfaceType == SurfaceType.CEILING && point.y <= frame.camera.pose.ty() + 0.1f)) {
            referenceStatus = "Mount the print flat on the selected ${surfaceName()}"; return
        }
        val observation = SurfaceObservation(normal, point, SurfaceEvidenceSource.REFERENCE_IMAGE, now, evidenceId = frame.timestamp)
        if (placed.isNotEmpty() && !lockTracker.belongsToLock(observation)) {
            referenceStatus = "Reference moved. Reset and scan again."; return
        }
        referenceAt = now
        referenceObservation = observation
        referenceStatus = "Reference tracking · keep it visible"
    }

    fun startRecording(roomLight: String) {
        if (playbackFile != null) { showTransient("Return to live camera before recording"); return }
        sceneView?.session?.let { recorder.start(it, roomLight, surfaceType.name, referenceEnabled, torchEnabled, referenceDatabaseFile, referenceWidthMetres) }
            ?: showTransient("Wait for AR to start")
    }
    fun stopRecording() = recorder.stop(sceneView?.session)

    // ------------------------------------------------------------ hit testing

    /**
     * Hit tests one screen point against tracked planes: inside the polygon, the extents, or
     * close to the boundary, at a plausible distance. A plane matching the selected surface
     * beats one that does not; the nearest acceptable plane wins otherwise.
     */
    private fun validateHitAt(frame: Frame, screenX: Float, screenY: Float): ValidatedHit? {
        val hits = frame.hitTest(screenX, screenY)
        var best: HitResult? = null
        var bestPlane: Plane? = null
        val cameraY = runCatching { frame.camera.pose.ty() }.getOrNull()

        for (hit in hits) {
            val trackable = hit.trackable
            if (trackable !is Plane) continue
            if (trackable.trackingState != TrackingState.TRACKING) continue
            if (trackable.subsumedBy != null) continue

            val inPolygon = trackable.isPoseInPolygon(hit.hitPose)
            val inExtents = trackable.isPoseInExtents(hit.hitPose)
            val nearBoundary = !inPolygon && !inExtents &&
                CornerGeometry.distanceToPlaneBoundary(trackable, hit.hitPose.toFloat3()) <= 0.45f
            if (!inPolygon && !inExtents && !nearBoundary) continue
            if (hit.distance < MIN_HIT_DISTANCE_M || hit.distance > MAX_HIT_DISTANCE_M) continue

            val kind = planeKind(trackable, cameraY)
            if (best == null) {
                best = hit
                bestPlane = trackable
            } else if (matchesSurface(kind) && !matchesSurface(planeKind(bestPlane!!, cameraY))) {
                // Only if the matching plane is not hidden behind the nearer one.
                if (hit.distance - best.distance <= occlusionTolerance(best.distance)) {
                    best = hit
                    bestPlane = trackable
                }
            }
        }

        val hit = best ?: return null
        val plane = bestPlane!!
        val kind = planeKind(plane, cameraY)
        return ValidatedHit(
            hit = hit,
            plane = plane,
            position = hit.hitPose.toFloat3(),
            kind = kind,
            confidence = if (matchesSurface(kind)) HitConfidence.Good else HitConfidence.Mismatched,
            distance = hit.distance,
            surface = planeSignature(plane)
        )
    }

    /**
     * A tracked plane remains valid geometry even when ARCore's currently estimated polygon
     * is too small for the centre hit test. Intersect the camera's centre ray with an
     * already tracked, correctly oriented plane near its reported extents. This is evidence
     * for the lock; once locked, the lock plane itself is used without the extents limit.
     */
    private fun projectCentreRayToTrackedPlane(session: Session, frame: Frame): ValidatedHit? {
        val cameraPose = frame.camera.pose
        val direction = FloatArray(3)
        cameraPose.getTransformedAxis(2, -1f, direction, 0)
        val rayOrigin = cameraPose.toWorldPoint()
        val rayDirection = WorldPoint3(direction[0], direction[1], direction[2])

        var best: ValidatedHit? = null
        session.getAllTrackables(Plane::class.java).forEach { plane ->
            if (plane.trackingState != TrackingState.TRACKING || plane.subsumedBy != null) return@forEach
            val kind = planeKind(plane, cameraPose.ty())
            if (!matchesSurface(kind)) return@forEach

            val signature = planeSignature(plane)
            val intersection = ArMeasurementGeometry.intersectRayWithPlane(
                rayOrigin,
                rayDirection,
                signature,
                MIN_HIT_DISTANCE_M,
                MAX_HIT_DISTANCE_M
            ) ?: return@forEach
            val world = floatArrayOf(intersection.x, intersection.y, intersection.z)
            val distance = ArMeasurementGeometry.distance(rayOrigin, intersection).toFloat()
            val local = plane.centerPose.inverse().transformPoint(world)
            val extentAllowance = 0.55f
            if (abs(local[0]) > plane.extentX / 2f + extentAllowance ||
                abs(local[2]) > plane.extentZ / 2f + extentAllowance
            ) return@forEach

            val candidate = ValidatedHit(
                hit = null,
                plane = plane,
                position = Float3(world[0], world[1], world[2]),
                kind = kind,
                confidence = HitConfidence.Good,
                distance = distance,
                surface = signature
            )
            if (best == null || candidate.distance < best!!.distance) best = candidate
        }
        return best
    }

    // ------------------------------------------------------- assisted corners

    /**
     * Two-stage corner assist, now anchored to the locked surface.
     *
     * Stage one is the image detector: an intersection of two long, non-repetitive lines
     * near the reticle. Stage two asks the world whether anything is actually there —
     * plane boundary, plane-normal difference, depth slope break. A candidate can only
     * ever *lock* on stage two, and the snapped point is projected onto the locked surface
     * so every point of one measurement lies on one plane.
     */
    private fun updateCornerAssist(frame: Frame, lockPlane: PlaneSignature): ValidatedHit? {
        val view = sceneView ?: return null
        if (view.width <= 0 || view.height <= 0) return null
        if (!assistEnabled || placed.size >= 3) {
            clearAssist()
            return null
        }

        val (sequence, candidates) = assistant.projectCorners(frame, view.width, view.height)
        val now = SystemClock.uptimeMillis()
        if (sequence == 0L || sequence == lastCornerAnalysisSequence) {
            // The AR renderer runs faster than CV. Reusing one analysis result may keep an
            // existing lock briefly, but it must never advance confirmation or hold time.
            if (now - lastCornerEvidenceAt >= 260L && assistStatus == CornerAssistStatus.Locked) {
                lockedCorner = null
                assistStatus = CornerAssistStatus.Scanning
            }
            return lockedCorner?.hit?.takeIf { assistStatus == CornerAssistStatus.Locked }
        }
        lastCornerAnalysisSequence = sequence

        candidateCount = candidates.size
        if (candidates.isEmpty()) {
            lockedCorner = null
            latestEvidence = null
            debugCandidates = emptyList()
            assistStatus = if (assistant.snapshot.analysisWidth > 0) {
                CornerAssistStatus.NotClear
            } else {
                CornerAssistStatus.Scanning
            }
            return null
        }

        val centreX = view.width / 2f
        val centreY = view.height / 2f
        val debug = if (this.debug) ArrayList<DebugCandidate>(candidates.size) else null

        // ---- stage one: structural image evidence, close to where the user is aiming
        val shortlisted = ArrayList<Pair<ScreenCorner, Float>>(candidates.size)
        for (corner in candidates) {
            val distancePx = hypot(corner.viewX - centreX, corner.viewY - centreY)
            val structural = corner.minLengthPx >= MIN_STRUCTURAL_LENGTH_PX &&
                corner.minDensity >= MIN_LINE_DENSITY
            if (distancePx <= CONSIDER_RADIUS_PX && structural) {
                shortlisted += corner to distancePx
            } else {
                debug?.add(debugCandidate(corner, view, DebugCandidateKind.ImageOnly))
            }
        }

        if (shortlisted.isEmpty()) {
            lockedCorner = null
            latestEvidence = null
            debugCandidates = debug ?: emptyList()
            assistStatus = CornerAssistStatus.NotClear
            return null
        }

        shortlisted.sortBy { it.second }

        // ---- AR validation, cheapest first, still stage one. Must sit on the locked surface.
        var stageOne: Triple<ScreenCorner, Float, ValidatedHit>? = null
        for ((corner, distancePx) in shortlisted.take(MAX_CANDIDATES_PER_TICK)) {
            val hit = validateHitAt(frame, corner.viewX, corner.viewY)
            val onLock = hit != null &&
                abs(SurfaceMath.signedDistance(lockPlane, hit.position.toWorldPoint())) <= CORNER_OFF_LOCK_M
            if (hit == null || hit.confidence != HitConfidence.Good || !onLock) {
                debug?.add(debugCandidate(corner, view, DebugCandidateKind.ImageOnly))
                continue
            }
            if (stageOne == null) {
                stageOne = Triple(corner, distancePx, hit)
            } else {
                debug?.add(debugCandidate(corner, view, DebugCandidateKind.ImageOnly))
            }
        }

        if (stageOne == null) {
            lockedCorner = null
            latestEvidence = null
            debugCandidates = debug ?: emptyList()
            assistStatus = CornerAssistStatus.VisualCandidate
            return null
        }

        val (corner, distancePx, hit) = stageOne

        // ---- stage two: geometry, run for the single best candidate only
        val depthImage = if (depthSupported) assistant.acquireDepth(frame) else null

        val evidence = try {
            evaluateGeometry(frame, view, corner, distancePx, hit, depthImage)
        } finally {
            runCatching { depthImage?.close() }
        }
        latestEvidence = evidence

        debug?.add(
            debugCandidate(
                corner,
                view,
                when {
                    evidence.rejectReason != null -> DebugCandidateKind.RejectedTexture
                    evidence.geometryConfirmed -> DebugCandidateKind.Confirmed
                    else -> DebugCandidateKind.ArValidGeometryWeak
                }
            )
        )
        debugCandidates = debug ?: emptyList()

        if (!evidence.geometryConfirmed || evidence.score < MIN_CONFIRM_SCORE) {
            lockedCorner = null
            assistStatus = CornerAssistStatus.GeometryWeak
            return null
        }

        // Snap onto the locked plane so the corner and the other points are coplanar.
        val projected = SurfaceMath.project(lockPlane, hit.position.toWorldPoint())
        val snapped = ValidatedHit(
            hit = hit.hit,
            plane = hit.plane,
            position = Float3(projected.x, projected.y, projected.z),
            kind = hit.kind,
            confidence = HitConfidence.Good,
            distance = hit.distance,
            surface = lockPlane
        )

        // ---- temporal stability, in world space
        val previous = lockedCorner
        val stable = previous != null && previous.cornerType == evidence.cornerType &&
            distance(previous.world, snapped.position) < STABILITY_RADIUS_M
        val tracked = LockedCorner(
            world = snapped.position,
            viewX = corner.viewX,
            viewY = corner.viewY,
            since = if (stable) previous!!.since else now,
            hit = snapped,
            cornerType = evidence.cornerType,
            confirmedFrames = if (stable) previous!!.confirmedFrames + 1 else 1
        )
        lockedCorner = tracked
        lastCornerEvidenceAt = now

        val heldFor = now - tracked.since
        val closeEnough = distancePx <= LOCK_RADIUS_PX
        return if (tracked.confirmedFrames >= 3 && heldFor >= CORNER_LOCK_MS &&
            closeEnough && evidence.score >= MIN_LOCK_SCORE
        ) {
            if (assistStatus != CornerAssistStatus.Locked) onCornerLocked()
            assistStatus = CornerAssistStatus.Locked
            snapped
        } else {
            assistStatus = CornerAssistStatus.GeometryConfirmed
            null
        }
    }

    /**
     * Gathers the geometric evidence and decides whether this candidate is a real boundary.
     *
     * Confirmation needs at least one independent geometric signal. The veto matters more
     * than the score: when depth says the surface runs straight through the point, the
     * candidate is deep inside one plane, and every nearby plane shares a normal, then this
     * is flat wall with something drawn on it — no amount of line strength should override
     * that. Wall texture is never accepted as a corner.
     */
    private fun evaluateGeometry(
        frame: Frame,
        view: ARSceneView,
        corner: ScreenCorner,
        distancePx: Float,
        hit: ValidatedHit,
        depthImage: android.media.Image?
    ): CornerEvidence {
        val plane = hit.plane ?: return CornerEvidence(rejectReason = "no tracked plane")
        val boundary = CornerGeometry.distanceToPlaneBoundary(plane, hit.position)
        val probe = CornerGeometry.probeNormals(frame, corner.viewX, corner.viewY, plane)
        val depthBreak = CornerGeometry.depthSlopeBreak(frame, depthImage, corner.viewX, corner.viewY)

        val nearBoundary = boundary <= CornerGeometry.BOUNDARY_NEAR_METRES
        val deepInside = boundary >= CornerGeometry.BOUNDARY_DEEP_METRES
        val normalsDiffer = probe.maxNormalDeltaDegrees >= CornerGeometry.SAME_SURFACE_ANGLE_DEGREES
        val depthEdge = depthBreak.indicatesEdge
        val cornerType = probe.classify()

        val repetitionPenalty = if (corner.repetitive) REPETITION_PENALTY else 0f

        // The texture signature: flat depth, middle of a plane, one surface all around.
        val flatSurface = deepInside && !normalsDiffer && (depthBreak.indicatesFlat || !depthBreak.sampled)
        val reject = when {
            flatSurface && corner.repetitive ->
                "repeating pattern on a continuous plane"
            flatSurface ->
                "continuous flat plane"
            depthBreak.sampled && depthBreak.indicatesFlat && !nearBoundary && !normalsDiffer ->
                "no depth break, not near a plane edge"
            else -> null
        }

        val depthFlatVeto = depthBreak.sampled && depthBreak.indicatesFlat && !nearBoundary
        val confirmed = reject == null && CornerGeometry.confirmsCorner(
            mode = surfaceType,
            type = cornerType,
            normalAngleDegrees = probe.maxNormalDeltaDegrees,
            nearPlaneBoundary = nearBoundary,
            depthEdge = depthEdge,
            depthFlatAwayFromBoundary = depthFlatVeto
        )

        var score = 0f
        // Geometry carries the most weight, by design.
        if (nearBoundary) score += 2.4f
        if (normalsDiffer) score += 2.6f * (probe.maxNormalDeltaDegrees / 60f).coerceAtMost(1.4f)
        if (depthEdge) score += 2.0f
        if (deepInside) score -= 2.0f
        // Real corners straddle two planes; a single-plane candidate is almost certainly texture.
        if (probe.planes.size < 2) score -= 1.5f

        // Image evidence can only refine the ranking, never create a lock on its own.
        score += (1f - distancePx / CONSIDER_RADIUS_PX) * 0.8f
        score += corner.orthogonality * 0.5f
        score += (corner.minLengthPx / 120f).coerceAtMost(0.8f)
        score += (corner.quadrantContrast / 40f).coerceAtMost(0.5f)
        if (hit.confidence == HitConfidence.Good) score += 0.5f
        score -= repetitionPenalty
        score += edgeAssistBonus(hit.position)

        // Prefer the boundary the current mode is actually looking for.
        score += when (surfaceType) {
            SurfaceType.WALL -> when (cornerType) {
                CornerType.WALL_WALL -> 1.0f
                CornerType.WALL_FLOOR, CornerType.WALL_CEILING -> 0.6f
                CornerType.UNKNOWN -> 0f
            }
            SurfaceType.CEILING -> when (cornerType) {
                CornerType.WALL_CEILING -> 1.2f
                CornerType.WALL_WALL -> 0.4f
                else -> 0f
            }
        }

        return CornerEvidence(
            score = score,
            geometryConfirmed = confirmed,
            rejectReason = reject,
            lineStrength = corner.strength,
            minLengthPx = corner.minLengthPx,
            maxLengthPx = corner.maxLengthPx,
            reticleDistancePx = distancePx,
            planeBoundaryMetres = boundary,
            planeNormalDeltaDegrees = probe.maxNormalDeltaDegrees,
            depthGradientX = depthBreak.gradientX,
            depthGradientY = depthBreak.gradientY,
            depthSampled = depthBreak.sampled,
            repetitionPenalty = repetitionPenalty,
            quadrantContrast = corner.quadrantContrast,
            cornerType = cornerType
        )
    }

    private fun debugCandidate(
        corner: ScreenCorner,
        view: ARSceneView,
        kind: DebugCandidateKind
    ) = DebugCandidate(
        normalisedX = (corner.viewX / view.width).coerceIn(0f, 1f),
        normalisedY = (corner.viewY / view.height).coerceIn(0f, 1f),
        kind = kind
    )

    private fun clearAssist() {
        lockedCorner = null
        latestEvidence = null
        debugCandidates = emptyList()
        assistStatus = CornerAssistStatus.Idle
    }

    // ------------------------------------------------------------ user controls

    /**
     * Torch control through ARCore's own session config.
     *
     * This is the only safe route: ARCore holds the camera, so a second CameraX session or
     * a bare `CameraManager.setTorchMode` would be fighting it for ownership. Reconfiguring
     * the live session keeps a single camera client and needs no AR restart.
     */
    fun setAutofocus(enabled: Boolean): Boolean {
        val session = sceneView?.session ?: return false
        val applied = runCatching {
            val config = session.config
            config.focusMode = if (enabled) Config.FocusMode.AUTO else Config.FocusMode.FIXED
            session.configure(config)
            true
        }.getOrElse { Log.w(TAG, "focus change failed", it); false }
        if (applied) update { it.copy(autofocus = enabled) }
        return applied
    }

    fun setTorchEnabled(enabled: Boolean): Boolean {
        if (released || !torchAvailable) return false
        val session = sceneView?.session ?: return false
        val applied = runCatching {
            val config = session.config
            config.flashMode = if (enabled) Config.FlashMode.TORCH else Config.FlashMode.OFF
            session.configure(config)
            true
        }.getOrElse { error ->
            Log.w(TAG, "torch toggle failed", error)
            // Assume the hardware refused and stop offering the control.
            torchAvailable = false
            false
        }
        if (applied) {
            torchEnabled = enabled
            pendingRecordEvent = if (enabled) "torch_on" else "torch_off"
        }
        publishChrome()
        return applied
    }

    /**
     * Called when the AR route pauses. The camera release already extinguishes the torch;
     * this clears the config and our state so resuming never silently relights it.
     */
    fun onLifecyclePause() {
        recorder.stop(sceneView?.session, "Recording saved when app paused")
        currentHit = null
        snappedHit = null
        validStreak = 0
        lastDepth = null
        trackedObservation = null
        referenceObservation = null
        lockTracker.clearSamples()
        lastCameraAt = 0L
        if (torchEnabled) {
            runCatching {
                sceneView?.session?.let { session ->
                    val config = session.config
                    config.flashMode = Config.FlashMode.OFF
                    session.configure(config)
                }
            }
            torchEnabled = false
            publishChrome()
        }
    }

    /** Pushes chrome-only state (torch, assist) without waiting for the next AR frame. */
    private fun publishChrome() {
        update {
            it.copy(
                assistEnabled = assistEnabled,
                torchAvailable = torchAvailable,
                torchEnabled = torchEnabled,
                enhancement = enhancement,
                referenceEnabled = referenceEnabled,
                referenceConfigured = referenceConfigured,
                referenceStatus = referenceStatus
            )
        }
    }

    /** User-facing switch; manual measurement is always available either way. */
    fun setAssistEnabled(enabled: Boolean) {
        assistEnabled = enabled
        if (!enabled) {
            clearAssist()
            snappedHit = null
        }
        update {
            it.copy(
                assistEnabled = enabled,
                assist = assistState(),
                debugCandidates = debugCandidates,
                torchAvailable = torchAvailable,
                torchEnabled = torchEnabled
            )
        }
    }

    /** Advanced scanning. Affects only the corner assistant's analysis copy of the image. */
    fun setEnhancement(settings: ScanEnhancementSettings) {
        enhancement = settings.normalised()
        assistant.settings = enhancement
        publishChrome()
    }

    fun setVisionPreviewEnabled(enabled: Boolean) {
        assistant.previewEnabled = enabled
    }

    /**
     * Switches between wall and ceiling before measuring starts. The lock is dropped
     * because a wall lock is by definition not a ceiling.
     */
    fun setSurfaceType(type: SurfaceType): Boolean {
        if (recorder.state.value.recording || placed.isNotEmpty()) return false
        if (type == surfaceType) return true
        surfaceType = type
        dropLock()
        lastDepth = null
        lastEvidenceAt = 0L
        searchingSince = SystemClock.uptimeMillis()
        currentHit = null
        snappedHit = null
        validStreak = 0
        clearAssist()
        update {
            it.copy(
                surfaceType = type,
                surfaceLocked = false,
                surfaceSource = null,
                surfaceDetected = false,
                lockProgress = 0f,
                phase = ArPhase.SearchingForSurface
            )
        }
        return true
    }

    /**
     * Nudges the search towards the edge the workflow is currently following: along the
     * first edge while setting the width, and away from it while setting the height.
     */
    private fun edgeAssistBonus(candidate: Float3): Float = when (placed.size) {
        1 -> {
            // Prefer candidates roughly level with point one — the same horizontal edge.
            val p0 = placed[0].anchor.pose.toFloat3()
            val drop = abs(candidate.y - p0.y)
            val spread = distance(candidate, p0)
            if (spread > 0.15f && drop < EDGE_ALIGN_TOLERANCE_M) 1.2f else 0f
        }
        2 -> {
            // Prefer candidates off the width axis — the height direction.
            val p0 = placed[0].anchor.pose.toFloat3()
            val p1 = placed[1].anchor.pose.toFloat3()
            val perpendicular = heightFrom(p0, p1, candidate)
            if (perpendicular > MeasurementEligibility.MIN_HEIGHT_METRES) 1.2f else -1.0f
        }
        else -> 0f
    }

    private fun assistState(): CornerAssistState {
        val view = sceneView
        val corner = lockedCorner
        if (view == null || view.width <= 0 || view.height <= 0) {
            return CornerAssistState(status = assistStatus)
        }
        if (corner == null) return CornerAssistState(status = assistStatus)
        return CornerAssistState(
            status = assistStatus,
            normalisedX = (corner.viewX / view.width).coerceIn(0f, 1f),
            normalisedY = (corner.viewY / view.height).coerceIn(0f, 1f),
            stableMillis = SystemClock.uptimeMillis() - corner.since,
            cornerType = corner.cornerType
        )
    }

    private fun planeKind(plane: Plane, cameraY: Float? = null): HitKind = when (plane.type) {
        Plane.Type.VERTICAL -> HitKind.VerticalPlane
        Plane.Type.HORIZONTAL_DOWNWARD_FACING -> HitKind.HorizontalDownward
        Plane.Type.HORIZONTAL_UPWARD_FACING -> {
            if (cameraY != null && plane.centerPose.ty() > cameraY + 0.12f) {
                HitKind.HorizontalDownward
            } else {
                HitKind.HorizontalUpward
            }
        }
    }

    private fun matchesSurface(kind: HitKind): Boolean =
        ArMeasurementGeometry.acceptsSurface(surfaceType, kind)

    private fun planeSignature(plane: Plane): PlaneSignature {
        val normal = FloatArray(3)
        plane.centerPose.getTransformedAxis(1, 1f, normal, 0)
        return PlaneSignature(
            normalX = normal[0],
            normalY = normal[1],
            normalZ = normal[2],
            centerX = plane.centerPose.tx(),
            centerY = plane.centerPose.ty(),
            centerZ = plane.centerPose.tz()
        )
    }

    private fun updateCameraMotion(pose: Pose, now: Long) {
        val t = pose.translation
        val q = pose.rotationQuaternion
        if (lastCameraAt > 0L) {
            val dt = (now - lastCameraAt) / 1000f
            if (dt in 0.02f..0.5f) {
                val dx = t[0] - lastCameraT[0]
                val dy = t[1] - lastCameraT[1]
                val dz = t[2] - lastCameraT[2]
                val speed = sqrt(dx * dx + dy * dy + dz * dz) / dt
                val dot = abs(q[0] * lastCameraQ[0] + q[1] * lastCameraQ[1] + q[2] * lastCameraQ[2] + q[3] * lastCameraQ[3])
                val turn = Math.toDegrees(2.0 * acos(dot.coerceIn(0f, 1f).toDouble())).toFloat() / dt
                cameraSpeed = cameraSpeed * 0.6f + speed * 0.4f
                cameraTurn = cameraTurn * 0.6f + turn * 0.4f
            }
        }
        t.copyInto(lastCameraT)
        q.copyInto(lastCameraQ)
        lastCameraAt = now
    }

    // ------------------------------------------------------------- placement

    /**
     * Places the next measurement point on the locked surface. Returns false and leaves
     * the workflow untouched if the surface is not confirmed, the reticle is not on it, or
     * ARCore refuses the anchor.
     */
    fun placePoint(): Boolean {
        val view = sceneView ?: return false
        val session = view.session ?: return false
        if (placed.size >= 3) return false

        if (quickMode) return placeQuickPoint(view, session)

        val lockPlane = currentLockPlane()
        val hit = snappedHit ?: currentHit
        val provisionalHeight = if (placed.size == 2 && hit != null) {
            heightFrom(placed[0].anchor.pose.toFloat3(), placed[1].anchor.pose.toFloat3(), hit.position)
        } else null
        val assessment = lastAssessment
        val block = if (assessment == null) PlacementBlock.NOT_READY else MeasurementEligibility.check(
            assessment = assessment,
            pointCount = placed.size,
            surfaceLocked = lockPlane != null,
            provisionalHeightMetres = provisionalHeight
        )
        if (block != PlacementBlock.NONE || hit == null || lockPlane == null) {
            showTransient(blockMessage(if (block == PlacementBlock.NONE) PlacementBlock.NOT_READY else block))
            return false
        }

        val pose = Pose(
            floatArrayOf(hit.position.x, hit.position.y, hit.position.z),
            SurfaceMath.quaternionFromUpTo(lockPlane.normal())
        )
        val anchor = try {
            session.createAnchor(pose)
        } catch (error: Throwable) {
            Log.w(TAG, "Anchor creation failed", error)
            showTransient("Could not lock that point — try again")
            return false
        }

        val node = try {
            createMarker(view, anchor, placed.size)
        } catch (error: Throwable) {
            Log.w(TAG, "Marker creation failed", error)
            anchor.detach()
            showTransient("Could not place the marker — try again")
            return false
        }

        placed += PlacedPoint(anchor, node)
        pendingRecordEvent = "point_${placed.size}"
        validStreak = 0
        lockedCorner = null
        snappedHit = null
        latestEvidence = null
        debugCandidates = emptyList()
        assistStatus = CornerAssistStatus.Scanning
        onPointPlaced()
        refreshAfterPointChange()
        return true
    }


    // ------------------------------------------------------------ quick measure

    fun setQuickMode(enabled: Boolean) {
        if (quickMode == enabled || placed.isNotEmpty()) return
        quickMode = enabled
        currentHit = null
        snappedHit = null
        validStreak = 0
        update { it.copy(quickMode = enabled) }
    }

    /** Whatever ARCore can hit under the reticle, else a point QUICK_FALLBACK_M ahead. */
    private fun quickFrame(frame: Frame, view: ARSceneView, now: Long) {
        val camPose = frame.camera.pose
        val dir = FloatArray(3)
        camPose.getTransformedAxis(2, -1f, dir, 0)
        val origin = camPose.toWorldPoint()
        val hit = runCatching {
            frame.hitTest(view.width / 2f, view.height / 2f).firstOrNull { h ->
                val t = h.trackable
                h.distance in 0.1f..8f && when (t) {
                    is Plane -> t.trackingState == TrackingState.TRACKING && t.isPoseInPolygon(h.hitPose)
                    is com.google.ar.core.Point, is com.google.ar.core.DepthPoint -> t.trackingState == TrackingState.TRACKING
                    else -> false
                }
            }
        }.getOrNull()
        val pos = hit?.hitPose?.let { Float3(it.tx(), it.ty(), it.tz()) }
            ?: Float3(origin.x + dir[0] * QUICK_FALLBACK_M, origin.y + dir[1] * QUICK_FALLBACK_M, origin.z + dir[2] * QUICK_FALLBACK_M)
        val dist = hit?.distance ?: QUICK_FALLBACK_M
        val facing = PlaneSignature(-dir[0], -dir[1], -dir[2], pos.x, pos.y, pos.z)
        currentHit = ValidatedHit(hit, hit?.trackable as? Plane, pos, HitKind.None, HitConfidence.Good, dist, facing)
        val measurement = computeMeasurement()
        update { c ->
            val step = stepFor(placed.size)
            c.copy(
                quickMode = true,
                step = step,
                phase = if (step == MeasureStep.Complete) ArPhase.MeasurementComplete else ArPhase.Ready,
                confidence = HitConfidence.Good,
                surfaceDetected = true,
                surfaceLocked = true,
                pointCount = placed.size,
                widthMeters = measurement.first,
                heightMeters = measurement.second,
                transientMessage = activeTransient(now),
                torchAvailable = torchAvailable,
                torchEnabled = torchEnabled,
                scanStage = ScanStageResolver.resolve(true, true, true, placed.size),
                issue = ScanIssue.NONE,
                canChangeSurface = false,
                diagnostics = null
            )
        }
        updateGuides()
    }

    private fun placeQuickPoint(view: ARSceneView, session: Session): Boolean {
        val hit = currentHit ?: run { showTransient("Wait for camera tracking"); return false }
        val pose = Pose(
            floatArrayOf(hit.position.x, hit.position.y, hit.position.z),
            SurfaceMath.quaternionFromUpTo(hit.surface.normal())
        )
        val anchor = try { session.createAnchor(pose) } catch (e: Throwable) {
            showTransient("Could not lock that point — try again"); return false
        }
        val node = try { createMarker(view, anchor, placed.size) } catch (e: Throwable) {
            anchor.detach(); showTransient("Could not place the marker — try again"); return false
        }
        placed += PlacedPoint(anchor, node)
        pendingRecordEvent = "point_${placed.size}"
        onPointPlaced()
        refreshAfterPointChange()
        return true
    }

    private fun blockMessage(block: PlacementBlock): String = when (block) {
        PlacementBlock.SURFACE_NOT_CONFIRMED -> if (_state.value.surfaceDetected) {
            "Hold steady for a moment while the surface is confirmed"
        } else {
            "Scan the ${surfaceName()} first — move your phone slowly from side to side"
        }
        PlacementBlock.OFF_SURFACE -> "Keep the reticle on the same ${surfaceName()}"
        PlacementBlock.TOO_CLOSE_TO_WIDTH_LINE -> "Aim above or below the width line"
        PlacementBlock.COMPLETE -> "All points are placed"
        PlacementBlock.NOT_READY, PlacementBlock.NONE -> when (lastAssessment?.issue) {
            ScanIssue.MOVING_TOO_FAST -> "Move your phone more slowly"
            ScanIssue.OUT_OF_RANGE -> "Move a little closer to the ${surfaceName()}"
            else -> "Hold steady on the ${surfaceName()} first"
        }
    }

    private fun surfaceName() = if (surfaceType == SurfaceType.WALL) "wall" else "ceiling"

    /** Removes the most recent point, releasing its anchor and node, and steps back. */
    fun undo() {
        pendingRecordEvent = "undo"
        val last = placed.removeLastOrNull() ?: return
        releasePointLive(last)
        clearGuides()
        validStreak = 0
        refreshAfterPointChange()
    }

    /**
     * Clears every point but keeps the session — a reset should not restart tracking. With
     * no points placed, a reset releases the surface lock so a different surface can be
     * scanned.
     */
    fun reset() {
        if (placed.isEmpty()) {
            dropLock()
            lastDepth = null
            lastEvidenceAt = 0L
            searchingSince = SystemClock.uptimeMillis()
        }
        placed.forEach { releasePointLive(it) }
        placed.clear()
        dropLock()
        lastDepth = null
        lastEvidenceAt = 0L
        currentHit = null
        snappedHit = null
        pendingRecordEvent = "reset"
        clearGuides()
        validStreak = 0
        refreshAfterPointChange()
    }

    /**
     * Releases one point while the session is definitely alive — i.e. from undo or reset,
     * where the user is interacting with a running scene.
     *
     * Exactly one detach happens here. `AnchorNode.destroy()` already calls
     * `detachAnchor()`, which calls `Anchor.detach()`; adding either of those alongside it
     * detaches the same native anchor two or three times, which segfaults inside
     * `ArAnchor_detach` rather than throwing something catchable.
     */
    private fun releasePointLive(point: PlacedPoint) {
        runCatching {
            sceneView?.removeChildNodes(listOf(point.node))
            point.node.destroy()
        }.onFailure { Log.w(TAG, "Node release failed", it) }
    }

    private fun refreshAfterPointChange() {
        val measurement = computeMeasurement()
        val locked = lockAnchor != null
        update { current ->
            val step = stepFor(placed.size)
            current.copy(
                step = step,
                pointCount = placed.size,
                widthMeters = measurement.first,
                heightMeters = measurement.second,
                phase = if (step == MeasureStep.Complete) {
                    ArPhase.MeasurementComplete
                } else {
                    ArPhase.SearchingForSurface
                },
                confidence = HitConfidence.None,
                surfaceLocked = locked,
                surfaceSource = lockSource?.takeIf { locked },
                canChangeSurface = placed.isEmpty() && !recorder.state.value.recording,
                referenceEnabled = referenceEnabled,
                referenceConfigured = referenceConfigured,
                referenceStatus = referenceStatus,
                scanStage = ScanStageResolver.resolve(everTracked, current.surfaceDetected || locked, locked, placed.size)
            )
        }
        updateGuides()
    }

    // -------------------------------------------------------------- geometry

    /** width, height — both derived live from anchor poses so drift correction is picked up. */
    private fun computeMeasurement(): Pair<Double, Double> {
        if (placed.size < 2) return 0.0 to 0.0
        val p0 = placed[0].anchor.pose.toFloat3()
        val p1 = placed[1].anchor.pose.toFloat3()
        val width = ArMeasurementGeometry.distance(p0.toWorldPoint(), p1.toWorldPoint())
        if (placed.size < 3) return width to 0.0
        val p2 = placed[2].anchor.pose.toFloat3()
        return width to heightFrom(p0, p1, p2)
    }

    /**
     * Height is the extent of the third point perpendicular to the width axis, not its raw
     * distance from point two. Taking the raw distance folds any sideways drift in the tap
     * into the height, which is what made earlier measurements read long.
     */
    private fun heightFrom(p0: Float3, p1: Float3, p2: Float3): Double {
        return ArMeasurementGeometry.perpendicularExtent(
            p0.toWorldPoint(),
            p1.toWorldPoint(),
            p2.toWorldPoint()
        )
    }

    private fun stepFor(count: Int): MeasureStep = when (count) {
        0 -> MeasureStep.WidthStart
        1 -> MeasureStep.WidthEnd
        2 -> MeasureStep.Height
        else -> MeasureStep.Complete
    }

    /** Snapshot for the result screen. Plain numbers — no ARCore types leave this class. */
    fun snapshot(): Triple<Double, Double, Int> {
        val (w, h) = computeMeasurement()
        return Triple(w, h, placed.size)
    }

    // --------------------------------------------------------------- markers

    private fun createMarker(view: ARSceneView, anchor: Anchor, index: Int): AnchorNode {
        val node = AnchorNode(view.engine, anchor)
        val sphere = SphereNode(
            engine = view.engine,
            radius = 0.012f,
            center = Float3(0f, 0f, 0f),
            materialInstance = view.materialLoader.createColorInstance(
                when (index) {
                    0 -> MARKER_POINT_A
                    1 -> MARKER_POINT_B
                    else -> MARKER_HEIGHT
                },
                0.0f,
                0.35f,
                0.4f
            )
        )
        node.addChildNode(sphere)
        view.addChildNodes(listOf(node))
        return node
    }

    /** Thin bars between placed points so the user can see what was measured. */
    private fun updateGuides() {
        val view = sceneView ?: return
        if (placed.size < 2) {
            if (guideNodes.isNotEmpty()) clearGuides()
            return
        }

        val segments = mutableListOf<Pair<Float3, Float3>>()
        segments += placed[0].anchor.pose.toFloat3() to placed[1].anchor.pose.toFloat3()
        if (placed.size >= 3) {
            segments += placed[1].anchor.pose.toFloat3() to placed[2].anchor.pose.toFloat3()
        }

        while (guideNodes.size > segments.size) {
            // removeAt, not removeLast(): the latter binds to java.util.List#removeLast
            // (API 35) and throws NoSuchMethodError on older devices.
            val extra = guideNodes.removeAt(guideNodes.lastIndex)
            runCatching {
                view.removeChildNodes(listOf(extra))
                extra.destroy()
            }
        }

        segments.forEachIndexed { index, (from, to) ->
            val length = distance(from, to)
            if (length <= 0.01f) return@forEachIndexed
            val node = guideNodes.getOrNull(index) ?: CubeNode(
                engine = view.engine,
                size = Float3(0.006f, 0.006f, 1f),
                center = Float3(0f, 0f, 0f),
                materialInstance = view.materialLoader.createColorInstance(
                    if (index == 0) MARKER_POINT_B else MARKER_HEIGHT,
                    0.0f,
                    0.4f,
                    0.3f
                )
            ).also {
                guideNodes.add(it)
                view.addChildNodes(listOf(it))
            }

            node.worldPosition = Float3(
                (from.x + to.x) / 2f,
                (from.y + to.y) / 2f,
                (from.z + to.z) / 2f
            )
            runCatching { node.lookAt(to) }
            node.scale = Float3(1f, 1f, length)
        }
    }

    /** Live-path only: destroys guide bars while the engine is still running. */
    private fun clearGuides() {
        val view = sceneView
        guideNodes.forEach { node ->
            runCatching {
                view?.removeChildNodes(listOf(node))
                node.destroy()
            }
        }
        guideNodes.clear()
    }

    // -------------------------------------------------------------- teardown

    /**
     * Teardown when leaving the screen, exactly once.
     *
     * Deliberately does NOT detach anchors or destroy nodes. `ARSceneView.destroy()` tears
     * down the ARCore session and the Filament engine, which reclaims every anchor and
     * node we created — including the surface lock anchor. Reaching into those objects
     * first is an optimisation with no benefit and a real hazard: if the view's lifecycle
     * observer already ran, the handles are dangling and the call segfaults in native code,
     * where no `runCatching` can help.
     */
    fun release() {
        if (released) return
        // Turn the torch off while the session is still alive; after this the camera is
        // released anyway, but leaving the config set would relight it on a fast re-entry.
        if (torchEnabled) {
            runCatching {
                sceneView?.session?.let { session ->
                    val config = session.config
                    config.flashMode = Config.FlashMode.OFF
                    session.configure(config)
                }
            }
            torchEnabled = false
        }
        recorder.release()
        referenceDatabaseFile?.delete()
        released = true
        runCatching {
            sceneView?.onSessionUpdated = null
            sceneView?.onSessionFailed = null
        }
        assistant.release()
        placed.clear()
        guideNodes.clear()
        currentHit = null
        snappedHit = null
        lockedCorner = null
        lockAnchor = null
        lastDepth = null
        sceneView = null
    }

    // ---------------------------------------------------------------- helpers

    private inline fun update(block: (ArUiState) -> ArUiState) {
        val next = block(_state.value)
        // Structural equality means an unchanged frame costs nothing downstream.
        if (next != _state.value) _state.value = next
    }

    private fun showTransient(message: String) {
        transientMessageUntil = SystemClock.uptimeMillis() + 2_200L
        update { it.copy(transientMessage = message) }
    }

    private fun activeTransient(now: Long): String? =
        if (now < transientMessageUntil) _state.value.transientMessage else null

    private fun quantise(value: Float): Float = (value * 4f).toInt().coerceIn(0, 4) / 4f

    private fun trackingIssue(reason: TrackingFailureReason?): ArTrackingIssue = when (reason) {
        TrackingFailureReason.EXCESSIVE_MOTION -> ArTrackingIssue.ExcessiveMotion
        TrackingFailureReason.INSUFFICIENT_LIGHT -> ArTrackingIssue.InsufficientLight
        TrackingFailureReason.INSUFFICIENT_FEATURES -> ArTrackingIssue.InsufficientFeatures
        TrackingFailureReason.CAMERA_UNAVAILABLE -> ArTrackingIssue.CameraUnavailable
        TrackingFailureReason.NONE, null -> ArTrackingIssue.Initializing
        else -> ArTrackingIssue.Unknown
    }

    private fun trackingProblem(reason: TrackingFailureReason?): TrackingProblem = when (reason) {
        TrackingFailureReason.EXCESSIVE_MOTION -> TrackingProblem.EXCESSIVE_MOTION
        TrackingFailureReason.INSUFFICIENT_LIGHT -> TrackingProblem.INSUFFICIENT_LIGHT
        TrackingFailureReason.INSUFFICIENT_FEATURES -> TrackingProblem.INSUFFICIENT_FEATURES
        TrackingFailureReason.CAMERA_UNAVAILABLE -> TrackingProblem.CAMERA_UNAVAILABLE
        TrackingFailureReason.NONE, null -> TrackingProblem.INITIALIZING
        else -> TrackingProblem.OTHER
    }

    private fun sessionErrorMessage(error: Throwable): String = when (error::class.java.simpleName) {
        "CameraNotAvailableException" ->
            "The camera is being used by another app. Close it and try again."
        "UnavailableArcoreNotInstalledException",
        "UnavailableApkTooOldException" ->
            "Google Play Services for AR needs installing or updating."
        "UnavailableDeviceNotCompatibleException" ->
            "This device cannot run AR measurement."
        "SecurityException" ->
            "Camera access is needed to measure."
        "PlaybackFailedException" -> "This file could not be replayed. Open the original ARCore MP4 from the ZIP, or return to live camera."
        else -> "AR could not start. Enter the dimensions by hand instead."
    }

    private fun countFrame(timestampNs: Long) {
        if (timestampNs == 0L || timestampNs == lastCountedCameraTimestampNs) return
        lastCountedCameraTimestampNs = timestampNs
        frameCount++
        val now = SystemClock.uptimeMillis()
        if (fpsWindowStart == 0L) fpsWindowStart = now
        if (now - fpsWindowStart >= 1_000L) {
            fps = frameCount
            frameCount = 0
            fpsWindowStart = now
        }
    }

    private fun diagnostics(
        session: Session,
        tracking: TrackingState,
        reason: TrackingFailureReason?,
        hit: ValidatedHit?,
        depth: DepthSurface?,
        assessment: SurfaceAssessment?
    ): ArDiagnostics? {
        if (!debug && !recorder.state.value.recording) return null
        val snapshot = assistant.snapshot
        val quality = snapshot.quality
        return ArDiagnostics(
            cameraTracking = tracking.name,
            failureReason = reason?.name ?: "NONE",
            sessionState = if (released) "RELEASED" else "ACTIVE(${session.allAnchors.size} anchors)",
            hitValid = hit != null,
            hitKind = hit?.kind?.name ?: "NONE",
            hitDistanceMeters = hit?.distance ?: 0f,
            poseJitterMeters = 0f,
            anchorCount = placed.size,
            step = stepFor(placed.size).name,
            fps = fps,
            cvPerSecond = snapshot.cvPerSecond,
            cvMillis = snapshot.cvMillis,
            analysisSize = "${snapshot.analysisWidth}x${snapshot.analysisHeight}",
            lineCount = snapshot.lineCount,
            candidateCount = candidateCount,
            cornerStatus = assistStatus.name,
            cornerStableMillis = lockedCorner?.let { SystemClock.uptimeMillis() - it.since } ?: 0L,
            depthSupported = depthSupported,
            depthActive = depthActive,
            evidence = latestEvidence,
            surfaceSource = if (lockAnchor != null) "LOCK/${lockSource?.name}" else "none",
            lockProgress = lockProgress,
            depthFitRms = depth?.fit?.rmsResidual,
            depthFitPoints = depth?.fit?.pointCount ?: 0,
            confidence = assessment?.let { "${it.level} ${"%.2f".format(it.overall)}" } ?: "",
            issue = assessment?.issue?.name ?: "",
            lumaMean = quality.meanLuma,
            clippedPercent = quality.clippedHighFraction * 100f,
            texturePercent = quality.usableTextureFraction * 100f,
            lighting = quality.lighting.name,
            gradientThreshold = snapshot.gradientThreshold,
            enhancementGain = snapshot.enhancementGain,
            chromaUsed = snapshot.chromaUsed,
            cameraSpeed = cameraSpeed,
            cameraTurn = cameraTurn,
            frameWorkMillis = workMillisAvg,
            cameraConfig = cameraConfigLabel,
            depthTimestampNs = depthTimestampNs,
            depthConfidentFraction = depthConfidentFraction,
            depthInlierFraction = depthInlierFraction,
            depthCoverage = depthCoverage,
            localLumaMean = snapshot.reticleQuality.meanLuma,
            localClippedPercent = snapshot.reticleQuality.clippedHighFraction * 100f,
            lockAnchorTracking = lockAnchor?.trackingState?.name ?: "NONE",
            lockUsable = lockAnchor?.trackingState == TrackingState.TRACKING,
            pointAnchorsTracking = placed.joinToString("|") { it.anchor.trackingState.name },
            lockNormal = lockAnchor?.takeIf { it.trackingState == TrackingState.TRACKING }?.let { a ->
                val n = FloatArray(3)
                a.pose.getTransformedAxis(1, 1f, n, 0)
                "%.2f/%.2f/%.2f".format(n[0], n[1], n[2])
            } ?: "",
            trackedPlaneMatches = trackedObservation != null,
            reticleBlock = if (currentHit == null) "no_hit" else assessment?.issue?.name ?: "",
            sessionId = sessionId,
            searchGeneration = searchGeneration,
            lockRecoveries = lockRecoveryCount
        )
    }

    private companion object {
        const val QUICK_FALLBACK_M = 1.0f
        const val MARKER_POINT_A = 0xFFCE8A5A.toInt()
        const val MARKER_POINT_B = 0xFF38BDF8.toInt()
        const val MARKER_HEIGHT = 0xFF6FBF95.toInt()
    }
}

private fun Pose.toFloat3() = Float3(tx(), ty(), tz())

private fun Pose.toWorldPoint() = WorldPoint3(tx(), ty(), tz())

private fun Float3.toWorldPoint() = WorldPoint3(x, y, z)

private fun PlaneSignature.normal() = WorldPoint3(normalX, normalY, normalZ)

private fun SurfaceOrientation.toHitKind(): HitKind = when (this) {
    SurfaceOrientation.VERTICAL -> HitKind.VerticalPlane
    SurfaceOrientation.HORIZONTAL_UP -> HitKind.HorizontalUpward
    SurfaceOrientation.HORIZONTAL_DOWN -> HitKind.HorizontalDownward
    SurfaceOrientation.SLANTED -> HitKind.Other
}

private fun distance(a: Float3, b: Float3): Float {
    val dx = a.x - b.x
    val dy = a.y - b.y
    val dz = a.z - b.z
    return sqrt(dx * dx + dy * dy + dz * dz)
}
