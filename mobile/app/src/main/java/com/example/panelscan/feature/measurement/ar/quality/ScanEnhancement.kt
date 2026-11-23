package com.example.panelscan.feature.measurement.ar.quality

import kotlin.math.pow
import kotlin.math.roundToInt

/** AUTO adapts analysis to the lighting every frame; MANUAL uses the Advanced sliders. */
enum class EnhancementMode { AUTO, MANUAL }

/**
 * User-facing "Advanced scanning" settings.
 *
 * These only ever change the *analysis copy* of the camera image used by the corner
 * assistant. ARCore keeps tracking from the untouched camera image and the preview on
 * screen is not altered, so no setting here can degrade tracking.
 */
data class ScanEnhancementSettings(
    val mode: EnhancementMode = EnhancementMode.AUTO,
    /** -1..1; shifts analysis luminance by up to ±64 levels. */
    val brightness: Float = 0f,
    /** 0.5..2.5; multiplies analysis contrast around mid-grey. */
    val contrast: Float = 1f,
    /**
     * 0..2; how much colour (chroma) edges count alongside brightness edges. This is the
     * only place "saturation" is meaningful: a beige wall meeting a white ceiling can have
     * almost identical brightness but a clear colour step.
     */
    val saturation: Float = 1f
) {
    val isDefault: Boolean get() = this == Default

    fun normalised(): ScanEnhancementSettings = copy(
        brightness = brightness.coerceIn(-1f, 1f),
        contrast = contrast.coerceIn(0.5f, 2.5f),
        saturation = saturation.coerceIn(0f, 2f)
    )

    companion object {
        val Default = ScanEnhancementSettings()
    }
}

/** A per-frame decision about how to prepare the analysis buffer. */
data class EnhancementPlan(
    val gain: Float,
    val offset: Float,
    /** Weight of chroma gradients in the edge detector; 0 skips colour entirely. */
    val chromaWeight: Float,
    /** Sobel magnitude a pixel must reach to vote for a line. */
    val gradientThreshold: Int,
    /** False when the plan is an identity mapping and the copy can be skipped. */
    val remapsLuma: Boolean
)

/**
 * Adaptive analysis preprocessing for bright and low-texture scenes.
 *
 * The original detector used a fixed Sobel threshold of 90 on the raw 0..255 luminance. On
 * a white or brightly lit wall the whole picture lives in a narrow band near the top of the
 * range: the step between two wall faces meeting at a corner is often 8–20 levels, i.e. a
 * Sobel response of ~30–80, which never clears 90. Nothing was ever detected there.
 *
 * AUTO mode therefore:
 *  - stretches the frame's own 5th..95th percentile range onto the full range, capped so
 *    sensor noise is not amplified into fake texture;
 *  - lowers the gradient threshold only in proportion to how compressed the range was, so
 *    normal textured scenes keep exactly the old threshold (no new false candidates);
 *  - brings in colour edges only when brightness texture is scarce.
 *
 * Candidates found this way still need ARCore geometric confirmation before they can lock,
 * so a more sensitive image stage cannot by itself produce a false corner.
 */
object AdaptiveEnhancer {

    const val BASE_GRADIENT_THRESHOLD = 90
    const val MIN_GRADIENT_THRESHOLD = 40
    private const val MAX_AUTO_GAIN = 3.5f
    private const val TARGET_LOW = 16f
    private const val TARGET_HIGH = 240f

    fun plan(
        quality: FrameQuality,
        settings: ScanEnhancementSettings,
        reticleQuality: FrameQuality = FrameQuality.Unknown
    ): EnhancementPlan {
        val s = settings.normalised()
        return when (s.mode) {
            EnhancementMode.MANUAL -> {
                val gain = s.contrast
                val offset = s.brightness * 64f
                EnhancementPlan(
                    gain = gain,
                    offset = offset,
                    chromaWeight = s.saturation * 0.6f,
                    gradientThreshold = thresholdFor(effectiveRange(quality, gain)),
                    remapsLuma = gain != 1f || offset != 0f
                )
            }
            EnhancementMode.AUTO -> autoPlan(quality, reticleQuality)
        }
    }

    private fun autoPlan(quality: FrameQuality, reticleQuality: FrameQuality): EnhancementPlan {
        val active = selectEffectiveQuality(quality, reticleQuality)
        if (!active.isKnown) {
            return EnhancementPlan(1f, 0f, 0f, BASE_GRADIENT_THRESHOLD, remapsLuma = false)
        }
        val range = active.dynamicRange
        // A range this small is either a flat field or pure clipping; there is nothing to
        // recover, and stretching it would only turn noise into "edges".
        val gain = if (range < 8) {
            1f
        } else {
            ((TARGET_HIGH - TARGET_LOW) / range).coerceIn(1f, MAX_AUTO_GAIN)
        }
        // Map p05 -> TARGET_LOW:  out = (in - p05) * gain + TARGET_LOW
        //                       = in * gain + (TARGET_LOW - p05 * gain)
        // expressed around mid-grey for the shared LUT builder.
        val offset = if (gain == 1f) 0f else TARGET_LOW - active.p05 * gain - 128f * (1f - gain)
        val lowTexture = active.texture == TextureLevel.VERY_LOW || active.texture == TextureLevel.LOW ||
            quality.texture == TextureLevel.VERY_LOW || quality.texture == TextureLevel.LOW
        val challengingLight = active.lighting != LightingCondition.NORMAL ||
            quality.lighting != LightingCondition.NORMAL ||
            (reticleQuality.isKnown && reticleQuality.lighting != quality.lighting)
        val chroma = when {
            lowTexture && challengingLight -> 0.85f
            lowTexture || challengingLight -> 0.65f
            else -> 0f
        }
        return EnhancementPlan(
            gain = gain,
            offset = offset,
            chromaWeight = chroma,
            gradientThreshold = thresholdFor(effectiveRange(active, gain)),
            remapsLuma = gain != 1f || challengingLight
        )
    }

    /**
     * When a wall has both a bright reflection and a sudden dark shadow spot, the global
     * 5th..95th range looks artificially wide while the patch under the reticle has compressed
     * local contrast. Prefer the reticle patch when it reveals a local dark spot, glare, or
     * compressed tonal range.
     */
    private fun selectEffectiveQuality(global: FrameQuality, reticle: FrameQuality): FrameQuality {
        if (!reticle.isKnown) return global
        if (!global.isKnown) return reticle
        val reticleCompressed = reticle.dynamicRange in 8 until (global.dynamicRange - 25)
        val localLightingDiffers = reticle.lighting != global.lighting &&
            (reticle.lighting == LightingCondition.TOO_DARK ||
                reticle.lighting == LightingCondition.DIM ||
                reticle.lighting == LightingCondition.BRIGHT ||
                reticle.lighting == LightingCondition.OVEREXPOSED)
        return if (reticleCompressed || localLightingDiffers) reticle else global
    }

    private fun effectiveRange(quality: FrameQuality, gain: Float): Float =
        if (!quality.isKnown) 224f else (quality.dynamicRange * gain).coerceAtMost(255f)

    /** Full-range scenes keep the original threshold; compressed scenes scale it down. */
    fun thresholdFor(effectiveRange: Float): Int {
        val factor = (effectiveRange / 200f).coerceIn(0.45f, 1f)
        return (BASE_GRADIENT_THRESHOLD * factor).roundToInt()
            .coerceIn(MIN_GRADIENT_THRESHOLD, BASE_GRADIENT_THRESHOLD)
    }

    /**
     * Builds a 256-entry lookup table: `out = (in - 128) * gain + 128 + offset`, clamped.
     * A LUT keeps the per-pixel cost to one array read.
     */
    fun buildLut(gain: Float, offset: Float, into: IntArray = IntArray(256)): IntArray {
        for (i in 0..255) {
            into[i] = ((i - 128f) * gain + 128f + offset).roundToInt().coerceIn(0, 255)
        }
        return into
    }

    /**
     * Builds an exposure-resilient LUT that combines the linear stretch from [plan] with
     * shadow-lift gamma for sudden dark spots and soft highlight rolloff for reflections/glare.
     */
    fun buildAdaptiveLut(
        plan: EnhancementPlan,
        quality: FrameQuality,
        reticleQuality: FrameQuality = FrameQuality.Unknown,
        into: IntArray = IntArray(256)
    ): IntArray {
        val active = selectEffectiveQuality(quality, reticleQuality)
        val darkScene = active.lighting == LightingCondition.TOO_DARK ||
            active.lighting == LightingCondition.DIM ||
            active.clippedLowFraction >= 0.08f
        val brightGlare = active.lighting == LightingCondition.OVEREXPOSED ||
            active.lighting == LightingCondition.BRIGHT ||
            active.clippedHighFraction >= 0.06f
        val gamma = when {
            darkScene && !brightGlare -> 0.76f
            brightGlare && !darkScene -> 1.18f
            else -> 1.0f
        }
        for (i in 0..255) {
            val linear = ((i - 128f) * plan.gain + 128f + plan.offset).coerceIn(0f, 255f)
            val norm = (linear / 255f).coerceIn(0f, 1f)
            val curved = if (gamma == 1.0f) norm else norm.pow(gamma)
            into[i] = (curved * 255f).roundToInt().coerceIn(0, 255)
        }
        return into
    }

    /** Writes the remapped copy into [destination]; the source buffer is never modified. */
    fun apply(source: ByteArray, destination: ByteArray, lut: IntArray, length: Int = source.size) {
        for (i in 0 until length) {
            destination[i] = lut[source[i].toInt() and 0xFF].toByte()
        }
    }
}
