package com.example.panelscan

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.panelscan.core.design.PanelScanTheme
import com.example.panelscan.core.navigation.PanelScanNavHost

/**
 * Launch path is deliberately shallow: activity → theme → navigation → splash → home.
 * Nothing here touches ARCore or SceneView; those are created only by their own routes.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PanelScanTheme {
                PanelScanNavHost()
            }
        }
    }
}
