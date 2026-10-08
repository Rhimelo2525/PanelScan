package com.example.panelscan.feature.checkout

import com.example.panelscan.TestPanels
import com.example.panelscan.core.delivery.DeliveryBooking
import com.example.panelscan.core.delivery.DeliveryBookingRequest
import com.example.panelscan.core.delivery.DeliveryBookingState
import com.example.panelscan.core.delivery.DeliveryBookingStatus
import com.example.panelscan.core.delivery.DeliveryConfig
import com.example.panelscan.core.delivery.DeliveryCoordination
import com.example.panelscan.core.delivery.DeliveryCoordinationStatus
import com.example.panelscan.core.delivery.DeliveryFailure
import com.example.panelscan.core.delivery.DeliveryProviders
import com.example.panelscan.core.delivery.DeliveryQuote
import com.example.panelscan.core.delivery.DeliveryQuoteRequest
import com.example.panelscan.core.delivery.DeliveryQuoteState
import com.example.panelscan.core.delivery.DeliveryResult
import com.example.panelscan.core.delivery.DeliveryVehicles
import com.example.panelscan.core.delivery.IsoTime
import com.example.panelscan.core.delivery.LalamoveApiException
import com.example.panelscan.core.delivery.LalamoveDeliveryProvider
import com.example.panelscan.core.delivery.LalamoveOrder
import com.example.panelscan.core.delivery.LalamoveOrderRequest
import com.example.panelscan.core.delivery.LalamovePriceBreakdown
import com.example.panelscan.core.delivery.LalamoveQuotation
import com.example.panelscan.core.delivery.LalamoveQuotationRequest
import com.example.panelscan.core.delivery.LalamoveService
import com.example.panelscan.core.delivery.LalamoveStop
import com.example.panelscan.core.delivery.LalamoveCoordinates
import com.example.panelscan.core.delivery.LalamoveVehicleCatalog
import com.example.panelscan.core.delivery.PickupPoint
import com.example.panelscan.core.delivery.QuoteRequirement
import com.example.panelscan.core.delivery.UnconfiguredDeliveryProvider
import com.example.panelscan.core.location.DeliveryLocationRules
import com.example.panelscan.core.location.ExactDeliveryLocation
import com.example.panelscan.core.location.ResolvedDeliveryAddress
import com.example.panelscan.core.model.CartItem
import com.example.panelscan.data.local.CheckoutDraft
import com.example.panelscan.data.local.InMemoryCheckoutDraftStore
import com.example.panelscan.core.location.LocationProblem
import com.example.panelscan.core.payment.GCashPaymentRequest
import com.example.panelscan.core.payment.GCashPaymentSession
import com.example.panelscan.core.payment.PaymentFailure
import com.example.panelscan.core.payment.PaymentResult
import com.example.panelscan.core.payment.PaymentState
import com.example.panelscan.core.payment.PaymentStateMachine
import com.example.panelscan.core.payment.PaymentUiState
import com.example.panelscan.core.payment.UnconfiguredGCashPaymentProvider
import com.example.panelscan.data.repository.CartRepository
import com.example.panelscan.data.repository.CartSelectionSummary
import com.example.panelscan.data.repository.DeliveryRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckoutFlowTest {

    @Test
    fun `confirming the existing pin replaces manual address edits with detected fields`() {
        val detected = ResolvedDeliveryAddress(
            street = "Mount Sinai Street", barangay = "San Manuel", city = "San Jose del Monte City",
            province = "Bulacan", postalCode = "3023", region = "Region III — Central Luzon"
        )
        val pin = ExactDeliveryLocation(14.7827606, 121.0664743, resolvedAddress = detected)
        val manual = completeAddress.copy(
            exactLocation = pin, street = "Lagro", city = "SJDM", province = "Quirino",
            region = "Region II — Cagayan Valley", postalCode = "3500"
        )
        val updated = CheckoutAddressAutofill.confirm(manual, pin)
        assertEquals(detected.street, updated.street)
        assertEquals(detected.barangay, updated.barangay)
        assertEquals(detected.city, updated.city)
        assertEquals(detected.province, updated.province)
        assertEquals(detected.region, updated.region)
        assertEquals(detected.postalCode, updated.postalCode)
        assertEquals(manual.fullName, updated.fullName)
        assertEquals(manual.phone, updated.phone)
        assertNull(updated.errorMessage)
        assertEquals(detected.street, CheckoutAddressAutofill.confirm(updated.copy(street = "Manual edit"), pin).street)
    }

    @Test
    fun `lookup failure keeps manual address and explains that it was not refreshed`() {
        val pin = ExactDeliveryLocation(17.61318, 121.71850)
        val updated = CheckoutAddressAutofill.confirm(completeAddress, pin)
        assertEquals(completeAddress.formattedAddress, updated.formattedAddress)
        assertEquals(pin, updated.exactLocation)
        assertTrue(updated.errorMessage!!.contains("lookup was unavailable"))
    }

    @Test
    fun `direct checkout isolates its product and quantity from selected cart items`() {
        val cart = CartRepository()
        val first = TestPanels.allPanels[0]
        val second = TestPanels.allPanels[1]
        cart.addToCart(first, 2)
        cart.addToCart(second, 4)
        val direct = CartItem("direct-item", first, 3)
        assertEquals(listOf(direct), CheckoutItemSelection.items(cart.items.value, cart.selectedItemIds.value, direct))
        assertEquals(2, cart.items.value.size)
        assertEquals(3, direct.quantity)
        assertEquals(2, CheckoutItemSelection.items(cart.items.value, cart.selectedItemIds.value, null).size)
    }

    @Test
    fun `checkout draft keeps incomplete fields and an exact pin across reloads`() {
        val store = InMemoryCheckoutDraftStore()
        val draft = CheckoutDraft(
            fullName = "Maria Santos", phone = "9171234567", street = "Unit 12B",
            city = "Taguig", latitude = 14.5509, longitude = 121.0503,
            locationAddress = "Taguig, Philippines", locationSource = "MAP_PIN"
        )
        store.save("maria@gmail.com", draft)
        assertEquals(draft, store.load("maria@gmail.com"))
        assertNull(store.load("another@gmail.com"))
        assertTrue(store.load("maria@gmail.com")!!.barangay.isBlank())
    }

    @Test
    fun `reverse geocode fills blanks and a changed pin updates returned components`() {
        val resolved = ResolvedDeliveryAddress(
            street = "Ayala Avenue", barangay = "Bel-Air", city = "Makati",
            province = "Metro Manila", postalCode = "1200", region = "NCR — Metro Manila"
        )
        val first = CheckoutAddressAutofill.apply(completeAddress.copy(street = ""), resolved, replaceExisting = false)
        assertEquals("Ayala Avenue", first.street)
        assertEquals("Taguig", first.city) // Existing manual address is preserved on the first pin.
        val changed = CheckoutAddressAutofill.apply(first, resolved, replaceExisting = true)
        assertEquals("Makati", changed.city)
        assertEquals("Bel-Air", changed.barangay)
        assertEquals(completeAddress.street, CheckoutAddressAutofill.apply(completeAddress, ResolvedDeliveryAddress(), true).street)
    }

    @Test
    fun `pin in same city preserves fields omitted by device lookup`() {
        val updated = CheckoutAddressAutofill.apply(
            completeAddress,
            ResolvedDeliveryAddress(street = "Sapphire Road", city = "Taguig", province = "Metro Manila"),
            replaceExisting = true
        )
        assertEquals("Sapphire Road", updated.street)
        assertEquals(completeAddress.barangay, updated.barangay)
        assertEquals(completeAddress.postalCode, updated.postalCode)
        assertEquals(completeAddress.region, updated.region)
    }

    @Test
    fun `pin in another city clears dependent fields when device omits them`() {
        val updated = CheckoutAddressAutofill.apply(
            completeAddress,
            ResolvedDeliveryAddress(city = "Makati", province = "Metro Manila"),
            replaceExisting = true
        )
        assertEquals("", updated.street)
        assertEquals("", updated.barangay)
        assertEquals("", updated.postalCode)
        assertEquals("Makati", updated.city)
    }

    @Test
    fun `first pin derives province and region from a recognized city`() {
        val updated = CheckoutAddressAutofill.apply(
            CheckoutUiState(), ResolvedDeliveryAddress(city = "San Jose del Monte City"), replaceExisting = true
        )
        assertEquals("Bulacan", updated.province)
        assertEquals("Region III — Central Luzon", updated.region)
    }

    @Test
    fun `new province cannot retain an old city when lookup omits city`() {
        val updated = CheckoutAddressAutofill.apply(
            completeAddress, ResolvedDeliveryAddress(province = "Bulacan"), replaceExisting = true
        )
        assertEquals("", updated.city)
        assertEquals("", updated.barangay)
        assertEquals("", updated.postalCode)
        assertEquals("Bulacan", updated.province)
        assertEquals("Region III — Central Luzon", updated.region)
    }

    @Test
    fun `a region-only lookup cannot leave an incompatible saved city`() {
        val updated = CheckoutAddressAutofill.apply(
            completeAddress, ResolvedDeliveryAddress(region = "Region III — Central Luzon"),
            replaceExisting = true
        )
        assertEquals("", updated.city)
        assertEquals("", updated.province)
        assertEquals("", updated.barangay)
        assertEquals("", updated.postalCode)
        assertEquals("Region III — Central Luzon", updated.region)
    }

    private val completeAddress = CheckoutUiState(
        fullName = "Maria Santos",
        phone = "9171234567",
        street = "Unit 12B, Sapphire Residences",
        barangay = "BGC (Fort Bonifacio)",
        city = "Taguig",
        province = "Metro Manila",
        postalCode = "1634",
        region = "NCR — Metro Manila"
    )

    private val bgc = ExactDeliveryLocation(14.5509, 121.0503, "Bonifacio Global City, Taguig")
    private val van = LalamoveVehicleCatalog.reference.first { it.serviceType == "VAN" }

    // ------------------------------------------------------------- address

    @Test
    fun `complete address passes validation`() {
        assertNull(CheckoutValidator.validate(completeAddress, selectedItemCount = 1))
    }

    @Test
    fun `address validation keeps the on-screen field order`() {
        assertEquals("Please select at least one item to checkout.", CheckoutValidator.validate(completeAddress, 0))
        assertEquals("Please enter the recipient's full name.", CheckoutValidator.validate(completeAddress.copy(fullName = "J"), 1))
        assertEquals("Please enter a contact number for delivery.", CheckoutValidator.validate(completeAddress.copy(phone = ""), 1))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(phone = "8171234567"), 1)!!.contains("starting with 9"))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(street = " "), 1)!!.contains("street"))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(barangay = ""), 1)!!.contains("barangay"))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(city = ""), 1)!!.contains("city"))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(province = ""), 1)!!.contains("province"))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(postalCode = ""), 1)!!.contains("postal code"))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(postalCode = "16"), 1)!!.contains("4-digit"))
        assertTrue(CheckoutValidator.validate(completeAddress.copy(region = ""), 1)!!.contains("region"))
    }

    // -------------------------------------------------------------- location

    @Test
    fun `exact location inside the Philippines is valid and formatted to five decimals`() {
        assertNull(DeliveryLocationRules.validate(bgc))
        assertEquals("14.55090", bgc.latitudeText)
        assertEquals("121.05030", bgc.longitudeText)
    }

    @Test
    fun `exact location outside the Philippines or at null island is rejected`() {
        assertEquals(LocationProblem.OUTSIDE_PHILIPPINES, DeliveryLocationRules.validate(ExactDeliveryLocation(1.35, 103.82)))
        assertEquals(LocationProblem.INVALID_COORDINATES, DeliveryLocationRules.validate(ExactDeliveryLocation(0.0, 0.0)))
        assertEquals(LocationProblem.INVALID_COORDINATES, DeliveryLocationRules.validate(ExactDeliveryLocation(Double.NaN, 121.0)))
        val invalid = completeAddress.copy(exactLocation = ExactDeliveryLocation(35.68, 139.69))
        assertTrue(CheckoutValidator.validate(invalid, 1)!!.contains("Philippines"))
    }

    // ------------------------------------------------------------ delivery

    private fun quote(expiresAt: Long = 10_000L) =
        DeliveryQuote("q-1", van, 480.0, "PHP", expiresAt, "Lalamove", listOf("s0", "s1"))

    @Test
    fun `quote needs items, address, pin and vehicle`() {
        val missing = DeliveryCoordination.missingRequirements(hasItems = true, addressComplete = true, hasExactLocation = false, vehicle = null)
        assertEquals(listOf(QuoteRequirement.EXACT_LOCATION, QuoteRequirement.VEHICLE), missing)
        val state = DeliveryCoordination.afterInputsChanged(missing, DeliveryQuoteState.ReadyToQuote, false)
        assertTrue(state is DeliveryQuoteState.NotReady)
        val ready = DeliveryCoordination.afterInputsChanged(emptyList(), state, false)
        assertEquals(DeliveryQuoteState.ReadyToQuote, ready)
    }

    @Test
    fun `changing the trip invalidates a received quote`() {
        val received = DeliveryQuoteState.Received(quote())
        assertEquals(received, DeliveryCoordination.afterInputsChanged(emptyList(), received, quoteStillMatches = true))
        assertEquals(DeliveryQuoteState.ReadyToQuote, DeliveryCoordination.afterInputsChanged(emptyList(), received, quoteStillMatches = false))
    }

    @Test
    fun `received quote expires with time`() {
        val received = DeliveryQuoteState.Received(quote(expiresAt = 5_000L))
        assertEquals(received, DeliveryCoordination.withClock(received, 4_999L))
        assertTrue(DeliveryCoordination.withClock(received, 5_000L) is DeliveryQuoteState.Expired)
    }

    @Test
    fun `unconfigured provider yields unavailable, never a fake quote`() = runBlocking {
        val provider = DeliveryProviders.create(DeliveryConfig(backendBaseUrl = "", market = "PH", pickup = null))
        assertFalse(provider.isConfigured)
        val request = DeliveryQuoteRequest(van, bgc, "BGC", "Maria", "+639171234567", "4× panel", 4)
        val result = provider.requestQuote(request)
        assertTrue(result is DeliveryResult.Failure && result.reason == DeliveryFailure.NOT_CONFIGURED)
        assertTrue(DeliveryCoordination.fromResult(result) is DeliveryQuoteState.Unavailable)
        val booking = provider.book(DeliveryBookingRequest(quote(), request, "PSC-1"))
        assertTrue(booking is DeliveryResult.Failure)
    }

    @Test
    fun `unconfigured repository shows the reference vehicles marked not live`() = runBlocking {
        val options = DeliveryRepository(UnconfiguredDeliveryProvider()).vehicleOptions()
        assertFalse(options.live)
        assertEquals(LalamoveVehicleCatalog.reference, options.vehicles)
        assertNotNull(options.message)
    }

    @Test
    fun `only provider-supported vehicles are offered`() {
        val supported = DeliveryVehicles.supported(LalamoveVehicleCatalog.reference, setOf("VAN", "MPV"))
        assertEquals(listOf("MPV", "VAN"), supported.map { it.serviceType })
    }

    @Test
    fun `booking needs an unexpired quote and a provider-confirmed payment`() {
        val received = DeliveryQuoteState.Received(quote(expiresAt = 10_000L))
        assertFalse(DeliveryCoordination.canBook(received, PaymentState.PENDING, DeliveryBookingState.NotBooked, 1_000L))
        assertFalse(DeliveryCoordination.canBook(received, PaymentState.PROCESSING, DeliveryBookingState.NotBooked, 1_000L))
        assertTrue(DeliveryCoordination.canBook(received, PaymentState.PAID, DeliveryBookingState.NotBooked, 1_000L))
        assertFalse("expired", DeliveryCoordination.canBook(received, PaymentState.PAID, DeliveryBookingState.NotBooked, 10_000L))
        assertFalse(DeliveryCoordination.canBook(DeliveryQuoteState.ReadyToQuote, PaymentState.PAID, DeliveryBookingState.NotBooked, 0L))
    }

    @Test
    fun `coordination status moves pending to approved to ready`() {
        val received = DeliveryQuoteState.Received(quote())
        assertEquals(DeliveryCoordinationStatus.PENDING, DeliveryCoordination.status(received, PaymentState.PENDING, DeliveryBookingState.NotBooked))
        assertEquals(DeliveryCoordinationStatus.APPROVED, DeliveryCoordination.status(received, PaymentState.PAID, DeliveryBookingState.NotBooked))
        val booked = DeliveryBookingState.Confirmed(DeliveryBooking("LLM-1", DeliveryBookingStatus.ASSIGNING_DRIVER, null))
        assertEquals(DeliveryCoordinationStatus.READY, DeliveryCoordination.status(received, PaymentState.PAID, booked))
    }

    /** A test double of the backend port, to verify the adapter's mapping — not a working API. */
    private class RecordingLalamove(private val failQuote: LalamoveApiException? = null) : LalamoveService {
        var lastQuotation: LalamoveQuotationRequest? = null
        var lastOrder: LalamoveOrderRequest? = null
        var orders = 0
        override suspend fun serviceTypes(market: String) = listOf("VAN", "MPV")
        override suspend fun createQuotation(request: LalamoveQuotationRequest): LalamoveQuotation {
            failQuote?.let { throw it }
            lastQuotation = request
            return LalamoveQuotation(
                quotationId = "Q123",
                serviceType = request.serviceType,
                expiresAt = "2026-09-27T07:18:38.00Z",
                stops = request.stops.mapIndexed { i, s -> s.copy(stopId = "stop-$i") },
                priceBreakdown = LalamovePriceBreakdown(total = "512.50", currency = "PHP")
            )
        }
        override suspend fun placeOrder(request: LalamoveOrderRequest): LalamoveOrder {
            orders++
            lastOrder = request
            return LalamoveOrder("ORD-9", request.quotationId, "ASSIGNING_DRIVER", "https://share.example/ORD-9")
        }
        override suspend fun getOrder(orderId: String) = LalamoveOrder(orderId, null, "PICKED_UP", null)
    }

    private val pickup = PickupPoint("Warehouse, Pasig", 14.5764, 121.0851, "PanelScan", "+639170000000")

    @Test
    fun `lalamove quote maps stops and price, and does not book`() = runBlocking {
        val service = RecordingLalamove()
        val provider = LalamoveDeliveryProvider(service, "PH", pickup) { 0L }
        val result = provider.requestQuote(DeliveryQuoteRequest(van, bgc, "BGC, Taguig", "Maria", "+639171234567", "4× panel", 4))
        assertTrue(result is DeliveryResult.Success)
        val q = (result as DeliveryResult.Success).data
        assertEquals(512.5, q.fee, 0.001)
        assertEquals(listOf("stop-0", "stop-1"), q.providerStopIds)
        assertEquals(IsoTime.parseMillis("2026-09-27T07:18:38.000Z"), q.expiresAtMillis)
        val sent = service.lastQuotation!!
        assertEquals("VAN", sent.serviceType)
        assertEquals("14.5764", sent.stops[0].coordinates.lat)
        assertEquals("14.5509", sent.stops[1].coordinates.lat)
        assertEquals(0, service.orders)
    }

    @Test
    fun `lalamove booking uses quotation stop ids and refuses expired quotes`() = runBlocking {
        val service = RecordingLalamove()
        val request = DeliveryQuoteRequest(van, bgc, "BGC", "Maria", "+639171234567", "4× panel", 4)
        val live = LalamoveDeliveryProvider(service, "PH", pickup) { 0L }
        val booked = live.book(DeliveryBookingRequest(quote(expiresAt = 1_000L), request, "PSC-1"))
        assertTrue(booked is DeliveryResult.Success)
        assertEquals("s0", service.lastOrder!!.sender.stopId)
        assertEquals("s1", service.lastOrder!!.recipients.single().stopId)
        assertEquals("PSC-1", service.lastOrder!!.metadata["panelscanOrder"])

        val late = LalamoveDeliveryProvider(service, "PH", pickup) { 2_000L }
        val expired = late.book(DeliveryBookingRequest(quote(expiresAt = 1_000L), request, "PSC-1"))
        assertTrue(expired is DeliveryResult.Failure && expired.reason == DeliveryFailure.QUOTE_EXPIRED)
        assertEquals(1, service.orders)
    }

    @Test
    fun `lalamove errors are mapped, not swallowed as success`() = runBlocking {
        val provider = LalamoveDeliveryProvider(
            RecordingLalamove(LalamoveApiException(422, "ERR_OUT_OF_SERVICE_AREA", "Out of area")), "PH", pickup
        )
        val result = provider.requestQuote(DeliveryQuoteRequest(van, bgc, "BGC", "M", "+639171234567", "x", 1))
        assertTrue(result is DeliveryResult.Failure && result.reason == DeliveryFailure.OUT_OF_SERVICE_AREA)
        // Sanity on the stop model used above.
        assertEquals("1", LalamoveStop(LalamoveCoordinates("1", "2"), "a").coordinates.lat)
    }

    @Test
    fun `iso time parses lalamove timestamps`() {
        assertEquals(1_790_493_518_000L, IsoTime.parseMillis("2026-09-27T07:18:38Z"))
        assertEquals(1_790_493_518_500L, IsoTime.parseMillis("2026-09-27T07:18:38.50Z"))
        assertEquals(1_790_493_518_000L, IsoTime.parseMillis("2026-09-27T15:18:38+08:00"))
        assertNull(IsoTime.parseMillis("not a date"))
    }

    // -------------------------------------------------------------- payment

    @Test
    fun `tapping pay never marks the fee paid`() {
        val processing = PaymentStateMachine.onPayRequested(PaymentUiState())
        assertEquals(PaymentState.PROCESSING, processing.state)
        // Even a provider that claims PAID at session creation is held at PROCESSING
        // until the status endpoint confirms it.
        val session = PaymentStateMachine.onSessionResult(
            processing,
            PaymentResult.Success(GCashPaymentSession("pay-1", "https://gcash.example/pay-1", PaymentState.PAID))
        )
        assertEquals(PaymentState.PROCESSING, session.state)
        assertEquals("pay-1", session.paymentId)
    }

    @Test
    fun `only a provider status makes the payment paid, failed or cancelled`() {
        val processing = PaymentUiState(state = PaymentState.PROCESSING, paymentId = "pay-1")
        assertEquals(PaymentState.PAID, PaymentStateMachine.onStatusResult(processing, PaymentResult.Success(PaymentState.PAID)).state)
        assertEquals(PaymentState.FAILED, PaymentStateMachine.onStatusResult(processing, PaymentResult.Success(PaymentState.FAILED)).state)
        assertEquals(PaymentState.CANCELLED, PaymentStateMachine.onStatusResult(processing, PaymentResult.Success(PaymentState.CANCELLED)).state)
        // A network error while checking leaves the state alone.
        val unchanged = PaymentStateMachine.onStatusResult(processing, PaymentResult.Failure(PaymentFailure.NETWORK, "offline"))
        assertEquals(PaymentState.PROCESSING, unchanged.state)
    }

    @Test
    fun `unconfigured gcash leaves the payment pending with an explanation`() = runBlocking {
        val provider = UnconfiguredGCashPaymentProvider()
        assertFalse(provider.isConfigured)
        val result = provider.createPayment(GCashPaymentRequest("PSC-1", 480.0, description = "fee", customerPhone = "+639171234567"))
        val state = PaymentStateMachine.onSessionResult(PaymentStateMachine.onPayRequested(PaymentUiState()), result)
        assertEquals(PaymentState.PENDING, state.state)
        assertNotNull(state.message)
        assertNull(state.paymentId)
    }

    @Test
    fun `declined payment is failed and can be retried`() {
        val failed = PaymentStateMachine.onSessionResult(
            PaymentStateMachine.onPayRequested(PaymentUiState()),
            PaymentResult.Failure(PaymentFailure.DECLINED, "Declined")
        )
        assertEquals(PaymentState.FAILED, failed.state)
        assertEquals(PaymentState.PROCESSING, PaymentStateMachine.onPayRequested(failed).state)
    }

    @Test
    fun `a new quote resets an unpaid payment but never a paid one`() {
        assertEquals(PaymentState.PENDING, PaymentStateMachine.onAmountChanged(PaymentUiState(PaymentState.FAILED)).state)
        assertEquals(PaymentState.PAID, PaymentStateMachine.onAmountChanged(PaymentUiState(PaymentState.PAID)).state)
    }

    // ----------------------------------------------------------------- cart

    @Test
    fun `cart selection drives checkout totals`() {
        val cart = CartRepository()
        val a = TestPanels.allPanels[0]
        val b = TestPanels.allPanels[1]
        val c = TestPanels.allPanels[2]
        cart.addToCart(a, 2)
        cart.addToCart(b, 3)
        cart.addToCart(c, 1)
        // Newly added items are selected.
        assertEquals(3, cart.selectionSummary().selectedItems)

        val bId = cart.items.value.first { it.panel.id == b.id }.id
        cart.toggleSelection(bId)
        val summary = cart.selectionSummary()
        assertEquals(2, summary.selectedItems)
        assertEquals(3, summary.selectedQuantity)
        assertEquals(a.pricePerUnit!! * 2 + c.pricePerUnit!!, summary.subtotal, 0.001)
        assertFalse(summary.allSelected)
        assertTrue(summary.canCheckout)

        cart.clearSelection()
        val none = cart.selectionSummary()
        assertFalse(none.canCheckout)
        assertEquals("Select at least one item to continue.", none.blockingMessage)
        assertEquals(0.0, none.subtotal, 0.0)

        cart.selectAll(true)
        assertTrue(cart.selectionSummary().allSelected)
    }

    @Test
    fun `checking out selected items leaves the rest in the cart`() {
        val cart = CartRepository()
        cart.addToCart(TestPanels.allPanels[0], 1)
        cart.addToCart(TestPanels.allPanels[1], 1)
        val keep = cart.items.value.last().id
        cart.toggleSelection(keep)
        assertEquals(1, cart.selectedItems.size)
        cart.removeSelectedItems()
        assertEquals(listOf(keep), cart.items.value.map { it.id })
    }

    @Test
    fun `summary of an empty selection`() {
        assertFalse(CartSelectionSummary.of(emptyList(), emptySet()).canCheckout)
    }
}
