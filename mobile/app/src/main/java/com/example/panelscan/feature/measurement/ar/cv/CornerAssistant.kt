package com.example.panelscan.feature.measurement.ar.cv

import android.media.Image
import android.graphics.Bitmap
import android.os.SystemClock
import android.util.Log
import com.example.panelscan.feature.measurement.ar.quality.AdaptiveEnhancer
import com.example.panelscan.feature.measurement.ar.quality.FrameQuality
import com.example.panelscan.feature.measurement.ar.quality.FrameQualityAnalyzer
import com.example.panelscan.feature.measurement.ar.quality.ScanEnhancementSettings
import com.example.panelscan.feature.measurement.ar.quality.VisionPreviewPixels
import com.example.panelscan.feature.measurement.ar.quality.VisionPreviewTransform
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.exceptions.NotYetAvailableException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

private const val TAG = "CornerAssist"

/** Target width for the analysis buffer. The camera image is downsampled to roughly this. */
private const val TARGET_ANALYSIS_WIDTH = 320

/** CV runs at this rate, not at camera frame rate. */
private const val ANALYSIS_INTERVAL_MS = 190L

/** A candidate corner already projected into view (screen) pixels. */
data class ScreenCorner(
    val viewX: Float,
    val viewY: Float,
    val strength: Int,
    val orthogonality: Float,
    val minLengthPx: Float,
    val maxLengthPx: Float,
    val minDensity: Float,
    val repetitive: Boolean,
    val quadrantContrast: Float
)

/** What the assistant currently knows, published as one immutable snapshot. */
data class AssistSnapshot(
    val corners: List<ScreenCorner> = emptyList(),
    val lineCount: Int = 0,
    val cvMillis: Long = 0,
    val cvPerSecond: Int = 0,
    val analysisWidth: Int = 0,
    val analysisHeight: Int = 0,
    /** Exposure/texture of the latest analysed frame. Measured on the raw (unenhanced) copy. */
    val quality: FrameQuality = FrameQuality.Unknown,
    val reticleQuality: FrameQuality = FrameQuality.Unknown,
    /** Sobel threshold the adaptive enhancer chose for that frame. */
    val gradientThreshold: Int = EdgeCornerDetector.GRADIENT_THRESHOLD,
    val enhancementGain: Float = 1f,
    val chromaUsed: Boolean = false,
    /** Increments only when a new camera image has actually been analyzed. */
    val analysisSequence: Long = 0L
)

/** A small, labeled comparison; neither bitmap is used for ARCore tracking. */
data class VisionPreviewFrame(val normal: Bitmap, val enhanced: Bitmap)

/**
 * Bridges ARCore's camera image to the corner detector and back into screen space.
 *
 * Threading contract: [submitFrame] runs on the AR frame thread and does nothing but copy a
 * downsampled luminance plane into a reusable buffer. The detection itself runs on
 * [Dispatchers.Default], one job at a time — if a job is still in flight the newer frame is
 * dropped, which is the "keep only latest" behaviour a camera analyser would give us.
 *
 * Nothing here measures anything. Image-space corners are only ever *suggestions*; the
 * measurement still comes from ARCore geometry.
 *
 * Every analysis tick also produces a [FrameQuality] (exposure + texture) whether or not
 * corner detection runs, because the scanner's guidance needs to know "too bright" from
 * "plain surface". Any contrast/brightness/colour enhancement is applied to a private copy:
 * ARCore's camera image and the on-screen preview are never modified.
 */
class CornerAssistant(
    private val scope: CoroutineScope,
    private val debug: Boolean
) {

    @Volatile
    var snapshot: AssistSnapshot = AssistSnapshot()
        private set

    /** Written from the UI thread (Advanced scanning), read on the CV thread. */
    @Volatile
    var settings: ScanEnhancementSettings = ScanEnhancementSettings.Default

    private val _preview = MutableStateFlow<VisionPreviewFrame?>(null)
    val preview: StateFlow<VisionPreviewFrame?> = _preview.asStateFlow()

    @Volatile
    var previewEnabled: Boolean = false
        set(value) {
            field = value
            if (!value) _preview.value = null
        }

    /** Set from the last plan: whether the next copy should include chroma. */
    @Volatile
    private var wantChroma = false

    private val busy = AtomicBoolean(false)
    private var lastSubmitAt = 0L

    private var detector: EdgeCornerDetector? = null
    private var analysisWidth = 0
    private var analysisHeight = 0
    private var downsample = 1

    /** Two buffers so the CV job can read one while the AR thread fills the other. */
    private var fillBuffer: ByteArray? = null
    private var workBuffer: ByteArray? = null
    private var fillU: ByteArray? = null
    private var fillV: ByteArray? = null
    private var workU: ByteArray? = null
    private var workV: ByteArray? = null
    private var fillHasChroma = false
    private var workHasChroma = false

    /** CV-thread only: the enhanced analysis copy and its lookup table. */
    private var processed: ByteArray? = null
    private val lut = IntArray(256)

    /** A sequence and its image corners are published together, never as separate fields. */
    private data class CornerAnalysis(val sequence: Long, val corners: List<CornerCandidate>)

    @Volatile
    private var analysis = CornerAnalysis(0L, emptyList())

    private var cvCount = 0
    private var analysisSequence = 0L
    private var cvWindowStart = 0L

    @Volatile
    private var cvPerSecond = 0

    @Volatile
    private var released = false

    /**
     * Copies the current camera luminance plane and, if the rate limiter allows and no job
     * is running, dispatches a detection. Safe to call every AR frame.
     */
    fun submitFrame(frame: Frame, detectCorners: Boolean = true, viewWidth: Int = 0, viewHeight: Int = 0) {
        if (released) return
        val now = SystemClock.uptimeMillis()
        if (now - lastSubmitAt < ANALYSIS_INTERVAL_MS) return
        if (busy.get()) return
        lastSubmitAt = now

        val image: Image = try {
            frame.acquireCameraImage()
        } catch (_: NotYetAvailableException) {
            return
        } catch (error: Throwable) {
            Log.w(TAG, "camera image unavailable", error)
            return
        }

        try {
            if (!ensureBuffers(image.width, image.height)) return
            val buffer = fillBuffer ?: return
            copyDownsampledLuma(image, buffer)
            fillHasChroma = false
            if ((detectCorners && wantChroma) || previewEnabled) {
                val u = fillU
                val v = fillV
                if (u != null && v != null && image.planes.size >= 3) {
                    copyDownsampledChroma(image, u, v)
                    fillHasChroma = true
                }
            }
        } catch (error: Throwable) {
            Log.w(TAG, "luma copy failed", error)
            return
        } finally {
            runCatching { image.close() }
        }

        // Swap so the detector reads a buffer the AR thread will not overwrite.
        val toProcess = fillBuffer
        fillBuffer = workBuffer
        workBuffer = toProcess
        run {
            val u = fillU; fillU = workU; workU = u
            val v = fillV; fillV = workV; workV = v
            val c = fillHasChroma; fillHasChroma = workHasChroma; workHasChroma = c
        }
        val input = toProcess ?: return
        val inputU = if (workHasChroma) workU else null
        val inputV = if (workHasChroma) workV else null
        val activeDetector = detector ?: return
        val width = analysisWidth
        val height = analysisHeight
        val currentSettings = settings
        val includePreview = previewEnabled
        // ARCore frame methods must run before the next Session.update(), on this thread.
        val previewCorners = if (viewWidth > 0 && viewHeight > 0) {
            runCatching {
                FloatArray(6) { Float.NaN }.also { output ->
                    frame.transformCoordinates2d(
                        Coordinates2d.VIEW_NORMALIZED,
                        floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f),
                        Coordinates2d.IMAGE_NORMALIZED,
                        output
                    )
                }
            }.getOrNull()
        } else null

        if (!busy.compareAndSet(false, true)) return
        scope.launch(Dispatchers.Default) {
            try {
                val started = System.nanoTime()
                // Exposure is judged on the raw copy — enhancement must not hide glare.
                val quality = FrameQualityAnalyzer.analyze(input, width, height)
                val reticleQuality = previewCorners?.let {
                    FrameQualityAnalyzer.analyzeReticle(input, width, height, it, viewWidth, viewHeight)
                } ?: FrameQuality.Unknown
                val plan = AdaptiveEnhancer.plan(quality, currentSettings)
                wantChroma = plan.chromaWeight > 0f

                val analysisInput = if (plan.remapsLuma) {
                    val out = processed?.takeIf { it.size == input.size }
                        ?: ByteArray(input.size).also { processed = it }
                    AdaptiveEnhancer.buildLut(plan.gain, plan.offset, lut)
                    AdaptiveEnhancer.apply(input, out, lut)
                    out
                } else input

                if (includePreview && previewEnabled) {
                    val displayTransform = previewCorners?.let {
                        VisionPreviewTransform.create(it, width, height, viewWidth, viewHeight)
                    }
                    val saturation = if (currentSettings.mode == com.example.panelscan.feature.measurement.ar.quality.EnhancementMode.MANUAL) {
                        currentSettings.saturation
                    } else 1f
                    fun bitmap(luma: ByteArray, colour: Float, transform: VisionPreviewTransform): Bitmap {
                        val pixels = VisionPreviewPixels.argb(luma, inputU, inputV, colour)
                        return Bitmap.createBitmap(
                            transform.sample(pixels), transform.width, transform.height, Bitmap.Config.ARGB_8888
                        )
                    }
                    _preview.value = displayTransform?.let {
                        VisionPreviewFrame(bitmap(input, 1f, it), bitmap(analysisInput, saturation, it))
                    }
                }

                if (!detectCorners) {
                    val sequence = ++analysisSequence
                    analysis = CornerAnalysis(sequence, emptyList())
                    snapshot = snapshot.copy(
                        corners = emptyList(),
                        lineCount = 0,
                        cvMillis = (System.nanoTime() - started) / 1_000_000,
                        analysisWidth = width,
                        analysisHeight = height,
                        quality = quality,
                        reticleQuality = reticleQuality,
                        gradientThreshold = plan.gradientThreshold,
                        enhancementGain = plan.gain,
                        chromaUsed = false,
                        analysisSequence = sequence
                    )
                    return@launch
                }

                val result = activeDetector.detect(
                    luma = analysisInput,
                    gradientThreshold = plan.gradientThreshold,
                    chromaU = inputU,
                    chromaV = inputV,
                    chromaWeight = plan.chromaWeight,
                    rawLuma = input
                )
                val sequence = ++analysisSequence
                analysis = CornerAnalysis(sequence, result.corners)
                countCv()
                snapshot = snapshot.copy(
                    lineCount = result.lines.size,
                    cvMillis = (System.nanoTime() - started) / 1_000_000,
                    cvPerSecond = cvPerSecond,
                    analysisWidth = result.analysisWidth,
                    analysisHeight = result.analysisHeight,
                    quality = quality,
                        reticleQuality = reticleQuality,
                    gradientThreshold = plan.gradientThreshold,
                    enhancementGain = plan.gain,
                    chromaUsed = inputU != null && plan.chromaWeight > 0f,
                    analysisSequence = sequence
                )
            } catch (error: Throwable) {
                Log.w(TAG, "detection failed", error)
            } finally {
                busy.set(false)
            }
        }
    }

    /**
     * Projects the last detection's image-space corners into view pixels using ARCore's own
     * coordinate transform, so the mapping accounts for display rotation and the difference
     * between the CPU image aspect and the viewport.
     *
     * Call on the AR frame thread with the current frame — the transform is frame-specific.
     */
    fun projectCorners(frame: Frame, viewWidth: Int, viewHeight: Int): Pair<Long, List<ScreenCorner>> {
        val current = analysis
        val corners = current.corners
        if (corners.isEmpty() || viewWidth <= 0 || viewHeight <= 0 || analysisWidth == 0) {
            return current.sequence to emptyList()
        }

        val input = FloatArray(corners.size * 2)
        corners.forEachIndexed { i, corner ->
            // Analysis space -> full CPU image space.
            input[i * 2] = corner.x * downsample
            input[i * 2 + 1] = corner.y * downsample
        }
        val output = FloatArray(input.size)

        try {
            frame.transformCoordinates2d(
                Coordinates2d.IMAGE_PIXELS,
                input,
                Coordinates2d.VIEW,
                output
            )
        } catch (error: Throwable) {
            Log.w(TAG, "coordinate transform failed", error)
            return current.sequence to emptyList()
        }

        val projected = ArrayList<ScreenCorner>(corners.size)
        corners.forEachIndexed { i, corner ->
            val x = output[i * 2]
            val y = output[i * 2 + 1]
            if (x.isNaN() || y.isNaN()) return@forEachIndexed
            if (x < 0f || y < 0f || x > viewWidth || y > viewHeight) return@forEachIndexed
            projected += ScreenCorner(
                viewX = x,
                viewY = y,
                strength = corner.strength,
                orthogonality = corner.orthogonality,
                minLengthPx = corner.minLengthPx,
                maxLengthPx = corner.maxLengthPx,
                minDensity = corner.minDensity,
                repetitive = corner.repetitive,
                quadrantContrast = corner.quadrantContrast
            )
        }

        return current.sequence to projected
    }

    /**
     * Acquires the depth image for this frame, or null when depth is unavailable. The
     * caller owns the result and must close it — acquiring once per frame rather than once
     * per candidate is what keeps the assist off the AR renderer's back.
     */
    fun acquireDepth(frame: Frame): Image? = try {
        frame.acquireDepthImage16Bits()
    } catch (_: NotYetAvailableException) {
        null
    } catch (_: Throwable) {
        null
    }

    /**
     * Depth-based sanity check against an already-acquired depth image. A true architectural
     * corner has a locally coherent depth; a line intersection caused by a poster edge or a
     * shadow often does not. Returns true when depth is unavailable, so the plane workflow
     * is never blocked by a missing capability.
     */
    fun depthLooksConsistent(
        depth: Image?,
        viewX: Float,
        viewY: Float,
        viewWidth: Int,
        viewHeight: Int
    ): Boolean {
        if (depth == null || viewWidth <= 0 || viewHeight <= 0) return true
        return try {
            val plane = depth.planes[0]
            val buffer = plane.buffer
            val rowStride = plane.rowStride
            val dw = depth.width
            val dh = depth.height

            val cx = ((viewX / viewWidth) * dw).roundToInt().coerceIn(1, dw - 2)
            val cy = ((viewY / viewHeight) * dh).roundToInt().coerceIn(1, dh - 2)

            var minMm = Int.MAX_VALUE
            var maxMm = 0
            var samples = 0
            for (dy in -1..1) {
                for (dx in -1..1) {
                    val index = (cy + dy) * rowStride + (cx + dx) * 2
                    if (index < 0 || index + 1 >= buffer.capacity()) continue
                    val raw = (buffer.get(index).toInt() and 0xFF) or
                        ((buffer.get(index + 1).toInt() and 0xFF) shl 8)
                    val millimetres = raw and 0x1FFF
                    if (millimetres == 0) continue
                    minMm = minOf(minMm, millimetres)
                    maxMm = max(maxMm, millimetres)
                    samples++
                }
            }
            if (samples < 4) return true
            // A corner spans two surfaces, so allow a real step, but reject wild spread.
            abs(maxMm - minMm) < DEPTH_SPREAD_LIMIT_MM
        } catch (_: Throwable) {
            true
        }
    }

    fun release() {
        released = true
        analysis = CornerAnalysis(analysis.sequence, emptyList())
        snapshot = AssistSnapshot()
        _preview.value = null
        fillBuffer = null
        workBuffer = null
        fillU = null; fillV = null; workU = null; workV = null
        processed = null
        detector = null
    }

    private fun ensureBuffers(imageWidth: Int, imageHeight: Int): Boolean {
        if (imageWidth <= 0 || imageHeight <= 0) return false
        val factor = max(1, (imageWidth.toFloat() / TARGET_ANALYSIS_WIDTH).roundToInt())
        val width = imageWidth / factor
        val height = imageHeight / factor
        if (detector != null && width == analysisWidth && height == analysisHeight) return true

        downsample = factor
        analysisWidth = width
        analysisHeight = height
        fillBuffer = ByteArray(width * height)
        workBuffer = ByteArray(width * height)
        fillU = ByteArray(width * height)
        fillV = ByteArray(width * height)
        workU = ByteArray(width * height)
        workV = ByteArray(width * height)
        detector = EdgeCornerDetector(width, height)
        Log.i(TAG, "analysis buffer ${width}x$height (camera ${imageWidth}x$imageHeight, /$factor)")
        return true
    }

    /**
     * Reads the Y plane straight out of the camera image with stride sampling. No Bitmap, no
     * YUV conversion, no per-frame allocation — luminance is all the detector needs.
     */
    private fun copyDownsampledLuma(image: Image, destination: ByteArray) {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride

        var out = 0
        for (y in 0 until analysisHeight) {
            var index = y * downsample * rowStride
            for (x in 0 until analysisWidth) {
                if (index >= buffer.capacity()) break
                destination[out++] = buffer.get(index)
                index += downsample * pixelStride
            }
        }
    }

    /**
     * Samples the half-resolution U and V planes at analysis resolution. Only run when the
     * last plan asked for colour edges, i.e. on low-texture or blown-out scenes.
     */
    private fun copyDownsampledChroma(image: Image, destinationU: ByteArray, destinationV: ByteArray) {
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer
        val uRow = uPlane.rowStride
        val vRow = vPlane.rowStride
        val uPixel = uPlane.pixelStride
        val vPixel = vPlane.pixelStride
        val chromaWidth = image.width / 2
        val chromaHeight = image.height / 2

        var out = 0
        for (y in 0 until analysisHeight) {
            val cy = ((y * downsample) / 2).coerceAtMost(chromaHeight - 1)
            for (x in 0 until analysisWidth) {
                val cx = ((x * downsample) / 2).coerceAtMost(chromaWidth - 1)
                val ui = cy * uRow + cx * uPixel
                val vi = cy * vRow + cx * vPixel
                destinationU[out] = if (ui < uBuffer.capacity()) uBuffer.get(ui) else ZERO
                destinationV[out] = if (vi < vBuffer.capacity()) vBuffer.get(vi) else ZERO
                out++
            }
        }
    }

    private fun countCv() {
        cvCount++
        val now = SystemClock.uptimeMillis()
        if (cvWindowStart == 0L) cvWindowStart = now
        if (now - cvWindowStart >= 1_000L) {
            cvPerSecond = cvCount
            cvCount = 0
            cvWindowStart = now
        }
    }

    private companion object {
        const val DEPTH_SPREAD_LIMIT_MM = 350
        const val ZERO: Byte = 0
    }
}
