package com.example.panelscan.feature.checkout

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.formatCurrency

@Composable
fun OrderConfirmationScreen(
    order: Order,
    onViewOrder: (String) -> Unit,
    onScheduleInstallation: (String) -> Unit,
    onReturnHome: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val colors = PanelScan.colors

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Order request saved",
                onBack = onReturnHome
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.md),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                // Success banner
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(PanelScan.shapes.hero)
                        .background(colors.accentSoft)
                        .border(1.dp, colors.accent, PanelScan.shapes.hero),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = null,
                        tint = colors.accent,
                        modifier = Modifier.size(44.dp)
                    )
                }

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.xxs)
                ) {
                    Text(
                        text = "Your request is saved",
                        style = PanelScan.type.title,
                        color = colors.textPrimary
                    )
                    Text(
                        text = "Request #${order.orderNumber} is stored in this app. Payment and delivery are pending confirmation.",
                        style = PanelScan.type.body,
                        color = colors.textSecondary
                    )
                }

                // Summary card
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(
                            text = "Order Details",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )
                        SpecRow(label = "Order Number", value = order.orderNumber, emphasised = true)
                        SpecRow(label = "Payment", value = "${order.paymentMethod} · ${order.delivery.paymentStatus}")
                        SpecRow(
                            label = "Delivery fee",
                            value = if (order.delivery.feeQuoted) formatCurrency(order.shippingFee) else order.delivery.quoteStatus
                        )
                        order.delivery.vehicle?.let { SpecRow(label = "Vehicle", value = it) }
                        SpecRow(
                            label = "Delivery booking",
                            value = order.delivery.bookingReference ?: order.delivery.bookingStatus
                        )
                        SpecRow(label = "Materials subtotal (fees pending)", value = formatCurrency(order.totalAmount))
                        SpecRow(label = "Delivery Address", value = order.shippingAddress)
                        SpecRow(label = "Items Count", value = "${order.items.sumOf { it.quantity }} panels")
                        if (order.hasInstallation) {
                            SpecRow(
                                label = "Installation Service",
                                value = "Requested — price to be confirmed",
                                valueColor = colors.accent
                            )
                        }
                    }
                }

                if (order.hasInstallation) {
                    PanelCard(
                        modifier = Modifier.fillMaxWidth(),
                        color = colors.surfaceElevated,
                        contentPadding = PaddingValues(Spacing.md)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Build,
                                    contentDescription = null,
                                    tint = colors.accent,
                                    modifier = Modifier.size(20.dp)
                                )
                                Text(
                                    text = "Ready to Schedule Installation?",
                                    style = PanelScan.type.cardTitle,
                                    color = colors.textPrimary
                                )
                            }
                            Text(
                                text = "Select your preferred date and time for our certified installation team to fit your panels.",
                                style = PanelScan.type.supporting,
                                color = colors.textSecondary
                            )
                            PrimaryButton(
                                text = "Schedule Installation Now",
                                icon = Icons.AutoMirrored.Rounded.ArrowForward,
                                onClick = { onScheduleInstallation(order.id) },
                                fillMaxWidth = true,
                                modifier = Modifier.padding(top = Spacing.xxs)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.sm))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    SecondaryButton(
                        text = "View Order Details",
                        icon = Icons.Rounded.ReceiptLong,
                        onClick = { onViewOrder(order.id) },
                        fillMaxWidth = true
                    )
                    SecondaryButton(
                        text = "Return to Home",
                        onClick = onReturnHome,
                        fillMaxWidth = true
                    )
                }
            }
        }
    }
}
