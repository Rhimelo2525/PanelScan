package com.example.panelscan.data.repository

import com.example.panelscan.core.model.CartItem
import com.example.panelscan.core.model.PVCPanel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

/** What the customer has ticked, and whether that is enough to check out. */
data class CartSelectionSummary(
    /** Distinct products ticked. */
    val selectedItems: Int,
    /** Total panels across the ticked products. */
    val selectedQuantity: Int,
    /** Materials subtotal of ticked products only. */
    val subtotal: Double,
    val allSelected: Boolean
) {
    val canCheckout: Boolean get() = selectedItems > 0
    val blockingMessage: String? get() = if (canCheckout) null else "Select at least one item to continue."

    companion object {
        fun of(items: List<CartItem>, selectedIds: Set<String>): CartSelectionSummary {
            val selected = items.filter { it.id in selectedIds }
            return CartSelectionSummary(
                selectedItems = selected.size,
                selectedQuantity = selected.sumOf { it.quantity },
                subtotal = selected.sumOf { it.lineTotal },
                allSelected = items.isNotEmpty() && selected.size == items.size
            )
        }
    }
}

/**
 * Local frontend Cart Repository.
 * Manages customer shopping bag state with selective checkout support.
 */
class CartRepository {

    private val _items = MutableStateFlow<List<CartItem>>(emptyList())
    val items: StateFlow<List<CartItem>> = _items.asStateFlow()

    private val _selectedItemIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedItemIds: StateFlow<Set<String>> = _selectedItemIds.asStateFlow()

    fun addToCart(panel: PVCPanel, quantity: Int = 1) {
        if (quantity <= 0) return
        var targetItemId = ""
        _items.update { currentList ->
            val existingIndex = currentList.indexOfFirst { it.panel.id == panel.id }
            if (existingIndex >= 0) {
                targetItemId = currentList[existingIndex].id
                currentList.mapIndexed { index, item ->
                    if (index == existingIndex) {
                        item.copy(quantity = item.quantity + quantity)
                    } else item
                }
            } else {
                val newId = "cart-item-${UUID.randomUUID().toString().take(8)}"
                targetItemId = newId
                currentList + CartItem(
                    id = newId,
                    panel = panel,
                    quantity = quantity
                )
            }
        }
        // Auto-select the newly added / incremented item
        if (targetItemId.isNotEmpty()) {
            _selectedItemIds.update { it + targetItemId }
        }
    }

    fun updateQuantity(itemId: String, newQuantity: Int) {
        if (newQuantity <= 0) {
            removeFromCart(itemId)
            return
        }
        _items.update { currentList ->
            currentList.map { item ->
                if (item.id == itemId) item.copy(quantity = newQuantity) else item
            }
        }
    }

    fun removeFromCart(itemId: String) {
        _items.update { currentList ->
            currentList.filterNot { it.id == itemId }
        }
        _selectedItemIds.update { it - itemId }
    }

    fun toggleSelection(itemId: String) {
        _selectedItemIds.update { current ->
            if (current.contains(itemId)) current - itemId else current + itemId
        }
    }

    fun selectAll(select: Boolean) {
        if (select) {
            _selectedItemIds.value = _items.value.map { it.id }.toSet()
        } else {
            _selectedItemIds.value = emptySet()
        }
    }

    fun clearSelection() {
        _selectedItemIds.value = emptySet()
    }

    fun selectionSummary(): CartSelectionSummary =
        CartSelectionSummary.of(_items.value, _selectedItemIds.value)

    val selectedItems: List<CartItem>
        get() {
            val selected = _selectedItemIds.value
            return _items.value.filter { it.id in selected }
        }

    val selectedSubtotal: Double
        get() = selectedItems.sumOf { it.lineTotal }

    val selectedItemCount: Int
        get() = selectedItems.sumOf { it.quantity }

    val isAllSelected: Boolean
        get() {
            val currentList = _items.value
            return currentList.isNotEmpty() && _selectedItemIds.value.containsAll(currentList.map { it.id })
        }

    fun removeSelectedItems() {
        val toRemove = _selectedItemIds.value
        _items.update { currentList ->
            currentList.filterNot { it.id in toRemove }
        }
        _selectedItemIds.value = emptySet()
    }

    fun clearCart() {
        _items.value = emptyList()
        _selectedItemIds.value = emptySet()
    }

    val subtotal: Double
        get() = _items.value.sumOf { it.lineTotal }

    val itemCount: Int
        get() = _items.value.sumOf { it.quantity }
}
