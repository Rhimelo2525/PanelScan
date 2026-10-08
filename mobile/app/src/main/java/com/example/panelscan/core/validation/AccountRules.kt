package com.example.panelscan.core.validation

/**
 * The website's Create Account rules (web/src/auth/registration-validation.ts
 * and password-policy.ts), which the API enforces too (backend utils/nameSchema.ts,
 * utils/passwordPolicy.ts). Kept identical so the app refuses exactly what the
 * website and the API refuse, with the same messages.
 */
object AccountRules {

    const val NAME_MAX_LENGTH = 35
    const val NAME_MIN_LENGTH = 2
    const val MIDDLE_INITIAL_MAX_LENGTH = 6
    const val EMAIL_MAX_LENGTH = 254
    const val PASSWORD_MIN_LENGTH = 8
    const val PASSWORD_MAX_LENGTH = 16

    const val MIDDLE_INITIAL_MESSAGE = "Enter a middle initial using letters only (e.g. M or M.)."

    /**
     * The API's email screening answers (backend utils/disposableEmail.ts and
     * utils/emailScreening.ts): temp mail and addresses with no mailbox. Like
     * the website, they are shown under the Email field.
     */
    private val EMAIL_SCREENING_MESSAGES = setOf(
        "Temporary or disposable email addresses are not supported. Please use a permanent email address.",
        "We couldn't find a mailbox at this email address. Please check it and try again."
    )

    fun isEmailScreeningMessage(message: String): Boolean = message in EMAIL_SCREENING_MESSAGES

    /** Letters (ñ and accents included) plus spaces, hyphens, apostrophes and periods; starts with a letter. */
    private val PERSON_NAME = Regex("^\\p{L}[\\p{L}\\p{M} .'-]*$")
    private val NAME_DISALLOWED = Regex("[^\\p{L}\\p{M} .'-]")
    private val MIDDLE_INITIAL_DISALLOWED = Regex("[^\\p{L}\\p{M} .]")

    /** "M", "M.", "D. C.": 1-3 letters, periods/spaces only as separators. */
    private val MIDDLE_INITIAL = Regex("^(\\p{L}\\.?\\s?){1,3}$")
    private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    private val UPPERCASE = Regex("[A-Z]")
    private val LOWERCASE = Regex("[a-z]")
    private val NUMBER = Regex("[0-9]")
    private val SPECIAL = Regex("[!@#$%^&*()_+\\-=\\[\\]{}|;:,.<>?/~`\\\\]")

    private val COMMON_WEAK_PASSWORDS = setOf(
        "password1!", "password123!", "qwerty123!", "admin123!", "welcome1!", "welcome123!",
        "pass1234!", "letmein1!", "iloveyou1!", "changeme1!", "testing123!", "default123!",
        "monkey123!", "dragon123!", "master123!", "sunshine1!", "princess1!", "football1!",
        "baseball1!", "shadow123!", "panelscan1!", "panelscan123!"
    )
    private val COMMON_ROOTS = setOf(
        "password", "passcode", "qwerty", "admin", "administrator", "welcome",
        "letmein", "changeme", "default", "panelscan", "testing"
    )

    enum class Field(val label: String) {
        FIRST_NAME("First name"),
        MIDDLE_INITIAL("Middle initial"),
        LAST_NAME("Last name"),
        EMAIL("Email address"),
        PASSWORD("Password"),
        CONFIRM_PASSWORD("Password")
    }

    /**
     * The space rule, applied while typing or pasting: names keep single spaces
     * between words ("Dela Cruz") but can't start with one or double them;
     * every other field takes no spaces at all. Returns why [value] can't go
     * into the field, or null when it can.
     */
    fun spaceRejection(field: Field, value: String): String? {
        if (field != Field.FIRST_NAME && field != Field.LAST_NAME) {
            return if (value.any { it.isWhitespace() }) "${field.label} cannot contain spaces." else null
        }
        if (value.firstOrNull()?.isWhitespace() == true) return "${field.label} cannot start with a space."
        if (value.any { it.isWhitespace() && it != ' ' } || value.contains("  ")) return "${field.label} cannot have double spaces or tabs."
        return null
    }

    /** Drops characters a name field can never hold (numbers, symbols), then caps the length. */
    fun sanitize(field: Field, value: String): String = when (field) {
        Field.FIRST_NAME, Field.LAST_NAME -> value.replace(NAME_DISALLOWED, "").take(NAME_MAX_LENGTH)
        Field.MIDDLE_INITIAL -> value.replace(MIDDLE_INITIAL_DISALLOWED, "").take(MIDDLE_INITIAL_MAX_LENGTH)
        Field.EMAIL -> value.take(EMAIL_MAX_LENGTH)
        Field.PASSWORD, Field.CONFIRM_PASSWORD -> value.take(PASSWORD_MAX_LENGTH)
    }

    fun nameError(field: Field, value: String): String? {
        val label = field.label
        val name = value.trim()
        return when {
            name.isEmpty() -> "$label is required."
            name.length < NAME_MIN_LENGTH -> "$label must be at least $NAME_MIN_LENGTH characters."
            name.length > NAME_MAX_LENGTH -> "$label must not exceed $NAME_MAX_LENGTH characters."
            !PERSON_NAME.matches(name) -> "$label can only contain letters, spaces, hyphens, apostrophes and periods (no numbers)."
            else -> null
        }
    }

    /** Optional: blank is fine. */
    fun middleInitialError(value: String): String? =
        if (value.isNotBlank() && !MIDDLE_INITIAL.matches(value.trim())) MIDDLE_INITIAL_MESSAGE else null

    /** "M." / "d c" -> "M" / "DC", the form the API stores. */
    fun normalizeMiddleInitial(value: String): String = value.replace(Regex("[.\\s]"), "").uppercase()

    fun emailError(value: String): String? = when {
        value.isBlank() -> "Email is required."
        !EMAIL.matches(value.trim()) -> "Enter a valid email address."
        else -> null
    }

    data class PasswordChecks(
        val length: Boolean,
        val uppercase: Boolean,
        val lowercase: Boolean,
        val number: Boolean,
        val special: Boolean,
        val noSpaces: Boolean
    ) {
        val allMet: Boolean get() = length && uppercase && lowercase && number && special && noSpaces
    }

    fun passwordChecks(password: String) = PasswordChecks(
        length = password.length in PASSWORD_MIN_LENGTH..PASSWORD_MAX_LENGTH,
        uppercase = UPPERCASE.containsMatchIn(password),
        lowercase = LOWERCASE.containsMatchIn(password),
        number = NUMBER.containsMatchIn(password),
        special = SPECIAL.containsMatchIn(password),
        noSpaces = password.isNotEmpty() && password.none { it.isWhitespace() }
    )

    fun isCommonPassword(password: String): Boolean {
        val normalized = password.lowercase().trim()
        if (normalized in COMMON_WEAK_PASSWORDS) return true
        val alphaRoot = normalized.replace(Regex("[^a-z]"), "")
        return alphaRoot.isNotEmpty() && alphaRoot in COMMON_ROOTS
    }

    fun passwordError(password: String): String? {
        val checks = passwordChecks(password)
        return when {
            password.isEmpty() -> "Password is required."
            password.length < PASSWORD_MIN_LENGTH -> "Password must be at least $PASSWORD_MIN_LENGTH characters."
            password.length > PASSWORD_MAX_LENGTH -> "Password cannot exceed $PASSWORD_MAX_LENGTH characters."
            password.any { it.isWhitespace() } -> "Password must not contain spaces."
            !checks.uppercase -> "Password must contain at least one uppercase letter."
            !checks.lowercase -> "Password must contain at least one lowercase letter."
            !checks.number -> "Password must contain at least one number."
            !checks.special -> "Password must contain at least one special character."
            isCommonPassword(password) -> "This password is too common or easily guessed. Please choose a stronger password."
            else -> null
        }
    }

    fun confirmPasswordError(password: String, confirmPassword: String): String? = when {
        confirmPassword.isEmpty() -> "Confirm your password."
        confirmPassword != password -> "Passwords do not match."
        else -> null
    }
}
