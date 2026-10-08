package com.example.panelscan.feature.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.panelscan.BuildConfig
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.location.DeliveryLocationRules
import com.example.panelscan.core.location.ExactDeliveryLocation
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import java.io.File

/** A real map preview. Editing stays in the full-screen picker where the pin can be dragged. */
@Composable
internal fun CheckoutMapPreview(
    location: ExactDeliveryLocation?,
    enabled: Boolean,
    onOpenPicker: () -> Unit
) {
    val colors = PanelScan.colors
    val lifecycleOwner = LocalLifecycleOwner.current
    var mapView by remember { mutableStateOf<MapView?>(null) }
    val center = location?.let { GeoPoint(it.latitude, it.longitude) }
        ?: GeoPoint(DeliveryLocationRules.DEFAULT_LAT, DeliveryLocationRules.DEFAULT_LNG)

    DisposableEffect(lifecycleOwner, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView?.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView?.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(216.dp)
            .clip(PanelScan.shapes.cardCompact)
    ) {
        AndroidView(
            modifier = Modifier.matchParentSize(),
            factory = { ctx ->
                Configuration.getInstance().apply {
                    userAgentValue = "PanelScan/${BuildConfig.VERSION_NAME} " +
                        "(${ctx.packageName}; contact: idisenyo.interiors2024@gmail.com)"
                    osmdroidBasePath = File(ctx.cacheDir, "osmdroid")
                    osmdroidTileCache = File(ctx.cacheDir, "osmdroid/tiles")
                }
                MapView(ctx).apply {
                    setTileSource(
                        XYTileSource(
                            "OpenStreetMap", 0, 19, 256, ".png",
                            arrayOf("https://tile.openstreetmap.org/")
                        )
                    )
                    setMultiTouchControls(false)
                    zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
                    controller.setZoom(if (location == null) 11.0 else 17.0)
                    controller.setCenter(center)
                    mapView = this
                }
            },
            update = { view ->
                view.overlays.removeAll { it is Marker }
                if (location != null) {
                    view.overlays.add(Marker(view).apply {
                        position = center
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                        title = "Exact delivery location"
                    })
                }
                view.controller.setCenter(center)
                view.invalidate()
            },
            onRelease = { view ->
                view.onDetach()
                mapView = null
            }
        )
        Box(
            Modifier.matchParentSize().clickable(
                enabled = enabled,
                onClickLabel = "Open map to place or move delivery pin",
                onClick = onOpenPicker
            )
        )
        Text(
            text = "Tap to place or move pin",
            style = PanelScan.type.label,
            color = colors.textPrimary,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(Spacing.xs)
                .clip(PanelScan.shapes.chip)
                .background(colors.surface.copy(alpha = 0.92f))
                .padding(horizontal = Spacing.xs, vertical = 4.dp)
        )
        Text(
            text = "© OpenStreetMap contributors",
            style = PanelScan.type.label,
            color = colors.textSecondary,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(Spacing.xs)
                .clip(PanelScan.shapes.chip)
                .background(colors.surface.copy(alpha = 0.9f))
                .padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}
