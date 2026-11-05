package com.example.panelscan

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.example.panelscan.core.design.Appearance
import com.example.panelscan.core.design.AppearancePreference
import com.example.panelscan.core.design.PanelScanTheme
import com.example.panelscan.core.navigation.PanelScanNavHost

/**
 * Launch path is deliberately shallow: activity → theme → navigation → splash → home.
 * Nothing here touches ARCore or SceneView; those are created only by their own routes.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppearancePreference.init(this)
        enableEdgeToEdge()
        setContent {
            // Light or dark as picked in Account → Appearance; the phone's setting until then.
            val appearance by AppearancePreference.appearance.collectAsState()
            PanelScanTheme(darkTheme = appearance?.let { it == Appearance.DARK } ?: isSystemInDarkTheme()) {
                PanelScanNavHost()
            }
        }
    }
}
