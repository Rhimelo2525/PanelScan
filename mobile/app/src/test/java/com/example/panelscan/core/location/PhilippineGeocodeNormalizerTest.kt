package com.example.panelscan.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhilippineGeocodeNormalizerTest {

    @Test
    fun `maps device fields to the Philippine checkout hierarchy`() {
        val result = PhilippineGeocodeNormalizer.normalize(
            RawGeocodedAddress(
                thoroughfare = "Mount Sinai Street",
                subLocality = "San Manuel",
                locality = "San Jose del Monte",
                subAdminArea = "Bulacan",
                adminArea = "Central Luzon",
                postalCode = "3023",
                countryCode = "PH"
            )
        )
        assertEquals("Mount Sinai Street", result.street)
        assertEquals("San Manuel", result.barangay)
        assertEquals("San Jose del Monte City", result.city)
        assertEquals("Bulacan", result.province)
        assertEquals("Region III — Central Luzon", result.region)
        assertEquals("3023", result.postalCode)
    }

    @Test
    fun `fills details from an address line when structured fields are sparse`() {
        val result = PhilippineGeocodeNormalizer.normalize(
            RawGeocodedAddress(
                locality = "San Jose del Monte",
                adminArea = "Central Luzon",
                countryCode = "PH",
                addressLines = listOf("Mount Sinai Street, Brgy. San Manuel, City of San Jose del Monte, Bulacan, 3023, Philippines")
            )
        )
        assertEquals("Mount Sinai Street", result.street)
        assertEquals("San Manuel", result.barangay)
        assertEquals("San Jose del Monte City", result.city)
        assertEquals("Bulacan", result.province)
        assertEquals("Region III — Central Luzon", result.region)
        assertEquals("3023", result.postalCode)
    }

    @Test
    fun `combines compatible device results without borrowing another city's details`() {
        val result = PhilippineGeocodeNormalizer.combine(
            listOf(
                RawGeocodedAddress(locality = "San Jose del Monte", subAdminArea = "Bulacan", countryCode = "PH"),
                RawGeocodedAddress(locality = "City of San Jose del Monte", subAdminArea = "Bulacan", subLocality = "San Manuel", postalCode = "3023", countryCode = "PH"),
                RawGeocodedAddress(locality = "Makati", subAdminArea = "Metro Manila", thoroughfare = "Ayala Avenue", countryCode = "PH")
            )
        )
        assertEquals("San Manuel", result.barangay)
        assertEquals("3023", result.postalCode)
        assertEquals("", result.street)
    }

    @Test
    fun `does not invent missing barangay or postal code`() {
        val result = PhilippineGeocodeNormalizer.normalize(
            RawGeocodedAddress(locality = "San Jose del Monte", countryCode = "PH")
        )
        assertEquals("Bulacan", result.province)
        assertEquals("Region III — Central Luzon", result.region)
        assertEquals("", result.barangay)
        assertEquals("", result.postalCode)
        assertTrue(PhilippineGeocodeNormalizer.normalize(
            RawGeocodedAddress(locality = "Makati", countryCode = "US")
        ).city.isBlank())
    }

    @Test
    fun `known San Manuel pin can supply postcode when device omits it`() {
        val result = PhilippineGeocodeNormalizer.normalize(
            RawGeocodedAddress(locality = "San Jose del Monte", subLocality = "San Manuel", countryCode = "PH")
        )
        assertEquals("3023", result.postalCode)
    }
}
