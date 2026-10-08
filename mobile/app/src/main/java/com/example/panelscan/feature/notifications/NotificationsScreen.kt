package com.example.panelscan.feature.notifications

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.data.local.CustomerNotification
import com.example.panelscan.data.repository.NotificationRepository
import java.text.SimpleDateFormat
import java.util.Date

@Composable
fun NotificationsScreen(
    repository: NotificationRepository,
    onBack: () -> Unit,
    onOpen: (CustomerNotification) -> Unit
) {
    val notifications by repository.notifications.collectAsState()
    val colors = PanelScan.colors
    val locale = LocalConfiguration.current.locales[0]
    ScreenScaffold {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(title = "Notifications", subtitle = "${notifications.count { !it.read }} unread", onBack = onBack)
            if (notifications.isEmpty()) {
                EmptyState(
                    icon = Icons.Rounded.Notifications,
                    title = "No notifications yet",
                    description = "Order, project and installation updates will appear here when their status changes.",
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = Spacing.gutter, vertical = Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    item {
                        if (notifications.any { !it.read }) {
                            TextButton(onClick = repository::markAllRead) { Text("Mark all as read") }
                        }
                    }
                    items(notifications, key = { it.id }) { notification ->
                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                repository.markRead(notification.id)
                                onOpen(notification)
                            },
                            contentPadding = PaddingValues(Spacing.md)
                        ) {
                            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(notification.title, style = PanelScan.type.cardTitle, color = colors.textPrimary)
                                    Text(notification.message, style = PanelScan.type.supporting, color = colors.textSecondary)
                                    notification.referenceId?.let { ref ->
                                        Text("Reference: $ref", style = PanelScan.type.label, color = colors.textTertiary)
                                    }
                                    Text(
                                        SimpleDateFormat("MMM d, yyyy · h:mm a", locale)
                                            .format(Date(notification.timestampMillis)),
                                        style = PanelScan.type.label,
                                        color = colors.textTertiary,
                                        modifier = Modifier.padding(top = 4.dp)
                                    )
                                }
                                if (!notification.read) {
                                    Text("New", style = PanelScan.type.label, color = colors.accent)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
