package com.example.panelscan.feature.measurement

import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.ViewInAr
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.logic.EstimationLogic
import com.example.panelscan.core.model.MeasurementResult
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelImage
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanChip
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PanelTexture
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatAreaWithUnit
import com.example.panelscan.core.ui.formatMeters
import com.example.panelscan.core.ui.label
import java.util.UUID

/**
 * Estimation Result.
 *
 * The step between measuring and the 3D preview: surface, measured dimensions, the chosen
 * panel's real catalogue specifications, and the quantity worked out from them. Every
 * figure comes from [EstimationLogic] with actual product data — nothing is hard-coded.
 */
@Composable
fun MeasurementResultScreen(
    measurement: MeasurementResult,
    source: MeasurementSource,
    onBack: () -> Unit,
    onDimensionsChanged: (Double, Double) -> Unit,
    onViewPreview: (SavedProject) -> Unit,
    onBrowsePanels: () -> Unit,
    modifier: Modifier = Modifier,
    preselectedPanelId: String? = null,
    wastePercent: Int = EstimationLogic.DEFAULT_WASTE_PERCENT,
    onWasteChange: (Int) -> Unit = {},
    onPanelChosen: (String) -> Unit = {},
    showPrice: Boolean = false,
    bottomPadding: Dp = 0.dp
) {
    val colors = PanelScan.colors

    var widthText by remember { mutableStateOf(formatMeters(measurement.widthMeters)) }
    var heightText by remember { mutableStateOf(formatMeters(measurement.heightMeters)) }
    var showPanelPicker by remember { mutableStateOf(false) }
    // One project per estimation visit: returning from the preview and opening it again
    // updates the same saved project instead of piling up duplicates.
    val projectId = rememberSaveable { UUID.randomUUID().toString() }

    val width = widthText.toDoubleOrNull() ?: 0.0
    val height = heightText.toDoubleOrNull() ?: 0.0
    val area = width * height
    val isValid = width > 0.0 && height > 0.0

    // A panel picked from the catalogue for the other surface type is not offered here:
    // a wall measurement is estimated with wall panels.
    val catalogue by ProductCatalog.panels.collectAsState()
    val compatible = remember(measurement.surfaceType, catalogue) { ProductCatalog.panelsFor(catalogue, measurement.surfaceType) }
    val panel = remember(compatible, preselectedPanelId) {
        preselectedPanelId?.let { id -> compatible.firstOrNull { it.id == id } } ?: compatible.firstOrNull()
    }
    // The catalogue comes from the backend; until it has a panel for this surface there is nothing to estimate with.
    if (panel == null) {
        NoPanelsAvailable(surfaceType = measurement.surfaceType, onBack = onBack, modifier = modifier)
        return
    }

    val estimation = remember(width, height, panel, wastePercent) {
        if (isValid) EstimationLogic.calculateEstimation(width, height, panel, wastePercent) else null
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize().imePadding()) {
            PanelScanTopBar(
                title = "Estimation Result",
                subtitle = "Measured surface and the panels it needs",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    StatusBadge(text = measurement.surfaceType.label(), tone = BadgeTone.Accent)
                    StatusBadge(text = source.label, showDot = true)
                }

                // ---- Surface
                PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
                    SectionTitle("Surface")
                    SpecRow(label = "Surface", value = measurement.surfaceType.label())
                    SpecRow(label = "Width", value = "${formatMeters(width)} m")
                    SpecRow(
                        label = if (measurement.surfaceType == SurfaceType.CEILING) "Length" else "Height",
                        value = "${formatMeters(height)} m"
                    )
                    SpecRow(label = "Area", value = formatAreaWithUnit(area), emphasised = true)
                }

                // ---- Selected panel (catalogue data)
                PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PanelImage(
                            panel = panel,
                            modifier = Modifier.size(44.dp),
                            shape = PanelScan.shapes.controlCompact
                        )
                        Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
                            Text(text = "Selected panel", style = PanelScan.type.label, color = colors.textSecondary)
                            Text(text = panel.name, style = PanelScan.type.cardTitle, color = colors.textPrimary)
                        }
                        TextButton(onClick = { showPanelPicker = true }) {
                            Icon(Icons.Rounded.SwapHoriz, contentDescription = null, tint = colors.accent, modifier = Modifier.size(16.dp))
                            Text(" Change", style = PanelScan.type.label, color = colors.accent)
                        }
                    }
                    HorizontalDivider(color = colors.border, modifier = Modifier.padding(vertical = Spacing.xs))
                    SpecRow(label = "Panel size", value = panelSizeLabel(panel))
                    SpecRow(label = "Panel thickness", value = "${panel.thicknessMm} mm")
                    SpecRow(label = "Coverage per panel", value = formatAreaWithUnit(panel.coverageSquareMeters))
                    SpecRow(
                        label = "Finish",
                        value = listOfNotNull(panel.finish, panel.material).joinToString(" · ")
                    )
                }

                // ---- Waste allowance
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    SectionTitle("Waste allowance")
                    Text(
                        text = "Extra panels for cuts and fitting. 10% is typical; use more for rooms with many openings.",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        EstimationLogic.WASTE_OPTIONS.forEach { option ->
                            PanelScanChip(
                                text = if (option == 0) "None" else "$option%",
                                selected = option == wastePercent,
                                onClick = { onWasteChange(option) }
                            )
                        }
                    }
                }

                // ---- Estimate
                if (estimation != null) {
                    PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
                        SectionTitle("Estimate")
                        SpecRow(label = "Panels to cover the area", value = "${estimation.baseQuantity} panels")
                        SpecRow(
                            label = "Waste allowance",
                            value = if (estimation.wastePercent == 0) "None" else "${estimation.wastePercent}%"
                        )
                        HorizontalDivider(color = colors.border, modifier = Modifier.padding(vertical = Spacing.xxs))
                        SpecRow(
                            label = "Estimated quantity",
                            value = "${estimation.finalQuantity} panels",
                            emphasised = true
                        )
                        SpecRow(
                            label = "Total material",
                            value = "${formatAreaWithUnit(estimation.totalMaterialArea)} of panel"
                        )
                        SpecRow(
                            label = "Estimated material cost",
                            value = com.example.panelscan.core.ui.PriceVisibility.formatPriceOrHidden(
                                amount = estimation.estimatedCost,
                                isPriceVisible = showPrice
                            )
                        )
                    }
                }

                // ---- Correct the dimensions by hand if needed
                PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
                    SectionTitle("Adjust dimensions")
                    Text(
                        text = "Fine-tune if you already know the exact size.",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary,
                        modifier = Modifier.padding(top = 2.dp, bottom = Spacing.sm)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        DimensionField(
                            label = "Width (m)",
                            value = widthText,
                            onValueChange = {
                                widthText = it.sanitisedDecimal()
                                onDimensionsChanged(widthText.toDoubleOrNull() ?: 0.0, heightText.toDoubleOrNull() ?: 0.0)
                            },
                            modifier = Modifier.weight(1f)
                        )
                        DimensionField(
                            label = if (measurement.surfaceType == SurfaceType.CEILING) "Length (m)" else "Height (m)",
                            value = heightText,
                            onValueChange = {
                                heightText = it.sanitisedDecimal()
                                onDimensionsChanged(widthText.toDoubleOrNull() ?: 0.0, heightText.toDoubleOrNull() ?: 0.0)
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                DisclaimerCard()
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                    .navigationBarsPadding()
                    .padding(bottom = bottomPadding),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                if (!isValid) {
                    Text(
                        text = "Enter a width and height to see the estimate.",
                        style = PanelScan.type.supporting,
                        color = colors.warning
                    )
                }
                PrimaryButton(
                    text = "View 3D Preview",
                    icon = Icons.Rounded.ViewInAr,
                    enabled = estimation != null,
                    onClick = {
                        val result = estimation ?: return@PrimaryButton
                        onDimensionsChanged(width, height)
                        val measured = measurement.copy(
                            widthMeters = width,
                            heightMeters = height,
                            areaSquareMeters = area
                        )
                        onViewPreview(
                            SavedProject(
                                id = projectId,
                                name = "${measured.surfaceType.label()} · ${formatMeters(width)} × ${formatMeters(height)} m",
                                measurement = measured,
                                selectedPanel = panel,
                                estimation = result,
                                createdAt = System.currentTimeMillis()
                            )
                        )
                    }
                )
                SecondaryButton(
                    text = "Compare all panels",
                    onClick = {
                        onDimensionsChanged(width, height)
                        onBrowsePanels()
                    }
                )
            }
        }
    }

    if (showPanelPicker) {
        PanelPickerDialog(
            panels = compatible,
            selectedId = panel.id,
            onSelect = {
                onPanelChosen(it.id)
                showPanelPicker = false
            },
            onDismiss = { showPanelPicker = false }
        )
    }
}

/** "1200 × 600 × 10 mm": width × length × thickness from the catalogue. */
internal fun panelSizeLabel(panel: PVCPanel): String =
    "${(panel.widthMeters * 1000).toInt()} × ${(panel.heightMeters * 1000).toInt()} × ${panel.thicknessMm} mm"

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = PanelScan.type.sectionTitle,
        color = PanelScan.colors.textPrimary,
        modifier = Modifier.padding(bottom = Spacing.xxs)
    )
}

@Composable
private fun PanelPickerDialog(
    panels: List<PVCPanel>,
    selectedId: String,
    onSelect: (PVCPanel) -> Unit,
    onDismiss: () -> Unit
) {
    val colors = PanelScan.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose a panel", style = PanelScan.type.sectionTitle, color = colors.textPrimary) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                items(panels, key = { it.id }) { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .clickable { onSelect(option) }
                            .padding(vertical = Spacing.xs, horizontal = Spacing.xxs),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PanelImage(
                            panel = option,
                            modifier = Modifier.size(36.dp),
                            shape = PanelScan.shapes.controlCompact
                        )
                        Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
                            Text(option.name, style = PanelScan.type.cardTitle, color = colors.textPrimary)
                            Text(panelSizeLabel(option), style = PanelScan.type.supporting, color = colors.textSecondary)
                        }
                        if (option.id == selectedId) {
                            Icon(Icons.Rounded.Check, contentDescription = "Selected", tint = colors.accent)
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        containerColor = colors.surfaceElevated
    )
}

@Composable
private fun DimensionField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    Column(modifier = modifier) {
        Text(
            text = label,
            style = PanelScan.type.label,
            color = colors.textSecondary,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(PanelScan.shapes.control)
                .background(colors.surfaceElevated)
                .border(1.dp, colors.border, PanelScan.shapes.control)
                .padding(horizontal = Spacing.md, vertical = Spacing.sm)
        ) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                textStyle = PanelScan.type.body.copy(color = colors.textPrimary),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                cursorBrush = SolidColor(colors.accent)
            )
        }
    }
}

@Composable
private fun DisclaimerCard() {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(PanelScan.shapes.card)
            .background(colors.surfaceMuted)
            .border(1.dp, colors.border, PanelScan.shapes.card)
            .padding(Spacing.sm),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Icon(
            imageVector = Icons.Rounded.Info,
            contentDescription = null,
            tint = colors.accent,
            modifier = Modifier.size(16.dp).padding(top = 1.dp)
        )
        Text(
            text = "AR measurements typically vary by a few centimetres. Verify critical dimensions with a tape measure before ordering.",
            style = PanelScan.type.supporting,
            color = colors.textSecondary
        )
    }
}

private fun String.sanitisedDecimal(): String {
    val filtered = filter { it.isDigit() || it == '.' }
    val firstDot = filtered.indexOf('.')
    if (firstDot == -1) return filtered
    val before = filtered.substring(0, firstDot + 1)
    val after = filtered.substring(firstDot + 1).replace(".", "")
    return before + after
}

@Composable
private fun NoPanelsAvailable(surfaceType: SurfaceType, onBack: () -> Unit, modifier: Modifier = Modifier) {
    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(title = "Estimation Result", onBack = onBack)
            Text(
                text = "No ${surfaceType.label().lowercase()} panels are available right now. Check your internet connection, then open the estimate again.",
                style = PanelScan.type.body,
                color = PanelScan.colors.textSecondary,
                modifier = Modifier.padding(Spacing.gutter)
            )
        }
    }
}
