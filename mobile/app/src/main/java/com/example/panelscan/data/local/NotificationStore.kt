package com.example.panelscan.data.local

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
enum class NotificationDestination { ORDER, ORDERS, PROJECT, PROJECTS, CHAT, INSTALLATION, NONE }

@Serializable
data class CustomerNotification(
    val id: String,
    val title: String,
    val message: String,
    val timestampMillis: Long,
    val destination: NotificationDestination = NotificationDestination.NONE,
    val referenceId: String? = null,
    val read: Boolean = false
)

interface NotificationStore {
    fun load(customerKey: String): List<CustomerNotification>
    fun save(customerKey: String, notifications: List<CustomerNotification>)
}

class InMemoryNotificationStore : NotificationStore {
    private val values = mutableMapOf<String, List<CustomerNotification>>()
    override fun load(customerKey: String): List<CustomerNotification> = values[customerKey].orEmpty()
    override fun save(customerKey: String, notifications: List<CustomerNotification>) {
        values[customerKey] = notifications
    }
}

class SharedPreferencesNotificationStore(context: Context) : NotificationStore {
    private val preferences = context.applicationContext.getSharedPreferences("customer_notifications_v1", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private fun key(customerKey: String) = "customer_${customerKey.trim().lowercase()}"

    override fun load(customerKey: String): List<CustomerNotification> =
        preferences.getString(key(customerKey), null)?.let { saved ->
            runCatching { json.decodeFromString<List<CustomerNotification>>(saved) }.getOrNull()
        }.orEmpty()

    override fun save(customerKey: String, notifications: List<CustomerNotification>) {
        preferences.edit().putString(key(customerKey), json.encodeToString(notifications)).apply()
    }
}
