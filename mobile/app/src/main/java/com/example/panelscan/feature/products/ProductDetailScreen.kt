package com.example.panelscan.feature.products

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.MetricCard
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PanelImage
import com.example.panelscan.core.ui.PanelTexture
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatArea
import com.example.panelscan.core.ui.formatAreaWithUnit
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatMeters

import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.example.panelscan.core.ui.IconAffordance
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.formatDate
import com.example.panelscan.core.model.CustomerReview

@Composable
fun ProductDetailScreen(
    panel: PVCPanel,
    onBack: () -> Unit,
    onUseInMeasurement: (PVCPanel) -> Unit,
    modifier: Modifier = Modifier,
    showPrice: Boolean = false,
    onNavigateToSignIn: () -> Unit = {},
    onAddToCart: (PVCPanel, Int) -> Unit = { _, _ -> },
    onProceedToCheckout: (PVCPanel, Int) -> Unit = { _, _ -> },
    reviews: List<CustomerReview> = emptyList(),
    onOpenCart: () -> Unit = {},
    bottomPadding: Dp = 0.dp
) {
    val colors = PanelScan.colors
    var quantity by remember { mutableIntStateOf(1) }
    var addedToCartState by remember { mutableStateOf(false) }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = panel.name,
                onBack = onBack,
                actions = {
                    IconAffordance(onClick = onOpenCart) {
                        Icon(
                            imageVector = Icons.Rounded.ShoppingCart,
                            contentDescription = "Cart",
                            tint = colors.textPrimary,
                            modifier = Modifier.padding(2.dp)
                        )
                    }
                }
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Box(modifier = Modifier.fillMaxWidth()) {
                    PanelImage(panel = panel, modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f), shape = PanelScan.shapes.hero)
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(Spacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        StatusBadge(text = panel.category.removePrefix("PVC "), tone = BadgeTone.Accent)
                        StatusBadge(
                            text = if (panel.inStock) "In stock" else "3–5 days",
                            tone = if (panel.inStock) BadgeTone.Success else BadgeTone.Warning,
                            showDot = true
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(
                        text = panel.finish.uppercase(),
                        style = PanelScan.type.label,
                        color = colors.textTertiary
                    )
                    Text(text = panel.name, style = PanelScan.type.title, color = colors.textPrimary)
                    Text(
                        text = panel.description,
                        style = PanelScan.type.body,
                        color = colors.textSecondary
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    MetricCard(
                        label = "Coverage",
                        value = formatArea(panel.coverageSquareMeters),
                        unit = "m² each",
                        modifier = Modifier.weight(1f)
                    )
                    if (showPrice) {
                        MetricCard(
                            label = "Price",
                            value = panel.pricePerUnit?.let { formatCurrency(it) } ?: "—",
                            unit = if (panel.pricePerUnit != null) "per panel" else null,
                            emphasised = true,
                            modifier = Modifier.weight(1f)
                        )
                    } else {
                        PanelCard(
                            modifier = Modifier.weight(1f),
                            onClick = onNavigateToSignIn,
                            contentPadding = PaddingValues(Spacing.sm)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = "PRICE",
                                    style = PanelScan.type.label,
                                    color = colors.textTertiary
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(Spacing.xxs)
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Lock,
                                        contentDescription = null,
                                        tint = colors.accent,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = "Log in",
                                        style = PanelScan.type.cardTitle,
                                        color = colors.accent
                                    )
                                }
                                Text(
                                    text = "to view pricing",
                                    style = PanelScan.type.supporting,
                                    color = colors.textSecondary
                                )
                            }
                        }
                    }
                }

                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Text(
                        text = "Panel Specifications",
                        style = PanelScan.type.sectionTitle,
                        color = colors.textPrimary,
                        modifier = Modifier.padding(bottom = Spacing.xs)
                    )
                    SpecRow(label = "Category", value = panel.category)
                    SpecDivider()
                    panel.material?.let {
                        SpecRow(label = "Material", value = it)
                        SpecDivider()
                    }
                    SpecRow(label = "Finish", value = panel.finish)
                    SpecDivider()
                    SpecRow(
                        label = "Panel width",
                        value = "${(panel.widthMeters * 1000).toInt()} mm  (${formatMeters(panel.widthMeters)} m)"
                    )
                    SpecDivider()
                    SpecRow(
                        label = "Panel length",
                        value = "${(panel.heightMeters * 1000).toInt()} mm  (${formatMeters(panel.heightMeters)} m)"
                    )
                    SpecDivider()
                    SpecRow(label = "Thickness", value = "${panel.thicknessMm} mm")
                    SpecDivider()
                    SpecRow(label = "Coverage per panel", value = formatAreaWithUnit(panel.coverageSquareMeters))
                    SpecDivider()
                    panel.inventoryQty?.let {
                        SpecRow(
                            label = "Stock qty",
                            value = if (it > 0) "$it panels" else "Made to order"
                        )
                        SpecDivider()
                    }
                    SpecRow(
                        label = "Availability",
                        value = if (panel.inStock) "In stock" else "Made to order",
                        valueColor = if (panel.inStock) colors.success else colors.warning
                    )
                }

                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Text("Customer reviews", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
                    if (reviews.isEmpty()) {
                        Text(
                            "No reviews for this panel yet. Customers can rate their order once it is delivered.",
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary,
                            modifier = Modifier.padding(top = Spacing.xs)
                        )
                    } else {
                        reviews.forEach { review ->
                            Column(modifier = Modifier.fillMaxWidth().padding(top = Spacing.sm)) {
                                Text(review.customerName, style = PanelScan.type.cardTitle, color = colors.textPrimary)
                                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                    repeat(5) { index ->
                                        Icon(
                                            imageVector = if (index < review.rating) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                            contentDescription = null,
                                            tint = if (index < review.rating) colors.accent else colors.textTertiary,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                                review.comment?.let { Text(it, style = PanelScan.type.body, color = colors.textPrimary) }
                                Text(formatDate(review.createdAt), style = PanelScan.type.label, color = colors.textTertiary)
                            }
                        }
                    }
                }

                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    color = colors.surfaceMuted,
                    borderColor = androidx.compose.ui.graphics.Color.Transparent,
                    elevation = 0.dp,
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Text(
                        text = "Installation notes",
                        style = PanelScan.type.cardTitle,
                        color = colors.textPrimary
                    )
                    Text(
                        text = "Allow a 10% waste margin for cuts around sockets, corners and " +
                            "openings. PanelScan applies this to every estimate by default.",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary,
                        modifier = Modifier.padding(top = Spacing.xxs)
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        top = Spacing.xs,
                        bottom = Spacing.sm
                    )
                    .navigationBarsPadding()
                    .padding(bottom = bottomPadding),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                if (addedToCartState) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.controlCompact)
                            .background(colors.accentSoft)
                            .padding(horizontal = Spacing.sm, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Added to Cart! Tap the cart icon above to view it.",
                            style = PanelScan.type.supporting,
                            color = colors.textPrimary,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    // Quantity Stepper
                    Row(
                        modifier = Modifier
                            .clip(PanelScan.shapes.control)
                            .border(1.dp, colors.border, PanelScan.shapes.control)
                            .background(colors.surface)
                            .padding(horizontal = 4.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = { if (quantity > 1) quantity-- },
                            enabled = quantity > 1,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Remove,
                                contentDescription = "Decrease quantity",
                                tint = if (quantity > 1) colors.textPrimary else colors.textTertiary,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                        Text(
                            text = "$quantity",
                            style = PanelScan.type.cardTitle,
                            color = colors.textPrimary,
                            modifier = Modifier.padding(horizontal = 8.dp)
                        )
                        IconButton(
                            onClick = { quantity++ },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Add,
                                contentDescription = "Increase quantity",
                                tint = colors.textPrimary,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }

                    // Add to Cart Button
                    PrimaryButton(
                        text = if (showPrice) "Add to Cart" else "Log in to Buy",
                        icon = Icons.Rounded.ShoppingCart,
                        onClick = {
                            if (showPrice) {
                                onAddToCart(panel, quantity)
                                addedToCartState = true
                            } else {
                                onNavigateToSignIn()
                            }
                        },
                        modifier = Modifier.weight(1f)
                    )
                }

                PrimaryButton(
                    text = if (showPrice) "Proceed to Checkout" else "Log in to Checkout",
                    icon = Icons.Rounded.ShoppingCart,
                    onClick = {
                        if (showPrice) onProceedToCheckout(panel, quantity) else onNavigateToSignIn()
                    },
                    modifier = Modifier.fillMaxWidth()
                )

                SecondaryButton(
                    text = "Use in Measurement",
                    icon = Icons.Rounded.Straighten,
                    onClick = { onUseInMeasurement(panel) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun SpecDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(vertical = Spacing.xs),
        color = PanelScan.colors.border
    )
}
