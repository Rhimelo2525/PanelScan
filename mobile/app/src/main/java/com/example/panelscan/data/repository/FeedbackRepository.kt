package com.example.panelscan.data.repository

import com.example.panelscan.core.model.CustomerReview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

/**
 * Local frontend Feedback and Review Repository.
 * Manages verified customer ratings and service reviews locally with zero backend dependencies.
 */
class FeedbackRepository(private val orderRepository: OrderRepository) {

    private val _reviews = MutableStateFlow<List<CustomerReview>>(emptyList())
    val reviews: StateFlow<List<CustomerReview>> = _reviews.asStateFlow()

    fun submitReview(
        orderId: String,
        orderNumber: String,
        panelId: String,
        customerName: String,
        rating: Int,
        comment: String
    ): CustomerReview {
        val order = orderRepository.getOrderById(orderId)
        require(order != null && order.isReviewEligible && order.orderNumber == orderNumber &&
            order.items.any { it.panelId == panelId }) {
            "Only a purchased panel from a paid, completed order can be reviewed."
        }
        val existing = getReviewForOrderProduct(orderId, panelId)
        if (existing != null) {
            return existing
        }
        val clampedRating = rating.coerceIn(1, 5)
        val newReview = CustomerReview(
            id = "review-${UUID.randomUUID().toString().take(8)}",
            orderId = orderId,
            orderNumber = orderNumber,
            panelId = panelId,
            customerName = customerName.ifBlank { "Verified Customer" },
            rating = clampedRating,
            comment = comment.trim(),
            createdAt = System.currentTimeMillis()
        )
        _reviews.update { listOf(newReview) + it }
        return newReview
    }

    fun getReviewForOrder(orderId: String): CustomerReview? =
        _reviews.value.firstOrNull { it.orderId == orderId }

    fun getReviewForOrderProduct(orderId: String, panelId: String): CustomerReview? =
        _reviews.value.firstOrNull { it.orderId == orderId && it.panelId == panelId }

    fun reviewsForProduct(panelId: String): List<CustomerReview> =
        _reviews.value.filter { it.panelId == panelId }

    fun hasReviewedOrderProduct(orderId: String, panelId: String): Boolean =
        getReviewForOrderProduct(orderId, panelId) != null

    fun hasReviewed(orderId: String): Boolean =
        _reviews.value.any { it.orderId == orderId }
}
