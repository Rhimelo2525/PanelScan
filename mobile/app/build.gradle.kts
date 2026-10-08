import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.devtools.ksp)
}

/*
 * Build-time settings, read from local.properties (not committed) or environment
 * variables. Only the backend's address and public identifiers belong here: delivery
 * (Lalamove) and payment (GCash through PayMongo) secrets live on the PanelScan backend.
 *
 *   panelscan.api.baseUrl=http://10.0.2.2:5000/api/                (PANELSCAN_API_BASE_URL; defaults to the live backend)
 *   panelscan.google.webClientId=...apps.googleusercontent.com     (PANELSCAN_GOOGLE_WEB_CLIENT_ID; the backend's GOOGLE_CLIENT_ID)
 */
val integrationProperties = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

fun integration(key: String, env: String, default: String = ""): String =
    (integrationProperties.getProperty(key) ?: System.getenv(env) ?: default)
        .replace("\\", "")
        .replace("\"", "")

fun String.quoted() = "\"$this\""

android {
    namespace = "com.example.panelscan"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.example.panelscan"
        minSdk = 24
        targetSdk = 37
        versionCode = 2
        versionName = "1.1-ar-demo"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Public OAuth client ID (not a secret): Google issues the ID token for it, which the backend verifies.
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", integration("panelscan.google.webClientId", "PANELSCAN_GOOGLE_WEB_CLIENT_ID", "510828049195-0hha5pifnqn2f72kl09ea46lrs7lnilf.apps.googleusercontent.com").quoted())
        buildConfigField("String", "API_BASE_URL", integration("panelscan.api.baseUrl", "PANELSCAN_API_BASE_URL", "https://panelscan-backend.vercel.app/api/").quoted())
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
        }
    }
    buildFeatures {
        compose = true
        // Needed for the DEBUG-only AR diagnostics overlay.
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)

    // Navigation
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Room
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // AR & 3D
    implementation(libs.google.ar.core)
    implementation(libs.sceneview.ar)

    // Images
    implementation(libs.coil.compose)

    // Map for the exact delivery pin (OpenStreetMap; no API key required)
    implementation(libs.osmdroid.android)

    // Serialization
    implementation(libs.kotlinx.serialization.json)

    // HTTP client for the PanelScan backend API (core/network)
    implementation(libs.okhttp)

    // "Continue with Google" through Android Credential Manager
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)


    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
