package com.example.panelscan.data.repository

import com.example.panelscan.core.model.InstallationStatus
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
import org.junit.Assert.assertNull
import org.junit.Test

/** InstallationRepository against a fake /api/bookings shaped like the live backend. */
class InstallationRepositoryApiTest {

    private val calls = mutableListOf<String>()
    private val bookingId = "44444444-4444-4444-8444-444444444444"
    private val orderId = "22222222-2222-4222-8222-222222222222"

    private fun booking(status: String = "PENDING", scheduled: String = "2026-10-20T01:00:00.000Z", installer: String = "null") =
        """{"id":"$bookingId","customerId":"me","orderId":"$orderId","installerId":null,"status":"$status",
           "scheduledDate":"$scheduled","address":"12 Mabini St, Makati City","notes":"Concrete wall",
           "createdAt":"2026-10-08T02:00:00.000Z","updatedAt":"2026-10-08T02:00:00.000Z",
           "customer":{"id":"me","firstName":"Juan","lastName":"Dela Cruz","email":"juan@gmail.com","phone":null},
           "installer":$installer,
           "order":{"id":"$orderId","orderNumber":"PS-1001","status":"DELIVERED","totalAmount":"3700.00","createdAt":"2026-10-08T02:00:00.000Z","items":[]}}"""

    private fun repository(respond: (String, String, String) -> String): InstallationRepository {
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
        return InstallationRepository(ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build()))
    }

    @Test
    fun `a request is sent at the window's start in Philippine time, with the order`() = runBlocking {
        val repo = repository { _, _, _ -> """{"booking":${booking(scheduled = "2026-10-20T05:00:00.000Z")}}""" }

        val created = repo.requestInstallation(
            day = "2026-10-20",
            time = InstallationRepository.startTime(InstallationRepository.AFTERNOON),
            address = "  12 Mabini St, Makati City ",
            notes = " ",
            orderId = orderId
        ).getOrThrow()

        // 1:00 PM in Manila (UTC+8) is 05:00 UTC; blank notes are left out.
        assertEquals(
            "POST /bookings {\"scheduledDate\":\"2026-10-20T05:00:00.000Z\",\"address\":\"12 Mabini St, Makati City\",\"orderId\":\"$orderId\"}",
            calls.single()
        )
        assertEquals("Oct 20, 2026", created.scheduledDate)
        assertEquals(InstallationRepository.AFTERNOON, created.preferredTime)
        assertEquals("PS-1001", created.orderNumber)
        assertEquals(listOf(created), repo.bookings.value)
    }

    @Test
    fun `the team's schedule and installer show up after a reload`() = runBlocking {
        var status = "PENDING"
        var installer = "null"
        val repo = repository { _, _, _ ->
            """{"bookings":[${booking(status = status, installer = installer)}],"pagination":{"page":1,"limit":30,"total":1,"totalPages":1}}"""
        }

        assertNull(repo.refresh())
        assertEquals("GET /bookings?limit=30", calls.single())
        assertEquals(InstallationRepository.MORNING, repo.bookings.value.single().preferredTime)

        status = "SCHEDULED"
        installer = """{"id":"i1","firstName":"Pedro","lastName":"Reyes","email":"p@x.com","phone":null,"specialty":"PVC ceilings","isActive":true}"""
        repo.refresh()

        val scheduled = repo.bookings.value.single()
        assertEquals(InstallationStatus.SCHEDULED, scheduled.status)
        assertEquals("Pedro Reyes", scheduled.installerName)
        assertEquals("PVC ceilings", scheduled.installerSpecialty)
    }

    @Test
    fun `cancelling a pending request, and the backend's reason when it can't be`() = runBlocking {
        var refuse = false
        val repo = repository { _, path, _ ->
            when {
                refuse -> "!Only pending bookings can be cancelled."
                path.startsWith("/bookings?") -> """{"bookings":[${booking()}]}"""
                else -> """{"booking":${booking(status = "CANCELLED")}}"""
            }
        }
        repo.refresh()

        val cancelled = repo.cancelBooking(bookingId).getOrThrow()
        assertEquals(InstallationStatus.CANCELLED, cancelled.status)
        assertEquals("PATCH /bookings/$bookingId/cancel {}", calls.last())
        assertEquals(InstallationStatus.CANCELLED, repo.bookings.value.single().status)

        refuse = true
        assertEquals("Only pending bookings can be cancelled.", repo.cancelBooking(bookingId).exceptionOrNull()?.message)
    }
}
