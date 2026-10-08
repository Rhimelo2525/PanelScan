package com.example.panelscan.feature.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.model.CartItem
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.util.ManilaTime
import com.example.panelscan.data.repository.AddressRepository
import com.example.panelscan.data.repository.CartRepository
import com.example.panelscan.data.repository.OrderRepository
import com.example.panelscan.data.repository.PlaceOrderInput
import com.example.panelscan.data.repository.SavedAddress
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale

data class CheckoutUiState(
    val selectedAddressId: String? = null,
    val isLoadingAddresses: Boolean = false,
    val addressesError: String? = null,
    val notes: String = "",
    val wantsInstallation: Boolean = false,
    /** yyyy-MM-dd, picked from a calendar (a future day). */
    val installationDate: String = "",
    val installationSameAsShipping: Boolean = true,
    val installationAddress: String = "",
    val installationNotes: String = "",
    val isPlacing: Boolean = false,
    val errorMessage: String? = null,
    val installationError: String? = null
)

/**
 * Checkout, as on the website: choose a saved delivery address, optionally ask
 * for installation, and place the order. It then waits for a moderator's
 * approval and shipping-fee quote, after which products + shipping are paid in
 * one GCash payment from the order's page. No payment is taken here.
 */
class CheckoutViewModel(
    private val cartRepository: CartRepository,
    private val orderRepository: OrderRepository,
    private val addressRepository: AddressRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckoutUiState())
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    val addresses: StateFlow<List<SavedAddress>> = addressRepository.addresses

    /** "Buy now" from a product page: checks out that one product, not the cart. */
    private val directItem = MutableStateFlow<CartItem?>(null)

    val checkoutItemsFlow: StateFlow<List<CartItem>> =
        combine(cartRepository.items, cartRepository.selectedItemIds, directItem) { items, selected, direct ->
            direct?.let { listOf(it) } ?: items.filter { it.id in selected }
        }.stateIn(viewModelScope, SharingStarted.Eagerly, cartRepository.selectedItems)

    fun beginDirectCheckout(panel: PVCPanel, quantity: Int) {
        directItem.value = CartItem(id = panel.id, panel = panel, quantity = quantity.coerceAtLeast(1))
    }

    fun clearDirectCheckout() {
        directItem.value = null
    }

    /** Loads the saved addresses and pre-selects the default one. */
    fun onCheckoutOpened() {
        _uiState.update { it.copy(isLoadingAddresses = true, addressesError = null, errorMessage = null) }
        viewModelScope.launch {
            val error = addressRepository.refresh()
            val list = addressRepository.addresses.value
            _uiState.update { state ->
                state.copy(
                    isLoadingAddresses = false,
                    addressesError = error,
                    selectedAddressId = state.selectedAddressId?.takeIf { id -> list.any { it.id == id } }
                        ?: list.firstOrNull { it.isDefault }?.id
                        ?: list.firstOrNull()?.id
                )
            }
        }
    }

    fun selectAddress(addressId: String) = _uiState.update { it.copy(selectedAddressId = addressId, errorMessage = null) }

    fun onNotesChange(value: String) = _uiState.update { it.copy(notes = value.take(NOTES_MAX)) }

    fun onToggleInstallation(wanted: Boolean) = _uiState.update { it.copy(wantsInstallation = wanted, installationError = null) }

    fun onInstallationDateSelected(year: Int, month: Int, day: Int) = _uiState.update {
        it.copy(installationDate = String.format(Locale.US, "%04d-%02d-%02d", year, month, day), installationError = null)
    }

    fun onInstallationSameAsShippingChange(same: Boolean) = _uiState.update { it.copy(installationSameAsShipping = same, installationError = null) }

    fun onInstallationAddressChange(value: String) = _uiState.update { it.copy(installationAddress = value.take(500), installationError = null) }

    fun onInstallationNotesChange(value: String) = _uiState.update { it.copy(installationNotes = value.take(NOTES_MAX)) }

    /** The checks the backend applies, so the customer hears about them before placing the order. */
    fun validate(): String? {
        val state = _uiState.value
        val address = addresses.value.firstOrNull { it.id == state.selectedAddressId }
        return when {
            checkoutItemsFlow.value.isEmpty() -> "Select at least one item to check out."
            address == null -> "Choose a saved delivery address, or add one."
            state.wantsInstallation && state.installationDate.isBlank() -> "Choose a preferred installation date."
            state.wantsInstallation && !ManilaTime.isFutureDay(state.installationDate) -> "Preferred installation date must be in the future."
            state.wantsInstallation && !state.installationSameAsShipping && state.installationAddress.trim().length < 10 ->
                "Installation address must be at least 10 characters."
            else -> null
        }
    }

    fun placeOrder(onPlaced: (Order) -> Unit) {
        val state = _uiState.value
        if (state.isPlacing) return
        validate()?.let { problem ->
            _uiState.update { it.copy(errorMessage = problem) }
            return
        }
        val address = addresses.value.first { it.id == state.selectedAddressId }
        val items = checkoutItemsFlow.value
        val direct = directItem.value

        _uiState.update { it.copy(isPlacing = true, errorMessage = null) }
        viewModelScope.launch {
            val result = orderRepository.placeOrder(
                PlaceOrderInput(
                    addressId = address.id,
                    shippingAddress = address.formattedAddress,
                    notes = state.notes,
                    installationDate = if (state.wantsInstallation) ManilaTime.toUtcIso(state.installationDate) else null,
                    installationAddress = if (state.installationSameAsShipping) address.formattedAddress else state.installationAddress.trim(),
                    installationNotes = state.installationNotes,
                    selectedProductIds = if (direct == null) items.map { it.panel.id } else null,
                    directProductId = direct?.panel?.id,
                    directQuantity = direct?.quantity
                )
            )
            result.onSuccess { order ->
                // The backend took the ordered items out of the cart; show the cart it now has.
                if (direct == null) cartRepository.refresh() else directItem.value = null
                _uiState.value = CheckoutUiState(selectedAddressId = address.id)
                onPlaced(order)
            }.onFailure { error ->
                _uiState.update { it.copy(isPlacing = false, errorMessage = error.message) }
            }
        }
    }

    private companion object {
        const val NOTES_MAX = 1000
    }
}
