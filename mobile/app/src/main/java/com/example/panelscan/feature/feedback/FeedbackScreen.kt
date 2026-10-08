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
import androidx.compose.material3.Icon
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
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val state by viewModel.uiState.collectAsState()
    val reviews by viewModel.reviews.collectAsState()
    val eligibleOrders by viewModel.eligibleOrders.collectAsState()
    val colors = PanelScan.colors

    LaunchedEffect(eligibleOrders, state.selectedOrderId, state.selectedPanelId) {
        if (state.selectedPanelId.isBlank()) {
            eligibleOrders.firstNotNullOfOrNull { order ->
                order.items.firstOrNull { item ->
                    reviews.none { it.orderId == order.id && it.panelId == item.panelId }
                }?.let { order.id to it.panelId }
            }?.let { (orderId, panelId) -> viewModel.onPanelSelected(orderId, panelId) }
        }
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Customer Feedback",
                subtitle = "Ratings and verified reviews",
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
                                text = "${reviews.size} verified reviews",
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
                                text = "Customer satisfaction with our wall & ceiling cladding products and on-site installations.",
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
                                    text = "Rate Your Delivered Order",
                                    style = PanelScan.type.sectionTitle,
                                    color = colors.textPrimary
                                )
                            }

                            Text("Choose a purchased panel", style = PanelScan.type.label, color = colors.textSecondary)
                            eligibleOrders.forEach { order ->
                                order.items.distinctBy { it.panelId }.filter { item ->
                                    reviews.none { it.orderId == order.id && it.panelId == item.panelId }
                                }.forEach { item ->
                                    val selected = state.selectedOrderId == order.id && state.selectedPanelId == item.panelId
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(PanelScan.shapes.control)
                                            .background(if (selected) colors.accentSoft else colors.surfaceMuted)
                                            .clickable { viewModel.onPanelSelected(order.id, item.panelId) }
                                            .padding(Spacing.sm),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                                    ) {
                                        Text(
                                            "${item.panelName} · #${order.orderNumber}",
                                            style = PanelScan.type.supporting,
                                            color = colors.textPrimary,
                                            modifier = Modifier.weight(1f)
                                        )
                                        if (selected) Icon(Icons.Rounded.CheckCircle, contentDescription = "Selected", tint = colors.accent)
                                    }
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
                                    Text(
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
                                label = "Review Comments",
                                placeholder = "How was the panel quality, room fit, and service delivery?",
                                singleLine = false,
                                maxLines = 4
                            )

                            PrimaryButton(
                                text = if (state.isSubmitting) "Submitting…" else "Submit Review",
                                icon = Icons.Rounded.CheckCircle,
                                onClick = { viewModel.submitReview {} },
                                enabled = !state.isSubmitting,
                                fillMaxWidth = true
                            )
                        }
                    }
                }

                // Reviews List
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(
                        text = "Verified Customer Reviews",
                        style = PanelScan.type.sectionTitle,
                        color = colors.textPrimary
                    )

                    if (reviews.isEmpty()) {
                        Text(
                            text = "No customer reviews yet. Reviews appear after a paid order is completed.",
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

            Text(
                text = review.comment,
                style = PanelScan.type.body,
                color = colors.textSecondary
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Verified Purchase · #${review.orderNumber}",
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
