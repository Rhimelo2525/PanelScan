package com.example.panelscan.feature.measurement.ar.quality

/** Converts the same sampled YUV data used by Vision Assist into a small display image. */
object VisionPreviewPixels {
    fun argb(
        luma: ByteArray,
        chromaU: ByteArray?,
        chromaV: ByteArray?,
        saturation: Float,
        length: Int = luma.size
    ): IntArray {
        val count = length.coerceIn(0, luma.size)
        val output = IntArray(count)
        val colourScale = saturation.coerceIn(0f, 2f)
        for (index in 0 until count) {
            val y = luma[index].toInt() and 0xFF
            val u = if (chromaU != null && index < chromaU.size) {
                ((chromaU[index].toInt() and 0xFF) - 128) * colourScale
            } else 0f
            val v = if (chromaV != null && index < chromaV.size) {
                ((chromaV[index].toInt() and 0xFF) - 128) * colourScale
            } else 0f
            val red = (y + 1.402f * v).toInt().coerceIn(0, 255)
            val green = (y - 0.344f * u - 0.714f * v).toInt().coerceIn(0, 255)
            val blue = (y + 1.772f * u).toInt().coerceIn(0, 255)
            output[index] = (0xFF shl 24) or (red shl 16) or (green shl 8) or blue
        }
        return output
    }
}
