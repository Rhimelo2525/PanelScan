package com.example.panelscan.core.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion

/**
 * A press that scales the whole surface down a hair. This is the app's single "tap" feedback —
 * it replaces Material's ripple on the large card surfaces where a ripple looks cheap.
 */
fun Modifier.pressScale(
    enabled: Boolean = true,
    pressedScale: Float = 0.985f,
    onClick: (() -> Unit)? = null
): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) pressedScale else 1f,
        animationSpec = PanelScanMotion.springPress(),
        label = "pressScale"
    )
    this
        .scale(scale)
        .then(
            if (onClick != null) {
                Modifier.clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    enabled = enabled,
                    onClick = onClick
                )
            } else Modifier
        )
}

/**
 * The app's one card treatment: a soft shadow, a solid surface and a hairline border.
 * Depth comes from these three together — never from blur.
 */
@Composable
fun Modifier.panelSurface(
    shape: Shape = PanelScan.shapes.card,
    color: Color = PanelScan.colors.surface,
    borderColor: Color = PanelScan.colors.border,
    elevation: Dp = 1.dp
): Modifier {
    val ambient = PanelScan.colors.scrim
    return this
        .shadow(
            elevation = elevation,
            shape = shape,
            clip = false,
            ambientColor = ambient,
            spotColor = ambient
        )
        .clip(shape)
        .background(color, shape)
        .border(1.dp, borderColor, shape)
}
