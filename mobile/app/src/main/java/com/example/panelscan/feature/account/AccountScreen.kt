package com.example.panelscan.feature.account

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.R
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.pressScale

import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.RateReview
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.example.panelscan.data.repository.AuthRepository

@Composable
fun AccountScreen(
    sessionState: CustomerSessionState,
    onNavigateToSignIn: () -> Unit,
    onNavigateToSignUp: () -> Unit,
    onNavigateToChat: () -> Unit,
    onLogout: () -> Unit,
    projectCount: Int,
    appVersion: String,
    modifier: Modifier = Modifier,
    onNavigateToProjects: () -> Unit = {},
    onNavigateToOrders: () -> Unit = {},
    onNavigateToInstallation: () -> Unit = {},
    onNavigateToFeedback: () -> Unit = {},
    onNavigateToAbout: () -> Unit = {},
    onNavigateToPrivacyPolicy: () -> Unit = {},
    onNavigateToTerms: () -> Unit = {},
    onNavigateToCustomerProfile: () -> Unit = {},
    authRepository: AuthRepository? = null,
    bottomPadding: Dp = 0.dp
) {
    val colors = PanelScan.colors
    var showLogoutConfirm by remember { mutableStateOf(false) }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = {
                Text(text = "Log out?", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
            },
            text = {
                Text(
                    text = "You will need to log in again to view product pricing and access customer chat.",
                    style = PanelScan.type.body,
                    color = colors.textSecondary
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutConfirm = false
                        onLogout()
                    }
                ) {
                    Text("Sign out", color = colors.destructive)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) {
                    Text("Cancel", color = colors.textSecondary)
                }
            },
            shape = PanelScan.shapes.card,
            containerColor = colors.surface
        )
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(title = "Account", large = true)

            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        bottom = bottomPadding + Spacing.xl
                    ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                when (sessionState) {
                    is CustomerSessionState.LoggedIn -> {
                        val user = sessionState.user
                        // Logged-in profile card
                        PanelCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onNavigateToCustomerProfile() },
                            contentPadding = PaddingValues(Spacing.md)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(54.dp)
                                        .clip(PanelScan.shapes.control)
                                        .background(colors.accentSoft),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (!user.profilePictureUri.isNullOrBlank()) {
                                        AsyncImage(
                                            model = user.profilePictureUri,
                                            contentDescription = "Profile picture",
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    } else {
                                        Icon(
                                            imageVector = Icons.Rounded.Person,
                                            contentDescription = null,
                                            tint = colors.accent,
                                            modifier = Modifier.size(28.dp)
                                        )
                                    }
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = user.fullName.ifBlank { user.email },
                                        style = PanelScan.type.sectionTitle,
                                        color = colors.textPrimary
                                    )
                                    Text(
                                        text = user.email,
                                        style = PanelScan.type.supporting,
                                        color = colors.textSecondary
                                    )
                                }
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                                    contentDescription = "Edit Profile",
                                    tint = colors.textTertiary
                                )
                            }

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = Spacing.md),
                                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                            ) {
                                ProfileStat(
                                    icon = Icons.Rounded.Straighten,
                                    label = "Saved projects",
                                    value = projectCount.toString(),
                                    onClick = onNavigateToProjects,
                                    modifier = Modifier.weight(1f)
                                )
                                ProfileStat(
                                    icon = Icons.Rounded.Chat,
                                    label = "Support chat",
                                    value = "Open",
                                    onClick = onNavigateToChat,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }

                        SettingsGroup(title = "Account & Security") {
                            SettingsRow(
                                icon = Icons.Rounded.Person,
                                title = "My Customer Profile",
                                supporting = "Profile details and Account Security",
                                chevron = true,
                                onClick = onNavigateToCustomerProfile
                            )
                        }

                        SettingsGroup(title = "Dashboard") {
                            SettingsRow(
                                icon = Icons.Rounded.LocalShipping,
                                title = "My Orders",
                                supporting = "Track orders, delivery status & order details",
                                chevron = true,
                                onClick = onNavigateToOrders
                            )
                            SettingsDivider()
                            SettingsRow(
                                icon = Icons.Rounded.Build,
                                title = "Installation Requests",
                                supporting = "Schedule professional fitting by Disenyo technicians",
                                chevron = true,
                                onClick = onNavigateToInstallation
                            )
                            SettingsDivider()
                            SettingsRow(
                                icon = Icons.Rounded.RateReview,
                                title = "Customer Reviews",
                                supporting = "Verified customer ratings and testimonials",
                                chevron = true,
                                onClick = onNavigateToFeedback
                            )
                            SettingsDivider()
                            SettingsRow(
                                icon = Icons.Rounded.Chat,
                                title = "Support messages",
                                supporting = "Chat with Disenyo Interior Solution consultants",
                                chevron = true,
                                onClick = onNavigateToChat
                            )
                            SettingsDivider()
                            SettingsRow(
                                icon = Icons.Rounded.Info,
                                title = "About Disenyo",
                                supporting = "PVC panelling, supplied and fitted. Company info",
                                chevron = true,
                                onClick = onNavigateToAbout
                            )
                            SettingsDivider()
                            SettingsRow(
                                icon = Icons.AutoMirrored.Rounded.ExitToApp,
                                title = "Sign out",
                                supporting = "Disconnect this session from device",
                                destructive = true,
                                onClick = { showLogoutConfirm = true }
                            )
                        }
                    }
                    is CustomerSessionState.LoggedOut, is CustomerSessionState.Loading -> {
                        // Logged-out callout card
                        PanelCard(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(Spacing.md)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                                ) {
                                    Image(
                                        painter = painterResource(id = R.drawable.panelscan_logo),
                                        contentDescription = "PanelScan Logo",
                                        modifier = Modifier
                                            .size(54.dp)
                                            .clip(PanelScan.shapes.control)
                                            .border(1.dp, colors.border, PanelScan.shapes.control)
                                    )
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Customer Account",
                                            style = PanelScan.type.sectionTitle,
                                            color = colors.textPrimary
                                        )
                                        Text(
                                            text = "Log in to unlock live catalogue prices & direct consultant support",
                                            style = PanelScan.type.supporting,
                                            color = colors.textSecondary
                                        )
                                    }
                                    StatusBadge(text = "Logged out")
                                }

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = Spacing.xs),
                                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                                ) {
                                    PrimaryButton(
                                        text = "Log In",
                                        onClick = onNavigateToSignIn,
                                        icon = Icons.AutoMirrored.Rounded.Login,
                                        modifier = Modifier.weight(1f)
                                    )
                                    SecondaryButton(
                                        text = "Register",
                                        onClick = onNavigateToSignUp,
                                        icon = Icons.Rounded.PersonAdd,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }
                        }
                    }
                }

                if (sessionState !is CustomerSessionState.LoggedIn) {
                    SettingsGroup(title = "Disenyo Services") {
                        SettingsRow(
                            icon = Icons.Rounded.Build,
                            title = "Installation Requests",
                            supporting = "Schedule professional fitting by Disenyo technicians",
                            chevron = true,
                            onClick = onNavigateToInstallation
                        )
                        SettingsDivider()
                        SettingsRow(
                            icon = Icons.Rounded.RateReview,
                            title = "Customer Reviews",
                            supporting = "Verified customer ratings and testimonials",
                            chevron = true,
                            onClick = onNavigateToFeedback
                        )
                        SettingsDivider()
                        SettingsRow(
                            icon = Icons.Rounded.Info,
                            title = "About Disenyo",
                            supporting = "PVC panelling, supplied and fitted. Company info",
                            chevron = true,
                            onClick = onNavigateToAbout
                        )
                    }
                }

                SettingsGroup(title = "Settings") {
                    SettingsRow(
                        icon = Icons.Rounded.DarkMode,
                        title = "Appearance",
                        supporting = "Follows your system light and dark setting"
                    )
                }

                SettingsGroup(title = "Privacy") {
                    SettingsRow(
                        icon = Icons.Rounded.Shield,
                        title = "Camera and AR data",
                        supporting = "Camera frames are processed on device and never uploaded"
                    )
                    SettingsDivider()
                    SettingsRow(
                        icon = Icons.Rounded.Lock,
                        title = "Privacy policy",
                        supporting = "How PanelScan handles your information",
                        chevron = true,
                        onClick = onNavigateToPrivacyPolicy
                    )
                }

                SettingsGroup(title = "Legal") {
                    SettingsRow(
                        icon = Icons.AutoMirrored.Rounded.Article,
                        title = "Terms of service",
                        supporting = "Conditions of use for the PanelScan app",
                        chevron = true,
                        onClick = onNavigateToTerms
                    )
                }

                SettingsGroup(title = "App information") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.panelscan_logo),
                            contentDescription = "PanelScan",
                            modifier = Modifier
                                .size(36.dp)
                                .clip(PanelScan.shapes.controlCompact)
                                .border(1.dp, colors.border, PanelScan.shapes.controlCompact)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "PanelScan by Disenyo Interior Solution",
                                style = PanelScan.type.cardTitle,
                                color = colors.textPrimary
                            )
                            Text(
                                text = "Version $appVersion · Official Customer App",
                                style = PanelScan.type.supporting,
                                color = colors.textSecondary
                            )
                        }
                    }
                }

                Text(
                    text = "Estimates and AR measurements are provided as a planning aid. " +
                        "Confirm quantities with your supplier before ordering.",
                    style = PanelScan.type.supporting,
                    color = colors.textTertiary
                )
            }
        }
    }
}

@Composable
private fun ProfileStat(
    icon: ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val colors = PanelScan.colors
    Column(
        modifier = modifier
            .defaultMinSize(minHeight = 72.dp)
            .clip(PanelScan.shapes.control)
            .border(1.dp, colors.border, PanelScan.shapes.control)
            .background(colors.surfaceMuted)
            .then(if (onClick != null) Modifier.pressScale(onClick = onClick) else Modifier)
            .padding(Spacing.sm),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = colors.accent,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = label.uppercase(),
                style = PanelScan.type.label,
                color = colors.textTertiary,
                maxLines = 1
            )
        }
        Text(
            text = value,
            style = PanelScan.type.cardTitle,
            color = colors.textPrimary,
            maxLines = 1
        )
    }
}

@Composable
private fun SettingsGroup(
    title: String,
    content: @Composable () -> Unit
) {
    val colors = PanelScan.colors
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(
            text = title.uppercase(),
            style = PanelScan.type.label,
            color = colors.textTertiary,
            modifier = Modifier.padding(start = Spacing.xs)
        )
        PanelCard(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = Spacing.md, vertical = Spacing.xs)
        ) {
            content()
        }
    }
}

@Composable
private fun SettingsRow(
    icon: ImageVector,
    title: String,
    supporting: String? = null,
    chevron: Boolean = false,
    destructive: Boolean = false,
    onClick: (() -> Unit)? = null
) {
    val colors = PanelScan.colors
    val iconTint = if (destructive) colors.destructive else colors.textSecondary
    val titleColor = if (destructive) colors.destructive else colors.textPrimary

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.pressScale(onClick = onClick) else Modifier)
            .padding(vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = iconTint,
            modifier = Modifier.size(20.dp)
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = PanelScan.type.body,
                color = titleColor
            )
            if (supporting != null) {
                Text(
                    text = supporting,
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary
                )
            }
        }
        if (chevron) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.textTertiary,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun SettingsDivider() {
    HorizontalDivider(
        color = PanelScan.colors.border,
        thickness = 1.dp,
        modifier = Modifier.padding(start = 28.dp)
    )
}
