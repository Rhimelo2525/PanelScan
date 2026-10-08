package com.example.panelscan.feature.measurement

import androidx.compose.runtime.collectAsState
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.ViewInAr
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.logic.EstimationLogic
import com.example.panelscan.core.model.MeasurementResult
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.ui.AnimatedCount
import com.example.panelscan.core.ui.AnimatedCurrency
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanChip
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ProductRowCard
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatAreaWithUnit
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatDimensions
import com.example.panelscan.core.ui.label
import java.util.UUID

/**
 * Panel picker with a live estimate. Selecting a finish immediately shows how the quantity
 * was arrived at — coverage, base count, waste, final count — so the number is explainable.
 */
@Composable
fun PanelSelectionScreen(
    measurement: MeasurementResult,
    onBack: () -> Unit,
    onProjectSaved: (SavedProject) -> Unit,
    modifier: Modifier = Modifier,
    preselectedPanelId: String? = null,
    wastePercent: Int = EstimationLogic.DEFAULT_WASTE_PERCENT,
    showPrice: Boolean = false,
    bottomPadding: Dp = 0.dp
) {
    val colors = PanelScan.colors
    var selectedCategory by remember {
        mutableStateOf(
            preselectedPanelId?.let(ProductCatalog::findById)?.surfaceType
                ?: measurement.surfaceType
        )
    }
    var selectedPanel by remember {
        mutableStateOf(preselectedPanelId?.let(ProductCatalog::findById))
    }

    // The catalogue may still be loading from the backend when this opens.
    val catalogue by ProductCatalog.panels.collectAsState()
    LaunchedEffect(preselectedPanelId, catalogue) {
        if (selectedPanel == null && preselectedPanelId != null) {
            selectedPanel = ProductCatalog.findById(preselectedPanelId)
        }
    }

    val panels = ProductCatalog.panelsFor(catalogue, selectedCategory)

    val estimation = selectedPanel?.let {
        EstimationLogic.calculateEstimation(
            measurement.widthMeters,
            measurement.heightMeters,
            it,
            wastePercent
        )
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Choose a panel",
                subtitle = "${measurement.surfaceType.label()} · ${formatDimensions(measurement)} · " +
                    formatAreaWithUnit(measurement.areaSquareMeters),
                onBack = onBack
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.xs),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                PanelScanChip(
                    text = "WALL PANELS",
                    selected = selectedCategory == SurfaceType.WALL,
                    onClick = {
                        selectedCategory = SurfaceType.WALL
                        if (selectedPanel?.surfaceType != SurfaceType.WALL) selectedPanel = null
                    }
                )
                PanelScanChip(
                    text = "CEILING PANELS",
                    selected = selectedCategory == SurfaceType.CEILING,
                    onClick = {
                        selectedCategory = SurfaceType.CEILING
                        if (selectedPanel?.surfaceType != SurfaceType.CEILING) selectedPanel = null
                    }
                )
            }

            if (selectedCategory != measurement.surfaceType) {
                Text(
                    text = "This is a ${measurement.surfaceType.label().lowercase()} measurement. " +
                        "Return to ${measurement.surfaceType.label().uppercase()} PANELS to select a compatible product.",
                    style = PanelScan.type.supporting,
                    color = colors.warning,
                    modifier = Modifier.padding(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        bottom = Spacing.xs
                    )
                )
            }

            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(
                    start = Spacing.gutter,
                    end = Spacing.gutter,
                    top = Spacing.xxs,
                    bottom = Spacing.md
                ),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                items(panels, key = { it.id }) { panel ->
                    ProductRowCard(
                        panel = panel,
                        selected = selectedPanel?.id == panel.id,
                        onClick = if (panel.surfaceType == measurement.surfaceType) {
                            { selectedPanel = panel }
                        } else null,
                        showPrice = showPrice,
                        trailing = {
                            SelectionTick(selected = selectedPanel?.id == panel.id)
                        }
                    )
                }
            }

            AnimatedVisibility(
                visible = estimation != null,
                enter = fadeIn(PanelScanMotion.spec(PanelScanMotion.Normal)) +
                    slideInVertically(PanelScanMotion.spec(PanelScanMotion.Normal)) { it / 3 },
                exit = fadeOut(PanelScanMotion.spec(PanelScanMotion.Fast)) +
                    slideOutVertically(PanelScanMotion.spec(PanelScanMotion.Fast)) { it / 3 }
            ) {
                val panel = selectedPanel
                val result = estimation
                if (panel != null && result != null) {
                    EstimationSheet(
                        panel = panel,
                        measurement = measurement,
                        baseQuantity = result.baseQuantity,
                        wastePercent = result.wastePercent,
                        finalQuantity = result.finalQuantity,
                        estimatedCost = if (showPrice) result.estimatedCost else null,
                        bottomPadding = bottomPadding,
                        onSave = {
                            onProjectSaved(
                                SavedProject(
                                    id = UUID.randomUUID().toString(),
                                    name = "${measurement.surfaceType.label()} · ${formatDimensions(measurement)}",
                                    measurement = measurement,
                                    selectedPanel = panel,
                                    estimation = result,
                                    createdAt = System.currentTimeMillis()
                                )
                            )
                        }
                    )
                }
            }

            if (estimation == null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                        .navigationBarsPadding()
                        .padding(bottom = bottomPadding)
                ) {
                    Text(
                        text = "Select a finish to see quantity and cost.",
                        style = PanelScan.type.supporting,
                        color = colors.textTertiary
                    )
                }
            }
        }
    }
}

@Composable
private fun SelectionTick(selected: Boolean) {
    val colors = PanelScan.colors
    Box(
        modifier = Modifier
            .size(26.dp)
            .clip(PanelScan.shapes.chip)
            .then(
                if (selected) Modifier.background(colors.accent)
                else Modifier.border(1.dp, colors.borderStrong, PanelScan.shapes.chip)
            ),
        contentAlignment = Alignment.Center
    ) {
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = "Selected",
                tint = colors.accentContrast,
                modifier = Modifier.size(15.dp)
            )
        }
    }
}

/**
 * The estimate itself. Every line of the calculation is shown, ending in the figure the
 * user actually needs.
 */
@Composable
private fun EstimationSheet(
    panel: PVCPanel,
    measurement: MeasurementResult,
    baseQuantity: Int,
    wastePercent: Int,
    finalQuantity: Int,
    estimatedCost: Double?,
    bottomPadding: Dp,
    onSave: () -> Unit
) {
    val colors = PanelScan.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(PanelScan.shapes.sheet)
            .background(colors.surface)
            .padding(
                start = Spacing.gutter,
                end = Spacing.gutter,
                top = Spacing.md,
                bottom = Spacing.sm
            )
            .navigationBarsPadding()
            .padding(bottom = bottomPadding)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = panel.name,
                    style = PanelScan.type.sectionTitle,
                    color = colors.textPrimary
                )
                Text(
                    text = "${panel.finish} · ${formatAreaWithUnit(panel.coverageSquareMeters)} per panel",
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary
                )
            }
            StatusBadge(
                text = if (panel.inStock) "In stock" else "3–5 days",
                tone = if (panel.inStock) BadgeTone.Success else BadgeTone.Warning
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.md),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            HeadlineFigure(
                label = "Panels needed",
                count = finalQuantity,
                emphasised = true,
                modifier = Modifier.weight(1f)
            )
            HeadlineFigure(
                label = "Estimated cost",
                currency = estimatedCost,
                modifier = Modifier.weight(1f)
            )
        }

        PanelCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Spacing.sm),
            color = colors.surfaceMuted,
            borderColor = Color.Transparent,
            elevation = 0.dp,
            contentPadding = PaddingValues(Spacing.sm)
        ) {
            SpecRow(
                label = "Surface area",
                value = formatAreaWithUnit(measurement.areaSquareMeters)
            )
            SpecRow(
                label = "Coverage per panel",
                value = formatAreaWithUnit(panel.coverageSquareMeters)
            )
            SpecRow(label = "Panels before waste", value = "$baseQuantity")
            SpecRow(label = "Waste allowance", value = "$wastePercent%")
            HorizontalDivider(
                modifier = Modifier.padding(vertical = Spacing.xs),
                color = colors.border
            )
            SpecRow(label = "Order quantity", value = "$finalQuantity panels", emphasised = true)
        }

        PrimaryButton(
            text = "Continue to 3D Preview",
            icon = Icons.Rounded.ViewInAr,
            onClick = onSave,
            modifier = Modifier.padding(top = Spacing.sm)
        )
    }
}

@Composable
private fun HeadlineFigure(
    label: String,
    modifier: Modifier = Modifier,
    count: Int? = null,
    currency: Double? = null,
    emphasised: Boolean = false
) {
    val colors = PanelScan.colors
    val figureColor = if (emphasised) colors.accent else colors.textPrimary
    Column(
        modifier = modifier
            .clip(PanelScan.shapes.cardCompact)
            .background(if (emphasised) colors.accentSoft else colors.surfaceMuted)
            .padding(Spacing.sm)
    ) {
        Text(
            text = label.uppercase(),
            style = PanelScan.type.label,
            color = if (emphasised) colors.accent else colors.textTertiary
        )
        // Swapping finish changes both figures; interpolating makes the estimate feel
        // like it recalculated rather than flickering to a new number.
        when {
            count != null -> AnimatedCount(
                value = count,
                style = PanelScan.type.metric,
                color = figureColor
            )
            currency != null -> AnimatedCurrency(
                value = currency,
                style = PanelScan.type.metric,
                color = figureColor
            )
            else -> Text(
                text = "Log in to view pricing",
                style = PanelScan.type.cardTitle,
                color = colors.accent
            )
        }
    }
}
