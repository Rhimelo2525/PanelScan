package com.example.panelscan.data.repository

import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.SessionManager
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/** ProductRepository against a fake /api/products, shaped like the live backend's answers. */
class ProductRepositoryApiTest {

    private val requestedUrls = mutableListOf<String>()

    private fun product(id: String, name: String, category: String, price: String?, extra: String = "") = """
        {"id":"$id","name":"$name","sku":"SKU-$id","price":${price?.let { "\"$it\"" } ?: "null"},
         "width":"60","height":"240","thickness":"1.2","material":"PVC","isActive":true,
         "category":{"id":"c","name":"$category","slug":"s"},$extra
         "images":[{"url":"/uploads/$id-2.webp","isPrimary":false,"sortOrder":1},{"url":"/uploads/$id.webp","isPrimary":true,"sortOrder":0}],
         "inventory":{"quantity":10,"reservedQty":4,"reorderLevel":5}}
    """.trimIndent()

    private fun repository(pages: List<String>): ProductRepository {
        val backend = Interceptor { chain ->
            val url = chain.request().url
            requestedUrls += url.encodedPath + "?" + url.encodedQuery
            val page = url.queryParameter("page")!!.toInt()
            val body = """{"success":true,"message":"ok","data":{"products":[${pages[page - 1]}],
                "pagination":{"page":$page,"limit":100,"total":3,"totalPages":${pages.size}}}}"""
            Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("")
                .body(body.toResponseBody("application/json".toMediaType())).build()
        }
        val session = SessionManager()
        return ProductRepository(ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build()))
    }

    @After
    fun clearCatalogue() = ProductCatalog.replace(emptyList())

    @Test
    fun `loads every page and maps the backend's products for the app`() = runBlocking {
        val repo = repository(
            listOf(
                product("w1", "Oak Wall Panel", "Wall Panels", "1850.50") + "," + product("c1", "White Ceiling", "Ceiling Panels", "450"),
                product("w2", "Grey Wall Panel", "Wall Panels", null)
            )
        )

        assertNull(repo.refresh())

        assertEquals(listOf("/api/products?page=1&limit=100", "/api/products?page=2&limit=100"), requestedUrls)
        assertEquals(3, ProductCatalog.allPanels.size)
        val oak = repo.getPanelById("w1")!!
        assertEquals(1850.50, oak.pricePerUnit!!, 0.001)
        // Sizes are entered in centimetres on the website.
        assertEquals(0.60, oak.widthMeters, 0.0001)
        assertEquals(2.40, oak.heightMeters, 0.0001)
        assertEquals(12, oak.thicknessMm)
        // Available = quantity - reserved.
        assertEquals(6, oak.inventoryQty)
        assertTrue(oak.inStock)
        // The primary photo, made absolute against the backend's host.
        assertEquals("https://backend.test/uploads/w1.webp", oak.imageUrl)
        assertEquals(SurfaceType.CEILING, repo.getPanelById("c1")!!.surfaceType)
        // Signed out: no price.
        assertNull(repo.getPanelById("w2")!!.pricePerUnit)
    }

    @Test
    fun `filtering by category and search runs on the loaded catalogue`() = runBlocking {
        val repo = repository(
            listOf(product("w1", "Oak Wall Panel", "Wall Panels", "1850") + "," + product("c1", "White Ceiling", "Ceiling Panels", "450"))
        )

        val walls = repo.fetchProducts(categoryId = "wall").toList().last() as Resource.Success
        assertTrue(walls.data.all { it.surfaceType == SurfaceType.WALL })
        assertEquals(1, walls.data.size)

        val search = repo.fetchProducts(search = "white").toList().last() as Resource.Success
        assertEquals(listOf("White Ceiling"), search.data.map { it.name })
    }

    @Test
    fun `offline keeps the last catalogue and says why`() = runBlocking {
        val good = repository(listOf(product("w1", "Oak Wall Panel", "Wall Panels", "1850")))
        good.refresh()

        val offline = ProductRepository(
            ApiClient("https://backend.test/api/", SessionManager(), OkHttpClient.Builder().addInterceptor { throw IOException("offline") }.build())
        )
        val result = offline.fetchProducts().toList().last()

        result as Resource.Error
        assertEquals(ApiClient.NETWORK_ERROR_MESSAGE, result.message)
        assertEquals(listOf("Oak Wall Panel"), result.cachedData!!.map { it.name })
        assertEquals(1, ProductCatalog.allPanels.size)
    }
}
