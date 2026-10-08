package com.example.panelscan.feature.measurement.ar.quality

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class VisionPreviewTransformTest {
    private val source = intArrayOf(1, 2, 3, 4, 5, 6)

    @Test
    fun `display mapping preserves landscape image without a mirror`() {
        val transform = VisionPreviewTransform.create(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f), 3, 2, 3, 2, 3)!!
        assertArrayEquals(source, transform.sample(source))
    }

    @Test
    fun `portrait clockwise mapping keeps scene upright and aligned in both previews`() {
        val transform = VisionPreviewTransform.create(floatArrayOf(0f, 1f, 0f, 0f, 1f, 1f), 3, 2, 2, 3, 3)!!
        assertEquals(2, transform.width)
        assertEquals(3, transform.height)
        assertArrayEquals(intArrayOf(4, 1, 5, 2, 6, 3), transform.sample(source))
        assertArrayEquals(intArrayOf(14, 11, 15, 12, 16, 13), transform.sample(source.map { it + 10 }.toIntArray()))
        assertArrayEquals(intArrayOf(1, 2, 3, 4, 5, 6), source)
    }

    @Test
    fun `opposite portrait and upside down views follow their own frame mapping`() {
        val opposite = VisionPreviewTransform.create(floatArrayOf(1f, 0f, 1f, 1f, 0f, 0f), 3, 2, 2, 3, 3)!!
        assertArrayEquals(intArrayOf(3, 6, 2, 5, 1, 4), opposite.sample(source))
        val upsideDown = VisionPreviewTransform.create(floatArrayOf(1f, 1f, 0f, 1f, 1f, 0f), 3, 2, 3, 2, 3)!!
        assertArrayEquals(intArrayOf(6, 5, 4, 3, 2, 1), upsideDown.sample(source))
    }

    @Test
    fun `viewport crop excludes camera pixels outside the live view`() {
        val transform = VisionPreviewTransform.create(floatArrayOf(0.25f, 0f, 0.75f, 0f, 0.25f, 1f), 4, 2, 2, 2, 2)!!
        assertArrayEquals(intArrayOf(2, 3, 6, 7), transform.sample(intArrayOf(1, 2, 3, 4, 5, 6, 7, 8)))
    }

    @Test
    fun `invalid or unavailable mapping cannot publish a sideways sensor sample`() {
        assertNull(VisionPreviewTransform.create(FloatArray(6) { Float.NaN }, 3, 2, 2, 3))
        assertNull(VisionPreviewTransform.create(FloatArray(6), 3, 2, 2, 3))
        assertNull(VisionPreviewTransform.create(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f), 3, 2, 0, 0))
        val bounded = VisionPreviewTransform.create(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f), 3, 2, 1080, 2400)
        assertNotNull(bounded)
        assertEquals(320, bounded!!.height)
        assertEquals(144, bounded.width)
    }
}
