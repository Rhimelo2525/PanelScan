package com.example.panelscan.feature.orders

import com.example.panelscan.core.model.Order
import com.example.panelscan.core.model.OrderDeliveryDetails
import com.example.panelscan.core.model.OrderItem
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.data.repository.parseIsoMillis
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The orders list reads as on the website: tabs, search, amounts and delivery labels. */
class OrderListTest {

    private fun order(number: String, status: OrderStatus, product: String, delivery: String? = null, quoted: Boolean = false) = Order(
        id = number, orderNumber = number,
        items = listOf(OrderItem("i-$number", "p", product, "", 20.0, 1, 20.0, "wood_oak")),
        subtotal = 20.0, shippingFee = if (quoted) 58.0 else 0.0, installationFee = 0.0, totalAmount = if (quoted) 78.0 else 20.0,
        hasInstallation = false, shippingAddress = "", customerName = "", customerEmail = "", paymentMethod = "GCash",
        status = status, delivery = OrderDeliveryDetails(status = delivery), shippingQuoted = quoted
    )

    private val orders = listOf(
        order("PS-20261001-ETQRRI", OrderStatus.CANCELLED, "brown ceiling panel", "CANCELLED", quoted = true),
        order("PS-20260923-L52MF2", OrderStatus.PENDING, "Test 1 Ceiling Panel", "AWAITING_QUOTE"),
        order("PS-20260920-AAAAAA", OrderStatus.DELIVERED, "Live oak", "COMPLETED", quoted = true)
    )

    @Test
    fun `tabs and search narrow the list by status, order number or product`() {
        assertEquals(3, filterOrders(orders, null, "").size)
        assertEquals(listOf("PS-20260923-L52MF2"), filterOrders(orders, OrderStatus.PENDING, "").map { it.id })
        assertEquals(listOf("PS-20261001-ETQRRI"), filterOrders(orders, null, " etqrri ").map { it.id })
        assertEquals(listOf("PS-20260920-AAAAAA"), filterOrders(orders, null, "LIVE").map { it.id })
        assertTrue(filterOrders(orders, OrderStatus.PENDING, "live").isEmpty())
    }

    @Test
    fun `before the delivery fee is quoted only the subtotal is shown`() {
        assertTrue(orders[1].awaitingFee)
        assertFalse(orders[0].awaitingFee)
        assertFalse(orders[2].awaitingFee)
    }

    @Test
    fun `delivery stages and dates read as on the website`() {
        assertEquals("Awaiting shipping quote", deliveryStatusLabel("AWAITING_QUOTE"))
        assertEquals("In transit", deliveryStatusLabel("picked_up"))
        assertEquals("Not requested", deliveryStatusLabel(null))
        assertEquals("Status: SOMETHING_NEW", deliveryStatusLabel("SOMETHING_NEW"))
        // 2026-10-01 17:07 UTC is past midnight in Manila.
        assertEquals("Oct 2, 2026, 1:07 AM", formatOrderDate(parseIsoMillis("2026-10-01T17:07:00.000Z")!!))
    }
}
