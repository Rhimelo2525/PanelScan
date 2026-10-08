package com.example.panelscan.data.repository

import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.model.CartItem
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import com.example.panelscan.core.session.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable

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
 * The customer's cart. Signed in, it is the same cart as on the website
 * (/api/cart): every change shows at once and is then saved to the backend,
 * whose answer (e.g. "Only 3 items are available.") puts the cart back in step
 * and is announced on [messages]. Signed out, or without [api] (unit tests),
 * the cart lives on this device; logging in moves it into the account.
 *
 * A cart item's id is its product id, which is how the backend addresses it.
 * Which items are ticked for checkout is only kept on this device.
 */
class CartRepository(
    private val api: ApiClient? = null,
    private val sessionManager: SessionManager? = null,
    private val scope: CoroutineScope? = null
) {

    private val _items = MutableStateFlow<List<CartItem>>(emptyList())
    val items: StateFlow<List<CartItem>> = _items.asStateFlow()

    private val _selectedItemIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedItemIds: StateFlow<Set<String>> = _selectedItemIds.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    /** Why the backend refused a change, to show the customer. */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    /** Keeps backend calls in the order the customer made the changes. */
    private val syncLock = Mutex()

    private val isSynced: Boolean get() = api != null && scope != null && sessionManager?.isLoggedIn() == true

    fun addToCart(panel: PVCPanel, quantity: Int = 1) {
        if (quantity <= 0) return
        _items.update { currentList ->
            if (currentList.any { it.id == panel.id }) {
                currentList.map { item -> if (item.id == panel.id) item.copy(quantity = item.quantity + quantity) else item }
            } else {
                currentList + CartItem(id = panel.id, panel = panel, quantity = quantity)
            }
        }
        // Auto-select the newly added / incremented item
        _selectedItemIds.update { it + panel.id }
        sync(announceErrors = true) { postCart("/cart/items", AddItemRequest(panel.id, quantity)) }
    }

    fun updateQuantity(itemId: String, newQuantity: Int) {
        if (newQuantity <= 0) {
            removeFromCart(itemId)
            return
        }
        _items.update { currentList ->
            currentList.map { item -> if (item.id == itemId) item.copy(quantity = newQuantity) else item }
        }
        sync(announceErrors = true) { patchCart("/cart/items/$itemId", QuantityRequest(newQuantity)) }
    }

    fun removeFromCart(itemId: String) {
        _items.update { currentList -> currentList.filterNot { it.id == itemId } }
        _selectedItemIds.update { it - itemId }
        sync { send("DELETE", "/cart/items/$itemId", authenticated = true) }
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
        if (toRemove.isEmpty()) return
        _items.update { currentList -> currentList.filterNot { it.id in toRemove } }
        _selectedItemIds.value = emptySet()
        sync { postCart("/cart/remove-items", RemoveItemsRequest(toRemove.toList())) }
    }

    fun clearCart() {
        _items.value = emptyList()
        _selectedItemIds.value = emptySet()
        sync { send("DELETE", "/cart", authenticated = true) }
    }

    val subtotal: Double
        get() = _items.value.sumOf { it.lineTotal }

    val itemCount: Int
        get() = _items.value.sumOf { it.quantity }

    /**
     * After logging in: moves anything added while signed out into the
     * account's cart, then shows the account's cart (the same as on the website).
     */
    suspend fun onSignedIn() {
        val client = api ?: return
        syncLock.withLock {
            val offline = _items.value
            try {
                for (item in offline) {
                    runCatching { client.post<AddItemRequest, CartResponse>("/cart/items", AddItemRequest(item.id, item.quantity), authenticated = true) }
                }
                apply(client.get<CartResponse>("/cart", authenticated = true).cart, firstLoad = true)
            } catch (error: ApiException) {
                // Offline: keep what is on screen; the next change or login tries again.
            }
        }
    }

    /** After logging out: the account's cart stays in the account, not on this device. */
    fun onSignedOut() {
        _items.value = emptyList()
        _selectedItemIds.value = emptySet()
    }

    /** Re-reads the account's cart, e.g. after an order took items out of it. */
    suspend fun refresh() {
        val client = api ?: return
        if (sessionManager?.isLoggedIn() != true) return
        syncLock.withLock {
            runCatching { apply(client.get<CartResponse>("/cart", authenticated = true).cart, firstLoad = false) }
        }
    }

    /**
     * Saves a change to the backend and shows the cart it answers with. When
     * refused, the backend's cart is shown instead (undoing the change), and
     * [announceErrors] says whether the customer is told why.
     */
    private fun sync(announceErrors: Boolean = false, call: suspend ApiClient.() -> Any) {
        if (!isSynced) return
        val client = api!!
        scope!!.launch {
            syncLock.withLock {
                try {
                    val result = client.call()
                    if (result is CartResponse) apply(result.cart, firstLoad = false)
                } catch (error: ApiException) {
                    if (announceErrors) _messages.tryEmit(error.message.orEmpty())
                    runCatching { apply(client.get<CartResponse>("/cart", authenticated = true).cart, firstLoad = false) }
                }
            }
        }
    }

    private suspend inline fun <reified B> ApiClient.postCart(path: String, body: B): CartResponse =
        post(path, body, authenticated = true)

    private suspend inline fun <reified B> ApiClient.patchCart(path: String, body: B): CartResponse =
        patch(path, body, authenticated = true)

    private fun apply(cart: ApiCart, firstLoad: Boolean) {
        val previousIds = _items.value.map { it.id }.toSet()
        val loaded = cart.items.map { item ->
            CartItem(id = item.productId, panel = item.product.toPanel(), quantity = item.quantity)
        }
        _items.value = loaded
        val loadedIds = loaded.map { it.id }.toSet()
        _selectedItemIds.update { selected ->
            // Keep the ticks that still apply; on the first load, everything starts ticked.
            if (firstLoad) loadedIds else (selected intersect loadedIds) + (loadedIds - previousIds)
        }
    }

    /** The catalogue's full panel (sizes, photo) when loaded, else what the cart itself says. */
    private fun ApiCartProduct.toPanel(): PVCPanel {
        val fromCatalogue = ProductCatalog.findById(id)
        val cartPrice = price?.toDoubleOrNull()
        return fromCatalogue?.copy(pricePerUnit = cartPrice ?: fromCatalogue.pricePerUnit)
            ?: PVCPanel(
                id = id,
                name = name,
                category = "",
                widthMeters = 0.0,
                heightMeters = 0.0,
                textureResource = "wood_oak",
                pricePerUnit = cartPrice,
                sku = sku,
                imageUrl = images.firstOrNull()?.url?.let { url ->
                    if (url.startsWith("http")) url else api?.origin + "/" + url.trimStart('/')
                }
            )
    }

    @Serializable
    private data class AddItemRequest(val productId: String, val quantity: Int)

    @Serializable
    private data class QuantityRequest(val quantity: Int)

    @Serializable
    private data class RemoveItemsRequest(val productIds: List<String>)

    @Serializable
    private data class CartResponse(val cart: ApiCart)

    @Serializable
    private data class ApiCart(val items: List<ApiCartItem> = emptyList())

    @Serializable
    private data class ApiCartItem(val productId: String, val quantity: Int, val product: ApiCartProduct)

    @Serializable
    private data class ApiCartProduct(
        val id: String,
        val name: String,
        val sku: String = "",
        val price: String? = null,
        val images: List<ApiImage> = emptyList()
    )

    @Serializable
    private data class ApiImage(val url: String)
}
