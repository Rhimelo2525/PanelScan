package com.example.panelscan.feature.measurement.ar.quality

import com.example.panelscan.feature.measurement.ar.cv.EdgeCornerDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class FrameQualityAndEnhancementTest {

    @Test
    fun `vision preview displays the enhanced luma without mutating normal image`() {
        val normal = byteArrayOf(100.toByte(), 150.toByte())
        val enhanced = ByteArray(2)
        AdaptiveEnhancer.apply(normal, enhanced, AdaptiveEnhancer.buildLut(1f, 30f))
        val normalPixels = VisionPreviewPixels.argb(normal, null, null, 1f)
        val enhancedPixels = VisionPreviewPixels.argb(enhanced, null, null, 1f)
        assertEquals(100, (normalPixels[0] shr 16) and 0xFF)
        assertEquals(130, (enhancedPixels[0] shr 16) and 0xFF)
        assertEquals(100, normal[0].toInt() and 0xFF)
    }

    @Test
    fun `zero preview saturation removes chroma while full saturation retains it`() {
        val y = byteArrayOf(120.toByte())
        val u = byteArrayOf(110.toByte())
        val v = byteArrayOf(150.toByte())
        val gray = VisionPreviewPixels.argb(y, u, v, 0f).single()
        val colour = VisionPreviewPixels.argb(y, u, v, 1f).single()
        assertEquals(120, (gray shr 16) and 0xFF)
        assertEquals(120, (gray shr 8) and 0xFF)
        assertTrue(colour != gray)
    }

    private val w = 320
    private val h = 240

    /** Deterministic ±amplitude noise so tests never flake. */
    private fun noise(i: Int, amplitude: Int): Int {
        val x = (i * 1103515245 + 12345) ushr 16
        return (x % (2 * amplitude + 1)) - amplitude
    }

    private fun frame(value: (x: Int, y: Int) -> Int): ByteArray {
        val out = ByteArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            out[y * w + x] = value(x, y).coerceIn(0, 255).toByte()
        }
        return out
    }

    /**
     * Two white wall faces meeting in a vertical corner, above a slightly darker ceiling
     * band — how a brightly lit white room looks to the camera. The luminance steps are only
     * 12–24 levels.
     */
    private fun brightWhiteCorner() = frame { x, y ->
        val base = when {
            y >= 120 -> 214
            x < 160 -> 238
            else -> 226
        }
        base + noise(y * w + x, 2)
    }

    // ---------------------------------------------------------------- exposure

    @Test
    fun `blown out frame is overexposed with no usable texture`() {
        val q = FrameQualityAnalyzer.analyze(frame { _, _ -> 253 }, w, h)
        assertEquals(LightingCondition.OVEREXPOSED, q.lighting)
        assertEquals(TextureLevel.VERY_LOW, q.texture)
        assertTrue(q.clippedHighFraction > 0.9f)
    }

    @Test
    fun `bright white wall reads bright not normal`() {
        val q = FrameQualityAnalyzer.analyze(brightWhiteCorner(), w, h)
        assertTrue(q.lighting == LightingCondition.BRIGHT || q.lighting == LightingCondition.OVEREXPOSED)
        assertTrue("white wall has little texture", q.texture == TextureLevel.VERY_LOW || q.texture == TextureLevel.LOW)
    }

    @Test
    fun `dark room is too dark`() {
        val q = FrameQualityAnalyzer.analyze(frame { x, y -> 14 + noise(y * w + x, 3) }, w, h)
        assertEquals(LightingCondition.TOO_DARK, q.lighting)
    }

    @Test
    fun `textured wall is normal with high texture`() {
        val q = FrameQualityAnalyzer.analyze(frame { x, y -> if ((x / 3 + y / 3) % 2 == 0) 70 else 170 }, w, h)
        assertEquals(LightingCondition.NORMAL, q.lighting)
        assertEquals(TextureLevel.HIGH, q.texture)
    }

    @Test
    fun `clipped pixels do not count as plain texture`() {
        // Half blown out, half textured: texture energy is measured on the unclipped half.
        val q = FrameQualityAnalyzer.analyze(frame { x, _ -> if (x < 160) 255 else if (x % 2 == 0) 60 else 160 }, w, h)
        assertTrue(q.textureEnergy > 20f)
    }

    // ------------------------------------------------------------- enhancement

    @Test
    fun `full range scene keeps the original threshold`() {
        val q = FrameQualityAnalyzer.analyze(frame { x, y -> if ((x / 3 + y / 3) % 2 == 0) 20 else 235 }, w, h)
        val plan = AdaptiveEnhancer.plan(q, ScanEnhancementSettings.Default)
        assertEquals(AdaptiveEnhancer.BASE_GRADIENT_THRESHOLD, plan.gradientThreshold)
        assertEquals("near-identity on a full-range frame", 1f, plan.gain, 0.06f)
    }

    @Test
    fun `compressed bright scene is stretched with a lower but bounded threshold`() {
        val q = FrameQualityAnalyzer.analyze(brightWhiteCorner(), w, h)
        val plan = AdaptiveEnhancer.plan(q, ScanEnhancementSettings.Default)
        assertTrue(plan.gain > 2f)
        assertTrue(plan.gain <= 3.5f)
        assertTrue(plan.gradientThreshold < AdaptiveEnhancer.BASE_GRADIENT_THRESHOLD)
        assertTrue(plan.gradientThreshold >= AdaptiveEnhancer.MIN_GRADIENT_THRESHOLD)
        assertTrue("colour edges help on low texture", plan.chromaWeight > 0f)
    }

    @Test
    fun `flat field is not stretched into fake texture`() {
        val q = FrameQualityAnalyzer.analyze(frame { _, _ -> 240 }, w, h)
        val plan = AdaptiveEnhancer.plan(q, ScanEnhancementSettings.Default)
        assertEquals(1f, plan.gain, 0.001f)
    }

    @Test
    fun `lut maps the 5th percentile to the target low`() {
        val q = FrameQualityAnalyzer.analyze(brightWhiteCorner(), w, h)
        val plan = AdaptiveEnhancer.plan(q, ScanEnhancementSettings.Default)
        val lut = AdaptiveEnhancer.buildLut(plan.gain, plan.offset)
        assertTrue(abs(lut[q.p05] - 16) <= 1)
        assertTrue(lut[q.p95] > lut[q.p05] + 60)
    }

    @Test
    fun `manual settings apply and reset to default`() {
        val manual = ScanEnhancementSettings(EnhancementMode.MANUAL, brightness = 0.5f, contrast = 2f, saturation = 0f)
        val plan = AdaptiveEnhancer.plan(FrameQuality.Unknown, manual)
        assertEquals(2f, plan.gain, 0.001f)
        assertEquals(32f, plan.offset, 0.001f)
        assertEquals(0f, plan.chromaWeight, 0.001f)
        assertFalse(manual.isDefault)
        assertTrue(ScanEnhancementSettings.Default.isDefault)
        // Out-of-range values are clamped rather than trusted.
        val clamped = ScanEnhancementSettings(EnhancementMode.MANUAL, 5f, 9f, -1f).normalised()
        assertEquals(1f, clamped.brightness, 0f)
        assertEquals(2.5f, clamped.contrast, 0f)
        assertEquals(0f, clamped.saturation, 0f)
    }

    @Test
    fun `enhancement never modifies the source buffer`() {
        val source = brightWhiteCorner()
        val copy = source.copyOf()
        val out = ByteArray(source.size)
        AdaptiveEnhancer.apply(source, out, AdaptiveEnhancer.buildLut(3f, -300f))
        assertTrue(source.contentEquals(copy))
    }

    // ----------------------------------------------------- the root-cause test

    @Test
    fun `white wall corner is invisible at the old fixed threshold and found after adaptive enhancement`() {
        val raw = brightWhiteCorner()

        val legacy = EdgeCornerDetector(w, h).detect(raw.copyOf())
        assertTrue("old pipeline finds nothing on a bright white corner", legacy.corners.isEmpty())

        val quality = FrameQualityAnalyzer.analyze(raw, w, h)
        val plan = AdaptiveEnhancer.plan(quality, ScanEnhancementSettings.Default)
        val enhanced = ByteArray(raw.size)
        AdaptiveEnhancer.apply(raw, enhanced, AdaptiveEnhancer.buildLut(plan.gain, plan.offset))
        val result = EdgeCornerDetector(w, h).detect(enhanced, gradientThreshold = plan.gradientThreshold)

        assertTrue("enhanced pipeline finds the corner", result.corners.isNotEmpty())
        val best = result.corners.minByOrNull { abs(it.x - 160f) + abs(it.y - 120f) }!!
        assertTrue("corner is where the faces meet: (${best.x}, ${best.y})", abs(best.x - 160f) < 6f && abs(best.y - 120f) < 6f)
    }

    @Test
    fun `enhancement does not invent corners on a plain white wall`() {
        val raw = frame { x, y -> 236 + noise(y * w + x, 2) }
        val quality = FrameQualityAnalyzer.analyze(raw, w, h)
        val plan = AdaptiveEnhancer.plan(quality, ScanEnhancementSettings.Default)
        val enhanced = ByteArray(raw.size)
        AdaptiveEnhancer.apply(raw, enhanced, AdaptiveEnhancer.buildLut(plan.gain, plan.offset))
        val result = EdgeCornerDetector(w, h).detect(enhanced, gradientThreshold = plan.gradientThreshold)
        assertTrue(result.corners.isEmpty())
    }

    @Test
    fun `colour-only edge is found with saturation weight but not without`() {
        // Same brightness either side, different chroma: beige wall against white ceiling.
        val luma = frame { x, y -> 200 + noise(y * w + x, 1) }
        val u = frame { x, y -> if (x < 160 && y < 120) 110 else 128 }
        val v = frame { x, y -> if (x < 160 && y < 120) 150 else 128 }

        val without = EdgeCornerDetector(w, h).detect(luma.copyOf(), gradientThreshold = 60)
        assertTrue(without.corners.isEmpty())

        val with = EdgeCornerDetector(w, h).detect(luma.copyOf(), gradientThreshold = 60, chromaU = u, chromaV = v, chromaWeight = 1.2f)
        assertTrue(with.corners.isNotEmpty())
    }
}
