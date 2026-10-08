package com.example.panelscan.data.repository

import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderDeliveryDetails
import com.example.panelscan.core.model.OrderItem
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.model.PaymentStatus
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.Serializable
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** What the checkout sends: a saved address, optional notes and installation, and which items. */
data class PlaceOrderInput(
    val addressId: String,
    val shippingAddress: String,
    val notes: String? = null,
    /** ISO-8601 date-time of the preferred installation day, or null for no installation. */
    val installationDate: String? = null,
    val installationAddress: String? = null,
    val installationNotes: String? = null,
    /** Cart checkout: the ticked products. */
    val selectedProductIds: List<String>? = null,
    /** "Buy now" from a product page, outside the cart. */
    val directProductId: String? = null,
    val directQuantity: Int? = null
)

/**
 * The customer's orders on the backend (/api/orders), the same orders as the
 * website: placed from checkout, approved by a moderator who then quotes the
 * shipping fee, and paid with GCash (products + shipping in one payment).
 */
class OrderRepository(
    private val api: ApiClient? = null,
    private val onCreated: ((Order) -> Unit)? = null,
    private val onStatusChanged: ((Order) -> Unit)? = null
) {

    private val _orders = MutableStateFlow<List<Order>>(emptyList())
    val orders: StateFlow<List<Order>> = _orders.asStateFlow()

    /** Loads the customer's orders; null on success, else why it failed. */
    suspend fun refresh(): String? {
        val client = api ?: return null
        return try {
            val result: OrderPage = client.get("/orders?limit=50", authenticated = true)
            val previous = _orders.value.associateBy { it.id }
            val loaded = result.orders.map { it.toOrder(previous[it.id]?.paymentStatus) }
            _orders.value = loaded
            // Tell the customer about changes made by the team since the last load.
            if (previous.isNotEmpty()) {
                loaded.filter { order -> previous[order.id]?.let { it.status != order.status } == true }
                    .forEach { onStatusChanged?.invoke(it) }
            }
            null
        } catch (error: ApiException) {
            error.message
        }
    }

    /** Re-reads one order (e.g. when its page opens), together with its payment. */
    suspend fun fetchOrder(orderId: String): Result<Order> {
        val client = api ?: return Result.failure(IllegalStateException("Orders are not available."))
        return try {
            val result: OrderResponse = client.get("/orders/$orderId", authenticated = true)
            val order = result.order.toOrder(findPayment(orderId))
            upsert(order)
            Result.success(order)
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    suspend fun placeOrder(input: PlaceOrderInput): Result<Order> {
        val client = api ?: return Result.failure(IllegalStateException("Orders are not available."))
        val body = CreateOrderRequest(
            addressId = input.addressId,
            shippingAddress = input.shippingAddress,
            notes = input.notes?.trim()?.ifBlank { null },
            installation = input.installationDate?.let { date ->
                InstallationRequest(date, input.installationAddress.orEmpty(), input.installationNotes?.trim()?.ifBlank { null })
            },
            selectedProductIds = input.selectedProductIds?.takeIf { it.isNotEmpty() },
            directItem = input.directProductId?.let { DirectItem(it, input.directQuantity ?: 1) }
        )
        return try {
            val result: OrderResponse = client.post("/orders", body, authenticated = true)
            val order = result.order.toOrder(null)
            _orders.update { listOf(order) + it.filter { o -> o.id != order.id } }
            onCreated?.invoke(order)
            Result.success(order)
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    /** Only a pending order can be cancelled; its stock goes back on sale. */
    suspend fun cancelOrder(orderId: String): Result<Order> {
        val client = api ?: return Result.failure(IllegalStateException("Orders are not available."))
        return try {
            val result: OrderResponse = client.patch("/orders/$orderId/cancel", EmptyBody(), authenticated = true)
            val order = result.order.toOrder(getOrderById(orderId)?.paymentStatus)
            upsert(order)
            Result.success(order)
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    /**
     * Starts the GCash payment for an approved order with a quoted shipping fee
     * and returns PayMongo's secure checkout page. The backend works out the
     * amount from the order; the app only names the order.
     */
    suspend fun startPayment(orderId: String): Result<String> {
        val client = api ?: return Result.failure(IllegalStateException("Payments are not available."))
        return try {
            val result: CreatePaymentResponse = client.post("/payments/create", PaymentRequest(orderId), authenticated = true)
            Result.success(result.checkoutUrl)
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    /**
     * The order's payment status. There is no per-order payment endpoint, so
     * the customer's payment list is searched (bounded, as on the website).
     */
    suspend fun findPayment(orderId: String): PaymentStatus? {
        val client = api ?: return null
        for (page in 1..PAYMENT_LOOKUP_MAX_PAGES) {
            val result = runCatching { client.get<PaymentPage>("/payments?page=$page&limit=$PAYMENT_LOOKUP_PAGE_SIZE", authenticated = true) }
                .getOrNull() ?: return null
            result.payments.firstOrNull { it.orderId == orderId }?.let { payment ->
                return runCatching { PaymentStatus.valueOf(payment.status) }.getOrNull()
            }
            if (page >= result.pagination.totalPages) return null
        }
        return null
    }

    /** After logging out: the orders belong to the account, not this device. */
    fun onSignedOut() {
        _orders.value = emptyList()
    }

    fun getOrderById(orderId: String): Order? =
        _orders.value.firstOrNull { it.id == orderId }

    fun getOrderByNumber(orderNumber: String): Order? =
        _orders.value.firstOrNull { it.orderNumber == orderNumber }

    private fun upsert(order: Order) {
        _orders.update { current ->
            if (current.any { it.id == order.id }) current.map { if (it.id == order.id) order else it } else listOf(order) + current
        }
    }

    private fun ApiOrder.toOrder(payment: PaymentStatus?): Order {
        val location = deliveryLocation
        return Order(
            id = id,
            orderNumber = orderNumber,
            items = items.map { item ->
                OrderItem(
                    id = item.id,
                    panelId = item.productId,
                    panelName = item.productName,
                    finish = "",
                    unitPrice = item.unitPrice.toDoubleOrNull() ?: 0.0,
                    quantity = item.quantity,
                    lineTotal = item.lineTotal.toDoubleOrNull() ?: 0.0,
                    textureResource = "wood_oak",
                    imageUrl = item.product?.images?.firstOrNull()?.url?.let(::absoluteUrl)
                )
            },
            subtotal = subtotal.toDoubleOrNull() ?: 0.0,
            shippingFee = shippingFee.toDoubleOrNull() ?: 0.0,
            installationFee = 0.0,
            totalAmount = totalAmount.toDoubleOrNull() ?: 0.0,
            hasInstallation = booking != null,
            shippingAddress = shippingAddress,
            customerName = location?.recipientName ?: customer?.let { "${it.firstName} ${it.lastName}".trim() }.orEmpty(),
            customerEmail = customer?.email.orEmpty(),
            customerPhone = location?.recipientPhone ?: customer?.phone,
            paymentMethod = "GCash",
            status = runCatching { OrderStatus.valueOf(status) }.getOrDefault(OrderStatus.PENDING),
            notes = notes,
            createdAt = parseIsoMillis(createdAt) ?: System.currentTimeMillis(),
            delivery = OrderDeliveryDetails(
                latitude = location?.latitude,
                longitude = location?.longitude,
                vehicle = delivery?.vehicleType,
                provider = delivery?.deliveryProvider,
                feeQuoted = delivery?.quotedAt != null,
                quoteStatus = if (delivery?.quotedAt != null) "Quoted" else "Quoted after approval",
                paymentStatus = when (payment) {
                    PaymentStatus.PAID -> "Paid"
                    PaymentStatus.REFUNDED -> "Refunded"
                    PaymentStatus.FAILED -> "Failed"
                    else -> "Pending"
                },
                bookingReference = delivery?.trackingNumber ?: delivery?.lalamoveOrderId,
                bookingStatus = delivery?.deliveryStatus ?: "Not booked"
            ),
            moderatorApproved = moderatorApproved,
            shippingQuoted = delivery?.quotedAt != null,
            paymentStatus = payment,
            installationDate = booking?.scheduledDate
        )
    }

    private fun absoluteUrl(url: String): String =
        if (url.startsWith("http://") || url.startsWith("https://")) url else api?.origin + "/" + url.trimStart('/')

    @Serializable
    private data class ApiImage(val url: String)

    @Serializable
    private data class ApiItemProduct(val images: List<ApiImage> = emptyList())

    @Serializable
    private data class ApiOrderItem(
        val id: String,
        val productId: String,
        val productName: String,
        val unitPrice: String,
        val quantity: Int,
        val lineTotal: String,
        val product: ApiItemProduct? = null
    )

    @Serializable
    private data class ApiCustomer(val firstName: String, val lastName: String, val email: String, val phone: String? = null)

    @Serializable
    private data class ApiLocation(
        val recipientName: String? = null,
        val recipientPhone: String? = null,
        val latitude: Double? = null,
        val longitude: Double? = null
    )

    @Serializable
    private data class ApiDelivery(
        val quotedAt: String? = null,
        val vehicleType: String? = null,
        val deliveryProvider: String? = null,
        val deliveryStatus: String? = null,
        val trackingNumber: String? = null,
        val lalamoveOrderId: String? = null
    )

    @Serializable
    private data class ApiBooking(val scheduledDate: String? = null)

    @Serializable
    private data class ApiOrder(
        val id: String,
        val orderNumber: String,
        val status: String,
        val subtotal: String,
        val shippingFee: String,
        val totalAmount: String,
        val shippingAddress: String,
        val notes: String? = null,
        val createdAt: String,
        val moderatorApproved: Boolean = false,
        val items: List<ApiOrderItem> = emptyList(),
        val customer: ApiCustomer? = null,
        val deliveryLocation: ApiLocation? = null,
        val delivery: ApiDelivery? = null,
        val booking: ApiBooking? = null
    )

    @Serializable
    private data class OrderPage(val orders: List<ApiOrder>)

    @Serializable
    private data class OrderResponse(val order: ApiOrder)

    @Serializable
    private data class InstallationRequest(val scheduledDate: String, val address: String, val notes: String?)

    @Serializable
    private data class DirectItem(val productId: String, val quantity: Int)

    @Serializable
    private data class CreateOrderRequest(
        val addressId: String,
        val shippingAddress: String,
        val notes: String?,
        val installation: InstallationRequest?,
        val selectedProductIds: List<String>?,
        val directItem: DirectItem?
    )

    @Serializable
    private class EmptyBody

    @Serializable
    private data class PaymentRequest(val orderId: String)

    @Serializable
    private data class CreatePaymentResponse(val paymentId: String, val status: String, val checkoutUrl: String)

    @Serializable
    private data class ApiPayment(val orderId: String, val status: String)

    @Serializable
    private data class Pagination(val totalPages: Int = 1)

    @Serializable
    private data class PaymentPage(val payments: List<ApiPayment>, val pagination: Pagination = Pagination())

    companion object {
        private const val PAYMENT_LOOKUP_PAGE_SIZE = 50
        private const val PAYMENT_LOOKUP_MAX_PAGES = 5
    }
}

/** "2026-10-08T14:03:00.000Z" (the backend's UTC times) to epoch millis; java.time needs API 26. */
internal fun parseIsoMillis(value: String): Long? = runCatching {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(value.take(19))?.time
}.getOrNull()

/** Reviews are for delivered orders (the backend accepts feedback only for those). */
val Order.isReviewEligible: Boolean
    get() = status == OrderStatus.DELIVERED
