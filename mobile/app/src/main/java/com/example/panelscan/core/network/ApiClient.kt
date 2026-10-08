package com.example.panelscan.core.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Where the signed-in customer's backend tokens live (SessionManager). */
interface TokenStore {
    val accessToken: String?
    val refreshToken: String?
    fun saveTokens(accessToken: String, refreshToken: String?)
    fun onSessionExpired()
}

/**
 * A failed API call, carrying the backend's own message (already written for
 * customers) and, for validation errors, the message per field ("email",
 * "phone", ...).
 */
class ApiException(
    val status: Int,
    message: String,
    val fieldErrors: Map<String, String> = emptyMap()
) : Exception(message) {
    val isNetworkError: Boolean get() = status == 0
}

/**
 * Talks to the PanelScan backend (`{ success, message, data }` responses).
 * Authenticated calls send the access token and, when it has expired, swap
 * the refresh token for a new pair once and retry; if that fails too the
 * session is over and the customer is signed out.
 */
class ApiClient(
    baseUrl: String,
    private val tokens: TokenStore,
    private val http: OkHttpClient = defaultHttpClient()
) {
    private val baseUrl = baseUrl.trimEnd('/')
    private val refreshLock = Mutex()

    /** The backend's scheme, host and port (no /api), for files it serves such as uploads. */
    val origin: String = this.baseUrl.toHttpUrlOrNull()?.let { url ->
        val port = if (url.port == HttpUrl.defaultPort(url.scheme)) "" else ":${url.port}"
        "${url.scheme}://${url.host}$port"
    } ?: this.baseUrl

    val json = Json {
        ignoreUnknownKeys = true
        // Fixed request fields (portal, acceptedTerms) are defaults and must still be sent;
        // null fields are left out so the backend keeps the saved value.
        encodeDefaults = true
        explicitNulls = false
        coerceInputValues = true
    }

    /** Sends a request and returns the response's `data` (JsonNull when there is none). */
    suspend fun send(
        method: String,
        path: String,
        body: JsonElement? = null,
        authenticated: Boolean = false
    ): JsonElement {
        val sentToken = if (authenticated) tokens.accessToken else null
        val response = execute(method, path, body, sentToken)
        if (response.status == 401 && authenticated && refreshSession(sentToken)) {
            return unwrap(execute(method, path, body, tokens.accessToken))
        }
        if (response.status == 401 && authenticated) {
            tokens.onSessionExpired()
            throw ApiException(401, SESSION_EXPIRED_MESSAGE)
        }
        return unwrap(response)
    }

    suspend inline fun <reified T> get(path: String, authenticated: Boolean = false): T =
        json.decodeFromJsonElement(send("GET", path, null, authenticated))

    suspend inline fun <reified B, reified T> post(path: String, body: B, authenticated: Boolean = false): T =
        json.decodeFromJsonElement(send("POST", path, json.encodeToJsonElement(body), authenticated))

    suspend inline fun <reified B> postUnit(path: String, body: B, authenticated: Boolean = false) {
        send("POST", path, json.encodeToJsonElement(body), authenticated)
    }

    suspend inline fun <reified B, reified T> patch(path: String, body: B, authenticated: Boolean = false): T =
        json.decodeFromJsonElement(send("PATCH", path, json.encodeToJsonElement(body), authenticated))

    /**
     * Swaps the refresh token for a new pair. Concurrent 401s share one
     * refresh: a caller whose token was already replaced just retries.
     */
    private suspend fun refreshSession(expiredToken: String?): Boolean = refreshLock.withLock {
        if (tokens.accessToken != null && tokens.accessToken != expiredToken) return@withLock true
        val refreshToken = tokens.refreshToken ?: return@withLock false
        // Offline throws a network ApiException and keeps the session for the next try.
        val response = execute("POST", "/auth/refresh", json.encodeToJsonElement(RefreshRequest(refreshToken)), null)
        if (response.status !in 200..299) return@withLock false
        val pair = json.decodeFromJsonElement<TokenPair>(unwrap(response))
        tokens.saveTokens(pair.token, pair.refreshToken)
        true
    }

    private suspend fun execute(method: String, path: String, body: JsonElement?, accessToken: String?): RawResponse =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(baseUrl + path)
                .header("Accept", "application/json")
                .apply { if (accessToken != null) header("Authorization", "Bearer $accessToken") }
                .method(method, body?.let { json.encodeToString(JsonElement.serializer(), it).toRequestBody(JSON) }
                    ?: if (method == "GET") null else ByteArray(0).toRequestBody(JSON))
                .build()
            try {
                http.newCall(request).execute().use { response ->
                    RawResponse(response.code, response.body?.string().orEmpty())
                }
            } catch (error: IOException) {
                throw ApiException(0, NETWORK_ERROR_MESSAGE)
            }
        }

    private fun unwrap(response: RawResponse): JsonElement {
        val parsed = runCatching { json.parseToJsonElement(response.body).jsonObject }.getOrNull()
        if (response.status in 200..299) return parsed?.get("data") ?: JsonNull
        throw toException(response.status, parsed)
    }

    private fun toException(status: Int, body: JsonObject?): ApiException {
        val message = body?.get("message")?.jsonPrimitive?.contentOrNull
        val fieldErrors = runCatching {
            body?.get("errors")?.jsonArray?.associate { issue ->
                val fields = issue.jsonObject
                fields.getValue("path").jsonPrimitive.content to fields.getValue("message").jsonPrimitive.content
            }
        }.getOrNull().orEmpty()
        // "Validation failed." alone says nothing; show the first field's reason instead.
        val shown = if (fieldErrors.isNotEmpty() && message == "Validation failed.") fieldErrors.values.first() else message
        return ApiException(status, shown ?: defaultMessage(status), fieldErrors)
    }

    private fun defaultMessage(status: Int): String = when (status) {
        429 -> "Too many attempts. Please wait a moment and try again."
        in 500..599 -> "PanelScan is having trouble right now. Please try again in a moment."
        else -> "Something went wrong. Please try again."
    }

    private class RawResponse(val status: Int, val body: String)

    @Serializable
    private data class RefreshRequest(val refreshToken: String)

    @Serializable
    private data class TokenPair(val token: String, val refreshToken: String)

    companion object {
        const val NETWORK_ERROR_MESSAGE = "Can't reach PanelScan. Check your internet connection and try again."
        const val SESSION_EXPIRED_MESSAGE = "Your session has ended. Please log in again."
        private val JSON = "application/json; charset=utf-8".toMediaType()

        private fun defaultHttpClient() = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}
