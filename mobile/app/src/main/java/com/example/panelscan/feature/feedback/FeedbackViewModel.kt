package com.example.panelscan.feature.feedback

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.model.CustomerReview
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.data.repository.FeedbackRepository
import com.example.panelscan.data.repository.OrderRepository
import com.example.panelscan.data.repository.isReviewEligible
import kotlinx.coroutines.delay
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
    val selectedPanelId: String = "",
    val rating: Int = 5,
    val comment: String = "",
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null
)

class FeedbackViewModel(
    private val feedbackRepository: FeedbackRepository,
    private val orderRepository: OrderRepository,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedbackUiState())
    val uiState: StateFlow<FeedbackUiState> = _uiState.asStateFlow()

    val reviews: StateFlow<List<CustomerReview>> = feedbackRepository.reviews

    val eligibleOrders: StateFlow<List<Order>> = combine(
        orderRepository.orders,
        feedbackRepository.reviews
    ) { orders, reviews ->
        orders.filter { order ->
            order.isReviewEligible && order.items.any { item ->
                reviews.none { it.orderId == order.id && it.panelId == item.panelId }
            }
        }
    }.stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    fun setInitialOrder(orderId: String?) {
        if (!orderId.isNullOrBlank()) {
            val order = orderRepository.getOrderById(orderId)
            val firstPanel = order?.items?.firstOrNull { item ->
                !feedbackRepository.hasReviewedOrderProduct(orderId, item.panelId)
            }
            _uiState.update { it.copy(selectedOrderId = orderId, selectedPanelId = firstPanel?.panelId.orEmpty()) }
        }
    }

    fun onOrderSelected(orderId: String) {
        setInitialOrder(orderId)
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun onPanelSelected(orderId: String, panelId: String) {
        _uiState.update { it.copy(selectedOrderId = orderId, selectedPanelId = panelId, errorMessage = null) }
    }

    fun onRatingSelected(rating: Int) {
        _uiState.update { it.copy(rating = rating.coerceIn(1, 5)) }
    }

    fun onCommentChange(comment: String) {
        _uiState.update { it.copy(comment = comment, errorMessage = null) }
    }

    fun submitReview(onSuccess: () -> Unit) {
        val state = _uiState.value
        val eligible = eligibleOrders.value
        val targetOrder = if (state.selectedOrderId.isNotBlank()) {
            orderRepository.getOrderById(state.selectedOrderId)
        } else {
            eligible.firstOrNull()
        }

        if (targetOrder == null || !targetOrder.isReviewEligible) {
            _uiState.update { it.copy(errorMessage = "Only paid, completed orders can be reviewed.") }
            return
        }

        val panelId = state.selectedPanelId.ifBlank {
            targetOrder.items.firstOrNull { !feedbackRepository.hasReviewedOrderProduct(targetOrder.id, it.panelId) }?.panelId.orEmpty()
        }
        if (panelId.isBlank() || targetOrder.items.none { it.panelId == panelId }) {
            _uiState.update { it.copy(errorMessage = "Select a purchased panel to review.") }
            return
        }

        if (feedbackRepository.hasReviewedOrderProduct(targetOrder.id, panelId)) {
            _uiState.update { it.copy(errorMessage = "You have already reviewed this panel from this order.") }
            return
        }

        if (state.comment.trim().length < 5) {
            _uiState.update { it.copy(errorMessage = "Please share a brief comment (at least 5 characters).") }
            return
        }

        val session = sessionManager.sessionState.value
        val customerName = if (session is CustomerSessionState.LoggedIn) {
            session.user.fullName
        } else {
            targetOrder.customerName
        }

        _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }

        viewModelScope.launch {
            delay(350)
            feedbackRepository.submitReview(
                orderId = targetOrder.id,
                orderNumber = targetOrder.orderNumber,
                panelId = panelId,
                customerName = customerName,
                rating = state.rating,
                comment = state.comment.trim()
            )
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    comment = "",
                    selectedOrderId = "",
                    selectedPanelId = "",
                    successMessage = "Thank you! Your verified review has been published."
                )
            }
            onSuccess()
        }
    }
}
