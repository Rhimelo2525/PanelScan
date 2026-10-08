package com.example.panelscan.feature.measurement

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.panelscan.feature.measurement.ar.ArMeasureController
import com.example.panelscan.feature.measurement.ar.ArUiState
import com.example.panelscan.feature.measurement.ar.diagnostics.ArSessionRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
internal fun ArToolsDialog(controller: ArMeasureController, state: ArUiState, onReplay: (File?) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recording by controller.recorder.state
    var roomLight by remember { mutableStateOf("on") }
    var saved by remember { mutableStateOf(emptyList<File>()) }
    var refresh by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var widthCm by remember { mutableStateOf("") }
    var mountedFlat by remember { mutableStateOf(false) }

    LaunchedEffect(recording.recording, recording.saving, refresh) {
        if (!recording.recording) delay(500) // Let the ordered diagnostic writer finish its close.
        saved = withContext(Dispatchers.IO) { ArSessionRecorder.recordings(context) }
    }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            busy = true
            try {
                bitmap = withContext(Dispatchers.IO) {
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                    require(bounds.outWidth >= 300 && bounds.outHeight >= 300) { "Choose an image at least 300 × 300 pixels" }
                    val options = BitmapFactory.Options()
                    while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 1600) options.inSampleSize *= 2
                    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
                        ?: error("Image could not be opened")
                }
                message = "Image selected. Enter the actual printed-image width."
            } catch(e: Exception) { message = e.message ?: "Image could not be opened" }
            finally { busy = false }
        }
    }
    val replayPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            busy = true
            try {
                val file = withContext(Dispatchers.IO) {
                    val dir = File(context.cacheDir, "ar_replays").apply { mkdirs() }
                    val target = File(dir, "replay_${System.currentTimeMillis()}.mp4")
                    try {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            target.outputStream().use { output ->
                                val buffer = ByteArray(64 * 1024)
                                var total = 0L
                                while (true) {
                                    val n = input.read(buffer)
                                    if (n < 0) break
                                    total += n
                                    require(total <= 1024L * 1024 * 1024) { "Choose a recording smaller than 1 GB" }
                                    output.write(buffer, 0, n)
                                }
                            }
                        } ?: error("Could not open recording")
                        target
                    } catch(e: Exception) { target.delete(); throw e }
                }
                onDismiss(); onReplay(file)
            } catch(e: Exception) { message = e.message ?: "Replay could not be opened" }
            finally { busy = false }
        }
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("AR tools") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Record a scan")
                Text("Captures camera and sensor data plus a diagnostic log. Keep other people and private details out of view. Files stay on this phone until you share them.")
                Text("Room lights (set before starting)")
                Row {
                    listOf("on", "off").forEach { value ->
                        TextButton(enabled = !recording.recording && !recording.saving && !busy, onClick = { roomLight = value }) {
                            Text("${if (roomLight == value) "✓ " else ""}${value.uppercase()}")
                        }
                    }
                }
                Text("${state.surfaceType.name} · Flashlight ${if (state.torchEnabled) "ON" else "OFF"}")
                TextButton(enabled = !busy && !recording.saving && !state.replaying, onClick = {
                    if (recording.recording) controller.stopRecording() else controller.startRecording(roomLight)
                }) { Text(if (recording.recording) "Stop recording · ${recording.seconds}s" else "Start recording") }
                if (recording.message.isNotBlank()) Text(recording.message)
                Text("Close this panel after Start and scan for 30–60 seconds. Include the surface edges and corners. Recording stops when AR pauses or after two minutes.")
                Text("Saved recordings (${saved.size})")
                TextButton(enabled = !busy, onClick = { refresh++ }) { Text("Refresh saved recordings") }
                saved.take(16).forEach { file ->
                    Text(file.name)
                    Row {
                        TextButton(enabled = !busy && !recording.recording && !recording.saving, onClick = {
                            scope.launch {
                                busy = true
                                try { ArSessionRecorder.share(context, file) }
                                catch(e: Exception) { message = "Could not share: ${e.message}" }
                                finally { busy = false }
                            }
                        }) { Text("Share ZIP") }
                        TextButton(enabled = !busy && !recording.recording && !recording.saving, onClick = {
                            onDismiss(); onReplay(File(file, "session.mp4"))
                        }) { Text("Replay") }
                    }
                }
                TextButton(enabled = state.pointCount == 0 && !state.replaying,
                    onClick = { controller.setQuickMode(!state.quickMode) }) {
                    Text(if (state.quickMode) "Quick measure is ON — switch to surface scanning" else "Switch to Quick measure (no surface scan)")
                }
                Text("Reference image assistance (optional)")
                Text("Use a detailed photograph printed on matte paper, fixed flat on the SAME wall or ceiling. Measure the width of the printed image itself, excluding paper margins. Keep the print visible and select points on the same unobstructed surface. Incorrect print size gives incorrect measurements.")
                TextButton(enabled = !busy && !recording.recording && !recording.saving && state.canChangeSurface && !state.replaying,
                    onClick = { imagePicker.launch("image/*") }) { Text("Choose the exact image you printed") }
                OutlinedTextField(value = widthCm, onValueChange = { widthCm = it }, singleLine = true,
                    label = { Text("Measured printed-image width (cm)") }, enabled = !recording.recording && !recording.saving && !busy)
                Row {
                    Checkbox(checked = mountedFlat, onCheckedChange = { mountedFlat = it }, enabled = !recording.recording && !recording.saving && !busy)
                    Text("I measured the print and mounted it flat on the target surface")
                }
                TextButton(enabled = bitmap != null && mountedFlat && !busy && !recording.recording && !recording.saving && state.canChangeSurface,
                    onClick = {
                        val width = widthCm.toFloatOrNull()?.div(100f)
                        if (width == null || width !in 0.05f..1f) message = "Enter the measured width between 5 and 100 cm"
                        else message = if (controller.configureReference(bitmap!!, width)) "Reference registered. Close this panel and scan the print." else "Reference could not be registered. Try a detailed photograph."
                    }) { Text("Use reference image") }
                Text(state.referenceStatus)
                TextButton(enabled = !state.replaying && state.referenceConfigured && state.canChangeSurface && !recording.recording && !recording.saving && !busy,
                    onClick = { controller.setReferenceEnabled(!state.referenceEnabled) }) {
                    Text(if (state.referenceEnabled) "Return to ordinary scanning" else "Enable registered reference")
                }
                Text("Replay for diagnosis")
                Text("Use an original ARCore MP4, not a screen recording. Replay results can differ from the live scan. Replay dimensions are for diagnosis only.")
                TextButton(enabled = !busy && !recording.recording && !recording.saving, onClick = { replayPicker.launch("video/mp4") }) { Text("Open ARCore MP4") }
                if (state.replaying) TextButton(enabled = !busy, onClick = { onDismiss(); onReplay(null) }) { Text("Return to live camera") }
                if (busy) Text("Preparing…")
                if (message.isNotBlank()) Text(message)
            }
        },
        confirmButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("Done") } }
    )
}
