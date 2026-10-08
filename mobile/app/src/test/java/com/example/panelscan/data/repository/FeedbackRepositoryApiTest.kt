package com.example.panelscan.data.repository

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

/** FeedbackRepository against a fake /api/feedback shaped like the live backend. */
class FeedbackRepositoryApiTest {

    private val calls = mutableListOf<String>()
    private val orderId = "22222222-2222-4222-8222-222222222222"

    private fun feedback(id: String = "f1", comment: String? = "Great panels", first: String = "Juan", last: String = "Dela Cruz") =
        """{"id":"$id","customerId":"me","orderId":"$orderId","rating":4,"comment":${comment?.let { "\"$it\"" } ?: "null"},
           "createdAt":"2026-10-08T02:00:00.000Z","updatedAt":"2026-10-08T02:00:00.000Z",
           "customer":{"id":"me","firstName":"$first","lastName":"$last","email":"juan@gmail.com"},
           "order":{"id":"$orderId","orderNumber":"PS-1001","status":"DELIVERED"}}"""

    private fun repository(respond: (method: String, path: String, body: String) -> String): FeedbackRepository {
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
        return FeedbackRepository(ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build()))
    }

    @Test
    fun `the customer's own feedback loads with order number and full name`() = runBlocking {
        val repo = repository { _, _, _ -> """{"feedbacks":[${feedback()}],"pagination":{"page":1,"limit":50,"total":1,"totalPages":1}}""" }

        assertNull(repo.refresh())

        assertEquals("GET /feedback?limit=50", calls.single())
        val review = repo.reviews.value.single()
        assertEquals("PS-1001", review.orderNumber)
        assertEquals("Juan Dela Cruz", review.customerName)
        assertEquals(4, review.rating)
        assertEquals("Great panels", review.comment)
        assertTrue(repo.hasReviewed(orderId))
    }

    @Test
    fun `submitting sends the order, rating and trimmed comment, and leaves a blank comment out`() = runBlocking {
        val repo = repository { _, _, body ->
            """{"feedback":${feedback(comment = if (body.contains("comment")) "Solid" else null)}}"""
        }

        val review = repo.submit(orderId, 4, "  Solid ").getOrThrow()
        assertEquals("POST /feedback {\"orderId\":\"$orderId\",\"rating\":4,\"comment\":\"Solid\"}", calls.last())
        assertEquals("Solid", review.comment)
        assertEquals(listOf(review), repo.reviews.value)

        val noComment = repo.submit(orderId, 5, "   ").getOrThrow()
        assertEquals("POST /feedback {\"orderId\":\"$orderId\",\"rating\":5}", calls.last())
        assertNull(noComment.comment)
        assertEquals(1, repo.reviews.value.size)
    }

    @Test
    fun `the backend's reason is shown when feedback is refused`() = runBlocking {
        val repo = repository { _, _, _ -> "!You have already submitted feedback for this order." }

        val result = repo.submit(orderId, 5, "")

        assertEquals("You have already submitted feedback for this order.", result.exceptionOrNull()?.message)
        assertFalse(repo.hasReviewed(orderId))
    }

    @Test
    fun `product reviews show other customers by first name and last initial`() = runBlocking {
        val repo = repository { _, _, _ -> """{"feedbacks":[${feedback(first = "Maria", last = "Santos")}],"pagination":{"totalPages":1}}""" }

        val reviews = repo.productReviews("p1").getOrThrow()

        assertEquals("GET /feedback/product/p1?limit=50", calls.single())
        assertEquals("Maria S.", reviews.single().customerName)
        // Product reviews are not the customer's own list.
        assertTrue(repo.reviews.value.isEmpty())
    }
}
