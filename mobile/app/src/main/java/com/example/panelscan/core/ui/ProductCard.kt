package com.example.panelscan.core.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.PVCPanel

/**
 * Catalogue tile: a large 4:3 finish image over a tight information block.
 * Every product surface in the app (catalogue, panel picker, home shortcuts) uses this,
 * so the grid stays on a single rhythm.
 */
@Composable
fun ProductCard(
    panel: PVCPanel,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    showPrice: Boolean = false
) {
    val colors = PanelScan.colors
    val borderWidth by animateDpAsState(
        targetValue = if (selected) 2.dp else 1.dp,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "productBorder"
    )

    Column(
        modifier = modifier
            // The border is drawn by the animated modifier below, so the base surface
            // leaves it transparent rather than stacking two strokes.
            .panelSurface(
                shape = PanelScan.shapes.card,
                borderColor = Color.Transparent,
                elevation = if (selected) 3.dp else 1.dp
            )
            .border(
                width = borderWidth,
                color = if (selected) colors.accent else colors.border,
                shape = PanelScan.shapes.card
            )
            .pressScale(onClick = onClick)
            .padding(Spacing.xs)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 3f)
        ) {
            PanelImage(panel = panel, modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f))
            if (!panel.inStock) {
                StatusBadge(
                    text = "Made to order",
                    tone = BadgeTone.Warning,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(Spacing.xs)
                )
            }
        }

        Column(
            modifier = Modifier.padding(
                start = Spacing.xs,
                end = Spacing.xs,
                top = Spacing.sm,
                bottom = Spacing.xs
            ),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = panel.category.removePrefix("PVC ").uppercase(),
                style = PanelScan.type.label,
                color = colors.textTertiary
            )
            // Two columns leaves little width, so the name gets two lines and the finish
            // and size sit on separate rows rather than being ellipsised together.
            Text(
                text = panel.name,
                style = PanelScan.type.cardTitle,
                color = colors.textPrimary,
                maxLines = 2,
                minLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = panel.finish,
                style = PanelScan.type.supporting,
                color = colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = formatDimensions(panel),
                style = PanelScan.type.supporting,
                color = colors.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (showPrice) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = Spacing.xxs),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = panel.pricePerUnit?.let { formatCurrency(it) } ?: "Price on request",
                        style = PanelScan.type.cardTitle,
                        color = colors.textPrimary
                    )
                    Box(
                        modifier = Modifier
                            .background(
                                if (panel.inStock) colors.successSoft else colors.warningSoft,
                                PanelScan.shapes.chip
                            )
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = if (panel.inStock) "In stock" else "3–5 days",
                            style = PanelScan.type.label,
                            color = if (panel.inStock) colors.success else colors.warning
                        )
                    }
                }
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.xxs),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xxs)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Lock,
                        contentDescription = null,
                        tint = colors.accent,
                        modifier = Modifier.size(13.dp)
                    )
                    Text(
                        text = "Log in to view pricing",
                        style = PanelScan.type.label,
                        color = colors.accent,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

/** Horizontal variant used in the panel picker and project summaries. */
@Composable
fun ProductRowCard(
    panel: PVCPanel,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    showPrice: Boolean = false,
    trailing: @Composable (() -> Unit)? = null
) {
    val colors = PanelScan.colors
    PanelCard(
        modifier = modifier.fillMaxWidth(),
        onClick = onClick,
        borderColor = if (selected) colors.accent else colors.border,
        color = if (selected) colors.accentSoft else colors.surface,
        elevation = if (selected) 2.dp else 1.dp,
        contentPadding = PaddingValues(Spacing.sm)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            PanelImage(panel = panel, modifier = Modifier.size(64.dp), shape = PanelScan.shapes.controlCompact)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = panel.name,
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${panel.finish} · ${formatDimensions(panel)}",
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${panel.material ?: "PVC"} · ${formatAreaWithUnit(panel.coverageSquareMeters)} · " +
                        if (panel.inStock) "In stock" else "3–5 days",
                    style = PanelScan.type.label,
                    color = colors.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (showPrice) {
                    Text(
                        text = panel.pricePerUnit?.let { "${formatCurrency(it)} per panel" } ?: "Price on request",
                        style = PanelScan.type.supporting,
                        color = if (selected) colors.accent else colors.textPrimary
                    )
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xxs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Lock,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "Log in to view pricing",
                            style = PanelScan.type.label,
                            color = colors.accent
                        )
                    }
                }
            }
            trailing?.invoke()
        }
    }
}
