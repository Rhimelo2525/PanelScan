package com.example.panelscan.feature.splash

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import com.example.panelscan.R
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing
import kotlinx.coroutines.delay

/**
 * Startup screen. Draws the official company logo and wordmark.
 * The first heavyweight subsystem is only touched when the user opens Measure.
 */
@Composable
fun SplashScreen(
    onFinished: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    var visible by remember { mutableStateOf(false) }

    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Enter),
        label = "splashFade"
    )
    val scale by animateFloatAsState(
        targetValue = if (visible) 1f else 0.94f,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Enter),
        label = "splashScale"
    )

    LaunchedEffect(Unit) {
        visible = true
        delay(750)
        onFinished()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.pageBackground),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .alpha(alpha)
                .scale(scale)
                .padding(horizontal = Spacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            Image(
                painter = painterResource(id = R.drawable.panelscan_logo),
                contentDescription = "PanelScan Company Logo",
                modifier = Modifier
                    .size(112.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .border(1.5.dp, colors.border, RoundedCornerShape(24.dp))
            )
            Text(
                text = "PanelScan",
                style = PanelScan.type.display,
                color = colors.textPrimary
            )
            Text(
                text = "Measure. Estimate. Visualise.",
                style = PanelScan.type.body,
                color = colors.textSecondary,
                textAlign = TextAlign.Center
            )
        }
    }
}
