package com.example.panelscan.feature.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.panelscan.R
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanPasswordField
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onBack: () -> Unit,
    onNavigateToSignUp: () -> Unit,
    onLoginSuccess: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToForgotPassword: () -> Unit = {}
) {
    val state by viewModel.uiState.collectAsState()
    val colors = PanelScan.colors
    val focusManager = LocalFocusManager.current

    // Credential Manager shows Google's account picker over this Activity.
    val activityContext = LocalContext.current

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Customer Log In",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                // Header callout with company branding
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.panelscan_logo),
                        contentDescription = "PanelScan Logo",
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(1.dp, colors.border, RoundedCornerShape(12.dp))
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = "DISENYO INTERIOR SOLUTION",
                            style = PanelScan.type.label,
                            color = colors.accent
                        )
                        Text(
                            text = "PanelScan Customer Portal",
                            style = PanelScan.type.cardTitle,
                            color = colors.textPrimary
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                    Text(
                        text = "Log in to your account",
                        style = PanelScan.type.title,
                        color = colors.textPrimary
                    )
                    Text(
                        text = "Access live product pricing, chat directly with our interior consultants, and synchronize your wall and ceiling measurements.",
                        style = PanelScan.type.body,
                        color = colors.textSecondary
                    )
                }

                // Error banner
                state.errorMessage?.let { error ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .background(colors.destructiveSoft)
                            .padding(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ErrorOutline,
                            contentDescription = null,
                            tint = colors.destructive,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = error,
                            style = PanelScan.type.supporting,
                            color = colors.destructive
                        )
                    }
                }

                // Inputs Card
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                        PanelScanTextField(
                            value = state.email,
                            onValueChange = viewModel::onEmailChange,
                            label = "Email address",
                            placeholder = "example@gmail.com",
                            leadingIcon = Icons.Rounded.Email,
                            errorText = state.emailError,
                            enabled = !state.isLoading,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Down) }
                            )
                        )

                        PanelScanPasswordField(
                            value = state.password,
                            onValueChange = viewModel::onPasswordChange,
                            label = "Password",
                            placeholder = "Enter your password",
                            leadingIcon = Icons.Rounded.Lock,
                            errorText = state.passwordError,
                            enabled = !state.isLoading,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    focusManager.clearFocus()
                                    viewModel.login(onLoginSuccess)
                                }
                            )
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            androidx.compose.material3.TextButton(
                                onClick = onNavigateToForgotPassword,
                                enabled = !state.isLoading
                            ) {
                                Text(
                                    text = "Forgot password?",
                                    style = PanelScan.type.label,
                                    color = colors.accent
                                )
                            }
                        }

                        PrimaryButton(
                            text = if (state.isLoading) "Logging in…" else "Log In",
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.login(onLoginSuccess)
                            },
                            enabled = !state.isLoading && state.email.isNotBlank() && state.password.isNotBlank(),
                            icon = if (!state.isLoading) Icons.AutoMirrored.Rounded.Login else null,
                            modifier = Modifier.fillMaxWidth()
                        )

                        SecondaryButton(
                            text = "Continue with Google",
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.loginWithGoogle(activityContext, fromSignUp = false, onSuccess = onLoginSuccess)
                            },
                            enabled = !state.isLoading,
                            fillMaxWidth = true
                        )
                    }
                }

                // Security reminder
                Row(
                    modifier = Modifier.padding(horizontal = Spacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Shield,
                        contentDescription = null,
                        tint = colors.textTertiary,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Passwords and sessions are encrypted and protected.",
                        style = PanelScan.type.label,
                        color = colors.textTertiary
                    )
                }

                Spacer(modifier = Modifier.height(Spacing.sm))

                // Navigation to Sign Up
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Text(
                        text = "New to PanelScan?",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                    SecondaryButton(
                        text = "Create Customer Account",
                        onClick = onNavigateToSignUp,
                        enabled = !state.isLoading,
                        fillMaxWidth = true
                    )
                }
            }
        }
    }
}
