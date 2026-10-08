package com.example.panelscan.data.local

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Private on-device checkout fields. No order, payment or delivery status is persisted here. */
@Serializable
data class CheckoutDraft(
    val fullName: String = "",
    val phone: String = "",
    val street: String = "",
    val barangay: String = "",
    val city: String = "",
    val province: String = "",
    val postalCode: String = "",
    val region: String = "",
    val latitude: Double? = null,
    val longitude: Double? = null,
    val locationAddress: String? = null,
    val locationSource: String? = null,
    /** Used only to recognize a phone copied from an older account profile. */
    val profilePhoneAtSave: String = ""
)

interface CheckoutDraftStore {
    fun load(customerKey: String): CheckoutDraft?
    fun save(customerKey: String, draft: CheckoutDraft)
}

class InMemoryCheckoutDraftStore : CheckoutDraftStore {
    private val drafts = mutableMapOf<String, CheckoutDraft>()
    override fun load(customerKey: String): CheckoutDraft? = drafts[customerKey]
    override fun save(customerKey: String, draft: CheckoutDraft) { drafts[customerKey] = draft }
}

class SharedPreferencesCheckoutDraftStore(context: Context) : CheckoutDraftStore {
    private val preferences = context.applicationContext.getSharedPreferences("checkout_drafts_v1", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private fun key(customerKey: String) = "customer_${customerKey.trim().lowercase()}"

    override fun load(customerKey: String): CheckoutDraft? =
        preferences.getString(key(customerKey), null)?.let { stored ->
            runCatching { json.decodeFromString<CheckoutDraft>(stored) }.getOrNull()
        }

    override fun save(customerKey: String, draft: CheckoutDraft) {
        preferences.edit().putString(key(customerKey), json.encodeToString(draft)).apply()
    }
}
