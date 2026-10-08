package com.example.panelscan.core.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion

private val ButtonHeight = 54.dp
private val CompactButtonHeight = 44.dp

/**
 * The single high-emphasis action on a screen. Ink-filled rather than accent-filled — the
 * copper accent is reserved for selection and highlights, which keeps the app calm.
 */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    fillMaxWidth: Boolean = true
) {
    val colors = PanelScan.colors
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.98f else 1f,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "primaryPress"
    )

    Button(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interactionSource,
        shape = PanelScan.shapes.control,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.surfaceInverse,
            contentColor = colors.textInverse,
            disabledContainerColor = colors.surfaceMuted,
            disabledContentColor = colors.textTertiary
        ),
        elevation = ButtonDefaults.buttonElevation(0.dp, 0.dp, 0.dp, 0.dp, 0.dp),
        modifier = modifier
            .scale(scale)
            .then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)
            .defaultMinSize(minHeight = ButtonHeight)
    ) {
        ButtonContent(text = text, icon = icon)
    }
}

/** Secondary emphasis: outlined, on the page background. */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    fillMaxWidth: Boolean = true,
    destructive: Boolean = false
) {
    val colors = PanelScan.colors
    val contentColor = if (destructive) colors.destructive else colors.textPrimary
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = PanelScan.shapes.control,
        border = BorderStroke(1.dp, if (destructive) colors.destructive.copy(alpha = 0.4f) else colors.borderStrong),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.Transparent,
            contentColor = contentColor,
            disabledContentColor = colors.textTertiary
        ),
        modifier = modifier
            .then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)
            .defaultMinSize(minHeight = ButtonHeight)
    ) {
        ButtonContent(text = text, icon = icon)
    }
}

/** Low emphasis inline action, e.g. "See all". */
@Composable
fun TertiaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null
) {
    TextButton(
        onClick = onClick,
        shape = PanelScan.shapes.chip,
        modifier = modifier.defaultMinSize(minHeight = CompactButtonHeight)
    ) {
        ButtonContent(text = text, icon = icon, color = PanelScan.colors.accent)
    }
}

/** Colour is left Unspecified so icon and label inherit the button's own content colour. */
@Composable
private fun ButtonContent(
    text: String,
    icon: ImageVector?,
    color: Color = Color.Unspecified
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = if (color == Color.Unspecified) LocalContentColor.current else color
            )
        }
        Text(text = text, style = PanelScan.type.button, color = color)
    }
}

/**
 * Round translucent control used on top of camera and 3D content, where a filled card
 * would obscure the scene.
 */
@Composable
fun OverlayIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    size: androidx.compose.ui.unit.Dp = 48.dp,
    containerColor: Color = Color.Black.copy(alpha = 0.55f),
    contentColor: Color = Color.White
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(PanelScan.shapes.chip)
            .background(if (enabled) containerColor else containerColor.copy(alpha = 0.3f))
            .pressScale(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (enabled) contentColor else contentColor.copy(alpha = 0.4f),
            modifier = Modifier.size(size * 0.42f)
        )
    }
}

/** Wide translucent confirm control for the AR and 3D overlays. */
@Composable
fun OverlayPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 52.dp)
            .clip(PanelScan.shapes.control)
            .background(if (enabled) Color.White else Color.White.copy(alpha = 0.35f))
            .pressScale(enabled = enabled, onClick = onClick)
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (icon != null) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = if (enabled) Color(0xFF16181B) else Color(0xFF16181B).copy(alpha = 0.5f)
                )
            }
            Text(
                text = text,
                style = PanelScan.type.button,
                color = if (enabled) Color(0xFF16181B) else Color(0xFF16181B).copy(alpha = 0.5f)
            )
        }
    }
}
