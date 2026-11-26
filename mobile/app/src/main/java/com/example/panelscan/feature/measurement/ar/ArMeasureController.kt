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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import com.example.panelscan.core.logic.WallPhotoGeometry
import com.example.panelscan.core.model.WallPhoto
import kotlin.coroutines.resume
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
import dev.romainguy.kotlin.math.Float4
import dev.romainguy.kotlin.math.Mat4
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.geometries.Geometry
import io.github.sceneview.node.CubeNode
import io.github.sceneview.node.GeometryNode
import io.github.sceneview.node.SphereNode
import java.util.EnumSet
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private const val TAG = "ArMeasure"

/** Hit tests run at ~15Hz rather than every frame; the reticle cannot move meaningfully faster. */
private const val SAMPLE_INTERVAL_MS = 66L

/** Consecutive samples required before the reticle flips state, to stop it strobing. */
private const val VALID_STREAK_TO_ARM = 2
private const val INVALID_STREAK_TO_DISARM = 4

/** A hit closer or further than this is not a surface we can trust. Extended to 25 m for large walls and halls. */
private const val MIN_HIT_DISTANCE_M = 0.20f
private const val MAX_HIT_DISTANCE_M = 25.0f

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
    private val cornerNodes = mutableListOf<SphereNode>()
    private val gridCornerOffsets = mutableListOf<WorldPoint3>()
    private var gridNormal: WorldPoint3? = null
    private var activeCornerIndex: Int? = null
    private var cornerGrabOffsetX = 0f
    private var cornerGrabOffsetY = 0f
    private val lastViewMatrix = FloatArray(16)
    private val lastProjectionMatrix = FloatArray(16)
    private var hasCameraMatrices = false
    private var surfaceDotsNode: GeometryNode? = null
    private var dotsOriginPose: Pose? = null
    private var dotsOriginSurface: PlaneSignature? = null
    private var dotsHiddenForPhoto = false

    // Sampling / hysteresis
    private var lastSampleAt = 0L
    private var validStreak = 0
    private var invalidStreak = 0
    private var currentHit: ValidatedHit? = null
    private var lastValidHit: ValidatedHit? = null
    private var lastValidHitAt = 0L
    private var lastFullTrackingAt = 0L
    /** Quick measure: point-to-point 3D distance, no surface lock or corner search. */
    private var quickMode = true
    /**
     * Quick measure: the tracked plane the first point lies on. Later points
     * are found on it (its infinite extension), so all three are on one wall
     * and a corner tap never lands on the ceiling cove, a frame or a shadow.
     */
    private var quickPlane: Plane? = null
    /** Quick measure: the 3D surface signature of the detected/locked wall or ceiling, kept across large walls even outside ARCore's initial polygon. */
    private var quickLockedSurface: PlaneSignature? = null
    /** Quick measure: recent reticle positions, averaged into the point when the customer taps. */
    private val quickSamples = ArrayDeque<Pair<Long, Float3>>()
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

    private class PlacedPoint(
        val anchor: Anchor,
        val node: AnchorNode,
        private var lastPosition: Float3 = anchor.pose.toFloat3()
    ) {
        fun position(): Float3 {
            if (anchor.trackingState == TrackingState.TRACKING) {
                lastPosition = anchor.pose.toFloat3()
            }
            return lastPosition
        }
    }

    /** The AR camera at one frame, for placing the measured wall on its photo. */
    private class CameraMatrices(val view: FloatArray, val projection: FloatArray)
    private var cameraRequest: CompletableDeferred<CameraMatrices>? = null

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

        // SceneView's built-in PlaneRenderer in RENDER_CENTER mode only renders
        // HORIZONTAL_UPWARD_FACING (floor) planes and ignores walls and ceilings.
        // Disable it so floor dots never appear, and render our own surface-filtered
        // dots only on the selected surface (Wall or Ceiling).
        view.planeRenderer.isEnabled = false
        view.planeRenderer.isVisible = false
        view.planeRenderer.isShadowReceiver = false

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

        cameraRequest?.let { request ->
            val camera = frame.camera
            if (!request.isCompleted && camera.trackingState == TrackingState.TRACKING) {
                val view = FloatArray(16).also { camera.getViewMatrix(it, 0) }
                val projection = FloatArray(16).also { camera.getProjectionMatrix(it, 0, PHOTO_NEAR, PHOTO_FAR) }
                request.complete(CameraMatrices(view, projection))
            }
        }

        countFrame(frame.timestamp)

        val now = SystemClock.uptimeMillis()
        if (now - lastSampleAt < SAMPLE_INTERVAL_MS) return
        lastSampleAt = now

        val started = System.nanoTime()
        try {
            if (frame.camera.trackingState == TrackingState.TRACKING) {
                frame.camera.getViewMatrix(lastViewMatrix, 0)
                frame.camera.getProjectionMatrix(lastProjectionMatrix, 0, PHOTO_NEAR, PHOTO_FAR)
                hasCameraMatrices = true
            }
            sample(session, frame, now)
            val inView = measuredAreaInView(frame)
            val handles = if (placed.size >= 3) projectGridCornerHandles() else emptyList()
            update {
                if (it.measuredAreaInView == inView && it.cornerHandles == handles && it.activeCornerIndex == activeCornerIndex) {
                    it
                } else {
                    it.copy(
                        measuredAreaInView = inView,
                        cornerHandles = handles,
                        activeCornerIndex = activeCornerIndex
                    )
                }
            }
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
        lastFullTrackingAt = now

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
                ?.takeUnless { p ->
                    planeHit != null && (
                        if (surfaceType == SurfaceType.WALL && planeHit.kind == HitKind.HorizontalUpward) {
                            ArMeasurementGeometry.isFloorOccludingWall(
                                wallHitY = p.position.y,
                                wallHitDistance = p.distance,
                                floorPlaneY = planeHit.position.y,
                                floorHitDistance = planeHit.distance
                            )
                        } else {
                            planeHit.distance < p.distance - occlusionTolerance(p.distance)
                        }
                    )
                }
        }
        val trackedEvidence = if (referenceEnabled) null else
            planeHit?.takeIf { it.confidence == HitConfidence.Good } ?: projected

        val depth = if (depthSupported) currentDepthSurface(frame, view, cameraPos, now) else null
        depthActive = depth != null
        val depthMatches = depth?.matches == true && trackedEvidence == null && !referenceEnabled
        // In Wall mode, the floor warning only triggers when the center reticle itself is directly
        // pointing at a horizontal floor plane, never just because a depth patch near the baseboard
        // touches the floor in the lower part of the view.
        val rawWrongOrientation = !referenceEnabled && trackedEvidence == null && (
            planeHit?.confidence == HitConfidence.Mismatched ||
                (surfaceType != SurfaceType.WALL && depth != null && !depth.matches && depth.orientation != SurfaceOrientation.SLANTED)
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
        val wrongOrientation = rawWrongOrientation && (lockedHit == null || offLocked)

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
                        placed.any { it.anchor.trackingState == TrackingState.STOPPED }
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
        val measurement = computeMeasurement(currentHit?.position)
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
                areaSquareMeters = measurement.third,
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

        updateGuides(currentHit?.position)
        val dotsHit = placeable ?: candidate ?: trackedEvidence ?: depth?.takeIf { it.matches }?.let { d ->
            intersectCentreRay(frame, d.fit.signature())
        }
        updateSurfaceDots(frame, dotsHit, wrongOrientation || offLocked)

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
        // Hold through brief tracking dips (< 1.4 s) caused by camera auto-exposure shifts,
        // specular reflections, or sudden dark shadow patches on the wall so the AR session
        // does not abruptly drop the locked surface or placed points.
        val hasActiveSurface = placed.isNotEmpty() || quickLockedSurface != null || quickPlane != null || lockAnchor != null
        val withinGrace = everTracked &&
            hasActiveSurface &&
            reason != TrackingFailureReason.CAMERA_UNAVAILABLE &&
            lastFullTrackingAt > 0L &&
            now - lastFullTrackingAt <= TRACKING_GRACE_MS
        if (withinGrace) {
            return
        }

        currentHit = null
        lastValidHit = null
        snappedHit = null
        clearAssist()
        hideSurfaceDots()
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
                if (placed.any { it.anchor.trackingState == TrackingState.STOPPED }) return null
                val pose = anchor.pose
                val normal = FloatArray(3)
                pose.getTransformedAxis(1, 1f, normal, 0)
                if (!SurfaceOrientationClassifier.matches(surfaceType,
                        SurfaceOrientationClassifier.classify(WorldPoint3(normal[0], normal[1], normal[2])))) return null
                lockTracker.refreshLock(
                    WorldPoint3(normal[0], normal[1], normal[2]),
                    WorldPoint3(pose.tx(), pose.ty(), pose.tz())
                )
                val raw = PlaneSignature(normal[0], normal[1], normal[2], pose.tx(), pose.ty(), pose.tz())
                if (surfaceType == SurfaceType.WALL) {
                    ArMeasurementGeometry.verticalWallPlane(raw, placed.firstOrNull()?.position()?.toWorldPoint())
                } else {
                    raw
                }
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
        val rayDir = WorldPoint3(direction[0], direction[1], direction[2])
        val p0 = placed.firstOrNull()?.position()?.toWorldPoint()
        val lockedPlane = if (surfaceType == SurfaceType.WALL) {
            ArMeasurementGeometry.verticalWallPlane(plane, anchorPoint = p0, fallbackCameraDir = rayDir)
        } else {
            plane
        }
        val rawIntersection = ArMeasurementGeometry.intersectRayWithPlane(
            origin,
            rayDir,
            lockedPlane,
            MIN_HIT_DISTANCE_M,
            MAX_HIT_DISTANCE_M
        ) ?: return null
        if (surfaceType == SurfaceType.WALL &&
            ArMeasurementGeometry.isWallRaycastDepthSpike(origin, rayDir, lockedPlane, rawIntersection, p0)
        ) return null
        val intersection = when {
            surfaceType == SurfaceType.WALL && placed.size == 1 ->
                ArMeasurementGeometry.constrainWallWidthPoint(placed[0].position().toWorldPoint(), rawIntersection, lockedPlane)
            surfaceType == SurfaceType.WALL && placed.size == 2 ->
                ArMeasurementGeometry.constrainWallHeightPoint(
                    placed[0].position().toWorldPoint(),
                    placed[1].position().toWorldPoint(),
                    rawIntersection,
                    lockedPlane
                )
            else -> rawIntersection
        }
        return ValidatedHit(
            hit = null,
            plane = null,
            position = Float3(intersection.x, intersection.y, intersection.z),
            kind = if (surfaceType == SurfaceType.WALL) HitKind.VerticalPlane else HitKind.HorizontalDownward,
            confidence = HitConfidence.Good,
            distance = ArMeasurementGeometry.distance(origin, intersection).toFloat(),
            surface = lockedPlane
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
            if (surfaceType == SurfaceType.WALL && planeHit.kind == HitKind.HorizontalUpward) {
                if (ArMeasurementGeometry.isFloorOccludingWall(
                        wallHitY = lockedHit.position.y,
                        wallHitDistance = lockedHit.distance,
                        floorPlaneY = planeHit.position.y,
                        floorHitDistance = planeHit.distance
                    )) return true
            } else if (abs(planeHit.distance - lockedHit.distance) > tolerance) {
                return true
            }
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
            if (hit.distance < MIN_HIT_DISTANCE_M || hit.distance > MAX_HIT_DISTANCE_M) continue

            val kind = planeKind(trackable, cameraY)
            val matches = matchesSurface(kind)
            val inPolygon = trackable.isPoseInPolygon(hit.hitPose)
            // Only extend beyond the strict polygon (into extents or 45 cm boundary margin) for
            // planes that match the selected surface; a floor plane in Wall mode must never
            // claim hits outside its actual polygon (e.g. behind the baseboard of a wall).
            val inExtents = matches && trackable.isPoseInExtents(hit.hitPose)
            val nearBoundary = matches && !inPolygon && !inExtents &&
                CornerGeometry.distanceToPlaneBoundary(trackable, hit.hitPose.toFloat3()) <= 0.45f
            if (!inPolygon && !inExtents && !nearBoundary) continue

            if (best == null) {
                best = hit
                bestPlane = trackable
            } else {
                val bestKind = planeKind(bestPlane!!, cameraY)
                val bestMatches = matchesSurface(bestKind)
                if (matches && !bestMatches) {
                    val occluded = if (surfaceType == SurfaceType.WALL && bestKind == HitKind.HorizontalUpward) {
                        ArMeasurementGeometry.isFloorOccludingWall(
                            wallHitY = hit.hitPose.ty(),
                            wallHitDistance = hit.distance,
                            floorPlaneY = bestPlane!!.centerPose.ty(),
                            floorHitDistance = best!!.distance
                        )
                    } else {
                        hit.distance - best!!.distance > occlusionTolerance(best!!.distance)
                    }
                    if (!occluded) {
                        best = hit
                        bestPlane = trackable
                    }
                } else if (!matches && bestMatches) {
                    val occludesBest = if (surfaceType == SurfaceType.WALL && kind == HitKind.HorizontalUpward) {
                        ArMeasurementGeometry.isFloorOccludingWall(
                            wallHitY = best!!.hitPose.ty(),
                            wallHitDistance = best!!.distance,
                            floorPlaneY = trackable.centerPose.ty(),
                            floorHitDistance = hit.distance
                        )
                    } else {
                        best!!.distance - hit.distance > occlusionTolerance(hit.distance)
                    }
                    if (occludesBest) {
                        best = hit
                        bestPlane = trackable
                    }
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
            if (surfaceType == SurfaceType.WALL && isBelowTrackedFloor(session, world[1], cameraPose.ty())) return@forEach
            val distance = ArMeasurementGeometry.distance(rayOrigin, intersection).toFloat()
            val local = plane.centerPose.inverse().transformPoint(world)
            val extentAllowance = 8.0f
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
        lastValidHit = null
        lastValidHitAt = 0L
        lastFullTrackingAt = 0L
        snappedHit = null
        validStreak = 0
        lastDepth = null
        trackedObservation = null
        referenceObservation = null
        lockTracker.clearSamples()
        resetSurfaceDots()
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
        quickPlane = null
        quickLockedSurface = null
        lastValidHit = null
        lastValidHitAt = 0L
        dropLock()
        lastDepth = null
        lastEvidenceAt = 0L
        searchingSince = SystemClock.uptimeMillis()
        currentHit = null
        snappedHit = null
        validStreak = 0
        clearAssist()
        resetSurfaceDots()
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
            val p0 = placed[0].position()
            val drop = abs(candidate.y - p0.y)
            val spread = distance(candidate, p0)
            if (spread > 0.15f && drop < EDGE_ALIGN_TOLERANCE_M) 1.2f else 0f
        }
        2 -> {
            // Prefer candidates off the width axis — the height direction.
            val p0 = placed[0].position()
            val p1 = placed[1].position()
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
        val raw = PlaneSignature(
            normalX = normal[0],
            normalY = normal[1],
            normalZ = normal[2],
            centerX = plane.centerPose.tx(),
            centerY = plane.centerPose.ty(),
            centerZ = plane.centerPose.tz()
        )
        return if (plane.type == Plane.Type.VERTICAL) {
            ArMeasurementGeometry.verticalWallPlane(raw)
        } else {
            raw
        }
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
            heightFrom(placed[0].position(), placed[1].position(), hit.position)
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

        val constrainedWorld = when {
            surfaceType == SurfaceType.WALL && placed.size == 1 ->
                ArMeasurementGeometry.constrainWallWidthPoint(
                    placed[0].position().toWorldPoint(),
                    hit.position.toWorldPoint(),
                    lockPlane
                )
            surfaceType == SurfaceType.WALL && placed.size == 2 ->
                ArMeasurementGeometry.constrainWallHeightPoint(
                    placed[0].position().toWorldPoint(),
                    placed[1].position().toWorldPoint(),
                    hit.position.toWorldPoint(),
                    lockPlane
                )
            else -> ArMeasurementGeometry.projectOntoPlane(hit.position.toWorldPoint(), lockPlane)
        }
        val constrainedPos = Float3(constrainedWorld.x, constrainedWorld.y, constrainedWorld.z)
        if (placed.isEmpty() && surfaceType == SurfaceType.WALL) {
            gridNormal = ArMeasurementGeometry.verticalWallPlane(lockPlane, constrainedWorld).normal()
        }
        val pose = Pose(
            floatArrayOf(constrainedPos.x, constrainedPos.y, constrainedPos.z),
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

        placed += PlacedPoint(anchor, node, constrainedPos)
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
        quickPlane = null
        quickLockedSurface = null
        quickSamples.clear()
        currentHit = null
        snappedHit = null
        validStreak = 0
        resetSurfaceDots()
        update { it.copy(quickMode = enabled) }
    }

    /**
     * The point under the reticle, best evidence first: the first point's
     * wall plane once there is one; a tracked plane of the chosen surface (in
     * its outline, or its extension across a large wall); a depth patch or
     * depth point; a feature point; or the remembered wall/ceiling plane when
     * panning to a plain far corner.
     */
    private fun quickFrame(frame: Frame, view: ARSceneView, now: Long) {
        val session = view.session
        val camPose = frame.camera.pose
        val dir = FloatArray(3)
        camPose.getTransformedAxis(2, -1f, dir, 0)
        val origin = camPose.toWorldPoint()
        val ray = WorldPoint3(dir[0], dir[1], dir[2])
        // A first point placed before its wall was tracked joins the wall plane once ARCore finds it.
        if (quickPlane == null && placed.isNotEmpty() && session != null) {
            quickPlane = planeThrough(session, placed[0].position())
        }

        val centrePlaneHit = runCatching { validateHitAt(frame, view.width / 2f, view.height / 2f) }.getOrNull()
        val mismatchedPlane = centrePlaneHit?.takeIf { it.confidence == HitConfidence.Mismatched }

        val depthCandidate = if (depthSupported) quickDepthHit(frame, view, origin, ray, now) else null
        val pointCandidate = quickPointHit(frame, view, session, origin, ray, dir)
        val rememberedCandidate = if (placed.isEmpty()) quickHitOnRememberedSurface(session, origin, ray) else null

        // Allow live 3D depth/point wall hits above the floor to continuously refine quickLockedSurface
        // before Point A is placed, rather than locking onto the very first frame's unrefined feature
        // point (which is often underestimated before stereo baseline is established).
        val goodDepth = depthCandidate?.takeIf {
            it.confidence == HitConfidence.Good &&
                (surfaceType != SurfaceType.WALL || !isBelowTrackedFloor(session, it.position.y, origin.y))
        }
        val goodPoint = pointCandidate?.takeIf {
            it.confidence == HitConfidence.Good &&
                (surfaceType != SurfaceType.WALL || !isBelowTrackedFloor(session, it.position.y, origin.y))
        }
        val direct3dHit = quickPlaneHit(frame, view, camPose.ty())
            ?: session?.let { runCatching { projectCentreRayToTrackedPlane(it, frame) }.getOrNull() }
            ?: goodDepth
            ?: goodPoint

        // Filter depthCandidate and pointCandidate for Good confidence in the primary chain so a
        // noisy reflection or dark shadow spot (Mismatched/Other normal) never blocks fallback
        // to the remembered wall/ceiling plane.
        val rawFound = quickHitOnPlane(session, origin, ray, direct3dHit)
            ?: direct3dHit
            ?: rememberedCandidate
            ?: depthCandidate
            ?: pointCandidate

        // Before Point A is placed, a nearer tracked plane of the wrong orientation (such as the floor)
        // only blocks a wall hit if the center reticle itself is aimed below the baseboard onto the floor
        // in front of the wall (isFloorOccludingWall). As long as the center reticle is aimed at the
        // vertical wall (including near the bottom edge/baseboard while the floor is visible on screen),
        // the wall hit stays active.
        val occludedByWrongPlane = placed.isEmpty() && mismatchedPlane != null && rawFound != null && (
            if (surfaceType == SurfaceType.WALL && mismatchedPlane.kind == HitKind.HorizontalUpward) {
                ArMeasurementGeometry.isFloorOccludingWall(
                    wallHitY = rawFound.position.y,
                    wallHitDistance = rawFound.distance,
                    floorPlaneY = mismatchedPlane.position.y,
                    floorHitDistance = mismatchedPlane.distance
                )
            } else {
                rawFound.distance >= mismatchedPlane.distance - occlusionTolerance(mismatchedPlane.distance)
            }
        )
        val found = if (occludedByWrongPlane) mismatchedPlane else (rawFound ?: mismatchedPlane)

        // In Wall mode, the floor warning ("That looks like the floor") ONLY triggers when the
        // center reticle itself is directly pointing at a horizontal floor plane (or pointed
        // steeply down at the ground), never merely because the floor is visible in the lower
        // part of the camera view while the center reticle is aimed at the wall.
        val directCentreWrongPlane = mismatchedPlane?.kind
            ?: centrePlaneKind(frame, view, camPose.ty())?.takeIf { !matchesSurface(it) }
        val definiteWrongKind = if (found?.confidence == HitConfidence.Good) null else {
            directCentreWrongPlane
                ?: (if (surfaceType == SurfaceType.WALL && ray.y < -0.85f) HitKind.HorizontalUpward else null)
                ?: found?.kind?.takeIf {
                    it != HitKind.None && it != HitKind.Other && !matchesSurface(it) &&
                        !(surfaceType == SurfaceType.WALL && it == HitKind.HorizontalUpward)
                }
        }

        // Only the chosen surface takes points: a wall measurement never lands on
        // the floor or ceiling, a ceiling measurement never on a wall or the floor.
        // If a reflection or dark spot causes a momentary dropout (< 650 ms) while still aiming
        // at the surface, hold the last valid hit so the reticle does not drop out.
        val directHit = found?.takeIf { it.confidence == HitConfidence.Good }
        val hit = when {
            directHit != null -> {
                lastValidHit = directHit
                lastValidHitAt = now
                directHit
            }
            definiteWrongKind == null && lastValidHit != null && now - lastValidHitAt <= HIT_HOLD_GRACE_MS -> {
                rememberedCandidate ?: lastValidHit
            }
            else -> null
        }
        if (hit != null) {
            quickLockedSurface = hit.surface
        }
        val wrongKind = if (hit != null) null else definiteWrongKind
        currentHit = hit
        if (hit == null) {
            quickSamples.clear()
        } else {
            quickSamples.addLast(now to hit.position)
            while (quickSamples.size > QUICK_SAMPLES || now - quickSamples.first().first > QUICK_SAMPLE_WINDOW_MS) quickSamples.removeFirst()
        }
        val measurement = computeMeasurement(hit?.position)
        val surfaceConfirmed = hit != null || placed.isNotEmpty() || quickPlane != null || (quickLockedSurface != null && wrongKind == null)
        update { c ->
            val step = stepFor(placed.size)
            c.copy(
                quickMode = true,
                step = step,
                phase = if (step == MeasureStep.Complete) ArPhase.MeasurementComplete else ArPhase.Ready,
                confidence = when {
                    hit != null -> HitConfidence.Good
                    wrongKind != null -> HitConfidence.Mismatched
                    else -> HitConfidence.None
                },
                hitKind = hit?.kind ?: wrongKind ?: HitKind.None,
                surfaceDetected = hit != null,
                surfaceLocked = surfaceConfirmed,
                pointCount = placed.size,
                widthMeters = measurement.first,
                heightMeters = measurement.second,
                areaSquareMeters = measurement.third,
                transientMessage = activeTransient(now),
                torchAvailable = torchAvailable,
                torchEnabled = torchEnabled,
                scanStage = ScanStageResolver.resolve(true, hit != null, surfaceConfirmed, placed.size),
                issue = if (wrongKind != null) ScanIssue.WRONG_ORIENTATION else ScanIssue.NONE,
                canChangeSurface = false,
                diagnostics = null
            )
        }
        updateGuides(hit?.position)
        updateSurfaceDots(frame, hit ?: rememberedCandidate, wrongKind != null)
    }

    private fun placeQuickPoint(view: ARSceneView, session: Session): Boolean {
        val hit = currentHit ?: run { showTransient("Aim the reticle at the ${surfaceName()} first"); return false }
        val rawPosition = steadyQuickPosition(hit.position)
        val baseSurface = if (surfaceType == SurfaceType.WALL) {
            val anchorRef = placed.firstOrNull()?.position()?.toWorldPoint() ?: rawPosition.toWorldPoint()
            val lockedNormal = gridNormal ?: hit.surface.normal()
            val initialWall = ArMeasurementGeometry.verticalWallPlane(
                PlaneSignature(lockedNormal.x, 0f, lockedNormal.z, anchorRef.x, anchorRef.y, anchorRef.z),
                anchorPoint = anchorRef
            )
            // When placing Point B (Width end), refine the vertical wall plane normal from the
            // 2-point horizontal chord (Point A -> Point B) so a single-point normal error at
            // Point A cannot tilt the plane closer across a wide (5+ m) wall.
            if (placed.size == 1) {
                ArMeasurementGeometry.wallPlaneFromTwoPoints(
                    anchorA = anchorRef,
                    secondPoint = rawPosition.toWorldPoint(),
                    referencePlane = hit.surface
                ) ?: ArMeasurementGeometry.wallPlaneFromTwoPoints(
                    anchorA = anchorRef,
                    secondPoint = rawPosition.toWorldPoint(),
                    referencePlane = initialWall
                ) ?: ArMeasurementGeometry.verticalWallPlane(hit.surface, anchorPoint = anchorRef)
            } else {
                initialWall
            }
        } else {
            hit.surface
        }
        val constrainedWorld = when {
            surfaceType == SurfaceType.WALL && placed.size == 1 ->
                ArMeasurementGeometry.constrainWallWidthPoint(
                    placed[0].position().toWorldPoint(),
                    rawPosition.toWorldPoint(),
                    baseSurface
                )
            surfaceType == SurfaceType.WALL && placed.size == 2 ->
                ArMeasurementGeometry.constrainWallHeightPoint(
                    placed[0].position().toWorldPoint(),
                    placed[1].position().toWorldPoint(),
                    rawPosition.toWorldPoint(),
                    baseSurface
                )
            else -> ArMeasurementGeometry.projectOntoPlane(rawPosition.toWorldPoint(), baseSurface)
        }
        val position = Float3(constrainedWorld.x, constrainedWorld.y, constrainedWorld.z)
        val surface = if (surfaceType == SurfaceType.WALL) {
            val anchorRef = placed.firstOrNull()?.position()?.toWorldPoint() ?: constrainedWorld
            ArMeasurementGeometry.verticalWallPlane(baseSurface, anchorPoint = anchorRef)
        } else {
            baseSurface.copy(centerX = position.x, centerY = position.y, centerZ = position.z)
        }
        val pose = Pose(
            floatArrayOf(position.x, position.y, position.z),
            SurfaceMath.quaternionFromUpTo(surface.normal())
        )
        val anchor = try { session.createAnchor(pose) } catch (e: Throwable) {
            showTransient("Could not lock that point — try again"); return false
        }
        val node = try { createMarker(view, anchor, placed.size) } catch (e: Throwable) {
            anchor.detach(); showTransient("Could not place the marker — try again"); return false
        }
        if (placed.isEmpty() || (surfaceType == SurfaceType.WALL && placed.size == 1)) {
            gridNormal = surface.normal()
        }
        placed += PlacedPoint(anchor, node, position)
        quickLockedSurface = surface
        if (quickPlane == null) {
            quickPlane = hit.plane?.takeIf {
                matchesSurface(planeKind(it)) && ArMeasurementGeometry.areCoplanar(surface, planeSignature(it))
            } ?: planeThrough(session, position)
        }
        quickSamples.clear()
        pendingRecordEvent = "point_${placed.size}"
        onPointPlaced()
        refreshAfterPointChange()
        return true
    }

    /**
     * Quick measure: intersects the reticle ray with the locked wall/ceiling plane after Point A
     * is placed. When measuring Width on a wall (`placed.size == 1`) and a direct 3D surface hit
     * ([direct3dHit]) is available at the reticle, refines the vertical wall plane normal using the
     * 2-point horizontal chord `(Point A -> direct3dHit)` so the plane passes through the true 3D
     * depth at both ends of a wide wall (e.g. 5+ m) instead of tilting closer from a single-point
     * normal error at Point A.
     */
    private fun quickHitOnPlane(
        session: Session?,
        origin: WorldPoint3,
        ray: WorldPoint3,
        direct3dHit: ValidatedHit? = null
    ): ValidatedHit? {
        if (placed.isEmpty() && quickPlane == null) return null
        if (surfaceType == SurfaceType.WALL && (ray.y < -0.90f || ray.y > 0.90f)) return null
        if (surfaceType == SurfaceType.CEILING && ray.y < 0.05f) return null

        val p0 = placed.firstOrNull()?.position()?.toWorldPoint()
        val p1 = placed.getOrNull(1)?.position()?.toWorldPoint()
        var plane = quickPlane
        while (plane?.subsumedBy != null) plane = plane.subsumedBy
        quickPlane = plane
        val lockedNormal = gridNormal ?: quickLockedSurface?.normal()
        val activePlane = plane?.takeIf {
            it.trackingState == TrackingState.TRACKING &&
                (lockedNormal == null || ArMeasurementGeometry.areCoplanar(
                    PlaneSignature(lockedNormal.x, lockedNormal.y, lockedNormal.z, (p0?.x ?: 0f), (p0?.y ?: 0f), (p0?.z ?: 0f)),
                    planeSignature(it)
                ))
        }

        val rawSignature = when {
            // Once both Point A and Point B are placed on a wall, derive the vertical wall plane
            // from their live ARCore anchor chord (p0 -> p1) so both ends of the wall remain at
            // their true 3D depths as ARCore SLAM refines the anchors.
            surfaceType == SurfaceType.WALL && p0 != null && p1 != null -> {
                val fallbackRef = lockedNormal?.let {
                    PlaneSignature(it.x, 0f, it.z, p0.x, p0.y, p0.z)
                }
                ArMeasurementGeometry.wallPlaneFromTwoPoints(p0, p1, origin, fallbackRef)
                    ?: activePlane?.let { planeSignature(it).copy(centerX = p0.x, centerY = p0.y, centerZ = p0.z) }
                    ?: fallbackRef
                    ?: return null
            }
            // While aiming at Point B (Width end) on a wall, prefer an active tracked vertical
            // Plane normal or a 2-point vertical wall plane through (p0 -> direct3dHit) so the
            // far end of a 5+ m wall uses true 3D depth instead of single-point normal extrapolation.
            surfaceType == SurfaceType.WALL && p0 != null && placed.size == 1 -> {
                val baseRef = activePlane?.let { planeSignature(it).copy(centerX = p0.x, centerY = p0.y, centerZ = p0.z) }
                    ?: lockedNormal?.let { PlaneSignature(it.x, 0f, it.z, p0.x, p0.y, p0.z) }
                    ?: quickLockedSurface?.copy(centerX = p0.x, centerY = p0.y, centerZ = p0.z)
                val twoPoint = direct3dHit?.takeIf { it.confidence == HitConfidence.Good }?.let { direct ->
                    val hitPos = direct.position.toWorldPoint()
                    if (!ArMeasurementGeometry.isWallRaycastDepthSpike(origin, ray, baseRef ?: direct.surface, hitPos, p0)) {
                        ArMeasurementGeometry.wallPlaneFromTwoPoints(p0, hitPos, origin, baseRef ?: direct.surface)
                    } else null
                }
                twoPoint ?: baseRef ?: return null
            }
            activePlane != null -> {
                val sig = planeSignature(activePlane)
                if (p0 != null) sig.copy(centerX = p0.x, centerY = p0.y, centerZ = p0.z) else sig
            }
            placed.isNotEmpty() && lockedNormal != null -> {
                val anchor = p0!!
                PlaneSignature(lockedNormal.x, lockedNormal.y, lockedNormal.z, anchor.x, anchor.y, anchor.z)
            }
            placed.isNotEmpty() -> {
                val anchor = p0!!
                val base = quickLockedSurface
                if (base != null) {
                    base.copy(centerX = anchor.x, centerY = anchor.y, centerZ = anchor.z)
                } else {
                    val n = FloatArray(3)
                    placed[0].anchor.pose.getTransformedAxis(1, 1f, n, 0)
                    PlaneSignature(n[0], n[1], n[2], anchor.x, anchor.y, anchor.z)
                }
            }
            else -> return null
        }
        val signature = if (surfaceType == SurfaceType.WALL) {
            ArMeasurementGeometry.verticalWallPlane(rawSignature, anchorPoint = p0, fallbackCameraDir = ray)
        } else {
            rawSignature
        }
        quickLockedSurface = signature
        if (surfaceType == SurfaceType.WALL && placed.size >= 2) {
            gridNormal = signature.normal()
        }

        val rawPoint = ArMeasurementGeometry.intersectRayWithPlane(origin, ray, signature, MIN_HIT_DISTANCE_M, MAX_HIT_DISTANCE_M) ?: return null
        if (surfaceType == SurfaceType.CEILING && rawPoint.y <= origin.y + 0.12f) return null
        if (surfaceType == SurfaceType.WALL &&
            ArMeasurementGeometry.isWallRaycastDepthSpike(origin, ray, signature, rawPoint, p0)
        ) return null

        val point = when {
            surfaceType == SurfaceType.WALL && placed.size == 1 ->
                ArMeasurementGeometry.constrainWallWidthPoint(placed[0].position().toWorldPoint(), rawPoint, signature)
            surfaceType == SurfaceType.WALL && placed.size == 2 ->
                ArMeasurementGeometry.constrainWallHeightPoint(
                    placed[0].position().toWorldPoint(),
                    placed[1].position().toWorldPoint(),
                    rawPoint,
                    signature
                )
            else -> rawPoint
        }
        val distance = ArMeasurementGeometry.distance(origin, point).toFloat()
        val kind = if (activePlane != null) planeKind(activePlane, origin.y) else {
            if (surfaceType == SurfaceType.WALL) HitKind.VerticalPlane else HitKind.HorizontalDownward
        }
        val coplanarPlane = activePlane ?: session?.let { planeThrough(it, Float3(point.x, point.y, point.z)) }
        if (coplanarPlane != null && quickPlane == null) quickPlane = coplanarPlane
        return ValidatedHit(null, coplanarPlane, Float3(point.x, point.y, point.z), kind, HitConfidence.Good, distance, signature)
    }

    /**
     * Before Point A is placed: once the user has scanned the middle of a large plain wall/ceiling
     * and established [quickLockedSurface], panning to a plain corner, reflection, or dark shadow
     * spot on that same surface keeps the reticle active on the remembered plane as long as the
     * camera is still aimed at the surface.
     */
    private fun quickHitOnRememberedSurface(session: Session?, origin: WorldPoint3, ray: WorldPoint3): ValidatedHit? {
        val signature = quickLockedSurface ?: return null
        if (surfaceType == SurfaceType.WALL && (ray.y < -0.85f || ray.y > 0.85f)) return null
        if (surfaceType == SurfaceType.CEILING && ray.y < 0.25f) return null
        val point = ArMeasurementGeometry.intersectRayWithPlane(origin, ray, signature, MIN_HIT_DISTANCE_M, MAX_HIT_DISTANCE_M) ?: return null
        if (surfaceType == SurfaceType.CEILING && point.y <= origin.y + 0.12f) return null
        if (surfaceType == SurfaceType.WALL && isBelowTrackedFloor(session, point.y, origin.y)) return null
        val distance = ArMeasurementGeometry.distance(origin, point).toFloat()
        val kind = if (surfaceType == SurfaceType.WALL) HitKind.VerticalPlane else HitKind.HorizontalDownward
        return ValidatedHit(null, null, Float3(point.x, point.y, point.z), kind, HitConfidence.Good, distance, signature)
    }

    /** Quick measure: an ARCore hit on a tracked plane of the chosen surface, inside its outline. */
    private fun quickPlaneHit(frame: Frame, view: ARSceneView, cameraY: Float): ValidatedHit? = runCatching {
        frame.hitTest(view.width / 2f, view.height / 2f).firstNotNullOfOrNull { hit ->
            val plane = hit.trackable as? Plane ?: return@firstNotNullOfOrNull null
            val kind = planeKind(plane, cameraY)
            if (hit.distance !in MIN_HIT_DISTANCE_M..MAX_HIT_DISTANCE_M || plane.trackingState != TrackingState.TRACKING ||
                !plane.isPoseInPolygon(hit.hitPose) || !matchesSurface(kind)
            ) return@firstNotNullOfOrNull null
            val pose = hit.hitPose
            ValidatedHit(hit, plane, Float3(pose.tx(), pose.ty(), pose.tz()), kind, HitConfidence.Good, hit.distance, planeSignature(plane))
        }
    }.getOrNull()

    /** Quick measure: a 9x9 depth patch plane under the reticle when the device supports Depth API. */
    private fun quickDepthHit(
        frame: Frame,
        view: ARSceneView,
        origin: WorldPoint3,
        ray: WorldPoint3,
        now: Long
    ): ValidatedHit? {
        val depth = currentDepthSurface(frame, view, origin, now) ?: return null
        val signature = depth.fit.signature()
        val point = ArMeasurementGeometry.intersectRayWithPlane(
            origin,
            ray,
            signature,
            MIN_HIT_DISTANCE_M,
            MAX_HIT_DISTANCE_M
        ) ?: depth.fit.centroid
        val distance = ArMeasurementGeometry.distance(origin, point).toFloat()
        if (distance !in MIN_HIT_DISTANCE_M..MAX_HIT_DISTANCE_M) return null
        val kind = depth.orientation.toHitKind()
        val confidence = if (depth.matches) HitConfidence.Good else HitConfidence.Mismatched
        return ValidatedHit(null, null, Float3(point.x, point.y, point.z), kind, confidence, distance, signature)
    }

    /** Quick measure, last resort: a depth point, else a feature point, under or right next to the reticle. */
    private fun quickPointHit(
        frame: Frame,
        view: ARSceneView,
        session: Session?,
        origin: WorldPoint3,
        ray: WorldPoint3,
        dir: FloatArray
    ): ValidatedHit? = runCatching {
        val cx = view.width / 2f
        val cy = view.height / 2f
        val near = QUICK_PROBE_OFFSET_PX
        val far = QUICK_PROBE_OFFSET_PX * 2f
        // 9-point probe ring around the reticle so a localized reflection or sudden dark spot
        // at the center pixel is bypassed by neighboring points on the same wall/ceiling.
        // Center, horizontal, and upper probes are checked before lower probes so aiming near
        // the bottom edge/baseboard of a wall prefers the wall above rather than the floor below.
        val probes = listOf(
            cx to cy,
            (cx - near) to cy,
            (cx + near) to cy,
            cx to (cy - near),
            (cx - far) to (cy - far),
            (cx + far) to (cy - far),
            cx to (cy + near),
            (cx - far) to (cy + far),
            (cx + far) to (cy + far)
        )
        var fallbackMismatch: ValidatedHit? = null
        val remembered = quickLockedSurface
        for ((px, py) in probes) {
            if (px < 0f || px > view.width || py < 0f || py > view.height) continue
            val isCentreProbe = px == cx && py == cy
            val isLowerProbe = py > cy
            val hits = frame.hitTest(px, py).filter { hit ->
                hit.distance in MIN_HIT_DISTANCE_M..MAX_HIT_DISTANCE_M && hit.trackable.trackingState == TrackingState.TRACKING
            }
            val hit = hits.firstOrNull { it.trackable is com.google.ar.core.DepthPoint }
                ?: hits.firstOrNull { it.trackable is com.google.ar.core.Point }
                ?: continue
            val pose = hit.hitPose
            val hitWorld = pose.toWorldPoint()
            val trackable = hit.trackable
            val hasNormal = trackable is com.google.ar.core.DepthPoint ||
                (trackable is com.google.ar.core.Point && trackable.orientationMode == com.google.ar.core.Point.OrientationMode.ESTIMATED_SURFACE_NORMAL)
            // When aiming near the bottom edge/baseboard of a wall, never allow a lower neighbor
            // probe (below the center reticle) to pick up an unoriented feature point unless it
            // lies on the already-confirmed wall plane.
            if (surfaceType == SurfaceType.WALL && isLowerProbe && !hasNormal &&
                (remembered == null || ArMeasurementGeometry.distanceToPlane(hitWorld, remembered) > 0.12f)
            ) continue
            val estimatedNormal = if (hasNormal) {
                val n = FloatArray(3)
                pose.getTransformedAxis(1, 1f, n, 0)
                SurfaceOrientationClassifier.orientTowardsCamera(WorldPoint3(n[0], n[1], n[2]), hitWorld, origin)
            } else null

            val rawKind = if (estimatedNormal != null) {
                val classified = ArMeasurementGeometry.classifyNormal(estimatedNormal.y)
                // Specular reflections and shadow edges slightly perturb depth normals; if the point
                // lies on the already-detected wall/ceiling plane, snap to that surface orientation.
                if (classified == HitKind.Other && remembered != null &&
                    ArMeasurementGeometry.distanceToPlane(hitWorld, remembered) <= 0.16f &&
                    ((surfaceType == SurfaceType.WALL && abs(estimatedNormal.y) <= 0.55f) ||
                        (surfaceType == SurfaceType.CEILING && estimatedNormal.y <= -0.55f))
                ) {
                    if (surfaceType == SurfaceType.WALL) HitKind.VerticalPlane else HitKind.HorizontalDownward
                } else {
                    classified
                }
            } else {
                ArMeasurementGeometry.classifyViewDirection(surfaceType, dir[1])
            }
            val kind = when {
                surfaceType == SurfaceType.CEILING && hitWorld.y <= origin.y + 0.12f -> {
                    if (hitWorld.y < origin.y - 0.15f) HitKind.HorizontalUpward else HitKind.VerticalPlane
                }
                // For an unoriented feature point (!hasNormal) in Wall mode before a wall is
                // locked, only treat it as the floor if its 3D pose actually sits inside a tracked
                // horizontal floor plane polygon; never reject the lower wall or baseboard just
                // because the camera is tilted downward or the point's Y is near floor height.
                surfaceType == SurfaceType.WALL && !hasNormal && placed.isEmpty() && quickPlane == null &&
                    (remembered == null || ArMeasurementGeometry.distanceToPlane(hitWorld, remembered) > 0.16f) &&
                    isPointOnTrackedFloorPolygon(session, pose, hitWorld.y, origin.y) -> HitKind.HorizontalUpward
                else -> rawKind
            }
            val fallbackWallNormal = if (surfaceType == SurfaceType.WALL) {
                quickPlane?.takeIf { it.trackingState == TrackingState.TRACKING }?.let { planeSignature(it).normal() }
                    ?: quickLockedSurface?.normal()
            } else null
            val surface = ArMeasurementGeometry.surfacePlaneSignature(kind, hitWorld, ray, estimatedNormal, fallbackWallNormal)
            val projected = if (isCentreProbe) {
                hitWorld
            } else {
                ArMeasurementGeometry.intersectRayWithPlane(origin, ray, surface, MIN_HIT_DISTANCE_M, MAX_HIT_DISTANCE_M) ?: hitWorld
            }
            val distance = ArMeasurementGeometry.distance(origin, projected).toFloat()
            if (distance !in MIN_HIT_DISTANCE_M..MAX_HIT_DISTANCE_M) continue
            val confidence = if (matchesSurface(kind)) HitConfidence.Good else HitConfidence.Mismatched
            val candidate = ValidatedHit(
                hit = hit,
                plane = null,
                position = Float3(projected.x, projected.y, projected.z),
                kind = kind,
                confidence = confidence,
                distance = distance,
                surface = surface.copy(centerX = projected.x, centerY = projected.y, centerZ = projected.z)
            )
            if (confidence == HitConfidence.Good) return@runCatching candidate
            if (isCentreProbe && fallbackMismatch == null) fallbackMismatch = candidate
        }
        fallbackMismatch
    }.getOrNull()

    /** Whether [pose] at height [pointY] sits directly inside a tracked horizontal floor plane polygon. */
    private fun isPointOnTrackedFloorPolygon(session: Session?, pose: Pose, pointY: Float, cameraY: Float): Boolean {
        if (session == null) return false
        return session.getAllTrackables(Plane::class.java).any { plane ->
            plane.trackingState == TrackingState.TRACKING &&
                plane.subsumedBy == null &&
                planeKind(plane, cameraY) == HitKind.HorizontalUpward &&
                abs(pointY - plane.centerPose.ty()) <= 0.05f &&
                plane.isPoseInPolygon(pose)
        }
    }

    /** The Y elevation of the lowest tracked horizontal floor plane well below the camera, if any. */
    private fun lowestTrackedFloorY(session: Session?, cameraY: Float): Float? {
        if (session == null) return null
        return session.getAllTrackables(Plane::class.java)
            .asSequence()
            .filter { plane ->
                plane.trackingState == TrackingState.TRACKING &&
                    plane.subsumedBy == null &&
                    planeKind(plane, cameraY) == HitKind.HorizontalUpward &&
                    plane.centerPose.ty() <= cameraY - 0.45f
            }
            .map { it.centerPose.ty() }
            .minOrNull()
    }

    /** Whether [pointY] falls below the tracked room floor plane. */
    private fun isBelowTrackedFloor(session: Session?, pointY: Float, cameraY: Float): Boolean {
        val floorY = lowestTrackedFloorY(session, cameraY) ?: return false
        return pointY < floorY - ArMeasurementGeometry.WALL_FLOOR_JUNCTION_TOLERANCE_M
    }

    /** The kind of the first tracked plane under the reticle, whatever surface was chosen. */
    private fun centrePlaneKind(frame: Frame, view: ARSceneView, cameraY: Float): HitKind? = runCatching {
        frame.hitTest(view.width / 2f, view.height / 2f).firstNotNullOfOrNull { hit ->
            val plane = hit.trackable as? Plane ?: return@firstNotNullOfOrNull null
            if (plane.trackingState != TrackingState.TRACKING || !plane.isPoseInPolygon(hit.hitPose)) return@firstNotNullOfOrNull null
            planeKind(plane, cameraY)
        }
    }.getOrNull()

    /**
     * A tracked plane of the chosen surface that [point] lies on (within QUICK_PLANE_TOLERANCE_M)
     * AND whose normal agrees with the current locked surface ([quickLockedSurface]), so a
     * perpendicular or skewed plane passing through [point] can never hijack the measurement plane.
     */
    private fun planeThrough(session: Session, point: Float3): Plane? {
        val locked = quickLockedSurface
        return session.getAllTrackables(Plane::class.java)
            .filter { plane ->
                plane.trackingState == TrackingState.TRACKING &&
                    plane.subsumedBy == null &&
                    matchesSurface(planeKind(plane)) &&
                    (locked == null || ArMeasurementGeometry.areCoplanar(locked, planeSignature(plane)))
            }
            .map { it to ArMeasurementGeometry.distanceToPlane(point.toWorldPoint(), planeSignature(it)) }
            .filter { it.second <= QUICK_PLANE_TOLERANCE_M }
            .minByOrNull { it.second }?.first
    }

    /**
     * The point to place: the middle of the reticle's last few positions
     * (about half a second) when they agree, which takes out hand shake; just
     * the latest one if the phone was still moving.
     */
    private fun steadyQuickPosition(latest: Float3): Float3 {
        val samples = quickSamples.map { it.second.toWorldPoint() }
        if (samples.size < 3) return latest
        val middle = ArMeasurementGeometry.medianPoint(samples)
        val spread = samples.maxOf { ArMeasurementGeometry.distance(it, middle) }
        return if (spread <= QUICK_STEADY_SPREAD_M) Float3(middle.x, middle.y, middle.z) else latest
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
        if (placed.isEmpty()) {
            quickPlane = null
        }
        quickSamples.clear()
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
        quickPlane = null
        quickLockedSurface = null
        lastValidHit = null
        lastValidHitAt = 0L
        quickSamples.clear()
        dropLock()
        lastDepth = null
        lastEvidenceAt = 0L
        currentHit = null
        snappedHit = null
        pendingRecordEvent = "reset"
        clearGuides()
        resetSurfaceDots()
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
        clearGuides()
        if (placed.size >= 3) {
            if (gridCornerOffsets.size != 4) {
                initializeGridCorners()
            }
            placed.forEach { it.node.isVisible = false }
        } else {
            gridCornerOffsets.clear()
            gridNormal = null
            activeCornerIndex = null
            clearCornerNodes()
            placed.forEach { it.node.isVisible = true }
        }
        val measurement = computeMeasurement()
        val locked = lockAnchor != null || (quickMode && (placed.isNotEmpty() || quickPlane != null || quickLockedSurface != null))
        val handles = if (placed.size >= 3) projectGridCornerHandles() else emptyList()
        update { current ->
            val step = stepFor(placed.size)
            current.copy(
                step = step,
                pointCount = placed.size,
                widthMeters = measurement.first,
                heightMeters = measurement.second,
                areaSquareMeters = measurement.third,
                phase = if (step == MeasureStep.Complete) {
                    ArPhase.MeasurementComplete
                } else if (quickMode) {
                    ArPhase.Ready
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
                scanStage = ScanStageResolver.resolve(everTracked, current.surfaceDetected || locked, locked, placed.size),
                cornerHandles = handles,
                activeCornerIndex = activeCornerIndex
            )
        }
        updateGuides()
    }

    /**
     * Returns the locked 3D plane signature that the 4 completed grid corners are constrained to.
     * On a wall with at least 2 placed anchors (Point A and Point B), uses the 2-point vertical
     * wall plane passing through both live ARCore anchors so SLAM scale refinements between the
     * left and right sides of a wide wall are preserved.
     */
    private fun currentGridSurface(): PlaneSignature? {
        if (placed.isEmpty()) return null
        val p0 = placed[0].position().toWorldPoint()
        val fallbackNormal = gridNormal
            ?: (if (quickMode) {
                quickPlane?.takeIf { it.trackingState == TrackingState.TRACKING }?.let { planeSignature(it).normal() }
                    ?: quickLockedSurface?.normal()
            } else {
                currentLockPlane()?.normal()
            })
            ?: run {
                val n = FloatArray(3)
                placed[0].anchor.pose.getTransformedAxis(1, 1f, n, 0)
                WorldPoint3(n[0], n[1], n[2])
            }
        val fallbackPlane = PlaneSignature(fallbackNormal.x, fallbackNormal.y, fallbackNormal.z, p0.x, p0.y, p0.z)
        if (surfaceType == SurfaceType.WALL && placed.size >= 2) {
            val p1 = placed[1].position().toWorldPoint()
            val twoPoint = ArMeasurementGeometry.wallPlaneFromTwoPoints(
                anchorA = p0,
                secondPoint = p1,
                referencePlane = fallbackPlane
            )
            if (twoPoint != null) {
                gridNormal = twoPoint.normal()
                return twoPoint
            }
        }
        gridNormal = fallbackNormal
        return fallbackPlane
    }

    private fun initializeGridCorners() {
        if (placed.size < 3) return
        gridCornerOffsets.clear()
        repeat(4) { gridCornerOffsets += WorldPoint3(0f, 0f, 0f) }
    }

    private fun liveBaseGridCorners(surface: PlaneSignature?): List<WorldPoint3> {
        val p0 = placed[0].position().toWorldPoint()
        val p1 = placed[1].position().toWorldPoint()
        val p2 = placed[2].position().toWorldPoint()
        return ArMeasurementGeometry.initialGridCorners(p0, p1, p2, surface)
    }

    /**
     * Live 3D world positions of the 4 grid corners `[bottomLeft, bottomRight, topRight, topLeft]`,
     * derived live from the 3 ARCore anchors (`placed[0]`, `placed[1]`, `placed[2]`) so multi-anchor
     * SLAM bundle adjustments across wide walls continuously refine the dimensions, plus any
     * independent per-corner manual drag offset in [gridCornerOffsets] projected onto the locked surface.
     */
    private fun currentGridCorners(): List<WorldPoint3> {
        if (placed.size < 3) return emptyList()
        if (gridCornerOffsets.size != 4) initializeGridCorners()
        val surface = currentGridSurface()
        val baseCorners = liveBaseGridCorners(surface)
        if (baseCorners.size < 4) return emptyList()
        return baseCorners.mapIndexed { index, base ->
            val offset = gridCornerOffsets[index]
            val raw = WorldPoint3(base.x + offset.x, base.y + offset.y, base.z + offset.z)
            if (surface != null) ArMeasurementGeometry.projectOntoPlane(raw, surface) else raw
        }
    }

    private fun projectGridCornerHandles(): List<GridCornerHandle> {
        if (placed.size < 3 || !hasCameraMatrices) return emptyList()
        return currentGridCorners().mapIndexed { index, corner ->
            val projected = ArMeasurementGeometry.projectWorldToScreen(corner, lastViewMatrix, lastProjectionMatrix)
            if (projected != null) {
                val nx = quantiseScreen(projected.first)
                val ny = quantiseScreen(projected.second)
                GridCornerHandle(
                    index = index,
                    normalisedX = nx,
                    normalisedY = ny,
                    visible = nx in -0.15f..1.15f && ny in -0.15f..1.15f
                )
            } else {
                GridCornerHandle(index = index, normalisedX = 0.5f, normalisedY = 0.5f, visible = false)
            }
        }
    }

    private fun quantiseScreen(value: Float): Float = kotlin.math.round(value * 2000f) / 2000f

    /**
     * Begins dragging whichever of the 4 grid corner handles is closest to normalised screen
     * coordinates ([normX], [normY]), if within touch range. Returns the grabbed corner index
     * (`0..3`), or `null` if the touch did not hit a corner handle.
     */
    fun beginCornerDrag(normX: Float, normY: Float, viewAspect: Float = 1f): Int? {
        if (released || placed.size < 3 || !hasCameraMatrices) return null
        val handles = projectGridCornerHandles().filter { it.visible }
        var bestHandle: GridCornerHandle? = null
        var bestDist = Float.MAX_VALUE
        for (h in handles) {
            val dx = (h.normalisedX - normX) * viewAspect.coerceAtLeast(0.4f)
            val dy = h.normalisedY - normY
            val dist = hypot(dx, dy)
            if (dist <= CORNER_HANDLE_TOUCH_RADIUS && dist < bestDist) {
                bestDist = dist
                bestHandle = h
            }
        }
        val picked = bestHandle ?: return null
        activeCornerIndex = picked.index
        cornerGrabOffsetX = picked.normalisedX - normX
        cornerGrabOffsetY = picked.normalisedY - normY
        onCornerLocked()
        updateGuides()
        update { it.copy(activeCornerIndex = picked.index, cornerHandles = handles) }
        return picked.index
    }

    /**
     * Moves the currently grabbed corner handle along the locked surface plane to follow
     * normalised screen coordinates ([normX], [normY]), dynamically rebuilding the 3D grid
     * lines and recalculating Width, Height, and Area in real time.
     */
    fun dragCornerTo(normX: Float, normY: Float): Boolean {
        val index = activeCornerIndex ?: return false
        if (released || placed.size < 3 || !hasCameraMatrices) return false
        val surface = currentGridSurface() ?: return false
        val targetNormX = (normX + cornerGrabOffsetX).coerceIn(-0.08f, 1.08f)
        val targetNormY = (normY + cornerGrabOffsetY).coerceIn(-0.08f, 1.08f)
        val hitOnPlane = ArMeasurementGeometry.intersectScreenRayWithPlane(
            normX = targetNormX,
            normY = targetNormY,
            viewMatrix = lastViewMatrix,
            projectionMatrix = lastProjectionMatrix,
            plane = surface,
            minDistance = MIN_HIT_DISTANCE_M,
            maxDistance = MAX_HIT_DISTANCE_M
        ) ?: return false

        val updatedCorners = ArMeasurementGeometry.moveGridCornerOnPlane(
            corners = currentGridCorners(),
            cornerIndex = index,
            targetPoint = hitOnPlane,
            plane = surface
        )
        val baseCorners = liveBaseGridCorners(surface)
        if (baseCorners.size == 4 && updatedCorners.size == 4) {
            if (gridCornerOffsets.size != 4) initializeGridCorners()
            val moved = updatedCorners[index]
            val base = baseCorners[index]
            gridCornerOffsets[index] = WorldPoint3(
                x = moved.x - base.x,
                y = moved.y - base.y,
                z = moved.z - base.z
            )
        }
        updateGuides()
        val measurement = computeMeasurement()
        val handles = projectGridCornerHandles()
        update {
            it.copy(
                widthMeters = measurement.first,
                heightMeters = measurement.second,
                areaSquareMeters = measurement.third,
                cornerHandles = handles,
                activeCornerIndex = index
            )
        }
        return true
    }

    /** Releases any active corner drag gesture. */
    fun endCornerDrag() {
        if (activeCornerIndex == null) return
        activeCornerIndex = null
        updateGuides()
        update {
            it.copy(
                activeCornerIndex = null,
                cornerHandles = if (placed.size >= 3) projectGridCornerHandles() else emptyList()
            )
        }
    }

    // -------------------------------------------------------------- geometry

    /**
     * width, height, area — derived live from anchor poses (and [previewPoint] while aiming at
     * the next corner) or from the 4 independent quadrilateral corners once all 3 points are placed
     * (using mean opposite-edge width/height and two-triangle quadrilateral area math).
     */
    private fun computeMeasurement(previewPoint: Float3? = null): Triple<Double, Double, Double> {
        if (placed.isEmpty()) return Triple(0.0, 0.0, 0.0)
        val p0 = placed[0].position()
        if (placed.size == 1) {
            val preview = previewPoint ?: return Triple(0.0, 0.0, 0.0)
            return Triple(ArMeasurementGeometry.distance(p0.toWorldPoint(), preview.toWorldPoint()), 0.0, 0.0)
        }
        val p1 = placed[1].position()
        val width = ArMeasurementGeometry.distance(p0.toWorldPoint(), p1.toWorldPoint())
        if (placed.size == 2) {
            val preview = previewPoint ?: return Triple(width, 0.0, 0.0)
            val (w, h) = ArMeasurementGeometry.rectangleSize(p0.toWorldPoint(), p1.toWorldPoint(), preview.toWorldPoint(), surfaceType)
            return Triple(w, h, w * h)
        }
        val corners = currentGridCorners()
        if (corners.size == 4) {
            val (w, h) = ArMeasurementGeometry.quadDimensions(corners)
            val area = ArMeasurementGeometry.quadArea(corners)
            return Triple(w, h, area)
        }
        val p2 = placed[2].position()
        // On a wall the level side is the width, whichever side was tapped first.
        val (w, h) = ArMeasurementGeometry.rectangleSize(p0.toWorldPoint(), p1.toWorldPoint(), p2.toWorldPoint(), surfaceType)
        return Triple(w, h, w * h)
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
        val (w, h, _) = computeMeasurement()
        return Triple(w, h, placed.size)
    }

    /** Full measurement snapshot including the exact two-triangle quadrilateral area. */
    fun snapshotWithArea(): ArMeasurementSnapshot {
        val (w, h, area) = computeMeasurement()
        return ArMeasurementSnapshot(w, h, area, placed.size)
    }

    // ------------------------------------------------------------ wall photo

    /**
     * Photographs the measured wall for the 3D preview: the camera view with
     * the markers, guide bars and plane dots hidden for that frame, plus where
     * the wall's corners were in it. Null if there is no full measurement or
     * tracking is lost; the measurement itself never depends on it.
     */
    suspend fun captureWallPhoto(target: File): WallPhoto? {
        val view = sceneView ?: return null
        if (released || placed.size < 3) return null
        val corners = currentGridCorners().takeIf { it.size == 4 }
            ?.map { WallPhotoGeometry.Vec(it.x, it.y, it.z) }
            ?: run {
                val taps = placed.take(3).map { point ->
                    val pos = point.position()
                    WallPhotoGeometry.Vec(pos.x, pos.y, pos.z)
                }
                WallPhotoGeometry.cornersFromTaps(taps[0], taps[1], taps[2])
            }

        val overlays = placed.map { it.node } + guideNodes + cornerNodes
        val planesVisible = view.planeRenderer.isVisible
        val dotsWereVisible = surfaceDotsNode?.isVisible == true
        dotsHiddenForPhoto = true
        overlays.forEach { it.isVisible = false }
        view.planeRenderer.isVisible = false
        surfaceDotsNode?.isVisible = false
        try {
            val request = CompletableDeferred<CameraMatrices>().also { cameraRequest = it }
            val camera = withTimeoutOrNull(1500) { request.await() } ?: return null
            // Let the frame drawn without the markers reach the screen before copying it.
            delay(120)
            val shot = copyPixels(view) ?: return null
            return withContext(Dispatchers.IO) {
                val scale = minOf(1f, PHOTO_MAX_SIDE / maxOf(shot.width, shot.height).toFloat())
                val saved = if (scale < 1f) Bitmap.createScaledBitmap(shot, (shot.width * scale).toInt(), (shot.height * scale).toInt(), true) else shot
                target.outputStream().use { saved.compress(Bitmap.CompressFormat.JPEG, 88, it) }
                WallPhoto(
                    fileName = target.name,
                    imageWidth = view.width,
                    imageHeight = view.height,
                    projection = camera.projection.toList(),
                    corners = corners.flatMap { WallPhotoGeometry.transform(camera.view, it).toList() }
                )
            }
        } catch (error: Exception) {
            Log.w(TAG, "Wall photo not taken", error)
            return null
        } finally {
            cameraRequest = null
            dotsHiddenForPhoto = false
            if (!released) {
                guideNodes.forEach { it.isVisible = true }
                cornerNodes.forEach { it.isVisible = placed.size >= 3 }
                placed.forEach { it.node.isVisible = placed.size < 3 }
                view.planeRenderer.isVisible = planesVisible
                surfaceDotsNode?.isVisible = dotsWereVisible
            }
        }
    }

    private suspend fun copyPixels(view: ARSceneView): Bitmap? {
        if (view.width == 0 || view.height == 0) return null
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        return suspendCancellableCoroutine { continuation ->
            PixelCopy.request(view, bitmap, { result ->
                continuation.resume(if (result == PixelCopy.SUCCESS) bitmap else null)
            }, Handler(Looper.getMainLooper()))
        }
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

    /**
     * 3D guide bars between placed points (and a live preview to [previewPoint]). Once the 3
     * points are connected, builds a fixed 3D grid structure (outer perimeter frame + interior
     * vertical and horizontal grid lines) anchored directly onto the measured surface.
     */
    private fun updateGuides(previewPoint: Float3? = null) {
        val view = sceneView ?: return
        if (placed.isEmpty() || (placed.size == 1 && previewPoint == null)) {
            if (guideNodes.isNotEmpty()) clearGuides()
            return
        }

        val segments = mutableListOf<ArMeasurementGeometry.GridSegment>()
        val p0 = placed[0].position()
        val surface = currentGridSurface()
        when (placed.size) {
            1 -> {
                val rawTarget = previewPoint!!.toWorldPoint()
                val target = if (surfaceType == SurfaceType.WALL && surface != null) {
                    ArMeasurementGeometry.constrainWallWidthPoint(p0.toWorldPoint(), rawTarget, surface)
                } else {
                    rawTarget
                }
                segments += ArMeasurementGeometry.GridSegment(
                    from = p0.toWorldPoint(),
                    to = target,
                    isOuterFrame = true
                )
            }
            2 -> {
                val p1 = placed[1].position()
                if (previewPoint != null) {
                    val corners = ArMeasurementGeometry.initialGridCorners(
                        first = p0.toWorldPoint(),
                        second = p1.toWorldPoint(),
                        third = previewPoint.toWorldPoint(),
                        plane = surface
                    )
                    segments += ArMeasurementGeometry.buildFixedGridSegmentsFromCorners(corners)
                } else {
                    val targetB = if (surfaceType == SurfaceType.WALL && surface != null) {
                        ArMeasurementGeometry.constrainWallWidthPoint(p0.toWorldPoint(), p1.toWorldPoint(), surface)
                    } else {
                        p1.toWorldPoint()
                    }
                    segments += ArMeasurementGeometry.GridSegment(
                        from = p0.toWorldPoint(),
                        to = targetB,
                        isOuterFrame = true
                    )
                }
            }
            else -> {
                val corners = currentGridCorners()
                segments += ArMeasurementGeometry.buildFixedGridSegmentsFromCorners(corners)
                updateCornerNodes(view, corners)
            }
        }
        if (placed.size < 3 && cornerNodes.isNotEmpty()) {
            clearCornerNodes()
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

        val completed = placed.size >= 3
        segments.forEachIndexed { index, segment ->
            val from = Float3(segment.from.x, segment.from.y, segment.from.z)
            val to = Float3(segment.to.x, segment.to.y, segment.to.z)
            val length = distance(from, to)
            if (length <= 0.01f) return@forEachIndexed
            val color = when {
                completed && segment.isOuterFrame -> MARKER_HEIGHT
                completed -> MARKER_GRID_INNER
                segment.isOuterFrame -> MARKER_POINT_B
                else -> MARKER_HEIGHT
            }
            val node = guideNodes.getOrNull(index) ?: CubeNode(
                engine = view.engine,
                size = Float3(1f, 1f, 1f),
                center = Float3(0f, 0f, 0f),
                materialInstance = view.materialLoader.createColorInstance(
                    color,
                    0.0f,
                    0.35f,
                    0.35f
                )
            ).also {
                guideNodes.add(it)
                view.addChildNodes(listOf(it))
            }

            val thickness = if (segment.isOuterFrame) OUTER_FRAME_THICKNESS_M else INNER_GRID_THICKNESS_M
            node.transform = segmentTransform(from, to, thickness)
        }
    }

    /**
     * Singularity-free transform for a 3D bar from [from] to [to] with square cross-section
     * [thickness]. Avoids `Node.lookAt`, whose fixed +Y up-vector degenerates on vertical wall lines.
     */
    private fun segmentTransform(from: Float3, to: Float3, thickness: Float): Mat4 {
        val dx = to.x - from.x
        val dy = to.y - from.y
        val dz = to.z - from.z
        val length = sqrt(dx * dx + dy * dy + dz * dz).coerceAtLeast(1e-4f)
        val fx = dx / length
        val fy = dy / length
        val fz = dz / length

        val uxRef: Float
        val uyRef: Float
        val uzRef: Float
        if (abs(fy) < 0.92f) {
            uxRef = 0f; uyRef = 1f; uzRef = 0f
        } else {
            uxRef = 1f; uyRef = 0f; uzRef = 0f
        }

        // right = normalize(upRef x forward)
        var rx = uyRef * fz - uzRef * fy
        var ry = uzRef * fx - uxRef * fz
        var rz = uxRef * fy - uyRef * fx
        val rLen = sqrt(rx * rx + ry * ry + rz * rz).coerceAtLeast(1e-4f)
        rx /= rLen; ry /= rLen; rz /= rLen

        // up = forward x right (right-handed orthonormal basis: right x up = +forward)
        val ux = fy * rz - fz * ry
        val uy = fz * rx - fx * rz
        val uz = fx * ry - fy * rx

        val cx = (from.x + to.x) * 0.5f
        val cy = (from.y + to.y) * 0.5f
        val cz = (from.z + to.z) * 0.5f
        val fullLength = length + thickness
        return Mat4(
            Float4(rx * thickness, ry * thickness, rz * thickness, 0f),
            Float4(ux * thickness, uy * thickness, uz * thickness, 0f),
            Float4(fx * fullLength, fy * fullLength, fz * fullLength, 0f),
            Float4(cx, cy, cz, 1f)
        )
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
        clearCornerNodes()
    }

    /** Updates the 4 3D corner spheres at the exact 4 corners of the completed wall/ceiling grid. */
    private fun updateCornerNodes(view: ARSceneView, corners: List<WorldPoint3>) {
        if (corners.size < 4) {
            clearCornerNodes()
            return
        }
        corners.forEachIndexed { index, corner ->
            val node = cornerNodes.getOrNull(index) ?: SphereNode(
                engine = view.engine,
                radius = 0.015f,
                center = Float3(0f, 0f, 0f),
                materialInstance = view.materialLoader.createColorInstance(
                    MARKER_HEIGHT,
                    0.0f,
                    0.3f,
                    0.4f
                )
            ).also {
                cornerNodes.add(it)
                view.addChildNodes(listOf(it))
            }
            val scale = if (activeCornerIndex == index) 1.35f else 1.0f
            node.transform = Mat4(
                Float4(scale, 0f, 0f, 0f),
                Float4(0f, scale, 0f, 0f),
                Float4(0f, 0f, scale, 0f),
                Float4(corner.x, corner.y, corner.z, 1f)
            )
            node.isVisible = !dotsHiddenForPhoto
        }
    }

    private fun clearCornerNodes() {
        val view = sceneView
        cornerNodes.forEach { node ->
            runCatching {
                view?.removeChildNodes(listOf(node))
                node.destroy()
            }
        }
        cornerNodes.clear()
    }

    // ---------------------------------------------------------- surface dots

    /**
     * Renders the white plane dot grid only on the customer's chosen surface
     * (Wall or Ceiling), and hides it completely when aiming at the floor or
     * any non-matching surface.
     */
    private fun updateSurfaceDots(frame: Frame, hit: ValidatedHit?, wrongOrientation: Boolean) {
        val view = sceneView ?: return
        // Once all 3 points are connected, the fixed 3D grid structure is locked to the surface,
        // so the floating search dots are hidden.
        if (released || dotsHiddenForPhoto || placed.size >= 3 || frame.camera.trackingState != TrackingState.TRACKING || hit == null) {
            hideSurfaceDots()
            return
        }
        val cameraPos = frame.camera.pose.toWorldPoint()
        val orientedNormal = SurfaceOrientationClassifier.orientTowardsCamera(
            hit.surface.normal(),
            hit.position.toWorldPoint(),
            cameraPos
        )
        val allowed = ArMeasurementGeometry.shouldShowSurfaceDots(
            surfaceType = surfaceType,
            hitKind = hit.kind,
            confidence = hit.confidence,
            wrongOrientation = wrongOrientation,
            surfaceNormalY = orientedNormal.y,
            hitY = hit.position.y,
            cameraY = cameraPos.y
        )
        if (!allowed) {
            hideSurfaceDots()
            return
        }

        val orientedSignature = PlaneSignature(
            normalX = orientedNormal.x,
            normalY = orientedNormal.y,
            normalZ = orientedNormal.z,
            centerX = hit.position.x,
            centerY = hit.position.y,
            centerZ = hit.position.z
        )
        val existingOrigin = dotsOriginPose
        val existingSurface = dotsOriginSurface
        val originPose = if (existingOrigin != null && existingSurface != null &&
            ArMeasurementGeometry.areCoplanar(existingSurface, orientedSignature)
        ) {
            existingOrigin
        } else {
            Pose(
                floatArrayOf(hit.position.x, hit.position.y, hit.position.z),
                SurfaceMath.quaternionFromUpTo(orientedNormal)
            ).also {
                dotsOriginPose = it
                dotsOriginSurface = orientedSignature
            }
        }

        val plane = hit.plane?.takeIf { it.trackingState == TrackingState.TRACKING && matchesSurface(planeKind(it, cameraPos.y)) }
        val baseRadius = (hit.distance * 0.42f).coerceIn(0.45f, 1.80f)
        val rx = if (plane != null) max(baseRadius, (plane.extentX * 0.5f).coerceAtMost(2.5f)) else baseRadius
        val rz = if (plane != null) max(baseRadius, (plane.extentZ * 0.5f).coerceAtMost(2.5f)) else baseRadius
        // When aiming near the bottom edge/baseboard of a wall while the floor is visible on screen,
        // keep the dot grid centered on the wall above the floor line so the wall dots remain
        // visible on the wall and do not sink underground below the baseboard.
        val dotsCenterY = if (surfaceType == SurfaceType.WALL) {
            ArMeasurementGeometry.clampWallDotsCenterY(
                hitY = hit.position.y,
                floorY = lowestTrackedFloorY(view.session, cameraPos.y),
                radius = baseRadius
            )
        } else {
            hit.position.y
        }
        val localHit = originPose.inverse().transformPoint(
            floatArrayOf(hit.position.x, dotsCenterY, hit.position.z)
        )
        val cx = localHit[0]
        val cz = localHit[2]

        val vertices = buildDotsPolygonVertices(cx, cz, rx, rz)
        val node = surfaceDotsNode ?: createSurfaceDotsNode(view, vertices).also {
            surfaceDotsNode = it
        } ?: return

        runCatching {
            node.updateGeometry(vertices = vertices)
            val m = FloatArray(16)
            originPose.toMatrix(m, 0)
            node.transform = Mat4(
                Float4(m[0], m[1], m[2], m[3]),
                Float4(m[4], m[5], m[6], m[7]),
                Float4(m[8], m[9], m[10], m[11]),
                Float4(m[12], m[13], m[14], m[15])
            )
            node.isVisible = true
        }.onFailure {
            Log.w(TAG, "Surface dots update failed", it)
        }
    }

    private fun hideSurfaceDots() {
        surfaceDotsNode?.isVisible = false
    }

    private fun resetSurfaceDots() {
        surfaceDotsNode?.isVisible = false
        dotsOriginPose = null
        dotsOriginSurface = null
    }

    private fun createSurfaceDotsNode(
        view: ARSceneView,
        initialVertices: List<Geometry.Vertex>
    ): GeometryNode? = runCatching {
        val geometry = Geometry.Builder()
            .vertices(initialVertices)
            .indices(buildDotsPolygonIndices())
            .build(view.engine)
        GeometryNode(
            engine = view.engine,
            geometry = geometry,
            materialInstance = view.planeRenderer.planeMaterial.defaultInstance,
            builderApply = {
                castShadows(false)
                receiveShadows(false)
                culling(false)
            }
        ).also { node ->
            view.addChildNodes(listOf(node))
        }
    }.onFailure {
        Log.w(TAG, "Surface dots node creation failed", it)
    }.getOrNull()

    /**
     * Feathered polygon vertices in local plane coordinates (X, Z), matching
     * SceneView's plane_renderer.filamat shader where vertex Y is the feather
     * alpha (0.0 at the outer boundary, 1.0 in the interior).
     */
    private fun buildDotsPolygonVertices(
        cx: Float,
        cz: Float,
        rx: Float,
        rz: Float
    ): List<Geometry.Vertex> {
        val vertices = ArrayList<Geometry.Vertex>(DOTS_RING_VERTICES * 2)
        val up = Float3(0f, 1f, 0f)
        for (i in 0 until DOTS_RING_VERTICES) {
            val angle = i * 2.0 * PI / DOTS_RING_VERTICES
            val x = cx + rx * cos(angle).toFloat()
            val z = cz - rz * sin(angle).toFloat()
            vertices.add(Geometry.Vertex(position = Float3(x, 0f, z), normal = up))
        }
        for (i in 0 until DOTS_RING_VERTICES) {
            val angle = i * 2.0 * PI / DOTS_RING_VERTICES
            val x = cx + rx * DOTS_INNER_FEATHER_SCALE * cos(angle).toFloat()
            val z = cz - rz * DOTS_INNER_FEATHER_SCALE * sin(angle).toFloat()
            vertices.add(Geometry.Vertex(position = Float3(x, 1f, z), normal = up))
        }
        return vertices
    }

    private fun buildDotsPolygonIndices(): List<Int> {
        val n = DOTS_RING_VERTICES
        val indices = ArrayList<Int>((n - 2) * 3 + n * 6)
        val firstInner = n
        for (i in 0 until n - 2) {
            indices.add(firstInner)
            indices.add(firstInner + i + 1)
            indices.add(firstInner + i + 2)
        }
        for (i in 0 until n) {
            val outer1 = i
            val outer2 = (i + 1) % n
            val inner1 = firstInner + i
            val inner2 = firstInner + ((i + 1) % n)
            indices.add(outer1)
            indices.add(outer2)
            indices.add(inner1)
            indices.add(inner1)
            indices.add(outer2)
            indices.add(inner2)
        }
        return indices
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
        cornerNodes.clear()
        gridCornerOffsets.clear()
        gridNormal = null
        activeCornerIndex = null
        hasCameraMatrices = false
        surfaceDotsNode = null
        dotsOriginPose = null
        dotsOriginSurface = null
        quickPlane = null
        quickLockedSurface = null
        currentHit = null
        snappedHit = null
        lockedCorner = null
        lockAnchor = null
        lastDepth = null
        sceneView = null
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Whether every placed point projects inside the screen, in front of the camera. Uses a
     * small inset going out and a larger one coming back in so a dot right at the edge does
     * not flicker the status line. On a large wall where points extend past the screen edges,
     * this becomes false while [ArUiState.canConfirm] remains enabled.
     */
    private fun measuredAreaInView(frame: Frame): Boolean {
        if (placed.isEmpty()) return true
        val camera = frame.camera
        if (camera.trackingState != TrackingState.TRACKING) return false
        val view = FloatArray(16).also { camera.getViewMatrix(it, 0) }
        val projection = FloatArray(16).also { camera.getProjectionMatrix(it, 0, PHOTO_NEAR, PHOTO_FAR) }
        val viewProjection = FloatArray(16)
        android.opengl.Matrix.multiplyMM(viewProjection, 0, projection, 0, view, 0)
        val limit = if (_state.value.measuredAreaInView) 1f - VIEW_EXIT_INSET else 1f - VIEW_ENTER_INSET
        val world = FloatArray(4)
        val clip = FloatArray(4)
        return if (placed.size >= 3 && gridCornerOffsets.size == 4) {
            currentGridCorners().all { pos ->
                world[0] = pos.x; world[1] = pos.y; world[2] = pos.z; world[3] = 1f
                android.opengl.Matrix.multiplyMV(clip, 0, viewProjection, 0, world, 0)
                val w = clip[3]
                w > 0f && kotlin.math.abs(clip[0] / w) <= limit && kotlin.math.abs(clip[1] / w) <= limit
            }
        } else {
            placed.all { point ->
                if (point.anchor.trackingState == TrackingState.STOPPED) return@all false
                val pos = point.position()
                world[0] = pos.x; world[1] = pos.y; world[2] = pos.z; world[3] = 1f
                android.opengl.Matrix.multiplyMV(clip, 0, viewProjection, 0, world, 0)
                val w = clip[3]
                w > 0f && kotlin.math.abs(clip[0] / w) <= limit && kotlin.math.abs(clip[1] / w) <= limit
            }
        }
    }

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
        /** Quick measure: at most this many recent reticle positions, from the last QUICK_SAMPLE_WINDOW_MS, are averaged. */
        const val QUICK_SAMPLES = 5
        const val QUICK_SAMPLE_WINDOW_MS = 180L
        /** Positions further apart than this mean the phone was moving: the latest one is used instead. */
        const val QUICK_STEADY_SPREAD_M = 0.012f
        /** A first point this close to a tracked wall plane is taken to lie on it. */
        const val QUICK_PLANE_TOLERANCE_M = 0.04f
        /** Small reticle neighborhood offset (px) probed when the exact centre pixel misses a feature point. */
        const val QUICK_PROBE_OFFSET_PX = 28f
        /** Number of perimeter vertices for the feathered surface-dot polygon. */
        const val DOTS_RING_VERTICES = 16
        const val DOTS_INNER_FEATHER_SCALE = 0.78f
        /** Hold-through grace window when camera tracking briefly dips on reflections or dark spots. */
        const val TRACKING_GRACE_MS = 1_400L
        /** Hold-through window for the reticle hit across localized glare or shadow patches. */
        const val HIT_HOLD_GRACE_MS = 650L
        /** Touch hit radius (in normalised screen height units) for grabbing one of the 4 grid corner handles. */
        const val CORNER_HANDLE_TOUCH_RADIUS = 0.085f
        const val MARKER_POINT_A = 0xFFCE8A5A.toInt()
        const val MARKER_POINT_B = 0xFF38BDF8.toInt()
        const val MARKER_HEIGHT = 0xFF6FBF95.toInt()
        const val MARKER_GRID_INNER = 0xFF4FA882.toInt()
        const val OUTER_FRAME_THICKNESS_M = 0.009f
        const val INNER_GRID_THICKNESS_M = 0.0045f
        /** Clip planes for the wall photo's projection; the 3D preview uses the same. */
        const val VIEW_EXIT_INSET = 0.0f
        const val VIEW_ENTER_INSET = 0.06f
        const val PHOTO_NEAR = 0.05f
        const val PHOTO_FAR = 100f
        /** Longest side of the saved wall photo, in pixels. */
        const val PHOTO_MAX_SIDE = 1600f
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

data class ArMeasurementSnapshot(
    val widthMeters: Double,
    val heightMeters: Double,
    val areaSquareMeters: Double,
    val pointCount: Int
)
