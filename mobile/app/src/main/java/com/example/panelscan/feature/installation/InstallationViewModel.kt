package com.example.panelscan.feature.installation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.model.InstallationBooking
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.data.repository.InstallationRepository
import com.example.panelscan.data.repository.OrderRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class InstallationUiState(
    val scheduledDate: String = "",
    val preferredTime: String = "Morning (9:00 AM - 12:00 PM)",
    val address: String = "",
    val notes: String = "",
    val selectedOrderId: String? = null,
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null
)

class InstallationViewModel(
    private val installationRepository: InstallationRepository,
    private val orderRepository: OrderRepository,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(InstallationUiState())
    val uiState: StateFlow<InstallationUiState> = _uiState.asStateFlow()

    val bookings: StateFlow<List<InstallationBooking>> = installationRepository.bookings
    val orders: StateFlow<List<Order>> = orderRepository.orders

    fun setInitialOrder(orderId: String?) {
        if (!orderId.isNullOrBlank()) {
            val order = orderRepository.getOrderById(orderId)
            if (order != null) {
                _uiState.update {
                    it.copy(
                        selectedOrderId = order.id,
                        address = order.shippingAddress
                    )
                }
            }
        }
    }

    fun onDateSelected(year: Int, monthOfYear: Int, dayOfMonth: Int) {
        val formatted = String.format(java.util.Locale.US, "%04d-%02d-%02d", year, monthOfYear, dayOfMonth)
        _uiState.update { it.copy(scheduledDate = formatted, errorMessage = null) }
    }

    fun onTimeSelected(time: String) = _uiState.update { it.copy(preferredTime = time) }
    fun onAddressChange(value: String) = _uiState.update { it.copy(address = value, errorMessage = null) }
    fun onNotesChange(value: String) = _uiState.update { it.copy(notes = value) }
    fun onOrderSelected(orderId: String?) {
        val order = orderRepository.getOrderById(orderId.orEmpty())
        _uiState.update {
            it.copy(
                selectedOrderId = orderId,
                address = order?.shippingAddress ?: it.address
            )
        }
    }

    fun submitRequest(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.scheduledDate.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Please choose a preferred installation date.") }
            return
        }
        if (state.address.trim().length < 8) {
            _uiState.update { it.copy(errorMessage = "Please enter the installation address (min 8 characters).") }
            return
        }

        val order = orderRepository.getOrderById(state.selectedOrderId.orEmpty())

        _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }

        viewModelScope.launch {
            delay(400)
            installationRepository.requestInstallation(
                orderId = order?.id,
                orderNumber = order?.orderNumber,
                scheduledDate = state.scheduledDate,
                preferredTime = state.preferredTime,
                address = state.address.trim(),
                notes = state.notes.trim().ifBlank { null }
            )
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    scheduledDate = "",
                    notes = "",
                    successMessage = "Installation request submitted! Our team will confirm your schedule."
                )
            }
            onSuccess()
        }
    }

    fun cancelBooking(bookingId: String) {
        installationRepository.cancelBooking(bookingId)
    }
}
