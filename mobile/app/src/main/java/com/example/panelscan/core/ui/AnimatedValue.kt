package com.example.panelscan.core.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import com.example.panelscan.core.design.PanelScanMotion
import java.util.Locale

/**
 * A number that interpolates to its new value instead of snapping.
 *
 * Deliberately a plain interpolation rather than a rolling-digit odometer: measurements
 * settle by a centimetre or two as ARCore refines its anchors, and a smooth catch-up reads
 * as the figure resolving. Reduced motion collapses this to an instant swap.
 */
@Composable
fun AnimatedMeasure(
    value: Double,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    decimals: Int = 2
) {
    val animated by animateFloatAsState(
        targetValue = value.toFloat(),
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "animatedMeasure"
    )
    // Read through the composition so a locale change recomposes the figure.
    val locale: Locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    Text(
        text = String.format(locale, "%.${decimals}f", animated),
        style = style,
        color = color,
        maxLines = 1,
        modifier = modifier
    )
}

/**
 * Integer counterpart, for panel counts. Rounds the interpolated value so it steps through
 * whole numbers on its way up.
 */
@Composable
fun AnimatedCount(
    value: Int,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    suffix: String = ""
) {
    val animated by animateFloatAsState(
        targetValue = value.toFloat(),
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "animatedCount"
    )
    Text(
        text = "${Math.round(animated)}$suffix",
        style = style,
        color = color,
        maxLines = 1,
        modifier = modifier
    )
}

/** Currency counterpart for the live estimate. */
@Composable
fun AnimatedCurrency(
    value: Double,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier
) {
    val animated by animateFloatAsState(
        targetValue = value.toFloat(),
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "animatedCurrency"
    )
    Text(
        text = formatCurrency(animated.toDouble()),
        style = style,
        color = color,
        maxLines = 1,
        modifier = modifier
    )
}
