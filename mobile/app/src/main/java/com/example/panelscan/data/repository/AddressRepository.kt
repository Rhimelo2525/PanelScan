package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

/** A delivery address saved to the customer's account (the same list as on the website). */
@Serializable
data class SavedAddress(
    val id: String,
    val label: String? = null,
    val recipientName: String,
    val recipientPhone: String,
    val addressLine1: String,
    val regionCode: String,
    val regionName: String,
    val provinceCode: String? = null,
    val provinceName: String? = null,
    val cityMunicipalityCode: String,
    val cityMunicipalityName: String,
    val barangayCode: String,
    val barangayName: String,
    val postalCode: String,
    val formattedAddress: String,
    val latitude: Double,
    val longitude: Double,
    val isDefault: Boolean = false
)

/** What the add-address form sends; every place has its official PSGC code and the customer's own map pin. */
@Serializable
data class SavedAddressInput(
    val label: String? = null,
    val recipientName: String,
    val recipientPhone: String,
    val addressLine1: String,
    val regionCode: String,
    val regionName: String,
    val provinceCode: String? = null,
    val provinceName: String? = null,
    val cityMunicipalityCode: String,
    val cityMunicipalityName: String,
    val barangayCode: String,
    val barangayName: String,
    val postalCode: String,
    val latitude: Double,
    val longitude: Double,
    val isDefault: Boolean? = null
)

/** One official place (region, province, city or barangay) from the backend's PSGC list. */
@Serializable
data class Place(val code: String, val name: String, val hasProvinces: Boolean = true)

/** What the backend could read off a map pin, to pre-fill the form; null fields are left for the customer. */
@Serializable
data class AddressSuggestion(
    val status: String,
    val detectedAddress: String? = null,
    val addressLine1: String? = null,
    val regionCode: String? = null,
    val regionName: String? = null,
    val provinceCode: String? = null,
    val provinceName: String? = null,
    val cityMunicipalityCode: String? = null,
    val cityMunicipalityName: String? = null,
    val barangayCode: String? = null,
    val barangayName: String? = null,
    val postalCode: String? = null,
    /** False when the pin is outside the delivery area; null when the region couldn't be read. */
    val inCoverage: Boolean? = null
)

/**
 * Saved delivery addresses (/api/addresses) and the official place lists the
 * address form picks from (/api/delivery/regions...). Checkout sends a saved
 * address's id; the backend copies it into the order.
 */
class AddressRepository(private val api: ApiClient) {

    private val _addresses = MutableStateFlow<List<SavedAddress>>(emptyList())
    val addresses: StateFlow<List<SavedAddress>> = _addresses.asStateFlow()

    /** Loads the saved addresses (default first); null on success, else why it failed. */
    suspend fun refresh(): String? = try {
        val result: AddressList = api.get("/addresses", authenticated = true)
        _addresses.value = result.addresses.sortedByDescending { it.isDefault }
        null
    } catch (error: ApiException) {
        error.message
    }

    suspend fun create(input: SavedAddressInput): Result<SavedAddress> = try {
        val result: AddressResponse = api.post("/addresses", input, authenticated = true)
        refresh()
        Result.success(result.address)
    } catch (error: ApiException) {
        Result.failure(AddressException(error.message.orEmpty(), error.fieldErrors))
    }

    suspend fun regions(): List<Place> = api.get<RegionList>("/delivery/regions", authenticated = true).regions

    suspend fun provinces(regionCode: String): List<Place> =
        api.get<ProvinceList>("/delivery/provinces?regionCode=$regionCode", authenticated = true).provinces

    suspend fun cities(regionCode: String, provinceCode: String?): List<Place> =
        api.get<CityList>(
            "/delivery/cities?regionCode=$regionCode" + (provinceCode?.let { "&provinceCode=$it" } ?: ""),
            authenticated = true
        ).cities

    suspend fun barangays(cityCode: String): List<Place> =
        api.get<BarangayList>("/delivery/barangays?cityCode=$cityCode", authenticated = true).barangays

    /** Reads an address off the customer's map pin; never moves the pin. */
    suspend fun suggestForPin(latitude: Double, longitude: Double): AddressSuggestion? = runCatching {
        api.get<SuggestionResponse>("/addresses/reverse-geocode?latitude=$latitude&longitude=$longitude", authenticated = true).suggestion
    }.getOrNull()

    fun onSignedOut() {
        _addresses.value = emptyList()
    }

    @Serializable
    private data class AddressList(val addresses: List<SavedAddress>)

    @Serializable
    private data class AddressResponse(val address: SavedAddress)

    @Serializable
    private data class RegionList(val regions: List<Place>)

    @Serializable
    private data class ProvinceList(val provinces: List<Place>)

    @Serializable
    private data class CityList(val cities: List<Place>)

    @Serializable
    private data class BarangayList(val barangays: List<Place>)

    @Serializable
    private data class SuggestionResponse(val suggestion: AddressSuggestion)
}

/** A refused address, with the backend's reason per field ("postalCode", "recipientPhone"...). */
class AddressException(message: String, val fieldErrors: Map<String, String>) : Exception(message)
