package com.example.panelscan.feature.cart

import androidx.lifecycle.ViewModel
import com.example.panelscan.core.model.CartItem
import com.example.panelscan.data.repository.CartRepository
import kotlinx.coroutines.flow.StateFlow

class CartViewModel(
    private val cartRepository: CartRepository
) : ViewModel() {

    val items: StateFlow<List<CartItem>> = cartRepository.items
    val selectedItemIds: StateFlow<Set<String>> = cartRepository.selectedItemIds

    val subtotal: Double
        get() = cartRepository.selectedSubtotal

    val itemCount: Int
        get() = cartRepository.selectedItemCount

    val isAllSelected: Boolean
        get() = cartRepository.isAllSelected

    fun toggleSelection(itemId: String) {
        cartRepository.toggleSelection(itemId)
    }

    fun selectAll(select: Boolean) {
        cartRepository.selectAll(select)
    }

    fun clearSelection() {
        cartRepository.clearSelection()
    }

    fun updateQuantity(itemId: String, quantity: Int) {
        cartRepository.updateQuantity(itemId, quantity)
    }

    fun removeItem(itemId: String) {
        cartRepository.removeFromCart(itemId)
    }

    fun clearCart() {
        cartRepository.clearCart()
    }
}
