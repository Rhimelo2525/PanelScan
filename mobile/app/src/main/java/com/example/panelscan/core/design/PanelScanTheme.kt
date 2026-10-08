package com.example.panelscan.core.design

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Entry point for PanelScan styling.
 *
 * Dynamic colour is deliberately not used: the app should look like PanelScan on every
 * device, not like the wallpaper the user happens to have.
 */
@Composable
fun PanelScanTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) PanelScanDarkColors else PanelScanLightColors
    val reducedMotion = rememberSystemReducedMotion()

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            (view.context as? Activity)?.window?.let { window ->
                WindowCompat.getInsetsController(window, view).apply {
                    isAppearanceLightStatusBars = colors.isLight
                    isAppearanceLightNavigationBars = colors.isLight
                }
            }
        }
    }

    // Material stays underneath for the components we still build on (ripples, text fields,
    // sheets) — it is fed our tokens so nothing renders in stock Material colours.
    val materialScheme = if (darkTheme) {
        darkColorScheme(
            primary = colors.accent,
            onPrimary = colors.accentContrast,
            background = colors.pageBackground,
            onBackground = colors.textPrimary,
            surface = colors.surface,
            onSurface = colors.textPrimary,
            surfaceVariant = colors.surfaceMuted,
            onSurfaceVariant = colors.textSecondary,
            outline = colors.border,
            outlineVariant = colors.border,
            error = colors.destructive
        )
    } else {
        lightColorScheme(
            primary = colors.accent,
            onPrimary = colors.accentContrast,
            background = colors.pageBackground,
            onBackground = colors.textPrimary,
            surface = colors.surface,
            onSurface = colors.textPrimary,
            surfaceVariant = colors.surfaceMuted,
            onSurfaceVariant = colors.textSecondary,
            outline = colors.border,
            outlineVariant = colors.border,
            error = colors.destructive
        )
    }

    CompositionLocalProvider(
        LocalPanelScanColors provides colors,
        LocalPanelScanTypography provides PanelScanType,
        LocalReducedMotion provides reducedMotion
    ) {
        MaterialTheme(
            colorScheme = materialScheme,
            typography = MaterialTypographyBridge,
            shapes = MaterialShapesBridge
        ) {
            CompositionLocalProvider(
                LocalTextStyle provides PanelScanType.body.copy(color = colors.textPrimary),
                content = content
            )
        }
    }
}

/** `PanelScan.colors` / `PanelScan.type` — the accessor screens use. */
object PanelScan {
    val colors: PanelScanColorScheme
        @Composable @ReadOnlyComposable get() = LocalPanelScanColors.current

    val type: PanelScanTypography
        @Composable @ReadOnlyComposable get() = LocalPanelScanTypography.current

    val shapes = PanelScanShapes
    val spacing = Spacing
}
