package com.example.panelscan.data.repository

import com.example.panelscan.core.delivery.DeliveryBooking
import com.example.panelscan.core.delivery.DeliveryBookingRequest
import com.example.panelscan.core.delivery.DeliveryProvider
import com.example.panelscan.core.delivery.DeliveryQuote
import com.example.panelscan.core.delivery.DeliveryQuoteRequest
import com.example.panelscan.core.delivery.DeliveryResult
import com.example.panelscan.core.delivery.DeliveryVehicle
import com.example.panelscan.core.delivery.DeliveryVehicles
import com.example.panelscan.core.delivery.LalamoveVehicleCatalog

/** Vehicles to offer, and whether the list came from the live provider. */
data class VehicleOptions(
    val vehicles: List<DeliveryVehicle>,
    /** False when shown from the reference catalogue because the provider isn't connected. */
    val live: Boolean,
    val message: String? = null
)

/**
 * Checkout's single entry point to delivery. Keeps provider selection and vehicle filtering
 * out of the ViewModel so the UI works the same whether Lalamove is connected or not.
 */
class DeliveryRepository(
    private val provider: DeliveryProvider,
    private val catalogue: List<DeliveryVehicle> = LalamoveVehicleCatalog.reference
) {
    val providerName: String get() = provider.providerName
    val isConfigured: Boolean get() = provider.isConfigured

    suspend fun vehicleOptions(): VehicleOptions {
        if (!provider.isConfigured) {
            return VehicleOptions(
                vehicles = DeliveryVehicles.supported(catalogue, providerServiceTypes = null),
                live = false,
                message = "Vehicle availability is confirmed by ${provider.providerName} when live quotes are connected."
            )
        }
        return when (val result = provider.availableServiceTypes()) {
            is DeliveryResult.Success -> VehicleOptions(
                vehicles = DeliveryVehicles.supported(catalogue, result.data),
                live = true
            )
            is DeliveryResult.Failure -> VehicleOptions(emptyList(), live = true, message = result.message)
        }
    }

    suspend fun requestQuote(request: DeliveryQuoteRequest): DeliveryResult<DeliveryQuote> = provider.requestQuote(request)

    suspend fun book(request: DeliveryBookingRequest): DeliveryResult<DeliveryBooking> = provider.book(request)
}
