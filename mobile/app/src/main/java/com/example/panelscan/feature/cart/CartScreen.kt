package com.example.panelscan.feature.cart

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.CartItem
import com.example.panelscan.data.repository.CartSelectionSummary
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PanelImage
import com.example.panelscan.core.ui.PanelTexture
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatDimensions

@Composable
fun CartScreen(
    viewModel: CartViewModel,
    onBack: () -> Unit,
    onProceedToCheckout: () -> Unit,
    onBrowseCatalog: () -> Unit,
    showPrice: Boolean = false,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val items by viewModel.items.collectAsState()
    val selectedIds by viewModel.selectedItemIds.collectAsState()
    val colors = PanelScan.colors

    // Totals cover ticked items only; unticked items stay in the cart untouched.
    val summary = CartSelectionSummary.of(items, selectedIds)
    val subtotal = summary.subtotal
    val allSelected = summary.allSelected

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Cart",
                subtitle = if (items.isNotEmpty()) {
                    "Selected items: ${summary.selectedItems} of ${items.size}"
                } else null,
                onBack = onBack
            )

            if (items.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = Spacing.gutter),
                    contentAlignment = Alignment.Center
                ) {
                    EmptyState(
                        icon = Icons.Rounded.ShoppingCart,
                        title = "Your cart is empty",
                        description = "Explore our collection of PVC wall and ceiling panels to add materials to your cart.",
                        actionLabel = "Browse Panels",
                        onAction = onBrowseCatalog
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        top = Spacing.xs,
                        bottom = Spacing.md
                    ),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    // Select All Header
                    item {
                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(horizontal = Spacing.sm, vertical = Spacing.xs)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { viewModel.selectAll(!allSelected) },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(
                                        checked = allSelected,
                                        onCheckedChange = { viewModel.selectAll(it) },
                                        colors = CheckboxDefaults.colors(
                                            checkedColor = colors.accent,
                                            checkmarkColor = colors.accentContrast
                                        )
                                    )
                                    Spacer(modifier = Modifier.width(Spacing.xs))
                                    Text(
                                        text = "Select All (${items.size})",
                                        style = PanelScan.type.label,
                                        color = colors.textPrimary
                                    )
                                }
                                if (summary.selectedItems > 0) {
                                    TextButton(onClick = { viewModel.clearSelection() }) {
                                        Text(
                                            text = "Clear selection",
                                            style = PanelScan.type.label,
                                            color = colors.accent
                                        )
                                    }
                                } else {
                                    Text(
                                        text = "0 of ${items.size} selected",
                                        style = PanelScan.type.supporting,
                                        color = colors.textSecondary
                                    )
                                }
                            }
                        }
                    }

                    items(items, key = { it.id }) { item ->
                        CartItemRow(
                            item = item,
                            isSelected = selectedIds.contains(item.id),
                            onToggleSelect = { viewModel.toggleSelection(item.id) },
                            onIncrease = { viewModel.updateQuantity(item.id, item.quantity + 1) },
                            onDecrease = { viewModel.updateQuantity(item.id, item.quantity - 1) },
                            onRemove = { viewModel.removeItem(item.id) },
                            showPrice = showPrice
                        )
                    }

                    item {
                        Spacer(modifier = Modifier.height(Spacing.xs))
                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(Spacing.md)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                                Text(
                                    text = "Order Summary (Selected Items)",
                                    style = PanelScan.type.sectionTitle,
                                    color = colors.textPrimary
                                )
                                SpecRow(label = "Selected items", value = "${summary.selectedItems}")
                                SpecRow(
                                    label = "Materials subtotal (${summary.selectedQuantity} panels)",
                                    value = com.example.panelscan.core.ui.PriceVisibility.formatPriceOrHidden(subtotal, showPrice),
                                    emphasised = true
                                )
                                SpecRow(
                                    label = "Delivery fee",
                                    value = "To be confirmed"
                                )
                            }
                        }
                    }

                    item {
                        Text(
                            text = "PanelScan will coordinate delivery and confirm the fee. You can request installation at checkout; its price is not set yet.",
                            style = PanelScan.type.supporting,
                            color = colors.textTertiary,
                            modifier = Modifier.padding(horizontal = Spacing.xs, vertical = Spacing.xxs)
                        )
                    }
                }

                // Bottom Checkout Button
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.surfaceElevated)
                        .border(1.dp, colors.border, RectangleShape)
                        .navigationBarsPadding()
                        .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                        .padding(bottom = bottomPadding)
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(Spacing.xxs)
                    ) {
                        summary.blockingMessage?.let { message ->
                            Text(
                                text = message,
                                style = PanelScan.type.label,
                                color = colors.destructive,
                                modifier = Modifier.padding(bottom = 2.dp)
                            )
                        }
                        PrimaryButton(
                            text = when {
                                !summary.canCheckout -> "Checkout Selected"
                                !showPrice -> "Log In to Checkout Selected (${summary.selectedItems})"
                                else -> "Checkout Selected (${summary.selectedItems}) · ${formatCurrency(subtotal)}"
                            },
                            icon = Icons.AutoMirrored.Rounded.ArrowForward,
                            onClick = onProceedToCheckout,
                            enabled = summary.canCheckout,
                            fillMaxWidth = true
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CartItemRow(
    item: CartItem,
    isSelected: Boolean,
    onToggleSelect: () -> Unit,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
    onRemove: () -> Unit,
    showPrice: Boolean = false
) {
    val colors = PanelScan.colors
    val panel = item.panel

    PanelCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(Spacing.sm)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Checkbox for selective checkout
            Checkbox(
                checked = isSelected,
                onCheckedChange = { onToggleSelect() },
                colors = CheckboxDefaults.colors(
                    checkedColor = colors.accent,
                    checkmarkColor = colors.accentContrast
                )
            )

            // Thumbnail
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(PanelScan.shapes.control)
                    .border(1.dp, colors.border, PanelScan.shapes.control)
            ) {
                PanelImage(panel = panel, modifier = Modifier.fillMaxSize(), shape = PanelScan.shapes.control)
            }

            // Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = panel.name,
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${panel.finish} · ${formatDimensions(panel)}",
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = com.example.panelscan.core.ui.PriceVisibility.formatUnitPriceOrHidden(panel.pricePerUnit, showPrice),
                    style = PanelScan.type.label,
                    color = colors.accent,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }

            // Controls & Total
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(Spacing.xxs)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Text(
                        text = com.example.panelscan.core.ui.PriceVisibility.formatPriceOrHidden(item.lineTotal, showPrice, fallback = "—"),
                        style = PanelScan.type.cardTitle,
                        color = colors.textPrimary
                    )
                    IconButton(
                        onClick = onRemove,
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.DeleteOutline,
                            contentDescription = "Remove item from cart",
                            tint = colors.destructive,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    IconButton(
                        onClick = onDecrease,
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            imageVector = if (item.quantity == 1) Icons.Rounded.DeleteOutline else Icons.Rounded.Remove,
                            contentDescription = "Decrease",
                            tint = if (item.quantity == 1) colors.destructive else colors.textPrimary,
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    Text(
                        text = item.quantity.toString(),
                        style = PanelScan.type.body,
                        color = colors.textPrimary,
                        modifier = Modifier.padding(horizontal = 4.dp)
                    )

                    IconButton(
                        onClick = onIncrease,
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Add,
                            contentDescription = "Increase",
                            tint = colors.textPrimary,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}
