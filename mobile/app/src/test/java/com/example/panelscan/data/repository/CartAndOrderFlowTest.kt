package com.example.panelscan.data.repository

import com.example.panelscan.TestPanels
import com.example.panelscan.core.model.InstallationStatus
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.model.OrderDeliveryDetails
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CartAndOrderFlowTest {

    private lateinit var cartRepository: CartRepository
    private lateinit var orderRepository: OrderRepository
    private lateinit var installationRepository: InstallationRepository
    private lateinit var feedbackRepository: FeedbackRepository

    @Before
    fun setup() {
        cartRepository = CartRepository()
        orderRepository = OrderRepository()
        installationRepository = InstallationRepository()
        feedbackRepository = FeedbackRepository(orderRepository)
    }

    @Test
    fun testCartOperations() {
        val oakPanel = TestPanels.allPanels.first { it.name == "Oak Veneer Wall Panel" }
        val marblePanel = TestPanels.allPanels.first { it.name == "Classic White Marble" }

        // Add 3 Oak panels (₱1,850 each)
        cartRepository.addToCart(oakPanel, 3)
        assertEquals(3, cartRepository.itemCount)
        assertEquals(1, cartRepository.items.value.size)
        assertEquals(3, cartRepository.items.value.first().quantity)
        assertEquals(5550.0, cartRepository.subtotal, 0.001)

        // Add 2 Classic White Marble panels (₱1,250 each)
        cartRepository.addToCart(marblePanel, 2)
        assertEquals(5, cartRepository.itemCount)
        assertEquals(2, cartRepository.items.value.size)
        val expectedSubtotal = (3 * 1850.0) + (2 * 1250.0) // 5550 + 2500 = 8050
        assertEquals(expectedSubtotal, cartRepository.subtotal, 0.001)

        // Update quantity
        val oakItemId = cartRepository.items.value.first { it.panel.id == oakPanel.id }.id
        cartRepository.updateQuantity(oakItemId, 5)
        assertEquals(7, cartRepository.itemCount)
        assertEquals(5, cartRepository.items.value.first { it.id == oakItemId }.quantity)

        // Remove item
        cartRepository.removeFromCart(oakItemId)
        assertEquals(2, cartRepository.itemCount)
        assertEquals(1, cartRepository.items.value.size)
        assertEquals(2500.0, cartRepository.subtotal, 0.001)

        // Clear cart
        cartRepository.clearCart()
        assertEquals(0, cartRepository.itemCount)
        assertEquals(0, cartRepository.items.value.size)
        assertEquals(0.0, cartRepository.subtotal, 0.001)
    }

    @Test
    fun testSelectiveCheckout() {
        val oakPanel = TestPanels.allPanels.first { it.name == "Oak Veneer Wall Panel" } // ₱1,850
        val marblePanel = TestPanels.allPanels.first { it.name == "Classic White Marble" } // ₱1,250

        cartRepository.addToCart(oakPanel, 2) // 3700
        cartRepository.addToCart(marblePanel, 1) // 1250

        val oakItem = cartRepository.items.value.first { it.panel.id == oakPanel.id }
        val marbleItem = cartRepository.items.value.first { it.panel.id == marblePanel.id }

        // By default, all newly added items are selected
        assertTrue(cartRepository.isAllSelected)
        assertEquals(2, cartRepository.selectedItems.size)
        assertEquals(3, cartRepository.selectedItemCount)
        assertEquals(4950.0, cartRepository.selectedSubtotal, 0.001)

        // Unselect marble panel
        cartRepository.toggleSelection(marbleItem.id)
        assertTrue(!cartRepository.isAllSelected)
        assertEquals(1, cartRepository.selectedItems.size)
        assertEquals(2, cartRepository.selectedItemCount)
        assertEquals(3700.0, cartRepository.selectedSubtotal, 0.001)

        // Remove selected items (oak panel only)
        cartRepository.removeSelectedItems()
        assertEquals(1, cartRepository.items.value.size)
        assertEquals(marbleItem.id, cartRepository.items.value.first().id)
        assertEquals(1, cartRepository.itemCount)
        assertEquals(1250.0, cartRepository.subtotal, 0.001)
    }

    @Test
    fun testOrderStatusUpdateAndReviewEligibility() {
        val order = orderRepository.createOrder(
            cartItems = cartRepository.items.value,
            customerName = "Juan Gomez",
            customerEmail = "juan@gmail.com",
            customerPhone = "+639171112233",
            shippingAddress = "Unit 1, Pasig City",
            hasInstallation = false,
            paymentMethod = "GCash",
            notes = ""
        )

        assertEquals(OrderStatus.PENDING, order.status)
        // Not completed yet, so cannot review
        assertTrue(orderRepository.getOrdersEligibleForReview(emptySet()).none { it.id == order.id })

        // A local pending payment cannot be marked complete or reviewed.
        assertTrue(!orderRepository.updateOrderStatus(order.id, OrderStatus.COMPLETED))
        assertTrue(orderRepository.getOrdersEligibleForReview(emptySet()).isEmpty())

        // A provider-confirmed payment is represented explicitly in this repository test.
        val paidOrder = orderRepository.createOrder(
            cartItems = TestPanels.allPanels.take(2).mapIndexed { index, panel ->
                com.example.panelscan.core.model.CartItem("paid-item-$index", panel, 1)
            },
            customerName = "Juan Gomez",
            customerEmail = "juan@gmail.com",
            customerPhone = "+639171112233",
            shippingAddress = "Unit 1, Pasig City",
            hasInstallation = false,
            paymentMethod = "GCash",
            delivery = OrderDeliveryDetails(paymentStatus = "Paid")
        )
        orderRepository.updateOrderStatus(paidOrder.id, OrderStatus.COMPLETED)
        val updated = orderRepository.getOrderById(paidOrder.id)
        assertEquals(OrderStatus.COMPLETED, updated?.status)
        assertTrue(orderRepository.getOrdersEligibleForReview(emptySet()).any { it.id == paidOrder.id })

        // Submit review
        feedbackRepository.submitReview(
            orderId = paidOrder.id,
            orderNumber = paidOrder.orderNumber,
            panelId = paidOrder.items.first().panelId,
            customerName = "Juan Gomez",
            rating = 5,
            comment = "Great wall paneling quality!"
        )

        // Duplicate review prevention
        assertTrue(feedbackRepository.hasReviewed(paidOrder.id))
        val duplicate = feedbackRepository.submitReview(
            orderId = paidOrder.id,
            orderNumber = paidOrder.orderNumber,
            panelId = paidOrder.items.first().panelId,
            customerName = "Juan Gomez",
            rating = 4,
            comment = "Trying to submit again"
        )
        // Should return existing review without creating duplicate
        assertEquals(5, duplicate.rating)
        assertEquals("Great wall paneling quality!", duplicate.comment)
        assertEquals(1, feedbackRepository.reviewsForProduct(paidOrder.items.first().panelId).size)
        assertTrue(feedbackRepository.reviewsForProduct(paidOrder.items.last().panelId).isEmpty())
        feedbackRepository.submitReview(
            orderId = paidOrder.id,
            orderNumber = paidOrder.orderNumber,
            panelId = paidOrder.items.last().panelId,
            customerName = "Juan Gomez",
            rating = 4,
            comment = "The second panel also worked well."
        )
        assertEquals(1, feedbackRepository.reviewsForProduct(paidOrder.items.last().panelId).size)
        assertTrue(runCatching {
            feedbackRepository.submitReview(order.id, order.orderNumber, paidOrder.items.first().panelId,
                "Juan Gomez", 5, "Unpaid order")
        }.isFailure)
    }

    @Test
    fun testOrderCreationAndTracking() {
        val panels = TestPanels.allPanels.take(2)
        panels.forEach { cartRepository.addToCart(it, 4) }

        val order = orderRepository.createOrder(
            cartItems = cartRepository.items.value,
            customerName = "Maria Santos",
            customerEmail = "maria.santos@example.ph",
            customerPhone = "+63 917 123 4567",
            shippingAddress = "Unit 402, Acacia Estates, Taguig City, Metro Manila",
            hasInstallation = true,
            paymentMethod = "GCash (Preview Demo)",
            notes = "Please coordinate gate pass with guard house"
        )

        assertNotNull(order)
        assertTrue(order.orderNumber.startsWith("PS-"))
        assertEquals("Maria Santos", order.customerName)
        assertEquals(OrderStatus.PENDING, order.status)
        assertEquals(0.0, order.installationFee, 0.001)
        assertEquals(order.subtotal, order.totalAmount, 0.001)

        // Fetch order by id
        val fetched = orderRepository.getOrderById(order.id)
        assertNotNull(fetched)
        assertEquals(order.id, fetched!!.id)

        assertEquals(1, orderRepository.orders.value.size)
    }

    @Test
    fun testInstallationBooking() {
        val booking = installationRepository.requestInstallation(
            orderId = "demo-order-1",
            orderNumber = "PS-2026-1082",
            scheduledDate = "2026-10-15",
            preferredTime = "Morning (9:00 AM - 12:00 PM)",
            address = "Unit 12B, Pacific Plaza Towers, Bonifacio Global City, Taguig",
            notes = "Installation for living room feature wall"
        )

        assertNotNull(booking)
        assertEquals(InstallationStatus.PENDING, booking.status)
        assertEquals("2026-10-15", booking.scheduledDate)

        assertEquals(1, installationRepository.bookings.value.size)
    }

    @Test
    fun testFeedbackSubmission() {
        val initialCount = feedbackRepository.reviews.value.size
        assertEquals(0, initialCount)

        val paidOrder = orderRepository.createOrder(
            cartItems = listOf(com.example.panelscan.core.model.CartItem(
                id = "review-item", panel = TestPanels.allPanels.first(), quantity = 1
            )),
            customerName = "Arch. Miguel Torres",
            customerEmail = "miguel@example.ph",
            customerPhone = "+639171112233",
            shippingAddress = "Taguig City",
            hasInstallation = false,
            paymentMethod = "GCash",
            delivery = OrderDeliveryDetails(paymentStatus = "Paid")
        )
        assertTrue(orderRepository.updateOrderStatus(paidOrder.id, OrderStatus.COMPLETED))

        val review = feedbackRepository.submitReview(
            orderId = paidOrder.id,
            orderNumber = paidOrder.orderNumber,
            panelId = paidOrder.items.first().panelId,
            customerName = "Arch. Miguel Torres",
            rating = 5,
            comment = "Outstanding precision with the AR measurement tool and the interlocking PVC panels fitted seamlessly!"
        )

        assertNotNull(review)
        assertEquals(5, review.rating)
        assertEquals(paidOrder.orderNumber, review.orderNumber)
        assertEquals(initialCount + 1, feedbackRepository.reviews.value.size)
    }
}
