package com.example.panelscan.core.location

import com.example.panelscan.core.data.PhilippineAddress
import java.text.Normalizer
import java.util.Locale

/** Values returned by Android's geocoder, kept separate so parsing can be tested without Android. */
data class RawGeocodedAddress(
    val thoroughfare: String? = null,
    val subThoroughfare: String? = null,
    val subLocality: String? = null,
    val locality: String? = null,
    val subAdminArea: String? = null,
    val adminArea: String? = null,
    val postalCode: String? = null,
    val featureName: String? = null,
    val countryCode: String? = null,
    val addressLines: List<String> = emptyList()
)

/** Maps variable Android geocoder labels to the checkout's Philippine address hierarchy. */
object PhilippineGeocodeNormalizer {
    private val postalPattern = Regex("\\d{4}")

    fun normalize(raw: RawGeocodedAddress): ResolvedDeliveryAddress {
        if (raw.countryCode?.isNotBlank() == true && !raw.countryCode.equals("PH", ignoreCase = true)) {
            return ResolvedDeliveryAddress()
        }
        val tokens = raw.addressLines.flatMap { it.split(',') }.map(String::trim).filter(String::isNotBlank)
        val directProvince = listOfNotNull(raw.subAdminArea, raw.adminArea)
            .plus(tokens)
            .firstNotNullOfOrNull(::canonicalProvince)
            .orEmpty()
        val cityCandidates = listOfNotNull(raw.locality, raw.subAdminArea).plus(tokens)
        val city = cityCandidates.firstNotNullOfOrNull { canonicalCity(it, directProvince) }
            ?: raw.locality.orEmpty().trim()
        val province = directProvince.ifBlank { PhilippineAddress.findProvinceForCity(city).orEmpty() }
        val region = if (province.isNotBlank()) {
            PhilippineAddress.findRegionForProvince(province)?.name.orEmpty()
        } else {
            listOfNotNull(raw.adminArea, raw.subAdminArea).plus(tokens)
                .firstNotNullOfOrNull(::canonicalRegion)
                .orEmpty()
        }
        val barangay = raw.subLocality.orEmpty().trim().removePrefix("Barangay ").removePrefix("Brgy. ")
            .takeUnless { samePlace(it, city) || samePlace(it, province) || canonicalRegion(it) != null }
            .orEmpty().ifBlank { findBarangayInLines(city, tokens).orEmpty() }
        val street = listOfNotNull(raw.subThoroughfare, raw.thoroughfare)
            .map(String::trim).filter(String::isNotBlank).joinToString(" ")
            .ifBlank {
                raw.featureName.orEmpty().trim().takeUnless { feature ->
                    feature.isBlank() || samePlace(feature, city) || samePlace(feature, barangay) ||
                        samePlace(feature, province) || canonicalRegion(feature) != null ||
                        postalPattern.matches(feature) || samePlace(feature, "Philippines")
                }.orEmpty()
            }
            .ifBlank {
                tokens.firstOrNull { token ->
                    !samePlace(token, city) && !samePlace(token, barangay) &&
                        !samePlace(token, province) && canonicalRegion(token) == null &&
                        !postalPattern.matches(token) && !samePlace(token, "Philippines")
                }.orEmpty()
            }
        val postal = raw.postalCode.orEmpty().trim().takeIf { postalPattern.matches(it) }
            ?: tokens.firstOrNull { postalPattern.matches(it) }
            ?: knownPostalCode(city, barangay)
        return ResolvedDeliveryAddress(street, barangay, city, province, postal, region)
    }

    /** Multiple Android results often describe different levels of the same pinned address. */
    fun combine(rawAddresses: List<RawGeocodedAddress>): ResolvedDeliveryAddress {
        val results = rawAddresses.map(::normalize)
        val primary = results.firstOrNull() ?: return ResolvedDeliveryAddress()
        return results.drop(1).fold(primary) { current, other ->
            val sameProvince = current.province.isBlank() || other.province.isBlank() ||
                samePlace(current.province, other.province)
            val sameCity = current.city.isBlank() || other.city.isBlank() || samePlace(current.city, other.city)
            if (!sameProvince || !sameCity) current else current.copy(
                street = current.street.ifBlank { other.street },
                barangay = current.barangay.ifBlank { other.barangay },
                city = current.city.ifBlank { other.city },
                province = current.province.ifBlank { other.province },
                postalCode = current.postalCode.ifBlank { other.postalCode },
                region = current.region.ifBlank { other.region }
            )
        }
    }

    fun samePlace(first: String, second: String): Boolean = key(first) == key(second)

    private fun canonicalProvince(value: String): String? =
        PhilippineAddress.allProvinces().firstOrNull {
            samePlace(it, value) || samePlace("$it Province", value)
        }

    private fun canonicalCity(value: String, province: String): String? {
        val options = if (province.isBlank()) PhilippineAddress.allCities() else PhilippineAddress.citiesFor(province)
        return options.firstOrNull { samePlace(it, value) }
    }

    private fun canonicalRegion(value: String): String? = PhilippineAddress.regions.firstOrNull { region ->
        samePlace(region.name, value) || samePlace(region.name.substringAfter('—').trim(), value) ||
            samePlace("Region ${region.code}", value)
    }?.name

    private fun findBarangayInLines(city: String, tokens: List<String>): String? {
        if (city.isBlank()) return null
        val options = PhilippineAddress.barangaysFor(city)
        return options.firstOrNull { barangay -> tokens.any { samePlace(it, barangay) } }
            ?: tokens.firstOrNull { it.startsWith("Barangay ", ignoreCase = true) || it.startsWith("Brgy. ", ignoreCase = true) }
                ?.replace(Regex("^(Barangay|Brgy\\.)\\s+", RegexOption.IGNORE_CASE), "")
    }

    /** Specific verified postal code; San Jose del Monte as a whole has more than one code. */
    private fun knownPostalCode(city: String, barangay: String): String = when {
        samePlace(city, "San Jose del Monte City") && samePlace(barangay, "San Manuel") -> "3023"
        else -> ""
    }

    private fun key(value: String): String {
        val plain = Normalizer.normalize(value.lowercase(Locale.ROOT), Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .replace(Regex("[^a-z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        return plain.removePrefix("city of ")
            .removePrefix("municipality of ")
            .removePrefix("province of ")
            .removePrefix("barangay ")
            .removePrefix("brgy ")
            .removeSuffix(" city")
            .trim()
    }
}
