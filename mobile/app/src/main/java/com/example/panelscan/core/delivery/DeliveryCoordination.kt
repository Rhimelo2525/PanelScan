package com.example.panelscan.core.delivery

import com.example.panelscan.core.payment.PaymentState

/** What must be in place before a delivery quote can be requested. */
enum class QuoteRequirement(val label: String) {
    ITEMS("Select at least one item"),
    ADDRESS("Complete the delivery address"),
    EXACT_LOCATION("Pin the exact delivery location"),
    VEHICLE("Choose a vehicle")
}

/**
 * The four delivery steps are kept distinct on purpose:
 * 1. quote request ([Requesting]) → 2. quote received ([Received]) →
 * 3. booking ([DeliveryBookingState.Booking]) → 4. booking confirmation
 * ([DeliveryBookingState.Confirmed]). Getting a quote never books anything.
 */
sealed interface DeliveryQuoteState {
    data class NotReady(val missing: List<QuoteRequirement>) : DeliveryQuoteState
    data object ReadyToQuote : DeliveryQuoteState
    data object Requesting : DeliveryQuoteState
    data class Received(val quote: DeliveryQuote) : DeliveryQuoteState
    data class Expired(val quote: DeliveryQuote) : DeliveryQuoteState

    /** The provider is not connected; shown as an explanation, not an error. */
    data class Unavailable(val message: String) : DeliveryQuoteState
    data class Failed(val message: String) : DeliveryQuoteState
}

sealed interface DeliveryBookingState {
    data object NotBooked : DeliveryBookingState
    data object Booking : DeliveryBookingState
    data class Confirmed(val booking: DeliveryBooking) : DeliveryBookingState
    data class Failed(val message: String) : DeliveryBookingState
}

/** The three-step chip in the Delivery coordination header. */
enum class DeliveryCoordinationStatus(val label: String) {
    /** Waiting for a quote and/or the delivery fee payment. */
    PENDING("Pending"),

    /** A valid quote exists and the delivery fee is confirmed paid. */
    APPROVED("Approved"),

    /** The provider confirmed a booking. */
    READY("Ready")
}

object DeliveryCoordination {

    fun missingRequirements(
        hasItems: Boolean,
        addressComplete: Boolean,
        hasExactLocation: Boolean,
        vehicle: DeliveryVehicle?
    ): List<QuoteRequirement> = buildList {
        if (!hasItems) add(QuoteRequirement.ITEMS)
        if (!addressComplete) add(QuoteRequirement.ADDRESS)
        if (!hasExactLocation) add(QuoteRequirement.EXACT_LOCATION)
        if (vehicle == null) add(QuoteRequirement.VEHICLE)
    }

    /**
     * Re-derives the quote state after inputs change. Any change to the inputs a quote was
     * priced on (vehicle, location, address) invalidates it — the old price no longer
     * describes the trip.
     */
    fun afterInputsChanged(missing: List<QuoteRequirement>, current: DeliveryQuoteState, quoteStillMatches: Boolean): DeliveryQuoteState = when {
        missing.isNotEmpty() -> DeliveryQuoteState.NotReady(missing)
        current is DeliveryQuoteState.Received && quoteStillMatches -> current
        current is DeliveryQuoteState.Requesting -> current
        current is DeliveryQuoteState.Unavailable -> current
        else -> DeliveryQuoteState.ReadyToQuote
    }

    /** Received quotes age into Expired; nothing else changes with time. */
    fun withClock(state: DeliveryQuoteState, nowMillis: Long): DeliveryQuoteState =
        if (state is DeliveryQuoteState.Received && state.quote.isExpired(nowMillis)) DeliveryQuoteState.Expired(state.quote) else state

    fun fromResult(result: DeliveryResult<DeliveryQuote>): DeliveryQuoteState = when (result) {
        is DeliveryResult.Success -> DeliveryQuoteState.Received(result.data)
        is DeliveryResult.Failure -> when (result.reason) {
            DeliveryFailure.NOT_CONFIGURED -> DeliveryQuoteState.Unavailable(result.message)
            else -> DeliveryQuoteState.Failed(result.message)
        }
    }

    /** Booking needs an unexpired quote AND a delivery fee the payment provider confirmed. */
    fun canBook(quote: DeliveryQuoteState, payment: PaymentState, booking: DeliveryBookingState, nowMillis: Long): Boolean =
        quote is DeliveryQuoteState.Received &&
            !quote.quote.isExpired(nowMillis) &&
            payment == PaymentState.PAID &&
            (booking is DeliveryBookingState.NotBooked || booking is DeliveryBookingState.Failed)

    fun status(quote: DeliveryQuoteState, payment: PaymentState, booking: DeliveryBookingState): DeliveryCoordinationStatus = when {
        booking is DeliveryBookingState.Confirmed -> DeliveryCoordinationStatus.READY
        quote is DeliveryQuoteState.Received && payment == PaymentState.PAID -> DeliveryCoordinationStatus.APPROVED
        else -> DeliveryCoordinationStatus.PENDING
    }
}
