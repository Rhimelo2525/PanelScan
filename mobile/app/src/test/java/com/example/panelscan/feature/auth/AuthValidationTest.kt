package com.example.panelscan.feature.auth

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.data.repository.AuthRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthValidationTest {

    @Test
    fun `test email validation logic`() {
        assertTrue(AuthRepository.isValidEmail("customer@disenyo.ph"))
        assertTrue(AuthRepository.isValidEmail("juan.delacruz@gmail.com"))
        assertTrue(AuthRepository.isValidEmail("customer@outlook.com"))
        assertTrue(!AuthRepository.isValidEmail(""))
        assertTrue(!AuthRepository.isValidEmail("plainaddress"))
        assertTrue(!AuthRepository.isValidEmail("@missingusername.com"))
    }

    @Test
    fun `test philippine phone validation and normalization`() {
        // Valid 10-digit starting with 9
        assertTrue(AuthRepository.isValidPhilippineLocalPhone("9171234567"))
        assertTrue(AuthRepository.isValidPhilippineLocalPhone("9987654321"))
        assertTrue(AuthRepository.isValidPhilippineLocalPhone("912 345 6789"))

        // Invalid: does not start with 9, wrong length, letters
        assertTrue(!AuthRepository.isValidPhilippineLocalPhone("8171234567"))
        assertTrue(!AuthRepository.isValidPhilippineLocalPhone("917123456"))
        assertTrue(!AuthRepository.isValidPhilippineLocalPhone("91712345678"))
        assertTrue(!AuthRepository.isValidPhilippineLocalPhone("abcdefghij"))

        // Normalization adds +63
        assertEquals("+639171234567", AuthRepository.normalizePhilippinePhone("917 123 4567"))
        assertEquals("+639171234567", AuthRepository.normalizePhilippinePhone("09171234567"))
    }

    @Test
    fun `test password complexity rules`() {
        // Less than 8 chars
        assertEquals("Password must be at least 8 characters.", AuthRepository.validatePassword("Pass1!"))

        // More than 16 chars (the website's and the API's limit)
        assertEquals("Password cannot exceed 16 characters.", AuthRepository.validatePassword("PanelScan2026!abcd"))

        // Spaces
        assertEquals("Password must not contain spaces.", AuthRepository.validatePassword("Panel Scan26!"))

        // Common passwords are refused even when every character rule passes
        assertEquals(
            "This password is too common or easily guessed. Please choose a stronger password.",
            AuthRepository.validatePassword("Password123!")
        )

        // Missing uppercase
        assertEquals("Password must contain at least one uppercase letter.", AuthRepository.validatePassword("password123!"))

        // Missing lowercase
        assertEquals("Password must contain at least one lowercase letter.", AuthRepository.validatePassword("PASSWORD123!"))

        // Missing digit
        assertEquals("Password must contain at least one number.", AuthRepository.validatePassword("PasswordOnly!"))

        // Missing special character
        assertEquals("Password must contain at least one special character.", AuthRepository.validatePassword("Password123"))

        // Valid password meeting all rules
        assertNull(AuthRepository.validatePassword("Disenyo2026!"))

        // "panelscan" is a blocked root word, as on the website
        assertEquals(
            "This password is too common or easily guessed. Please choose a stronger password.",
            AuthRepository.validatePassword("PanelScan2026!")
        )
    }

    @Test
    fun `test birthdate and age calculation`() {
        val fixedToday = java.util.Calendar.getInstance().apply {
            set(2026, java.util.Calendar.SEPTEMBER, 18)
        }

        // Birthday already passed this year (Jan 15, 2000 -> 26 years old in 2026)
        assertEquals(26, AuthRepository.calculateAge("2000-01-15", fixedToday))

        // Birthday exactly today (Sep 18, 2000 -> 26 years old)
        assertEquals(26, AuthRepository.calculateAge("2000-09-18", fixedToday))

        // Birthday tomorrow (Sep 19, 2000 -> 25 years old)
        assertEquals(25, AuthRepository.calculateAge("2000-09-19", fixedToday))

        // Birthday in December (Dec 25, 2000 -> 25 years old)
        assertEquals(25, AuthRepository.calculateAge("2000-12-25", fixedToday))

        // Future birthdate -> returns null
        assertNull(AuthRepository.calculateAge("2027-01-01", fixedToday))

        // Invalid format -> returns null
        assertNull(AuthRepository.calculateAge("invalid-date", fixedToday))
        assertNull(AuthRepository.calculateAge("", fixedToday))
    }

    @Test
    fun `test birthdate validation logic`() {
        val fixedToday = java.util.Calendar.getInstance().apply {
            set(2026, java.util.Calendar.SEPTEMBER, 18)
        }

        // Valid birthdate
        assertNull(AuthRepository.validateBirthdate("1995-06-20", fixedToday))

        // Blank birthdate
        assertEquals("Birthdate is required.", AuthRepository.validateBirthdate("", fixedToday))

        // Invalid format
        assertEquals("Please enter a valid birthdate (YYYY-MM-DD).", AuthRepository.validateBirthdate("06/20/1995", fixedToday))

        // Future birthdate
        assertEquals("Birthdate cannot be in the future.", AuthRepository.validateBirthdate("2026-10-01", fixedToday))

        // Invalid month/day
        assertEquals("Month must be between 1 and 12.", AuthRepository.validateBirthdate("2000-13-01", fixedToday))
        assertEquals("Day is invalid for the selected month.", AuthRepository.validateBirthdate("2000-02-30", fixedToday))
    }

    @Test
    fun `test terms and conditions agreement blocks registration`() {
        val sessionManager = SessionManager()
        val viewModel = AuthViewModel(
            authRepository = AuthRepository(sessionManager, ApiClient("http://localhost/api/", sessionManager))
        )
        viewModel.onFirstNameChange("Juan")
        viewModel.onLastNameChange("Dela Cruz")
        viewModel.onEmailChange("juan.delacruz@gmail.com")
        viewModel.onPhoneChange("9171234567")
        viewModel.onBirthdateChange("1995-05-15")
        viewModel.onPasswordChange("PanelScan2026!")
        viewModel.onConfirmPasswordChange("PanelScan2026!")
        viewModel.onAgreedToTermsChange(false)

        var navigateCalled = false
        viewModel.startRegistration { navigateCalled = true }

        // Must not navigate and error must indicate terms required
        assertTrue(!navigateCalled)
        assertEquals("You must agree to the Privacy Policy and Terms & Conditions to register.", viewModel.uiState.value.errorMessage)
    }
}
