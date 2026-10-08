package com.example.panelscan.feature.feedback

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.model.CustomerReview
import com.example.panelscan.core.model.Order
import com.example.panelscan.data.repository.FeedbackRepository
import com.example.panelscan.data.repository.OrderRepository
import com.example.panelscan.data.repository.isReviewEligible
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FeedbackUiState(
    val selectedOrderId: String = "",
    /** 0 until the customer picks a star, as on the website. */
    val rating: Int = 0,
    val comment: String = "",
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    /** Waiting for the customer to confirm ("can't be edited afterwards"). */
    val isConfirming: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null
)

/** One rating per delivered order with an optional comment, the website's rules. */
class FeedbackViewModel(
    private val feedbackRepository: FeedbackRepository,
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedbackUiState())
    val uiState: StateFlow<FeedbackUiState> = _uiState.asStateFlow()

    val reviews: StateFlow<List<CustomerReview>> = feedbackRepository.reviews

    /** Delivered orders that have no feedback yet. */
    val eligibleOrders: StateFlow<List<Order>> = combine(
        orderRepository.orders,
        feedbackRepository.reviews
    ) { orders, reviews ->
        orders.filter { order -> order.isReviewEligible && reviews.none { it.orderId == order.id } }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Reloads orders and feedback when the screen opens, then preselects [orderId] if it can be rated. */
    fun onOpened(orderId: String?) {
        _uiState.update { it.copy(isLoading = true, successMessage = null, errorMessage = null) }
        viewModelScope.launch {
            val error = orderRepository.refresh() ?: feedbackRepository.refresh()
            val target = orderId?.takeIf { id -> eligibleOrders.value.any { it.id == id } }
                ?: _uiState.value.selectedOrderId.takeIf { id -> eligibleOrders.value.any { it.id == id } }
                ?: eligibleOrders.value.firstOrNull()?.id.orEmpty()
            _uiState.update { it.copy(isLoading = false, selectedOrderId = target, errorMessage = error) }
        }
    }

    fun onOrderSelected(orderId: String) {
        _uiState.update { it.copy(selectedOrderId = orderId, errorMessage = null) }
    }

    fun onRatingSelected(rating: Int) {
        _uiState.update { it.copy(rating = rating.coerceIn(1, 5), errorMessage = null) }
    }

    fun onCommentChange(comment: String) {
        _uiState.update { it.copy(comment = comment.take(MAX_COMMENT), errorMessage = null) }
    }

    /** Checks the form, then asks for confirmation (feedback can't be edited afterwards). */
    fun requestSubmit() {
        validate()?.let { error ->
            _uiState.update { it.copy(errorMessage = error) }
            return
        }
        _uiState.update { it.copy(isConfirming = true, errorMessage = null) }
    }

    fun dismissConfirm() {
        _uiState.update { it.copy(isConfirming = false) }
    }

    fun submitReview(onSuccess: () -> Unit = {}) {
        val state = _uiState.value
        _uiState.update { it.copy(isConfirming = false) }
        validate()?.let { error ->
            _uiState.update { it.copy(errorMessage = error) }
            return
        }
        _uiState.update { it.copy(isSubmitting = true, errorMessage = null, successMessage = null) }
        viewModelScope.launch {
            feedbackRepository.submit(state.selectedOrderId, state.rating, state.comment)
                .onSuccess {
                    _uiState.update {
                        FeedbackUiState(
                            selectedOrderId = eligibleOrders.value.firstOrNull { it.id != state.selectedOrderId }?.id.orEmpty(),
                            successMessage = "Thank you — your feedback was submitted."
                        )
                    }
                    onSuccess()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isSubmitting = false, errorMessage = error.message ?: "Feedback could not be submitted.") }
                }
        }
    }

    /** The website's checks; null when the feedback can be sent. */
    internal fun validate(): String? {
        val state = _uiState.value
        val order = orderRepository.getOrderById(state.selectedOrderId)
        return when {
            order == null || eligibleOrders.value.none { it.id == order.id } -> "Choose a delivered order to rate."
            state.rating !in 1..5 -> "Please select a rating between 1 and 5 stars."
            state.comment.trim().let { it.isNotEmpty() && it.length < MIN_COMMENT } ->
                "Comment must be at least $MIN_COMMENT characters if provided."
            else -> null
        }
    }

    companion object {
        const val MIN_COMMENT = 3
        const val MAX_COMMENT = 1000
    }
}
