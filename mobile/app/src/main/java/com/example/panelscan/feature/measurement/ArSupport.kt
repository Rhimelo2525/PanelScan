package com.example.panelscan.feature.measurement

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.ar.core.ArCoreApk
import kotlinx.coroutines.delay

/** Result of asking the device whether it can run an AR session at all. */
enum class ArReadiness {
    Checking,
    Ready,
    NeedsArCoreInstall,
    Unsupported;

    val isBlocking: Boolean get() = this == NeedsArCoreInstall || this == Unsupported
}

/**
 * ARCore availability, polled off the main entry screen.
 *
 * Nothing here creates a session or a renderer — it is a capability query only, which is
 * why it is safe to run before the camera screen is ever opened.
 */
@Composable
fun rememberArReadiness(): State<ArReadiness> {
    val context = LocalContext.current
    val state = remember { mutableStateOf(ArReadiness.Checking) }

    LaunchedEffect(Unit) {
        var attempts = 0
        while (attempts < 20) {
            val availability = runCatching {
                ArCoreApk.getInstance().checkAvailability(context)
            }.getOrNull()

            when {
                availability == null -> {
                    state.value = ArReadiness.Unsupported
                    return@LaunchedEffect
                }
                availability.isTransient -> {
                    attempts++
                    delay(200)
                }
                availability.isSupported -> {
                    state.value = when (availability) {
                        ArCoreApk.Availability.SUPPORTED_INSTALLED -> ArReadiness.Ready
                        else -> ArReadiness.NeedsArCoreInstall
                    }
                    return@LaunchedEffect
                }
                else -> {
                    state.value = ArReadiness.Unsupported
                    return@LaunchedEffect
                }
            }
        }
        // Still transient after several seconds — treat as unavailable rather than hanging.
        if (state.value == ArReadiness.Checking) state.value = ArReadiness.Unsupported
    }

    return state
}

/** Camera permission state that re-reads itself whenever the screen resumes. */
@Composable
fun rememberCameraPermissionState(): State<Boolean> {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val granted = remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                granted.value = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    return granted
}
