package com.example.panelscan.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.OtpCodeBoxInput
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.data.repository.ActionResult
import com.example.panelscan.data.repository.AuthRepository
import com.example.panelscan.data.repository.AuthResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Seconds before another code can be sent (the backend's resend cooldown). */
private const val RESEND_COOLDOWN_SECONDS = 60

/**
 * The website's Profile "Email verification" card (web
 * components/profile/email-verification-card.tsx): the customer verifies their
 * address with the 6-digit code emailed at sign-up, or sends a new one.
 */
@Composable
fun EmailVerificationCard(
    user: CustomerUser,
    authRepository: AuthRepository,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val scope = rememberCoroutineScope()

    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var isVerifying by remember { mutableStateOf(false) }
    var isSending by remember { mutableStateOf(false) }
    var remaining by remember { mutableIntStateOf(0) }

    LaunchedEffect(remaining) {
        if (remaining > 0) {
            delay(1000)
            remaining -= 1
        }
    }

    PanelCard(modifier = modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Email verification", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                StatusBadge(
                    text = if (user.emailVerified) "Verified" else "Not verified",
                    tone = if (user.emailVerified) BadgeTone.Success else BadgeTone.Warning,
                    showDot = true
                )
            }

            if (user.emailVerified) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Icon(Icons.Rounded.Verified, contentDescription = null, tint = colors.success, modifier = Modifier.size(18.dp))
                    Text(
                        text = "${user.email} is verified. It can be used to recover your password.",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                }
                return@Column
            }

            Text(
                text = "Verify ${user.email} to prove it's yours. Password recovery only works for verified emails.",
                style = PanelScan.type.supporting,
                color = colors.textSecondary
            )

            OtpCodeBoxInput(
                code = code,
                onCodeChange = { value ->
                    code = value.filter { it.isDigit() }.take(6)
                    error = null
                },
                enabled = !isVerifying
            )

            error?.let { Text(text = it, style = PanelScan.type.supporting, color = colors.destructive) }
            notice?.let { Text(text = it, style = PanelScan.type.supporting, color = colors.success) }

            PrimaryButton(
                text = if (isVerifying) "Verifying…" else "Verify email",
                onClick = {
                    if (code.length != 6) {
                        error = "Enter the 6-digit code from your email."
                        return@PrimaryButton
                    }
                    isVerifying = true
                    notice = null
                    scope.launch {
                        when (val result = authRepository.verifyEmail(code)) {
                            is AuthResult.Success -> code = ""
                            is AuthResult.Error -> error = result.message
                        }
                        isVerifying = false
                    }
                },
                enabled = !isVerifying && code.length == 6
            )
            SecondaryButton(
                text = when {
                    isSending -> "Sending…"
                    remaining > 0 -> "Send a new code (${remaining}s)"
                    else -> "Send a new code"
                },
                onClick = {
                    isSending = true
                    error = null
                    notice = null
                    scope.launch {
                        when (val result = authRepository.resendVerificationEmail()) {
                            is ActionResult.Success -> {
                                notice = "Verification code sent. Check ${user.email} for a 6-digit code."
                                remaining = RESEND_COOLDOWN_SECONDS
                            }
                            is ActionResult.Error -> error = result.message
                        }
                        isSending = false
                    }
                },
                enabled = !isSending && remaining == 0
            )
            Text(
                text = "Codes expire after 10 minutes. Nothing arrived? Check your spam folder, then send a new code.",
                style = PanelScan.type.label,
                color = colors.textTertiary
            )
        }
    }
}
