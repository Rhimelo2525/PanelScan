package com.example.panelscan.feature.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.delivery.DeliveryBookingRequest
import com.example.panelscan.core.delivery.DeliveryBookingState
import com.example.panelscan.core.delivery.DeliveryCoordination
import com.example.panelscan.core.delivery.DeliveryCoordinationStatus
import com.example.panelscan.core.delivery.DeliveryQuoteRequest
import com.example.panelscan.core.delivery.DeliveryQuoteState
import com.example.panelscan.core.delivery.DeliveryResult
import com.example.panelscan.core.delivery.DeliveryVehicle
import com.example.panelscan.core.location.DeliveryLocationRules
import com.example.panelscan.core.location.ExactDeliveryLocation
import com.example.panelscan.core.location.LocationSource
import com.example.panelscan.core.location.PhilippineGeocodeNormalizer
import com.example.panelscan.core.location.ResolvedDeliveryAddress
import com.example.panelscan.core.model.CartItem
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderDeliveryDetails
import com.example.panelscan.core.payment.GCashPaymentProvider
import com.example.panelscan.core.payment.GCashPaymentRequest
import com.example.panelscan.core.payment.PaymentState
import com.example.panelscan.core.payment.PaymentStateMachine
import com.example.panelscan.core.payment.PaymentUiState
import com.example.panelscan.core.payment.UnconfiguredGCashPaymentProvider
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.core.delivery.UnconfiguredDeliveryProvider
import com.example.panelscan.data.repository.CartRepository
import com.example.panelscan.data.repository.DeliveryRepository
import com.example.panelscan.data.repository.OrderRepository
import com.example.panelscan.data.local.CheckoutDraft
import com.example.panelscan.data.local.CheckoutDraftStore
import com.example.panelscan.data.local.InMemoryCheckoutDraftStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class CheckoutUiState(
    // Recipient details
    val fullName: String = "",
    val email: String = "",
    val phone: String = "",
    // Structured Philippine address
    val street: String = "",
    val region: String = "",
    val province: String = "",
    val city: String = "",
    val barangay: String = "",
    val postalCode: String = "",
    // Optional
    val orderNotes: String = "",
    // Legacy flat field kept for compatibility — rebuilt from structured fields
    val address: String = "",
    // Exact delivery location (map pin)
    val exactLocation: ExactDeliveryLocation? = null,
    // Delivery coordination
    val vehicles: List<DeliveryVehicle> = emptyList(),
    val vehiclesLive: Boolean = false,
    val vehiclesMessage: String? = null,
    val selectedVehicle: DeliveryVehicle? = null,
    val quoteState: DeliveryQuoteState = DeliveryQuoteState.NotReady(emptyList()),
    val bookingState: DeliveryBookingState = DeliveryBookingState.NotBooked,
    val deliveryProviderName: String = "Lalamove",
    val deliveryConfigured: Boolean = false,
    // Payment (GCash only)
    val payment: PaymentUiState = PaymentUiState(),
    val paymentConfigured: Boolean = false,
    // Other
    val hasInstallation: Boolean = false,
    val selectedPayment: String = "GCash",
    val notes: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null
) {
    /** A formatted single-line address built from the structured fields. */
    val formattedAddress: String
        get() {
            val parts = mutableListOf<String>()
            if (street.isNotBlank()) parts += street.trim()
            if (barangay.isNotBlank()) parts += "Brgy. ${barangay.trim()}"
            if (city.isNotBlank()) parts += city.trim()
            if (province.isNotBlank()) parts += province.trim()
            if (region.isNotBlank()) parts += region.trim()
            if (postalCode.isNotBlank()) parts += postalCode.trim()
            return parts.joinToString(", ")
        }

    /** True when all required address fields are filled. */
    val addressComplete: Boolean
        get() = street.isNotBlank() &&
            region.isNotBlank() &&
            province.isNotBlank() &&
            city.isNotBlank() &&
            barangay.isNotBlank() &&
            postalCode.isNotBlank()

    val coordinationStatus: DeliveryCoordinationStatus
        get() = DeliveryCoordination.status(quoteState, payment.state, bookingState)

    /** Delivery details are frozen once the fee is paid, so the paid price stays valid. */
    val deliveryLocked: Boolean get() = payment.state == PaymentState.PAID || payment.state == PaymentState.PROCESSING

    /** The delivery fee, only when a provider actually quoted it. */
    val quotedFee: Double?
        get() = (quoteState as? DeliveryQuoteState.Received)?.quote?.fee
}

/** The recipient and address rules, in the order the fields appear on screen. */
object CheckoutValidator {

    fun validate(state: CheckoutUiState, selectedItemCount: Int): String? {
        if (selectedItemCount <= 0) return "Please select at least one item to checkout."
        if (state.fullName.trim().length < 2) return "Please enter the recipient's full name."
        val cleanPhone = state.phone.trim()
        if (cleanPhone.isBlank()) return "Please enter a contact number for delivery."
        if (cleanPhone.length != 10 || !cleanPhone.startsWith("9")) {
            return "Please enter a valid 10-digit Philippine mobile number starting with 9."
        }
        if (state.street.trim().isBlank()) return "Please enter the street / building / unit address."
        if (state.barangay.trim().isBlank()) return "Please select your barangay."
        if (state.city.trim().isBlank()) return "Please select your city / municipality."
        if (state.province.trim().isBlank()) return "Please select your province."
        if (state.postalCode.trim().isBlank()) return "Please enter your postal code."
        if (!state.postalCode.trim().matches(Regex("\\d{4}"))) return "Please enter a 4-digit Philippine postal code."
        if (state.region.trim().isBlank()) return "Please select your region."
        state.exactLocation?.let { location ->
            DeliveryLocationRules.validate(location)?.let { return DeliveryLocationRules.message(it) }
        }
        return null
    }
}

/** Only geocoder-returned components are copied; manual fields stay editable. */
object CheckoutAddressAutofill {
    /** Confirming is an explicit request to refresh the address, even at the same coordinates. */
    fun confirm(current: CheckoutUiState, location: ExactDeliveryLocation): CheckoutUiState {
        val resolved = location.resolvedAddress
        val updated = if (resolved == null) current else apply(current, resolved, replaceExisting = true)
        return updated.copy(
            exactLocation = location,
            errorMessage = when {
                resolved == null ->
                    "Location selected. Address lookup was unavailable; check that the saved address matches this pin."
                !updated.addressComplete ->
                    "Location selected. Complete the missing address fields and check them against the pin."
                resolved.street.isBlank() || resolved.barangay.isBlank() || resolved.city.isBlank() ||
                    resolved.postalCode.isBlank() ->
                    "Location selected. The lookup omitted some details; check that the saved address matches this pin."
                else -> null
            }
        )
    }

    fun apply(current: CheckoutUiState, resolved: ResolvedDeliveryAddress, replaceExisting: Boolean): CheckoutUiState {
        val province = resolved.province.ifBlank {
            com.example.panelscan.core.data.PhilippineAddress.findProvinceForCity(resolved.city).orEmpty()
        }
        val region = resolved.region.ifBlank {
            com.example.panelscan.core.data.PhilippineAddress.findRegionForProvince(province)?.name.orEmpty()
        }
        val areaChanged = replaceExisting && (
            (province.isNotBlank() && current.province.isNotBlank() &&
                !PhilippineGeocodeNormalizer.samePlace(province, current.province)) ||
                (resolved.city.isNotBlank() && current.city.isNotBlank() &&
                    !PhilippineGeocodeNormalizer.samePlace(resolved.city, current.city)) ||
                (region.isNotBlank() && current.region.isNotBlank() &&
                    !PhilippineGeocodeNormalizer.samePlace(region, current.region))
            )
        fun value(old: String, proposed: String, clearForNewArea: Boolean = false): String = when {
            proposed.isNotBlank() && replaceExisting -> proposed.trim()
            proposed.isNotBlank() && old.isBlank() -> proposed.trim()
            areaChanged && clearForNewArea -> ""
            else -> old
        }
        val street = when {
            resolved.street.isBlank() -> if (areaChanged) "" else current.street
            !replaceExisting -> current.street.ifBlank { resolved.street.trim() }
            else -> resolved.street.trim()
        }
        return current.copy(
            street = street,
            barangay = value(current.barangay, resolved.barangay, clearForNewArea = true),
            city = value(current.city, resolved.city, clearForNewArea = true),
            province = value(current.province, province, clearForNewArea = true),
            postalCode = value(current.postalCode, resolved.postalCode, clearForNewArea = true),
            region = value(current.region, region, clearForNewArea = true)
        )
    }
}

/** A direct purchase takes one explicit item; cart selection is used only in cart checkout. */
object CheckoutItemSelection {
    fun items(cartItems: List<CartItem>, selectedIds: Set<String>, directItem: CartItem?): List<CartItem> =
        directItem?.let { listOf(it) } ?: cartItems.filter { it.id in selectedIds }
}

class CheckoutViewModel(
    private val cartRepository: CartRepository,
    private val orderRepository: OrderRepository,
    private val sessionManager: SessionManager,
    private val deliveryRepository: DeliveryRepository = DeliveryRepository(UnconfiguredDeliveryProvider()),
    private val paymentProvider: GCashPaymentProvider = UnconfiguredGCashPaymentProvider(),
    private val draftStore: CheckoutDraftStore = InMemoryCheckoutDraftStore(),
    private val clock: () -> Long = System::currentTimeMillis
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        CheckoutUiState(
            deliveryProviderName = deliveryRepository.providerName,
            deliveryConfigured = deliveryRepository.isConfigured,
            paymentConfigured = paymentProvider.isConfigured
        )
    )
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    val cartItems: StateFlow<List<CartItem>> = cartRepository.items

    private val directItem = MutableStateFlow<CartItem?>(null)
    private var activeCustomerKey = "guest"
    private var profilePhoneAtSave = ""

    /** Only the ticked cart items are checked out; the rest stay in the cart. */
    val checkoutItemsFlow: StateFlow<List<CartItem>> =
        combine(cartRepository.items, cartRepository.selectedItemIds, directItem) { items, selected, direct ->
            CheckoutItemSelection.items(items, selected, direct)
        }.stateIn(viewModelScope, SharingStarted.Eagerly, cartRepository.selectedItems)

    /** Reference shared by the quote, the GCash payment and the delivery booking. */
    var checkoutReference: String = newReference()
        private set

    private fun newReference() = "PSC-" + UUID.randomUUID().toString().take(8).uppercase()

    /** Snapshot of what the current quote was priced for. */
    private var quotedFor: QuoteKey? = null

    private data class QuoteKey(val vehicle: String, val lat: Double, val lng: Double, val address: String)

    /** One-shot: a GCash checkout page to open. Consumed by the screen. */
    private val _openUrl = MutableStateFlow<String?>(null)
    val openUrl: StateFlow<String?> = _openUrl.asStateFlow()

    init {
        onCheckoutOpened()
        viewModelScope.launch {
            val options = deliveryRepository.vehicleOptions()
            _uiState.update {
                it.copy(vehicles = options.vehicles, vehiclesLive = options.live, vehiclesMessage = options.message)
            }
            refreshQuoteState()
        }
        viewModelScope.launch {
            checkoutItemsFlow.collect { refreshQuoteState() }
        }
    }

    /** Reloads the current customer's private draft whenever checkout is entered. */
    fun onCheckoutOpened() {
        val session = sessionManager.sessionState.value
        val user = (session as? CustomerSessionState.LoggedIn)?.user
        activeCustomerKey = user?.email?.trim()?.lowercase().orEmpty().ifBlank { "guest" }
        val profilePhone = user?.phone?.filter(Char::isDigit).orEmpty().let { digits ->
            when {
                digits.startsWith("63") && digits.length == 12 -> digits.drop(2)
                digits.startsWith("0") && digits.length == 11 -> digits.drop(1)
                else -> digits.takeLast(10)
            }
        }
        val draft = draftStore.load(activeCustomerKey)
        profilePhoneAtSave = profilePhone
        _uiState.update { current ->
            val savedPhone = draft?.phone.orEmpty()
            current.copy(
                fullName = draft?.fullName?.takeIf { it.isNotBlank() } ?: user?.fullName.orEmpty(),
                email = user?.email.orEmpty(),
                phone = when {
                    savedPhone.isBlank() -> profilePhone
                    draft?.profilePhoneAtSave?.isNotBlank() == true &&
                        savedPhone == draft.profilePhoneAtSave && profilePhone != draft.profilePhoneAtSave -> profilePhone
                    else -> savedPhone
                },
                street = draft?.street.orEmpty(),
                barangay = draft?.barangay.orEmpty(),
                city = draft?.city.orEmpty(),
                province = draft?.province.orEmpty(),
                postalCode = draft?.postalCode.orEmpty(),
                region = draft?.region.orEmpty(),
                exactLocation = draft?.let { saved ->
                    if (saved.latitude == null || saved.longitude == null) null else {
                        ExactDeliveryLocation(
                            saved.latitude, saved.longitude, saved.locationAddress,
                            runCatching { LocationSource.valueOf(saved.locationSource.orEmpty()) }
                                .getOrDefault(LocationSource.MAP_PIN)
                        ).takeIf { DeliveryLocationRules.validate(it) == null }
                    }
                }
            )
        }
    }

    fun beginDirectCheckout(panel: PVCPanel, quantity: Int) {
        require(quantity > 0)
        directItem.value = CartItem(id = "direct-${panel.id}", panel = panel, quantity = quantity)
    }

    fun clearDirectCheckout() {
        directItem.value = null
    }

    private fun saveDraft(state: CheckoutUiState) {
        val location = state.exactLocation
        draftStore.save(activeCustomerKey, CheckoutDraft(
            fullName = state.fullName,
            phone = state.phone,
            street = state.street,
            barangay = state.barangay,
            city = state.city,
            province = state.province,
            postalCode = state.postalCode,
            region = state.region,
            latitude = location?.latitude,
            longitude = location?.longitude,
            locationAddress = location?.addressLine,
            locationSource = location?.source?.name,
            profilePhoneAtSave = profilePhoneAtSave
        ))
    }

    // ---- recipient
    fun onFullNameChange(value: String) = edit { it.copy(fullName = value, errorMessage = null) }
    fun onEmailChange(value: String) = edit { it.copy(email = value, errorMessage = null) }
    fun onPhoneChange(value: String) {
        val clean = value.filter { it.isDigit() }.take(10)
        edit { it.copy(phone = clean, errorMessage = null) }
    }

    // ---- address fields
    fun onStreetChange(value: String) = edit { it.copy(street = value, errorMessage = null) }
    fun onPostalCodeChange(value: String) = edit { it.copy(postalCode = value.filter { c -> c.isDigit() }.take(4), errorMessage = null) }
    fun onOrderNotesChange(value: String) = _uiState.update { it.copy(orderNotes = value) }

    fun onRegionSelected(value: String) = edit {
        it.copy(region = value, province = "", city = "", barangay = "", errorMessage = null)
    }

    fun onProvinceSelected(value: String) = edit { current ->
        val autoRegion = if (current.region.isBlank()) {
            com.example.panelscan.core.data.PhilippineAddress.findRegionForProvince(value)?.name.orEmpty()
        } else current.region
        current.copy(
            province = value,
            region = if (autoRegion.isNotBlank()) autoRegion else current.region,
            city = "",
            barangay = "",
            errorMessage = null
        )
    }

    fun onCitySelected(value: String) = edit { current ->
        val autoProvince = if (current.province.isBlank()) {
            com.example.panelscan.core.data.PhilippineAddress.findProvinceForCity(value).orEmpty()
        } else current.province
        val autoRegion = if (current.region.isBlank() && autoProvince.isNotBlank()) {
            com.example.panelscan.core.data.PhilippineAddress.findRegionForProvince(autoProvince)?.name.orEmpty()
        } else current.region
        current.copy(
            city = value,
            province = if (autoProvince.isNotBlank()) autoProvince else current.province,
            region = if (autoRegion.isNotBlank()) autoRegion else current.region,
            barangay = "",
            errorMessage = null
        )
    }

    fun onBarangaySelected(value: String) = edit {
        it.copy(barangay = value, errorMessage = null)
    }

    // ---- legacy passthrough (kept so no other call sites break)
    fun onAddressChange(value: String) = _uiState.update { it.copy(address = value, errorMessage = null) }
    fun onNotesChange(value: String) = _uiState.update { it.copy(notes = value) }

    // ---- exact location
    fun onExactLocationConfirmed(location: ExactDeliveryLocation) {
        val problem = DeliveryLocationRules.validate(location)
        if (problem != null) {
            _uiState.update { it.copy(errorMessage = DeliveryLocationRules.message(problem)) }
            return
        }
        edit { current -> CheckoutAddressAutofill.confirm(current, location) }
    }

    fun onExactLocationCleared() = edit { it.copy(exactLocation = null) }

    // ---- delivery coordination
    fun onVehicleSelected(vehicle: DeliveryVehicle) = edit { it.copy(selectedVehicle = vehicle, errorMessage = null) }

    /** Step 1 → 2. Asks for a price only; nothing is booked. */
    fun requestDeliveryQuote() {
        val state = _uiState.value
        val vehicle = state.selectedVehicle
        val location = state.exactLocation
        val items = checkoutItemsFlow.value
        if (state.quoteState !is DeliveryQuoteState.ReadyToQuote &&
            state.quoteState !is DeliveryQuoteState.Expired &&
            state.quoteState !is DeliveryQuoteState.Failed
        ) return
        if (vehicle == null || location == null) return

        val request = DeliveryQuoteRequest(
            vehicle = vehicle,
            dropOff = location,
            dropOffAddress = state.formattedAddress,
            recipientName = state.fullName.trim(),
            recipientPhone = "+63${state.phone.trim()}",
            itemDescription = items.joinToString { "${it.quantity}× ${it.panel.name}" },
            quantity = items.sumOf { it.quantity }
        )
        val key = QuoteKey(vehicle.serviceType, location.latitude, location.longitude, state.formattedAddress)
        _uiState.update { it.copy(quoteState = DeliveryQuoteState.Requesting, payment = PaymentStateMachine.onAmountChanged(it.payment)) }
        viewModelScope.launch {
            val result = deliveryRepository.requestQuote(request)
            quotedFor = if (result is DeliveryResult.Success) key else null
            _uiState.update { it.copy(quoteState = DeliveryCoordination.fromResult(result)) }
        }
    }

    /** Called periodically by the screen so a quote visibly expires. */
    fun tick() {
        _uiState.update { it.copy(quoteState = DeliveryCoordination.withClock(it.quoteState, clock())) }
    }

    // ---- payment (GCash only)

    /** Starts a GCash payment for the quoted delivery fee. Never marks anything paid. */
    fun payDeliveryFee() {
        val state = _uiState.value
        val quote = (state.quoteState as? DeliveryQuoteState.Received)?.quote
        if (quote == null || quote.isExpired(clock())) {
            _uiState.update { it.copy(errorMessage = "Get a delivery quote before paying the delivery fee.") }
            return
        }
        if (state.payment.state == PaymentState.PAID || state.payment.state == PaymentState.PROCESSING) return

        _uiState.update { it.copy(payment = PaymentStateMachine.onPayRequested(it.payment), errorMessage = null) }
        viewModelScope.launch {
            val result = paymentProvider.createPayment(
                GCashPaymentRequest(
                    reference = checkoutReference,
                    amount = quote.fee,
                    currency = quote.currency,
                    description = "PanelScan delivery fee (${quote.vehicle.label})",
                    customerPhone = "+63${state.phone.trim()}"
                )
            )
            _uiState.update { it.copy(payment = PaymentStateMachine.onSessionResult(it.payment, result)) }
            _uiState.value.payment.checkoutUrl?.let { url ->
                if (_uiState.value.payment.state == PaymentState.PROCESSING) _openUrl.value = url
            }
        }
    }

    fun onCheckoutUrlOpened() {
        _openUrl.value = null
    }

    /** Called when the customer returns from GCash; the provider decides the outcome. */
    fun refreshPaymentStatus() {
        val payment = _uiState.value.payment
        val id = payment.paymentId ?: return
        if (payment.state != PaymentState.PROCESSING) return
        viewModelScope.launch {
            val result = paymentProvider.fetchStatus(id)
            _uiState.update { it.copy(payment = PaymentStateMachine.onStatusResult(it.payment, result)) }
        }
    }

    fun cancelPayment() {
        val id = _uiState.value.payment.paymentId ?: return
        viewModelScope.launch {
            val result = paymentProvider.cancel(id)
            _uiState.update { it.copy(payment = PaymentStateMachine.onStatusResult(it.payment, result)) }
        }
    }

    // ---- booking

    /** Step 3 → 4. Only with an unexpired quote and a provider-confirmed paid fee. */
    fun bookDelivery() {
        val state = _uiState.value
        if (!DeliveryCoordination.canBook(state.quoteState, state.payment.state, state.bookingState, clock())) return
        val quote = (state.quoteState as DeliveryQuoteState.Received).quote
        val vehicle = state.selectedVehicle ?: return
        val location = state.exactLocation ?: return
        val items = checkoutItemsFlow.value
        _uiState.update { it.copy(bookingState = DeliveryBookingState.Booking) }
        viewModelScope.launch {
            val result = deliveryRepository.book(
                DeliveryBookingRequest(
                    quote = quote,
                    quoteRequest = DeliveryQuoteRequest(
                        vehicle = vehicle,
                        dropOff = location,
                        dropOffAddress = state.formattedAddress,
                        recipientName = state.fullName.trim(),
                        recipientPhone = "+63${state.phone.trim()}",
                        itemDescription = items.joinToString { "${it.quantity}× ${it.panel.name}" },
                        quantity = items.sumOf { it.quantity }
                    ),
                    orderReference = checkoutReference
                )
            )
            _uiState.update {
                it.copy(
                    bookingState = when (result) {
                        is DeliveryResult.Success -> DeliveryBookingState.Confirmed(result.data)
                        is DeliveryResult.Failure -> DeliveryBookingState.Failed(result.message)
                    }
                )
            }
        }
    }

    // ---- order options
    fun onToggleInstallation(value: Boolean) = _uiState.update { it.copy(hasInstallation = value) }
    fun onPaymentSelected(value: String) = _uiState.update { it.copy(selectedPayment = "GCash") }

    val checkoutItems: List<CartItem>
        get() = CheckoutItemSelection.items(
            cartRepository.items.value, cartRepository.selectedItemIds.value, directItem.value
        )

    val subtotal: Double get() = checkoutItems.sumOf { it.lineTotal }

    /** Only a provider-quoted fee is ever added to the total. */
    val shippingFee: Double get() = 0.0 // Customer checkout does not obtain delivery quotes.
    val installationFee: Double get() = 0.0 // Pricing is pending moderator review.
    val totalAmount: Double get() = subtotal + shippingFee + installationFee

    fun placeOrder(onSuccess: (Order) -> Unit) {
        val currentItems = checkoutItems
        val state = _uiState.value
        CheckoutValidator.validate(state, currentItems.size)?.let { error ->
            _uiState.update { it.copy(errorMessage = error) }
            return
        }

        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        viewModelScope.launch {
            val order = orderRepository.createOrder(
                cartItems = currentItems,
                customerName = state.fullName.trim(),
                customerEmail = state.email.trim(),
                customerPhone = "+63${state.phone.trim()}",
                shippingAddress = state.formattedAddress,
                hasInstallation = state.hasInstallation,
                paymentMethod = "GCash",
                notes = state.orderNotes.trim().ifBlank { null },
                deliveryFee = null,
                delivery = OrderDeliveryDetails(
                    latitude = state.exactLocation?.latitude,
                    longitude = state.exactLocation?.longitude,
                    quoteStatus = "To be confirmed by PanelScan",
                    paymentStatus = "Pending",
                    bookingStatus = "Not booked"
                )
            )

            // Direct checkout never changes unrelated cart items.
            if (directItem.value == null) cartRepository.removeSelectedItems()
            startNextCheckout()
            onSuccess(order)
        }
    }

    /**
     * This ViewModel lives as long as the activity, so the next checkout must not inherit
     * this order's quote, payment or booking. Recipient and address are kept for convenience.
     */
    private fun startNextCheckout() {
        checkoutReference = newReference()
        directItem.value = null
        quotedFor = null
        _openUrl.value = null
        _uiState.update {
            it.copy(
                isLoading = false,
                quoteState = DeliveryQuoteState.NotReady(emptyList()),
                bookingState = DeliveryBookingState.NotBooked,
                payment = PaymentUiState(),
                hasInstallation = false,
                orderNotes = "",
                errorMessage = null
            )
        }
        refreshQuoteState()
    }

    /** Applies an edit, then re-derives whether the current quote still applies. */
    private fun edit(block: (CheckoutUiState) -> CheckoutUiState) {
        val before = _uiState.value
        val after = block(before)
        // Once the delivery fee is paid (or being paid), the trip it paid for is fixed.
        val guarded = if (before.deliveryLocked && tripChanged(before, after)) {
            after.copy(
                selectedVehicle = before.selectedVehicle,
                exactLocation = before.exactLocation,
                street = before.street, barangay = before.barangay, city = before.city,
                province = before.province, postalCode = before.postalCode, region = before.region,
                errorMessage = "The delivery fee is already paid for this address and vehicle."
            )
        } else after
        _uiState.value = guarded
        saveDraft(guarded)
        refreshQuoteState()
    }

    private fun tripChanged(a: CheckoutUiState, b: CheckoutUiState) =
        a.selectedVehicle != b.selectedVehicle || a.exactLocation != b.exactLocation || a.formattedAddress != b.formattedAddress

    private fun refreshQuoteState() {
        _uiState.update { state ->
            val missing = DeliveryCoordination.missingRequirements(
                hasItems = checkoutItemsFlow.value.isNotEmpty(),
                addressComplete = state.addressComplete,
                hasExactLocation = state.exactLocation != null,
                vehicle = state.selectedVehicle
            )
            val key = quotedFor
            val matches = key != null && state.selectedVehicle?.serviceType == key.vehicle &&
                state.exactLocation?.latitude == key.lat && state.exactLocation.longitude == key.lng &&
                state.formattedAddress == key.address
            val next = DeliveryCoordination.afterInputsChanged(missing, state.quoteState, matches)
            if (next != state.quoteState && state.quoteState is DeliveryQuoteState.Received) {
                // The priced trip changed: an unpaid payment for the old price no longer applies.
                state.copy(quoteState = next, payment = PaymentStateMachine.onAmountChanged(state.payment))
            } else {
                state.copy(quoteState = next)
            }
        }
    }
}
