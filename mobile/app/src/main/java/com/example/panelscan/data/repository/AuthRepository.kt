package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.core.validation.AccountRules
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable

sealed interface AuthResult {
    data class Success(val user: CustomerUser) : AuthResult
    data class Error(val message: String, val fieldErrors: Map<String, String> = emptyMap()) : AuthResult
}

/** Outcome of a call that returns nothing but can fail with the backend's message. */
sealed interface ActionResult {
    data object Success : ActionResult
    data class Error(val message: String, val fieldErrors: Map<String, String> = emptyMap()) : ActionResult
}

/**
 * Customer sign-in, registration and account security against the PanelScan
 * backend (/api/auth). Same accounts and rules as the website: anyone can log
 * in here or on the web with the same email and password.
 */
class AuthRepository(
    private val sessionManager: SessionManager,
    private val api: ApiClient
) {
    val sessionState: StateFlow<CustomerSessionState> = sessionManager.sessionState

    val currentUser: CustomerUser? get() = sessionManager.getCurrentUser()

    val isAuthenticated: Boolean get() = sessionManager.isLoggedIn()

    suspend fun login(email: String, password: String): AuthResult = authCall {
        val result: LoginResponse = api.post("/auth/login", LoginRequest(email.trim().lowercase(), password))
        sessionManager.saveTokens(result.token, result.refreshToken)
        result.user.toCustomerUser().also(sessionManager::setCustomerSession)
    }

    /**
     * Signs in (or, for a new email, creates a customer account) with a Google
     * ID token. [acceptedTerms] is sent only from the sign-up screen, where the
     * customer ticked the Terms box; a new account from the login screen is
     * created without it, as on the website.
     */
    suspend fun loginWithGoogle(idToken: String, acceptedTerms: Boolean? = null): AuthResult = authCall {
        val result: LoginResponse = api.post("/auth/google", GoogleLoginRequest(idToken, acceptedTerms))
        sessionManager.saveTokens(result.token, result.refreshToken)
        result.user.toCustomerUser().also(sessionManager::setCustomerSession)
    }

    /**
     * Creates the account and signs the customer in, as on the website. The
     * backend emails a 6-digit code; the address is verified later from the
     * Profile tab ([verifyEmail]).
     */
    suspend fun register(
        firstName: String,
        middleInitial: String = "",
        lastName: String,
        email: String,
        password: String,
        phone: String,
        birthdate: String
    ): AuthResult = authCall {
        val cleanEmail = email.trim().lowercase()
        api.post<RegisterRequest, RegisterResponse>(
            "/auth/register",
            RegisterRequest(
                firstName = firstName.trim(),
                middleInitial = middleInitial.trim().takeIf { it.isNotEmpty() }?.let { AccountRules.normalizeMiddleInitial(it) },
                lastName = lastName.trim(),
                email = cleanEmail,
                password = password,
                phone = normalizePhilippinePhone(phone),
                birthdate = birthdate.trim()
            )
        )
        // Registration hands back no refresh token; a login does, so the
        // session survives past the access token's lifetime.
        val session: LoginResponse = api.post("/auth/login", LoginRequest(cleanEmail, password))
        sessionManager.saveTokens(session.token, session.refreshToken)
        session.user.toCustomerUser().also(sessionManager::setCustomerSession)
    }

    /** Reloads the signed-in customer, e.g. to pick up an email verified on the website. */
    suspend fun refreshCurrentUser(): AuthResult = authCall {
        val result: UserResponse = api.get("/auth/me", authenticated = true)
        result.user.toCustomerUser().also(sessionManager::updateUserProfile)
    }

    suspend fun verifyEmail(code: String): AuthResult = authCall {
        val result: UserResponse = api.post("/auth/verify-email", VerifyEmailRequest(code.trim()), authenticated = true)
        result.user.toCustomerUser().also(sessionManager::setCustomerSession)
    }

    suspend fun resendVerificationEmail(): ActionResult = actionCall {
        api.postUnit("/auth/send-verification-email", EmptyBody(), authenticated = true)
    }

    /** Signs out this device; the session ends locally even when offline. */
    suspend fun logout() {
        val refreshToken = sessionManager.refreshToken
        if (refreshToken != null) {
            runCatching { api.postUnit("/auth/logout", LogoutRequest(refreshToken), authenticated = true) }
        }
        sessionManager.clearSession()
    }

    /** Emails a reset code. The backend answers the same whether or not the email has an account. */
    suspend fun requestPasswordReset(email: String): ActionResult = actionCall {
        api.postUnit("/auth/forgot-password", EmailRequest(email.trim().lowercase()))
    }

    suspend fun verifyResetCode(email: String, code: String): ActionResult = actionCall {
        api.postUnit("/auth/verify-reset-code", ResetCodeRequest(email.trim().lowercase(), code.trim()))
    }

    suspend fun resetPassword(email: String, code: String, newPassword: String): ActionResult = actionCall {
        api.postUnit(
            "/auth/reset-password",
            ResetPasswordRequest(email.trim().lowercase(), code.trim(), newPassword, newPassword)
        )
    }

    /** Signs out every other device; this one stays signed in. */
    suspend fun changePassword(oldPassword: String, newPassword: String): ActionResult = actionCall {
        api.postUnit(
            "/auth/change-password",
            ChangePasswordRequest(oldPassword, newPassword, newPassword, sessionManager.refreshToken),
            authenticated = true
        )
    }

    /** Saves name, phone and birthdate. The profile photo stays on this device for now. */
    suspend fun updateProfile(
        firstName: String,
        lastName: String,
        phone: String?,
        birthdate: String?,
        profilePictureUri: String?
    ): AuthResult = authCall {
        val result: UserResponse = api.patch(
            "/auth/me",
            UpdateProfileRequest(
                firstName = firstName.trim(),
                lastName = lastName.trim(),
                phone = phone?.takeIf { it.isNotBlank() }?.let { normalizePhilippinePhone(it) },
                birthdate = birthdate?.trim()?.ifBlank { null }
            ),
            authenticated = true
        )
        result.user.toCustomerUser(profilePictureUri).also(sessionManager::updateUserProfile)
    }

    private suspend fun authCall(block: suspend () -> CustomerUser): AuthResult = try {
        AuthResult.Success(block())
    } catch (error: ApiException) {
        AuthResult.Error(error.message.orEmpty(), error.fieldErrors)
    }

    private suspend fun actionCall(block: suspend () -> Unit): ActionResult = try {
        block()
        ActionResult.Success
    } catch (error: ApiException) {
        ActionResult.Error(error.message.orEmpty(), error.fieldErrors)
    }

    private fun ApiUser.toCustomerUser(profilePictureUri: String? = currentUser?.profilePictureUri) = CustomerUser(
        id = id,
        firstName = firstName,
        lastName = lastName,
        email = email,
        phone = phone,
        birthdate = birthdate,
        age = birthdate?.let { calculateAge(it) },
        role = role,
        profilePictureUri = profilePictureUri,
        emailVerified = emailVerified
    )

    @Serializable
    private data class ApiUser(
        val id: String,
        val firstName: String,
        val lastName: String,
        val email: String,
        val phone: String? = null,
        val birthdate: String? = null,
        val role: String = "CUSTOMER",
        val emailVerified: Boolean = false
    )

    @Serializable
    private data class LoginRequest(val email: String, val password: String, val portal: String = "customer")

    @Serializable
    private data class LoginResponse(val user: ApiUser, val token: String, val refreshToken: String)

    @Serializable
    private data class GoogleLoginRequest(val credential: String, val acceptedTerms: Boolean?)

    @Serializable
    private data class RegisterRequest(
        val firstName: String,
        val middleInitial: String?,
        val lastName: String,
        val email: String,
        val password: String,
        val phone: String,
        val birthdate: String,
        val acceptedTerms: Boolean = true
    )

    @Serializable
    private data class RegisterResponse(val user: ApiUser, val token: String)

    @Serializable
    private data class UserResponse(val user: ApiUser)

    @Serializable
    private data class VerifyEmailRequest(val code: String)

    @Serializable
    private class EmptyBody

    @Serializable
    private data class LogoutRequest(val refreshToken: String)

    @Serializable
    private data class EmailRequest(val email: String)

    @Serializable
    private data class ResetCodeRequest(val email: String, val code: String)

    @Serializable
    private data class ResetPasswordRequest(
        val email: String,
        val code: String,
        val newPassword: String,
        val confirmPassword: String
    )

    @Serializable
    private data class ChangePasswordRequest(
        val currentPassword: String,
        val newPassword: String,
        val confirmPassword: String,
        val refreshToken: String?
    )

    @Serializable
    private data class UpdateProfileRequest(
        val firstName: String,
        val lastName: String,
        // Null fields are left out of the request, which keeps the saved value.
        val phone: String?,
        val birthdate: String?
    )

    companion object {
        private val EMAIL_REGEX = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\$".toRegex()
        private val BIRTHDATE_REGEX = "^(\\d{4})-(\\d{2})-(\\d{2})\$".toRegex()

        fun isValidPhilippineLocalPhone(phone: String): Boolean {
            val digitsOnly = phone.filter { it.isDigit() }
            return digitsOnly.length == 10 && digitsOnly.startsWith("9")
        }

        fun normalizePhilippinePhone(phone: String): String {
            val digitsOnly = phone.filter { it.isDigit() }
            val tenDigits = when {
                digitsOnly.startsWith("63") && digitsOnly.length == 12 -> digitsOnly.drop(2)
                digitsOnly.startsWith("0") && digitsOnly.length == 11 -> digitsOnly.drop(1)
                digitsOnly.length == 10 -> digitsOnly
                else -> digitsOnly.takeLast(10)
            }
            return "+63$tenDigits"
        }

        fun isValidEmail(email: String): Boolean {
            val trimmed = email.trim()
            if (trimmed.isEmpty()) return false
            val androidMatch = runCatching {
                android.util.Patterns.EMAIL_ADDRESS?.matcher(trimmed)?.matches()
            }.getOrNull()
            return androidMatch ?: trimmed.matches(EMAIL_REGEX)
        }

        /** The website's and API's password rule (8-16 characters, no spaces, not a common password). */
        fun validatePassword(password: String): String? = AccountRules.passwordError(password)

        fun calculateAge(birthdateString: String, today: java.util.Calendar = java.util.Calendar.getInstance()): Int? {
            val match = BIRTHDATE_REGEX.matchEntire(birthdateString.trim()) ?: return null
            val year = match.groupValues[1].toIntOrNull() ?: return null
            val month = match.groupValues[2].toIntOrNull() ?: return null
            val day = match.groupValues[3].toIntOrNull() ?: return null

            if (year < 1900 || month !in 1..12) return null
            val calendar = java.util.GregorianCalendar(year, month - 1, 1)
            if (day !in 1..calendar.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)) return null

            val todayYear = today.get(java.util.Calendar.YEAR)
            val todayMonth = today.get(java.util.Calendar.MONTH) + 1
            val todayDay = today.get(java.util.Calendar.DAY_OF_MONTH)

            var calculatedAge = todayYear - year
            val birthdayPassed = (todayMonth > month) || (todayMonth == month && todayDay >= day)
            if (!birthdayPassed) {
                calculatedAge -= 1
            }
            return if (calculatedAge >= 0) calculatedAge else null
        }

        fun validateBirthdate(birthdateString: String, today: java.util.Calendar = java.util.Calendar.getInstance()): String? {
            val trimmed = birthdateString.trim()
            if (trimmed.isBlank()) return "Birthdate is required."
            val match = BIRTHDATE_REGEX.matchEntire(trimmed) ?: return "Please enter a valid birthdate (YYYY-MM-DD)."
            val year = match.groupValues[1].toIntOrNull() ?: return "Invalid year in birthdate."
            val month = match.groupValues[2].toIntOrNull() ?: return "Invalid month in birthdate."
            val day = match.groupValues[3].toIntOrNull() ?: return "Invalid day in birthdate."

            if (year < 1900) return "Please enter a valid birth year."
            if (month !in 1..12) return "Month must be between 1 and 12."

            val cal = java.util.GregorianCalendar(year, month - 1, 1)
            val maxDay = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)
            if (day !in 1..maxDay) return "Day is invalid for the selected month."

            val age = calculateAge(trimmed, today) ?: return "Birthdate cannot be in the future."
            if (age < 0) return "Birthdate cannot be in the future."
            if (age > 125) return "Please enter a valid birthdate."

            return null
        }
    }
}
