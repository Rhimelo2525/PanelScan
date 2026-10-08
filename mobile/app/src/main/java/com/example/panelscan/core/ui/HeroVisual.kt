package com.example.panelscan.core.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.PathEffect
import com.example.panelscan.core.design.PanelScan

/**
 * The hero image: an abstract room corner in clad panels with a measurement bracket across
 * it. Drawn rather than photographed so it always matches the palette and ships no assets.
 */
@Composable
fun ArchitecturalHeroVisual(
    modifier: Modifier = Modifier,
    shape: Shape = PanelScan.shapes.card,
    accent: Color = PanelScan.colors.accent
) {
    val dark = PanelScan.colors.isLight.not()
    Box(modifier = modifier.clip(shape)) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawRoomScene(accent = accent, dark = dark)
        }
    }
}

private fun DrawScope.drawRoomScene(accent: Color, dark: Boolean) {
    val wallLight = if (dark) Color(0xFF2A2E33) else Color(0xFFE8E4DC)
    val wallDark = if (dark) Color(0xFF1B1E22) else Color(0xFFD3CDC2)
    val floor = if (dark) Color(0xFF141619) else Color(0xFFC0B9AC)
    val ink = if (dark) Color(0xFFF2F1EE) else Color(0xFF2A2C30)

    // Back wall
    drawRect(
        brush = Brush.verticalGradient(listOf(wallLight, wallDark))
    )

    // Left return wall, in shadow
    val returnWall = Path().apply {
        moveTo(0f, 0f)
        lineTo(size.width * 0.28f, size.height * 0.12f)
        lineTo(size.width * 0.28f, size.height * 0.90f)
        lineTo(0f, size.height)
        close()
    }
    drawPath(returnWall, brush = Brush.horizontalGradient(listOf(wallDark, wallLight)))

    // Floor plane
    val floorPath = Path().apply {
        moveTo(0f, size.height)
        lineTo(size.width * 0.28f, size.height * 0.90f)
        lineTo(size.width, size.height * 0.82f)
        lineTo(size.width, size.height)
        close()
    }
    drawPath(floorPath, color = floor)

    // Panel joints across the back wall
    val jointCount = 7
    for (index in 1 until jointCount) {
        val fraction = index / jointCount.toFloat()
        val x = size.width * (0.28f + 0.72f * fraction)
        drawLine(
            color = ink.copy(alpha = 0.10f),
            start = Offset(x, size.height * (0.12f - 0.12f * fraction)),
            end = Offset(x, size.height * (0.90f - 0.08f * fraction)),
            strokeWidth = 1.5f
        )
    }

    // Panel joints on the return wall
    for (index in 1 until 3) {
        val x = size.width * 0.28f * index / 3f
        drawLine(
            color = ink.copy(alpha = 0.08f),
            start = Offset(x, size.height * 0.04f * index),
            end = Offset(x, size.height * (1f - 0.033f * index)),
            strokeWidth = 1.5f
        )
    }

    // Measurement bracket over the clad section
    val dash = PathEffect.dashPathEffect(floatArrayOf(10f, 8f), 0f)
    val left = size.width * 0.40f
    val right = size.width * 0.86f
    val top = size.height * 0.26f
    val bottom = size.height * 0.66f

    drawRect(
        color = accent.copy(alpha = 0.10f),
        topLeft = Offset(left, top),
        size = Size(right - left, bottom - top)
    )
    drawRect(
        color = accent,
        topLeft = Offset(left, top),
        size = Size(right - left, bottom - top),
        style = Stroke(width = 2f, pathEffect = dash)
    )

    // Corner handles
    listOf(
        Offset(left, top), Offset(right, top), Offset(left, bottom), Offset(right, bottom)
    ).forEach { handle ->
        drawCircle(color = accent, radius = 5f, center = handle)
        drawCircle(color = Color.White, radius = 2f, center = handle)
    }

    // Width tick under the bracket
    val tickY = bottom + size.height * 0.09f
    drawLine(accent, Offset(left, tickY), Offset(right, tickY), strokeWidth = 2f)
    drawLine(accent, Offset(left, tickY - 7f), Offset(left, tickY + 7f), strokeWidth = 2f)
    drawLine(accent, Offset(right, tickY - 7f), Offset(right, tickY + 7f), strokeWidth = 2f)
}
