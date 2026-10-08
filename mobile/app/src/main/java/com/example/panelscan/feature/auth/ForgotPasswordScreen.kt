package com.example.panelscan.feature.auth

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MarkEmailRead
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanPasswordField
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.data.repository.AuthRepository
import com.example.panelscan.core.validation.AccountRules
import com.example.panelscan.data.repository.ActionResult
import kotlinx.coroutines.launch

private enum class ForgotPasswordStep {
    ENTER_EMAIL,
    VERIFY_CODE,
    SET_NEW_PASSWORD,
    SUCCESS
}

@Composable
fun ForgotPasswordScreen(
    authRepository: AuthRepository,
    onBack: () -> Unit,
    onNavigateToLogin: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val focusManager = LocalFocusManager.current
    val coroutineScope = rememberCoroutineScope()

    var currentStep by remember { mutableStateOf(ForgotPasswordStep.ENTER_EMAIL) }
    var email by remember { mutableStateOf("") }
    var emailError by remember { mutableStateOf<String?>(null) }

    var otpCode by remember { mutableStateOf("") }
    var otpError by remember { mutableStateOf<String?>(null) }

    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordError by remember { mutableStateOf<String?>(null) }
    var confirmPasswordError by remember { mutableStateOf<String?>(null) }

    var isLoading by remember { mutableStateOf(false) }
    var generalError by remember { mutableStateOf<String?>(null) }

    // Same password rule as the website and the API (8-16 characters, no spaces).
    val checks = AccountRules.passwordChecks(newPassword)
    val passwordsMatch = newPassword.isNotEmpty() && newPassword == confirmPassword
    val isPasswordStrong = checks.allMet && passwordsMatch

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = when (currentStep) {
                    ForgotPasswordStep.ENTER_EMAIL -> "Forgot Password"
                    ForgotPasswordStep.VERIFY_CODE -> "Verify Identity"
                    ForgotPasswordStep.SET_NEW_PASSWORD -> "Create New Password"
                    ForgotPasswordStep.SUCCESS -> "Reset Complete"
                },
                onBack = {
                    when (currentStep) {
                        ForgotPasswordStep.ENTER_EMAIL -> onBack()
                        ForgotPasswordStep.VERIFY_CODE -> currentStep = ForgotPasswordStep.ENTER_EMAIL
                        ForgotPasswordStep.SET_NEW_PASSWORD -> currentStep = ForgotPasswordStep.VERIFY_CODE
                        ForgotPasswordStep.SUCCESS -> onNavigateToLogin()
                    }
                }
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                generalError?.let { err ->
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
                            text = err,
                            style = PanelScan.type.supporting,
                            color = colors.destructive
                        )
                    }
                }

                when (currentStep) {
                    ForgotPasswordStep.ENTER_EMAIL -> {
                        Text(
                            text = "Reset your password",
                            style = PanelScan.type.title,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "Enter the email address of your PanelScan account. We'll email you a 6-digit code to reset your password.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )

                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(Spacing.md)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                                PanelScanTextField(
                                    value = email,
                                    onValueChange = {
                                        email = it
                                        emailError = null
                                        generalError = null
                                    },
                                    label = "Email Address",
                                    placeholder = "customer@gmail.com",
                                    leadingIcon = Icons.Rounded.Email,
                                    errorText = emailError,
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = KeyboardType.Email,
                                        imeAction = ImeAction.Done
                                    )
                                )

                                PrimaryButton(
                                    text = if (isLoading) "Sending…" else "Send Reset Code",
                                    onClick = {
                                        focusManager.clearFocus()
                                        val clean = email.trim().lowercase()
                                        if (clean.isBlank()) {
                                            emailError = "Please enter your email address."
                                        } else if (!AuthRepository.isValidEmail(clean)) {
                                            emailError = "Please enter a valid email address."
                                        } else {
                                            emailError = null
                                            isLoading = true
                                            coroutineScope.launch {
                                                val result = authRepository.requestPasswordReset(clean)
                                                isLoading = false
                                                when (result) {
                                                    is ActionResult.Success -> {
                                                        otpCode = ""
                                                        currentStep = ForgotPasswordStep.VERIFY_CODE
                                                    }
                                                    is ActionResult.Error -> emailError = result.message
                                                }
                                            }
                                        }
                                    },
                                    enabled = !isLoading,
                                    icon = Icons.Rounded.Key,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    }

                    ForgotPasswordStep.VERIFY_CODE -> {
                        Text(
                            text = "Enter Verification Code",
                            style = PanelScan.type.title,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "If $email has a PanelScan account, we sent it a 6-digit reset code. Check your inbox (and spam folder).",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )

                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(Spacing.md)
                        ) {
                            Column(
                                verticalArrangement = Arrangement.spacedBy(Spacing.md),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                // 6-digit box display
                                Box(
                                    modifier = Modifier.fillMaxWidth(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    BasicTextField(
                                        value = otpCode,
                                        onValueChange = { input ->
                                            val digits = input.filter { it.isDigit() }.take(6)
                                            otpCode = digits
                                            otpError = null
                                            generalError = null
                                        },
                                        keyboardOptions = KeyboardOptions(
                                            keyboardType = KeyboardType.Number,
                                            imeAction = ImeAction.Done
                                        ),
                                        modifier = Modifier.matchParentSize().clip(PanelScan.shapes.control)
                                    )

                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        (0 until 6).forEach { index ->
                                            val char = otpCode.getOrNull(index)?.toString() ?: ""
                                            val isFocused = otpCode.length == index
                                            Box(
                                                modifier = Modifier
                                                    .size(46.dp)
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(colors.surfaceElevated)
                                                    .border(
                                                        width = if (isFocused) 2.dp else 1.dp,
                                                        color = if (isFocused) colors.accent else colors.border,
                                                        shape = RoundedCornerShape(8.dp)
                                                    ),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text(
                                                    text = char,
                                                    style = PanelScan.type.display.copy(fontSize = 22.sp),
                                                    color = colors.textPrimary,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                    }
                                }

                                otpError?.let {
                                    Text(
                                        text = it,
                                        style = PanelScan.type.supporting,
                                        color = colors.destructive
                                    )
                                }

                                PrimaryButton(
                                    text = if (isLoading) "Verifying…" else "Verify Code",
                                    onClick = {
                                        focusManager.clearFocus()
                                        if (otpCode.length < 6) {
                                            otpError = "Please enter all 6 digits."
                                        } else {
                                            otpError = null
                                            isLoading = true
                                            coroutineScope.launch {
                                                val result = authRepository.verifyResetCode(email, otpCode)
                                                isLoading = false
                                                when (result) {
                                                    is ActionResult.Success -> currentStep = ForgotPasswordStep.SET_NEW_PASSWORD
                                                    is ActionResult.Error -> otpError = result.message
                                                }
                                            }
                                        }
                                    },
                                    enabled = otpCode.length == 6 && !isLoading,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    }

                    ForgotPasswordStep.SET_NEW_PASSWORD -> {
                        Text(
                            text = "Set New Password",
                            style = PanelScan.type.title,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "Your new password must be 8 to 16 characters with no spaces, and include uppercase, lowercase, digit, and special characters.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )

                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(Spacing.md)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                                PanelScanPasswordField(
                                    value = newPassword,
                                    onValueChange = {
                                        newPassword = it.take(AccountRules.PASSWORD_MAX_LENGTH)
                                        passwordError = null
                                        generalError = null
                                    },
                                    label = "New Password",
                                    placeholder = "Enter new password",
                                    leadingIcon = Icons.Rounded.Lock,
                                    errorText = passwordError,
                                    enabled = !isLoading
                                )

                                PanelScanPasswordField(
                                    value = confirmPassword,
                                    onValueChange = {
                                        confirmPassword = it.take(AccountRules.PASSWORD_MAX_LENGTH)
                                        confirmPasswordError = null
                                        generalError = null
                                    },
                                    label = "Confirm New Password",
                                    placeholder = "Re-enter new password",
                                    leadingIcon = Icons.Rounded.Lock,
                                    errorText = confirmPasswordError,
                                    enabled = !isLoading
                                )

                                // Password Rules Checklist
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        text = "Password Requirements:",
                                        style = PanelScan.type.label,
                                        color = colors.textSecondary
                                    )
                                    ResetPasswordRuleRow("8 to 16 characters", checks.length)
                                    ResetPasswordRuleRow("At least one uppercase letter (A-Z)", checks.uppercase)
                                    ResetPasswordRuleRow("At least one lowercase letter (a-z)", checks.lowercase)
                                    ResetPasswordRuleRow("At least one number (0-9)", checks.number)
                                    ResetPasswordRuleRow("At least one special character (!@#\$%^&*)", checks.special)
                                    ResetPasswordRuleRow("No spaces", checks.noSpaces)
                                    ResetPasswordRuleRow("Passwords match", passwordsMatch)
                                }

                                PrimaryButton(
                                    text = if (isLoading) "Updating…" else "Update Password",
                                    onClick = {
                                        focusManager.clearFocus()
                                        if (!isPasswordStrong) {
                                            generalError = "Please satisfy all password security requirements."
                                            return@PrimaryButton
                                        }
                                        isLoading = true
                                        generalError = null
                                        coroutineScope.launch {
                                            val result = authRepository.resetPassword(email, otpCode, newPassword)
                                            isLoading = false
                                            when (result) {
                                                is ActionResult.Success -> {
                                                    currentStep = ForgotPasswordStep.SUCCESS
                                                }
                                                is ActionResult.Error -> {
                                                    generalError = result.message
                                                }
                                            }
                                        }
                                    },
                                    enabled = !isLoading && isPasswordStrong,
                                    icon = Icons.Rounded.Lock,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    }

                    ForgotPasswordStep.SUCCESS -> {
                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(Spacing.lg)
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(Spacing.md)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(64.dp)
                                        .clip(CircleShape)
                                        .background(colors.successSoft),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Check,
                                        contentDescription = null,
                                        tint = colors.success,
                                        modifier = Modifier.size(36.dp)
                                    )
                                }

                                Text(
                                    text = "Password Reset Complete!",
                                    style = PanelScan.type.title,
                                    color = colors.textPrimary,
                                    textAlign = TextAlign.Center
                                )

                                Text(
                                    text = "Your password has been securely updated. You can now use your new password to sign in to your PanelScan account.",
                                    style = PanelScan.type.body,
                                    color = colors.textSecondary,
                                    textAlign = TextAlign.Center
                                )

                                Spacer(modifier = Modifier.height(Spacing.xs))

                                PrimaryButton(
                                    text = "Back to Log In",
                                    onClick = onNavigateToLogin,
                                    icon = Icons.AutoMirrored.Rounded.Login,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResetPasswordRuleRow(
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
