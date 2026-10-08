package com.example.panelscan.core.location

import java.util.Locale
import kotlin.math.abs

/** How the pin was placed; shown so the customer knows what they confirmed. */
enum class LocationSource { MAP_PIN, CURRENT_LOCATION }

/** Address components returned by the device geocoder; blank fields remain for manual entry. */
data class ResolvedDeliveryAddress(
    val street: String = "",
    val barangay: String = "",
    val city: String = "",
    val province: String = "",
    val postalCode: String = "",
    val region: String = ""
)

/**
 * The rider's drop-off point. Kept only in checkout state and on the order it belongs to —
 * never logged, never put in a URL, never sent anywhere except the delivery quote/booking.
 */
data class ExactDeliveryLocation(
    val latitude: Double,
    val longitude: Double,
    /** Reverse-geocoded description, when the device's geocoder could provide one. */
    val addressLine: String? = null,
    val source: LocationSource = LocationSource.MAP_PIN,
    val resolvedAddress: ResolvedDeliveryAddress? = null
) {
    /** Five decimals ≈ 1 m: precise enough for a rider, no false precision beyond that. */
    val latitudeText: String get() = String.format(Locale.US, "%.5f", latitude)
    val longitudeText: String get() = String.format(Locale.US, "%.5f", longitude)
}

enum class LocationProblem { INVALID_COORDINATES, OUTSIDE_PHILIPPINES }

object DeliveryLocationRules {

    /** Generous bounding box around the Philippine archipelago. */
    private const val MIN_LAT = 4.2
    private const val MAX_LAT = 21.4
    private const val MIN_LNG = 116.0
    private const val MAX_LNG = 127.2

    /** Metro Manila, used to open the map when nothing better is known. */
    const val DEFAULT_LAT = 14.5995
    const val DEFAULT_LNG = 120.9842

    fun validate(location: ExactDeliveryLocation): LocationProblem? = when {
        location.latitude.isNaN() || location.longitude.isNaN() ||
            abs(location.latitude) > 90 || abs(location.longitude) > 180 ||
            (location.latitude == 0.0 && location.longitude == 0.0) -> LocationProblem.INVALID_COORDINATES
        location.latitude !in MIN_LAT..MAX_LAT || location.longitude !in MIN_LNG..MAX_LNG ->
            LocationProblem.OUTSIDE_PHILIPPINES
        else -> null
    }

    fun message(problem: LocationProblem): String = when (problem) {
        LocationProblem.INVALID_COORDINATES -> "That location couldn't be read. Move the pin and try again."
        LocationProblem.OUTSIDE_PHILIPPINES -> "Delivery is available within the Philippines only. Move the pin to your address."
    }
}
