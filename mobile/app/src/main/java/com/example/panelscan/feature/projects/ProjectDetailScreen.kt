package com.example.panelscan.feature.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.ViewInAr
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelImage
import com.example.panelscan.core.ui.MetricCard
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PanelTexture
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ProductRowCard
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatArea
import com.example.panelscan.core.ui.formatAreaWithUnit
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatDate
import com.example.panelscan.core.ui.formatMeters
import com.example.panelscan.core.ui.label

@Composable
fun ProjectDetailScreen(
    project: SavedProject,
    onBack: () -> Unit,
    onOpen3DPreview: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    showPrice: Boolean = false,
    bottomPadding: Dp = 0.dp
) {
    val colors = PanelScan.colors
    var confirmDelete by remember { mutableStateOf(false) }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = project.name,
                subtitle = "Saved ${formatDate(project.createdAt)}",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Box(modifier = Modifier.fillMaxWidth()) {
                    PanelImage(
                        panel = project.selectedPanel,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 9f),
                        shape = PanelScan.shapes.hero
                    )
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(Spacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        StatusBadge(
                            text = project.measurement.surfaceType.label(),
                            tone = BadgeTone.Accent
                        )
                        StatusBadge(text = "${project.estimation.finalQuantity} panels")
                    }
                }

                SectionCard(title = "Measurement") {
                    // Two across then a full-width total: three 28sp figures side by side
                    // leaves no room for the unit on a phone.
                    Column(
                        modifier = Modifier.padding(top = Spacing.xs),
                        verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            MetricCard(
                                label = "Width",
                                value = formatMeters(project.measurement.widthMeters),
                                unit = "m",
                                animateIn = false,
                                modifier = Modifier.weight(1f)
                            )
                            MetricCard(
                                label = "Height",
                                value = formatMeters(project.measurement.heightMeters),
                                unit = "m",
                                animateIn = false,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        MetricCard(
                            label = "Area",
                            value = formatArea(project.measurement.areaSquareMeters),
                            unit = "m²",
                            emphasised = true,
                            animateIn = false,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                SectionCard(title = "Selected panel") {
                    ProductRowCard(
                        panel = project.selectedPanel,
                        showPrice = showPrice,
                        modifier = Modifier.padding(top = Spacing.xs)
                    )
                }

                SectionCard(title = "Estimate") {
                    Column(modifier = Modifier.padding(top = Spacing.xs)) {
                        SpecRow(
                            label = "Surface area",
                            value = formatAreaWithUnit(project.estimation.surfaceArea)
                        )
                        SpecRow(
                            label = "Coverage per panel",
                            value = formatAreaWithUnit(project.estimation.panelArea)
                        )
                        SpecRow(label = "Panels before waste", value = "${project.estimation.baseQuantity}")
                        SpecRow(label = "Waste allowance", value = "${project.estimation.wastePercent}%")
                        HorizontalDivider(
                            modifier = Modifier.padding(vertical = Spacing.xs),
                            color = colors.border
                        )
                        SpecRow(
                            label = "Order quantity",
                            value = "${project.estimation.finalQuantity} panels",
                            emphasised = true
                        )
                        SpecRow(
                            label = "Estimated cost",
                            value = if (showPrice) {
                                project.estimation.estimatedCost?.let { formatCurrency(it) } ?: "—"
                            } else {
                                "Log in to view pricing"
                            },
                            emphasised = true,
                            valueColor = colors.accent
                        )
                    }
                }

                SecondaryButton(
                    text = "Delete project",
                    icon = Icons.Rounded.Delete,
                    destructive = true,
                    onClick = { confirmDelete = true }
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                    .navigationBarsPadding()
                    .padding(bottom = bottomPadding)
            ) {
                PrimaryButton(
                    text = "Open 3D Preview",
                    icon = Icons.Rounded.ViewInAr,
                    onClick = onOpen3DPreview
                )
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = colors.surface,
            shape = PanelScan.shapes.card,
            title = { Text("Delete this project?", style = PanelScan.type.sectionTitle) },
            text = {
                Text(
                    "The measurement and estimate will be removed from this device. " +
                        "This cannot be undone.",
                    style = PanelScan.type.body,
                    color = colors.textSecondary
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) {
                    Text("Delete", style = PanelScan.type.button, color = colors.destructive)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text("Cancel", style = PanelScan.type.button, color = colors.textSecondary)
                }
            }
        )
    }
}

@Composable
private fun SectionCard(
    title: String,
    content: @Composable () -> Unit
) {
    PanelCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(Spacing.md)
    ) {
        Text(
            text = title,
            style = PanelScan.type.sectionTitle,
            color = PanelScan.colors.textPrimary
        )
        content()
    }
}
