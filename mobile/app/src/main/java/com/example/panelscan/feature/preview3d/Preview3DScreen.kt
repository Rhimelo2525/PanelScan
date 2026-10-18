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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.ui.formatPanelSizeCm
import com.example.panelscan.core.ui.formatThicknessCm
import com.example.panelscan.core.ui.OverlayBadge
import com.example.panelscan.core.ui.OverlayIconButton
import com.example.panelscan.core.ui.OverlayPrimaryButton
import com.example.panelscan.core.ui.PanelImage
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.finishPalette
import com.example.panelscan.core.ui.formatAreaWithUnit
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatDimensions
import com.example.panelscan.core.ui.label
import com.example.panelscan.core.ui.pressScale
import com.example.panelscan.core.logic.EstimationLogic
import com.example.panelscan.core.logic.PanelShape
import com.example.panelscan.core.logic.FaceTexture
import com.example.panelscan.core.logic.WallMesh
import com.example.panelscan.core.logic.WallPhotoGeometry
import com.example.panelscan.core.model.WallPhoto
import android.graphics.BitmapFactory
import dev.romainguy.kotlin.math.Float4
import dev.romainguy.kotlin.math.Mat4
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import com.example.panelscan.core.model.PanelProfile
import android.content.Context
import android.graphics.Bitmap
import coil.compose.SubcomposeAsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import androidx.core.graphics.drawable.toBitmap
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler
import io.github.sceneview.SceneView
import io.github.sceneview.geometries.Geometry
import io.github.sceneview.material.setTexture
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.node.CubeNode
import io.github.sceneview.node.GeometryNode
import io.github.sceneview.node.Node
import io.github.sceneview.texture.ImageTexture
import dev.romainguy.kotlin.math.Float2
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
    /** The photo taken of this wall while measuring, and its file; null shows the 3D view only. */
    wallPhoto: Pair<WallPhoto, File>? = null,
    onBack: () -> Unit,
    onSaveProject: (SavedProject) -> Unit,
    /** Returns why it could not be added (e.g. out of stock), or null when added. */
    onAddToCart: (panel: com.example.panelscan.core.model.PVCPanel, quantity: Int) -> String? = { _, _ -> null },
    showPrice: Boolean = false,
    modifier: Modifier = Modifier
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current
    val catalogue by ProductCatalog.panels.collectAsState()

    // The catalogue's current copy: a project saved earlier may predate the panel's 3D shape and photos.
    var selectedPanel by remember { mutableStateOf(ProductCatalog.findById(project.selectedPanel.id) ?: project.selectedPanel) }
    var showGrid by remember { mutableStateOf(true) }
    var isInspectionMode by remember { mutableStateOf(false) }
    var showPanelPicker by remember { mutableStateOf(false) }
    var showDimensions by remember { mutableStateOf(true) }
    var cartAdded by remember { mutableStateOf(false) }
    var cartProblem by remember { mutableStateOf<String?>(null) }
    var panMode by remember { mutableStateOf(false) }

    var yaw by remember { mutableStateOf(-18f) }
    var pitch by remember { mutableStateOf(10f) }
    var distance by remember { mutableStateOf(defaultDistance(project)) }
    var panX by remember { mutableStateOf(0f) }
    var panY by remember { mutableStateOf(0f) }

    // Photo view: the panels on the photo of the customer's own wall, seen from where it was taken.
    var photoView by remember { mutableStateOf(wallPhoto != null) }
    var wallBitmap by remember { mutableStateOf<Bitmap?>(null) }
    // Small corrections the customer drags in, in metres along the wall.
    var photoShiftX by remember { mutableStateOf(0f) }
    var photoShiftY by remember { mutableStateOf(0f) }
    LaunchedEffect(wallPhoto) {
        wallBitmap = wallPhoto?.let { (_, file) -> withContext(Dispatchers.IO) { BitmapFactory.decodeFile(file.path) } }
        if (wallBitmap == null) photoView = false
    }

    var sceneView by remember { mutableStateOf<SceneView?>(null) }
    var surfaceNode by remember { mutableStateOf<Node?>(null) }
    // Textures made for this screen, by photo, released with the scene.
    val textures = remember { mutableMapOf<Bitmap, Texture>() }

    // The panel face photo: its own surface photo, else the middle of its main product photo.
    val facePhotoUrl = selectedPanel.surfaceImageUrl ?: selectedPanel.imageUrl
    var facePhoto by remember { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(facePhotoUrl) {
        facePhoto = null
        facePhoto = facePhotoUrl?.let { loadFacePhoto(context, it, isSurfacePhoto = it == selectedPanel.surfaceImageUrl) }
    }

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

    val photo = wallPhoto?.first
    val placement = remember(photo) {
        photo?.let { WallPhotoGeometry.placement(it.corners.chunked(3).map { (x, y, z) -> WallPhotoGeometry.Vec(x, y, z) }) }
    }
    val inPhoto = photoView && photo != null && placement != null && wallBitmap != null

    // Rebuild the surface whenever the panel, its photo, joint overlay, inspection mode or view changes.
    LaunchedEffect(sceneView, selectedPanel, facePhoto, showGrid, isInspectionMode, inPhoto) {
        val view = sceneView ?: return@LaunchedEffect
        surfaceNode?.let { view.removeChildNodes(listOf(it)) }
        val node = if (inPhoto) {
            buildPhotoScene(view, project, selectedPanel, facePhoto, textures, showGrid, photo!!, wallBitmap!!, placement!!)
        } else {
            buildSurfaceNode(view, project, selectedPanel, facePhoto, textures, showGrid, isInspectionMode)
        }
        view.addChildNodes(listOf(node))
        surfaceNode = node
        usePhotoCamera(view, if (inPhoto) photo else null)
    }

    // 3D view: orbit and zoom move the surface rather than the camera.
    LaunchedEffect(surfaceNode, yaw, pitch, distance, panX, panY, inPhoto) {
        if (inPhoto) return@LaunchedEffect
        surfaceNode?.let { node ->
            node.rotation = Rotation(x = pitch, y = yaw, z = 0f)
            node.position = Position(panX, panY, -distance)
        }
    }

    // Photo view: the wall stays where it was measured, nudged by any drag.
    LaunchedEffect(surfaceNode, photoShiftX, photoShiftY, inPhoto) {
        if (!inPhoto) return@LaunchedEffect
        val wall = surfaceNode?.childNodes?.firstOrNull { it.name == WALL_NODE } ?: return@LaunchedEffect
        wall.transform = placementTransform(placement!!, photoShiftX, photoShiftY)
    }

    Box(modifier = modifier.fillMaxSize().background(Color(0xFF101215))) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(panMode, inPhoto) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        if (inPhoto) {
                            // Screen pixels to metres on the wall at its distance from the camera.
                            val metresPerPixel = -placement!!.centre.z * 2f / (photo!!.projection[5] * size.height)
                            photoShiftX = (photoShiftX + pan.x * metresPerPixel).coerceIn(-0.5f, 0.5f)
                            photoShiftY = (photoShiftY - pan.y * metresPerPixel).coerceIn(-0.5f, 0.5f)
                            return@detectTransformGestures
                        }
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
                    // Gestures here move the surface (3D) or nudge the panels (photo); the
                    // camera itself must stay put, above all where it matches the photo.
                    cameraManipulator = null
                    sceneView = this
                }
            },
            onRelease = { view ->
                view.onFrame = null
                sceneView = null
                surfaceNode = null
                textures.values.forEach { runCatching { view.engine.destroyTexture(it) } }
                textures.clear()
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
                        photoShiftX = 0f
                        photoShiftY = 0f
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
                if (photo != null && wallBitmap != null) {
                    ViewSwitch(photoView = photoView, onChange = { photoView = it })
                    Box(modifier = Modifier.weight(1f))
                }
                if (inPhoto) {
                    Text(
                        text = "Drag to line the panels up with your wall",
                        style = PanelScan.type.label,
                        color = Color.White,
                        modifier = Modifier
                            .clip(PanelScan.shapes.chip)
                            .background(Color(0xE61B1E22))
                            .padding(horizontal = Spacing.xs, vertical = 4.dp)
                    )
                    return@Row
                }
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
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = Spacing.md, vertical = Spacing.xs),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    ProductCatalog.panelsFor(catalogue, project.measurement.surfaceType).forEach { panel ->
                        PanelSwatch(
                            panel = panel,
                            selected = panel.id == selectedPanel.id,
                            onClick = { selectedPanel = panel },
                            modifier = Modifier.width(112.dp)
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
                    value = "${formatPanelSizeCm(selectedPanel)} · ${formatThicknessCm(selectedPanel)} thick"
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
                cartProblem?.let {
                    Text(
                        text = it,
                        style = PanelScan.type.supporting,
                        color = PanelScan.colors.destructive,
                        modifier = Modifier.padding(bottom = Spacing.xs)
                    )
                }
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
                        cartProblem = onAddToCart(selectedPanel, estimation.finalQuantity)
                        cartAdded = cartProblem == null
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
        // The face as the 3D preview shows it: its surface photo, else the product photo.
        if (panel.surfaceImageUrl != null) {
            SubcomposeAsyncImage(
                model = panel.surfaceImageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(52.dp).clip(PanelScan.shapes.controlCompact),
                error = { PanelImage(panel = panel, modifier = Modifier.fillMaxSize(), shape = PanelScan.shapes.controlCompact) }
            )
        } else {
            PanelImage(panel = panel, modifier = Modifier.fillMaxWidth().height(52.dp), shape = PanelScan.shapes.controlCompact)
        }
        Text(
            text = panel.name,
            style = PanelScan.type.label,
            color = if (selected) Color(0xFF16181B) else Color.White,
            modifier = Modifier.padding(top = 5.dp).height(32.dp),
            maxLines = 2
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
 * Builds the measured surface clad in the panel: its real shape (flat,
 * fluted ridges, half-round flutes or spandrel lines, from the product's 3D
 * settings) with the face photo on it, laid out at the panel's real width and
 * length and cut at the measured edges. Groove bottoms are shaded darker.
 *
 * In Inspection Mode the substrate backing moves back and turns see-through,
 * and the joints between panels show in accent blue.
 */
private fun buildSurfaceNode(
    sceneView: SceneView,
    project: SavedProject,
    panel: PVCPanel,
    facePhoto: Bitmap?,
    textures: MutableMap<Bitmap, Texture>,
    showJoints: Boolean,
    isInspectionMode: Boolean,
    withBacking: Boolean = true
): Node {
    val engine = sceneView.engine
    val materialLoader = sceneView.materialLoader

    val totalWidth = project.measurement.widthMeters.toFloat().coerceAtLeast(0.1f)
    val totalHeight = project.measurement.heightMeters.toFloat().coerceAtLeast(0.1f)
    val palette = finishPalette(panel.textureResource)

    val root = Node(engine).apply {
        position = Position(0f, 0f, -defaultDistance(project))
    }

    val relief = PanelShape.relief(panel.profile, panel.grooveCount, panel.widthMeters.toFloat(), panel.thicknessMm)

    // 1. Substrate backing (concrete / drywall behind the panels)
    val backingAlpha = if (isInspectionMode) 0.28f else 1.0f
    val backingColor = if (isInspectionMode) Color(0xFF334155) else Color(0xFF64748B)
    val backingMaterial = materialLoader.createColorInstance(
        backingColor.toArgbInt(), 0.0f, 0.85f, backingAlpha
    )
    if (withBacking) root.addChildNode(
        CubeNode(
            engine = engine,
            size = Float3(totalWidth * 1.04f, totalHeight * 1.04f, 0.024f),
            center = Float3(0f, 0f, if (isInspectionMode) -0.09f else -0.0121f),
            materialInstance = backingMaterial
        )
    )

    // 2. The panels: one mesh for the faces, one for the groove bottoms.
    val panelWidth = panel.widthMeters.toFloat().coerceAtLeast(0.05f)
    val panelHeight = panel.heightMeters.toFloat().coerceAtLeast(0.05f)
    // The photo repeats every 10 cm across and 30 cm along the grain (mirrored, so no seams show).
    val mesh = WallMesh.build(
        totalWidth, totalHeight, panelWidth, panelHeight,
        panel.profile, panel.grooveCount, relief,
        tileWidth = 0.10f, tileHeight = 0.30f
    )
    val roughness = if (panel.textureResource == "gloss_white") 0.25f else 0.6f
    val faceMaterial = if (facePhoto != null) {
        val texture = textures.getOrPut(facePhoto) { ImageTexture.Builder().bitmap(facePhoto).build(engine) }
        materialLoader.createTextureInstance(texture, isOpaque = true, metallic = 0f, roughness = roughness, reflectance = 0.35f).apply {
            setTexture(
                texture,
                TextureSampler(TextureSampler.MinFilter.LINEAR_MIPMAP_LINEAR, TextureSampler.MagFilter.LINEAR, TextureSampler.WrapMode.MIRRORED_REPEAT)
            )
        }
    } else {
        materialLoader.createColorInstance(palette.base.toArgbInt(), 0f, roughness, 1f)
    }
    root.addChildNode(GeometryNode(engine, mesh.face.toGeometry(engine), faceMaterial))
    if (mesh.recess.vertexCount > 0) {
        val recessColor = facePhoto?.let { darkened(averageColor(it), 0.45f) } ?: palette.detail
        val recessMaterial = materialLoader.createColorInstance(recessColor.toArgbInt(), 0f, 0.8f, 1f)
        root.addChildNode(GeometryNode(engine, mesh.recess.toGeometry(engine), recessMaterial))
    }

    // 3. Joints between panels, standing just proud of the face.
    if (showJoints || isInspectionMode) {
        val jointColor = if (isInspectionMode) Color(0xFF38BDF8) else palette.detail
        val jointMaterial = materialLoader.createColorInstance(
            jointColor.toArgbInt(),
            if (isInspectionMode) 0.8f else 0.0f,
            0.3f,
            if (isInspectionMode) 1.0f else 0.6f
        )
        val jointThickness = if (isInspectionMode) 0.009f else 0.004f
        val jointDepth = relief * 2f + if (isInspectionMode) 0.012f else 0.003f

        val columnCount = kotlin.math.ceil(totalWidth / panelWidth).toInt().coerceAtLeast(1)
        val rowCount = kotlin.math.ceil(totalHeight / panelHeight).toInt().coerceAtLeast(1)
        for (index in 1 until columnCount) {
            val x = -totalWidth / 2f + panelWidth * index
            if (abs(x) >= totalWidth / 2f) continue
            root.addChildNode(
                CubeNode(
                    engine = engine,
                    size = Float3(jointThickness, totalHeight, jointDepth),
                    center = Float3(x, 0f, 0f),
                    materialInstance = jointMaterial
                )
            )
        }
        for (index in 1 until rowCount) {
            val y = -totalHeight / 2f + panelHeight * index
            if (abs(y) >= totalHeight / 2f) continue
            root.addChildNode(
                CubeNode(
                    engine = engine,
                    size = Float3(totalWidth, jointThickness, jointDepth),
                    center = Float3(0f, y, 0f),
                    materialInstance = jointMaterial
                )
            )
        }
    }

    return root
}

private fun WallMesh.Mesh.toGeometry(engine: com.google.android.filament.Engine): Geometry {
    val vertices = (0 until vertexCount).map { i ->
        Geometry.Vertex(
            position = Float3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]),
            normal = Float3(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]),
            uvCoordinate = Float2(uvs[i * 2], uvs[i * 2 + 1])
        )
    }
    return Geometry.Builder().vertices(vertices).indices(indices.toList()).build(engine)
}

/**
 * The panel face texture. A surface photo (cropped by a moderator) is used
 * as it is. Otherwise the main product photo's face colours are read from its
 * middle and a clean wood grain is drawn in them, since the photo itself
 * carries its own grooves and shadows that would double the 3D ones.
 */
private suspend fun loadFacePhoto(context: Context, url: String, isSurfacePhoto: Boolean): Bitmap? {
    val request = ImageRequest.Builder(context).data(url).allowHardware(false).size(1024).build()
    val result = context.imageLoader.execute(request) as? SuccessResult ?: return null
    val photo = result.drawable.toBitmap()
    val side = (minOf(photo.width, photo.height) * if (isSurfacePhoto) 1f else 0.5f).toInt().coerceAtLeast(1)
    val square = Bitmap.createBitmap(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side)
    if (isSurfacePhoto) return Bitmap.createScaledBitmap(square, 512, 512, true).copy(Bitmap.Config.ARGB_8888, false)
    return withContext(Dispatchers.Default) {
        val sample = Bitmap.createScaledBitmap(square, 96, 96, true)
        val pixels = IntArray(96 * 96).also { sample.getPixels(it, 0, 96, 0, 0, 96, 96) }
        val (dark, base, light) = FaceTexture.palette(pixels).toList()
        val grain = FaceTexture.woodGrain(FACE_TEXTURE_SIZE, dark, base, light, seed = url.hashCode())
        Bitmap.createBitmap(grain, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE, Bitmap.Config.ARGB_8888)
    }
}

private const val FACE_TEXTURE_SIZE = 512

private fun averageColor(bitmap: Bitmap): Color = Color(Bitmap.createScaledBitmap(bitmap, 1, 1, true).getPixel(0, 0))

private fun darkened(color: Color, factor: Float): Color =
    Color(red = color.red * factor, green = color.green * factor, blue = color.blue * factor, alpha = 1f)

private const val WALL_NODE = "wall"

/** "Photo" or "3D", as two joined buttons. */
@Composable
private fun ViewSwitch(photoView: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .clip(PanelScan.shapes.chip)
            .background(Color(0xFF1B1E22))
            .padding(3.dp)
    ) {
        listOf(true to "Your wall", false to "3D").forEach { (value, label) ->
            val selected = photoView == value
            Text(
                text = label,
                style = PanelScan.type.label,
                color = if (selected) Color(0xFF16181B) else Color.White,
                modifier = Modifier
                    .clip(PanelScan.shapes.chip)
                    .background(if (selected) Color.White else Color.Transparent)
                    .pressScale(onClick = { onChange(value) })
                    .padding(horizontal = Spacing.sm, vertical = 6.dp)
            )
        }
    }
}

/**
 * The photo view: the wall photo as a flat picture far behind, filling what
 * the camera saw, and the panels clad over the measured wall in front of it,
 * placed where the AR measurement found the wall.
 */
private fun buildPhotoScene(
    sceneView: SceneView,
    project: SavedProject,
    panel: PVCPanel,
    facePhoto: Bitmap?,
    textures: MutableMap<Bitmap, Texture>,
    showJoints: Boolean,
    photo: WallPhoto,
    wallBitmap: Bitmap,
    placement: WallPhotoGeometry.Placement
): Node {
    val engine = sceneView.engine
    val root = Node(engine)

    val projection = photo.projection.toFloatArray()
    val corners = WallPhotoGeometry.backdropCorners(projection, BACKDROP_DISTANCE)
    // Filament reads a bitmap's first row as v = 0 at the bottom, so the photo's bottom is v = 0.
    val uvs = listOf(Float2(0f, 0f), Float2(1f, 0f), Float2(1f, 1f), Float2(0f, 1f))
    val backdrop = Geometry.Builder()
        .vertices(corners.mapIndexed { i, c -> Geometry.Vertex(position = Float3(c.x, c.y, c.z), normal = Float3(0f, 0f, 1f), uvCoordinate = uvs[i]) })
        .indices(listOf(0, 1, 2, 0, 2, 3))
        .build(engine)
    val photoTexture = textures.getOrPut(wallBitmap) { ImageTexture.Builder().bitmap(wallBitmap).build(engine) }
    root.addChildNode(GeometryNode(engine, backdrop, sceneView.materialLoader.createImageInstance(photoTexture)))

    // The panels, sized to the wall as the camera measured it.
    val measured = project.copy(
        measurement = project.measurement.copy(widthMeters = placement.width.toDouble(), heightMeters = placement.height.toDouble())
    )
    val wall = buildSurfaceNode(sceneView, measured, panel, facePhoto, textures, showJoints, isInspectionMode = false, withBacking = false)
    wall.name = WALL_NODE
    wall.transform = placementTransform(placement, 0f, 0f)
    root.addChildNode(wall)
    return root
}

/** The wall mesh's frame (centred, x across, y up, z out) at the measured wall, nudged along it. */
private fun placementTransform(placement: WallPhotoGeometry.Placement, shiftX: Float, shiftY: Float): Mat4 {
    val centre = placement.centre + placement.right * shiftX + placement.up * shiftY
    return Mat4(
        Float4(placement.right.x, placement.right.y, placement.right.z, 0f),
        Float4(placement.up.x, placement.up.y, placement.up.z, 0f),
        Float4(placement.out.x, placement.out.y, placement.out.z, 0f),
        Float4(centre.x, centre.y, centre.z, 1f)
    )
}

/**
 * Looks through the camera that took [photo], fitted to this screen, or
 * goes back to the ordinary 3D camera when [photo] is null. Re-applied every
 * frame, as the view resets its projection when its size changes.
 */
private fun usePhotoCamera(view: SceneView, photo: WallPhoto?) {
    val camera = view.cameraNode
    camera.position = Position(0f, 0f, 0f)
    camera.rotation = Rotation(0f, 0f, 0f)
    if (photo == null) {
        view.onFrame = null
        runCatching { camera.updateProjection() }
        return
    }
    val projection = photo.projection.toFloatArray()
    val photoAspect = photo.imageWidth.toFloat() / photo.imageHeight
    view.onFrame = {
        if (view.width > 0 && view.height > 0) {
            val fitted = WallPhotoGeometry.fitProjection(projection, photoAspect, view.width.toFloat() / view.height)
            camera.camera.setCustomProjection(DoubleArray(16) { fitted[it].toDouble() }, PHOTO_NEAR.toDouble(), PHOTO_FAR.toDouble())
        }
    }
}

/** Same clip planes as the AR camera that took the photo; the photo sits well inside them. */
private const val PHOTO_NEAR = 0.05f
private const val PHOTO_FAR = 100f
private const val BACKDROP_DISTANCE = 60f

private fun Color.toArgbInt(): Int = android.graphics.Color.argb(
    (alpha * 255).toInt(),
    (red * 255).toInt(),
    (green * 255).toInt(),
    (blue * 255).toInt()
)
