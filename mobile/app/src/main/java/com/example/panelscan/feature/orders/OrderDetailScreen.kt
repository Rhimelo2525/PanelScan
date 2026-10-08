package com.example.panelscan.feature.orders

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Star
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
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderItem
import com.example.panelscan.core.model.OrderStage
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.model.PaymentStatus
import com.example.panelscan.data.repository.isReviewEligible
import coil.compose.SubcomposeAsyncImage
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PanelTexture
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatDate

import androidx.compose.material.icons.rounded.CheckCircle
import com.example.panelscan.core.model.CustomerReview

@Composable
fun OrderDetailScreen(
    order: Order,
    onBack: () -> Unit,
    onLeaveFeedback: (String) -> Unit,
    onViewInstallation: (String) -> Unit,
    hasReviewed: Boolean = false,
    review: CustomerReview? = null,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp,
    /** Opens PayMongo's GCash checkout for this order. */
    onPay: () -> Unit = {},
    onCancel: () -> Unit = {},
    /** A payment is being opened or the order cancelled. */
    isBusy: Boolean = false,
    actionError: String? = null
) {
    val colors = PanelScan.colors
    val tone = order.status.badgeTone()
    var confirmCancel by remember { mutableStateOf(false) }

    if (confirmCancel) {
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            title = { Text("Cancel this order?", style = PanelScan.type.sectionTitle) },
            text = { Text("The panels go back on sale. This can't be undone.", style = PanelScan.type.body) },
            confirmButton = {
                TextButton(onClick = {
                    confirmCancel = false
                    onCancel()
                }) { Text("Cancel order", color = colors.destructive) }
            },
            dismissButton = { TextButton(onClick = { confirmCancel = false }) { Text("Keep order") } },
            containerColor = colors.surfaceElevated
        )
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Order #${order.orderNumber}",
                subtitle = formatDate(order.createdAt),
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        top = Spacing.xs,
                        bottom = bottomPadding + Spacing.xl
                    ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                // Status header
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Order Status",
                                style = PanelScan.type.label,
                                color = colors.textTertiary
                            )
                            Text(
                                text = order.status.label,
                                style = PanelScan.type.title,
                                color = colors.textPrimary
                            )
                        }
                        StatusBadge(text = order.status.label, tone = tone)
                    }
                }

                actionError?.let { Text(it, style = PanelScan.type.supporting, color = colors.destructive) }

                // Ordered Items
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text(
                            text = "Purchased Panels",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )

                        order.items.forEach { item ->
                            OrderItemDetailRow(item = item)
                        }
                    }
                }

                // Payment: products + shipping in one GCash payment, once approved and quoted (as on the website)
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(text = "Payment", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
                            StatusBadge(text = order.stage.label, tone = order.stage.badgeTone())
                        }
                        SpecRow(label = "Products", value = formatCurrency(order.subtotal))
                        SpecRow(
                            label = "Shipping fee",
                            value = if (order.shippingQuoted) formatCurrency(order.shippingFee) else "Quoted after approval"
                        )
                        HorizontalDivider(color = colors.border, modifier = Modifier.padding(vertical = Spacing.xxs))
                        SpecRow(
                            label = if (order.shippingQuoted) "Total" else "Products total (shipping pending)",
                            value = formatCurrency(order.totalAmount),
                            emphasised = true
                        )
                        Text(
                            text = when (order.stage) {
                                OrderStage.AWAITING_APPROVAL -> "Your order is being reviewed. Once it is approved, we will calculate your delivery fee and payment will become available."
                                OrderStage.AWAITING_QUOTE -> "Your order has been approved. We are calculating your delivery fee. Payment will be available once the shipping fee is ready."
                                OrderStage.AWAITING_PAYMENT -> "Your shipping fee is ready. Pay products and shipping together with GCash."
                                OrderStage.PAID -> if (order.paymentStatus == PaymentStatus.REFUNDED) "This payment is recorded as refunded." else "Payment successful. Your delivery is being prepared."
                                OrderStage.CANCELLED -> "This order was cancelled."
                            },
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                        if (order.stage == OrderStage.AWAITING_PAYMENT) {
                            if (order.paymentStatus == PaymentStatus.FAILED) {
                                Text("Your last payment did not go through. You can try again.", style = PanelScan.type.supporting, color = colors.destructive)
                            }
                            PrimaryButton(
                                text = if (isBusy) "Opening secure checkout…" else "Pay ${formatCurrency(order.totalAmount)} with GCash",
                                onClick = onPay,
                                enabled = !isBusy,
                                fillMaxWidth = true
                            )
                            Text(
                                "You will leave PanelScan for PayMongo's secure GCash checkout. PanelScan never receives your wallet details. Come back here after paying.",
                                style = PanelScan.type.label,
                                color = colors.textTertiary
                            )
                        }
                    }
                }

                // Delivery & Contact
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(
                            text = "Delivery & Customer Details",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )
                        SpecRow(label = "Recipient", value = order.customerName)
                        order.delivery.vehicle?.let { SpecRow(label = "Vehicle", value = it) }
                        if (order.delivery.latitude != null && order.delivery.longitude != null) {
                            SpecRow(
                                label = "Pinned location",
                                value = String.format(java.util.Locale.US, "%.5f, %.5f", order.delivery.latitude, order.delivery.longitude)
                            )
                        }
                        SpecRow(
                            label = "Delivery booking",
                            value = order.delivery.bookingReference ?: order.delivery.bookingStatus
                        )
                        order.customerPhone?.let {
                            SpecRow(label = "Phone", value = it)
                        }
                        Column(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                            Text(
                                text = "Delivery Address",
                                style = PanelScan.type.label,
                                color = colors.textSecondary
                            )
                            Text(
                                text = order.shippingAddress,
                                style = PanelScan.type.body,
                                color = colors.textPrimary,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                        order.notes?.let {
                            SpecRow(label = "Notes", value = it)
                        }
                    }
                }

                // Actions & Review
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    if (order.isReviewEligible) {
                        if (hasReviewed) {
                            PanelCard(
                                modifier = Modifier.fillMaxWidth(),
                                contentPadding = PaddingValues(Spacing.md)
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "Your Customer Review",
                                            style = PanelScan.type.sectionTitle,
                                            color = colors.textPrimary
                                        )
                                        StatusBadge(text = "Reviewed ✓", tone = BadgeTone.Success)
                                    }
                                    if (review != null) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                                            modifier = Modifier.padding(vertical = 2.dp)
                                        ) {
                                            repeat(review.rating) {
                                                Icon(
                                                    imageVector = Icons.Rounded.Star,
                                                    contentDescription = null,
                                                    tint = colors.accent,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                        }
                                        Text(
                                            text = "\"${review.comment}\"",
                                            style = PanelScan.type.body,
                                            color = colors.textPrimary
                                        )
                                    }
                                }
                            }
                        } else {
                            PrimaryButton(
                                text = "Leave Customer Review",
                                icon = Icons.Rounded.Star,
                                onClick = { onLeaveFeedback(order.id) },
                                fillMaxWidth = true
                            )
                        }
                    }

                    if (order.hasInstallation) {
                        SecondaryButton(
                            text = "View Installation Schedule",
                            icon = Icons.Rounded.Build,
                            onClick = { onViewInstallation(order.id) },
                            fillMaxWidth = true
                        )
                    }

                    if (order.canCancel) {
                        SecondaryButton(
                            text = "Cancel order",
                            onClick = { confirmCancel = true },
                            enabled = !isBusy,
                            destructive = true,
                            fillMaxWidth = true
                        )
                    }
                }
            }
        }
    }
}

/** Badge colours for the backend's order statuses (also used by the orders list). */
fun OrderStatus.badgeTone(): BadgeTone = when (this) {
    OrderStatus.DELIVERED -> BadgeTone.Success
    OrderStatus.PROCESSING, OrderStatus.SHIPPED -> BadgeTone.Accent
    OrderStatus.PENDING -> BadgeTone.Warning
    OrderStatus.CANCELLED -> BadgeTone.Neutral
}

private fun OrderStage.badgeTone(): BadgeTone = when (this) {
    OrderStage.PAID -> BadgeTone.Success
    OrderStage.AWAITING_PAYMENT -> BadgeTone.Accent
    OrderStage.AWAITING_APPROVAL, OrderStage.AWAITING_QUOTE -> BadgeTone.Warning
    OrderStage.CANCELLED -> BadgeTone.Neutral
}

@Composable
private fun OrderItemDetailRow(item: OrderItem) {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(PanelScan.shapes.control)
                .border(1.dp, colors.border, PanelScan.shapes.control)
        ) {
            if (item.imageUrl != null) {
                SubcomposeAsyncImage(
                    model = item.imageUrl,
                    contentDescription = item.panelName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    error = { PanelTexture(item.textureResource, Modifier.fillMaxSize(), PanelScan.shapes.control) }
                )
            } else if (item.imageResId != null) {
                Image(
                    painter = painterResource(id = item.imageResId),
                    contentDescription = item.panelName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                PanelTexture(
                    textureResource = item.textureResource,
                    modifier = Modifier.fillMaxSize(),
                    shape = PanelScan.shapes.control
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.panelName,
                style = PanelScan.type.cardTitle,
                color = colors.textPrimary
            )
            Text(
                text = "${item.quantity} units · ${formatCurrency(item.unitPrice)} each",
                style = PanelScan.type.supporting,
                color = colors.textSecondary
            )
        }

        Text(
            text = formatCurrency(item.lineTotal),
            style = PanelScan.type.cardTitle,
            color = colors.textPrimary
        )
    }
}
