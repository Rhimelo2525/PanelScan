package com.example.panelscan.core.validation

import com.example.panelscan.core.validation.AccountRules.Field
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The website's Create Account rules (web/src/auth/registration-validation.ts), same cases and messages. */
class AccountRulesTest {

    @Test
    fun `names keep single spaces but refuse leading and double spaces`() {
        assertNull(AccountRules.spaceRejection(Field.FIRST_NAME, "Dela Cruz"))
        assertNull(AccountRules.spaceRejection(Field.LAST_NAME, "Dela "))
        assertEquals("First name cannot start with a space.", AccountRules.spaceRejection(Field.FIRST_NAME, " Juan"))
        assertEquals("Last name cannot have double spaces or tabs.", AccountRules.spaceRejection(Field.LAST_NAME, "Dela  Cruz"))
        assertEquals("Last name cannot have double spaces or tabs.", AccountRules.spaceRejection(Field.LAST_NAME, "Dela\tCruz"))
    }

    @Test
    fun `email, password and middle initial take no spaces at all`() {
        assertEquals("Email address cannot contain spaces.", AccountRules.spaceRejection(Field.EMAIL, "juan @gmail.com"))
        assertEquals("Password cannot contain spaces.", AccountRules.spaceRejection(Field.PASSWORD, "Panel Scan1!"))
        assertEquals("Middle initial cannot contain spaces.", AccountRules.spaceRejection(Field.MIDDLE_INITIAL, "D C"))
    }

    @Test
    fun `typing drops characters a name can never hold and caps the length`() {
        assertEquals("Jun", AccountRules.sanitize(Field.FIRST_NAME, "Ju4n"))
        assertEquals("Ma. Cristina", AccountRules.sanitize(Field.FIRST_NAME, "Ma. Cristina#"))
        assertEquals("O'Neil-Peña", AccountRules.sanitize(Field.LAST_NAME, "O'Neil-Peña"))
        assertEquals(35, AccountRules.sanitize(Field.FIRST_NAME, "a".repeat(50)).length)
        assertEquals("M.", AccountRules.sanitize(Field.MIDDLE_INITIAL, "M.1"))
        assertEquals(16, AccountRules.sanitize(Field.PASSWORD, "A".repeat(20)).length)
    }

    @Test
    fun `name length and character rules`() {
        assertEquals("First name is required.", AccountRules.nameError(Field.FIRST_NAME, "  "))
        assertEquals("First name must be at least 2 characters.", AccountRules.nameError(Field.FIRST_NAME, "J"))
        assertEquals("Last name must not exceed 35 characters.", AccountRules.nameError(Field.LAST_NAME, "a".repeat(36)))
        assertEquals(
            "Last name can only contain letters, spaces, hyphens, apostrophes and periods (no numbers).",
            AccountRules.nameError(Field.LAST_NAME, "-Cruz")
        )
        assertNull(AccountRules.nameError(Field.FIRST_NAME, "Ma. Cristina"))
        assertNull(AccountRules.nameError(Field.LAST_NAME, "Dela Cruz"))
    }

    @Test
    fun `middle initial is optional, 1 to 3 letters, stored as bare capitals`() {
        assertNull(AccountRules.middleInitialError(""))
        assertNull(AccountRules.middleInitialError("M"))
        assertNull(AccountRules.middleInitialError("M."))
        assertNull(AccountRules.middleInitialError("D.C."))
        assertEquals(AccountRules.MIDDLE_INITIAL_MESSAGE, AccountRules.middleInitialError("ABCD"))
        assertEquals(AccountRules.MIDDLE_INITIAL_MESSAGE, AccountRules.middleInitialError(".."))
        assertEquals("M", AccountRules.normalizeMiddleInitial("m."))
        assertEquals("DC", AccountRules.normalizeMiddleInitial("D.C."))
    }

    @Test
    fun `the API's temp-mail and no-mailbox answers belong under the Email field`() {
        assertTrue(AccountRules.isEmailScreeningMessage("Temporary or disposable email addresses are not supported. Please use a permanent email address."))
        assertTrue(AccountRules.isEmailScreeningMessage("We couldn't find a mailbox at this email address. Please check it and try again."))
        assertTrue(!AccountRules.isEmailScreeningMessage("An account with this email already exists."))
    }

    @Test
    fun `password checks match the website's checklist`() {
        val checks = AccountRules.passwordChecks("PanelScan2026!")
        assertTrue(checks.allMet)
        assertTrue(!AccountRules.passwordChecks("PanelScan2026!abcd").length)
        assertTrue(!AccountRules.passwordChecks("Panel Scan26!").noSpaces)
        assertEquals("Passwords do not match.", AccountRules.confirmPasswordError("PanelScan2026!", "PanelScan2026"))
        assertEquals("Confirm your password.", AccountRules.confirmPasswordError("PanelScan2026!", ""))
    }
}
