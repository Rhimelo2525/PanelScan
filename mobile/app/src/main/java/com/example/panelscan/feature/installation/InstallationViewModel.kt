package com.example.panelscan.feature.installation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.model.InstallationBooking
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.util.ManilaTime
import com.example.panelscan.data.repository.InstallationRepository
import com.example.panelscan.data.repository.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class InstallationUiState(
    /** "yyyy-MM-dd", Philippine time. */
    val scheduledDate: String = "",
    val preferredTime: String = InstallationRepository.MORNING,
    val address: String = "",
    val notes: String = "",
    val selectedOrderId: String? = null,
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    /** Waiting for the customer to confirm the request. */
    val isConfirming: Boolean = false,
    /** The pending request the customer is about to cancel. */
    val cancellingBookingId: String? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null
)

/** Installation requests with the website's rules (a non-cancelled order is required). */
class InstallationViewModel(
    private val installationRepository: InstallationRepository,
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(InstallationUiState())
    val uiState: StateFlow<InstallationUiState> = _uiState.asStateFlow()

    val bookings: StateFlow<List<InstallationBooking>> = installationRepository.bookings
    val orders: StateFlow<List<Order>> = orderRepository.orders

    /** Reloads orders and requests when the screen opens; [orderId] prefills that order's address. */
    fun onOpened(orderId: String?) {
        _uiState.update { it.copy(isLoading = true, successMessage = null, errorMessage = null) }
        viewModelScope.launch {
            val error = orderRepository.refresh() ?: installationRepository.refresh()
            val order = orderId?.let { orderRepository.getOrderById(it) }
            _uiState.update { state ->
                state.copy(
                    isLoading = false,
                    errorMessage = error,
                    selectedOrderId = order?.id ?: state.selectedOrderId,
                    address = if (order != null && state.address.isBlank()) order.shippingAddress else state.address
                )
            }
        }
    }

    fun onDateSelected(year: Int, monthOfYear: Int, dayOfMonth: Int) {
        val formatted = String.format(java.util.Locale.US, "%04d-%02d-%02d", year, monthOfYear, dayOfMonth)
        _uiState.update { it.copy(scheduledDate = formatted, errorMessage = null) }
    }

    fun onTimeSelected(time: String) = _uiState.update { it.copy(preferredTime = time) }
    fun onAddressChange(value: String) = _uiState.update { it.copy(address = value.take(ADDRESS_MAX), errorMessage = null) }
    fun onNotesChange(value: String) = _uiState.update { it.copy(notes = value.take(NOTES_MAX), errorMessage = null) }

    /** Checks the form, then asks the customer to confirm. */
    fun requestSubmit() {
        validate()?.let { error ->
            _uiState.update { it.copy(errorMessage = error) }
            return
        }
        _uiState.update { it.copy(isConfirming = true, errorMessage = null) }
    }

    fun dismissConfirm() = _uiState.update { it.copy(isConfirming = false) }

    fun submitRequest(onSuccess: () -> Unit = {}) {
        _uiState.update { it.copy(isConfirming = false) }
        validate()?.let { error ->
            _uiState.update { it.copy(errorMessage = error) }
            return
        }
        val state = _uiState.value
        _uiState.update { it.copy(isSubmitting = true, errorMessage = null, successMessage = null) }
        viewModelScope.launch {
            installationRepository.requestInstallation(
                day = state.scheduledDate,
                time = InstallationRepository.startTime(state.preferredTime),
                address = state.address,
                notes = state.notes,
                orderId = orderToLink()?.id
            ).onSuccess {
                _uiState.update {
                    InstallationUiState(successMessage = "Installation request submitted. The team will confirm your schedule.")
                }
                onSuccess()
            }.onFailure { error ->
                _uiState.update { it.copy(isSubmitting = false, errorMessage = error.message ?: "Request not submitted.") }
            }
        }
    }

    fun askCancel(bookingId: String) = _uiState.update { it.copy(cancellingBookingId = bookingId) }

    fun dismissCancel() = _uiState.update { it.copy(cancellingBookingId = null) }

    fun cancelBooking() {
        val bookingId = _uiState.value.cancellingBookingId ?: return
        _uiState.update { it.copy(cancellingBookingId = null, errorMessage = null, successMessage = null) }
        viewModelScope.launch {
            installationRepository.cancelBooking(bookingId)
                .onSuccess { _uiState.update { it.copy(successMessage = "Installation request cancelled.") } }
                .onFailure { error -> _uiState.update { it.copy(errorMessage = error.message) } }
        }
    }

    /** The website's checks; null when the request can be sent. */
    internal fun validate(): String? {
        val state = _uiState.value
        return when {
            orderRepository.orders.value.none { it.status != OrderStatus.CANCELLED } ->
                "You need to complete an order before requesting installation."
            state.scheduledDate.isBlank() -> "Choose a preferred installation date."
            !ManilaTime.isFutureDay(state.scheduledDate) -> "Preferred installation date must be in the future."
            state.address.trim().length < ADDRESS_MIN -> "Enter the full installation address (at least $ADDRESS_MIN characters)."
            else -> null
        }
    }

    /** The chosen order if it has no installation yet, else the newest such order (as the backend would pick). */
    private fun orderToLink(): Order? {
        val bookedOrders = installationRepository.bookings.value.mapNotNull { it.orderId }.toSet()
        val open = orderRepository.orders.value.filter {
            it.status != OrderStatus.CANCELLED && !it.hasInstallation && it.id !in bookedOrders
        }
        return open.firstOrNull { it.id == _uiState.value.selectedOrderId } ?: open.firstOrNull()
    }

    companion object {
        const val ADDRESS_MIN = 10
        const val ADDRESS_MAX = 500
        const val NOTES_MAX = 1000
    }
}
