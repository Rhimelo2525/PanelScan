package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.session.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.CoroutineScope

/** NotificationRepository against a fake /api/notifications shaped like the live backend. */
class NotificationRepositoryApiTest {

    private val calls = mutableListOf<String>()

    private fun item(id: String, title: String, metadata: String, read: Boolean = false) =
        """{"id":"$id","userId":"me","type":"ORDER","title":"$title","message":"m","isRead":$read,"metadata":$metadata,"createdAt":"2026-10-08T02:00:00.000Z"}"""

    private val inbox = listOf(
        item("n1", "Shipping fee ready - payment required", """{"orderId":"o1","shippingFee":"350.00","event":"SHIPPING_FEE_AVAILABLE"}"""),
        item("n2", "New message", """{"chatRoomId":"c1"}"""),
        item("n3", "Booking created", """{"bookingId":"b1"}"""),
        item("n4", "Installation scheduled", """{"bookingId":"b2","orderId":"o2"}"""),
        item("n5", "Project created", """{"projectId":"p1","event":"PROJECT_CREATED"}"""),
        item("n6", "Back in stock", """{"productId":"x1","event":"PRODUCT_BACK_IN_STOCK"}"""),
        item("n7", "Password changed", """{"event":"PASSWORD_CHANGED"}""", read = true),
        item("n8", "Welcome", "null", read = true)
    ).joinToString(",")

    private fun repository(scope: CoroutineScope? = null): NotificationRepository {
        val backend = Interceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath.removePrefix("/api") + (request.url.encodedQuery?.let { "?$it" } ?: "")
            synchronized(calls) { calls += "${request.method} $path" }
            val data = if (request.method == "GET") """{"notifications":[$inbox],"pagination":{"page":1,"limit":50,"total":8,"totalPages":1}}""" else """{"count":1}"""
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("")
                .body("""{"success":true,"message":"ok","data":$data}""".toResponseBody("application/json".toMediaType())).build()
        }
        val session = SessionManager().apply {
            saveTokens("access", "refresh")
            setCustomerSession(CustomerUser(id = "me", firstName = "Juan", lastName = "Dela Cruz", email = "juan@gmail.com"))
        }
        return NotificationRepository(ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build()), scope)
    }

    @Test
    fun `each notification opens the same place as on the website`() = runBlocking {
        val repo = repository()

        assertNull(repo.refresh())

        assertEquals("GET /notifications?limit=50", calls.single())
        val byId = repo.notifications.value.associateBy { it.id }
        assertEquals(NotificationDestination.ORDER to "o1", byId.getValue("n1").let { it.destination to it.referenceId })
        assertEquals(NotificationDestination.CHAT to "c1", byId.getValue("n2").let { it.destination to it.referenceId })
        assertEquals(NotificationDestination.INSTALLATION, byId.getValue("n3").destination)
        // A booking that belongs to an order opens the order.
        assertEquals(NotificationDestination.ORDER to "o2", byId.getValue("n4").let { it.destination to it.referenceId })
        assertEquals(NotificationDestination.PROJECT to "p1", byId.getValue("n5").let { it.destination to it.referenceId })
        assertEquals(NotificationDestination.PRODUCT to "x1", byId.getValue("n6").let { it.destination to it.referenceId })
        assertEquals(NotificationDestination.PROFILE, byId.getValue("n7").destination)
        assertEquals(NotificationDestination.NONE, byId.getValue("n8").destination)
        assertEquals(6, repo.unreadCount)
    }

    @Test
    fun `reading one or all is shown at once and sent to the backend`() = runBlocking {
        val repo = repository(CoroutineScope(Dispatchers.IO))
        repo.refresh()

        repo.markRead("n1")
        assertTrue(repo.notifications.value.first { it.id == "n1" }.read)
        assertEquals(5, repo.unreadCount)

        repo.markAllRead()
        assertEquals(0, repo.unreadCount)

        // Already read: nothing more is sent.
        repo.markRead("n2")
        repo.markAllRead()

        val deadline = System.currentTimeMillis() + 5_000
        while (synchronized(calls) { calls.size } < 3 && System.currentTimeMillis() < deadline) Thread.sleep(10)
        Thread.sleep(200) // room for any extra request to show up
        assertEquals(
            setOf("GET /notifications?limit=50", "PATCH /notifications/n1/read", "PATCH /notifications/read-all"),
            synchronized(calls) { calls.toSet() }
        )
        assertEquals(3, synchronized(calls) { calls.size })
    }

    @Test
    fun `signing out empties the inbox`() = runBlocking {
        val repo = repository()
        repo.refresh()

        repo.onSignedOut()

        assertTrue(repo.notifications.value.isEmpty())
        assertFalse(repo.unreadCount > 0)
    }
}
