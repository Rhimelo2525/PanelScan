package com.example.panelscan.data.repository

import com.example.panelscan.data.local.CustomerNotification
import com.example.panelscan.data.local.NotificationDestination
import com.example.panelscan.data.local.NotificationStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

/** Local inbox. Only actual local state changes or future provider events call [publish]. */
class NotificationRepository(private val store: NotificationStore) {
    private var customerKey = "guest"
    private val _notifications = MutableStateFlow<List<CustomerNotification>>(emptyList())
    val notifications: StateFlow<List<CustomerNotification>> = _notifications.asStateFlow()

    fun openCustomer(email: String?) {
        val next = email?.trim()?.lowercase().orEmpty().ifBlank { "guest" }
        if (next == customerKey && _notifications.value.isNotEmpty()) return
        customerKey = next
        _notifications.value = if (next == "guest") emptyList() else store.load(next)
    }

    fun publish(
        title: String,
        message: String,
        destination: NotificationDestination,
        referenceId: String? = null,
        timestampMillis: Long = System.currentTimeMillis()
    ): CustomerNotification? {
        if (customerKey == "guest") return null
        val item = CustomerNotification(
            id = UUID.randomUUID().toString(), title = title, message = message,
            timestampMillis = timestampMillis, destination = destination, referenceId = referenceId
        )
        _notifications.update { (listOf(item) + it).take(200) }
        persist()
        return item
    }

    fun markRead(id: String) {
        _notifications.update { items -> items.map { if (it.id == id) it.copy(read = true) else it } }
        persist()
    }

    /** Hooks for future real provider/moderator events. No sample events are generated. */
    fun onSupportMessage(conversationId: String, messagePreview: String) =
        publish("Support message", messagePreview, NotificationDestination.CHAT, conversationId)

    fun onPaymentStatusUpdate(orderId: String, status: String) =
        publish("Payment status update", "Payment is $status.", NotificationDestination.ORDER, orderId)

    fun onDeliveryStatusUpdate(orderId: String, status: String) =
        publish("Delivery status update", "Delivery is $status.", NotificationDestination.ORDER, orderId)

    fun markAllRead() {
        _notifications.update { items -> items.map { it.copy(read = true) } }
        persist()
    }

    val unreadCount: Int get() = _notifications.value.count { !it.read }

    private fun persist() {
        if (customerKey != "guest") store.save(customerKey, _notifications.value)
    }
}
