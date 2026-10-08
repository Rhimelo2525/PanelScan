package com.example.panelscan.core.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.LocalReducedMotion
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.navigation.Screen

data class BottomNavDestination(
    val screen: Screen,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector,
    val emphasised: Boolean = false
)

val PanelScanBottomNavDestinations = listOf(
    BottomNavDestination(Screen.Home, "Home", Icons.Outlined.Home, Icons.Rounded.Home),
    BottomNavDestination(Screen.Products, "Products", Icons.Outlined.GridView, Icons.Rounded.GridView),
    BottomNavDestination(
        Screen.Measure, "Measure", Icons.Rounded.Straighten, Icons.Rounded.Straighten,
        emphasised = true
    ),
    BottomNavDestination(Screen.Projects, "Projects", Icons.Outlined.Layers, Icons.Rounded.Layers),
    BottomNavDestination(Screen.Account, "Account", Icons.Outlined.AccountCircle, Icons.Rounded.AccountCircle)
)

private val DockHeight = 62.dp
private val MeasureButtonSize = 50.dp
private val MeasureLift = 16.dp
private val IndicatorWidth = 22.dp

/**
 * The PanelScan dock.
 *
 * Not a NavigationBar: it is a contained, raised slab that stops short of the screen edges,
 * with Measure lifted out of the row as the tool the app exists for. The selected state is
 * three coordinated things — the icon switches from outlined to filled, lifts a few dp, and
 * a dimension-line indicator glides along the top edge to sit under it.
 */
@Composable
fun PanelScanBottomNav(
    currentRoute: String?,
    onDestinationSelected: (Screen) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val selectedIndex = PanelScanBottomNavDestinations
        .indexOfFirst { it.screen.route == currentRoute }
        .coerceAtLeast(0)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(bottom = Spacing.xs),
        contentAlignment = Alignment.BottomCenter
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .widthIn(max = 430.dp)
                .fillMaxWidth(0.94f)
                .height(DockHeight + MeasureLift)
        ) {
            val slotWidth = maxWidth / PanelScanBottomNavDestinations.size

            // ---- the slab
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(DockHeight)
                    .shadow(
                        elevation = 12.dp,
                        shape = PanelScan.shapes.hero,
                        clip = false,
                        ambientColor = colors.scrim,
                        spotColor = colors.scrim
                    )
                    .clip(PanelScan.shapes.hero)
                    .background(colors.surfaceElevated)
                    .border(1.dp, colors.border, PanelScan.shapes.hero)
            )

            // ---- the gliding dimension-line indicator, on the slab's top edge
            val indicatorX by animateDpAsState(
                targetValue = slotWidth * selectedIndex + (slotWidth - IndicatorWidth) / 2,
                animationSpec = PanelScanMotion.springNavDp(),
                label = "navIndicator"
            )
            val indicatorAlpha by animateFloatAsState(
                targetValue = if (selectedIndex == 2) 0f else 1f,
                animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
                label = "navIndicatorAlpha"
            )
            DimensionIndicator(
                color = colors.accent,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .offset(x = indicatorX, y = -(DockHeight - 10.dp))
                    .alpha(indicatorAlpha)
            )

            // ---- destinations
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(DockHeight)
                    .padding(top = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                PanelScanBottomNavDestinations.forEachIndexed { index, destination ->
                    if (destination.emphasised) {
                        // Reserved slot; the raised button is positioned over it below.
                        Box(modifier = Modifier.weight(1f))
                    } else {
                        DockItem(
                            destination = destination,
                            selected = index == selectedIndex,
                            onClick = { onDestinationSelected(destination.screen) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            // ---- Measure, lifted clear of the slab
            MeasureAnchor(
                selected = selectedIndex == 2,
                onClick = { onDestinationSelected(Screen.Measure) },
                modifier = Modifier.align(Alignment.TopCenter)
            )
        }
    }
}

/**
 * A short bar with two end serifs — a dimension line. It marks the active destination
 * instead of the usual filled pill, and ties the navigation back to what the app measures.
 */
@Composable
private fun DimensionIndicator(color: Color, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.height(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(1.dp)
    ) {
        Box(
            modifier = Modifier
                .size(width = 1.5.dp, height = 6.dp)
                .background(color, PanelScan.shapes.chip)
        )
        Box(
            modifier = Modifier
                .size(width = IndicatorWidth - 5.dp, height = 2.dp)
                .background(color, PanelScan.shapes.chip)
        )
        Box(
            modifier = Modifier
                .size(width = 1.5.dp, height = 6.dp)
                .background(color, PanelScan.shapes.chip)
        )
    }
}

@Composable
private fun DockItem(
    destination: BottomNavDestination,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val interactionSource = remember { MutableInteractionSource() }
    val travel = PanelScanMotion.travel

    val lift by animateDpAsState(
        targetValue = if (selected) (-3).dp * travel else 0.dp,
        animationSpec = PanelScanMotion.springNavDp(),
        label = "itemLift"
    )
    val iconScale by animateFloatAsState(
        targetValue = if (selected) 1.06f else 1f,
        animationSpec = PanelScanMotion.springNav(),
        label = "itemScale"
    )
    val tint by animateColorAsState(
        targetValue = if (selected) colors.textPrimary else colors.textTertiary,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Fast),
        label = "itemTint"
    )

    Column(
        modifier = modifier
            .clip(PanelScan.shapes.cardCompact)
            .selectable(
                selected = selected,
                interactionSource = interactionSource,
                indication = null,
                role = Role.Tab,
                onClick = onClick
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = if (selected) destination.selectedIcon else destination.icon,
            contentDescription = destination.label,
            tint = tint,
            modifier = Modifier
                .offset(y = lift)
                .size(22.dp)
                .scale(iconScale)
        )
        // The label belongs to the selected item only; the rest stay quiet.
        AnimatedVisibility(
            visible = selected,
            enter = fadeIn(PanelScanMotion.spec(PanelScanMotion.Fast)) +
                slideInVertically(PanelScanMotion.spec(PanelScanMotion.Standard)) { it / 2 },
            exit = fadeOut(PanelScanMotion.spec(PanelScanMotion.Fast)) +
                slideOutVertically(PanelScanMotion.spec(PanelScanMotion.Fast)) { it / 2 }
        ) {
            Text(
                text = destination.label,
                style = PanelScan.type.label,
                color = colors.textPrimary,
                modifier = Modifier.offset(y = lift)
            )
        }
    }
}

/**
 * Measure: a squircle raised clear of the slab. Copper when active, quiet when not, with a
 * single small pulse on selection so the tap registers physically.
 */
@Composable
private fun MeasureAnchor(
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val reducedMotion = LocalReducedMotion.current
    val pulse = remember { Animatable(1f) }

    LaunchedEffect(selected) {
        if (selected && !reducedMotion) {
            pulse.animateTo(1.06f, tween(110))
            pulse.animateTo(1f, PanelScanMotion.SpringSoftSpec)
        } else {
            pulse.snapTo(1f)
        }
    }

    val container by animateColorAsState(
        targetValue = if (selected) colors.accent else colors.surfaceElevated,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "measureContainer"
    )
    val content by animateColorAsState(
        targetValue = if (selected) colors.accentContrast else colors.textPrimary,
        animationSpec = PanelScanMotion.spec(PanelScanMotion.Standard),
        label = "measureContent"
    )

    Box(
        modifier = modifier
            .size(MeasureButtonSize)
            .scale(pulse.value)
            .shadow(
                elevation = if (selected) 10.dp else 6.dp,
                shape = PanelScan.shapes.control,
                clip = false,
                ambientColor = colors.scrim,
                spotColor = colors.scrim
            )
            .clip(PanelScan.shapes.control)
            .background(container)
            .border(
                width = 1.dp,
                color = if (selected) Color.Transparent else colors.border,
                shape = PanelScan.shapes.control
            )
            .pressScale(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Rounded.Straighten,
            contentDescription = "Measure",
            tint = content,
            modifier = Modifier.size(23.dp)
        )
    }
}
