package com.example.panelscan.core.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion

/**
 * Page container: paints the page background and gives content the app's single entrance
 * transition (a short fade with a few dp of upward travel).
 */
@Composable
fun ScreenScaffold(
    modifier: Modifier = Modifier,
    animateContentIn: Boolean = true,
    content: @Composable BoxScope.() -> Unit
) {
    var entered by remember { mutableStateOf(!animateContentIn) }
    LaunchedEffect(Unit) { entered = true }

    val progress by animateFloatAsState(
        targetValue = if (entered) 1f else 0f,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Enter),
        label = "screenEnter"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(PanelScan.colors.pageBackground)
    ) {
        // Only wear the graphics layer while the entrance is actually running. Leaving
        // `alpha` on permanently keeps a full-screen RenderNode alive under every scrolling
        // list for the sake of an animation that finished 300ms after the screen opened.
        val animating = progress < 1f
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(
                    if (animating) {
                        Modifier
                            .alpha(progress)
                            .offset(y = ((1f - progress) * 10f).dp)
                    } else Modifier
                ),
            content = content
        )
    }
}

/** Vertical stack helper that keeps the app's default column arrangement in one place. */
@Composable
fun PageColumn(
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit
) {
    Column(modifier = modifier.fillMaxSize(), content = content)
}
