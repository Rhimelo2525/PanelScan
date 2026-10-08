package com.example.panelscan.core.delivery

import kotlinx.serialization.Serializable
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/*
 * Lalamove API v3 request/response models and the service port.
 *
 * Field names follow Lalamove's published v3 API (POST /v3/quotations, POST /v3/orders,
 * GET /v3/orders/{id}, GET /v3/cities). Verify against the current Lalamove documentation
 * when implementing the backend proxy. Amounts and coordinates are strings, as in the API.
 */

@Serializable
data class LalamoveCoordinates(val lat: String, val lng: String)

@Serializable
data class LalamoveStop(
    val coordinates: LalamoveCoordinates,
    val address: String,
    val stopId: String? = null
)

@Serializable
data class LalamoveItem(
    val quantity: String,
    val weight: String? = null,
    val categories: List<String> = emptyList(),
    val handlingInstructions: List<String> = emptyList()
)

@Serializable
data class LalamoveQuotationRequest(
    val serviceType: String,
    val language: String,
    val stops: List<LalamoveStop>,
    val item: LalamoveItem? = null,
    val specialRequests: List<String> = emptyList(),
    val isRouteOptimized: Boolean = false
)

@Serializable
data class LalamovePriceBreakdown(
    val total: String,
    val currency: String
)

@Serializable
data class LalamoveQuotation(
    val quotationId: String,
    val serviceType: String,
    val expiresAt: String? = null,
    val stops: List<LalamoveStop>,
    val priceBreakdown: LalamovePriceBreakdown
)

@Serializable
data class LalamoveContact(
    val stopId: String,
    val name: String,
    val phone: String,
    val remarks: String? = null
)

@Serializable
data class LalamoveOrderRequest(
    val quotationId: String,
    val sender: LalamoveContact,
    val recipients: List<LalamoveContact>,
    val isPODEnabled: Boolean = true,
    val metadata: Map<String, String> = emptyMap()
)

@Serializable
data class LalamoveOrder(
    val orderId: String,
    val quotationId: String? = null,
    val status: String,
    val shareLink: String? = null
)

/** An error the backend relays from Lalamove (HTTP status + Lalamove error id). */
class LalamoveApiException(val httpStatus: Int, val errorId: String?, message: String) : Exception(message)

/**
 * Port to Lalamove through PanelScan's backend. Implement this with the HTTP client of the
 * backend's choosing once the endpoint exists; the app never holds the Lalamove secret.
 */
interface LalamoveService {
    /** Service types (vehicle keys) available in the market, from GET /v3/cities. */
    suspend fun serviceTypes(market: String): List<String>
    suspend fun createQuotation(request: LalamoveQuotationRequest): LalamoveQuotation
    suspend fun placeOrder(request: LalamoveOrderRequest): LalamoveOrder
    suspend fun getOrder(orderId: String): LalamoveOrder
}

/**
 * Adapts checkout's [DeliveryProvider] contract to Lalamove's quote → book model.
 *
 * Quoting and booking are separate calls on purpose: a quote never books, and a booking
 * is only made with the `quotationId` of an unexpired quote the customer has seen.
 */
class LalamoveDeliveryProvider(
    private val service: LalamoveService,
    private val market: String,
    private val pickup: PickupPoint,
    private val clock: () -> Long = System::currentTimeMillis
) : DeliveryProvider {

    override val providerName: String = "Lalamove"
    override val isConfigured: Boolean = true

    override suspend fun availableServiceTypes(): DeliveryResult<Set<String>> = call {
        service.serviceTypes(market).toSet()
    }

    override suspend fun requestQuote(request: DeliveryQuoteRequest): DeliveryResult<DeliveryQuote> = call {
        val quotation = service.createQuotation(toQuotationRequest(request))
        DeliveryQuote(
            quotationId = quotation.quotationId,
            vehicle = request.vehicle,
            fee = quotation.priceBreakdown.total.toDoubleOrNull()
                ?: throw LalamoveApiException(502, "INVALID_PRICE", "Quote returned no usable price"),
            currency = quotation.priceBreakdown.currency,
            expiresAtMillis = quotation.expiresAt?.let(IsoTime::parseMillis) ?: (clock() + DEFAULT_QUOTE_VALIDITY_MS),
            providerName = providerName,
            providerStopIds = quotation.stops.mapNotNull { it.stopId }
        )
    }

    override suspend fun book(request: DeliveryBookingRequest): DeliveryResult<DeliveryBooking> {
        if (request.quote.isExpired(clock())) {
            return DeliveryResult.Failure(DeliveryFailure.QUOTE_EXPIRED, "This quote has expired. Get a new delivery quote.")
        }
        // Stop ids come from the quotation, in the order the stops were requested.
        val pickupStop = request.quote.providerStopIds.getOrNull(0)
        val dropOffStop = request.quote.providerStopIds.getOrNull(1)
        if (pickupStop == null || dropOffStop == null) {
            return DeliveryResult.Failure(DeliveryFailure.REJECTED, "The quote is missing stop details. Get a new delivery quote.")
        }
        return call {
            val order = service.placeOrder(
                LalamoveOrderRequest(
                    quotationId = request.quote.quotationId,
                    sender = LalamoveContact(stopId = pickupStop, name = pickup.contactName, phone = pickup.contactPhone),
                    recipients = listOf(
                        LalamoveContact(
                            stopId = dropOffStop,
                            name = request.quoteRequest.recipientName,
                            phone = request.quoteRequest.recipientPhone,
                            remarks = request.quoteRequest.itemDescription
                        )
                    ),
                    metadata = mapOf("panelscanOrder" to request.orderReference)
                )
            )
            order.toBooking()
        }
    }

    override suspend fun bookingStatus(providerOrderId: String): DeliveryResult<DeliveryBooking> = call {
        service.getOrder(providerOrderId).toBooking()
    }

    internal fun toQuotationRequest(request: DeliveryQuoteRequest) = LalamoveQuotationRequest(
        serviceType = request.vehicle.serviceType,
        language = "en_$market",
        stops = listOf(
            LalamoveStop(LalamoveCoordinates(pickup.latitude.toString(), pickup.longitude.toString()), pickup.address),
            LalamoveStop(
                LalamoveCoordinates(request.dropOff.latitude.toString(), request.dropOff.longitude.toString()),
                request.dropOffAddress
            )
        ),
        item = LalamoveItem(
            quantity = request.quantity.toString(),
            categories = listOf("CONSTRUCTION_MATERIALS"),
            handlingInstructions = listOf("KEEP_DRY", "FRAGILE")
        )
    )

    private suspend fun <T> call(block: suspend () -> T): DeliveryResult<T> = try {
        DeliveryResult.Success(block())
    } catch (error: LalamoveApiException) {
        DeliveryResult.Failure(
            reason = when {
                error.errorId == "ERR_OUT_OF_SERVICE_AREA" -> DeliveryFailure.OUT_OF_SERVICE_AREA
                error.errorId == "ERR_QUOTATION_EXPIRED" -> DeliveryFailure.QUOTE_EXPIRED
                else -> DeliveryFailure.REJECTED
            },
            message = error.message ?: "Lalamove declined the request."
        )
    } catch (error: Exception) {
        DeliveryResult.Failure(DeliveryFailure.NETWORK, "Couldn't reach the delivery service. Check your connection and try again.")
    }

    private fun LalamoveOrder.toBooking() = DeliveryBooking(
        providerOrderId = orderId,
        status = runCatching { DeliveryBookingStatus.valueOf(status) }.getOrDefault(DeliveryBookingStatus.UNKNOWN),
        trackingUrl = shareLink
    )

    companion object {
        /** Lalamove quotations are short-lived; used only if the response omits expiresAt. */
        const val DEFAULT_QUOTE_VALIDITY_MS = 5 * 60 * 1000L
    }
}

/** ISO-8601 parsing that works on API 24 (java.time needs API 26 without desugaring). */
object IsoTime {
    private val pattern = Regex("""^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$""")

    fun parseMillis(value: String): Long? {
        val match = pattern.matchEntire(value.trim()) ?: return null
        val (base, fraction, zone) = match.destructured
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = when {
                zone.isEmpty() || zone == "Z" -> TimeZone.getTimeZone("UTC")
                else -> TimeZone.getTimeZone("GMT" + zone.let { if (it.contains(':')) it else it.substring(0, 3) + ":" + it.substring(3) })
            }
        }
        val seconds = runCatching { format.parse(base)?.time }.getOrNull() ?: return null
        val millis = if (fraction.length > 1) {
            fraction.drop(1).padEnd(3, '0').take(3).toIntOrNull() ?: 0
        } else 0
        return seconds + millis
    }
}
