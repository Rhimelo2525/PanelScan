package com.example.panelscan.core.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.example.panelscan.core.config.IntegrationConfig
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

sealed interface GoogleSignInResult {
    /** A Google ID token for the backend to verify (POST /auth/google). */
    data class Token(val idToken: String) : GoogleSignInResult
    /** The customer closed the Google sheet; nothing to show. */
    data object Cancelled : GoogleSignInResult
    data class Error(val message: String) : GoogleSignInResult
}

/**
 * "Continue with Google" through Android Credential Manager: shows Google's
 * account picker and returns an ID token signed for the backend's OAuth client.
 * [activityContext] must be an Activity, as the picker is shown over it.
 */
object GoogleSignIn {

    suspend fun requestIdToken(activityContext: Context): GoogleSignInResult {
        val clientId = IntegrationConfig.googleWebClientId
        if (clientId.isBlank()) return GoogleSignInResult.Error("Google sign-in is not set up in this build.")

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetSignInWithGoogleOption.Builder(clientId).build())
            .build()

        return try {
            val credential = CredentialManager.create(activityContext).getCredential(activityContext, request).credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleSignInResult.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                GoogleSignInResult.Error("Google didn't return an account. Please try again.")
            }
        } catch (error: GetCredentialCancellationException) {
            GoogleSignInResult.Cancelled
        } catch (error: NoCredentialException) {
            GoogleSignInResult.Error("No Google account is available. Add a Google account to this phone in Settings, then try again.")
        } catch (error: GetCredentialException) {
            GoogleSignInResult.Error("Google sign-in didn't work: ${error.message ?: error.type}")
        }
    }
}
