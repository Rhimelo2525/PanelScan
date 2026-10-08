package com.example.panelscan.feature.measurement

import android.view.HapticFeedbackConstants
import java.io.File
import androidx.compose.runtime.key
import org.json.JSONObject
import androidx.compose.ui.platform.LocalContext
import com.example.panelscan.feature.measurement.ar.diagnostics.ArSessionRecorder
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FlashlightOff
import androidx.compose.material.icons.rounded.FlashlightOn
import androidx.compose.material.icons.rounded.HelpOutline
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.panelscan.BuildConfig
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.AnimatedMeasure
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.pressScale
import com.example.panelscan.feature.measurement.ar.ArCopyAction
import com.example.panelscan.feature.measurement.ar.ArDiagnostics
import com.example.panelscan.feature.measurement.ar.ArMeasureController
import com.example.panelscan.feature.measurement.ar.ArPhase
import com.example.panelscan.feature.measurement.ar.ArTone
import com.example.panelscan.feature.measurement.ar.ArUiState
import com.example.panelscan.feature.measurement.ar.cv.VisionPreviewFrame
import com.example.panelscan.feature.measurement.ar.CornerAssistState
import com.example.panelscan.feature.measurement.ar.CornerAssistStatus
import com.example.panelscan.feature.measurement.ar.DebugCandidate
import com.example.panelscan.feature.measurement.ar.DebugCandidateKind
import com.example.panelscan.feature.measurement.ar.MeasureStep
import com.example.panelscan.feature.measurement.ar.ReticleState
import com.example.panelscan.feature.measurement.ar.arCopy
import com.example.panelscan.feature.measurement.ar.stageLabel
import com.example.panelscan.feature.measurement.ar.stepLabel
import com.example.panelscan.feature.measurement.ar.quality.EnhancementMode
import com.example.panelscan.feature.measurement.ar.quality.ScanEnhancementSettings
import com.example.panelscan.feature.measurement.ar.quality.ScanStage
import com.example.panelscan.feature.measurement.ar.quality.SurfaceEvidenceSource
import com.example.panelscan.core.model.SurfaceType
import io.github.sceneview.ar.ARSceneView

/** One opaque surface value for all AR chrome, so nothing washes through from SceneView. */
private val ChromeSurface = Color(0xFF17191C)
private val ChromeBorder = Color(0x33FFFFFF)
private val ChromeOn = Color(0xFFF4F1EC)
private val ChromeInk = Color(0xFF16181B)
private val AccentCopper = Color(0xFFCE8A5A)
private val ConfirmedGreen = Color(0xFF6FBF95)

/**
 * The camera screen.
 *
 * Lifecycle contract: the [ARSceneView] is built once in the AndroidView factory, driven by
 * this route's own lifecycle, and released exactly once on dispose. Recomposition never
 * touches it — the factory closes over a remembered [ArMeasureController], and all
 * per-frame work happens inside that controller.
 */
@Composable
fun ARMeasurementScreen(
    viewModel: MeasurementViewModel,
    onClose: () -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier
) {
    val measurementState by viewModel.uiState.collectAsState()
    val surfaceType = measurementState.surfaceType
    val lifecycleOwner = LocalLifecycleOwner.current
    val hostView = LocalView.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var playbackFile by remember { mutableStateOf<File?>(null) }
    var replayGeneration by remember { mutableStateOf(0) }

    // Not keyed on surfaceType: the AndroidView factory runs once, so a re-keyed controller
    // would never be attached to the live view. Wall/Ceiling changes go through
    // controller.setSurfaceType instead, which is only allowed before the first point.
    val controller = remember(playbackFile, replayGeneration) {
        val selectedSurface = playbackFile?.let { file ->
            runCatching { SurfaceType.valueOf(JSONObject(File(file.parentFile, "metadata.json").readText()).getString("surface")) }.getOrNull()
        } ?: surfaceType
        ArMeasureController(
            surfaceType = selectedSurface,
            debug = BuildConfig.DEBUG,
            scope = scope,
            recorder = ArSessionRecorder(context.applicationContext),
            playbackFile = playbackFile,
            onPointPlaced = {
                hostView.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
            },
            onCornerLocked = {
                hostView.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            },
            onSurfaceConfirmed = {
                hostView.performHapticFeedback(
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                        HapticFeedbackConstants.CONFIRM
                    } else {
                        HapticFeedbackConstants.CONTEXT_CLICK
                    }
                )
            }
        )
    }
    val arState by controller.state
    val visionPreview by controller.visionPreview.collectAsState()
    var showVisionPreview by remember { mutableStateOf(false) }

    LaunchedEffect(controller, showVisionPreview) {
        controller.setVisionPreviewEnabled(showVisionPreview)
    }

    // Advanced scanning settings live in the ViewModel so they survive re-entering AR.
    LaunchedEffect(controller, measurementState.scanEnhancement) {
        controller.setEnhancement(measurementState.scanEnhancement)
    }

    DisposableEffect(controller) {
        onDispose { controller.release() }
    }

    // The camera release already extinguishes the torch; this clears ARCore's config too,
    // so returning to the screen never finds the light silently still on.
    DisposableEffect(lifecycleOwner, controller) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE) controller.onLifecyclePause()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val copy = arCopy(arState)
    var debugExpanded by remember { mutableStateOf(false) }
    var showHelpDialog by remember { mutableStateOf(false) }
    var showAdvanced by remember { mutableStateOf(false) }
    var showTools by remember { mutableStateOf(false) }
    val recording by controller.recorder.state

    fun toggleTorch() {
        if (controller.setTorchEnabled(!arState.torchEnabled)) {
            hostView.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
        }
    }

    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        key(controller) { AndroidView(
            // Tapping the scene places the point the reticle is already validating — the
            // tap is a trigger, never a second hit test at the finger.
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(controller) {
                    detectTapGestures { controller.placePoint() }
                },
            factory = { context ->
                // The camera-config selector prefers a hardware depth sensor where one exists:
                // depth that does not depend on visual texture is the best case for white walls.
                ARSceneView(
                    context = context,
                    sessionCameraConfig = { session -> controller.selectCameraConfig(session) }
                ).apply {
                    // Attach BEFORE handing over the lifecycle. Assigning `lifecycle` is
                    // what creates and resumes the ARCore session, and the session applies
                    // `sessionConfiguration` at creation — so configuring afterwards
                    // silently never takes effect.
                    controller.attach(this)
                    lifecycle = lifecycleOwner.lifecycle
                }
            },
            onRelease = { view ->
                runCatching { view.lifecycle = null }
                controller.release()
                runCatching { view.destroy() }
            }
        )

        }

        if (BuildConfig.DEBUG) {
            DebugCandidateOverlay(candidates = arState.debugCandidates)
        }

        CornerSuggestionMarker(assist = arState.assist)

        Reticle(
            state = arState.reticle,
            locked = arState.assist.status == CornerAssistStatus.Locked,
            surfaceLocked = arState.surfaceLocked,
            modifier = Modifier.align(Alignment.Center)
        )

        Column(
            modifier = Modifier.align(Alignment.TopCenter),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            TopControls(
                state = arState,
                onClose = { controller.stopRecording(); onClose() },
                onSelectSurface = { type ->
                    if (controller.setSurfaceType(type) && !arState.replaying) viewModel.setSurfaceType(type)
                },
                onToggleTorch = { toggleTorch() },
                onOpenAdvanced = { showAdvanced = true },
                onOpenHelp = { showHelpDialog = true },
                debugExpanded = debugExpanded,
                onToggleDebug = { debugExpanded = !debugExpanded }
            )
            SurfaceStatusChip(state = arState)
            if (recording.recording || arState.replaying) {
                Row(Modifier.background(ChromeSurface.copy(alpha = 0.94f)), verticalAlignment = Alignment.CenterVertically) {
                    if (recording.recording) {
                        Text("● ${recording.seconds}s", color = AccentCopper)
                        TextButton(onClick = controller::stopRecording) { Text("Stop", color = ChromeOn) }
                    }
                    if (arState.replaying) Text("Replay · diagnosis only", color = AccentCopper)
                }
            }
        }

        if (showVisionPreview) {
            VisionPreviewOverlay(
                frame = visionPreview,
                settings = measurementState.scanEnhancement,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(top = 158.dp)
            )
        }

        if (showHelpDialog) {
            HowToScanDialog(
                surfaceType = arState.surfaceType,
                onDismiss = { showHelpDialog = false }
            )
        }

        if (showTools) {
            ArToolsDialog(controller, arState,
                onReplay = { file -> playbackFile = file; replayGeneration++ },
                onDismiss = { showTools = false })
        }

        if (showAdvanced) {
            CameraSettingsDialog(
                autofocus = arState.autofocus,
                onAutofocus = controller::setAutofocus,
                torchAvailable = arState.torchAvailable,
                torchEnabled = arState.torchEnabled,
                onTorch = { toggleTorch() },
                onDismiss = { showAdvanced = false }
            )
        }

        if (BuildConfig.DEBUG && debugExpanded) {
            arState.diagnostics?.let { diagnostics ->
                DebugPanel(
                    diagnostics = diagnostics,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .statusBarsPadding()
                        .padding(start = Spacing.md, top = 96.dp)
                )
            }
        }

        BottomControls(
            state = arState,
            headline = copy.headline,
            instruction = copy.instruction,
            tone = copy.tone,
            action = copy.action,
            onAction = {
                when (copy.action) {
                    ArCopyAction.TurnOnLight -> controller.setTorchEnabled(true)
                    ArCopyAction.TurnOffLight -> controller.setTorchEnabled(false)
                    ArCopyAction.OpenTools -> showTools = true
                    null -> Unit
                }
            },
            onPlace = { controller.placePoint() },
            onUndo = {
                controller.undo()
                hostView.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            },
            onReset = {
                controller.reset()
                hostView.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            },
            onConfirm = {
                controller.stopRecording()
                val (w, h, points) = controller.snapshot()
                viewModel.applyArMeasurement(w, h, points)
                onConfirm()
            },
            modifier = Modifier.align(Alignment.BottomCenter)
        )

        (arState.phase as? ArPhase.Error)?.let { error ->
            ArErrorPanel(
                message = error.message,
                onClose = onClose,
                modifier = Modifier.align(Alignment.Center)
            )
        }
    }

    LaunchedEffect(arState.widthMeters, arState.heightMeters, arState.pointCount, arState.replaying) {
        if (arState.pointCount > 0 && !arState.replaying) {
            viewModel.applyArMeasurement(
                arState.widthMeters,
                arState.heightMeters,
                arState.pointCount
            )
        }
    }
}

// ---------------------------------------------------------------- top cluster

/**
 * Close on the left, the mode in the middle, tools on the right.
 *
 * The three groups sit at different weights on purpose: exit and mode are quiet, and the
 * tools that change what the camera is doing get the only filled states up here.
 */
@Composable
private fun TopControls(
    state: ArUiState,
    onClose: () -> Unit,
    onSelectSurface: (SurfaceType) -> Unit,
    onToggleTorch: () -> Unit,
    onOpenAdvanced: () -> Unit,
    onOpenHelp: () -> Unit,
    debugExpanded: Boolean,
    onToggleDebug: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = Spacing.md, vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        ArIconButton(
            icon = Icons.Rounded.Close,
            contentDescription = "Close AR measurement",
            onClick = onClose
        )

        Box(modifier = Modifier.weight(1f)) {
            SurfaceToggle(
                selected = state.surfaceType,
                enabled = state.canChangeSurface,
                onSelect = onSelectSurface
            )
        }

        ArIconButton(
            icon = Icons.Rounded.HelpOutline,
            contentDescription = "How to scan",
            onClick = onOpenHelp
        )
        ArIconButton(
            icon = Icons.Rounded.CameraAlt,
            contentDescription = "Camera settings",
            onClick = onOpenAdvanced,
        )
        if (state.torchAvailable) {
            TorchButton(enabled = state.torchEnabled, onClick = onToggleTorch)
        }
    }
}

/**
 * [ Wall | Ceiling ]. The scanner only accepts surfaces of the selected orientation, so the
 * choice is shown where the scanning happens. Locked once a point is placed — a measurement
 * cannot change surface halfway through.
 */
@Composable
private fun SurfaceToggle(
    selected: SurfaceType,
    enabled: Boolean,
    onSelect: (SurfaceType) -> Unit
) {
    Row(
        modifier = Modifier
            .height(40.dp)
            .clip(PanelScan.shapes.controlCompact)
            .background(ChromeSurface)
            .border(1.dp, ChromeBorder, PanelScan.shapes.controlCompact)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        listOf(SurfaceType.WALL to "Wall", SurfaceType.CEILING to "Ceiling").forEach { (type, label) ->
            val isSelected = type == selected
            val container by animateColorAsState(
                targetValue = if (isSelected) ChromeOn else Color.Transparent,
                animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
                label = "surfaceToggle"
            )
            Box(
                modifier = Modifier
                    .height(34.dp)
                    .clip(PanelScan.shapes.controlCompact)
                    .background(container)
                    .pressScale(
                        enabled = enabled && !isSelected,
                        onClick = if (enabled && !isSelected) ({ onSelect(type) }) else null
                    )
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    style = PanelScan.type.label,
                    color = when {
                        isSelected -> ChromeInk
                        enabled -> Color.White
                        else -> Color.White.copy(alpha = 0.35f)
                    },
                    maxLines = 1
                )
            }
        }
    }
}

/**
 * "Wall confirmed" once the surface is locked. The customer sees one clear moment when the
 * scanner has committed to the surface, like the Measure app's snap.
 */
@Composable
private fun SurfaceStatusChip(state: ArUiState) {
    AnimatedVisibility(
        visible = state.surfaceLocked && state.step != MeasureStep.Complete,
        enter = fadeIn(PanelScanMotion.spec(PanelScanMotion.Standard)) +
            slideInVertically(PanelScanMotion.spec(PanelScanMotion.Standard)) { -it / 2 },
        exit = fadeOut(PanelScanMotion.spec(PanelScanMotion.Fast))
    ) {
        Row(
            modifier = Modifier
                .padding(top = 2.dp)
                .clip(PanelScan.shapes.chip)
                .background(ChromeSurface.copy(alpha = 0.94f))
                .border(1.dp, ConfirmedGreen.copy(alpha = 0.6f), PanelScan.shapes.chip)
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Verified,
                contentDescription = null,
                tint = ConfirmedGreen,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = buildString {
                    append(if (state.surfaceType == SurfaceType.WALL) "Wall confirmed" else "Ceiling confirmed")
                    if (state.surfaceSource?.isDepth == true) append(" · depth")
                    if (state.surfaceSource == SurfaceEvidenceSource.REFERENCE_IMAGE) append(" · reference assisted")
                },
                style = PanelScan.type.label,
                color = Color.White
            )
        }
    }
}

@Composable
private fun HowToScanDialog(surfaceType: SurfaceType, onDismiss: () -> Unit) {
    val colors = PanelScan.colors
    val surface = if (surfaceType == SurfaceType.WALL) "wall" else "ceiling"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                Icon(
                    imageVector = Icons.Rounded.HelpOutline,
                    contentDescription = null,
                    tint = colors.accent
                )
                Text(
                    text = "How to scan",
                    style = PanelScan.type.sectionTitle,
                    color = colors.textPrimary
                )
            }
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                val steps = listOf(
                    "1. Scan — point your camera at the $surface and keep the entire surface visible.",
                    "2. Move slowly — move your phone slowly from side to side.",
                    "3. Surface detected — hold steady for a moment.",
                    "4. Surface confirmed — the $surface is locked; you can now measure anywhere on it.",
                    "5. Measure — tap one edge, the other edge (width), then the height.",
                    "6. Result — review the numbers and continue to your estimate."
                )
                steps.forEach { step ->
                    Text(text = step, style = PanelScan.type.body, color = colors.textSecondary)
                }
                Text(
                    text = "Plain or white ${surface}s",
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary,
                    modifier = Modifier.padding(top = Spacing.xs)
                )
                Text(
                    text = "Start the scan where the $surface has something visible — a corner, " +
                        "a switch, trim or where it meets the floor — and move slowly. Once it " +
                        "says \"Surface confirmed\" you can pan across the plain area and measure. " +
                        "Avoid pointing into direct sunlight or strong lamps.",
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary
                )
                Text(
                    text = "Corner Assist is optional and only snaps to real corners it can " +
                        "confirm in 3D. A corner is not required.",
                    style = PanelScan.type.supporting,
                    color = colors.textTertiary
                )
            }
        },
        confirmButton = {
            PrimaryButton(
                text = "Got it",
                onClick = onDismiss,
                fillMaxWidth = false,
                modifier = Modifier.padding(end = Spacing.xs)
            )
        },
        containerColor = colors.surfaceElevated,
        shape = PanelScan.shapes.card
    )
}

@Composable
private fun CameraSettingsDialog(
    autofocus: Boolean,
    onAutofocus: (Boolean) -> Unit,
    torchAvailable: Boolean,
    torchEnabled: Boolean,
    onTorch: () -> Unit,
    onDismiss: () -> Unit
) {
    val colors = PanelScan.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Camera settings", style = PanelScan.type.sectionTitle, color = colors.textPrimary) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Autofocus", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                        Text("Keeps near and far surfaces sharp. Turn off to lock focus at its current setting.",
                            style = PanelScan.type.supporting, color = colors.textSecondary)
                    }
                    Switch(checked = autofocus, onCheckedChange = onAutofocus,
                        colors = SwitchDefaults.colors(checkedTrackColor = colors.accent))
                }
                if (torchAvailable) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Flashlight", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                            Text("Helps in dim rooms. Turn it off if it makes glare on the surface.",
                                style = PanelScan.type.supporting, color = colors.textSecondary)
                        }
                        Switch(checked = torchEnabled, onCheckedChange = { onTorch() },
                            colors = SwitchDefaults.colors(checkedTrackColor = colors.accent))
                    }
                }
                Text("Exposure is automatic: the AR camera adjusts it by itself and Android does not let AR apps override it.",
                    style = PanelScan.type.supporting, color = colors.textTertiary)
            }
        },
        confirmButton = {
            PrimaryButton(text = "Done", onClick = onDismiss, fillMaxWidth = false,
                modifier = Modifier.padding(end = Spacing.xs))
        },
        containerColor = colors.surfaceElevated,
        shape = PanelScan.shapes.card
    )
}

/**
 * Advanced scanning. AUTO is the default and adapts to the lighting on its own; MANUAL
 * exposes brightness, contrast and saturation for the edge analysis only. None of these
 * alter the camera image ARCore tracks with or the preview on screen.
 */
@Composable
private fun AdvancedScanningDialog(
    settings: ScanEnhancementSettings,
    previewFrame: VisionPreviewFrame?,
    assistEnabled: Boolean,
    showVisionPreview: Boolean,
    onPreviewChange: (Boolean) -> Unit,
    onSettingsChange: (ScanEnhancementSettings) -> Unit,
    onAssistChange: (Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    val colors = PanelScan.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = "Advanced scanning", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Corner Assist", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                        Text(
                            "Snap to real corners confirmed in 3D.",
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                    }
                    Switch(
                        checked = assistEnabled,
                        onCheckedChange = onAssistChange,
                        colors = SwitchDefaults.colors(checkedTrackColor = colors.accent)
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Automatic enhancement", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                        Text(
                            "Recommended. Adapts edge analysis to bright, dim and plain surfaces.",
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                    }
                    Switch(
                        checked = settings.mode == EnhancementMode.AUTO,
                        onCheckedChange = { auto ->
                            onSettingsChange(settings.copy(mode = if (auto) EnhancementMode.AUTO else EnhancementMode.MANUAL))
                        },
                        colors = SwitchDefaults.colors(checkedTrackColor = colors.accent)
                    )
                }

                if (settings.mode == EnhancementMode.MANUAL) {
                    Text(
                        "For a dark image, raise Brightness a little. For a washed-out image, lower it. " +
                            "Raise Contrast to reveal faint edges. Saturation helps only when edges differ in colour. " +
                            "Use the preview below to compare; clipped white areas cannot be recovered by a slider.",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                    EnhancementSlider(
                        label = "Brightness",
                        value = settings.brightness,
                        range = -1f..1f,
                        display = { "%+d".format((it * 100).toInt()) },
                        onChange = { onSettingsChange(settings.copy(brightness = it)) }
                    )
                    EnhancementSlider(
                        label = "Contrast",
                        value = settings.contrast,
                        range = 0.5f..2.5f,
                        display = { "%.1f×".format(it) },
                        onChange = { onSettingsChange(settings.copy(contrast = it)) }
                    )
                    EnhancementSlider(
                        label = "Saturation (colour edges)",
                        value = settings.saturation,
                        range = 0f..2f,
                        display = { "%.1f×".format(it) },
                        onChange = { onSettingsChange(settings.copy(saturation = it)) }
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Preview vision enhancement", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                        Text(
                            "Compare a normal camera sample with the image Vision Assist analyses.",
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                    }
                    Switch(
                        checked = showVisionPreview,
                        onCheckedChange = onPreviewChange,
                        colors = SwitchDefaults.colors(checkedTrackColor = colors.accent)
                    )
                }

                if (showVisionPreview) {
                    VisionPreviewOverlay(frame = previewFrame, settings = settings)
                }

                Text(
                    text = "Vision enhancement only affects surface detection. " +
                        "It does not change the AR tracking camera.",
                    style = PanelScan.type.supporting,
                    color = colors.textTertiary
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = {
                    onSettingsChange(ScanEnhancementSettings.Default)
                    onAssistChange(true)
                },
                enabled = !settings.isDefault || !assistEnabled
            ) {
                Text("Reset to default", color = colors.textSecondary)
            }
        },
        confirmButton = {
            PrimaryButton(
                text = "Done",
                onClick = onDismiss,
                fillMaxWidth = false,
                modifier = Modifier.padding(end = Spacing.xs)
            )
        },
        containerColor = colors.surfaceElevated,
        shape = PanelScan.shapes.card
    )
}

@Composable
private fun VisionPreviewOverlay(
    frame: VisionPreviewFrame?,
    settings: ScanEnhancementSettings,
    modifier: Modifier = Modifier
) {
    val colours = PanelScan.colors
    Column(
        modifier = modifier
            .widthIn(max = 320.dp)
            .clip(PanelScan.shapes.card)
            .background(ChromeSurface.copy(alpha = 0.96f))
            .border(1.dp, ChromeBorder, PanelScan.shapes.card)
            .padding(Spacing.xs),
        verticalArrangement = Arrangement.spacedBy(Spacing.xxs)
    ) {
        Text("Vision enhancement active", style = PanelScan.type.label, color = ChromeOn)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
            listOf("NORMAL CAMERA" to frame?.normal, "VISION ENHANCED" to frame?.enhanced).forEach { (label, bitmap) ->
                Column(modifier = Modifier.weight(1f)) {
                    Text(label, style = PanelScan.type.label, color = colours.textSecondary, maxLines = 1)
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "$label analysis sample",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxWidth().height(144.dp).background(Color.DarkGray)
                        )
                    } else {
                        Box(modifier = Modifier.fillMaxWidth().height(144.dp).background(Color.DarkGray))
                    }
                }
            }
        }
        Text(
            text = if (settings.mode == EnhancementMode.AUTO) "AUTO · adapting to the scene" else
                "Brightness ${(settings.brightness * 100).toInt()} · Contrast ${"%.1f".format(settings.contrast)}× · Colour ${"%.1f".format(settings.saturation)}×",
            style = PanelScan.type.label,
            color = colours.textSecondary,
            maxLines = 2
        )
    }
}

@Composable
private fun EnhancementSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    display: (Float) -> String,
    onChange: (Float) -> Unit
) {
    val colors = PanelScan.colors
    Column {
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(label, style = PanelScan.type.label, color = colors.textSecondary, modifier = Modifier.weight(1f))
            Text(display(value), style = PanelScan.type.label, color = colors.textPrimary)
        }
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = range,
            colors = SliderDefaults.colors(thumbColor = colors.accent, activeTrackColor = colors.accent)
        )
    }
}

/**
 * The one AR control primitive: opaque squircle, hairline border, press scale, and a
 * filled selected state. Everything in the AR chrome is built from this so the cluster
 * reads as one set of tools rather than a row of unrelated pills.
 */
@Composable
private fun ArIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    selected: Boolean = false,
    size: Dp = 40.dp,
    label: String? = null
) {
    val container by animateColorAsState(
        targetValue = when {
            !enabled -> ChromeSurface.copy(alpha = 0.5f)
            selected -> ChromeOn
            else -> ChromeSurface
        },
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "arButtonContainer"
    )
    val content by animateColorAsState(
        targetValue = when {
            !enabled -> Color.White.copy(alpha = 0.35f)
            selected -> ChromeInk
            else -> Color.White
        },
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "arButtonContent"
    )

    Row(
        modifier = modifier
            .height(size)
            .clip(PanelScan.shapes.controlCompact)
            .background(container)
            .border(1.dp, if (selected) Color.Transparent else ChromeBorder, PanelScan.shapes.controlCompact)
            .pressScale(enabled = enabled, onClick = if (enabled) onClick else null)
            .padding(horizontal = if (label == null) 0.dp else 10.dp)
            .widthIn(min = if (label == null) size else 0.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = content,
            modifier = Modifier.size(size * 0.45f)
        )
        if (label != null) {
            Text(
                text = label,
                style = PanelScan.type.label,
                color = content,
                modifier = Modifier.padding(start = 5.dp)
            )
        }
    }
}

/** Torch. Icon swaps and the container fills; no glow, no pulse. */
@Composable
private fun TorchButton(enabled: Boolean, onClick: () -> Unit) {
    val scale = remember { Animatable(1f) }
    LaunchedEffect(enabled) {
        scale.animateTo(0.92f, PanelScanMotion.SpringPressSpec)
        scale.animateTo(1f, PanelScanMotion.SpringSoftSpec)
    }
    Box(modifier = Modifier.scale(scale.value)) {
        ArIconButton(
            icon = if (enabled) Icons.Rounded.FlashlightOn else Icons.Rounded.FlashlightOff,
            contentDescription = if (enabled) "Turn flashlight off" else "Turn flashlight on",
            onClick = onClick,
            selected = enabled
        )
    }
}

// ------------------------------------------------------------- bottom cluster

/**
 * Status, live metrics and actions, stacked in one column so the camera keeps the whole
 * upper two-thirds of the screen. Nothing here is a card: the status sits on a single
 * narrow surface and the buttons float free beneath it.
 */
@Composable
private fun BottomControls(
    state: ArUiState,
    headline: String,
    instruction: String,
    tone: ArTone,
    action: ArCopyAction?,
    onAction: () -> Unit,
    onPlace: () -> Unit,
    onUndo: () -> Unit,
    onReset: () -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(start = Spacing.md, end = Spacing.md, bottom = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        StatusSurface(
            step = state.step,
            stage = state.scanStage,
            lockProgress = state.lockProgress,
            headline = headline,
            instruction = instruction,
            tone = tone,
            action = action,
            onAction = onAction
        )

        AnimatedVisibility(
            visible = state.pointCount >= 2,
            enter = fadeIn(PanelScanMotion.spec(PanelScanMotion.Standard)) +
                slideInVertically(PanelScanMotion.spec(PanelScanMotion.Standard)) { it / 3 },
            exit = fadeOut(PanelScanMotion.spec(PanelScanMotion.Fast)) +
                slideOutVertically(PanelScanMotion.spec(PanelScanMotion.Fast)) { it / 3 }
        ) {
            MetricStrip(
                width = state.widthMeters,
                height = state.heightMeters
            )
        }

        ActionRow(
            state = state,
            onPlace = onPlace,
            onUndo = onUndo,
            onReset = onReset,
            onConfirm = onConfirm
        )
    }
}

/**
 * One small status surface: a state dot, the step, the headline, and a supporting line
 * only when it adds something. Copy crossfades in place so outgoing text can never stack
 * on top of incoming text.
 */
@Composable
private fun StatusSurface(
    step: MeasureStep,
    stage: ScanStage,
    lockProgress: Float,
    headline: String,
    instruction: String,
    tone: ArTone,
    action: ArCopyAction?,
    onAction: () -> Unit
) {
    val dot by animateColorAsState(
        targetValue = tone.dotColor(),
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "statusDot"
    )

    Row(
        modifier = Modifier
            .clip(PanelScan.shapes.cardCompact)
            .background(ChromeSurface.copy(alpha = 0.94f))
            .padding(horizontal = Spacing.sm, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Box(
            modifier = Modifier
                .padding(top = 5.dp)
                .size(7.dp)
                .clip(PanelScan.shapes.chip)
                .background(dot)
        )
        Column(modifier = Modifier.weight(1f)) {
            StageStepper(stage = stage, lockProgress = lockProgress)
            Text(
                text = if (stage == ScanStage.MEASURE) {
                    "${stageLabel(stage)} · ${stepLabel(step)}"
                } else stageLabel(stage),
                style = PanelScan.type.label,
                color = Color.White.copy(alpha = 0.55f),
                modifier = Modifier.padding(top = 6.dp)
            )
            Crossfade(
                targetState = headline,
                animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
                label = "statusHeadline"
            ) { current ->
                Text(
                    text = current,
                    style = PanelScan.type.cardTitle,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Crossfade(
                targetState = instruction,
                animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
                label = "statusInstruction"
            ) { current ->
                Text(
                    text = current,
                    style = PanelScan.type.supporting,
                    color = Color.White.copy(alpha = 0.72f),
                    minLines = 2,
                    maxLines = 3
                )
            }
        }
        action?.let {
            InlineAction(text = when (it) {
                ArCopyAction.TurnOnLight -> "Turn on light"
                ArCopyAction.TurnOffLight -> "Turn off light"
                ArCopyAction.OpenTools -> "Reference assistance"
            }, onClick = onAction)
        }
    }
}

/**
 * Six thin segments: Scan · Move slowly · Detected · Confirmed · Measure · Result. Done
 * stages fill, the current one fills partially (the lock progress while confirming), so the
 * customer can see the scanner making progress on a hard surface instead of guessing.
 */
@Composable
private fun StageStepper(stage: ScanStage, lockProgress: Float) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        ScanStage.entries.forEach { s ->
            val fill = when {
                s.ordinal < stage.ordinal -> 1f
                s != stage -> 0f
                s == ScanStage.SURFACE_DETECTED -> lockProgress.coerceIn(0.25f, 1f)
                else -> 0.5f
            }
            val animated by animateFloatAsState(
                targetValue = fill,
                animationSpec = PanelScanMotion.springSoft(),
                label = "stageFill"
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(3.dp)
                    .clip(PanelScan.shapes.chip)
                    .background(Color.White.copy(alpha = 0.18f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(animated)
                        .height(3.dp)
                        .background(if (s.ordinal < stage.ordinal) ConfirmedGreen else AccentCopper)
                )
            }
        }
    }
}

/** Small inline affordance inside the status surface — offered only when it would help. */
@Composable
private fun InlineAction(text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(PanelScan.shapes.chip)
            .background(ChromeOn)
            .pressScale(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = Icons.Rounded.FlashlightOn,
            contentDescription = null,
            tint = ChromeInk,
            modifier = Modifier.size(13.dp)
        )
        Text(text = text, style = PanelScan.type.label, color = ChromeInk)
    }
}

/** Two columns, no shell — just enough to read the numbers without covering the scene. */
@Composable
private fun MetricStrip(width: Double, height: Double) {
    Row(
        modifier = Modifier.padding(start = Spacing.xxs),
        horizontalArrangement = Arrangement.spacedBy(Spacing.xl)
    ) {
        MetricColumn(label = "Width", value = width)
        MetricColumn(label = "Height", value = height)
    }
}

@Composable
private fun MetricColumn(label: String, value: Double) {
    Column {
        Text(
            text = label.uppercase(),
            style = PanelScan.type.label,
            color = Color.White.copy(alpha = 0.55f)
        )
        Row(verticalAlignment = Alignment.Bottom) {
            if (value > 0.0) {
                AnimatedMeasure(
                    value = value,
                    style = PanelScan.type.metricSmall,
                    color = Color.White
                )
                Text(
                    text = " m",
                    style = PanelScan.type.supporting,
                    color = Color.White.copy(alpha = 0.6f)
                )
            } else {
                Text(
                    text = "—",
                    style = PanelScan.type.metricSmall,
                    color = Color.White.copy(alpha = 0.4f)
                )
            }
        }
    }
}

/**
 * One primary action, two quiet secondaries. Undo and reset stay icon-only so the eye goes
 * straight to the thing the workflow wants next.
 */
@Composable
private fun ActionRow(
    state: ArUiState,
    onPlace: () -> Unit,
    onUndo: () -> Unit,
    onReset: () -> Unit,
    onConfirm: () -> Unit
) {
    val confirming = (state.canConfirm && !state.replaying)
    val cornerLocked = state.assist.status == CornerAssistStatus.Locked

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        ArIconButton(
            icon = Icons.AutoMirrored.Rounded.Undo,
            contentDescription = "Undo last point",
            onClick = onUndo,
            enabled = state.canUndo,
            size = 46.dp
        )
        ArIconButton(
            icon = Icons.Rounded.Refresh,
            contentDescription = if (state.canUndo) "Clear all points" else "Rescan surface",
            onClick = onReset,
            enabled = state.canUndo || state.surfaceLocked,
            size = 46.dp
        )
        PrimaryArAction(
            text = when {
                confirming -> "Use measurement"
                cornerLocked -> "Confirm corner"
                else -> placeLabel(state.step)
            },
            icon = if (confirming || cornerLocked) Icons.Rounded.Check else null,
            enabled = confirming || state.canPlace,
            accent = cornerLocked && !confirming,
            onClick = if (confirming) onConfirm else onPlace,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun PrimaryArAction(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector?,
    enabled: Boolean,
    accent: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val container by animateColorAsState(
        targetValue = when {
            !enabled -> ChromeSurface
            accent -> AccentCopper
            else -> ChromeOn
        },
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "primaryContainer"
    )
    val content by animateColorAsState(
        targetValue = when {
            !enabled -> Color.White.copy(alpha = 0.38f)
            accent -> Color.White
            else -> ChromeInk
        },
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "primaryContent"
    )

    Row(
        modifier = modifier
            .height(46.dp)
            .clip(PanelScan.shapes.controlCompact)
            .background(container)
            .border(
                1.dp,
                if (enabled) Color.Transparent else ChromeBorder,
                PanelScan.shapes.controlCompact
            )
            .pressScale(enabled = enabled, onClick = if (enabled) onClick else null),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = content,
                modifier = Modifier.size(17.dp).padding(end = 0.dp)
            )
        }
        Crossfade(
            targetState = text,
            animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
            label = "primaryLabel"
        ) { current ->
            Text(
                text = current,
                style = PanelScan.type.button,
                color = content,
                modifier = Modifier.padding(start = if (icon != null) 7.dp else 0.dp)
            )
        }
    }
}

private fun placeLabel(step: MeasureStep): String = when (step) {
    MeasureStep.WidthStart -> "Place Point A"
    MeasureStep.WidthEnd -> "Place Point B"
    MeasureStep.Height -> "Place height point"
    MeasureStep.Complete -> "Use measurement"
}

private fun ArTone.dotColor(): Color = when (this) {
    ArTone.Neutral -> Color(0xFF9AA0A6)
    ArTone.Caution -> Color(0xFFE0A458)
    ArTone.Good -> Color(0xFF6FBF95)
}

// -------------------------------------------------------------------- reticle

/**
 * Four corner brackets rather than a ring: it frames what is under it instead of covering
 * it, and the gap in the middle keeps the target visible. The brackets close in and the
 * colour changes as evidence firms up, so the state is readable without reading any text.
 */
@Composable
private fun Reticle(
    state: ReticleState,
    locked: Boolean,
    surfaceLocked: Boolean,
    modifier: Modifier = Modifier
) {
    val spread by animateFloatAsState(
        targetValue = when {
            locked -> 0.74f
            state == ReticleState.Active -> 0.82f
            state == ReticleState.Warning -> 0.94f
            else -> 1f
        },
        animationSpec = PanelScanMotion.springSoft(),
        label = "reticleSpread"
    )
    val colour by animateColorAsState(
        targetValue = when {
            locked -> AccentCopper
            state == ReticleState.Active -> Color.White
            state == ReticleState.Warning -> Color(0xFFE0A458)
            surfaceLocked -> Color.White.copy(alpha = 0.8f)
            else -> Color.White.copy(alpha = 0.5f)
        },
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "reticleColour"
    )
    val stroke by animateFloatAsState(
        targetValue = if (locked || state == ReticleState.Active) 2.8f else 1.8f,
        animationSpec = PanelScanMotion.springSoft(),
        label = "reticleStroke"
    )

    // A single confirmation pulse on lock — not a loop.
    val pulse = remember { Animatable(0f) }
    LaunchedEffect(locked) {
        if (locked) {
            pulse.snapTo(0f)
            pulse.animateTo(1f, PanelScanMotion.SpringSoftSpec)
        } else {
            pulse.snapTo(0f)
        }
    }

    Canvas(modifier = modifier.size(76.dp)) {
        val half = size.minDimension / 2f * spread
        val arm = half * 0.42f
        val cx = size.width / 2f
        val cy = size.height / 2f

        listOf(
            Offset(cx - half, cy - half) to listOf(Offset(arm, 0f), Offset(0f, arm)),
            Offset(cx + half, cy - half) to listOf(Offset(-arm, 0f), Offset(0f, arm)),
            Offset(cx - half, cy + half) to listOf(Offset(arm, 0f), Offset(0f, -arm)),
            Offset(cx + half, cy + half) to listOf(Offset(-arm, 0f), Offset(0f, -arm))
        ).forEach { (origin, arms) ->
            arms.forEach { delta ->
                drawLine(
                    color = Color.Black.copy(alpha = 0.28f),
                    start = origin,
                    end = origin + delta,
                    strokeWidth = stroke + 2.5f
                )
                drawLine(
                    color = colour,
                    start = origin,
                    end = origin + delta,
                    strokeWidth = stroke
                )
            }
        }

        drawCircle(color = colour, radius = 2f, center = Offset(cx, cy))

        if (pulse.value > 0f && pulse.value < 1f) {
            drawCircle(
                color = AccentCopper.copy(alpha = (1f - pulse.value) * 0.7f),
                radius = half * (1f + pulse.value * 0.5f),
                center = Offset(cx, cy),
                style = Stroke(width = 2f)
            )
        }
    }
}

/**
 * The suggested corner: a soft bracket that points at the corner without covering it. Only
 * shown once geometry has confirmed a candidate — image evidence alone draws nothing.
 */
@Composable
private fun BoxScope.CornerSuggestionMarker(assist: CornerAssistState) {
    if (!assist.hasSuggestion) return

    val locked = assist.status == CornerAssistStatus.Locked
    val scale by animateFloatAsState(
        targetValue = if (locked) 1f else 0.84f,
        animationSpec = PanelScanMotion.springSoft(),
        label = "cornerScale"
    )
    val alpha by animateFloatAsState(
        targetValue = if (locked) 1f else 0.55f,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "cornerAlpha"
    )
    val colour = if (locked) AccentCopper else Color.White

    BoxWithConstraints(modifier = Modifier.matchParentSize()) {
        val x = maxWidth * assist.normalisedX
        val y = maxHeight * assist.normalisedY
        Canvas(
            modifier = Modifier
                .offset(x = x - 19.dp, y = y - 19.dp)
                .size(38.dp)
                .scale(scale)
        ) {
            val arm = size.minDimension * 0.3f
            val inset = size.minDimension * 0.18f
            val stroke = if (locked) 3f else 2.2f
            listOf(
                Offset(inset, inset) to listOf(Offset(arm, 0f), Offset(0f, arm)),
                Offset(size.width - inset, inset) to listOf(Offset(-arm, 0f), Offset(0f, arm)),
                Offset(inset, size.height - inset) to listOf(Offset(arm, 0f), Offset(0f, -arm)),
                Offset(size.width - inset, size.height - inset) to listOf(Offset(-arm, 0f), Offset(0f, -arm))
            ).forEach { (origin, arms) ->
                arms.forEach { delta ->
                    drawLine(
                        color = Color.Black.copy(alpha = 0.3f * alpha),
                        start = origin,
                        end = origin + delta,
                        strokeWidth = stroke + 2.5f
                    )
                    drawLine(
                        color = colour.copy(alpha = alpha),
                        start = origin,
                        end = origin + delta,
                        strokeWidth = stroke
                    )
                }
            }
        }
    }
}

@Composable
private fun ArErrorPanel(
    message: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .padding(Spacing.xl)
            .clip(PanelScan.shapes.card)
            .background(ChromeSurface)
            .padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text(text = "AR unavailable", style = PanelScan.type.sectionTitle, color = Color.White)
        Text(
            text = message,
            style = PanelScan.type.body,
            color = Color.White.copy(alpha = 0.75f)
        )
        PrimaryArAction(
            text = "Go back",
            icon = null,
            enabled = true,
            accent = false,
            onClick = onClose,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

// ---------------------------------------------------------------------- debug

/**
 * DEBUG only. Every candidate the pipeline saw this tick: yellow reached the image stage,
 * blue passed AR but failed geometry, green is confirmed, red was thrown out as texture.
 */
@Composable
private fun BoxScope.DebugCandidateOverlay(candidates: List<DebugCandidate>) {
    if (candidates.isEmpty()) return
    BoxWithConstraints(modifier = Modifier.matchParentSize()) {
        val width = maxWidth
        val height = maxHeight
        candidates.forEach { candidate ->
            val colour = when (candidate.kind) {
                DebugCandidateKind.ImageOnly -> Color(0xFFF2C744)
                DebugCandidateKind.ArValidGeometryWeak -> Color(0xFF4E9BF0)
                DebugCandidateKind.Confirmed -> Color(0xFF4FD08A)
                DebugCandidateKind.RejectedTexture -> Color(0xFFE05B4B)
            }
            Canvas(
                modifier = Modifier
                    .offset(
                        x = width * candidate.normalisedX - 8.dp,
                        y = height * candidate.normalisedY - 8.dp
                    )
                    .size(16.dp)
            ) {
                drawCircle(color = colour, radius = size.minDimension / 2f, style = Stroke(width = 2.2f))
                drawCircle(color = colour, radius = 1.6f)
            }
        }
    }
}

/** DEBUG only, collapsed by default, monospace so the columns line up. */
@Composable
private fun DebugPanel(diagnostics: ArDiagnostics, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .width(252.dp)
            .heightIn(max = 460.dp)
            .clip(PanelScan.shapes.controlCompact)
            .verticalScroll(rememberScrollState())
            .background(Color.Black.copy(alpha = 0.82f))
            .padding(horizontal = Spacing.xs, vertical = 6.dp)
    ) {
        Text(
            text = "Candidate legend",
            style = PanelScan.type.label,
            color = Color.White,
            modifier = Modifier.padding(bottom = 3.dp)
        )
        Text(
            text = "Yellow image · Blue geometry weak\nGreen confirmed · Red rejected",
            style = PanelScan.type.label.copy(fontFamily = FontFamily.Monospace),
            color = Color.White.copy(alpha = 0.72f),
            modifier = Modifier.padding(bottom = 5.dp)
        )
        DebugRow("tracking", diagnostics.cameraTracking)
        DebugRow("failure", diagnostics.failureReason)
        DebugRow("session", diagnostics.sessionState)
        DebugRow("hit", if (diagnostics.hitValid) "VALID" else "none")
        DebugRow("hitKind", diagnostics.hitKind)
        DebugRow("dist", String.format("%.2fm", diagnostics.hitDistanceMeters))
        DebugRow("jitter", String.format("%.3fm", diagnostics.poseJitterMeters))
        DebugRow("anchors", diagnostics.anchorCount.toString())
        DebugRow("step", diagnostics.step)
        DebugRow("fps", diagnostics.fps.toString())
        DebugRow("cv/s", "${diagnostics.cvPerSecond} @${diagnostics.cvMillis}ms")
        DebugRow("cvSize", diagnostics.analysisSize)
        DebugRow("lines", diagnostics.lineCount.toString())
        DebugRow("cands", diagnostics.candidateCount.toString())
        DebugRow("corner", diagnostics.cornerStatus)
        DebugRow("hold", "${diagnostics.cornerStableMillis}ms")
        DebugRow(
            "depth",
            if (diagnostics.depthSupported) {
                if (diagnostics.depthActive) "supported/active" else "supported"
            } else "no"
        )
        DebugRow("camCfg", diagnostics.cameraConfig)
        DebugRow("surface", diagnostics.surfaceSource)
        DebugRow("lockProg", String.format("%.2f", diagnostics.lockProgress))
        DebugRow(
            "depthFit",
            diagnostics.depthFitRms?.let { String.format("%.1fmm/%dpt", it * 1000f, diagnostics.depthFitPoints) } ?: "none"
        )
        DebugRow("conf", diagnostics.confidence)
        DebugRow("issue", diagnostics.issue)
        DebugRow("light", "${diagnostics.lighting} Y${diagnostics.lumaMean.toInt()}")
        DebugRow("clip/tex", String.format("%.0f%%/%.1f%%", diagnostics.clippedPercent, diagnostics.texturePercent))
        DebugRow(
            "enhance",
            String.format("g%.1f t%d%s", diagnostics.enhancementGain, diagnostics.gradientThreshold, if (diagnostics.chromaUsed) " +UV" else "")
        )
        DebugRow("motion", String.format("%.2fm/s %.0f°/s", diagnostics.cameraSpeed, diagnostics.cameraTurn))
        DebugRow("work", String.format("%.1fms", diagnostics.frameWorkMillis))
        diagnostics.evidence?.let { evidence ->
            DebugRow("score", String.format("%.2f", evidence.score))
            DebugRow("geomOK", if (evidence.geometryConfirmed) "YES" else "no")
            evidence.rejectReason?.let { DebugRow("reject", it) }
            DebugRow("type", evidence.cornerType.label)
            DebugRow("lineStr", evidence.lineStrength.toString())
            DebugRow("lineLen", String.format("%.0f/%.0f", evidence.minLengthPx, evidence.maxLengthPx))
            DebugRow("reticle", String.format("%.0fpx", evidence.reticleDistancePx))
            DebugRow(
                "bound",
                if (evidence.planeBoundaryMetres == Float.MAX_VALUE) "n/a"
                else String.format("%.2fm", evidence.planeBoundaryMetres)
            )
            DebugRow("nDelta", String.format("%.1f deg", evidence.planeNormalDeltaDegrees))
            DebugRow(
                "dGrad",
                if (evidence.depthSampled) {
                    String.format("%.4f/%.4f", evidence.depthGradientX, evidence.depthGradientY)
                } else "no depth"
            )
            DebugRow("repeat", String.format("%.1f", evidence.repetitionPenalty))
            DebugRow("quadC", String.format("%.1f", evidence.quadrantContrast))
        }
    }
}

@Composable
private fun DebugRow(key: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = key,
            style = PanelScan.type.label.copy(fontFamily = FontFamily.Monospace),
            color = Color(0xFF7FD4A8),
            modifier = Modifier.width(66.dp)
        )
        Text(
            text = value,
            style = PanelScan.type.label.copy(fontFamily = FontFamily.Monospace),
            color = Color.White,
            maxLines = 1
        )
    }
}
