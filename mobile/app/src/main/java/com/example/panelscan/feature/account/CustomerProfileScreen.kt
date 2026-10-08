package com.example.panelscan.feature.account

import android.app.DatePickerDialog
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.session.CustomerUser
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PhilippinePhoneField
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.data.repository.AuthRepository
import com.example.panelscan.data.repository.AuthResult
import kotlinx.coroutines.launch

@Composable
fun CustomerProfileScreen(
    currentUser: CustomerUser,
    authRepository: AuthRepository,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onChangePasswordClick: () -> Unit = {}
) {
    val colors = PanelScan.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current

    var firstName by remember { mutableStateOf(currentUser.firstName) }
    var lastName by remember { mutableStateOf(currentUser.lastName) }
    var phoneDigits by remember {
        val raw = currentUser.phone ?: ""
        val digits = raw.filter { it.isDigit() }
        val ten = if (digits.startsWith("63") && digits.length == 12) digits.drop(2)
        else if (digits.startsWith("0") && digits.length == 11) digits.drop(1)
        else digits.takeLast(10)
        mutableStateOf(ten)
    }
    var birthdate by remember { mutableStateOf(currentUser.birthdate ?: "") }
    var avatarUriString by remember { mutableStateOf(currentUser.profilePictureUri) }

    var firstNameError by remember { mutableStateOf<String?>(null) }
    var lastNameError by remember { mutableStateOf<String?>(null) }
    var phoneError by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    // Picks up an email verified on the website since this device last checked.
    LaunchedEffect(Unit) { authRepository.refreshCurrentUser() }
    var showChangePasswordDialog by remember { mutableStateOf(false) }

    if (showChangePasswordDialog) {
        ChangePasswordDialog(
            authRepository = authRepository,
            onDismiss = { showChangePasswordDialog = false },
            onSuccess = {
                showChangePasswordDialog = false
                successMessage = "Password updated successfully!"
            }
        )
    }

    val calculatedAge = remember(birthdate) {
        if (birthdate.isNotBlank()) {
            AuthRepository.calculateAge(birthdate)
        } else {
            currentUser.age
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            avatarUriString = uri.toString()
            successMessage = null
        }
    }

    val openDatePicker = {
        val parts = birthdate.split('-')
        val initialYear = parts.getOrNull(0)?.toIntOrNull() ?: 2000
        val initialMonth = (parts.getOrNull(1)?.toIntOrNull() ?: 1) - 1
        val initialDay = parts.getOrNull(2)?.toIntOrNull() ?: 1

        val dialog = DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val formatted = String.format("%04d-%02d-%02d", year, month + 1, dayOfMonth)
                birthdate = formatted
                successMessage = null
            },
            initialYear,
            initialMonth,
            initialDay
        )
        dialog.datePicker.maxDate = System.currentTimeMillis()
        dialog.show()
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Customer Profile",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                // Avatar Picker Section
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = Spacing.sm),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(108.dp)
                            .clip(CircleShape)
                            .background(colors.surfaceElevated)
                            .border(2.dp, colors.accent, CircleShape)
                            .clickable { photoPickerLauncher.launch("image/*") },
                        contentAlignment = Alignment.Center
                    ) {
                        if (!avatarUriString.isNullOrBlank()) {
                            AsyncImage(
                                model = avatarUriString,
                                contentDescription = "Profile Avatar",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Rounded.Person,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(54.dp)
                            )
                        }

                        // Edit Badge
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(colors.accent)
                                .border(2.dp, colors.surface, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CameraAlt,
                                contentDescription = "Change photo",
                                tint = colors.accentContrast,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                Text(
                    text = "Tap photo to choose a profile image from your device",
                    style = PanelScan.type.label,
                    color = colors.textTertiary,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )

                // Feedback messages
                successMessage?.let { msg ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .background(colors.successSoft)
                            .padding(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            tint = colors.success,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = msg,
                            style = PanelScan.type.supporting,
                            color = colors.success
                        )
                    }
                }

                errorMessage?.let { err ->
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

                // Profile Fields Card
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                        Text(
                            text = "Personal Details",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )

                        PanelScanTextField(
                            value = firstName,
                            onValueChange = {
                                firstName = it
                                firstNameError = null
                                successMessage = null
                            },
                            label = "First Name",
                            placeholder = "Juan",
                            leadingIcon = Icons.Rounded.Person,
                            errorText = firstNameError
                        )

                        PanelScanTextField(
                            value = lastName,
                            onValueChange = {
                                lastName = it
                                lastNameError = null
                                successMessage = null
                            },
                            label = "Last Name",
                            placeholder = "Dela Cruz",
                            leadingIcon = Icons.Rounded.Person,
                            errorText = lastNameError
                        )

                        // Read-only Email
                        Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                            PanelScanTextField(
                                value = currentUser.email,
                                onValueChange = {},
                                label = "Email Address",
                                leadingIcon = Icons.Rounded.Email,
                                enabled = false
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(start = 4.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Lock,
                                    contentDescription = null,
                                    tint = colors.textTertiary,
                                    modifier = Modifier.size(12.dp)
                                )
                                Text(
                                    text = "Email address is tied to your account and cannot be modified.",
                                    style = PanelScan.type.label,
                                    color = colors.textTertiary
                                )
                            }
                        }

                        // Philippine Contact Number
                        PhilippinePhoneField(
                            value = phoneDigits,
                            onValueChange = {
                                phoneDigits = it
                                phoneError = null
                                successMessage = null
                            },
                            label = "Contact Number",
                            errorText = phoneError
                        )

                        // Birthdate and Age Display
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                            verticalAlignment = Alignment.Bottom
                        ) {
                            Box(modifier = Modifier.weight(1.4f)) {
                                PanelScanTextField(
                                    value = birthdate,
                                    onValueChange = {},
                                    label = "Birthdate",
                                    placeholder = "YYYY-MM-DD",
                                    leadingIcon = Icons.Rounded.CalendarToday,
                                    trailingIcon = {
                                        IconButton(onClick = openDatePicker) {
                                            Icon(
                                                imageVector = Icons.Rounded.CalendarToday,
                                                contentDescription = "Select birthdate",
                                                tint = colors.accent
                                            )
                                        }
                                    }
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .weight(0.8f)
                                    .height(56.dp)
                                    .clip(PanelScan.shapes.control)
                                    .background(colors.surfaceElevated)
                                    .border(1.dp, colors.border, PanelScan.shapes.control)
                                    .padding(horizontal = Spacing.sm),
                                contentAlignment = Alignment.CenterStart
                            ) {
                                Column(verticalArrangement = Arrangement.Center) {
                                    Text(
                                        text = "AGE",
                                        style = PanelScan.type.label,
                                        color = colors.textTertiary
                                    )
                                    Text(
                                        text = if (calculatedAge != null) "$calculatedAge yrs" else "—",
                                        style = PanelScan.type.cardTitle,
                                        fontWeight = FontWeight.Bold,
                                        color = colors.textPrimary
                                    )
                                }
                            }
                        }
                    }
                }

                // Email verification (sent at sign-up; verified here, as on the website)
                EmailVerificationCard(user = currentUser, authRepository = authRepository)

                // Security / Change Password Button
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = "Account Security",
                                style = PanelScan.type.cardTitle,
                                color = colors.textPrimary
                            )
                            Text(
                                text = "Update your login password",
                                style = PanelScan.type.supporting,
                                color = colors.textSecondary
                            )
                        }
                        com.example.panelscan.core.ui.SecondaryButton(
                            text = "Change",
                            onClick = { showChangePasswordDialog = true }
                        )
                    }
                }

                // Save CTA
                PrimaryButton(
                    text = "Save Changes",
                    onClick = {
                        focusManager.clearFocus()
                        val cleanFirst = firstName.trim()
                        val cleanLast = lastName.trim()

                        var hasError = false
                        if (cleanFirst.length < 2) {
                            firstNameError = "First name must be at least 2 characters."
                            hasError = true
                        }
                        if (cleanLast.length < 2) {
                            lastNameError = "Last name must be at least 2 characters."
                            hasError = true
                        }
                        if (phoneDigits.isNotBlank() && phoneDigits.length != 10) {
                            phoneError = "Please enter 10 digits after +63."
                            hasError = true
                        }

                        if (hasError) return@PrimaryButton

                        isSaving = true
                        coroutineScope.launch {
                            val res = authRepository.updateProfile(
                                firstName = cleanFirst,
                                lastName = cleanLast,
                                phone = if (phoneDigits.isNotBlank()) phoneDigits else null,
                                birthdate = birthdate,
                                profilePictureUri = avatarUriString
                            )
                            isSaving = false
                            when (res) {
                                is AuthResult.Success -> {
                                    successMessage = "Profile updated successfully!"
                                    errorMessage = null
                                }
                                is AuthResult.Error -> {
                                    errorMessage = res.message
                                    successMessage = null
                                }
                            }
                        }
                    },
                    enabled = !isSaving,
                    icon = Icons.Rounded.Save,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        }
    }
}
