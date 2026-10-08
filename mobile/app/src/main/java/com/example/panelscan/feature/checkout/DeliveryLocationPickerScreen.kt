package com.example.panelscan.feature.checkout

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Address
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.PinDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.location.DeliveryLocationRules
import com.example.panelscan.core.location.ExactDeliveryLocation
import com.example.panelscan.core.location.LocationSource
import com.example.panelscan.core.location.PhilippineGeocodeNormalizer
import com.example.panelscan.core.location.RawGeocodedAddress
import com.example.panelscan.core.location.ResolvedDeliveryAddress
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.BuildConfig
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import java.io.File
import java.util.Locale
import kotlin.coroutines.resume

/**
 * "Pin your exact delivery location".
 *
 * OpenStreetMap tiles via osmdroid (no API key). The customer can drag the pin, tap the map
 * to move it there, or use their current location if they grant permission. Nothing is
 * stored until they confirm; coordinates are never logged.
 */
@Composable
fun DeliveryLocationPickerScreen(
    initial: ExactDeliveryLocation?,
    addressHint: String,
    onConfirm: (ExactDeliveryLocation) -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val colors = PanelScan.colors
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current

    var pin by remember {
        mutableStateOf(
            initial?.let { GeoPoint(it.latitude, it.longitude) }
                ?: GeoPoint(DeliveryLocationRules.DEFAULT_LAT, DeliveryLocationRules.DEFAULT_LNG)
        )
    }
    var hasPlacedPin by remember { mutableStateOf(initial != null) }
    var source by remember { mutableStateOf(initial?.source ?: LocationSource.MAP_PIN) }
    var addressLine by remember { mutableStateOf(initial?.addressLine) }
    var resolvedAddress by remember { mutableStateOf(initial?.resolvedAddress) }
    var status by remember { mutableStateOf<String?>(null) }
    var locating by remember { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }
    var permissionDeniedPermanently by remember { mutableStateOf(false) }
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var marker by remember { mutableStateOf<Marker?>(null) }

    fun movePin(point: GeoPoint, from: LocationSource, animate: Boolean) {
        if (confirming) {
            marker?.position = pin
            mapView?.invalidate()
            return
        }
        pin = GeoPoint(point.latitude, point.longitude)
        source = from
        hasPlacedPin = true
        addressLine = null
        resolvedAddress = null
        marker?.position = point
        if (animate) mapView?.controller?.animateTo(point) else mapView?.controller?.setCenter(point)
        mapView?.invalidate()
    }

    fun locateMe() {
        locating = true
        status = "Finding your location…"
        scope.launch {
            val location = currentLocation(context)
            locating = false
            if (location == null) {
                status = "Couldn't get your location. Check that Location is on, or place the pin by hand."
            } else {
                status = null
                movePin(GeoPoint(location.latitude, location.longitude), LocationSource.CURRENT_LOCATION, animate = true)
                mapView?.controller?.setZoom(18.0)
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { it }) {
            permissionDeniedPermanently = false
            locateMe()
        } else {
            val activity = context as? androidx.activity.ComponentActivity
            permissionDeniedPermanently = activity != null &&
                !activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)
            status = "Location permission was declined. You can still place the pin by hand."
        }
    }

    // Open near the customer's selected city when no pin exists yet.
    LaunchedEffect(Unit) {
        if (initial == null && addressHint.isNotBlank()) {
            forwardGeocode(context, addressHint)?.let { point ->
                // A slow search must not overwrite a pin the customer has already placed.
                if (!hasPlacedPin && !confirming) {
                    pin = point
                    marker?.position = point
                    mapView?.controller?.setCenter(point)
                    mapView?.invalidate()
                }
            }
        }
    }

    // Describe the pin in words once it settles.
    LaunchedEffect(pin, hasPlacedPin) {
        if (!hasPlacedPin) return@LaunchedEffect
        delay(500)
        val result = reverseGeocode(context, pin.latitude, pin.longitude)
        addressLine = result?.line
        resolvedAddress = result?.components
    }

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

    ScreenScaffold {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Pin your exact delivery location",
                subtitle = "Drag the pin or tap the map",
                onBack = onBack
            )

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        Configuration.getInstance().apply {
                            // App-private cache, and an identifying user agent as the OSM tile
                            // usage policy requires.
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
                            setMultiTouchControls(true)
                            zoomController.setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT)
                            controller.setZoom(if (initial != null) 18.0 else 16.0)
                            controller.setCenter(pin)

                            val pinMarker = Marker(this).apply {
                                position = pin
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                                isDraggable = true
                                title = "Delivery location"
                                setOnMarkerDragListener(object : Marker.OnMarkerDragListener {
                                    override fun onMarkerDrag(marker: Marker) = Unit
                                    override fun onMarkerDragStart(marker: Marker) = Unit
                                    override fun onMarkerDragEnd(marker: Marker) {
                                        movePin(marker.position, LocationSource.MAP_PIN, animate = false)
                                    }
                                })
                            }
                            overlays.add(MapEventsOverlay(object : MapEventsReceiver {
                                override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                                    movePin(p, LocationSource.MAP_PIN, animate = true)
                                    return true
                                }

                                override fun longPressHelper(p: GeoPoint): Boolean = false
                            }))
                            overlays.add(pinMarker)
                            marker = pinMarker
                            mapView = this
                        }
                    },
                    onRelease = { view ->
                        view.onDetach()
                        mapView = null
                        marker = null
                    }
                )

                // © OpenStreetMap contributors — required attribution.
                Text(
                    text = "© OpenStreetMap contributors",
                    style = PanelScan.type.label,
                    color = colors.textSecondary,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(Spacing.xs)
                        .clip(PanelScan.shapes.chip)
                        .background(colors.surface.copy(alpha = 0.85f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surface)
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Icon(Icons.Rounded.PinDrop, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (hasPlacedPin) (addressLine ?: "Location selected — complete address manually") else "Drop a pin on your exact delivery location",
                            style = PanelScan.type.cardTitle,
                            color = colors.textPrimary
                        )
                        Text(
                            text = if (hasPlacedPin) {
                                "Lat ${"%.5f".format(Locale.US, pin.latitude)} · Lng ${"%.5f".format(Locale.US, pin.longitude)}"
                            } else {
                                "So the rider doesn't have to guess. Press and drag the pin, or tap the map."
                            },
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                    }
                }
                status?.let {
                    Text(text = it, style = PanelScan.type.supporting, color = colors.warning)
                }
                if (permissionDeniedPermanently) {
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
                SecondaryButton(
                    text = if (locating) "Finding your location…" else "Use my current location",
                    icon = Icons.Rounded.MyLocation,
                    enabled = !locating && !confirming,
                    onClick = {
                        if (hasLocationPermission(context)) {
                            locateMe()
                        } else {
                            permissionLauncher.launch(
                                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                            )
                        }
                    }
                )
                PrimaryButton(
                    text = if (confirming) "Looking up address…" else "Confirm location",
                    icon = Icons.Rounded.Check,
                    enabled = hasPlacedPin && !locating && !confirming,
                    onClick = {
                        val location = ExactDeliveryLocation(pin.latitude, pin.longitude, addressLine, source, resolvedAddress)
                        val problem = DeliveryLocationRules.validate(location)
                        if (problem != null) {
                            status = DeliveryLocationRules.message(problem)
                        } else {
                            confirming = true
                            marker?.isDraggable = false
                            status = "Looking up the address for this pin…"
                            scope.launch {
                                try {
                                    // Freeze coordinates at the click and refresh even for an existing pin.
                                    val lookup = reverseGeocode(context, location.latitude, location.longitude)
                                    onConfirm(location.copy(
                                        addressLine = lookup?.line ?: location.addressLine,
                                        resolvedAddress = lookup?.components ?: location.resolvedAddress
                                    ))
                                } finally {
                                    confirming = false
                                    marker?.isDraggable = true
                                    status = null
                                }
                            }
                        }
                    }
                )
            }
        }
    }
}

private fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

/**
 * One fresh fix from the platform LocationManager (no Play Services dependency), falling
 * back to the most recent known fix. Times out rather than waiting forever indoors.
 */
@SuppressLint("MissingPermission")
private suspend fun currentLocation(context: Context): Location? {
    if (!hasLocationPermission(context)) return null
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val providers = buildList {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
        add(LocationManager.GPS_PROVIDER)
        add(LocationManager.NETWORK_PROVIDER)
    }.filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
    if (providers.isEmpty()) return null

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val fresh = withTimeoutOrNull(10_000L) {
            suspendCancellableCoroutine { continuation ->
                val signal = android.os.CancellationSignal()
                continuation.invokeOnCancellation { signal.cancel() }
                runCatching {
                    manager.getCurrentLocation(providers.first(), signal, ContextCompat.getMainExecutor(context)) { location ->
                        if (continuation.isActive) continuation.resume(location)
                    }
                }.onFailure { if (continuation.isActive) continuation.resume(null) }
            }
        }
        if (fresh != null) return fresh
    }
    return providers
        .mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
        .maxByOrNull { it.time }
}

private data class GeocodedLocation(val line: String?, val components: ResolvedDeliveryAddress)

@Suppress("DEPRECATION")
private suspend fun reverseGeocode(context: Context, lat: Double, lng: Double): GeocodedLocation? = withContext(Dispatchers.IO) {
    if (!Geocoder.isPresent()) return@withContext null
    runCatching {
        Geocoder(context, Locale.ENGLISH).getFromLocation(lat, lng, 5)
            ?.takeIf { it.isNotEmpty() }
            ?.let { addresses ->
                val line = addresses.first().addressLines().joinToString(", ").ifBlank { null }
                GeocodedLocation(
                    line = line,
                    components = PhilippineGeocodeNormalizer.combine(addresses.map(Address::toRawGeocodedAddress))
                )
            }
    }.getOrNull()
}

private fun Address.addressLines(): List<String> =
    if (maxAddressLineIndex < 0) emptyList() else (0..maxAddressLineIndex).mapNotNull { getAddressLine(it) }

private fun Address.toRawGeocodedAddress(): RawGeocodedAddress = RawGeocodedAddress(
    thoroughfare = thoroughfare,
    subThoroughfare = subThoroughfare,
    subLocality = subLocality,
    locality = locality,
    subAdminArea = subAdminArea,
    adminArea = adminArea,
    postalCode = postalCode,
    featureName = featureName,
    countryCode = countryCode,
    addressLines = addressLines()
)

@Suppress("DEPRECATION")
private suspend fun forwardGeocode(context: Context, query: String): GeoPoint? = withContext(Dispatchers.IO) {
    if (!Geocoder.isPresent()) return@withContext null
    runCatching {
        Geocoder(context, Locale.getDefault()).getFromLocationName(query, 1)?.firstOrNull()?.let {
            GeoPoint(it.latitude, it.longitude)
        }
    }.getOrNull()
}
