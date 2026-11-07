package com.example.panelscan.feature.projects

import com.example.panelscan.core.model.PVCPanel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProjectCheckoutTest {

    private fun panel(inventoryQty: Int?, inStock: Boolean = true) = PVCPanel(
        id = "p1", name = "Panel", category = "PVC Wall Panel",
        widthMeters = 0.17, heightMeters = 2.9, textureResource = "t", pricePerUnit = 330.0,
        inStock = inStock, inventoryQty = inventoryQty
    )

    @Test
    fun `enough stock can go to checkout`() {
        assertNull(projectCheckoutProblem(panel(inventoryQty = 5), 5))
        assertNull(projectCheckoutProblem(panel(inventoryQty = 100), 5))
    }

    @Test
    fun `unknown stock is left to the backend`() {
        assertNull(projectCheckoutProblem(panel(inventoryQty = null), 5))
    }

    @Test
    fun `too little stock says how many are available`() {
        assertEquals(
            "This project needs 5 panels, but only 4 are available.",
            projectCheckoutProblem(panel(inventoryQty = 4), 5)
        )
    }

    @Test
    fun `no stock is out of stock`() {
        assertEquals("This panel is currently out of stock.", projectCheckoutProblem(panel(inventoryQty = 0), 5))
        assertEquals("This panel is currently out of stock.", projectCheckoutProblem(panel(inventoryQty = null, inStock = false), 5))
    }

    @Test
    fun `a panel no longer sold cannot go to checkout`() {
        assertEquals(
            "This panel is no longer available. Choose another panel to continue.",
            projectCheckoutProblem(null, 5)
        )
    }

    @Test
    fun `a project with nothing to order cannot go to checkout`() {
        assertEquals("This project has no panels to order.", projectCheckoutProblem(panel(inventoryQty = 10), 0))
    }
}
