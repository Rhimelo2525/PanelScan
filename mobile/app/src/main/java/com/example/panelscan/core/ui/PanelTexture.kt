package com.example.panelscan.core.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import com.example.panelscan.core.design.PanelScan
import kotlin.random.Random

/**
 * Product imagery, drawn rather than shipped.
 *
 * The catalogue is local and has no bitmaps, so each panel finish is rendered procedurally
 * from its `textureResource` id. Deterministic seeding means a given panel always looks the
 * same, which is what makes the grid read as a product catalogue instead of placeholders.
 */
@Composable
fun PanelTexture(
    textureResource: String,
    modifier: Modifier = Modifier,
    shape: Shape = PanelScan.shapes.thumbnail,
    showSeams: Boolean = true
) {
    // drawWithCache instead of Canvas: the finish is built from hundreds of primitives
    // (speckle, veining, grain), and this records them once per size rather than rebuilding
    // the draw lambda's state on every draw pass — first paint and grid reflows get the
    // benefit, and scrolling replays a cached display list.
    Box(
        modifier = modifier
            .clip(shape)
            .drawWithCache {
                val resource = textureResource
                val seams = showSeams
                onDrawBehind {
                    drawFinish(resource)
                    if (seams) drawSeams(resource)
                    drawSheen()
                }
            }
    )
}

internal data class FinishPalette(
    val base: Color,
    val shade: Color,
    val detail: Color,
    val highlight: Color
)

internal fun finishPalette(textureResource: String): FinishPalette = when (textureResource) {
    "marble_white" -> FinishPalette(
        base = Color(0xFFF3F1EC),
        shade = Color(0xFFDCD8D0),
        detail = Color(0xFFB4AEA4),
        highlight = Color(0xFFFFFFFF)
    )
    "slate_grey" -> FinishPalette(
        base = Color(0xFF8E9297),
        shade = Color(0xFF6B7076),
        detail = Color(0xFF565B61),
        highlight = Color(0xFFB9BDC2)
    )
    "wood_oak" -> FinishPalette(
        base = Color(0xFFC49A6A),
        shade = Color(0xFF9E7548),
        detail = Color(0xFF7C5731),
        highlight = Color(0xFFE0BC90)
    )
    "gloss_white" -> FinishPalette(
        base = Color(0xFFFAFAFA),
        shade = Color(0xFFE6E7E9),
        detail = Color(0xFFD2D4D8),
        highlight = Color(0xFFFFFFFF)
    )
    "silver_stripe" -> FinishPalette(
        base = Color(0xFFC7CBD0),
        shade = Color(0xFFA3A8AF),
        detail = Color(0xFF8B9098),
        highlight = Color(0xFFECEEF1)
    )
    else -> FinishPalette(
        base = Color(0xFFD9D6D0),
        shade = Color(0xFFBBB7B0),
        detail = Color(0xFF9A968F),
        highlight = Color(0xFFF2F0EC)
    )
}

private fun DrawScope.drawFinish(textureResource: String) {
    val palette = finishPalette(textureResource)
    drawRect(
        brush = Brush.linearGradient(
            colors = listOf(palette.highlight, palette.base, palette.shade),
            start = Offset(0f, 0f),
            end = Offset(size.width, size.height)
        )
    )

    val random = Random(textureResource.hashCode())
    when (textureResource) {
        "marble_white" -> drawVeining(palette, random)
        "wood_oak" -> drawWoodGrain(palette, random)
        "silver_stripe" -> drawStripes(palette, stripeCount = 9)
        "slate_grey" -> drawSpeckle(palette, random)
        "gloss_white" -> drawGlossSweep(palette)
        else -> drawSpeckle(palette, random)
    }
}

private fun DrawScope.drawVeining(palette: FinishPalette, random: Random) {
    repeat(5) { index ->
        val path = Path()
        val startY = size.height * (0.1f + index * 0.19f) + random.nextFloat() * 20f
        path.moveTo(-10f, startY)
        var x = -10f
        var y = startY
        while (x < size.width + 10f) {
            val nextX = x + size.width / 4f
            val nextY = y + (random.nextFloat() - 0.5f) * size.height * 0.28f
            path.quadraticTo(x + size.width / 8f, y - size.height * 0.08f, nextX, nextY)
            x = nextX
            y = nextY
        }
        drawPath(
            path = path,
            color = palette.detail.copy(alpha = 0.14f + random.nextFloat() * 0.14f),
            style = Stroke(width = 1f + random.nextFloat() * 2.5f)
        )
    }
}

private fun DrawScope.drawWoodGrain(palette: FinishPalette, random: Random) {
    val lines = 26
    repeat(lines) { index ->
        val x = size.width * index / lines + random.nextFloat() * 4f
        drawLine(
            color = palette.detail.copy(alpha = 0.06f + random.nextFloat() * 0.16f),
            start = Offset(x, 0f),
            end = Offset(x + (random.nextFloat() - 0.5f) * 8f, size.height),
            strokeWidth = 0.8f + random.nextFloat() * 2.2f
        )
    }
    repeat(3) {
        val cx = random.nextFloat() * size.width
        val cy = random.nextFloat() * size.height
        drawOval(
            color = palette.detail.copy(alpha = 0.10f),
            topLeft = Offset(cx - 10f, cy - 22f),
            size = Size(20f, 44f)
        )
    }
}

private fun DrawScope.drawStripes(palette: FinishPalette, stripeCount: Int) {
    val stripeWidth = size.width / stripeCount
    repeat(stripeCount) { index ->
        if (index % 2 == 0) {
            drawRect(
                color = palette.shade.copy(alpha = 0.35f),
                topLeft = Offset(index * stripeWidth, 0f),
                size = Size(stripeWidth * 0.55f, size.height)
            )
        }
        drawLine(
            color = palette.highlight.copy(alpha = 0.5f),
            start = Offset(index * stripeWidth, 0f),
            end = Offset(index * stripeWidth, size.height),
            strokeWidth = 1f
        )
    }
}

private fun DrawScope.drawSpeckle(palette: FinishPalette, random: Random) {
    repeat(160) {
        drawCircle(
            color = palette.detail.copy(alpha = 0.05f + random.nextFloat() * 0.12f),
            radius = 0.6f + random.nextFloat() * 1.6f,
            center = Offset(random.nextFloat() * size.width, random.nextFloat() * size.height)
        )
    }
}

private fun DrawScope.drawGlossSweep(palette: FinishPalette) {
    drawRect(
        brush = Brush.linearGradient(
            colors = listOf(
                Color.Transparent,
                palette.highlight.copy(alpha = 0.85f),
                Color.Transparent
            ),
            start = Offset(size.width * 0.1f, size.height),
            end = Offset(size.width * 0.75f, 0f)
        )
    )
}

/** Faint panel joints, so a swatch reads as installed cladding rather than flat colour. */
private fun DrawScope.drawSeams(textureResource: String) {
    val palette = finishPalette(textureResource)
    val seamCount = 4
    val seamSpacing = size.width / seamCount
    repeat(seamCount - 1) { index ->
        val x = seamSpacing * (index + 1)
        drawLine(
            color = palette.detail.copy(alpha = 0.22f),
            start = Offset(x, 0f),
            end = Offset(x, size.height),
            strokeWidth = 1.2f
        )
        drawLine(
            color = palette.highlight.copy(alpha = 0.35f),
            start = Offset(x + 1.4f, 0f),
            end = Offset(x + 1.4f, size.height),
            strokeWidth = 1f
        )
    }
}

/** Shared top-light sheen and bottom vignette that give every swatch the same "lit" feel. */
private fun DrawScope.drawSheen() {
    drawRect(
        brush = Brush.verticalGradient(
            colors = listOf(
                Color.White.copy(alpha = 0.18f),
                Color.Transparent,
                Color.Black.copy(alpha = 0.10f)
            )
        )
    )
}

/** Flat brush of a finish, for tiny swatches where the full canvas would be noise. */
@Composable
fun finishSwatchBrush(textureResource: String): Brush {
    val palette = finishPalette(textureResource)
    return Brush.linearGradient(listOf(palette.highlight, palette.base, palette.shade))
}
