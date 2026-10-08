package com.example.panelscan.data.repository

import com.example.panelscan.TestPanels
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ticking cart items for checkout (kept on the device; the cart itself is synced). */
class CartSelectionTest {

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
