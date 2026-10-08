package com.example.panelscan.data.repository

import com.example.panelscan.core.model.CustomerReview
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.Serializable

/**
 * Customer feedback on the backend (/api/feedback), the same as the website:
 * one rating per delivered order, with an optional comment, which can't be
 * edited afterwards. Product pages show the feedback left on orders that
 * contained that product.
 */
class FeedbackRepository(private val api: ApiClient? = null) {

    private val _reviews = MutableStateFlow<List<CustomerReview>>(emptyList())

    /** The signed-in customer's own feedback, newest first. */
    val reviews: StateFlow<List<CustomerReview>> = _reviews.asStateFlow()

    /** Loads the customer's feedback; null on success, else why it failed. */
    suspend fun refresh(): String? {
        val client = api ?: return null
        return try {
            val result: FeedbackPage = client.get("/feedback?limit=$PAGE_SIZE", authenticated = true)
            _reviews.value = result.feedbacks.map { it.toReview(fullName = true) }
            null
        } catch (error: ApiException) {
            error.message
        }
    }

    /** Rates a delivered order. The comment is optional; blank is sent as none. */
    suspend fun submit(orderId: String, rating: Int, comment: String): Result<CustomerReview> {
        val client = api ?: return Result.failure(IllegalStateException("Feedback is not available."))
        return try {
            val body = CreateFeedbackRequest(orderId, rating, comment.trim().ifBlank { null })
            val result: FeedbackResponse = client.post("/feedback", body, authenticated = true)
            val review = result.feedback.toReview(fullName = true)
            _reviews.update { listOf(review) + it.filter { r -> r.orderId != orderId } }
            Result.success(review)
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    /** Feedback from orders that included this product (signed-in customers only, as on the backend). */
    suspend fun productReviews(productId: String): Result<List<CustomerReview>> {
        val client = api ?: return Result.success(emptyList())
        return try {
            val result: FeedbackPage = client.get("/feedback/product/$productId?limit=$PAGE_SIZE", authenticated = true)
            Result.success(result.feedbacks.map { it.toReview(fullName = false) })
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    fun getReviewForOrder(orderId: String): CustomerReview? =
        _reviews.value.firstOrNull { it.orderId == orderId }

    fun hasReviewed(orderId: String): Boolean = getReviewForOrder(orderId) != null

    /** After logging out: the feedback belongs to the account. */
    fun onSignedOut() {
        _reviews.value = emptyList()
    }

    /** Other customers are shown as "Juan D."; the customer's own feedback with their full name. */
    private fun ApiFeedback.toReview(fullName: Boolean): CustomerReview {
        val first = customer?.firstName?.trim().orEmpty()
        val last = customer?.lastName?.trim().orEmpty()
        val name = when {
            fullName -> "$first $last".trim()
            last.isNotEmpty() -> "$first ${last.first()}.".trim()
            else -> first
        }
        return CustomerReview(
            id = id,
            orderId = orderId.orEmpty(),
            orderNumber = order?.orderNumber.orEmpty(),
            customerName = name.ifBlank { "Verified customer" },
            rating = rating,
            comment = comment?.takeIf { it.isNotBlank() },
            createdAt = parseIsoMillis(createdAt) ?: System.currentTimeMillis()
        )
    }

    @Serializable
    private data class ApiFeedbackCustomer(val firstName: String = "", val lastName: String = "")

    @Serializable
    private data class ApiFeedbackOrder(val orderNumber: String = "")

    @Serializable
    private data class ApiFeedback(
        val id: String,
        val orderId: String? = null,
        val rating: Int,
        val comment: String? = null,
        val createdAt: String,
        val customer: ApiFeedbackCustomer? = null,
        val order: ApiFeedbackOrder? = null
    )

    @Serializable
    private data class FeedbackPage(val feedbacks: List<ApiFeedback> = emptyList())

    @Serializable
    private data class FeedbackResponse(val feedback: ApiFeedback)

    @Serializable
    private data class CreateFeedbackRequest(val orderId: String, val rating: Int, val comment: String?)

    companion object {
        private const val PAGE_SIZE = 50
    }
}
