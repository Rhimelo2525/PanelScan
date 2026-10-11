package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Where tapping a notification goes, from the record it points to. */
enum class NotificationDestination { ORDER, PROJECT, CHAT, INSTALLATION, PRODUCT, PROFILE, NONE }

/** The backend's notification types, labelled as on the website. */
enum class NotificationType(val label: String) {
    ORDER("Orders & delivery"),
    PAYMENT("Payments"),
    BOOKING("Installation"),
    CHAT("Messages"),
    SYSTEM("System & account")
}

/** What the inbox shows: a type (null = all) and read state (null = read and unread). */
data class NotificationFilter(val type: NotificationType? = null, val read: Boolean? = null) {
    val isActive: Boolean get() = type != null || read != null
}

data class CustomerNotification(
    val id: String,
    val title: String,
    val message: String,
    val timestampMillis: Long,
    val type: NotificationType = NotificationType.SYSTEM,
    val destination: NotificationDestination = NotificationDestination.NONE,
    /** The order, project, conversation or product it is about. */
    val referenceId: String? = null,
    val read: Boolean = false
)

/**
 * The customer's inbox on the backend (/api/notifications), the same one the
 * website shows: the backend writes order, payment, delivery, installation,
 * chat and project updates; the app reads them and marks them read.
 */
class NotificationRepository(
    private val api: ApiClient? = null,
    /** Runs the read receipts, which outlive the screen that sent them. */
    private val scope: CoroutineScope? = null
) {
    private val _notifications = MutableStateFlow<List<CustomerNotification>>(emptyList())

    /** The newest notifications matching [filter]. */
    val notifications: StateFlow<List<CustomerNotification>> = _notifications.asStateFlow()

    private val _filter = MutableStateFlow(NotificationFilter())
    val filter: StateFlow<NotificationFilter> = _filter.asStateFlow()

    private val _unreadCount = MutableStateFlow(0)

    /** Every unread notification on the account (the badge), whatever the filter. */
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    /** Loads the newest notifications for the current filter and the unread count; null on success, else why it failed. */
    suspend fun refresh(): String? {
        val client = api ?: return null
        val current = _filter.value
        val query = buildString {
            append("/notifications?limit=$PAGE_SIZE")
            current.type?.let { append("&type=${it.name}") }
            current.read?.let { append("&isRead=$it") }
        }
        return try {
            val result: NotificationPage = client.get(query, authenticated = true)
            // A filter changed while loading: that newer load wins.
            if (_filter.value == current) _notifications.value = result.notifications.map { it.toNotification() }
            val count: UnreadCount = client.get("/notifications/unread/count", authenticated = true)
            _unreadCount.value = count.count
            null
        } catch (error: ApiException) {
            error.message
        }
    }

    /** Shows only [filter]'s notifications (as the website's Type and Status filters). */
    suspend fun setFilter(filter: NotificationFilter): String? {
        if (filter == _filter.value) return null
        _filter.value = filter
        _notifications.value = emptyList()
        return refresh()
    }

    fun markRead(id: String) {
        val target = _notifications.value.firstOrNull { it.id == id } ?: return
        if (target.read) return
        _notifications.update { items -> items.map { if (it.id == id) it.copy(read = true) else it } }
        _unreadCount.update { (it - 1).coerceAtLeast(0) }
        sendReceipt { it.send("PATCH", "/notifications/$id/read", authenticated = true) }
    }

    fun markAllRead() {
        if (_unreadCount.value == 0 && _notifications.value.none { !it.read }) return
        _notifications.update { items -> items.map { it.copy(read = true) } }
        _unreadCount.value = 0
        sendReceipt { it.send("PATCH", "/notifications/read-all", authenticated = true) }
    }

    /** After logging out: the inbox belongs to the account. */
    fun onSignedOut() {
        _notifications.value = emptyList()
        _unreadCount.value = 0
        _filter.value = NotificationFilter()
    }

    /** A failed read receipt is not worth an error; the next refresh shows the backend's state. */
    private fun sendReceipt(call: suspend (ApiClient) -> Unit) {
        val client = api ?: return
        val runner = scope ?: return
        runner.launch { runCatching { call(client) } }
    }

    private fun ApiNotification.toNotification(): CustomerNotification {
        fun meta(key: String): String? = (metadata?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
        val event = meta("event").orEmpty()
        val orderId = meta("orderId")
        // The same targets as the website's notification links for customers.
        val (destination, reference) = when {
            event == "PASSWORD_CHANGED" || event == "PROFILE_UPDATED" -> NotificationDestination.PROFILE to null
            meta("chatRoomId") != null -> NotificationDestination.CHAT to meta("chatRoomId")
            meta("bookingId") != null && orderId == null -> NotificationDestination.INSTALLATION to null
            orderId != null -> NotificationDestination.ORDER to orderId
            meta("projectId") != null -> NotificationDestination.PROJECT to meta("projectId")
            meta("productId") != null -> NotificationDestination.PRODUCT to meta("productId")
            else -> NotificationDestination.NONE to null
        }
        return CustomerNotification(
            id = id,
            title = title,
            message = message,
            timestampMillis = parseIsoMillis(createdAt) ?: System.currentTimeMillis(),
            type = runCatching { NotificationType.valueOf(type) }.getOrDefault(NotificationType.SYSTEM),
            destination = destination,
            referenceId = reference,
            read = isRead
        )
    }

    @Serializable
    private data class ApiNotification(
        val id: String,
        val type: String = "SYSTEM",
        val title: String,
        val message: String,
        val isRead: Boolean = false,
        val metadata: JsonObject? = null,
        val createdAt: String
    )

    @Serializable
    private data class NotificationPage(val notifications: List<ApiNotification> = emptyList())

    @Serializable
    private data class UnreadCount(val count: Int = 0)

    companion object {
        private const val PAGE_SIZE = 50
    }
}
