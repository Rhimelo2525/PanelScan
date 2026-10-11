package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.feature.address.formatPhilippinePhone
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

/** The profile's saved addresses against a fake /api/addresses that behaves like the live backend. */
class AddressRepositoryApiTest {

    private val calls = mutableListOf<String>()

    private data class Row(val id: String, val label: String, val isDefault: Boolean, val city: String = "Makati City") {
        fun json() =
            """{"id":"$id","label":"$label","recipientName":"Juan Dela Cruz","recipientPhone":"+639171234567",
               "addressLine1":"12 Mabini St","regionCode":"1300000000","regionName":"NCR","provinceCode":null,"provinceName":null,
               "cityMunicipalityCode":"1380300000","cityMunicipalityName":"$city","barangayCode":"1380300001","barangayName":"Bel-Air",
               "postalCode":"1209","formattedAddress":"12 Mabini St, Bel-Air, $city","latitude":14.56,"longitude":121.03,"isDefault":$isDefault}"""
    }

    private var rows = mutableListOf(Row("a1", "Home", true), Row("a2", "Office", false))

    private fun repository(): AddressRepository {
        val backend = Interceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath.removePrefix("/api")
            val body = request.body?.let { Buffer().also(it::writeTo).readUtf8() }.orEmpty()
            calls += "${request.method} $path"
            val id = path.removePrefix("/addresses/").substringBefore("/")
            val data: String? = when {
                request.method == "GET" -> """{"addresses":[${rows.joinToString(",") { it.json() }}]}"""
                request.method == "PUT" && rows.none { it.id == id } -> null
                request.method == "PUT" -> {
                    val city = Regex("\"cityMunicipalityName\":\"([^\"]+)\"").find(body)!!.groupValues[1]
                    rows = rows.map { if (it.id == id) it.copy(city = city) else it }.toMutableList()
                    """{"address":${rows.first { it.id == id }.json()}}"""
                }
                request.method == "PATCH" -> {
                    rows = rows.map { it.copy(isDefault = it.id == id) }.toMutableList()
                    """{"address":${rows.first { it.id == id }.json()}}"""
                }
                else -> {
                    // Deleting the default promotes the next one, as the backend does.
                    val wasDefault = rows.first { it.id == id }.isDefault
                    rows.removeAll { it.id == id }
                    if (wasDefault && rows.isNotEmpty()) rows[0] = rows[0].copy(isDefault = true)
                    "null"
                }
            }
            val json = if (data == null) """{"success":false,"message":"Address not found."}""" else """{"success":true,"message":"ok","data":$data}"""
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(if (data == null) 404 else 200).message("")
                .body(json.toResponseBody("application/json".toMediaType())).build()
        }
        val session = SessionManager().apply {
            saveTokens("access", "refresh")
            setCustomerSession(CustomerUser(id = "me", firstName = "Juan", lastName = "Dela Cruz", email = "juan@gmail.com"))
        }
        return AddressRepository(ApiClient("https://backend.test/api/", session, OkHttpClient.Builder().addInterceptor(backend).build()))
    }

    private fun input(city: String) = SavedAddressInput(
        label = "Home", recipientName = "Juan Dela Cruz", recipientPhone = "+639171234567", addressLine1 = "12 Mabini St",
        regionCode = "1300000000", regionName = "NCR", cityMunicipalityCode = "1380300000", cityMunicipalityName = city,
        barangayCode = "1380300001", barangayName = "Bel-Air", postalCode = "1209", latitude = 14.56, longitude = 121.03, isDefault = true
    )

    @Test
    fun `editing replaces the address and reloads the list`() = runBlocking {
        val repo = repository()
        repo.refresh()
        calls.clear()

        val saved = repo.update("a1", input("Taguig City")).getOrThrow()

        assertEquals("Taguig City", saved.cityMunicipalityName)
        assertEquals(listOf("PUT /addresses/a1", "GET /addresses"), calls)
        assertEquals("Taguig City", repo.addresses.value.first { it.id == "a1" }.cityMunicipalityName)
        assertEquals("Address not found.", repo.update("gone", input("Pasig City")).exceptionOrNull()?.message)
    }

    @Test
    fun `setting a default and deleting keep the default first`() = runBlocking {
        val repo = repository()
        repo.refresh()

        assertNull(repo.setDefault("a2"))
        assertEquals(listOf("a2", "a1"), repo.addresses.value.map { it.id })
        assertTrue(calls.contains("PATCH /addresses/a2/default"))

        assertNull(repo.delete("a2"))
        assertEquals(listOf("a1"), repo.addresses.value.map { it.id })
        assertTrue(repo.addresses.value.single().isDefault)
        assertTrue(calls.contains("DELETE /addresses/a2"))
    }

    @Test
    fun `phone numbers read as on the website`() {
        assertEquals("+63 960 305 2318", formatPhilippinePhone("+639603052318"))
        assertEquals("09603052318", formatPhilippinePhone("09603052318"))
    }
}
