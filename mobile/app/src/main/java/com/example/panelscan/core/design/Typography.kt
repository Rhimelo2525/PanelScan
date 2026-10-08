package com.example.panelscan.core.design

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Named type roles, so screens ask for meaning ("sectionTitle") rather than a Material slot.
 * Tight tracking on the large sizes is what gives the type its editorial, catalogue feel.
 */
@Immutable
data class PanelScanTypography(
    val display: TextStyle,
    val title: TextStyle,
    val sectionTitle: TextStyle,
    val cardTitle: TextStyle,
    val body: TextStyle,
    val supporting: TextStyle,
    val label: TextStyle,
    val metric: TextStyle,
    val metricSmall: TextStyle,
    val button: TextStyle
)

private val Sans = FontFamily.Default

val PanelScanType = PanelScanTypography(
    display = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.8).sp
    ),
    title = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.5).sp
    ),
    sectionTitle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.2).sp
    ),
    cardTitle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
        letterSpacing = (-0.1).sp
    ),
    body = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 23.sp,
        letterSpacing = 0.sp
    ),
    supporting = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp,
        letterSpacing = 0.sp
    ),
    label = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.6.sp
    ),
    metric = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        lineHeight = 32.sp,
        letterSpacing = (-1.0).sp
    ),
    metricSmall = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 19.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.4).sp
    ),
    button = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp
    )
)

val LocalPanelScanTypography = staticCompositionLocalOf { PanelScanType }

/** Material's typography is still supplied so that stock components inherit our type. */
internal val MaterialTypographyBridge = Typography(
    displayLarge = PanelScanType.display,
    headlineMedium = PanelScanType.title,
    titleLarge = PanelScanType.sectionTitle,
    titleMedium = PanelScanType.cardTitle,
    bodyLarge = PanelScanType.body,
    bodyMedium = PanelScanType.body,
    bodySmall = PanelScanType.supporting,
    labelLarge = PanelScanType.button,
    labelMedium = PanelScanType.label,
    labelSmall = PanelScanType.label
)
