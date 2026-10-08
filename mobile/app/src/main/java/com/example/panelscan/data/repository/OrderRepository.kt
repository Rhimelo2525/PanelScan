package com.example.panelscan.data.repository

import com.example.panelscan.core.model.CartItem
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderDeliveryDetails
import com.example.panelscan.core.model.OrderItem
import com.example.panelscan.core.model.OrderStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

/**
 * Local frontend Order Repository.
 * Stores customer order records locally during the app session with zero backend requirements.
 */
class OrderRepository(
    private val onCreated: ((Order) -> Unit)? = null,
    private val onStatusChanged: ((Order) -> Unit)? = null
) {

    private val _orders = MutableStateFlow<List<Order>>(emptyList())
    val orders: StateFlow<List<Order>> = _orders.asStateFlow()

    fun createOrder(
        cartItems: List<CartItem>,
        customerName: String,
        customerEmail: String,
        customerPhone: String?,
        shippingAddress: String,
        hasInstallation: Boolean,
        paymentMethod: String,
        notes: String? = null,
        /** Provider-quoted delivery fee; null while not yet quoted, which is recorded as such. */
        deliveryFee: Double? = null,
        delivery: OrderDeliveryDetails = OrderDeliveryDetails()
    ): Order {
        val subtotal = cartItems.sumOf { it.lineTotal }
        val shippingFee = deliveryFee ?: 0.0
        val installationFee = 0.0 // No installation price has been approved.
        val totalAmount = subtotal + shippingFee + installationFee

        val orderItems = cartItems.map { cartItem ->
            OrderItem(
                id = "order-item-${UUID.randomUUID().toString().take(8)}",
                panelId = cartItem.panel.id,
                panelName = cartItem.panel.name,
                finish = cartItem.panel.finish,
                unitPrice = cartItem.panel.pricePerUnit ?: 0.0,
                quantity = cartItem.quantity,
                lineTotal = cartItem.lineTotal,
                textureResource = cartItem.panel.textureResource,
                imageResId = cartItem.panel.imageResId
            )
        }

        val orderNumber = "PS-2026-" + (1000..9999).random()
        val newOrder = Order(
            id = "order-${UUID.randomUUID().toString().take(8)}",
            orderNumber = orderNumber,
            items = orderItems,
            subtotal = subtotal,
            shippingFee = shippingFee,
            installationFee = installationFee,
            totalAmount = totalAmount,
            hasInstallation = hasInstallation,
            shippingAddress = shippingAddress,
            customerName = customerName,
            customerEmail = customerEmail,
            customerPhone = customerPhone,
            paymentMethod = paymentMethod,
            status = OrderStatus.PENDING,
            notes = notes,
            createdAt = System.currentTimeMillis(),
            delivery = delivery.copy(feeQuoted = deliveryFee != null)
        )

        _orders.update { listOf(newOrder) + it }
        onCreated?.invoke(newOrder)
        return newOrder
    }

    fun getOrderById(orderId: String): Order? =
        _orders.value.firstOrNull { it.id == orderId }

    fun getOrderByNumber(orderNumber: String): Order? =
        _orders.value.firstOrNull { it.orderNumber == orderNumber }

    fun updateOrderStatus(orderId: String, newStatus: OrderStatus): Boolean {
        var found = false
        var changedOrder: Order? = null
        _orders.update { current ->
            current.map { order ->
                if (order.id == orderId && order.status != newStatus &&
                    (newStatus != OrderStatus.COMPLETED || order.delivery.paymentStatus == "Paid")) {
                    found = true
                    order.copy(status = newStatus).also { changedOrder = it }
                } else order
            }
        }
        changedOrder?.let { onStatusChanged?.invoke(it) }
        return found
    }

    fun getOrdersEligibleForReview(reviewedOrderIds: Set<String>): List<Order> =
        _orders.value.filter { it.isReviewEligible && !reviewedOrderIds.contains(it.id) }
}

/** Completion and provider-confirmed payment are both required for a verified review. */
val Order.isReviewEligible: Boolean
    get() = status == OrderStatus.COMPLETED && delivery.paymentStatus == "Paid"
