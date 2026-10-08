package com.example.panelscan.feature.feedback

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.RateReview
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.CustomerReview
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.formatDate
import kotlin.math.roundToInt

@Composable
fun FeedbackScreen(
    viewModel: FeedbackViewModel,
    onBack: () -> Unit,
    /** Preselected from an order's page. */
    initialOrderId: String? = null,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val state by viewModel.uiState.collectAsState()
    val reviews by viewModel.reviews.collectAsState()
    val eligibleOrders by viewModel.eligibleOrders.collectAsState()
    val colors = PanelScan.colors

    LaunchedEffect(initialOrderId) { viewModel.onOpened(initialOrderId) }

    if (state.isConfirming) {
        AlertDialog(
            onDismissRequest = viewModel::dismissConfirm,
            title = { Text("Submit your feedback?", style = PanelScan.type.sectionTitle) },
            text = { Text("Feedback can be submitted once per order and cannot be edited afterwards.", style = PanelScan.type.body) },
            confirmButton = { TextButton(onClick = { viewModel.submitReview() }) { Text("Submit feedback") } },
            dismissButton = { TextButton(onClick = viewModel::dismissConfirm) { Text("Cancel") } },
            containerColor = colors.surfaceElevated
        )
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Feedback",
                subtitle = "Rate your delivered orders",
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
                // Header summary
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = if (reviews.isEmpty()) "—" else String.format("%.1f", reviews.map { it.rating }.average()),
                                style = PanelScan.type.display,
                                color = colors.textPrimary
                            )
                            if (reviews.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                val averageRating = reviews.map { it.rating }.average()
                                val filledStars = averageRating.roundToInt()
                                repeat(5) { index ->
                                    Icon(
                                        imageVector = if (index < filledStars) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                        contentDescription = null,
                                        tint = if (index < filledStars) colors.accent else colors.textTertiary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                            Text(
                                text = if (reviews.size == 1) "1 review given" else "${reviews.size} reviews given",
                                style = PanelScan.type.label,
                                color = colors.textTertiary,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Disenyo Interior Solution",
                                style = PanelScan.type.cardTitle,
                                color = colors.textPrimary
                            )
                            Text(
                                text = "Rate a completed order and tell the team how the panels and service worked out. Feedback can be given once per delivered order.",
                                style = PanelScan.type.supporting,
                                color = colors.textSecondary
                            )
                        }
                    }
                }

                state.successMessage?.let { msg ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .background(colors.accentSoft)
                            .padding(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(text = msg, style = PanelScan.type.supporting, color = colors.textPrimary)
                    }
                }

                state.errorMessage?.let { err ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .background(colors.destructiveSoft)
                            .padding(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ErrorOutline,
                            contentDescription = null,
                            tint = colors.destructive,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(text = err, style = PanelScan.type.supporting, color = colors.destructive)
                    }
                }

                // Leave a review card if eligible orders exist
                if (eligibleOrders.isNotEmpty()) {
                    PanelCard(
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(Spacing.md)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.RateReview,
                                    contentDescription = null,
                                    tint = colors.accent,
                                    modifier = Modifier.size(20.dp)
                                )
                                Text(
                                    text = "Leave feedback",
                                    style = PanelScan.type.sectionTitle,
                                    color = colors.textPrimary
                                )
                            }

                            Text("Delivered order", style = PanelScan.type.label, color = colors.textSecondary)
                            eligibleOrders.forEach { order ->
                                val selected = state.selectedOrderId == order.id
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(PanelScan.shapes.control)
                                        .background(if (selected) colors.accentSoft else colors.surfaceMuted)
                                        .clickable { viewModel.onOrderSelected(order.id) }
                                        .padding(Spacing.sm),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("Order #${order.orderNumber}", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                                        Text(
                                            order.items.joinToString(", ") { it.panelName },
                                            style = PanelScan.type.supporting,
                                            color = colors.textSecondary,
                                            maxLines = 2
                                        )
                                    }
                                    if (selected) Icon(Icons.Rounded.CheckCircle, contentDescription = "Selected", tint = colors.accent)
                                }
                            }

                            // Star rating selector
                            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                                Text(
                                    text = "Your Rating",
                                    style = PanelScan.type.label,
                                    color = colors.textTertiary
                                )
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    (1..5).forEach { starIndex ->
                                        Icon(
                                            imageVector = if (starIndex <= state.rating) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                            contentDescription = "$starIndex Stars",
                                            tint = if (starIndex <= state.rating) colors.accent else colors.textTertiary,
                                            modifier = Modifier
                                                .size(36.dp)
                                                .clickable { viewModel.onRatingSelected(starIndex) }
                                                .padding(2.dp)
                                        )
                                    }
                                    if (state.rating > 0) Text(
                                        text = "${state.rating} / 5",
                                        style = PanelScan.type.cardTitle,
                                        color = colors.accent,
                                        modifier = Modifier.padding(start = Spacing.xs)
                                    )
                                }
                            }

                            // Comment field
                            PanelScanTextField(
                                value = state.comment,
                                onValueChange = viewModel::onCommentChange,
                                label = "Comments (optional)",
                                placeholder = "How were the panels, the delivery, and the service?",
                                singleLine = false,
                                maxLines = 4
                            )

                            PrimaryButton(
                                text = if (state.isSubmitting) "Submitting…" else "Submit feedback",
                                icon = Icons.Rounded.CheckCircle,
                                onClick = viewModel::requestSubmit,
                                enabled = !state.isSubmitting,
                                fillMaxWidth = true
                            )
                        }
                    }
                }

                if (eligibleOrders.isEmpty()) {
                    PanelCard(
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(Spacing.md)
                    ) {
                        Text(
                            text = if (state.isLoading) "Loading your orders…" else "No orders are awaiting feedback",
                            style = PanelScan.type.cardTitle,
                            color = colors.textPrimary
                        )
                        if (!state.isLoading) Text(
                            text = "Feedback can be left once an order has been delivered. Orders you have already reviewed are listed below.",
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                    }
                }

                // Reviews List
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(
                        text = "Your past feedback",
                        style = PanelScan.type.sectionTitle,
                        color = colors.textPrimary
                    )

                    if (reviews.isEmpty()) {
                        Text(
                            text = "You haven't left any feedback yet.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )
                    } else reviews.forEach { review -> ReviewItemCard(review = review) }
                }
            }
        }
    }
}

@Composable
private fun ReviewItemCard(review: CustomerReview) {
    val colors = PanelScan.colors
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
                Text(
                    text = review.customerName,
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary
                )
                Row(horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                    repeat(5) { index ->
                        Icon(
                            imageVector = if (index < review.rating) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                            contentDescription = null,
                            tint = if (index < review.rating) colors.accent else colors.textTertiary,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            review.comment?.let {
                Text(
                    text = it,
                    style = PanelScan.type.body,
                    color = colors.textSecondary
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Order #${review.orderNumber}",
                    style = PanelScan.type.label,
                    color = colors.textTertiary
                )
                Text(
                    text = formatDate(review.createdAt),
                    style = PanelScan.type.label,
                    color = colors.textTertiary
                )
            }
        }
    }
}
