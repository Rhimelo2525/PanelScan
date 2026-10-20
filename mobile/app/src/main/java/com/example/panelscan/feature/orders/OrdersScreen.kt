package com.example.panelscan.feature.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderItem
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.core.util.ManilaTime
import com.example.panelscan.data.repository.OrderRepository
import com.example.panelscan.data.repository.isReviewEligible
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Longer orders show the first few lines; the rest are in the order's page. */
private const val VISIBLE_ITEMS = 3

/**
 * The customer's orders, as on the website: one status per tab, a search by
 * order number or product name, and a card per order with each product's
 * picture, the amount, and the actions for its stage.
 */
@Composable
fun OrdersScreen(
    orderRepository: OrderRepository,
    /** Orders the customer has already reviewed ("View Feedback" instead of "Leave Feedback"). */
    reviewedOrderIds: Set<String>,
    onBack: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onFeedback: (String) -> Unit,
    onBrowseCatalog: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val orders by orderRepository.orders.collectAsState()
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var status by rememberSaveable { mutableStateOf<OrderStatus?>(null) }
    var search by rememberSaveable { mutableStateOf("") }
    var retry by remember { mutableStateOf(0) }

    // The same orders as the website, reloaded each time the list opens.
    LaunchedEffect(orderRepository, retry) {
        loading = true
        loadError = orderRepository.refresh()
        loading = false
    }

    val shown = remember(orders, status, search) { filterOrders(orders, status, search) }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "My Orders",
                subtitle = "Follow each order's status, as on the website",
                onBack = onBack
            )

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
                item(key = "tabs") { StatusTabs(selected = status, onSelect = { status = it }) }
                item(key = "search") { SearchField(value = search, onValueChange = { search = it.take(100) }) }

                when {
                    loading && orders.isEmpty() -> item(key = "loading") {
                        Text(
                            "Loading your orders…",
                            style = PanelScan.type.supporting,
                            color = PanelScan.colors.textSecondary,
                            modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xl),
                            textAlign = TextAlign.Center
                        )
                    }
                    loadError != null && orders.isEmpty() -> item(key = "error") {
                        EmptyState(
                            icon = Icons.Rounded.ReceiptLong,
                            title = "Orders could not be loaded",
                            description = loadError.orEmpty(),
                            actionLabel = "Try again",
                            onAction = { retry++ }
                        )
                    }
                    orders.isEmpty() -> item(key = "none") {
                        EmptyState(
                            icon = Icons.Rounded.ReceiptLong,
                            title = "No orders yet",
                            description = "Orders you place from your cart will appear here.",
                            actionLabel = "Browse products",
                            onAction = onBrowseCatalog
                        )
                    }
                    shown.isEmpty() -> item(key = "no-match") {
                        val tab = status?.label?.lowercase()
                        val query = search.trim()
                        EmptyState(
                            icon = Icons.Rounded.SearchOff,
                            title = if (query.isNotEmpty()) "No orders match your search" else "No $tab orders",
                            description = if (query.isNotEmpty()) "Nothing in ${if (tab == null) "your orders" else "$tab orders"} matches \"$query\"."
                            else "Orders with this status will appear here.",
                            actionLabel = "Show all orders",
                            onAction = {
                                search = ""
                                status = null
                            }
                        )
                    }
                    else -> items(shown, key = { it.id }) { order ->
                        OrderCard(
                            order = order,
                            reviewed = order.id in reviewedOrderIds,
                            onOpen = { onOpenOrder(order.id) },
                            onFeedback = { onFeedback(order.id) }
                        )
                    }
                }
            }
        }
    }
}

/** The tab's orders whose number or product names contain the search, as the website searches. */
internal fun filterOrders(orders: List<Order>, status: OrderStatus?, search: String): List<Order> {
    val query = search.trim()
    return orders.filter { order ->
        (status == null || order.status == status) &&
            (query.isEmpty() || order.orderNumber.contains(query, ignoreCase = true) ||
                order.items.any { it.panelName.contains(query, ignoreCase = true) })
    }
}

/** Until PanelScan quotes the delivery fee, the amount is the products only - never shown as the order total. */
internal val Order.awaitingFee: Boolean
    get() = !shippingQuoted && delivery.status in setOf("AWAITING_ORDER_APPROVAL", "AWAITING_QUOTE")

/** "Oct 2, 2026, 1:07 AM" in Philippine time, as on the website. */
internal fun formatOrderDate(millis: Long): String =
    SimpleDateFormat("MMM d, yyyy, h:mm a", Locale.US).apply { timeZone = ManilaTime.ZONE }.format(Date(millis))

/** Customer-facing delivery labels, the same as the website's (web/src/lib/delivery/status-label.ts). */
internal fun deliveryStatusLabel(raw: String?): String = when (raw?.uppercase()) {
    null -> "Not requested"
    "AWAITING_ORDER_APPROVAL" -> "Waiting for approval"
    "AWAITING_QUOTE" -> "Awaiting shipping quote"
    "AWAITING_PAYMENT" -> "Awaiting customer payment"
    "READY_TO_BOOK" -> "Ready to book"
    "NOT_REQUESTED" -> "Not requested"
    "NOT_SCHEDULED" -> "Not scheduled"
    "PREPARING" -> "Preparing delivery"
    "VEHICLE_SELECTED" -> "Vehicle selected"
    "BOOKING" -> "Booking in progress"
    "BOOKING_FAILED" -> "Booking failed"
    "ASSIGNING_DRIVER" -> "Booked"
    "ON_GOING" -> "Driver assigned"
    "PICKED_UP" -> "In transit"
    "COMPLETED" -> "Delivered"
    "CANCELED", "CANCELLED" -> "Cancelled"
    "REJECTED" -> "Delivery request rejected"
    "EXPIRED" -> "Delivery request expired"
    else -> "Status: $raw"
}

@Composable
private fun StatusTabs(selected: OrderStatus?, onSelect: (OrderStatus?) -> Unit) {
    val colors = PanelScan.colors
    val tabs = listOf<OrderStatus?>(null) + OrderStatus.entries
    PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(0.dp)) {
        Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            tabs.forEach { tab ->
                val active = tab == selected
                Column(
                    // As wide as the label, so the underline spans it.
                    modifier = Modifier
                        .width(IntrinsicSize.Max)
                        .clickable { onSelect(tab) }
                        .padding(top = 14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = tab?.label ?: "All",
                        style = PanelScan.type.body,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (active) colors.accent else colors.textSecondary,
                        modifier = Modifier.padding(horizontal = 18.dp)
                    )
                    Box(
                        modifier = Modifier
                            .padding(top = 12.dp)
                            .fillMaxWidth()
                            .height(2.dp)
                            .background(if (active) colors.accent else colors.surface)
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchField(value: String, onValueChange: (String) -> Unit) {
    PanelScanTextField(
        value = value,
        onValueChange = onValueChange,
        label = "Search your orders",
        placeholder = "Order number or product name",
        leadingIcon = Icons.Rounded.Search,
        trailingIcon = if (value.isEmpty()) null else {
            {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(Icons.Rounded.Close, contentDescription = "Clear search", tint = PanelScan.colors.textSecondary)
                }
            }
        }
    )
}

@Composable
fun OrderCard(
    order: Order,
    reviewed: Boolean,
    onOpen: () -> Unit,
    onFeedback: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val awaitingFee = order.awaitingFee
    val deliveryStatus = if (order.status != OrderStatus.CANCELLED) order.delivery.status else null
    val canLeaveFeedback = order.isReviewEligible && !reviewed
    val visible = order.items.take(VISIBLE_ITEMS)
    val hidden = order.items.size - visible.size

    PanelCard(modifier = modifier.fillMaxWidth(), onClick = onOpen, contentPadding = PaddingValues(0.dp)) {
        // Header: number, date, delivery progress, status.
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        order.orderNumber.uppercase(),
                        style = PanelScan.type.cardTitle,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.8.sp,
                        color = colors.textPrimary
                    )
                    Text(
                        formatOrderDate(order.createdAt),
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                StatusBadge(text = order.status.label, tone = order.status.badgeTone())
            }
            if (deliveryStatus != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Rounded.LocalShipping, contentDescription = null, tint = colors.accent, modifier = Modifier.size(16.dp))
                    Text(deliveryStatusLabel(deliveryStatus), style = PanelScan.type.supporting, color = colors.textSecondary)
                }
            }
        }
        HorizontalDivider(color = colors.border)

        // One row per product line, with its picture.
        Column(modifier = Modifier.padding(horizontal = Spacing.md)) {
            visible.forEachIndexed { index, item ->
                if (index > 0) HorizontalDivider(color = colors.border)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    ItemThumbnail(item)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.panelName, style = PanelScan.type.body, fontWeight = FontWeight.Medium, color = colors.textPrimary)
                        Text("x${item.quantity}", style = PanelScan.type.supporting, color = colors.textSecondary)
                    }
                    Text(formatCurrency(item.lineTotal), style = PanelScan.type.body, fontWeight = FontWeight.Medium, color = colors.textPrimary)
                }
            }
            if (hidden > 0) {
                HorizontalDivider(color = colors.border)
                Text(
                    "+$hidden more item${if (hidden == 1) "" else "s"}",
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp)
                )
            }
        }
        HorizontalDivider(color = colors.border)

        // Footer: the amount on the left, level with "View order" on the right,
        // then this stage's note and the feedback action.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.surfaceMuted)
                .padding(horizontal = Spacing.md, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (awaitingFee) "Subtotal" else "Order total",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                    Text(
                        formatCurrency(if (awaitingFee) order.subtotal else order.totalAmount),
                        style = PanelScan.type.sectionTitle,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.accent
                    )
                }
                SecondaryButton(
                    text = "View order",
                    icon = Icons.AutoMirrored.Rounded.ArrowForward,
                    iconAfterText = true,
                    onClick = onOpen,
                    fillMaxWidth = false
                )
            }
            val note = when {
                awaitingFee -> "The delivery fee is added once PanelScan approves your order."
                canLeaveFeedback -> "Your order has arrived. Tell us how it went."
                else -> null
            }
            note?.let { Text(it, style = PanelScan.type.label, color = colors.textSecondary) }
            if (order.isReviewEligible) {
                if (canLeaveFeedback) PrimaryButton(text = "Leave Feedback", onClick = onFeedback)
                else SecondaryButton(text = "View Feedback", onClick = onFeedback)
            }
        }
    }
}

/** The product's picture, or a neutral package tile when it has none (or it fails to load). */
@Composable
private fun ItemThumbnail(item: OrderItem) {
    val colors = PanelScan.colors
    val tile = Modifier
        .size(56.dp)
        .clip(PanelScan.shapes.control)
        .border(1.dp, colors.border, PanelScan.shapes.control)
        .background(colors.surfaceMuted)
    val placeholder: @Composable () -> Unit = {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Inventory2, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
        }
    }
    Box(modifier = tile, contentAlignment = Alignment.Center) {
        if (item.imageUrl == null) {
            placeholder()
        } else {
            SubcomposeAsyncImage(
                model = item.imageUrl,
                contentDescription = item.panelName,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                error = { placeholder() }
            )
        }
    }
}
