package com.example.panelscan.data.repository

import com.example.panelscan.core.model.InstallationBooking
import com.example.panelscan.core.model.InstallationStatus
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import com.example.panelscan.core.util.ManilaTime
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.Serializable

/**
 * Installation requests on the backend (/api/bookings), the same as the
 * website: a preferred date, the address and optional notes. The team then
 * approves, schedules and assigns an installer; a pending request can be
 * cancelled by the customer.
 */
class InstallationRepository(private val api: ApiClient? = null) {

    private val _bookings = MutableStateFlow<List<InstallationBooking>>(emptyList())
    val bookings: StateFlow<List<InstallationBooking>> = _bookings.asStateFlow()

    /** Loads the customer's requests; null on success, else why it failed. */
    suspend fun refresh(): String? {
        val client = api ?: return null
        return try {
            val result: BookingPage = client.get("/bookings?limit=$PAGE_SIZE", authenticated = true)
            _bookings.value = result.bookings.map { it.toBooking() }
            null
        } catch (error: ApiException) {
            error.message
        }
    }

    /**
     * Requests installation on [day] ("yyyy-MM-dd") at [time] ("HH:mm"),
     * Philippine time. [orderId] links the request to that order.
     */
    suspend fun requestInstallation(
        day: String,
        time: String,
        address: String,
        notes: String? = null,
        orderId: String? = null
    ): Result<InstallationBooking> {
        val client = api ?: return Result.failure(IllegalStateException("Installation requests are not available."))
        val body = CreateBookingRequest(
            scheduledDate = ManilaTime.toUtcIso(day, time),
            address = address.trim(),
            notes = notes?.trim()?.ifBlank { null },
            orderId = orderId
        )
        return try {
            val result: BookingResponse = client.post("/bookings", body, authenticated = true)
            val booking = result.booking.toBooking()
            _bookings.update { listOf(booking) + it.filter { b -> b.id != booking.id } }
            Result.success(booking)
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    /** Only a pending request can be cancelled. */
    suspend fun cancelBooking(bookingId: String): Result<InstallationBooking> {
        val client = api ?: return Result.failure(IllegalStateException("Installation requests are not available."))
        return try {
            val result: BookingResponse = client.patch("/bookings/$bookingId/cancel", EmptyBody(), authenticated = true)
            val booking = result.booking.toBooking()
            _bookings.update { list -> list.map { if (it.id == booking.id) booking else it } }
            Result.success(booking)
        } catch (error: ApiException) {
            Result.failure(IllegalStateException(error.message))
        }
    }

    /** After logging out: the requests belong to the account. */
    fun onSignedOut() {
        _bookings.value = emptyList()
    }

    private fun ApiBooking.toBooking(): InstallationBooking {
        val (day, hour) = ManilaTime.fromUtcIso(scheduledDate) ?: (scheduledDate.take(10) to 9)
        return InstallationBooking(
            id = id,
            orderId = orderId,
            orderNumber = order?.orderNumber,
            scheduledDate = day,
            preferredTime = if (hour < 12) MORNING else AFTERNOON,
            address = address,
            notes = notes,
            status = runCatching { InstallationStatus.valueOf(status) }.getOrDefault(InstallationStatus.PENDING),
            installerName = installer?.let { "${it.firstName} ${it.lastName}".trim() },
            installerSpecialty = installer?.specialty,
            createdAt = parseIsoMillis(createdAt) ?: System.currentTimeMillis()
        )
    }

    @Serializable
    private data class ApiInstaller(val firstName: String = "", val lastName: String = "", val specialty: String? = null)

    @Serializable
    private data class ApiBookingOrder(val orderNumber: String)

    @Serializable
    private data class ApiBooking(
        val id: String,
        val orderId: String? = null,
        val status: String,
        val scheduledDate: String,
        val address: String,
        val notes: String? = null,
        val createdAt: String,
        val installer: ApiInstaller? = null,
        val order: ApiBookingOrder? = null
    )

    @Serializable
    private data class BookingPage(val bookings: List<ApiBooking> = emptyList())

    @Serializable
    private data class BookingResponse(val booking: ApiBooking)

    @Serializable
    private data class CreateBookingRequest(val scheduledDate: String, val address: String, val notes: String?, val orderId: String?)

    @Serializable
    private class EmptyBody

    companion object {
        private const val PAGE_SIZE = 30
        const val MORNING = "Morning (9:00 AM - 12:00 PM)"
        const val AFTERNOON = "Afternoon (1:00 PM - 5:00 PM)"

        /** Start of each window, Philippine time, sent as the scheduled time. */
        fun startTime(window: String): String = if (window == AFTERNOON) "13:00" else "09:00"
    }
}
