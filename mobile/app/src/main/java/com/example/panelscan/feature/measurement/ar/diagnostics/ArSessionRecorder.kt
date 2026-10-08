package com.example.panelscan.feature.measurement.ar.diagnostics

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.FileProvider
import com.example.panelscan.BuildConfig
import com.example.panelscan.feature.measurement.ar.ArUiState
import com.google.ar.core.Frame
import com.google.ar.core.RecordingConfig
import com.google.ar.core.RecordingStatus
import com.google.ar.core.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Opt-in datasets stay on this device; only an explicit Share launches another app. */
class ArSessionRecorder(private val context: Context) {
    data class State(val recording: Boolean = false, val seconds: Int = 0, val message: String = "", val saving: Boolean = false)
    val state = mutableStateOf(State())
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var folder: File? = null
    private var writer: BufferedWriter? = null // Only touched by io executor.
    private val writeError = AtomicReference<String?>(null)
    private var startedAt = 0L
    private var lastSampleAt = 0L
    @Volatile private var finishing = false
    private var thermal = -1
    private var thermalAt = 0L
    private var eventCount = 0L

    fun start(session: Session, roomLight: String, surface: String, assisted: Boolean,
        torchEnabled: Boolean, referenceDatabase: File? = null, referenceWidthMetres: Float? = null) {
        if (state.value.recording || finishing) return
        val time = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(java.util.Date())
        val lightLabel = if (roomLight == "off") "off" else "on"
        val dir = File(context.filesDir, "ar_recordings/${time}_${surface.lowercase()}_room-${lightLabel}_torch-${if (torchEnabled) "on" else "off"}_${UUID.randomUUID().toString().take(8)}")
        try {
            check(dir.mkdirs()) { "Could not create recording folder" }
            check(dir.usableSpace > 250L * 1024 * 1024) { "Free at least 250 MB before recording" }
            val metadata = JSONObject().put("schema", 1).put("startedUtcMs", System.currentTimeMillis())
                .put("phone", "${Build.MANUFACTURER} ${Build.MODEL}").put("androidApi", Build.VERSION.SDK_INT)
                .put("appVersion", BuildConfig.VERSION_NAME).put("surface", surface)
                .put("roomLight", roomLight).put("torchInitiallyOn", torchEnabled).put("referenceAssisted", assisted)
                .put("referenceWidthMetres", referenceWidthMetres)
                .put("note", "Camera and sensor dataset. CSV timestamps are monotonic; room light is reported by the user. Placement and torch changes are logged.")
            if (assisted) {
                require(referenceDatabase?.isFile == true) { "Register the reference again before recording" }
                referenceDatabase!!.copyTo(File(dir, "reference.imgdb"))
            }
            File(dir, "metadata.json").writeText(metadata.toString(2))
            session.startRecording(RecordingConfig(session)
                .setMp4DatasetUri(Uri.fromFile(File(dir, "session.mp4"))).setAutoStopOnPause(true))
            check(session.recordingStatus == RecordingStatus.OK) { "ARCore did not start recording" }
            folder = dir
            startedAt = SystemClock.uptimeMillis()
            lastSampleAt = 0L
            writeError.set(null)
            eventCount = 0L
            io.execute {
                try {
                    writer = File(dir, "diagnostics.csv").bufferedWriter()
                    writer?.write("elapsed_ms,frame_ns,event,surface,room_light,torch,tracking,failure,phase,issue,source,lock_progress,point_count,width_m,height_m,fps,depth_supported,depth_active,depth_timestamp_ns,confident_fraction,inlier_fraction,coverage,fit_rms_m,fit_points,global_luma,global_clipped,local_luma,local_clipped,camera_speed_mps,camera_turn_dps,work_ms,thermal,camera_config,reference_status,lock_anchor,lock_usable,point_anchors,lock_normal,tracked_plane_match,reticle_block,session_id,search_generation,lock_recoveries\n")
                } catch (e: Exception) { writeError.set(e.message ?: "Log could not be saved") }
            }
            state.value = State(true, 0, "Recording $surface · room light $roomLight")
            label = roomLight
        } catch (e: Exception) {
            runCatching { if (session.recordingStatus == RecordingStatus.OK) session.stopRecording() }
            state.value = State(message = "Recording could not start: ${e.message}")
        }
    }
    private var label = "unknown"

    fun sample(session: Session, frame: Frame, ui: ArUiState, forceEvent: String? = null) {
        if (!state.value.recording) return
        val now = SystemClock.uptimeMillis()
        if (writeError.get() != null) { stop(session, "Diagnostic log failed: ${writeError.get()}"); return }
        if (session.recordingStatus != RecordingStatus.OK) {
            finish("Recording ended by ARCore (${session.recordingStatus}).", session.recordingStatus == RecordingStatus.NONE)
            return
        }
        val seconds = ((now - startedAt) / 1000).toInt()
        if (seconds != state.value.seconds) state.value = state.value.copy(seconds = seconds)
        if (seconds >= 120) { stop(session, "Saved · two-minute limit reached"); return }
        if (forceEvent == null && now - lastSampleAt < 200L) return
        lastSampleAt = now
        if (now - thermalAt > 1000L) {
            thermalAt = now
            thermal = if (Build.VERSION.SDK_INT >= 29) (context.getSystemService(Context.POWER_SERVICE) as PowerManager).currentThermalStatus else -1
        }
        val d = ui.diagnostics
        eventCount++
        val row = listOf(now - startedAt, frame.timestamp, forceEvent ?: "sample", ui.surfaceType.name, label,
            ui.torchEnabled, frame.camera.trackingState.name, frame.camera.trackingFailureReason.name,
            ui.phase.javaClass.simpleName, ui.issue.name, d?.surfaceSource ?: "NONE", ui.lockProgress,
            ui.pointCount, ui.widthMeters, ui.heightMeters, d?.fps, ui.depthSupported, d?.depthActive,
            d?.depthTimestampNs, d?.depthConfidentFraction, d?.depthInlierFraction, d?.depthCoverage,
            d?.depthFitRms, d?.depthFitPoints, d?.lumaMean, d?.clippedPercent, d?.localLumaMean,
            d?.localClippedPercent, d?.cameraSpeed, d?.cameraTurn, d?.frameWorkMillis, thermal, d?.cameraConfig,
            ui.referenceStatus, d?.lockAnchorTracking, d?.lockUsable, d?.pointAnchorsTracking, d?.lockNormal,
            d?.trackedPlaneMatches, d?.reticleBlock, d?.sessionId, d?.searchGeneration, d?.lockRecoveries).joinToString(",") { csv(it?.toString() ?: "") } + "\n"
        io.execute { try { writer?.write(row) } catch(e: Exception) { writeError.set(e.message ?: "Log write failed") } }
    }

    fun stop(session: Session?, reason: String = "Recording saved") {
        if (!state.value.recording) return
        try {
            if (session?.recordingStatus == RecordingStatus.OK) session.stopRecording()
            finish(reason, true)
        } catch (e: Exception) {
            // Keep recording state: the user can retry Stop; never share an unfinished MP4.
            state.value = state.value.copy(message = "Could not stop recording: ${e.message}. Try Stop again.")
        }
    }

    /** Session auto-stop owns the native close when the view is destroyed. No stale handles. */
    fun release() {
        if (state.value.recording) finish("Recording ended when AR closed", true)
        io.shutdown()
    }

    private fun finish(message: String, complete: Boolean) {
        val dir = folder ?: return
        finishing = true
        state.value = state.value.copy(recording = false, message = "Finishing recording…", saving = true)
        folder = null
        io.execute {
            try {
                writer?.close(); writer = null
                File(dir, "result.json").writeText(JSONObject().put("endedUtcMs", System.currentTimeMillis())
                    .put("reason", message).put("logError", writeError.get()).toString(2))
                if (complete && eventCount > 0 && writeError.get() == null && File(dir, "session.mp4").length() > 0) File(dir, "complete").writeText("1")
            } catch (e: Exception) { writeError.set(e.message) }
            finally {
                main.post {
                    finishing = false
                    state.value = state.value.copy(saving = false, message =
                        if (writeError.get() != null) "Recording log failed: ${writeError.get()}" else message)
                }
            }
        }
    }

    companion object {
        private fun csv(value: String) = "\"${value.replace("\"", "\"\"")}\""
        fun recordings(context: Context): List<File> = File(context.filesDir, "ar_recordings").listFiles()
            ?.filter { it.isDirectory && File(it, "complete").exists() && File(it, "session.mp4").length() > 0 }
            ?.sortedByDescending { it.name } ?: emptyList()

        suspend fun share(context: Context, dir: File) {
            val zip = withContext(Dispatchers.IO) {
                require(dir in recordings(context)) { "Recording is still being finalized" }
                val exports = File(context.cacheDir, "ar_exports").apply { mkdirs() }
                val file = File(exports, "${dir.name}.zip")
                val part = File(exports, "${dir.name}.zip.part")
                try {
                    ZipOutputStream(part.outputStream().buffered()).use { stream ->
                        dir.listFiles()?.filter { it.isFile && it.name != "complete" }?.forEach { input ->
                            stream.putNextEntry(ZipEntry(input.name))
                            input.inputStream().use { it.copyTo(stream) }; stream.closeEntry()
                        }
                    }
                    check(part.renameTo(file)) { "Could not prepare recording" }
                    file
                } catch(e: Exception) { part.delete(); throw e }
            }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.arfiles", zip)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/zip"; putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri("AR recording", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "Share AR recording"))
        }
    }
}
