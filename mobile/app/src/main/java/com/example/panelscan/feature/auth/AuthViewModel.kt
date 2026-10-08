package com.example.panelscan.feature.auth

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.auth.GoogleSignIn
import com.example.panelscan.core.auth.GoogleSignInResult
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.validation.AccountRules
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.data.repository.AuthRepository
import com.example.panelscan.data.repository.AuthResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUiState(
    val firstName: String = "",
    val middleInitial: String = "",
    val lastName: String = "",
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val phone: String = "", // 10 local digits after +63
    val birthdate: String = "",
    val age: Int? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successUser: CustomerUser? = null,
    val firstNameError: String? = null,
    val middleInitialError: String? = null,
    val lastNameError: String? = null,
    val emailError: String? = null,
    val phoneError: String? = null,
    val passwordError: String? = null,
    val confirmPasswordError: String? = null,
    val birthdateError: String? = null,
    val agreedToTerms: Boolean = false
) {
    val fullPhone: String get() = if (phone.isNotBlank()) "+63$phone" else ""
    val formattedDisplayPhone: String get() = if (phone.length == 10) {
        "+63 ${phone.take(3)} ${phone.substring(3, 6)} ${phone.substring(6)}"
    } else {
        "+63 $phone"
    }
}

class AuthViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    val sessionState: StateFlow<CustomerSessionState> = authRepository.sessionState

    fun onFirstNameChange(value: String) = onTextFieldChange(AccountRules.Field.FIRST_NAME, value)

    fun onMiddleInitialChange(value: String) = onTextFieldChange(AccountRules.Field.MIDDLE_INITIAL, value)

    fun onLastNameChange(value: String) = onTextFieldChange(AccountRules.Field.LAST_NAME, value)

    fun onEmailChange(value: String) = onTextFieldChange(AccountRules.Field.EMAIL, value)

    fun onPasswordChange(value: String) = onTextFieldChange(AccountRules.Field.PASSWORD, value)

    fun onConfirmPasswordChange(value: String) = onTextFieldChange(AccountRules.Field.CONFIRM_PASSWORD, value)

    /**
     * Same as the website's Create Account form: a space that breaks the
     * field's space rule is refused (the field keeps its value and shows why),
     * and characters a name can never hold are dropped as they are typed.
     */
    private fun onTextFieldChange(field: AccountRules.Field, value: String) {
        val rejection = AccountRules.spaceRejection(field, value)
        if (rejection != null) {
            _uiState.update { it.withFieldError(field, rejection) }
            return
        }
        val clean = AccountRules.sanitize(field, value)
        _uiState.update {
            // The text field re-sends the kept value after a refusal; that isn't an
            // edit, so the reason just shown must stay.
            if (clean == it.valueOf(field)) return@update it
            val next = when (field) {
                AccountRules.Field.FIRST_NAME -> it.copy(firstName = clean)
                AccountRules.Field.MIDDLE_INITIAL -> it.copy(middleInitial = clean)
                AccountRules.Field.LAST_NAME -> it.copy(lastName = clean)
                AccountRules.Field.EMAIL -> it.copy(email = clean)
                AccountRules.Field.PASSWORD -> it.copy(password = clean, confirmPasswordError = null)
                AccountRules.Field.CONFIRM_PASSWORD -> it.copy(confirmPassword = clean)
            }
            next.withFieldError(field, null).copy(errorMessage = null)
        }
    }

    private fun AuthUiState.valueOf(field: AccountRules.Field) = when (field) {
        AccountRules.Field.FIRST_NAME -> firstName
        AccountRules.Field.MIDDLE_INITIAL -> middleInitial
        AccountRules.Field.LAST_NAME -> lastName
        AccountRules.Field.EMAIL -> email
        AccountRules.Field.PASSWORD -> password
        AccountRules.Field.CONFIRM_PASSWORD -> confirmPassword
    }

    private fun AuthUiState.withFieldError(field: AccountRules.Field, error: String?) = when (field) {
        AccountRules.Field.FIRST_NAME -> copy(firstNameError = error)
        AccountRules.Field.MIDDLE_INITIAL -> copy(middleInitialError = error)
        AccountRules.Field.LAST_NAME -> copy(lastNameError = error)
        AccountRules.Field.EMAIL -> copy(emailError = error)
        AccountRules.Field.PASSWORD -> copy(passwordError = error)
        AccountRules.Field.CONFIRM_PASSWORD -> copy(confirmPasswordError = error)
    }

    fun onPhoneChange(value: String) {
        // Enforce digits only, max 10 digits (the local part after +63)
        val digitsOnly = value.filter { it.isDigit() }.take(10)
        _uiState.update {
            it.copy(
                phone = digitsOnly,
                phoneError = null,
                errorMessage = null
            )
        }
    }

    fun onAgreedToTermsChange(value: Boolean) {
        _uiState.update {
            it.copy(
                agreedToTerms = value,
                errorMessage = null
            )
        }
    }

    fun onBirthdateSelected(year: Int, monthOfYear: Int, dayOfMonth: Int) {
        val formatted = String.format(java.util.Locale.US, "%04d-%02d-%02d", year, monthOfYear, dayOfMonth)
        val calculatedAge = AuthRepository.calculateAge(formatted)
        _uiState.update {
            it.copy(
                birthdate = formatted,
                age = calculatedAge,
                birthdateError = null,
                errorMessage = null
            )
        }
    }

    fun onBirthdateChange(value: String) {
        val calculatedAge = AuthRepository.calculateAge(value)
        _uiState.update {
            it.copy(
                birthdate = value,
                age = calculatedAge,
                birthdateError = null,
                errorMessage = null
            )
        }
    }

    fun clearError() {
        _uiState.update {
            it.copy(
                errorMessage = null,
                firstNameError = null,
                middleInitialError = null,
                lastNameError = null,
                emailError = null,
                phoneError = null,
                passwordError = null,
                confirmPasswordError = null,
                birthdateError = null
            )
        }
    }

    fun login(onSuccess: () -> Unit) {
        val email = _uiState.value.email.trim()
        val password = _uiState.value.password

        if (email.isBlank()) {
            _uiState.update { it.copy(emailError = "Email is required.") }
            return
        }
        if (!AuthRepository.isValidEmail(email)) {
            _uiState.update { it.copy(emailError = "Please enter a valid email address.") }
            return
        }
        if (password.isBlank()) {
            _uiState.update { it.copy(passwordError = "Password is required.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        viewModelScope.launch {
            when (val result = authRepository.login(email, password)) {
                is AuthResult.Success -> {
                    _uiState.update { it.copy(isLoading = false, successUser = result.user) }
                    onSuccess()
                }
                is AuthResult.Error -> {
                    _uiState.update { it.copy(isLoading = false, errorMessage = result.message) }
                }
            }
        }
    }

    /**
     * "Continue with Google": Google's account picker, then the backend signs the
     * customer in, creating the account the first time. From the sign-up screen
     * the Terms box must be ticked first, and that agreement is recorded.
     */
    fun loginWithGoogle(activityContext: Context, fromSignUp: Boolean, onSuccess: () -> Unit) {
        if (fromSignUp && !_uiState.value.agreedToTerms) {
            _uiState.update { it.copy(errorMessage = "You must agree to the Privacy Policy and Terms & Conditions to register.") }
            return
        }
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        viewModelScope.launch {
            when (val google = GoogleSignIn.requestIdToken(activityContext)) {
                is GoogleSignInResult.Token -> {
                    when (val result = authRepository.loginWithGoogle(google.idToken, acceptedTerms = if (fromSignUp) true else null)) {
                        is AuthResult.Success -> {
                            _uiState.update { it.copy(isLoading = false, successUser = result.user) }
                            onSuccess()
                        }
                        is AuthResult.Error -> _uiState.update { it.copy(isLoading = false, errorMessage = result.message) }
                    }
                }
                GoogleSignInResult.Cancelled -> _uiState.update { it.copy(isLoading = false) }
                is GoogleSignInResult.Error -> _uiState.update { it.copy(isLoading = false, errorMessage = google.message) }
            }
        }
    }

    /**
     * Validates the details with the website's rules, then creates the account
     * and signs the customer in, as on the website. The backend emails a code
     * to verify the address; that is done later from the Profile tab.
     */
    fun startRegistration(onRegistered: () -> Unit = {}) {
        val state = _uiState.value
        val first = state.firstName.trim()
        val middle = state.middleInitial.trim()
        val last = state.lastName.trim()
        val email = state.email.trim()
        val pass = state.password
        val confirm = state.confirmPassword
        val phone = state.phone.trim()
        val birthdate = state.birthdate.trim()

        // The website's rules and messages (core/validation/AccountRules.kt).
        val errors = state.copy(
            firstName = first,
            middleInitial = middle,
            lastName = last,
            firstNameError = AccountRules.nameError(AccountRules.Field.FIRST_NAME, first),
            middleInitialError = AccountRules.middleInitialError(middle),
            lastNameError = AccountRules.nameError(AccountRules.Field.LAST_NAME, last),
            emailError = AccountRules.emailError(email),
            phoneError = when {
                phone.isBlank() -> "Contact number is required."
                !AuthRepository.isValidPhilippineLocalPhone(phone) -> "Please enter a valid Philippine mobile number with 10 digits."
                else -> null
            },
            birthdateError = AuthRepository.validateBirthdate(birthdate),
            passwordError = AccountRules.passwordError(pass),
            confirmPasswordError = AccountRules.confirmPasswordError(pass, confirm),
            errorMessage = if (!state.agreedToTerms) "You must agree to the Privacy Policy and Terms & Conditions to register." else null
        )
        _uiState.value = errors
        val hasError = listOf(
            errors.firstNameError, errors.middleInitialError, errors.lastNameError, errors.emailError,
            errors.phoneError, errors.birthdateError, errors.passwordError, errors.confirmPasswordError,
            errors.errorMessage
        ).any { it != null }

        if (hasError) return

        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        viewModelScope.launch {
            // The backend creates the account and emails a 6-digit code to verify the address later.
            when (val result = authRepository.register(
                firstName = first,
                middleInitial = middle,
                lastName = last,
                email = email,
                password = pass,
                phone = phone,
                birthdate = birthdate
            )) {
                is AuthResult.Success -> {
                    _uiState.update { it.copy(isLoading = false, successUser = result.user, errorMessage = null) }
                    onRegistered()
                }
                is AuthResult.Error -> {
                    // Temp mail or no mailbox: shown under the Email field, as on the website.
                    val emailProblem = result.message.takeIf(AccountRules::isEmailScreeningMessage)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = if (emailProblem != null) null else result.message,
                            firstNameError = result.fieldErrors["firstName"],
                            middleInitialError = result.fieldErrors["middleInitial"],
                            lastNameError = result.fieldErrors["lastName"],
                            emailError = emailProblem ?: result.fieldErrors["email"],
                            phoneError = result.fieldErrors["phone"],
                            passwordError = result.fieldErrors["password"],
                            birthdateError = result.fieldErrors["birthdate"]
                        )
                    }
                }
            }
        }
    }

    fun logout(onComplete: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            _uiState.value = AuthUiState()
            onComplete()
        }
    }
}
