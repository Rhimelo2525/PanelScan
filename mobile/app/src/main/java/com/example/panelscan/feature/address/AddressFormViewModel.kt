package com.example.panelscan.feature.address

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.location.ExactDeliveryLocation
import com.example.panelscan.core.network.ApiException
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.data.repository.AddressException
import com.example.panelscan.data.repository.AddressRepository
import com.example.panelscan.data.repository.Place
import com.example.panelscan.data.repository.SavedAddress
import com.example.panelscan.data.repository.SavedAddressInput
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AddressFormState(
    val label: String = "",
    val recipientName: String = "",
    /** 10 local digits after +63. */
    val recipientPhone: String = "",
    val addressLine1: String = "",
    val region: Place? = null,
    val province: Place? = null,
    val city: Place? = null,
    val barangay: Place? = null,
    val postalCode: String = "",
    val pin: ExactDeliveryLocation? = null,
    val isDefault: Boolean = false,
    val regions: List<Place> = emptyList(),
    val provinces: List<Place> = emptyList(),
    val cities: List<Place> = emptyList(),
    val barangays: List<Place> = emptyList(),
    val pinNotice: String? = null,
    /** The saved address being edited; null when adding one. */
    val editingId: String? = null,
    /** The first address, or the current default: stays the default (another is made default from the list). */
    val defaultLocked: Boolean = false,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val fieldErrors: Map<String, String> = emptyMap()
) {
    /** NCR has no provinces: its cities hang directly off the region. */
    val needsProvince: Boolean get() = region?.hasProvinces != false

    val isEditing: Boolean get() = editingId != null
}

/**
 * Adding or editing a saved delivery address, as on the website: the customer pins the
 * spot on the map (required, so the rider finds it), the backend reads the
 * address off the pin to pre-fill the form, and every place is picked from the
 * official PSGC list (regions the delivery service covers).
 */
class AddressFormViewModel(
    private val addressRepository: AddressRepository,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _state = MutableStateFlow(AddressFormState())
    val state: StateFlow<AddressFormState> = _state.asStateFlow()

    /** Starts a fresh form, with the signed-in customer as the recipient; the first address is "Home" and the default. */
    fun start() {
        val user = sessionManager.getCurrentUser()
        val first = addressRepository.addresses.value.isEmpty()
        _state.value = AddressFormState(
            label = if (first) "Home" else "",
            recipientName = user?.fullName.orEmpty(),
            recipientPhone = user?.phone?.filter { it.isDigit() }?.takeLast(10).orEmpty(),
            isDefault = first,
            defaultLocked = first
        )
        load { copy(regions = addressRepository.regions()) }
    }

    /** Opens a saved address for editing, with its pin and places already chosen. */
    fun startEditing(address: SavedAddress) {
        val region = Place(address.regionCode, address.regionName, hasProvinces = address.provinceCode != null)
        val province = address.provinceCode?.let { Place(it, address.provinceName.orEmpty()) }
        val city = Place(address.cityMunicipalityCode, address.cityMunicipalityName)
        _state.value = AddressFormState(
            label = address.label.orEmpty(),
            recipientName = address.recipientName,
            recipientPhone = address.recipientPhone.filter { it.isDigit() }.takeLast(10),
            addressLine1 = address.addressLine1,
            region = region,
            province = province,
            city = city,
            barangay = Place(address.barangayCode, address.barangayName),
            postalCode = address.postalCode,
            pin = ExactDeliveryLocation(address.latitude, address.longitude),
            isDefault = address.isDefault,
            editingId = address.id,
            defaultLocked = address.isDefault
        )
        load {
            copy(
                regions = addressRepository.regions(),
                provinces = if (province != null) addressRepository.provinces(region.code) else emptyList(),
                cities = addressRepository.cities(region.code, province?.code),
                barangays = addressRepository.barangays(city.code)
            )
        }
    }

    fun onLabelChange(value: String) = edit { copy(label = value.take(30)) }
    fun onRecipientNameChange(value: String) = edit { copy(recipientName = value.take(100)) }
    fun onRecipientPhoneChange(value: String) = edit { copy(recipientPhone = value.filter { it.isDigit() }.take(10)) }
    fun onAddressLineChange(value: String) = edit { copy(addressLine1 = value.take(200)) }
    fun onPostalCodeChange(value: String) = edit { copy(postalCode = value.filter { it.isDigit() }.take(10)) }
    fun onDefaultChange(value: Boolean) = edit { if (defaultLocked) this else copy(isDefault = value) }

    fun onRegionSelected(region: Place) {
        edit { copy(region = region, province = null, city = null, barangay = null, provinces = emptyList(), cities = emptyList(), barangays = emptyList()) }
        load {
            if (region.hasProvinces) copy(provinces = addressRepository.provinces(region.code))
            else copy(cities = addressRepository.cities(region.code, null))
        }
    }

    fun onProvinceSelected(province: Place) {
        val region = _state.value.region ?: return
        edit { copy(province = province, city = null, barangay = null, cities = emptyList(), barangays = emptyList()) }
        load { copy(cities = addressRepository.cities(region.code, province.code)) }
    }

    fun onCitySelected(city: Place) {
        edit { copy(city = city, barangay = null, barangays = emptyList()) }
        load { copy(barangays = addressRepository.barangays(city.code)) }
    }

    fun onBarangaySelected(barangay: Place) = edit { copy(barangay = barangay) }

    /** The customer confirmed a map pin: keep it, and pre-fill whatever the backend can read off it. */
    fun onPinConfirmed(location: ExactDeliveryLocation) {
        edit { copy(pin = location, pinNotice = "Reading the address at your pin…") }
        viewModelScope.launch {
            val suggestion = addressRepository.suggestForPin(location.latitude, location.longitude)
            if (suggestion == null || suggestion.regionCode == null) {
                edit { copy(pinNotice = "Pin saved. Fill in the address below.") }
                return@launch
            }
            if (suggestion.inCoverage == false) {
                edit { copy(pinNotice = "This pin is outside our delivery area (Luzon). Choose a location we deliver to.") }
                return@launch
            }
            runCatching {
                val region = Place(suggestion.regionCode, suggestion.regionName.orEmpty(), hasProvinces = suggestion.provinceCode != null)
                val province = suggestion.provinceCode?.let { Place(it, suggestion.provinceName.orEmpty()) }
                val city = suggestion.cityMunicipalityCode?.let { Place(it, suggestion.cityMunicipalityName.orEmpty()) }
                val barangay = suggestion.barangayCode?.let { Place(it, suggestion.barangayName.orEmpty()) }
                val provinces = if (province != null) addressRepository.provinces(region.code) else emptyList()
                val cities = addressRepository.cities(region.code, province?.code)
                val barangays = city?.let { addressRepository.barangays(it.code) } ?: emptyList()
                edit {
                    copy(
                        region = region, province = province, city = city, barangay = barangay,
                        provinces = provinces, cities = cities, barangays = barangays,
                        addressLine1 = addressLine1.ifBlank { suggestion.addressLine1.orEmpty() },
                        postalCode = postalCode.ifBlank { suggestion.postalCode.orEmpty() },
                        pinNotice = if (suggestion.status == "complete") "Address filled in from your pin. Add your house or unit number and check it."
                        else "Some of the address was filled in from your pin. Complete the rest below."
                    )
                }
            }.onFailure { edit { copy(pinNotice = "Pin saved. Fill in the address below.") } }
        }
    }

    /** Checks the form before saving (or before asking to confirm an edit); false shows why. */
    fun validate(): Boolean {
        val s = _state.value
        val problem = when {
            s.pin == null -> "Pin your location on the map first."
            s.recipientName.trim().length < 2 -> "Enter the recipient's full name."
            s.recipientPhone.length != 10 || !s.recipientPhone.startsWith("9") -> "Please enter a valid Philippine mobile number with 10 digits."
            s.addressLine1.trim().length < 2 -> "Enter the house/unit number, building, or street."
            s.region == null -> "Select a region."
            s.needsProvince && s.province == null -> "Select a province."
            s.city == null -> "Select a city or municipality."
            s.barangay == null -> "Select a barangay."
            s.postalCode.length < 3 -> "Enter a valid postal code."
            else -> null
        }
        if (problem != null) edit { copy(errorMessage = problem) }
        return problem == null
    }

    fun save(onSaved: (SavedAddress) -> Unit) {
        val s = _state.value
        if (s.isSaving || !validate()) return
        edit { copy(isSaving = true, errorMessage = null, fieldErrors = emptyMap()) }
        viewModelScope.launch {
            val input = SavedAddressInput(
                label = s.label.trim().ifBlank { null },
                recipientName = s.recipientName.trim(),
                recipientPhone = "+63${s.recipientPhone}",
                addressLine1 = s.addressLine1.trim(),
                regionCode = s.region!!.code,
                regionName = s.region.name,
                provinceCode = s.province?.code,
                provinceName = s.province?.name,
                cityMunicipalityCode = s.city!!.code,
                cityMunicipalityName = s.city.name,
                barangayCode = s.barangay!!.code,
                barangayName = s.barangay.name,
                postalCode = s.postalCode,
                latitude = s.pin!!.latitude,
                longitude = s.pin.longitude,
                isDefault = s.isDefault
            )
            val result = s.editingId?.let { addressRepository.update(it, input) } ?: addressRepository.create(input)
            result.onSuccess { saved ->
                edit { copy(isSaving = false) }
                onSaved(saved)
            }.onFailure { error ->
                val fields = (error as? AddressException)?.fieldErrors.orEmpty()
                edit { copy(isSaving = false, errorMessage = error.message, fieldErrors = fields) }
            }
        }
    }

    /** Any change clears the last error; a change that sets one keeps it. */
    private fun edit(change: AddressFormState.() -> AddressFormState) = _state.update { it.copy(errorMessage = null).change() }

    /** Loads a place list; a failure is shown instead of leaving an empty picker unexplained. */
    private fun load(block: suspend AddressFormState.() -> AddressFormState) {
        viewModelScope.launch {
            try {
                val next = _state.value.block()
                _state.update { current ->
                    current.copy(regions = next.regions, provinces = next.provinces, cities = next.cities, barangays = next.barangays)
                }
            } catch (error: ApiException) {
                _state.update { it.copy(errorMessage = error.message) }
            }
        }
    }
}
