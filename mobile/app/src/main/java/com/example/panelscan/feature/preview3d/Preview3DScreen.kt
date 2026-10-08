package com.example.panelscan.feature.preview3d

import androidx.compose.runtime.collectAsState
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CenterFocusStrong
import androidx.compose.material.icons.rounded.GridOn
import androidx.compose.material.icons.rounded.OpenWith
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.ui.OverlayBadge
import com.example.panelscan.core.ui.OverlayIconButton
import com.example.panelscan.core.ui.OverlayPrimaryButton
import com.example.panelscan.core.ui.PanelTexture
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.finishPalette
import com.example.panelscan.core.ui.formatAreaWithUnit
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatDimensions
import com.example.panelscan.core.ui.label
import com.example.panelscan.core.ui.pressScale
import com.example.panelscan.core.logic.EstimationLogic
import io.github.sceneview.SceneView
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.node.CubeNode
import io.github.sceneview.node.Node
import dev.romainguy.kotlin.math.Float3
import androidx.compose.ui.unit.dp
import kotlin.math.abs

import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.ViewInAr

/**
 * 3D preview of the measured surface clad in the chosen panel.
 *
 * SceneView is kept as the renderer. The scene is rebuilt whenever the panel, grid toggle,
 * or inspection mode changes. Real substrate backing and tongue-and-groove joint layout
 * can be inspected in exploded view. Orbit and zoom are driven from Compose gestures.
 */
@Composable
fun Preview3DScreen(
    project: SavedProject,
    onBack: () -> Unit,
    onSaveProject: (SavedProject) -> Unit,
    onAddToCart: (panel: com.example.panelscan.core.model.PVCPanel, quantity: Int) -> Unit = { _, _ -> },
    showPrice: Boolean = false,
    modifier: Modifier = Modifier
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val catalogue by ProductCatalog.panels.collectAsState()

    var selectedPanel by remember { mutableStateOf(project.selectedPanel) }
    var showGrid by remember { mutableStateOf(true) }
    var isInspectionMode by remember { mutableStateOf(false) }
    var showPanelPicker by remember { mutableStateOf(false) }
    var showDimensions by remember { mutableStateOf(true) }
    var cartAdded by remember { mutableStateOf(false) }
    var panMode by remember { mutableStateOf(false) }

    var yaw by remember { mutableStateOf(-18f) }
    var pitch by remember { mutableStateOf(10f) }
    var distance by remember { mutableStateOf(defaultDistance(project)) }
    var panX by remember { mutableStateOf(0f) }
    var panY by remember { mutableStateOf(0f) }

    var sceneView by remember { mutableStateOf<SceneView?>(null) }
    var surfaceNode by remember { mutableStateOf<Node?>(null) }

    // Same waste allowance the customer chose on the estimation result.
    val estimation = remember(selectedPanel, project) {
        EstimationLogic.calculateEstimation(
            project.measurement.widthMeters,
            project.measurement.heightMeters,
            selectedPanel,
            project.estimation.wastePercent
        )
    }
    val layout = remember(selectedPanel, project) {
        EstimationLogic.layout(project.measurement.widthMeters, project.measurement.heightMeters, selectedPanel)
    }

    // Rebuild the surface whenever the finish, joint overlay, or inspection mode changes.
    LaunchedEffect(sceneView, selectedPanel, showGrid, isInspectionMode) {
        val view = sceneView ?: return@LaunchedEffect
        surfaceNode?.let { view.removeChildNodes(listOf(it)) }
        val node = buildSurfaceNode(view, project, selectedPanel, showGrid, isInspectionMode)
        view.addChildNodes(listOf(node))
        surfaceNode = node
    }

    // Apply orbit and zoom to the surface rather than the camera.
    LaunchedEffect(surfaceNode, yaw, pitch, distance, panX, panY) {
        surfaceNode?.let { node ->
            node.rotation = Rotation(x = pitch, y = yaw, z = 0f)
            node.position = Position(panX, panY, -distance)
        }
    }

    Box(modifier = modifier.fillMaxSize().background(Color(0xFF101215))) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(panMode) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        if (panMode) {
                            val scale = distance / 650f
                            panX = (panX + pan.x * scale).coerceIn(-8f, 8f)
                            panY = (panY - pan.y * scale).coerceIn(-8f, 8f)
                        } else {
                            yaw = (yaw + pan.x * 0.25f) % 360f
                            pitch = (pitch - pan.y * 0.25f).coerceIn(-70f, 70f)
                        }
                        distance = (distance / zoom).coerceIn(0.8f, 18f)
                    }
                },
            factory = { ctx ->
                SceneView(ctx).apply {
                    lifecycle = lifecycleOwner.lifecycle
                    sceneView = this
                }
            },
            onRelease = { view ->
                sceneView = null
                surfaceNode = null
                view.destroy()
            }
        )

        // Top controls
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = Spacing.md, vertical = Spacing.xs),
            verticalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                OverlayIconButton(
                    icon = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Back",
                    onClick = onBack,
                    size = 42.dp,
                    containerColor = Color(0xFF1B1E22)
                )
                OverlayBadge(text = project.measurement.surfaceType.label())
                Box(modifier = Modifier.weight(1f))
                OverlayIconButton(
                    icon = Icons.Rounded.Layers,
                    contentDescription = if (isInspectionMode) "Normal View" else "Inspection Mode",
                    onClick = { isInspectionMode = !isInspectionMode },
                    size = 42.dp,
                    containerColor = if (isInspectionMode) Color(0xFF38BDF8) else Color(0xFF1B1E22),
                    contentColor = if (isInspectionMode) Color(0xFF0F172A) else Color.White
                )
                OverlayIconButton(
                    icon = Icons.Rounded.GridOn,
                    contentDescription = if (showGrid) "Hide panel joints" else "Show panel joints",
                    onClick = { showGrid = !showGrid },
                    size = 42.dp,
                    containerColor = if (showGrid) Color.White else Color(0xFF1B1E22),
                    contentColor = if (showGrid) Color(0xFF16181B) else Color.White
                )
                OverlayIconButton(
                    icon = Icons.Rounded.CenterFocusStrong,
                    contentDescription = "Reset camera",
                    onClick = {
                        yaw = -18f
                        pitch = 10f
                        distance = defaultDistance(project)
                        panX = 0f
                        panY = 0f
                    },
                    size = 42.dp,
                    containerColor = Color(0xFF1B1E22)
                )
                OverlayIconButton(
                    icon = Icons.Rounded.Palette,
                    contentDescription = "Change panel",
                    onClick = { showPanelPicker = !showPanelPicker },
                    size = 42.dp,
                    containerColor = if (showPanelPicker) Color.White else Color(0xFF1B1E22),
                    contentColor = if (showPanelPicker) Color(0xFF16181B) else Color.White
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                OverlayIconButton(
                    icon = Icons.Rounded.OpenWith,
                    contentDescription = if (panMode) "Switch to rotate gesture" else "Switch to pan gesture",
                    onClick = { panMode = !panMode },
                    size = 38.dp,
                    containerColor = if (panMode) Color.White else Color(0xFF1B1E22),
                    contentColor = if (panMode) Color(0xFF16181B) else Color.White
                )
                Text(
                    text = if (panMode) "Drag to pan · pinch to zoom" else "Drag to rotate · pinch to zoom",
                    style = PanelScan.type.label,
                    color = Color.White,
                    modifier = Modifier
                        .padding(start = Spacing.xs)
                        .clip(PanelScan.shapes.chip)
                        .background(Color(0xE61B1E22))
                        .padding(horizontal = Spacing.xs, vertical = 4.dp)
                )
            }

            if (isInspectionMode) {
                Row(
                    modifier = Modifier
                        .clip(PanelScan.shapes.controlCompact)
                        .background(Color(0xE60F172A))
                        .border(1.dp, Color(0xFF38BDF8).copy(alpha = 0.5f), PanelScan.shapes.controlCompact)
                        .padding(horizontal = Spacing.sm, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Layers,
                        contentDescription = null,
                        tint = Color(0xFF38BDF8),
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "Inspection view: wall shown see-through so every panel and joint stands out",
                        style = PanelScan.type.label,
                        color = Color.White
                    )
                }
            }
        }

        // Dimension read-out, kept small so it never covers the scene.
        AnimatedVisibility(
            visible = showDimensions,
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .statusBarsPadding()
                .padding(end = Spacing.md),
            enter = fadeIn(PanelScanMotion.spec(PanelScanMotion.Standard)) +
                slideInHorizontally(PanelScanMotion.spec(PanelScanMotion.Standard)) { it / 3 },
            exit = fadeOut(PanelScanMotion.spec(PanelScanMotion.Fast))
        ) {
            Column(
                modifier = Modifier
                    .clip(PanelScan.shapes.cardCompact)
                    .background(Color(0xFF1B1E22))
                    .pressScale(onClick = { showDimensions = false })
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
                horizontalAlignment = Alignment.End
            ) {
                Text(
                    text = formatDimensions(project.measurement),
                    style = PanelScan.type.cardTitle,
                    color = Color.White
                )
                Text(
                    text = formatAreaWithUnit(project.measurement.areaSquareMeters),
                    style = PanelScan.type.supporting,
                    color = Color.White.copy(alpha = 0.7f)
                )
            }
        }

        // Bottom sheet
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
        ) {
            AnimatedVisibility(
                visible = showPanelPicker,
                enter = fadeIn(PanelScanMotion.spec(PanelScanMotion.Standard)) +
                    slideInVertically(PanelScanMotion.spec(PanelScanMotion.Standard)) { it / 2 },
                exit = fadeOut(PanelScanMotion.spec(PanelScanMotion.Fast)) +
                    slideOutVertically(PanelScanMotion.spec(PanelScanMotion.Fast)) { it / 2 }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.md, vertical = Spacing.xs),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    ProductCatalog.panelsFor(catalogue, project.measurement.surfaceType).forEach { panel ->
                        PanelSwatch(
                            panel = panel,
                            selected = panel.id == selectedPanel.id,
                            onClick = { selectedPanel = panel },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(PanelScan.shapes.sheet)
                    .background(PanelScan.colors.surface)
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.md)
                    .navigationBarsPadding()
            ) {
                Text(
                    text = selectedPanel.name,
                    style = PanelScan.type.sectionTitle,
                    color = PanelScan.colors.textPrimary
                )
                Text(
                    text = "${selectedPanel.finish} · ${project.measurement.surfaceType.label()} panel",
                    style = PanelScan.type.supporting,
                    color = PanelScan.colors.textSecondary,
                    modifier = Modifier.padding(bottom = Spacing.xs)
                )
                SpecRow(
                    label = "Panel size",
                    value = "${(selectedPanel.widthMeters * 1000).toInt()} × ${(selectedPanel.heightMeters * 1000).toInt()} mm · ${selectedPanel.thicknessMm} mm thick"
                )
                SpecRow(
                    label = "Measured surface",
                    value = formatDimensions(project.measurement)
                )
                SpecRow(
                    label = "Surface area",
                    value = formatAreaWithUnit(project.measurement.areaSquareMeters)
                )
                SpecRow(
                    label = "Panel layout",
                    value = "${layout.first} across × ${layout.second} ${if (layout.second == 1) "row" else "rows"}"
                )
                SpecRow(
                    label = "Panels required",
                    value = "${estimation.finalQuantity} panels" +
                        if (estimation.wastePercent > 0) " (incl. ${estimation.wastePercent}% waste)" else ""
                )
                SpecRow(
                    label = "Estimated material cost",
                    value = com.example.panelscan.core.ui.PriceVisibility.formatPriceOrHidden(
                        amount = estimation.estimatedCost,
                        isPriceVisible = showPrice
                    ),
                    emphasised = true
                )
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = Spacing.sm),
                    color = PanelScan.colors.border
                )
                OverlayPrimaryButton(
                    text = if (cartAdded) {
                        "✓ Added to Cart — Continue"
                    } else {
                        "Add ${estimation.finalQuantity} panels to Cart"
                    },
                    onClick = {
                        val saved = project.copy(
                            selectedPanel = selectedPanel,
                            estimation = estimation
                        )
                        onSaveProject(saved)
                        onAddToCart(selectedPanel, estimation.finalQuantity)
                        cartAdded = true
                    }
                )
            }
        }
    }
}

@Composable
private fun PanelSwatch(
    panel: PVCPanel,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Opaque on purpose: SceneView renders into a SurfaceView that composites through any
    // translucent overlay drawn over it, which washes out a tinted chip.
    Column(
        modifier = modifier
            .clip(PanelScan.shapes.cardCompact)
            .background(if (selected) Color.White else Color(0xFF1B1E22))
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) Color.White else Color(0xFF33383E),
                shape = PanelScan.shapes.cardCompact
            )
            .pressScale(onClick = onClick)
            .padding(Spacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        PanelTexture(
            textureResource = panel.textureResource,
            modifier = Modifier.fillMaxWidth().height(38.dp),
            shape = PanelScan.shapes.controlCompact,
            showSeams = false
        )
        Text(
            text = panel.name,
            style = PanelScan.type.label,
            color = if (selected) Color(0xFF16181B) else Color.White,
            modifier = Modifier.padding(top = 5.dp),
            maxLines = 1
        )
    }
}

/** Frames the whole surface with real headroom, whatever its size. */
private fun defaultDistance(project: SavedProject): Float {
    val largest = maxOf(
        project.measurement.widthMeters,
        project.measurement.heightMeters,
        0.5
    ).toFloat()
    return (largest * 2.3f).coerceIn(1.6f, 16f)
}

/**
 * Builds the measured surface with substrate backing and real panel-width divisions.
 *
 * Each visible panel section is its own CubeNode, laid out using the product's real width
 * and length and clipped at the measured surface edges. This keeps the rendered coverage
 * consistent with both dimensions instead of drawing unrelated full-height strips.
 *
 * In Inspection Mode the panel face becomes semi-transparent (alpha 0.4) to reveal the
 * substrate backing, and joint lines highlight in accent blue.
 */
private fun buildSurfaceNode(
    sceneView: SceneView,
    project: SavedProject,
    panel: PVCPanel,
    showJoints: Boolean,
    isInspectionMode: Boolean
): Node {
    val engine = sceneView.engine
    val materialLoader = sceneView.materialLoader

    val totalWidth = project.measurement.widthMeters.toFloat().coerceAtLeast(0.1f)
    val totalHeight = project.measurement.heightMeters.toFloat().coerceAtLeast(0.1f)
    val palette = finishPalette(panel.textureResource)

    val root = Node(engine).apply {
        position = Position(0f, 0f, -defaultDistance(project))
    }

    // 1. Substrate backing (concrete / drywall behind the panels)
    val backingDepth = if (isInspectionMode) -0.09f else -0.022f
    val backingAlpha = if (isInspectionMode) 0.28f else 1.0f
    val backingColor = if (isInspectionMode) Color(0xFF334155) else Color(0xFF64748B)
    val backingMaterial = materialLoader.createColorInstance(
        backingColor.toArgbInt(), 0.0f, 0.85f, backingAlpha
    )
    val substrateBacking = CubeNode(
        engine = engine,
        size = Float3(totalWidth * 1.04f, totalHeight * 1.04f, 0.024f),
        center = Float3(0f, 0f, backingDepth),
        materialInstance = backingMaterial
    )
    root.addChildNode(substrateBacking)

    // 2. Individual panel sections, spaced at the real product width and length.
    val panelWidth = panel.widthMeters.toFloat().coerceAtLeast(0.05f)
    val panelHeight = panel.heightMeters.toFloat().coerceAtLeast(0.05f)
    val panelFaceAlpha = if (isInspectionMode) 0.95f else 1.0f

    // Differentiate physical finishes per product
    val isWood = panel.textureResource == "wood_oak"
    val isFabric = panel.material?.contains("Fabric", ignoreCase = true) == true
    val isMarble = panel.textureResource == "marble_white"
    val isGloss = panel.textureResource == "gloss_white"
    val isMetallic = panel.textureResource == "silver_stripe"

    val panelRoughness = when {
        isGloss -> 0.08f
        isMarble -> 0.18f
        isMetallic -> 0.35f
        isWood -> 0.58f
        isFabric -> 0.94f
        else -> 0.65f
    }
    val panelMetallic = if (isMetallic) 0.45f else 0.0f

    val baseMaterial = materialLoader.createColorInstance(
        palette.base.toArgbInt(), panelMetallic, panelRoughness, panelFaceAlpha
    )
    val shadeMaterial = materialLoader.createColorInstance(
        palette.shade.toArgbInt(), panelMetallic, panelRoughness, panelFaceAlpha
    )
    val highlightMaterial = materialLoader.createColorInstance(
        palette.highlight.toArgbInt(), panelMetallic, panelRoughness, panelFaceAlpha
    )

    val columnCount = kotlin.math.ceil(totalWidth / panelWidth).toInt().coerceAtLeast(1)
    val rowCount = kotlin.math.ceil(totalHeight / panelHeight).toInt().coerceAtLeast(1)

    for (row in 0 until rowCount) {
        val bottom = row * panelHeight
        val visibleHeight = minOf(panelHeight, totalHeight - bottom)
        val y = -totalHeight / 2f + bottom + visibleHeight / 2f
        for (col in 0 until columnCount) {
            val left = col * panelWidth
            val visibleWidth = minOf(panelWidth, totalWidth - left)
            val x = -totalWidth / 2f + left + visibleWidth / 2f
            val variation = row * columnCount + col
            val material = when {
                isWood && variation % 3 == 1 -> shadeMaterial
                isWood && variation % 3 == 2 -> highlightMaterial
                else -> baseMaterial
            }
            root.addChildNode(
                CubeNode(
                    engine = engine,
                    size = Float3(visibleWidth, visibleHeight, 0.018f),
                    center = Float3(x, y, 0f),
                    materialInstance = material
                )
            )
        }
    }

    // 3. Panel joint lines / tongue-and-groove seams
    if (showJoints || isInspectionMode) {
        val jointColor = if (isInspectionMode) Color(0xFF38BDF8) else palette.detail
        val jointMaterial = materialLoader.createColorInstance(
            jointColor.toArgbInt(),
            if (isInspectionMode) 0.8f else 0.0f,
            0.3f,
            if (isInspectionMode) 1.0f else 0.6f
        )
        val jointThickness = if (isInspectionMode) 0.009f else 0.004f
        val jointZ = if (isInspectionMode) 0.028f else 0.020f

        for (index in 1 until columnCount) {
            val x = -totalWidth / 2f + panelWidth * index
            if (abs(x) >= totalWidth / 2f) continue
            val joint = CubeNode(
                engine = engine,
                size = Float3(jointThickness, totalHeight, jointZ),
                center = Float3(x, 0f, 0f),
                materialInstance = jointMaterial
            )
            root.addChildNode(joint)
        }
        for (index in 1 until rowCount) {
            val y = -totalHeight / 2f + panelHeight * index
            if (abs(y) >= totalHeight / 2f) continue
            root.addChildNode(
                CubeNode(
                    engine = engine,
                    size = Float3(totalWidth, jointThickness, jointZ),
                    center = Float3(0f, y, 0f),
                    materialInstance = jointMaterial
                )
            )
        }
    }

    return root
}

private fun Color.toArgbInt(): Int = android.graphics.Color.argb(
    (alpha * 255).toInt(),
    (red * 255).toInt(),
    (green * 255).toInt(),
    (blue * 255).toInt()
)
