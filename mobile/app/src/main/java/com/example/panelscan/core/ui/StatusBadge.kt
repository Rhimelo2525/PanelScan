package com.example.panelscan.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan

enum class BadgeTone { Neutral, Accent, Success, Warning, Destructive }

/** Small pill used for availability, surface type and tracking quality. */
@Composable
fun StatusBadge(
    text: String,
    modifier: Modifier = Modifier,
    tone: BadgeTone = BadgeTone.Neutral,
    showDot: Boolean = false
) {
    val colors = PanelScan.colors
    val (background, foreground) = when (tone) {
        BadgeTone.Neutral -> colors.surfaceMuted to colors.textSecondary
        BadgeTone.Accent -> colors.accentSoft to colors.accent
        BadgeTone.Success -> colors.successSoft to colors.success
        BadgeTone.Warning -> colors.warningSoft to colors.warning
        BadgeTone.Destructive -> colors.destructiveSoft to colors.destructive
    }

    Row(
        modifier = modifier
            .clip(PanelScan.shapes.chip)
            .background(background)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        if (showDot) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(PanelScan.shapes.chip)
                    .background(foreground)
            )
        }
        Text(text = text.uppercase(), style = PanelScan.type.label, color = foreground)
    }
}

/** Badge variant for camera / 3D overlays, where the page palette would disappear. */
@Composable
fun OverlayBadge(
    text: String,
    modifier: Modifier = Modifier,
    dotColor: Color? = null
) {
    Row(
        modifier = modifier
            .clip(PanelScan.shapes.chip)
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        if (dotColor != null) {
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .clip(PanelScan.shapes.chip)
                    .background(dotColor)
            )
        }
        Text(text = text, style = PanelScan.type.label, color = Color.White)
    }
}
