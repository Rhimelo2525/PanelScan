package com.example.panelscan.feature.legal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LegalComplianceTest {

    @Test
    fun `test privacy policy structure and complete content from website`() {
        val policy = LegalContent.privacyPolicy
        assertEquals("Privacy", policy.eyebrow)
        assertEquals("Privacy Policy", policy.title)
        assertEquals("August 2026", policy.lastUpdated)
        assertFalse(policy.introduction.isBlank())
        assertFalse(policy.advisoryNotice.isBlank())
        assertEquals(14, policy.sections.size)

        // Verify required sections exist
        val sectionIds = policy.sections.map { it.id }.toSet()
        assertTrue(sectionIds.contains("scope"))
        assertTrue(sectionIds.contains("information"))
        assertTrue(sectionIds.contains("payments"))
        assertTrue(sectionIds.contains("use"))
        assertTrue(sectionIds.contains("measurements"))
        assertTrue(sectionIds.contains("mobile-ar"))
        assertTrue(sectionIds.contains("sharing"))
        assertTrue(sectionIds.contains("legal"))
        assertTrue(sectionIds.contains("security"))
        assertTrue(sectionIds.contains("retention"))
        assertTrue(sectionIds.contains("rights"))
        assertTrue(sectionIds.contains("cookies"))
        assertTrue(sectionIds.contains("children-transfers"))
        assertTrue(sectionIds.contains("changes-contact"))

        // Verify information section has 7 bullet points
        val infoSection = policy.sections.first { it.id == "information" }
        assertEquals(7, infoSection.bullets.size)

        // Verify mobile-ar camera privacy statement
        val arSection = policy.sections.first { it.id == "mobile-ar" }
        assertTrue(arSection.paragraphs.any { it.contains("camera", ignoreCase = true) })
        assertTrue(arSection.paragraphs.any { it.contains("sensor reading", ignoreCase = true) })
    }

    @Test
    fun `test terms of service structure and complete content from website`() {
        val terms = LegalContent.termsOfService
        assertEquals("Legal", terms.eyebrow)
        assertEquals("Terms of Service", terms.title)
        assertEquals("August 2026", terms.lastUpdated)
        assertFalse(terms.introduction.isBlank())
        assertFalse(terms.advisoryNotice.isBlank())
        assertEquals(17, terms.sections.size)

        // Verify required sections exist
        val sectionIds = terms.sections.map { it.id }.toSet()
        assertTrue(sectionIds.contains("acceptance"))
        assertTrue(sectionIds.contains("accounts"))
        assertTrue(sectionIds.contains("products-pricing"))
        assertTrue(sectionIds.contains("orders"))
        assertTrue(sectionIds.contains("payment"))
        assertTrue(sectionIds.contains("delivery"))
        assertTrue(sectionIds.contains("installation"))
        assertTrue(sectionIds.contains("measurements"))
        assertTrue(sectionIds.contains("mobile-ar"))
        assertTrue(sectionIds.contains("imagery"))
        assertTrue(sectionIds.contains("stock"))
        assertTrue(sectionIds.contains("cancellations"))
        assertTrue(sectionIds.contains("intellectual-property"))
        assertTrue(sectionIds.contains("prohibited-use"))
        assertTrue(sectionIds.contains("third-parties"))
        assertTrue(sectionIds.contains("liability"))
        assertTrue(sectionIds.contains("changes-contact"))

        // Verify mobile AR disclaimer clause
        val arSection = terms.sections.first { it.id == "mobile-ar" }
        assertEquals("AR, 3D, and mobile measurement disclaimer", arSection.title)
        assertTrue(arSection.paragraphs.any { it.contains("independently verify measurements", ignoreCase = true) })

        // Verify installation services clause
        val installSection = terms.sections.first { it.id == "installation" }
        assertTrue(installSection.paragraphs.any { it.contains("Disenyo Interior Solution", ignoreCase = true) })
    }

    @Test
    fun `test all legal sections contain valid non-empty paragraphs`() {
        val allDocs = listOf(LegalContent.privacyPolicy, LegalContent.termsOfService)
        for (doc in allDocs) {
            for (section in doc.sections) {
                assertFalse("Section ${section.id} in ${doc.title} must have title", section.title.isBlank())
                assertTrue("Section ${section.id} in ${doc.title} must have paragraphs", section.paragraphs.isNotEmpty())
                for (paragraph in section.paragraphs) {
                    assertFalse("Paragraph in ${section.title} cannot be blank", paragraph.isBlank())
                }
            }
        }
    }
}
