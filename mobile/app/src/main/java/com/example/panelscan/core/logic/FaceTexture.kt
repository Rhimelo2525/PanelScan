package com.example.panelscan.core.logic

import kotlin.math.PI
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/**
 * A clean face texture for a panel that has no surface photo yet. A product
 * photo shows the whole panel, grooves, shadows and background included, so
 * using it directly paints extra stripes over the 3D grooves. Instead its
 * colours are read (a middle, a lighter and a darker tone of the face) and a
 * plain wood grain is drawn in them, running along the panel's length.
 * Colours are ARGB ints; pixels run row by row.
 */
object FaceTexture {

    /**
     * The face's [dark, base, light] tones from photo pixels: the background
     * (near white or near transparent), groove shadows (the darkest fifth) and
     * glare (the brightest twentieth) are left out, then the rest is split
     * into darker, middle and lighter thirds and each averaged.
     */
    fun palette(pixels: IntArray): IntArray {
        val face = pixels.filter { pixel ->
            val alpha = pixel ushr 24
            val r = (pixel shr 16) and 0xFF; val g = (pixel shr 8) and 0xFF; val b = pixel and 0xFF
            val isBackground = r > 238 && g > 238 && b > 238
            alpha > 200 && !isBackground
        }.sortedBy(::luminance)
        if (face.size < 30) {
            val fallback = pixels.firstOrNull() ?: 0xFFD9D6D0.toInt()
            return intArrayOf(shade(fallback, 0.85f), fallback, shade(fallback, 1.1f))
        }
        val kept = face.subList((face.size * 0.2f).toInt(), (face.size * 0.95f).toInt())
        val third = kept.size / 3
        return intArrayOf(average(kept.subList(0, third)), average(kept.subList(third, 2 * third)), average(kept.subList(2 * third, kept.size)))
    }

    /**
     * A [size] × [size] wood grain in the [dark], [base] and [light] tones:
     * fine lines along the length (y), a few broader bands, and a gentle
     * sideways wander so it does not look ruled. Plain colours give a plain
     * face, since the tones are close together.
     */
    fun woodGrain(size: Int, dark: Int, base: Int, light: Int, seed: Int): IntArray {
        val random = Random(seed)
        val bands = List(5) { Triple(random.nextFloat() * 2f * PI.toFloat(), 2f + random.nextInt(5), 0.25f + random.nextFloat() * 0.35f) }
        val lines = FloatArray(size) { random.nextFloat() }
        val wander = List(2) { random.nextFloat() * 2f * PI.toFloat() }
        val pixels = IntArray(size * size)
        for (y in 0 until size) {
            val v = y / size.toFloat()
            val shift = 0.012f * sin(2f * PI.toFloat() * v + wander[0]) + 0.006f * sin(6f * PI.toFloat() * v + wander[1])
            for (x in 0 until size) {
                val u = x / size.toFloat() + shift
                var broad = 0f
                for ((phase, frequency, weight) in bands) broad += weight * sin(2f * PI.toFloat() * frequency * u + phase)
                // Fine grain: smoothly blended random values every few pixels across.
                val fx = (u - floor(u)) * size / 3f
                val i = fx.toInt()
                val t = fx - i
                val fine = lerp(lines[i % size], lines[(i + 1) % size], t * t * (3 - 2 * t)) - 0.5f
                val grain = (broad * 0.55f + fine * 0.9f).coerceIn(-1f, 1f)
                pixels[y * size + x] = if (grain >= 0f) mix(base, light, grain) else mix(base, dark, -grain)
            }
        }
        return pixels
    }

    private fun luminance(pixel: Int): Int = (((pixel shr 16) and 0xFF) * 299 + ((pixel shr 8) and 0xFF) * 587 + (pixel and 0xFF) * 114) / 1000

    private fun average(pixels: List<Int>): Int {
        var r = 0L; var g = 0L; var b = 0L
        for (pixel in pixels) { r += (pixel shr 16) and 0xFF; g += (pixel shr 8) and 0xFF; b += pixel and 0xFF }
        val n = pixels.size.coerceAtLeast(1)
        return argb((r / n).toInt(), (g / n).toInt(), (b / n).toInt())
    }

    private fun mix(from: Int, to: Int, amount: Float): Int = argb(
        lerp(((from shr 16) and 0xFF).toFloat(), ((to shr 16) and 0xFF).toFloat(), amount).roundToInt(),
        lerp(((from shr 8) and 0xFF).toFloat(), ((to shr 8) and 0xFF).toFloat(), amount).roundToInt(),
        lerp((from and 0xFF).toFloat(), (to and 0xFF).toFloat(), amount).roundToInt()
    )

    private fun shade(pixel: Int, factor: Float): Int = argb(
        (((pixel shr 16) and 0xFF) * factor).roundToInt().coerceIn(0, 255),
        (((pixel shr 8) and 0xFF) * factor).roundToInt().coerceIn(0, 255),
        ((pixel and 0xFF) * factor).roundToInt().coerceIn(0, 255)
    )

    private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

    private fun argb(r: Int, g: Int, b: Int): Int = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
}
