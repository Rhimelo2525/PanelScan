package com.example.panelscan.data.local

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import com.example.panelscan.core.logic.WallPhotoGeometry
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.model.WallPhoto
import com.example.panelscan.core.ui.formatMeters
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.max

/**
 * The copy of a wall photo the PanelScan team sees: the measured outline
 * drawn on it, with its width and height, and a caption naming the surface
 * and size. The photo on the phone stays clean for the 3D preview.
 */
object WallPhotoAnnotator {

    private const val JPEG_QUALITY = 88
    private val LINE = Color.WHITE
    private val HALO = Color.argb(150, 0, 0, 0)
    private val FILL = Color.argb(46, 255, 255, 255)
    private val ACCENT = Color.rgb(0x9C, 0x5A, 0x2E)
    private val PILL = Color.argb(225, 0x1E, 0x1A, 0x17)

    /** The annotated JPEG, or null if the photo can't be read. */
    fun annotate(file: File, photo: WallPhoto, widthMeters: Double, heightMeters: Double, surface: SurfaceType): ByteArray? {
        val source = BitmapFactory.decodeFile(file.path) ?: return null
        val bitmap = source.copy(Bitmap.Config.ARGB_8888, true)
        source.recycle()
        val canvas = Canvas(bitmap)
        // Sizes scale with the photo, so they read the same at any resolution.
        val unit = max(bitmap.width, bitmap.height) / 1000f
        val width = "${formatMeters(widthMeters)} m"
        val height = "${formatMeters(heightMeters)} m"

        WallPhotoGeometry.pixelCorners(photo, bitmap.width, bitmap.height)?.let { corners ->
            drawOutline(canvas, corners, unit)
            // Width along the first edge (bottom-left to bottom-right), height up the left one.
            for ((text, to) in listOf("W  $width" to 1, "H  $height" to 3)) {
                val label = Label(text, unit)
                val at = WallPhotoGeometry.labelAnchor(corners, 0, to, label.halfWidth, label.halfHeight, 10f * unit, bitmap.width, bitmap.height)
                label.draw(canvas, at)
            }
        }
        drawCaption(canvas, "${if (surface == SurfaceType.WALL) "Wall" else "Ceiling"} · $width × $height", unit)

        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
        bitmap.recycle()
        return out.toByteArray()
    }

    private fun drawOutline(canvas: Canvas, corners: List<Pair<Float, Float>>, unit: Float) {
        val path = Path().apply {
            moveTo(corners[0].first, corners[0].second)
            for (corner in corners.drop(1)) lineTo(corner.first, corner.second)
            close()
        }
        canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = FILL; style = Paint.Style.FILL })
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND }
        canvas.drawPath(path, stroke.apply { color = HALO; strokeWidth = 8f * unit })
        canvas.drawPath(path, stroke.apply { color = LINE; strokeWidth = 4f * unit })
        val dot = Paint(Paint.ANTI_ALIAS_FLAG)
        for ((x, y) in corners) {
            canvas.drawCircle(x, y, 9f * unit, dot.apply { color = LINE })
            canvas.drawCircle(x, y, 5.5f * unit, dot.apply { color = ACCENT })
        }
    }

    /** White bold text on a dark rounded pill; its size is known before it is placed. */
    private class Label(private val text: String, unit: Float) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 30f * unit
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
        val halfWidth = paint.measureText(text) / 2f + 16f * unit
        val halfHeight = paint.textSize * 0.62f + 8f * unit

        fun draw(canvas: Canvas, at: Pair<Float, Float>) {
            val (x, y) = at
            val box = RectF(x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight)
            canvas.drawRoundRect(box, halfHeight, halfHeight, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = PILL })
            canvas.drawText(text, x, y - (paint.ascent() + paint.descent()) / 2f, paint)
        }
    }

    /** A dark strip along the bottom: what was measured and how big. */
    private fun drawCaption(canvas: Canvas, text: String, unit: Float) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 26f * unit
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val barHeight = paint.textSize + 24f * unit
        val top = canvas.height - barHeight
        canvas.drawRect(0f, top, canvas.width.toFloat(), canvas.height.toFloat(), Paint().apply { color = Color.argb(170, 0, 0, 0) })
        canvas.drawText(text, 18f * unit, top + barHeight / 2f - (paint.ascent() + paint.descent()) / 2f, paint)
    }
}
