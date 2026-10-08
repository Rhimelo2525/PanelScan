package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.session.SessionManager
import kotlinx.coroutines.flow.toList
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
import org.junit.Assert.assertTrue
import org.junit.Test

/** ChatRepository against a fake /api/chat shaped like the live backend's answers. */
class ChatRepositoryApiTest {

    private val calls = mutableListOf<String>()

    private val room = "11111111-1111-4111-8111-111111111111"

    private fun message(id: String, senderId: String?, content: String, at: String, sender: String? = null) =
        """{"id":"$id","chatRoomId":"$room","senderId":${senderId?.let { "\"$it\"" } ?: "null"},"content":"$content","isRead":false,"createdAt":"$at",
           "sender":${sender ?: "null"}}"""

    private fun repository(signedIn: Boolean = true): ChatRepository {
        val backend = Interceptor { chain ->
            val request = chain.request()
            val body = request.body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
            calls += "${request.method} ${request.url.encodedPath}${request.url.encodedQuery?.let { "?$it" } ?: ""} $body".trim()
            val json = when {
                request.method == "GET" && request.url.encodedPath.endsWith("/messages") -> """{"messages":[
                    ${message("m3", "staff-1", "Yes, we deliver to Cebu.", "2026-10-08T10:05:00.000Z", """{"id":"staff-1","firstName":"Ana","lastName":"Reyes","role":"MODERATOR"}""")},
                    ${message("m2", null, "Thanks! We'll reply soon.", "2026-10-08T10:00:01.000Z")},
                    ${message("m1", "me", "Do you deliver to Cebu?", "2026-10-08T10:00:00.000Z", """{"id":"me","firstName":"Juan","lastName":"Dela Cruz","role":"CUSTOMER"}""")}
                ],"pagination":{"page":1,"limit":100,"total":3,"totalPages":1}}"""
                request.method == "GET" -> """{"conversations":[{"id":"$room","subject":null,"updatedAt":"2026-10-08T09:00:00.000Z",
                    "latestMessage":${message("m3", "staff-1", "Yes", "2026-10-08T10:05:00.000Z")},"unreadCount":1}],"pagination":{"page":1,"limit":30,"total":1,"totalPages":1}}"""
                request.url.encodedPath.endsWith("/messages") ->
                    """{"message":${message("m4", "me", "Great", "2026-10-08T10:06:00.000Z")}}"""
                else -> """{"conversation":{"id":"$room","subject":null,"updatedAt":"2026-10-08T09:00:00.000Z"}}"""
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("")
                .body("""{"success":true,"message":"ok","data":$json}""".toResponseBody("application/json".toMediaType())).build()
        }
        val session = SessionManager()
        if (signedIn) {
            session.saveTokens("access", "refresh")
            session.setCustomerSession(CustomerUser(id = "me", firstName = "Juan", lastName = "Dela Cruz", email = "juan@gmail.com"))
        }
        return ChatRepository(session, ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build()))
    }

    @Test
    fun `the thread reads oldest first, with who wrote each message`() = runBlocking {
        val messages = repository().fetchMessages(room)

        assertEquals(listOf("m1", "m2", "m3"), messages.map { it.id })
        assertTrue(messages[0].isCustomer)
        assertFalse(messages[1].isCustomer)
        assertEquals("PanelScan Support · Auto-reply", messages[1].senderName)
        assertEquals("Ana Reyes", messages[2].senderName)
        assertEquals("GET /api/chat/$room/messages?limit=100", calls.single())
    }

    @Test
    fun `the conversation list uses the latest message time and unread count`() = runBlocking {
        val result = repository().getConversations().toList().single() as Resource.Success

        val conversation = result.data.single()
        assertEquals("2026-10-08T10:05:00.000Z", conversation.updatedAt)
        assertEquals(1, conversation.unreadCount)
    }

    @Test
    fun `opening and sending go to the customer's conversation`() = runBlocking {
        val repo = repository()

        val conversation = repo.createConversation(null).getOrThrow()
        val sent = repo.sendMessage(conversation.id, "  Great  ").getOrThrow()

        assertEquals(listOf("POST /api/chat {}", "POST /api/chat/$room/messages {\"content\":\"Great\"}"), calls)
        assertTrue(sent.isCustomer)
    }

    @Test
    fun `signed out asks to log in without calling the backend`() = runBlocking {
        val result = repository(signedIn = false).getConversations().toList().single()

        assertTrue(result is Resource.Error)
        assertTrue(calls.isEmpty())
    }
}
