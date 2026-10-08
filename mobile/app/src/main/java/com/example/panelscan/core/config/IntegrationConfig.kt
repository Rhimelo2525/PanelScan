package com.example.panelscan.core.config

import com.example.panelscan.BuildConfig

/**
 * Settings injected at build time (see app/build.gradle.kts). Delivery (Lalamove)
 * and payment (GCash through PayMongo) run on the PanelScan backend; the app only
 * needs to know where the backend is.
 */
object IntegrationConfig {

    /** The PanelScan backend API, e.g. https://panelscan-backend.vercel.app/api/ */
    val apiBaseUrl: String get() = BuildConfig.API_BASE_URL

    /** The backend's Google OAuth (web) client ID, which "Continue with Google" asks Google to sign for. */
    val googleWebClientId: String get() = BuildConfig.GOOGLE_WEB_CLIENT_ID
}
