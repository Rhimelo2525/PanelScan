package com.example.panelscan.core.design

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Semantic colour tokens for PanelScan.
 *
 * Every surface in the app resolves its colour through this palette rather than through
 * MaterialTheme.colorScheme, so the product keeps a single, deliberate visual identity
 * instead of inheriting a device's dynamic-colour scheme.
 */
@Immutable
data class PanelScanColorScheme(
    val pageBackground: Color,
    val surface: Color,
    val surfaceElevated: Color,
    val surfaceMuted: Color,
    val surfaceInverse: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val textInverse: Color,
    val border: Color,
    val borderStrong: Color,
    val accent: Color,
    val accentSoft: Color,
    val accentContrast: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val destructive: Color,
    val destructiveSoft: Color,
    val scrim: Color,
    val isLight: Boolean
)

/**
 * Warm stone neutrals with a single restrained copper accent — an architectural material
 * catalogue rather than a stock Material palette.
 */
val PanelScanLightColors = PanelScanColorScheme(
    pageBackground = Color(0xFFF7F6F3),
    surface = Color(0xFFFFFFFF),
    surfaceElevated = Color(0xFFFFFFFF),
    surfaceMuted = Color(0xFFEFEDE8),
    surfaceInverse = Color(0xFF16181B),
    textPrimary = Color(0xFF16181B),
    textSecondary = Color(0xFF6B6F76),
    textTertiary = Color(0xFF9A9EA5),
    textInverse = Color(0xFFFAFAF8),
    border = Color(0xFFE4E1DA),
    borderStrong = Color(0xFFCFCBC2),
    accent = Color(0xFF9C5A2E),
    accentSoft = Color(0xFFF4E9E0),
    accentContrast = Color(0xFFFFFFFF),
    success = Color(0xFF2F6B4F),
    successSoft = Color(0xFFE3EFE8),
    warning = Color(0xFF8A6318),
    warningSoft = Color(0xFFF6EEDC),
    destructive = Color(0xFFA33A2E),
    destructiveSoft = Color(0xFFF6E5E2),
    scrim = Color(0x1A16181B),
    isLight = true
)

val PanelScanDarkColors = PanelScanColorScheme(
    pageBackground = Color(0xFF0E0F11),
    surface = Color(0xFF17191C),
    surfaceElevated = Color(0xFF1D2024),
    surfaceMuted = Color(0xFF23262B),
    surfaceInverse = Color(0xFFF4F4F2),
    textPrimary = Color(0xFFF3F2EF),
    textSecondary = Color(0xFF9CA1A8),
    textTertiary = Color(0xFF6E747C),
    textInverse = Color(0xFF16181B),
    border = Color(0xFF2B2F35),
    borderStrong = Color(0xFF3A3F46),
    accent = Color(0xFFCE8A5A),
    accentSoft = Color(0xFF2C2320),
    accentContrast = Color(0xFF1A1207),
    success = Color(0xFF6FBF95),
    successSoft = Color(0xFF1B2A22),
    warning = Color(0xFFD9AE5F),
    warningSoft = Color(0xFF2B2519),
    destructive = Color(0xFFE08174),
    destructiveSoft = Color(0xFF2E1E1B),
    scrim = Color(0x66000000),
    isLight = false
)

val LocalPanelScanColors = staticCompositionLocalOf { PanelScanLightColors }
