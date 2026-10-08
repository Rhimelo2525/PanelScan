package com.example.panelscan.feature.checkout

import com.example.panelscan.core.data.PhilippineAddress
import com.example.panelscan.TestPanels
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PhilippineAddressAndCheckoutTest {

    @Test
    fun `test all 17 Philippine regions exist`() {
        assertEquals(17, PhilippineAddress.regions.size)
        assertTrue(PhilippineAddress.regions.any { it.code == "NCR" })
        assertTrue(PhilippineAddress.regions.any { it.code == "CAR" })
        assertTrue(PhilippineAddress.regions.any { it.code == "IV-A" })
        assertTrue(PhilippineAddress.regions.any { it.code == "VII" })
        assertTrue(PhilippineAddress.regions.any { it.code == "XI" })
        assertTrue(PhilippineAddress.regions.any { it.code == "BARMM" })
    }

    @Test
    fun `test dependent cascading provinces cities and barangays`() {
        // NCR -> Metro Manila -> Taguig -> BGC
        val ncrProvinces = PhilippineAddress.provincesFor("NCR")
        assertTrue("NCR must contain Metro Manila", ncrProvinces.contains("Metro Manila"))

        val metroManilaCities = PhilippineAddress.citiesFor("Metro Manila")
        assertTrue("Metro Manila must contain Taguig", metroManilaCities.contains("Taguig"))
        assertTrue("Metro Manila must contain Quezon City", metroManilaCities.contains("Quezon City"))
        assertTrue("Metro Manila must contain Makati", metroManilaCities.contains("Makati"))

        val taguigBarangays = PhilippineAddress.barangaysFor("Taguig")
        assertTrue(taguigBarangays.any { it.contains("BGC") || it.contains("Fort Bonifacio") })

        // Region VII -> Cebu -> Cebu City
        val reg7Provinces = PhilippineAddress.provincesFor("VII")
        assertTrue(reg7Provinces.contains("Cebu"))
        val cebuCities = PhilippineAddress.citiesFor("Cebu")
        assertTrue(cebuCities.contains("Cebu City"))
        val cebuBarangays = PhilippineAddress.barangaysFor("Cebu City")
        assertTrue(cebuBarangays.isNotEmpty())
    }

    @Test
    fun `test reverse lookup for city province and region`() {
        // Taguig -> Metro Manila -> NCR
        val taguigProvince = PhilippineAddress.findProvinceForCity("Taguig")
        assertEquals("Metro Manila", taguigProvince)
        val taguigRegion = PhilippineAddress.findRegionForProvince("Metro Manila")
        assertNotNull(taguigRegion)
        assertTrue(taguigRegion!!.code.startsWith("NCR"))

        // Cebu City -> Cebu -> Region VII
        val cebuProvince = PhilippineAddress.findProvinceForCity("Cebu City")
        assertEquals("Cebu", cebuProvince)
        val cebuRegion = PhilippineAddress.findRegionForProvince("Cebu")
        assertNotNull(cebuRegion)
        assertTrue(cebuRegion!!.code.contains("VII"))

        // Davao City -> Davao del Sur -> Region XI
        val davaoProvince = PhilippineAddress.findProvinceForCity("Davao City")
        assertEquals("Davao del Sur", davaoProvince)
        val davaoRegion = PhilippineAddress.findRegionForProvince("Davao del Sur")
        assertNotNull(davaoRegion)
        assertTrue(davaoRegion!!.code.contains("XI"))
    }

    @Test
    fun `test all panels have positive thickness specification`() {
        TestPanels.allPanels.forEach { panel ->
            assertTrue("Panel ${panel.name} must have positive thickness", panel.thicknessMm > 0)
            assertTrue("Panel ${panel.name} must have positive width", panel.widthMeters > 0)
            assertTrue("Panel ${panel.name} must have positive height", panel.heightMeters > 0)
            assertTrue("Panel ${panel.name} must have positive coverage", panel.coverageSquareMeters > 0)
        }
    }
}
