package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerSessionState
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
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/** AuthRepository + ApiClient against a fake backend that answers like /api/auth. */
class AuthRepositoryApiTest {

    private class Call(val method: String, val path: String, val authorization: String?, val body: String)

    /** Answers each request with the first handler that returns a response; records every call. */
    private class FakeBackend(private val handler: (Call) -> Pair<Int, String>) : Interceptor {
        val calls = mutableListOf<Call>()

        override fun intercept(chain: Interceptor.Chain): Response {
            val request = chain.request()
            val body = request.body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
            val call = Call(request.method, request.url.encodedPath.removePrefix("/api"), request.header("Authorization"), body)
            calls += call
            val (status, json) = handler(call)
            return Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(status)
                .message("")
                .body(json.toResponseBody("application/json".toMediaType()))
                .build()
        }
    }

    private val user = """{"id":"u1","firstName":"Juan","lastName":"Dela Cruz","email":"juan@gmail.com","phone":"+639171234567","birthdate":"1995-05-15","role":"CUSTOMER","emailVerified":true}"""

    private fun repository(backend: Interceptor): Pair<AuthRepository, SessionManager> {
        val session = SessionManager()
        val http = OkHttpClient.Builder().addInterceptor(backend).build()
        return AuthRepository(session, ApiClient("http://backend.test/api/", session, http)) to session
    }

    @Test
    fun `login signs in through the customer portal and keeps both tokens`() = runBlocking {
        val backend = FakeBackend { 200 to """{"success":true,"message":"ok","data":{"user":$user,"token":"access-1","refreshToken":"refresh-1"}}""" }
        val (repo, session) = repository(backend)

        val result = repo.login(" Juan@Gmail.com ", "PanelScan2026!")

        assertTrue(result is AuthResult.Success)
        assertEquals("/auth/login", backend.calls.single().path)
        assertTrue(backend.calls.single().body.contains("\"email\":\"juan@gmail.com\""))
        assertTrue(backend.calls.single().body.contains("\"portal\":\"customer\""))
        assertEquals("access-1", session.accessToken)
        assertEquals("refresh-1", session.refreshToken)
        assertEquals("Juan", (session.sessionState.value as CustomerSessionState.LoggedIn).user.firstName)
    }

    @Test
    fun `google sign-in sends the ID token, and the terms only when agreed on sign-up`() = runBlocking {
        val backend = FakeBackend { 200 to """{"success":true,"message":"ok","data":{"user":$user,"token":"access-1","refreshToken":"refresh-1"}}""" }
        val (repo, session) = repository(backend)

        assertTrue(repo.loginWithGoogle("google-id-token") is AuthResult.Success)
        assertTrue(repo.loginWithGoogle("google-id-token", acceptedTerms = true) is AuthResult.Success)

        assertEquals(listOf("/auth/google", "/auth/google"), backend.calls.map { it.path })
        assertEquals("""{"credential":"google-id-token"}""", backend.calls[0].body)
        assertEquals("""{"credential":"google-id-token","acceptedTerms":true}""", backend.calls[1].body)
        assertEquals("refresh-1", session.refreshToken)
        assertTrue(session.sessionState.value is CustomerSessionState.LoggedIn)
    }

    @Test
    fun `registering signs the customer in right away, email still to verify`() = runBlocking {
        val unverified = user.replace("\"emailVerified\":true", "\"emailVerified\":false")
        val backend = FakeBackend { call ->
            when (call.path) {
                "/auth/register" -> 201 to """{"success":true,"message":"ok","data":{"user":$unverified,"token":"access-0"}}"""
                else -> 200 to """{"success":true,"message":"ok","data":{"user":$unverified,"token":"access-1","refreshToken":"refresh-1"}}"""
            }
        }
        val (repo, session) = repository(backend)

        val result = repo.register(
            firstName = "Juan",
            middleInitial = "d.c.",
            lastName = "Dela Cruz",
            email = "juan@gmail.com",
            password = "Disenyo2026!",
            phone = "9171234567",
            birthdate = "1995-05-15"
        )

        assertTrue(result is AuthResult.Success)
        assertTrue(backend.calls.first().body.contains("\"middleInitial\":\"DC\""))
        val signedIn = (session.sessionState.value as CustomerSessionState.LoggedIn).user
        assertEquals(false, signedIn.emailVerified)
        assertEquals("refresh-1", session.refreshToken)
    }

    @Test
    fun `wrong password shows the backend message and stays signed out`() = runBlocking {
        val (repo, session) = repository(FakeBackend { 401 to """{"success":false,"message":"Invalid email or password."}""" })

        val result = repo.login("juan@gmail.com", "nope")

        assertEquals("Invalid email or password.", (result as AuthResult.Error).message)
        assertTrue(session.sessionState.value is CustomerSessionState.LoggedOut)
    }

    @Test
    fun `an expired access token is refreshed once and the call retried`() = runBlocking {
        val backend = FakeBackend { call ->
            when {
                call.path == "/auth/login" -> 200 to """{"success":true,"message":"ok","data":{"user":$user,"token":"old","refreshToken":"refresh-1"}}"""
                call.path == "/auth/refresh" -> 200 to """{"success":true,"message":"ok","data":{"token":"new","refreshToken":"refresh-2"}}"""
                call.authorization == "Bearer old" -> 401 to """{"success":false,"message":"Token expired."}"""
                else -> 200 to """{"success":true,"message":"ok","data":{"user":$user}}"""
            }
        }
        val (repo, session) = repository(backend)
        repo.login("juan@gmail.com", "PanelScan2026!")

        val result = repo.updateProfile("Juan", "Dela Cruz", "9171234567", "1995-05-15", null)

        assertTrue(result is AuthResult.Success)
        assertEquals(listOf("/auth/login", "/auth/me", "/auth/refresh", "/auth/me"), backend.calls.map { it.path })
        assertEquals("Bearer new", backend.calls.last().authorization)
        assertEquals("new", session.accessToken)
        assertEquals("refresh-2", session.refreshToken)
    }

    @Test
    fun `a revoked session signs the customer out`() = runBlocking {
        val backend = FakeBackend { call ->
            when (call.path) {
                "/auth/login" -> 200 to """{"success":true,"message":"ok","data":{"user":$user,"token":"old","refreshToken":"refresh-1"}}"""
                else -> 401 to """{"success":false,"message":"This refresh token has been revoked."}"""
            }
        }
        val (repo, session) = repository(backend)
        repo.login("juan@gmail.com", "PanelScan2026!")

        val result = repo.changePassword("PanelScan2026!", "PanelScan2027!")

        assertEquals(ApiClient.SESSION_EXPIRED_MESSAGE, (result as ActionResult.Error).message)
        assertTrue(session.sessionState.value is CustomerSessionState.LoggedOut)
        assertNull(session.refreshToken)
    }

    @Test
    fun `validation errors show the field's own reason`() = runBlocking {
        val (repo, _) = repository(FakeBackend {
            400 to """{"success":false,"message":"Validation failed.","errors":[{"path":"phone","message":"Enter a valid Philippine mobile number."}]}"""
        })

        val result = repo.register(
            firstName = "Juan",
            middleInitial = "M.",
            lastName = "Dela Cruz",
            email = "juan@gmail.com",
            password = "PanelScan2026!",
            phone = "9171234567",
            birthdate = "1995-05-15"
        )

        result as AuthResult.Error
        assertEquals("Enter a valid Philippine mobile number.", result.message)
        assertEquals("Enter a valid Philippine mobile number.", result.fieldErrors["phone"])
    }

    @Test
    fun `no internet gives a friendly message`() = runBlocking {
        val (repo, _) = repository(Interceptor { throw IOException("offline") })

        val result = repo.requestPasswordReset("juan@gmail.com")

        assertEquals(ApiClient.NETWORK_ERROR_MESSAGE, (result as ActionResult.Error).message)
    }
}
