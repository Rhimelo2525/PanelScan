package com.example.panelscan.core.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing

/**
 * Page header. Deliberately not a Material TopAppBar: no elevation shim, no centre-aligned
 * title, no scroll colour change — the website's headers are quiet, and so are these.
 */
@Composable
fun PanelScanTopBar(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    large: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {}
) {
    val colors = PanelScan.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(
                start = Spacing.gutter,
                end = Spacing.gutter,
                top = if (large) Spacing.md else Spacing.xs,
                bottom = Spacing.xs
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        if (onBack != null) {
            IconAffordance(
                onClick = onBack,
                content = {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Back",
                        tint = colors.textPrimary,
                        modifier = Modifier.padding(2.dp)
                    )
                }
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = if (large) PanelScan.type.display else PanelScan.type.title,
                color = colors.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        actions()
    }
}

/** Small square tap target with the app's border treatment, used for header actions. */
@Composable
fun IconAffordance(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Row(
        modifier = modifier
            .clip(PanelScan.shapes.controlCompact)
            .panelSurface(shape = PanelScan.shapes.controlCompact, elevation = 0.dp)
            .pressScale(onClick = onClick)
            .padding(Spacing.xs),
        verticalAlignment = Alignment.CenterVertically
    ) {
        content()
    }
}
