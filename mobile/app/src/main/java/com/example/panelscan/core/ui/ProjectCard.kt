package com.example.panelscan.core.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.SavedProject

/** Full-width saved project card used on the Projects screen. */
@Composable
fun ProjectCard(
    project: SavedProject,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    PanelCard(
        modifier = modifier.fillMaxWidth(),
        onClick = onClick,
        contentPadding = PaddingValues(Spacing.sm)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            PanelImage(panel = project.selectedPanel, modifier = Modifier.size(66.dp), shape = PanelScan.shapes.controlCompact)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = project.name,
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = project.selectedPanel.name,
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    StatusBadge(
                        text = project.measurement.surfaceType.label(),
                        tone = BadgeTone.Accent
                    )
                    StatusBadge(text = "${project.estimation.finalQuantity} panels")
                }
            }
        }

        HorizontalDivider(
            modifier = Modifier.padding(vertical = Spacing.sm),
            color = colors.border
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.xxs, vertical = Spacing.xxs),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            MiniMetric(label = "Size", value = formatDimensions(project.measurement))
            MiniMetric(label = "Area", value = formatAreaWithUnit(project.measurement.areaSquareMeters))
            MiniMetric(label = "Saved", value = formatDate(project.createdAt))
        }
    }
}

/** Narrow card for the horizontally scrolling "recent projects" rail on Home. */
@Composable
fun RecentProjectCard(
    project: SavedProject,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    Column(
        modifier = modifier
            .width(230.dp)
            .panelSurface(shape = PanelScan.shapes.card)
            .pressScale(onClick = onClick)
            .padding(Spacing.xs)
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(96.dp)) {
            PanelImage(panel = project.selectedPanel, modifier = Modifier.fillMaxWidth().height(96.dp))
            StatusBadge(
                text = project.measurement.surfaceType.label(),
                tone = BadgeTone.Accent,
                modifier = Modifier.align(Alignment.TopStart).padding(Spacing.xs)
            )
        }
        Column(
            modifier = Modifier.padding(
                start = Spacing.xs, end = Spacing.xs, top = Spacing.sm, bottom = Spacing.xxs
            ),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = project.name,
                style = PanelScan.type.cardTitle,
                color = colors.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "${formatDimensions(project.measurement)} · ${formatAreaWithUnit(project.measurement.areaSquareMeters)}",
                style = PanelScan.type.supporting,
                color = colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "${project.selectedPanel.name} · ${formatDate(project.createdAt)}",
                style = PanelScan.type.supporting,
                color = colors.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
