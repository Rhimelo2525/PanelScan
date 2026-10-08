package com.example.panelscan.core.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing

/** Pill filter used above the catalogue grid. Replaces Material's FilterChip. */
@Composable
fun PanelScanChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val background by animateColorAsState(
        targetValue = if (selected) colors.surfaceInverse else colors.surface,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "chipBackground"
    )
    val foreground by animateColorAsState(
        targetValue = if (selected) colors.textInverse else colors.textSecondary,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "chipForeground"
    )

    Box(
        modifier = modifier
            .clip(PanelScan.shapes.chip)
            .background(background)
            .border(
                width = 1.dp,
                color = if (selected) Color.Transparent else colors.border,
                shape = PanelScan.shapes.chip
            )
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = Spacing.md, vertical = 9.dp)
    ) {
        Text(text = text, style = PanelScan.type.button, color = foreground)
    }
}

/**
 * Two-or-more-way segmented control (Wall / Ceiling). A single muted track with a solid
 * moving selection — the same shape language as the chips, at full width.
 */
@Composable
fun <T> SegmentedControl(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(PanelScan.shapes.control)
            .background(colors.surfaceMuted)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            val background by animateColorAsState(
                targetValue = if (isSelected) colors.surface else Color.Transparent,
                animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
                label = "segmentBackground"
            )
            val foreground by animateColorAsState(
                targetValue = if (isSelected) colors.textPrimary else colors.textSecondary,
                animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
                label = "segmentForeground"
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(PanelScan.shapes.controlCompact)
                    .background(background)
                    .selectable(
                        selected = isSelected,
                        role = Role.RadioButton,
                        onClick = { onSelect(option) }
                    )
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label(option),
                    style = PanelScan.type.button,
                    color = foreground,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}
