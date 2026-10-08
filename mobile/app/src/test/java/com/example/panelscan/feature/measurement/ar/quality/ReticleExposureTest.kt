package com.example.panelscan.feature.measurement.ar.quality

import com.example.panelscan.feature.measurement.ar.cv.EdgeCornerDetector
import org.junit.Assert.*
import org.junit.Test

class ReticleExposureTest {
    private val identity = floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f)
    @Test fun `bright window outside reticle does not become local glare`() {
        val luma = ByteArray(120 * 120) { i -> if (i % 120 < 35 || i % 120 > 85) 255.toByte() else 120.toByte() }
        assertEquals(LightingCondition.OVEREXPOSED, FrameQualityAnalyzer.analyze(luma, 120, 120).lighting)
        assertEquals(LightingCondition.NORMAL, FrameQualityAnalyzer.analyzeReticle(luma, 120, 120, identity, 120, 120).lighting)
    }
    @Test fun `reticle over highlight identifies glare even if overall view is normal`() {
        val luma = ByteArray(120 * 120) { i -> if (i % 120 in 45..75 && i / 120 in 45..75) 255.toByte() else 90.toByte() }
        assertEquals(LightingCondition.NORMAL, FrameQualityAnalyzer.analyze(luma, 120, 120).lighting)
        assertEquals(LightingCondition.OVEREXPOSED, FrameQualityAnalyzer.analyzeReticle(luma, 120, 120, identity, 120, 120).lighting)
    }
    @Test fun `invalid display transform has no local exposure claim`() {
        assertEquals(FrameQuality.Unknown, FrameQualityAnalyzer.analyzeReticle(ByteArray(100), 10, 10, FloatArray(6), 100, 100))
    }
    @Test fun `specular boundary is excluded from optional corner evidence`() {
        val raw = ByteArray(160 * 160) { i -> if (i % 160 > 70 && i / 160 > 70) 255.toByte() else 90.toByte() }
        val enhanced = ByteArray(raw.size)
        AdaptiveEnhancer.apply(raw, enhanced, AdaptiveEnhancer.buildLut(0.7f, 5f))
        val detector = EdgeCornerDetector(160, 160)
        val unmasked = detector.detect(enhanced, gradientThreshold = 35)
        val masked = detector.detect(enhanced, gradientThreshold = 35, rawLuma = raw)
        assertTrue(unmasked.lines.isNotEmpty())
        assertTrue(masked.lines.size < unmasked.lines.size)
    }
}
