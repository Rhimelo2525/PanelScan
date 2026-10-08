package com.example.panelscan.core.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing

/**
 * The base container everything sits in. Replaces Material `Card()` throughout the app so
 * card styling is defined in exactly one place.
 */
@Composable
fun PanelCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    shape: Shape = PanelScan.shapes.card,
    color: Color = PanelScan.colors.surface,
    borderColor: Color = PanelScan.colors.border,
    elevation: Dp = 1.dp,
    contentPadding: PaddingValues = PaddingValues(Spacing.md),
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = modifier
            .panelSurface(shape = shape, color = color, borderColor = borderColor, elevation = elevation)
            .then(if (onClick != null) Modifier.pressScale(onClick = onClick) else Modifier)
            .padding(contentPadding),
        content = content
    )
}

/** Flat, borderless variant for grouped rows inside an already-elevated area. */
@Composable
fun MutedPanel(
    modifier: Modifier = Modifier,
    shape: Shape = PanelScan.shapes.cardCompact,
    contentPadding: PaddingValues = PaddingValues(Spacing.md),
    content: @Composable ColumnScope.() -> Unit
) {
    PanelCard(
        modifier = modifier,
        shape = shape,
        color = PanelScan.colors.surfaceMuted,
        borderColor = Color.Transparent,
        elevation = 0.dp,
        contentPadding = contentPadding,
        content = content
    )
}
