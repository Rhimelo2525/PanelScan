package com.example.panelscan.core.design

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** Generous radii on the big surfaces, restrained ones on controls. */
object PanelScanShapes {
    val hero = RoundedCornerShape(26.dp)
    val card = RoundedCornerShape(22.dp)
    val cardCompact = RoundedCornerShape(18.dp)
    val control = RoundedCornerShape(16.dp)
    val controlCompact = RoundedCornerShape(14.dp)
    val chip = RoundedCornerShape(percent = 50)
    val sheet = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    val thumbnail = RoundedCornerShape(16.dp)
}

internal val MaterialShapesBridge = Shapes(
    extraSmall = PanelScanShapes.controlCompact,
    small = PanelScanShapes.control,
    medium = PanelScanShapes.cardCompact,
    large = PanelScanShapes.card,
    extraLarge = PanelScanShapes.hero
)
