package com.example.panelscan.core.design

import android.provider.Settings
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * True when the user has turned system animations off. Every animation in the app routes
 * through [PanelScanMotion], so that switch is honoured rather than ignored.
 */
val LocalReducedMotion: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

@Composable
internal fun rememberSystemReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        val scale = Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f
        )
        scale == 0f
    }
}

/**
 * The app's motion vocabulary. Durations and springs live here and nowhere else, so the
 * whole product accelerates and settles the same way.
 *
 * Under reduced motion, durations collapse to zero and springs become instant — travel is
 * removed rather than merely shortened.
 */
object PanelScanMotion {

    /** Press feedback, state flips, anything the finger is already touching. */
    const val Fast = 130

    /** The default: content entering, indicators gliding, sheets. */
    const val Standard = 220

    /** Deliberate reveals — a hero settling, a result resolving. */
    const val Slow = 360

    // Kept for the entrance transitions written against the previous names.
    const val Normal = Standard
    const val Enter = 280

    /** Settles with a trace of overshoot. For selection and reveals. */
    val SpringSoftSpec = spring<Float>(
        dampingRatio = 0.82f,
        stiffness = 380f
    )

    /** Tight and quick, no visible overshoot. For press states. */
    val SpringPressSpec = spring<Float>(
        dampingRatio = 0.9f,
        stiffness = 900f
    )

    /** Carries the nav indicator between destinations. */
    val SpringNavSpec = spring<Float>(
        dampingRatio = 0.78f,
        stiffness = 520f
    )

    @Composable
    fun <T> spec(durationMillis: Int = Standard): FiniteAnimationSpec<T> = tween(
        durationMillis = if (LocalReducedMotion.current) 0 else durationMillis,
        easing = LinearOutSlowInEasing
    )

    @Composable
    fun <T> fast(): FiniteAnimationSpec<T> = spec(Fast)

    @Composable
    fun <T> standard(): FiniteAnimationSpec<T> = spec(Standard)

    @Composable
    fun <T> slow(): FiniteAnimationSpec<T> = spec(Slow)

    /** Soft spring, or an instant cut when the user has asked for less motion. */
    @Composable
    fun springSoft(): FiniteAnimationSpec<Float> =
        if (LocalReducedMotion.current) tween(0) else SpringSoftSpec

    @Composable
    fun springPress(): FiniteAnimationSpec<Float> =
        if (LocalReducedMotion.current) tween(0) else SpringPressSpec

    @Composable
    fun springNav(): FiniteAnimationSpec<Float> =
        if (LocalReducedMotion.current) tween(0) else SpringNavSpec

    /** Dp-valued spring for indicators and lifts. */
    @Composable
    fun springNavDp(): FiniteAnimationSpec<Dp> =
        if (LocalReducedMotion.current) tween(0) else spring(dampingRatio = 0.78f, stiffness = 520f)

    @Composable
    fun springSoftDp(): FiniteAnimationSpec<Dp> =
        if (LocalReducedMotion.current) tween(0) else spring(dampingRatio = 0.82f, stiffness = 380f)

    @Composable
    fun duration(durationMillis: Int = Standard): Int =
        if (LocalReducedMotion.current) 0 else durationMillis

    /**
     * Multiplier for positional travel. Reduced motion keeps the fade but removes the
     * movement, rather than animating a shorter slide.
     */
    val travel: Float
        @Composable @ReadOnlyComposable get() = if (LocalReducedMotion.current) 0f else 1f

    /** Convenience for slide offsets expressed in dp. */
    @Composable
    fun travelDp(distance: Dp): Dp = if (LocalReducedMotion.current) 0.dp else distance
}
