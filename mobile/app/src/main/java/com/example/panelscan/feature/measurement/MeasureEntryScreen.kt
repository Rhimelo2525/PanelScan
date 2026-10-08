package com.example.panelscan.feature.measurement

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.ui.ArchitecturalHeroVisual
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SegmentedControl
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.label

/**
 * The measurement briefing. Users land here — never straight into a camera — so they know
 * what they are about to do, and so compatibility and permission are settled before an
 * ARCore session is ever created.
 */
@Composable
fun MeasureEntryScreen(
    viewModel: MeasurementViewModel,
    onStartAr: () -> Unit,
    onEnterManually: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val colors = PanelScan.colors
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()

    val arReadiness by rememberArReadiness()
    val cameraGranted by rememberCameraPermissionState()
    var permissionRequested by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        permissionRequested = true
        if (granted) onStartAr()
    }

    // Entering this screen always starts a clean scan.
    LaunchedEffect(Unit) { viewModel.beginNewMeasurement() }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Measure a surface",
                subtitle = "Scan with the camera, then confirm the dimensions",
                large = true
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                ArchitecturalHeroVisual(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f),
                    shape = PanelScan.shapes.hero
                )

                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(
                        text = "What are you cladding?",
                        style = PanelScan.type.sectionTitle,
                        color = colors.textPrimary
                    )
                    SegmentedControl(
                        options = listOf(SurfaceType.WALL, SurfaceType.CEILING),
                        selected = uiState.surfaceType,
                        onSelect = viewModel::setSurfaceType,
                        label = { it.label() }
                    )
                    Text(
                        text = when (uiState.surfaceType) {
                            SurfaceType.WALL -> "Wall panels are measured across the face of the wall."
                            SurfaceType.CEILING -> "Ceiling panels are measured across the ceiling plane."
                        },
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                }

                // Set directly on the page rather than in a card: this screen already
                // carries a hero and a callout, and a third rounded box in the stack is
                // what makes a layout look generated.
                Column {
                    HorizontalDivider(color = colors.border)
                    Text(
                        text = "How it works",
                        style = PanelScan.type.sectionTitle,
                        color = colors.textPrimary,
                        modifier = Modifier.padding(top = Spacing.md, bottom = Spacing.sm)
                    )
                    GuideStep("01", "Scan the surface", "Move your phone slowly from side to side until it says \"Surface confirmed\".")
                    GuideStep("02", "Measure", "Tap one edge, the other edge for the width, then the height.")
                    GuideStep("03", "Estimation result", "See the area, the panel you chose and how many panels you need.")
                    GuideStep("04", "3D preview & cart", "Check the layout in 3D, then add the calculated quantity to your cart.", last = true)
                }

                ArStatusCard(
                    readiness = arReadiness,
                    cameraGranted = cameraGranted,
                    permissionRequested = permissionRequested
                )

                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    color = colors.warningSoft,
                    borderColor = Color.Transparent,
                    elevation = 0.dp,
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Icon(
                            imageVector = Icons.Rounded.Info,
                            contentDescription = null,
                            tint = colors.warning,
                            modifier = Modifier.size(18.dp)
                        )
                        Column {
                            Text(
                                text = "Accuracy",
                                style = PanelScan.type.cardTitle,
                                color = colors.warning
                            )
                            Text(
                                text = "AR measurements are an estimate and typically vary by a " +
                                    "few centimetres. Check critical dimensions with a tape " +
                                    "measure before ordering materials.",
                                style = PanelScan.type.supporting,
                                color = colors.textSecondary,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                    .padding(bottom = bottomPadding),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                PrimaryButton(
                    text = when {
                        arReadiness == ArReadiness.Checking -> "Checking AR support…"
                        arReadiness == ArReadiness.Unsupported -> "AR not supported on this device"
                        arReadiness == ArReadiness.NeedsArCoreInstall -> "Install Google Play Services for AR"
                        else -> "Start AR Measurement"
                    },
                    icon = Icons.Rounded.Straighten,
                    enabled = arReadiness == ArReadiness.Ready,
                    onClick = {
                        if (cameraGranted) {
                            onStartAr()
                        } else {
                            permissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                    }
                )
                if (arReadiness.isBlocking) {
                    SecondaryButton(text = "Enter dimensions manually", onClick = onEnterManually)
                } else if (!cameraGranted && permissionRequested) {
                    SecondaryButton(
                        text = "Open app settings",
                        onClick = {
                            context.startActivity(
                                Intent(
                                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.fromParts("package", context.packageName, null)
                                )
                            )
                        }
                    )
                }
            }
        }
    }
}

/** A thin status line rather than a card: it is a state read-out, not a content block. */
@Composable
private fun ArStatusCard(
    readiness: ArReadiness,
    cameraGranted: Boolean,
    permissionRequested: Boolean
) {
    val colors = PanelScan.colors
    Column {
        HorizontalDivider(color = colors.border)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Device check",
                style = PanelScan.type.cardTitle,
                color = colors.textPrimary
            )
            StatusBadge(
                text = when (readiness) {
                    ArReadiness.Checking -> "Checking"
                    ArReadiness.Ready -> "AR ready"
                    ArReadiness.NeedsArCoreInstall -> "Update needed"
                    ArReadiness.Unsupported -> "Not supported"
                },
                tone = when (readiness) {
                    ArReadiness.Ready -> BadgeTone.Success
                    ArReadiness.Checking -> BadgeTone.Neutral
                    else -> BadgeTone.Warning
                },
                showDot = true
            )
        }
        Text(
            text = when {
                readiness == ArReadiness.Unsupported ->
                    "This device does not support ARCore. You can still enter dimensions by hand."
                readiness == ArReadiness.NeedsArCoreInstall ->
                    "Google Play Services for AR needs installing or updating before scanning."
                !cameraGranted && permissionRequested ->
                    "Camera access was declined. Grant it in settings to scan a surface."
                !cameraGranted ->
                    "PanelScan will ask for camera access when you start the scan."
                readiness == ArReadiness.Ready ->
                    "ARCore is available and camera access is granted."
                else -> "Checking whether this device can run an AR session."
            },
            style = PanelScan.type.supporting,
            color = colors.textSecondary,
            modifier = Modifier.padding(top = Spacing.xxs)
        )
    }
}

@Composable
private fun GuideStep(
    index: String,
    title: String,
    description: String,
    last: Boolean = false
) {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = if (last) 0.dp else Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text(
            text = index,
            style = PanelScan.type.label,
            color = colors.accent,
            modifier = Modifier.padding(top = 3.dp)
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = PanelScan.type.cardTitle, color = colors.textPrimary)
            Text(text = description, style = PanelScan.type.supporting, color = colors.textSecondary)
        }
    }
}
