package com.example.panelscan.core.delivery

import com.example.panelscan.core.location.ExactDeliveryLocation

/**
 * Delivery domain for PanelScan checkout.
 *
 * The app talks to a [DeliveryProvider]. The Lalamove implementation adapts that to a
 * [LalamoveService] — a port shaped after Lalamove's v3 API (quotations, orders) — which
 * must be implemented against **PanelScan's own backend**. Lalamove signs every request
 * with an API secret; that secret can never ship inside an APK, so the app only ever
 * needs the backend's base URL (see [DeliveryConfig]).
 *
 * Until a backend is connected, [DeliveryProviders.create] returns an unconfigured provider
 * that answers every call with [DeliveryFailure.NOT_CONFIGURED]. Nothing here fabricates a
 * fee, a booking or a tracking number.
 */

/** A vehicle class the provider can dispatch, e.g. Lalamove's service types. */
data class DeliveryVehicle(
    /** Provider identifier sent in quote requests (Lalamove `serviceType`). */
    val serviceType: String,
    val displayName: String,
    /** Maximum load the provider publishes for this vehicle, in kilograms. */
    val capacityKg: Int
) {
    val label: String get() = "$capacityKg kg $displayName"
}

/**
 * Lalamove Philippines vehicle classes as shown in the client's reference screens.
 *
 * `serviceType` keys are placeholders to be confirmed against Lalamove's
 * `GET /v3/cities` response for market `PH` when the backend is connected; the live list
 * returned by the provider always replaces this one (see [DeliveryVehicles.supported]).
 */
object LalamoveVehicleCatalog {
    val reference: List<DeliveryVehicle> = listOf(
        DeliveryVehicle("MOTORCYCLE", "Motorcycle", 20),
        DeliveryVehicle("SIDECAR", "Sidecar", 100),
        DeliveryVehicle("SEDAN", "Sedan", 200),
        DeliveryVehicle("MPV", "MPV", 300),
        DeliveryVehicle("VAN", "Van", 600),
        DeliveryVehicle("TRUCK_PICKUP", "Pickup Truck", 800)
    )
}

object DeliveryVehicles {
    /**
     * Only vehicles the configured provider reports as available are offered. When the
     * provider cannot report a live list (not configured), the reference catalogue is shown
     * for planning, clearly marked as not yet confirmed.
     */
    fun supported(catalogue: List<DeliveryVehicle>, providerServiceTypes: Set<String>?): List<DeliveryVehicle> =
        if (providerServiceTypes == null) catalogue
        else catalogue.filter { it.serviceType in providerServiceTypes }
}

/** Where the panels are collected from. Business data, configured per deployment. */
data class PickupPoint(
    val address: String,
    val latitude: Double,
    val longitude: Double,
    val contactName: String,
    val contactPhone: String
)

data class DeliveryQuoteRequest(
    val vehicle: DeliveryVehicle,
    val dropOff: ExactDeliveryLocation,
    val dropOffAddress: String,
    val recipientName: String,
    /** E.164, e.g. +639171234567. */
    val recipientPhone: String,
    val itemDescription: String,
    val quantity: Int
)

data class DeliveryQuote(
    /** Provider's quotation id; required to book at exactly this price. */
    val quotationId: String,
    val vehicle: DeliveryVehicle,
    val fee: Double,
    val currency: String,
    /** Epoch millis after which the provider will refuse to book at this price. */
    val expiresAtMillis: Long,
    val providerName: String,
    /** Provider stop ids from the quotation (pickup first), needed to book this quote. */
    val providerStopIds: List<String> = emptyList()
) {
    fun isExpired(nowMillis: Long): Boolean = nowMillis >= expiresAtMillis
}

data class DeliveryBookingRequest(
    val quote: DeliveryQuote,
    val quoteRequest: DeliveryQuoteRequest,
    /** PanelScan order reference, used as the provider's metadata/remarks. */
    val orderReference: String
)

enum class DeliveryBookingStatus { ASSIGNING_DRIVER, ON_GOING, PICKED_UP, COMPLETED, CANCELLED, REJECTED, EXPIRED, UNKNOWN }

data class DeliveryBooking(
    val providerOrderId: String,
    val status: DeliveryBookingStatus,
    /** Provider-hosted tracking page, when the provider returns one. */
    val trackingUrl: String?
)

enum class DeliveryFailure { NOT_CONFIGURED, OUT_OF_SERVICE_AREA, QUOTE_EXPIRED, REJECTED, NETWORK }

sealed interface DeliveryResult<out T> {
    data class Success<T>(val data: T) : DeliveryResult<T>
    data class Failure(val reason: DeliveryFailure, val message: String) : DeliveryResult<Nothing>
}

/** What checkout depends on. One implementation per delivery partner. */
interface DeliveryProvider {
    val providerName: String

    /** False until real credentials/backend are configured; the UI says so plainly. */
    val isConfigured: Boolean

    /** Live vehicle availability; null service types when the provider cannot report them. */
    suspend fun availableServiceTypes(): DeliveryResult<Set<String>>

    /** Step 1 → 2: ask for a price. Never books anything. */
    suspend fun requestQuote(request: DeliveryQuoteRequest): DeliveryResult<DeliveryQuote>

    /** Step 3 → 4: book at a previously received, unexpired quote. */
    suspend fun book(request: DeliveryBookingRequest): DeliveryResult<DeliveryBooking>

    suspend fun bookingStatus(providerOrderId: String): DeliveryResult<DeliveryBooking>
}

/** Answers honestly that delivery is not connected yet. */
class UnconfiguredDeliveryProvider(
    override val providerName: String = "Lalamove"
) : DeliveryProvider {
    override val isConfigured: Boolean = false

    private fun <T> notConfigured(): DeliveryResult<T> = DeliveryResult.Failure(
        DeliveryFailure.NOT_CONFIGURED,
        "Live $providerName quotes aren't connected yet. Our team will confirm the delivery fee with you before dispatch."
    )

    override suspend fun availableServiceTypes(): DeliveryResult<Set<String>> = notConfigured()
    override suspend fun requestQuote(request: DeliveryQuoteRequest): DeliveryResult<DeliveryQuote> = notConfigured()
    override suspend fun book(request: DeliveryBookingRequest): DeliveryResult<DeliveryBooking> = notConfigured()
    override suspend fun bookingStatus(providerOrderId: String): DeliveryResult<DeliveryBooking> = notConfigured()
}

/**
 * Deployment configuration, sourced from BuildConfig, which is filled from
 * `local.properties` or environment variables at build time — never from source code.
 */
data class DeliveryConfig(
    /** PanelScan backend that holds the Lalamove key/secret and proxies v3 calls. */
    val backendBaseUrl: String,
    /** Lalamove market code, e.g. "PH". */
    val market: String,
    val pickup: PickupPoint?
) {
    val isComplete: Boolean get() = backendBaseUrl.isNotBlank() && market.isNotBlank() && pickup != null
}

object DeliveryProviders {
    /**
     * Returns the Lalamove provider when a backend and service implementation exist,
     * otherwise the unconfigured provider. No HTTP implementation of [LalamoveService] is
     * bundled, because PanelScan has no delivery backend endpoint yet; pass one in once it
     * does.
     */
    fun create(config: DeliveryConfig, service: LalamoveService? = null): DeliveryProvider {
        val pickup = config.pickup
        return if (config.isComplete && service != null && pickup != null) {
            LalamoveDeliveryProvider(service, config.market, pickup)
        } else {
            UnconfiguredDeliveryProvider()
        }
    }
}
