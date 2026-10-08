package com.example.panelscan.feature.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.PanelScanPasswordField
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.data.repository.AuthRepository
import com.example.panelscan.core.validation.AccountRules
import com.example.panelscan.data.repository.ActionResult
import kotlinx.coroutines.launch

@Composable
fun ChangePasswordDialog(
    authRepository: AuthRepository,
    onDismiss: () -> Unit,
    onSuccess: () -> Unit
) {
    val colors = PanelScan.colors
    val coroutineScope = rememberCoroutineScope()

    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }

    // Same password rule as the website and the API (8-16 characters, no spaces).
    val checks = AccountRules.passwordChecks(newPassword)
    val passwordsMatch = newPassword.isNotEmpty() && newPassword == confirmPassword
    val isPasswordValid = checks.allMet && passwordsMatch

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Change Password",
                style = PanelScan.type.sectionTitle,
                color = colors.textPrimary
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                errorMessage?.let { err ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .background(colors.destructiveSoft)
                            .padding(Spacing.xs),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ErrorOutline,
                            contentDescription = null,
                            tint = colors.destructive,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = err,
                            style = PanelScan.type.supporting,
                            color = colors.destructive
                        )
                    }
                }

                PanelScanPasswordField(
                    value = oldPassword,
                    onValueChange = {
                        oldPassword = it
                        errorMessage = null
                    },
                    label = "Current Password",
                    placeholder = "Enter current password",
                    leadingIcon = Icons.Rounded.Lock,
                    enabled = !isLoading
                )

                PanelScanPasswordField(
                    value = newPassword,
                    onValueChange = {
                        newPassword = it.take(AccountRules.PASSWORD_MAX_LENGTH)
                        errorMessage = null
                    },
                    label = "New Password",
                    placeholder = "Enter new password",
                    leadingIcon = Icons.Rounded.Lock,
                    enabled = !isLoading
                )

                PanelScanPasswordField(
                    value = confirmPassword,
                    onValueChange = {
                        confirmPassword = it.take(AccountRules.PASSWORD_MAX_LENGTH)
                        errorMessage = null
                    },
                    label = "Confirm New Password",
                    placeholder = "Re-enter new password",
                    leadingIcon = Icons.Rounded.Lock,
                    enabled = !isLoading
                )

                Column(
                    modifier = Modifier.padding(top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    PasswordCheckItem("8 to 16 characters, no spaces", checks.length && checks.noSpaces)
                    PasswordCheckItem("Uppercase & lowercase", checks.uppercase && checks.lowercase)
                    PasswordCheckItem("Number & special character", checks.number && checks.special)
                    PasswordCheckItem("Passwords match", passwordsMatch)
                }
            }
        },
        confirmButton = {
            PrimaryButton(
                text = if (isLoading) "Updating…" else "Update",
                onClick = {
                    if (oldPassword.isBlank()) {
                        errorMessage = "Current password is required."
                        return@PrimaryButton
                    }
                    if (!isPasswordValid) {
                        errorMessage = "Please meet all password requirements."
                        return@PrimaryButton
                    }
                    isLoading = true
                    errorMessage = null
                    coroutineScope.launch {
                        val result = authRepository.changePassword(oldPassword, newPassword)
                        isLoading = false
                        when (result) {
                            is ActionResult.Success -> {
                                onSuccess()
                            }
                            is ActionResult.Error -> {
                                errorMessage = result.message
                            }
                        }
                    }
                },
                enabled = !isLoading && isPasswordValid && oldPassword.isNotBlank()
            )
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isLoading
            ) {
                Text("Cancel", color = colors.textSecondary)
            }
        },
        shape = PanelScan.shapes.card,
        containerColor = colors.surface
    )
}

@Composable
private fun PasswordCheckItem(
    text: String,
    satisfied: Boolean
) {
    val colors = PanelScan.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xxs)
    ) {
        Icon(
            imageVector = if (satisfied) Icons.Rounded.Check else Icons.Rounded.Close,
            contentDescription = null,
            tint = if (satisfied) colors.success else colors.textTertiary,
            modifier = Modifier.size(12.dp)
        )
        Text(
            text = text,
            style = PanelScan.type.label,
            color = if (satisfied) colors.success else colors.textSecondary
        )
    }
}
