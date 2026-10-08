package com.example.panelscan.data.repository

import com.example.panelscan.TestPanels
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CartFlowTest {

    private lateinit var cartRepository: CartRepository

    @Before
    fun setup() {
        cartRepository = CartRepository()
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
}
