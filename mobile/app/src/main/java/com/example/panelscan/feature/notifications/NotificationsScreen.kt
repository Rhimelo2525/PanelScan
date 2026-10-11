package com.example.panelscan.feature.notifications

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.ManageAccounts
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SegmentedControl
import com.example.panelscan.core.util.ManilaTime
import com.example.panelscan.data.repository.CustomerNotification
import com.example.panelscan.data.repository.NotificationFilter
import com.example.panelscan.data.repository.NotificationRepository
import com.example.panelscan.data.repository.NotificationType
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Read-state choices, as the website's Status filter. */
private enum class ReadChoice(val label: String, val read: Boolean?) {
    ALL("All", null),
    UNREAD("Unread", false),
    READ("Read", true)
}

@Composable
fun NotificationsScreen(
    repository: NotificationRepository,
    onBack: () -> Unit,
    onOpen: (CustomerNotification) -> Unit
) {
    val notifications by repository.notifications.collectAsState()
    val filter by repository.filter.collectAsState()
    val unreadCount by repository.unreadCount.collectAsState()
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(true) }
    val colors = PanelScan.colors

    LaunchedEffect(repository) {
        repository.refresh()
        isLoading = false
    }

    fun applyFilter(next: NotificationFilter) {
        isLoading = true
        scope.launch {
            repository.setFilter(next)
            isLoading = false
        }
    }

    ScreenScaffold {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Notifications",
                subtitle = if (unreadCount == 1) "1 unread" else "$unreadCount unread",
                onBack = onBack
            )

            // Filters: read state, type, and mark all as read.
            Column(
                modifier = Modifier.padding(horizontal = Spacing.gutter, vertical = Spacing.xs),
                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                SegmentedControl(
                    options = ReadChoice.entries,
                    selected = ReadChoice.entries.first { it.read == filter.read },
                    onSelect = { applyFilter(filter.copy(read = it.read)) },
                    label = { it.label }
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TypeDropdown(selected = filter.type, onSelect = { applyFilter(filter.copy(type = it)) })
                    Spacer(modifier = Modifier.weight(1f))
                    TextButton(onClick = repository::markAllRead, enabled = unreadCount > 0) {
                        Icon(Icons.Rounded.DoneAll, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Mark all as read", style = PanelScan.type.button)
                    }
                }
            }

            when {
                notifications.isEmpty() && isLoading -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Loading notifications…", style = PanelScan.type.supporting, color = colors.textSecondary)
                }
                notifications.isEmpty() && filter.isActive -> EmptyState(
                    icon = Icons.Rounded.NotificationsOff,
                    title = "No notifications match these filters",
                    description = "Try a different type or status.",
                    actionLabel = "Clear filters",
                    onAction = { applyFilter(NotificationFilter()) }
                )
                notifications.isEmpty() -> EmptyState(
                    icon = Icons.Rounded.Notifications,
                    title = "No notifications yet",
                    description = "Order, payment, delivery and installation updates will appear here.",
                    modifier = Modifier.fillMaxSize()
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = Spacing.gutter, end = Spacing.gutter, top = Spacing.xxs, bottom = Spacing.xl),
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    items(notifications, key = { it.id }) { notification ->
                        NotificationCard(
                            notification = notification,
                            onClick = {
                                repository.markRead(notification.id)
                                onOpen(notification)
                            }
                        )
                    }
                }
            }
        }
    }
}

/** "All types ▾" pill opening the type list, as the website's Type filter. */
@Composable
private fun TypeDropdown(selected: NotificationType?, onSelect: (NotificationType?) -> Unit) {
    val colors = PanelScan.colors
    var expanded by remember { mutableStateOf(false) }
    Box {
        Row(
            modifier = Modifier
                .clip(PanelScan.shapes.chip)
                .background(if (selected != null) colors.accentSoft else colors.surface)
                .border(1.dp, if (selected != null) colors.accent.copy(alpha = 0.35f) else colors.border, PanelScan.shapes.chip)
                .clickable { expanded = true }
                .padding(start = Spacing.md, end = Spacing.sm, top = 9.dp, bottom = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            selected?.let { Icon(it.icon, contentDescription = null, tint = colors.accent, modifier = Modifier.size(16.dp)) }
            Text(
                text = selected?.label ?: "All types",
                style = PanelScan.type.button,
                color = if (selected != null) colors.accent else colors.textPrimary
            )
            Icon(
                Icons.Rounded.ExpandMore,
                contentDescription = "Choose a notification type",
                tint = if (selected != null) colors.accent else colors.textSecondary,
                modifier = Modifier.size(18.dp)
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            containerColor = colors.surfaceElevated
        ) {
            (listOf<NotificationType?>(null) + NotificationType.entries).forEach { type ->
                DropdownMenuItem(
                    text = { Text(type?.label ?: "All types", style = PanelScan.type.body, color = colors.textPrimary) },
                    leadingIcon = {
                        Icon(type?.icon ?: Icons.Rounded.Notifications, contentDescription = null, tint = colors.textSecondary)
                    },
                    trailingIcon = {
                        if (type == selected) Icon(Icons.Rounded.Check, contentDescription = "Selected", tint = colors.accent)
                    },
                    onClick = {
                        expanded = false
                        onSelect(type)
                    }
                )
            }
        }
    }
}

@Composable
private fun NotificationCard(notification: CustomerNotification, onClick: () -> Unit) {
    val colors = PanelScan.colors
    val unread = !notification.read
    PanelCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        contentPadding = PaddingValues(Spacing.md)
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(PanelScan.shapes.control)
                    .background(if (unread) colors.accentSoft else colors.surfaceMuted),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    notification.type.icon,
                    contentDescription = null,
                    tint = if (unread) colors.accent else colors.textSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = notification.title,
                        style = PanelScan.type.cardTitle,
                        fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium,
                        color = colors.textPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    if (unread) {
                        Box(
                            modifier = Modifier
                                .padding(start = Spacing.xs)
                                .size(9.dp)
                                .clip(PanelScan.shapes.chip)
                                .background(colors.accent)
                        )
                    }
                }
                Text(notification.message, style = PanelScan.type.supporting, color = colors.textSecondary)
                Text(
                    text = "${notification.type.label} · ${formatNotificationTime(notification.timestampMillis)}",
                    style = PanelScan.type.label,
                    color = if (unread) colors.accent else colors.textTertiary,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

private val NotificationType.icon: ImageVector
    get() = when (this) {
        NotificationType.ORDER -> Icons.Rounded.LocalShipping
        NotificationType.PAYMENT -> Icons.Rounded.Payments
        NotificationType.BOOKING -> Icons.Rounded.Build
        NotificationType.CHAT -> Icons.Rounded.ChatBubble
        NotificationType.SYSTEM -> Icons.Rounded.ManageAccounts
    }

/** "Just now" / "5 minutes ago" / "Today, 9:00 AM" / "Yesterday, 4:12 PM" / "Sep 23, 9:00 AM", Philippine time, as on the website. */
internal fun formatNotificationTime(millis: Long, now: Long = System.currentTimeMillis()): String {
    val minutes = (now - millis) / 60_000
    if (minutes < 1) return "Just now"
    if (minutes < 60) return if (minutes == 1L) "1 minute ago" else "$minutes minutes ago"

    fun format(pattern: String) = SimpleDateFormat(pattern, Locale.US).apply { timeZone = ManilaTime.ZONE }.format(Date(millis))
    val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = ManilaTime.ZONE }
    val today = Calendar.getInstance(ManilaTime.ZONE).apply { timeInMillis = now }
    val yesterday = (today.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
    return when (day.format(Date(millis))) {
        day.format(today.time) -> "Today, ${format("h:mm a")}"
        day.format(yesterday.time) -> "Yesterday, ${format("h:mm a")}"
        else -> {
            val sameYear = Calendar.getInstance(ManilaTime.ZONE).apply { timeInMillis = millis }.get(Calendar.YEAR) == today.get(Calendar.YEAR)
            format(if (sameYear) "MMM d, h:mm a" else "MMM d, yyyy, h:mm a")
        }
    }
}
