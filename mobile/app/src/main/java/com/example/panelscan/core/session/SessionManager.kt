package com.example.panelscan.core.session

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import com.example.panelscan.core.network.TokenStore

data class CustomerUser(
    val id: String,
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String? = null,
    val birthdate: String? = null,
    val age: Int? = null,
    val role: String = "CUSTOMER",
    val profilePictureUri: String? = null,
    /** Verified from the Profile tab with an emailed code (or by signing up with Google). */
    val emailVerified: Boolean = false
) {
    val fullName: String get() = "$firstName $lastName".trim()
}

sealed interface CustomerSessionState {
    data object LoggedOut : CustomerSessionState
    data object Loading : CustomerSessionState
    data class LoggedIn(val user: CustomerUser) : CustomerSessionState
}

/**
 * The signed-in customer and the PanelScan backend tokens for their session.
 * Everything is kept in app-private storage, so the customer stays signed in
 * across restarts until they log out or the backend ends the session.
 */
class SessionManager(context: Context? = null) : TokenStore {

    private val prefs: SharedPreferences? = context?.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE
    )

    private val _sessionState = MutableStateFlow<CustomerSessionState>(CustomerSessionState.LoggedOut)
    val sessionState: StateFlow<CustomerSessionState> = _sessionState.asStateFlow()

    // Declared before init so restoreFromStorage() isn't overwritten by these initializers.
    @Volatile
    override var accessToken: String? = null
        private set

    @Volatile
    override var refreshToken: String? = null
        private set

    init {
        restoreFromStorage()
    }

    private fun restoreFromStorage() {
        val p = prefs ?: return
        val userId = p.getString(KEY_USER_ID, null)
        val email = p.getString(KEY_USER_EMAIL, null)
        accessToken = p.getString(KEY_ACCESS_TOKEN, null)
        refreshToken = p.getString(KEY_REFRESH_TOKEN, null)

        // A session without a refresh token is a leftover from the offline demo
        // build; it cannot reach the backend, so it starts signed out.
        if (!userId.isNullOrBlank() && !email.isNullOrBlank() && !refreshToken.isNullOrBlank()) {
            val ageVal = if (p.contains(KEY_USER_AGE)) p.getInt(KEY_USER_AGE, 0) else null
            val user = CustomerUser(
                id = userId,
                firstName = p.getString(KEY_USER_FIRST_NAME, "").orEmpty(),
                lastName = p.getString(KEY_USER_LAST_NAME, "").orEmpty(),
                email = email,
                phone = p.getString(KEY_USER_PHONE, null),
                birthdate = p.getString(KEY_USER_BIRTHDATE, null),
                age = ageVal,
                role = p.getString(KEY_USER_ROLE, "CUSTOMER") ?: "CUSTOMER",
                profilePictureUri = p.getString(KEY_USER_AVATAR, null),
                emailVerified = p.getBoolean(KEY_EMAIL_VERIFIED, false)
            )
            _sessionState.value = CustomerSessionState.LoggedIn(user)
        } else {
            _sessionState.value = CustomerSessionState.LoggedOut
        }
    }

    fun setCustomerSession(user: CustomerUser) {
        prefs?.let { p ->
            val editor = p.edit()
                .putString(KEY_USER_ID, user.id)
                .putString(KEY_USER_FIRST_NAME, user.firstName)
                .putString(KEY_USER_LAST_NAME, user.lastName)
                .putString(KEY_USER_EMAIL, user.email)
                .putString(KEY_USER_PHONE, user.phone)
                .putString(KEY_USER_BIRTHDATE, user.birthdate)
                .putString(KEY_USER_ROLE, user.role)
                .putBoolean(KEY_EMAIL_VERIFIED, user.emailVerified)
            if (user.age != null) {
                editor.putInt(KEY_USER_AGE, user.age)
            } else {
                editor.remove(KEY_USER_AGE)
            }
            if (user.profilePictureUri != null) {
                editor.putString(KEY_USER_AVATAR, user.profilePictureUri)
            } else {
                editor.remove(KEY_USER_AVATAR)
            }
            editor.apply()
        }

        _sessionState.value = CustomerSessionState.LoggedIn(user)
    }

    fun updateUserProfile(user: CustomerUser) {
        setCustomerSession(user)
    }

    fun clearSession() {
        accessToken = null
        refreshToken = null
        prefs?.edit()?.clear()?.apply()
        _sessionState.value = CustomerSessionState.LoggedOut
    }

    override fun saveTokens(accessToken: String, refreshToken: String?) {
        this.accessToken = accessToken
        if (refreshToken != null) this.refreshToken = refreshToken
        prefs?.edit()
            ?.putString(KEY_ACCESS_TOKEN, accessToken)
            ?.apply { if (refreshToken != null) putString(KEY_REFRESH_TOKEN, refreshToken) }
            ?.apply()
    }

    /** The backend ended the session (refresh token revoked or expired). */
    override fun onSessionExpired() {
        clearSession()
    }

    fun getCurrentUser(): CustomerUser? {
        val current = _sessionState.value
        return if (current is CustomerSessionState.LoggedIn) current.user else null
    }

    fun isLoggedIn(): Boolean = _sessionState.value is CustomerSessionState.LoggedIn

    companion object {
        private const val PREFS_NAME = "panelscan_customer_session"
        private const val KEY_USER_ID = "ps_customer_id"
        private const val KEY_USER_FIRST_NAME = "ps_customer_fn"
        private const val KEY_USER_LAST_NAME = "ps_customer_ln"
        private const val KEY_USER_EMAIL = "ps_customer_email"
        private const val KEY_USER_PHONE = "ps_customer_phone"
        private const val KEY_USER_BIRTHDATE = "ps_customer_bday"
        private const val KEY_USER_AGE = "ps_customer_age"
        private const val KEY_USER_ROLE = "ps_customer_role"
        private const val KEY_USER_AVATAR = "ps_customer_avatar"
        private const val KEY_EMAIL_VERIFIED = "ps_customer_email_verified"
        private const val KEY_ACCESS_TOKEN = "ps_access_token"
        private const val KEY_REFRESH_TOKEN = "ps_refresh_token"
    }
}
