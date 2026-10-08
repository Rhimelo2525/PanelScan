package com.example.panelscan.data.repository

import com.example.panelscan.core.model.OrderStage
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.model.PaymentStatus
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.session.SessionManager
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** OrderRepository against a fake /api/orders and /api/payments shaped like the live backend. */
class OrderRepositoryApiTest {

    private val calls = mutableListOf<String>()
    private val orderId = "22222222-2222-4222-8222-222222222222"

    private fun order(
        status: String = "PENDING",
        approved: Boolean = false,
        quotedAt: String? = null,
        shipping: String = "0",
        total: String = "3700.00",
        booking: String = "null"
    ) = """{"id":"$orderId","orderNumber":"PS-1001","status":"$status","subtotal":"3700.00","shippingFee":"$shipping","totalAmount":"$total",
        "shippingAddress":"12 Mabini St, Brgy. Poblacion, Makati, NCR, 1210","notes":null,"createdAt":"2026-10-08T02:00:00.000Z",
        "moderatorApproved":$approved,
        "items":[{"id":"i1","orderId":"$orderId","productId":"p1","productName":"Oak Wall Panel","unitPrice":"1850.00","quantity":2,"lineTotal":"3700.00",
                  "createdAt":"2026-10-08T02:00:00.000Z","product":{"images":[{"url":"/uploads/p1.webp","altText":null}],"category":null}}],
        "customer":{"id":"me","firstName":"Juan","lastName":"Dela Cruz","email":"juan@gmail.com","phone":"+639171234567"},
        "deliveryLocation":{"recipientName":"Maria Dela Cruz","recipientPhone":"+639181234567","latitude":14.55,"longitude":121.02},
        "delivery":${quotedAt?.let { """{"quotedAt":"$it","deliveryStatus":null}""" } ?: "null"},
        "booking":$booking,"feedback":null}"""

    private fun repository(respond: (method: String, path: String, body: String) -> String): OrderRepository {
        val backend = Interceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath.removePrefix("/api") + (request.url.encodedQuery?.let { "?$it" } ?: "")
            val body = request.body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
            calls += "${request.method} $path $body".trim()
            val data = respond(request.method, path, body)
            val status = if (data.startsWith("!")) 400 else 200
            val json = if (status == 400) """{"success":false,"message":"${data.drop(1)}"}""" else """{"success":true,"message":"ok","data":$data}"""
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }
        val session = SessionManager().apply {
            saveTokens("access", "refresh")
            setCustomerSession(CustomerUser(id = "me", firstName = "Juan", lastName = "Dela Cruz", email = "juan@gmail.com"))
        }
        return OrderRepository(ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build()))
    }

    @Test
    fun `placing a cart order sends the saved address, ticked products and installation`() = runBlocking {
        val repo = repository { _, _, _ -> """{"order":${order(booking = """{"scheduledDate":"2026-10-20T01:00:00.000Z"}""")}}""" }

        val placed = repo.placeOrder(
            PlaceOrderInput(
                addressId = "33333333-3333-4333-8333-333333333333",
                shippingAddress = "12 Mabini St",
                notes = "  Gate 2 ",
                installationDate = "2026-10-20T01:00:00.000Z",
                installationAddress = "12 Mabini St, Makati",
                selectedProductIds = listOf("p1")
            )
        ).getOrThrow()

        val sent = calls.single()
        assertTrue(sent.startsWith("POST /orders "))
        assertTrue(sent.contains("\"addressId\":\"33333333-3333-4333-8333-333333333333\""))
        assertTrue(sent.contains("\"notes\":\"Gate 2\""))
        assertTrue(sent.contains("\"installation\":{\"scheduledDate\":\"2026-10-20T01:00:00.000Z\",\"address\":\"12 Mabini St, Makati\"}"))
        assertTrue(sent.contains("\"selectedProductIds\":[\"p1\"]"))
        assertFalse(sent.contains("directItem"))

        assertEquals("PS-1001", placed.orderNumber)
        assertEquals(OrderStage.AWAITING_APPROVAL, placed.stage)
        assertTrue(placed.hasInstallation)
        assertEquals("Maria Dela Cruz", placed.customerName)
        assertEquals("https://backend.test/uploads/p1.webp", placed.items.single().imageUrl)
        assertEquals(3700.0, placed.subtotal, 0.001)
        assertEquals(listOf(placed), repo.orders.value)
    }

    @Test
    fun `the order moves through approval, shipping quote and payment like on the website`() = runBlocking {
        var current = order()
        var payment: String? = null
        val repo = repository { _, path, _ ->
            when {
                path.startsWith("/payments?") ->
                    """{"payments":[${payment?.let { """{"id":"pay1","orderId":"$orderId","status":"$it"}""" } ?: ""}],"pagination":{"page":1,"limit":50,"total":1,"totalPages":1}}"""
                else -> """{"order":$current}"""
            }
        }

        assertEquals(OrderStage.AWAITING_APPROVAL, repo.fetchOrder(orderId).getOrThrow().stage)

        current = order(status = "PROCESSING", approved = true)
        assertEquals(OrderStage.AWAITING_QUOTE, repo.fetchOrder(orderId).getOrThrow().stage)

        current = order(status = "PROCESSING", approved = true, quotedAt = "2026-10-08T05:00:00.000Z", shipping = "350.00", total = "4050.00")
        val payable = repo.fetchOrder(orderId).getOrThrow()
        assertEquals(OrderStage.AWAITING_PAYMENT, payable.stage)
        assertTrue(payable.shippingQuoted)
        assertEquals(4050.0, payable.totalAmount, 0.001)

        payment = "FAILED"
        assertEquals(PaymentStatus.FAILED, repo.fetchOrder(orderId).getOrThrow().paymentStatus)
        assertEquals(OrderStage.AWAITING_PAYMENT, repo.getOrderById(orderId)!!.stage)

        payment = "PAID"
        assertEquals(OrderStage.PAID, repo.fetchOrder(orderId).getOrThrow().stage)
    }

    @Test
    fun `paying asks the backend for PayMongo's checkout page, naming only the order`() = runBlocking {
        val repo = repository { _, _, _ -> """{"paymentId":"pay1","status":"PENDING","checkoutUrl":"https://checkout.paymongo.com/cs_123"}""" }

        val url = repo.startPayment(orderId).getOrThrow()

        assertEquals("https://checkout.paymongo.com/cs_123", url)
        assertEquals("POST /payments/create {\"orderId\":\"$orderId\"}", calls.single())
    }

    @Test
    fun `cancelling a pending order, and the backend's reason when it can't be`() = runBlocking {
        var refuse = false
        val repo = repository { _, _, _ -> if (refuse) "!Only pending orders can be cancelled." else """{"order":${order(status = "CANCELLED")}}""" }

        val cancelled = repo.cancelOrder(orderId).getOrThrow()
        assertEquals(OrderStatus.CANCELLED, cancelled.status)
        assertEquals(OrderStage.CANCELLED, cancelled.stage)
        assertFalse(cancelled.canCancel)
        assertEquals("PATCH /orders/$orderId/cancel {}", calls.single())

        refuse = true
        assertEquals("Only pending orders can be cancelled.", repo.cancelOrder(orderId).exceptionOrNull()?.message)
    }

    @Test
    fun `reviews are offered for delivered orders only`() = runBlocking {
        var status = "SHIPPED"
        val repo = repository { _, path, _ ->
            if (path.startsWith("/payments")) """{"payments":[],"pagination":{"totalPages":1}}""" else """{"orders":[${order(status = status, approved = true)}]}"""
        }

        assertNull(repo.refresh())
        assertFalse(repo.orders.value.single().isReviewEligible)

        status = "DELIVERED"
        repo.refresh()
        assertTrue(repo.orders.value.single().isReviewEligible)
    }
}
