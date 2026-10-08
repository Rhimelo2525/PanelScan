package com.example.panelscan.core.config

import com.example.panelscan.BuildConfig
import com.example.panelscan.core.delivery.DeliveryConfig
import com.example.panelscan.core.delivery.PickupPoint
import com.example.panelscan.core.payment.PaymentConfig

/**
 * Reads integration settings injected at build time (see app/build.gradle.kts). Blank
 * values mean "not configured", and the providers then say so to the customer.
 */
object IntegrationConfig {

    /** The PanelScan backend API, e.g. https://panelscan-backend.vercel.app/api/ */
    val apiBaseUrl: String get() = BuildConfig.API_BASE_URL

    /** The backend's Google OAuth (web) client ID, which "Continue with Google" asks Google to sign for. */
    val googleWebClientId: String get() = BuildConfig.GOOGLE_WEB_CLIENT_ID

    val delivery: DeliveryConfig by lazy {
        DeliveryConfig(
            backendBaseUrl = BuildConfig.DELIVERY_API_BASE_URL,
            market = BuildConfig.LALAMOVE_MARKET,
            pickup = pickupPoint()
        )
    }

    val payment: PaymentConfig by lazy { PaymentConfig(backendBaseUrl = BuildConfig.PAYMENT_API_BASE_URL) }

    private fun pickupPoint(): PickupPoint? {
        val lat = BuildConfig.PICKUP_LAT.toDoubleOrNull() ?: return null
        val lng = BuildConfig.PICKUP_LNG.toDoubleOrNull() ?: return null
        if (BuildConfig.PICKUP_ADDRESS.isBlank() || BuildConfig.PICKUP_CONTACT_PHONE.isBlank()) return null
        return PickupPoint(
            address = BuildConfig.PICKUP_ADDRESS,
            latitude = lat,
            longitude = lng,
            contactName = BuildConfig.PICKUP_CONTACT_NAME.ifBlank { "PanelScan" },
            contactPhone = BuildConfig.PICKUP_CONTACT_PHONE
        )
    }
}
