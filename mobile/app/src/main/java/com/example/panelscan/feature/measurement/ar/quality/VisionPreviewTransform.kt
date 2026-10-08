package com.example.panelscan.feature.measurement.ar.quality

import kotlin.math.max
import kotlin.math.roundToInt

/** A display-oriented sampling map shared by the normal and enhanced preview images. */
class VisionPreviewTransform private constructor(
    val width: Int,
    val height: Int,
    private val sourceIndices: IntArray
) {
    fun sample(sourcePixels: IntArray): IntArray =
        IntArray(sourceIndices.size) { sourcePixels[sourceIndices[it]] }

    companion object {
        /**
         * Corners are ARCore's VIEW_NORMALIZED -> IMAGE_NORMALIZED transform of top-left,
         * top-right and bottom-left. Capturing them on the current AR frame preserves its
         * display rotation and viewport crop without rotating the CV analysis buffers.
         */
        fun create(
            imageCorners: FloatArray,
            sourceWidth: Int,
            sourceHeight: Int,
            viewWidth: Int,
            viewHeight: Int,
            maxDimension: Int = 320
        ): VisionPreviewTransform? {
            if (imageCorners.size != 6 || imageCorners.any { !it.isFinite() } ||
                sourceWidth <= 0 || sourceHeight <= 0 || viewWidth <= 0 || viewHeight <= 0 ||
                maxDimension <= 0
            ) return null
            val originX = imageCorners[0]
            val originY = imageCorners[1]
            val horizontalX = imageCorners[2] - originX
            val horizontalY = imageCorners[3] - originY
            val verticalX = imageCorners[4] - originX
            val verticalY = imageCorners[5] - originY
            // An unchanged/invalid ARCore output cannot be displayed as a valid camera view.
            if (kotlin.math.abs(horizontalX * verticalY - horizontalY * verticalX) < 0.000001f) return null
            val scale = maxDimension.toFloat() / max(viewWidth, viewHeight)
            val width = (viewWidth * scale).roundToInt().coerceAtLeast(1)
            val height = (viewHeight * scale).roundToInt().coerceAtLeast(1)
            val indices = IntArray(width * height)
            for (y in 0 until height) {
                val v = (y + 0.5f) / height
                for (x in 0 until width) {
                    val u = (x + 0.5f) / width
                    val sourceX = ((originX + u * horizontalX + v * verticalX) * sourceWidth)
                        .toInt().coerceIn(0, sourceWidth - 1)
                    val sourceY = ((originY + u * horizontalY + v * verticalY) * sourceHeight)
                        .toInt().coerceIn(0, sourceHeight - 1)
                    indices[y * width + x] = sourceY * sourceWidth + sourceX
                }
            }
            return VisionPreviewTransform(width, height, indices)
        }
    }
}
