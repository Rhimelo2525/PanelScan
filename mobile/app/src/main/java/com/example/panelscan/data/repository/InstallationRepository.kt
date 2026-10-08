package com.example.panelscan.data.repository

import com.example.panelscan.core.model.InstallationBooking
import com.example.panelscan.core.model.InstallationStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

/**
 * Local frontend Installation Service Repository.
 * Handles customer installation requests, scheduling, and status tracking locally.
 */
class InstallationRepository(private val onUpdated: ((InstallationBooking) -> Unit)? = null) {

    private val _bookings = MutableStateFlow<List<InstallationBooking>>(emptyList())
    val bookings: StateFlow<List<InstallationBooking>> = _bookings.asStateFlow()

    fun requestInstallation(
        orderId: String? = null,
        orderNumber: String? = null,
        scheduledDate: String,
        preferredTime: String,
        address: String,
        notes: String? = null
    ): InstallationBooking {
        val newBooking = InstallationBooking(
            id = "booking-${UUID.randomUUID().toString().take(8)}",
            orderId = orderId,
            orderNumber = orderNumber,
            scheduledDate = scheduledDate,
            preferredTime = preferredTime,
            address = address,
            notes = notes,
            status = InstallationStatus.PENDING,
            createdAt = System.currentTimeMillis()
        )
        _bookings.update { listOf(newBooking) + it }
        onUpdated?.invoke(newBooking)
        return newBooking
    }

    fun cancelBooking(bookingId: String): Boolean {
        var found = false
        var changed: InstallationBooking? = null
        _bookings.update { list ->
            list.map { booking ->
                if (booking.id == bookingId && booking.status == InstallationStatus.PENDING) {
                    found = true
                    booking.copy(status = InstallationStatus.CANCELLED).also { changed = it }
                } else booking
            }
        }
        changed?.let { onUpdated?.invoke(it) }
        return found
    }
}
