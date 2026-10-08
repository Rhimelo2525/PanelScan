package com.example.panelscan.data.repository

import com.example.panelscan.TestPanels
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.session.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** CartRepository against a fake /api/cart that keeps a real cart, like the backend. */
class CartRepositorySyncTest {

    private val oak = TestPanels.wallPanels.first()
    private val tile = TestPanels.ceilingPanels.first()

    /** productId -> quantity, in the order added; stock limits like the backend's. */
    private val serverCart = linkedMapOf<String, Int>()
    private val stock = mapOf(oak.id to 10, tile.id to 3)
    private val calls = mutableListOf<String>()

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Unconfined + job)

    private fun cartJson() = serverCart.entries.joinToString(",", """{"cart":{"items":[""", "]}}") { (id, qty) ->
        """{"productId":"$id","quantity":$qty,"product":{"id":"$id","name":"P $id","sku":"S","price":"100.00","images":[]}}"""
    }

    private fun repository(signedIn: Boolean = true): Pair<CartRepository, SessionManager> {
        val backend = Interceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath.removePrefix("/api")
            val body = request.body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
            calls += "${request.method} $path $body".trim()
            fun qty() = Regex("\"quantity\":(\\d+)").find(body)!!.groupValues[1].toInt()
            fun refuse(message: String) = 400 to """{"success":false,"message":"$message"}"""
            val (status, json) = when {
                request.method == "POST" && path == "/cart/items" -> {
                    val id = Regex("\"productId\":\"([^\"]+)\"").find(body)!!.groupValues[1]
                    val wanted = (serverCart[id] ?: 0) + qty()
                    if (wanted > stock.getValue(id)) refuse("Only ${stock.getValue(id)} items are available.")
                    else { serverCart[id] = wanted; 201 to """{"success":true,"message":"ok","data":${cartJson()}}""" }
                }
                request.method == "PATCH" -> {
                    val id = path.substringAfterLast('/')
                    if (qty() > stock.getValue(id)) refuse("Only ${stock.getValue(id)} items are available.")
                    else { serverCart[id] = qty(); 200 to """{"success":true,"message":"ok","data":${cartJson()}}""" }
                }
                request.method == "POST" && path == "/cart/remove-items" -> {
                    Regex("\"([0-9a-f-]{36})\"").findAll(body).forEach { serverCart.remove(it.groupValues[1]) }
                    200 to """{"success":true,"message":"ok","data":${cartJson()}}"""
                }
                request.method == "DELETE" && path == "/cart" -> { serverCart.clear(); 200 to """{"success":true,"message":"ok","data":${cartJson()}}""" }
                request.method == "DELETE" -> { serverCart.remove(path.substringAfterLast('/')); 200 to """{"success":true,"message":"ok","data":${cartJson()}}""" }
                else -> 200 to """{"success":true,"message":"ok","data":${cartJson()}}"""
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }
        val session = SessionManager()
        if (signedIn) {
            session.saveTokens("access", "refresh")
            session.setCustomerSession(CustomerUser(id = "me", firstName = "Juan", lastName = "Dela Cruz", email = "juan@gmail.com"))
        }
        val api = ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build())
        return CartRepository(api, session, scope) to session
    }

    private fun settle() = runBlocking { withTimeout(5_000) { job.children.toList().joinAll() } }

    @Test
    fun `changes are saved to the account's cart`() {
        val (cart, _) = repository()

        cart.addToCart(oak, 2)
        settle()
        cart.updateQuantity(oak.id, 5)
        settle()
        cart.addToCart(tile, 1)
        settle()
        cart.removeFromCart(tile.id)
        settle()

        assertEquals(mapOf(oak.id to 5), serverCart)
        assertEquals(listOf(oak.id to 5), cart.items.value.map { it.id to it.quantity })
        assertTrue(calls.contains("PATCH /cart/items/${oak.id} {\"quantity\":5}"))
    }

    @Test
    fun `a refused change is undone and the reason is announced`() = runBlocking {
        val (cart, _) = repository()
        cart.addToCart(tile, 2)
        settle()

        // Listen first, as the app does (the screen collects messages all the time).
        val message = async(start = CoroutineStart.UNDISPATCHED) { withTimeout(5_000) { cart.messages.first() } }
        cart.updateQuantity(tile.id, 9)
        settle()

        assertEquals("Only 3 items are available.", message.await())
        assertEquals(2, cart.items.value.single().quantity)
    }

    @Test
    fun `signed out stays on the device, then moves into the account on login`() = runBlocking {
        val (cart, session) = repository(signedIn = false)
        cart.addToCart(oak, 3)
        settle()
        assertTrue(calls.isEmpty())

        session.saveTokens("access", "refresh")
        session.setCustomerSession(CustomerUser(id = "me", firstName = "Juan", lastName = "Dela Cruz", email = "juan@gmail.com"))
        serverCart[tile.id] = 1 // already in the account from the website
        cart.onSignedIn()

        assertEquals(mapOf(tile.id to 1, oak.id to 3), serverCart)
        assertEquals(setOf(oak.id, tile.id), cart.items.value.map { it.id }.toSet())
        assertEquals(setOf(oak.id, tile.id), cart.selectedItemIds.value)

        cart.onSignedOut()
        assertTrue(cart.items.value.isEmpty())
    }

    @Test
    fun `checking out removes the ticked items from the account's cart`() {
        val (cart, _) = repository()
        cart.addToCart(oak, 1)
        cart.addToCart(tile, 1)
        settle()
        cart.toggleSelection(tile.id)

        cart.removeSelectedItems()
        settle()

        assertEquals(mapOf(tile.id to 1), serverCart)
        assertTrue(calls.last().startsWith("POST /cart/remove-items"))
    }
}
