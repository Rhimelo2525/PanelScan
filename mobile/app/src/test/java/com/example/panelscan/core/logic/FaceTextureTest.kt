package com.example.panelscan.core.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FaceTextureTest {

    private fun rgb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    private fun red(c: Int) = (c shr 16) and 0xFF

    @Test
    fun `reads the face tones, leaving out the white background and groove shadows`() {
        val wood = List(600) { rgb(170 + it % 30, 120, 70) }
        val background = List(400) { rgb(250, 250, 250) }
        val shadows = List(100) { rgb(40, 25, 15) }
        val (dark, base, light) = FaceTexture.palette((wood + background + shadows).toIntArray()).toList()
        assertTrue(red(dark) < red(base) && red(base) < red(light))
        // Nothing of the white background or the near-black shadows in the middle tone.
        assertTrue(red(base) in 170..200)
    }

    @Test
    fun `a plain colour stays plain`() {
        val white = IntArray(500) { rgb(232, 230, 226) }
        val (dark, base, light) = FaceTexture.palette(white).toList()
        val grain = FaceTexture.woodGrain(64, dark, base, light, seed = 7)
        assertTrue(grain.all { red(it) == 232 })
    }

    @Test
    fun `the grain runs along the panel and stays in the face's tones`() {
        val grain = FaceTexture.woodGrain(128, rgb(120, 80, 40), rgb(170, 120, 70), rgb(210, 160, 110), seed = 3)
        assertEquals(128 * 128, grain.size)
        assertTrue(grain.all { red(it) in 120..210 })
        // Across a row the tone changes a lot; down a column only a little.
        val across = (0 until 127).sumOf { kotlin.math.abs(red(grain[it]) - red(grain[it + 1])) }
        val along = (0 until 127).sumOf { kotlin.math.abs(red(grain[it * 128]) - red(grain[(it + 1) * 128])) }
        assertTrue("across $across along $along", across > along * 3)
    }
}
