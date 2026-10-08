package com.example.panelscan.core.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing

/**
 * Large read-out for a single measured value. Metrics fade in on first composition so a
 * result screen resolves rather than snapping into place.
 */
@Composable
fun MetricCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    unit: String? = null,
    emphasised: Boolean = false,
    animateIn: Boolean = true,
    /** When set, the figure interpolates to new values rather than jumping. */
    animatedValue: Double? = null,
    decimals: Int = 2
) {
    val colors = PanelScan.colors
    var visible by remember { mutableStateOf(!animateIn) }
    LaunchedEffect(Unit) { visible = true }
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Enter),
        label = "metricFade"
    )

    PanelCard(
        modifier = modifier.alpha(alpha),
        color = if (emphasised) colors.accentSoft else colors.surface,
        borderColor = if (emphasised) Color.Transparent else colors.border,
        contentPadding = PaddingValues(horizontal = Spacing.md, vertical = Spacing.md)
    ) {
        // The unit rides on the label line: at three cards across, an inline unit next to a
        // 28sp figure either wraps or clips, and the number is what has to stay readable.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
        ) {
            Text(
                text = label.uppercase(),
                style = PanelScan.type.label,
                color = if (emphasised) colors.accent else colors.textTertiary,
                maxLines = 1
            )
            if (unit != null) {
                Text(
                    text = unit.uppercase(),
                    style = PanelScan.type.label,
                    color = if (emphasised) colors.accent.copy(alpha = 0.7f) else colors.textTertiary.copy(alpha = 0.8f),
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )
            }
        }
        if (animatedValue != null) {
            AnimatedMeasure(
                value = animatedValue,
                style = PanelScan.type.metric,
                color = if (emphasised) colors.accent else colors.textPrimary,
                decimals = decimals
            )
        } else {
            Text(
                text = value,
                style = PanelScan.type.metric,
                color = if (emphasised) colors.accent else colors.textPrimary,
                maxLines = 1,
                softWrap = false
            )
        }
    }
}

/** Key/value line used inside specification and estimation cards. */
@Composable
fun SpecRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = Color.Unspecified,
    emphasised: Boolean = false
) {
    val colors = PanelScan.colors
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = PanelScan.type.body,
            color = colors.textSecondary,
            modifier = Modifier
                .weight(1f, fill = false)
                .padding(end = Spacing.sm)
        )
        Text(
            text = value,
            style = if (emphasised) PanelScan.type.metricSmall else PanelScan.type.cardTitle,
            color = if (valueColor == Color.Unspecified) colors.textPrimary else valueColor,
            textAlign = androidx.compose.ui.text.style.TextAlign.End,
            modifier = Modifier.weight(1f, fill = false)
        )
    }
}

/** Compact stacked label/value, for card footers where a full SpecRow is too heavy. */
@Composable
fun MiniMetric(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = label.uppercase(),
            style = PanelScan.type.label,
            color = PanelScan.colors.textTertiary
        )
        Text(
            text = value,
            style = PanelScan.type.cardTitle,
            color = PanelScan.colors.textPrimary
        )
    }
}
