package com.example.panelscan.feature.measurement.ar.quality

import kotlin.math.abs

/** How the camera is exposed, from the analysis copy of the luminance plane. */
enum class LightingCondition { UNKNOWN, TOO_DARK, DIM, NORMAL, BRIGHT, OVEREXPOSED }

/**
 * How much usable visual texture is in view. This is advisory only: a low value explains
 * *why* ARCore may struggle, but it never blocks a measurement on its own — a tracked or
 * depth-backed plane with low texture is still a valid surface.
 */
enum class TextureLevel { UNKNOWN, VERY_LOW, LOW, NORMAL, HIGH }

/**
 * One frame's exposure and texture summary.
 *
 * Computed on the background CV thread from the downsampled copy of ARCore's Y plane. The
 * camera feed ARCore tracks with is never touched.
 */
data class FrameQuality(
    val meanLuma: Float = 0f,
    val p05: Int = 0,
    val p50: Int = 0,
    val p95: Int = 0,
    /** Fraction of pixels at or above [FrameQualityAnalyzer.CLIP_HIGH]: blown-out highlights. */
    val clippedHighFraction: Float = 0f,
    /** Fraction of pixels at or below [FrameQualityAnalyzer.CLIP_LOW]: crushed shadows. */
    val clippedLowFraction: Float = 0f,
    /** Mean absolute luminance gradient over unclipped pixels (0..255 scale). */
    val textureEnergy: Float = 0f,
    /** Fraction of sampled pixels whose gradient clears the sensor-noise floor. */
    val usableTextureFraction: Float = 0f,
    val lighting: LightingCondition = LightingCondition.UNKNOWN,
    val texture: TextureLevel = TextureLevel.UNKNOWN
) {
    /** Spread of the useful tonal range; small means a flat, low-contrast picture. */
    val dynamicRange: Int get() = (p95 - p05).coerceAtLeast(0)

    val isKnown: Boolean get() = lighting != LightingCondition.UNKNOWN

    companion object {
        val Unknown = FrameQuality()
    }
}

/**
 * Exposure and texture statistics for a luminance buffer.
 *
 * Pure Kotlin on primitive arrays so the classification can be unit tested with synthetic
 * frames (a blown-out white wall, a dark room, a textured wall) without an AR camera.
 */
object FrameQualityAnalyzer {

    const val CLIP_HIGH = 250
    const val CLIP_LOW = 6

    /** Gradient below this is sensor noise on a flat surface, not texture. */
    private const val NOISE_FLOOR = 10

    /** Every second pixel in each direction is plenty for global statistics. */
    private const val STRIDE = 2

    fun analyze(luma: ByteArray, width: Int, height: Int): FrameQuality {
        if (width <= 2 || height <= 2 || luma.size < width * height) return FrameQuality.Unknown

        val histogram = IntArray(256)
        var sum = 0L
        var samples = 0
        var gradientSum = 0L
        var gradientSamples = 0
        var textured = 0

        var y = 0
        while (y < height - 1) {
            val row = y * width
            var x = 0
            while (x < width - 1) {
                val v = luma[row + x].toInt() and 0xFF
                histogram[v]++
                sum += v
                samples++

                // Forward differences. Clipped pixels carry no texture information, and
                // counting their zero gradient would make a blown-out wall look "plain"
                // when the real problem is exposure.
                if (v in (CLIP_LOW + 1) until CLIP_HIGH) {
                    val right = luma[row + x + 1].toInt() and 0xFF
                    val down = luma[row + width + x].toInt() and 0xFF
                    val g = abs(right - v) + abs(down - v)
                    gradientSum += g
                    gradientSamples++
                    if (g >= NOISE_FLOOR) textured++
                }
                x += STRIDE
            }
            y += STRIDE
        }
        if (samples == 0) return FrameQuality.Unknown

        val p05 = percentile(histogram, samples, 0.05f)
        val p50 = percentile(histogram, samples, 0.50f)
        val p95 = percentile(histogram, samples, 0.95f)
        var high = 0
        for (i in CLIP_HIGH..255) high += histogram[i]
        var low = 0
        for (i in 0..CLIP_LOW) low += histogram[i]

        val mean = sum.toFloat() / samples
        val clippedHigh = high.toFloat() / samples
        val clippedLow = low.toFloat() / samples
        val energy = if (gradientSamples > 0) gradientSum.toFloat() / gradientSamples else 0f
        // Normalised by all samples, so a frame that is mostly blown out also reads as
        // having little usable texture — which is true, and is what ARCore experiences.
        val usable = textured.toFloat() / samples

        return FrameQuality(
            meanLuma = mean,
            p05 = p05,
            p50 = p50,
            p95 = p95,
            clippedHighFraction = clippedHigh,
            clippedLowFraction = clippedLow,
            textureEnergy = energy,
            usableTextureFraction = usable,
            lighting = classifyLighting(mean, p50, p95, clippedHigh),
            texture = classifyTexture(usable)
        )
    }

    fun analyzeReticle(luma: ByteArray, width: Int, height: Int, imageCorners: FloatArray,
        viewWidth: Int, viewHeight: Int): FrameQuality {
        if (luma.size < width * height) return FrameQuality.Unknown
        val transform = VisionPreviewTransform.create(imageCorners, width, height, viewWidth, viewHeight, 96)
            ?: return FrameQuality.Unknown
        if (transform.width < 3 || transform.height < 3) return FrameQuality.Unknown
        val display = transform.sample(IntArray(luma.size) { i -> luma[i].toInt() and 0xFF })
        val patchW = (transform.width / 3).coerceAtLeast(3)
        val patchH = (transform.height / 3).coerceAtLeast(3)
        val left = (transform.width - patchW) / 2
        val top = (transform.height - patchH) / 2
        val patch = ByteArray(patchW * patchH) { i ->
            display[(top + i / patchW) * transform.width + left + i % patchW].toByte()
        }
        return analyze(patch, patchW, patchH)
    }

    fun classifyLighting(
        mean: Float,
        p50: Int,
        p95: Int,
        clippedHighFraction: Float
    ): LightingCondition = when {
        clippedHighFraction >= 0.30f || p50 >= 242 -> LightingCondition.OVEREXPOSED
        clippedHighFraction >= 0.12f || mean >= 195f -> LightingCondition.BRIGHT
        mean < 28f || p95 < 45 -> LightingCondition.TOO_DARK
        mean < 60f -> LightingCondition.DIM
        else -> LightingCondition.NORMAL
    }

    fun classifyTexture(usableTextureFraction: Float): TextureLevel = when {
        usableTextureFraction < 0.02f -> TextureLevel.VERY_LOW
        usableTextureFraction < 0.07f -> TextureLevel.LOW
        usableTextureFraction > 0.28f -> TextureLevel.HIGH
        else -> TextureLevel.NORMAL
    }

    private fun percentile(histogram: IntArray, total: Int, fraction: Float): Int {
        val target = (total * fraction).toInt().coerceAtLeast(1)
        var running = 0
        for (i in histogram.indices) {
            running += histogram[i]
            if (running >= target) return i
        }
        return 255
    }
}
