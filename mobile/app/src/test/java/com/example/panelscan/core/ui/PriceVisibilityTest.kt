package com.example.panelscan.core.ui

import com.example.panelscan.TestPanels
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PriceVisibilityTest {

    @Test
    fun `test philippine peso currency formatting`() {
        assertEquals("₱1,850.00", formatCurrency(1850.0))
        assertEquals("₱2,100.00", formatCurrency(2100.0))
        assertEquals("₱450.00", formatCurrency(450.0))
        assertEquals("₱620.00", formatCurrency(620.0))
        assertEquals("₱0.00", formatCurrency(0.0))
    }

    @Test
    fun `test product catalog prices are in php and match required figures`() {
        val oak = TestPanels.wallPanels.first { it.name.contains("Oak Veneer", ignoreCase = true) }
        assertNotNull(oak.pricePerUnit)
        assertEquals(1850.0, oak.pricePerUnit!!, 0.001)
        assertEquals("₱1,850.00", formatCurrency(oak.pricePerUnit!!))

        val acoustic = TestPanels.wallPanels.first { it.name.contains("Acoustic Fabric", ignoreCase = true) }
        assertNotNull(acoustic.pricePerUnit)
        assertEquals(2100.0, acoustic.pricePerUnit!!, 0.001)
        assertEquals("₱2,100.00", formatCurrency(acoustic.pricePerUnit!!))

        val ceilingTile = TestPanels.ceilingPanels.first { it.name.contains("PVC Ceiling Tile", ignoreCase = true) }
        assertNotNull(ceilingTile.pricePerUnit)
        assertEquals(450.0, ceilingTile.pricePerUnit!!, 0.001)
        assertEquals("₱450.00", formatCurrency(ceilingTile.pricePerUnit!!))

        val gypsum = TestPanels.ceilingPanels.first { it.name.contains("Gypsum", ignoreCase = true) }
        assertNotNull(gypsum.pricePerUnit)
        assertEquals(620.0, gypsum.pricePerUnit!!, 0.001)
        assertEquals("₱620.00", formatCurrency(gypsum.pricePerUnit!!))
    }

    @Test
    fun `test no usd currency is used in catalog`() {
        for (panel in TestPanels.allPanels) {
            val formatted = panel.pricePerUnit?.let { formatCurrency(it) } ?: ""
            assertTrue("Price must start with ₱", formatted.isEmpty() || formatted.startsWith("₱"))
            assertFalse("Price must not contain $", formatted.contains("$"))
            assertFalse("Price must not contain USD", formatted.contains("USD"))
        }
    }

    @Test
    fun `test price visibility hides price when not logged in`() {
        assertEquals("Log in to view pricing", PriceVisibility.formatPriceOrHidden(1850.0, isPriceVisible = false))
        assertEquals("₱1,850.00", PriceVisibility.formatPriceOrHidden(1850.0, isPriceVisible = true))
        assertEquals("Log in to view price", PriceVisibility.formatUnitPriceOrHidden(1850.0, isPriceVisible = false, suffix = " / panel"))
        assertEquals("₱1,850.00 / panel", PriceVisibility.formatUnitPriceOrHidden(1850.0, isPriceVisible = true, suffix = " / panel"))
    }
}
