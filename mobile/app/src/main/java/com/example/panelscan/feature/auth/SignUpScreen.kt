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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.panelscan.R
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanPasswordField
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PhilippinePhoneField
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.validation.AccountRules
import com.example.panelscan.core.ui.pressScale

@Composable
fun SignUpScreen(
    viewModel: AuthViewModel,
    onBack: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onRegisterSuccess: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToTerms: () -> Unit = {},
    onNavigateToPrivacyPolicy: () -> Unit = {}
) {
    val state by viewModel.uiState.collectAsState()
    val colors = PanelScan.colors
    val focusManager = LocalFocusManager.current
    // Credential Manager shows Google's account picker over this Activity.
    val activityContext = LocalContext.current
    val context = LocalContext.current

    val openDatePicker = {
        val parts = state.birthdate.split('-')
        val initialYear = parts.getOrNull(0)?.toIntOrNull() ?: 2000
        val initialMonth = (parts.getOrNull(1)?.toIntOrNull() ?: 1) - 1
        val initialDay = parts.getOrNull(2)?.toIntOrNull() ?: 1

        val dialog = android.app.DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                viewModel.onBirthdateSelected(year, month + 1, dayOfMonth)
            },
            initialYear,
            initialMonth,
            initialDay
        )
        dialog.datePicker.maxDate = System.currentTimeMillis()
        dialog.show()
    }

    val passwordChecks = AccountRules.passwordChecks(state.password)
    val passwordsMatch = state.password.isNotEmpty() && state.password == state.confirmPassword
    val isPhoneValid = state.phone.length == 10 && state.phone.startsWith("9")

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Create Customer Account",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                // Header with company logo
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
                            text = "PANELSCAN REGISTRATION",
                            style = PanelScan.type.label,
                            color = colors.accent
                        )
                        Text(
                            text = "Disenyo Interior Solution",
                            style = PanelScan.type.cardTitle,
                            color = colors.textPrimary
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                    Text(
                        text = "Join PanelScan",
                        style = PanelScan.type.title,
                        color = colors.textPrimary
                    )
                    Text(
                        text = "Register with your email address and mobile number to unlock live panel pricing, 3D measurements, and order tracking. The same account works on the PanelScan website.",
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
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = error,
                            style = PanelScan.type.supporting,
                            color = colors.destructive
                        )
                    }
                }

                // Customer Information Card
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                        Text(
                            text = "Customer Information",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )

                        // Same fields and rules as the website: first name, optional middle initial, last name.
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                        ) {
                            PanelScanTextField(
                                value = state.firstName,
                                onValueChange = viewModel::onFirstNameChange,
                                label = "First name",
                                placeholder = "Juan",
                                leadingIcon = Icons.Rounded.Person,
                                errorText = state.firstNameError,
                                enabled = !state.isLoading,
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Right) }),
                                modifier = Modifier.weight(1f)
                            )
                            PanelScanTextField(
                                value = state.middleInitial,
                                onValueChange = viewModel::onMiddleInitialChange,
                                label = "M.I. (optional)",
                                placeholder = "M.",
                                errorText = state.middleInitialError,
                                enabled = !state.isLoading,
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Next),
                                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                                modifier = Modifier.weight(0.6f)
                            )
                        }
                        PanelScanTextField(
                            value = state.lastName,
                            onValueChange = viewModel::onLastNameChange,
                            label = "Last name",
                            placeholder = "Dela Cruz",
                            leadingIcon = Icons.Rounded.Person,
                            errorText = state.lastNameError,
                            enabled = !state.isLoading,
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                            keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                        )

                        // Email Address
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
                                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                            )
                            Text(
                                text = "After you sign up, we'll email a code to verify this address. You can verify it anytime from your Profile.",
                                style = PanelScan.type.label,
                                color = colors.textTertiary,
                                modifier = Modifier.padding(start = 4.dp)
                            )
                        }

                        // Contact Number (+63 format requirement)
                        PhilippinePhoneField(
                            value = state.phone,
                            onValueChange = viewModel::onPhoneChange,
                            label = "Contact Number (Required)",
                            errorText = state.phoneError,
                            enabled = !state.isLoading
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                        ) {
                            Box(modifier = Modifier.weight(1.3f)) {
                                PanelScanTextField(
                                    value = state.birthdate,
                                    onValueChange = {},
                                    label = "Birthdate",
                                    placeholder = "YYYY-MM-DD",
                                    leadingIcon = Icons.Rounded.CalendarToday,
                                    trailingIcon = {
                                        androidx.compose.material3.IconButton(onClick = openDatePicker) {
                                            Icon(
                                                imageVector = Icons.Rounded.DateRange,
                                                contentDescription = "Select birthdate",
                                                tint = colors.accent,
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                    },
                                    errorText = state.birthdateError,
                                    readOnly = true,
                                    enabled = !state.isLoading,
                                    modifier = Modifier.pressScale(onClick = openDatePicker)
                                )
                            }
                            Box(modifier = Modifier.weight(0.7f)) {
                                PanelScanTextField(
                                    value = state.age?.let { "$it yrs" } ?: "—",
                                    onValueChange = {},
                                    label = "Age",
                                    placeholder = "Auto",
                                    readOnly = true,
                                    enabled = false
                                )
                            }
                        }
                    }
                }

                // Security Card
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                        Text(
                            text = "Security",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )

                        PanelScanPasswordField(
                            value = state.password,
                            onValueChange = viewModel::onPasswordChange,
                            label = "Password",
                            placeholder = "8 to 16 characters",
                            leadingIcon = Icons.Rounded.Lock,
                            errorText = state.passwordError,
                            enabled = !state.isLoading,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                        )

                        PanelScanPasswordField(
                            value = state.confirmPassword,
                            onValueChange = viewModel::onConfirmPasswordChange,
                            label = "Confirm password",
                            placeholder = "Repeat your password",
                            leadingIcon = Icons.Rounded.Lock,
                            errorText = state.confirmPasswordError,
                            enabled = !state.isLoading,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    focusManager.clearFocus()
                                    viewModel.startRegistration(onRegisterSuccess)
                                }
                            )
                        )

                        // Password requirements list
                        Column(
                            verticalArrangement = Arrangement.spacedBy(Spacing.xxs),
                            modifier = Modifier.padding(top = Spacing.xxs)
                        ) {
                            Text(
                                text = "Password requirements:",
                                style = PanelScan.type.label,
                                color = colors.textTertiary
                            )
                            PasswordRuleRow(text = "8 to 16 characters", satisfied = passwordChecks.length)
                            PasswordRuleRow(text = "At least one uppercase letter (A-Z)", satisfied = passwordChecks.uppercase)
                            PasswordRuleRow(text = "At least one lowercase letter (a-z)", satisfied = passwordChecks.lowercase)
                            PasswordRuleRow(text = "At least one number (0-9)", satisfied = passwordChecks.number)
                            PasswordRuleRow(text = "At least one special character (e.g. @, #, $, !)", satisfied = passwordChecks.special)
                            PasswordRuleRow(text = "No spaces", satisfied = passwordChecks.noSpaces)
                            if (state.confirmPassword.isNotEmpty()) {
                                PasswordRuleRow(text = "Passwords match", satisfied = passwordsMatch)
                            }
                        }

                        // Terms & Privacy Agreement Checkbox (Required)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.xxs),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = state.agreedToTerms,
                                onCheckedChange = viewModel::onAgreedToTermsChange,
                                colors = CheckboxDefaults.colors(
                                    checkedColor = colors.accent,
                                    checkmarkColor = colors.accentContrast
                                )
                            )
                            Spacer(modifier = Modifier.width(Spacing.xs))
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "I agree to the ",
                                    style = PanelScan.type.supporting,
                                    color = colors.textSecondary
                                )
                                Text(
                                    text = "Privacy Policy",
                                    style = PanelScan.type.supporting.copy(fontWeight = FontWeight.Bold),
                                    color = colors.accent,
                                    modifier = Modifier.pressScale(onClick = onNavigateToPrivacyPolicy)
                                )
                                Text(
                                    text = " and ",
                                    style = PanelScan.type.supporting,
                                    color = colors.textSecondary
                                )
                                Text(
                                    text = "Terms & Conditions",
                                    style = PanelScan.type.supporting.copy(fontWeight = FontWeight.Bold),
                                    color = colors.accent,
                                    modifier = Modifier.pressScale(onClick = onNavigateToTerms)
                                )
                                Text(
                                    text = ".",
                                    style = PanelScan.type.supporting,
                                    color = colors.textSecondary
                                )
                            }
                        }

                        PrimaryButton(
                            text = if (state.isLoading) "Creating Account…" else "Create Account",
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.startRegistration(onRegisterSuccess)
                            },
                            enabled = !state.isLoading,
                            icon = if (!state.isLoading) Icons.AutoMirrored.Rounded.ArrowForward else null,
                            modifier = Modifier.fillMaxWidth()
                        )

                        // Google fills in the name and verified email; only the Terms box is needed.
                        Text(
                            text = "or",
                            style = PanelScan.type.supporting,
                            color = colors.textTertiary,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                        SecondaryButton(
                            text = "Sign up with Google",
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.loginWithGoogle(activityContext, fromSignUp = true, onSuccess = onRegisterSuccess)
                            },
                            enabled = !state.isLoading && state.agreedToTerms,
                            fillMaxWidth = true
                        )
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.sm))

                // Navigation to Login
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Text(
                        text = "Already have an account?",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                    SecondaryButton(
                        text = "Log In",
                        onClick = onNavigateToLogin,
                        enabled = !state.isLoading,
                        fillMaxWidth = true
                    )
                }
            }
        }
    }
}


@Composable
private fun PasswordRuleRow(
    text: String,
    satisfied: Boolean
) {
    val colors = PanelScan.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Icon(
            imageVector = if (satisfied) Icons.Rounded.Check else Icons.Rounded.Close,
            contentDescription = null,
            tint = if (satisfied) colors.success else colors.textTertiary,
            modifier = Modifier.size(14.dp)
        )
        Text(
            text = text,
            style = PanelScan.type.label,
            color = if (satisfied) colors.success else colors.textSecondary
        )
    }
}
