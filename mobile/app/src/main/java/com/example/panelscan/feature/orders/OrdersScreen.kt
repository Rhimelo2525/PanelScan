package com.example.panelscan.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.ui.formatDate
import com.example.panelscan.data.repository.OrderRepository

@Composable
fun OrdersScreen(
    orderRepository: OrderRepository,
    onBack: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onBrowseCatalog: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val orders by orderRepository.orders.collectAsState()
    // The same orders as the website, reloaded each time the list opens.
    LaunchedEffect(orderRepository) { orderRepository.refresh() }
    val colors = PanelScan.colors

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "My Orders",
                subtitle = "${orders.size} customer orders",
                onBack = onBack
            )

            if (orders.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = Spacing.gutter),
                    contentAlignment = Alignment.Center
                ) {
                    EmptyState(
                        icon = Icons.Rounded.ReceiptLong,
                        title = "No orders found",
                        description = "Your placed orders and material deliveries will be listed here.",
                        actionLabel = "Browse Panels",
                        onAction = onBrowseCatalog
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        top = Spacing.xs,
                        bottom = bottomPadding + Spacing.xl
                    ),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    items(orders, key = { it.id }) { order ->
                        OrderCard(
                            order = order,
                            onClick = { onOpenOrder(order.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun OrderCard(
    order: Order,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val tone = order.status.badgeTone()

    PanelCard(
        modifier = modifier.fillMaxWidth(),
        onClick = onClick,
        contentPadding = PaddingValues(Spacing.md)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Order #${order.orderNumber}",
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary
                )
                StatusBadge(text = order.status.label, tone = tone)
            }

            Text(
                text = "${order.items.size} panel type(s) · ${order.items.sumOf { it.quantity }} total panels",
                style = PanelScan.type.supporting,
                color = colors.textSecondary
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.xxs),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = formatDate(order.createdAt),
                        style = PanelScan.type.label,
                        color = colors.textTertiary
                    )
                    Text(
                        text = formatCurrency(order.totalAmount),
                        style = PanelScan.type.sectionTitle,
                        color = colors.accent
                    )
                    Text(
                        text = "Materials subtotal · fees pending",
                        style = PanelScan.type.label,
                        color = colors.textTertiary
                    )
                }

                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    tint = colors.textTertiary
                )
            }
        }
    }
}
