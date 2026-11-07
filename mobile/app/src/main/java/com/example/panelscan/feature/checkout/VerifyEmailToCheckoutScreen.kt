package com.example.panelscan.feature.checkout

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Email
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ScreenScaffold

/** Shown instead of checkout until the account's email is verified; the backend refuses the order too. */
@Composable
fun VerifyEmailToCheckoutScreen(
    email: String,
    onBack: () -> Unit,
    onVerify: () -> Unit,
    modifier: Modifier = Modifier
) {
    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(title = "Checkout", onBack = onBack)
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                EmptyState(
                    icon = Icons.Rounded.Email,
                    title = "Verify your email to check out",
                    description = "Confirm $email first, then come back to place your order. " +
                        "Measuring with AR and the 3D preview still work.",
                    actionLabel = "Verify email",
                    onAction = onVerify
                )
            }
        }
    }
}
