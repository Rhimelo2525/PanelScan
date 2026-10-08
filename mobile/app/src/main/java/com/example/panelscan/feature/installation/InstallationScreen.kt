package com.example.panelscan.feature.installation

import android.app.DatePickerDialog
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.Engineering
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import com.example.panelscan.core.model.OrderStatus
import androidx.compose.material3.IconButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.InstallationBooking
import com.example.panelscan.core.model.InstallationStatus
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.pressScale
import java.util.Calendar

@Composable
fun InstallationScreen(
    viewModel: InstallationViewModel,
    onBack: () -> Unit,
    /** Opened from an order's page: prefills that order's address. */
    initialOrderId: String? = null,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val state by viewModel.uiState.collectAsState()
    val bookings by viewModel.bookings.collectAsState()
    val orders by viewModel.orders.collectAsState()
    val colors = PanelScan.colors
    val context = LocalContext.current

    LaunchedEffect(initialOrderId) { viewModel.onOpened(initialOrderId) }

    if (state.isConfirming) {
        AlertDialog(
            onDismissRequest = viewModel::dismissConfirm,
            title = { Text("Submit this installation request?", style = PanelScan.type.sectionTitle) },
            text = {
                Text(
                    "The PanelScan team will review it and confirm your schedule.\n\n" +
                        "Preferred date: ${state.scheduledDate}\n${state.preferredTime}\nAddress: ${state.address.trim()}",
                    style = PanelScan.type.body
                )
            },
            confirmButton = { TextButton(onClick = { viewModel.submitRequest() }) { Text("Submit request") } },
            dismissButton = { TextButton(onClick = viewModel::dismissConfirm) { Text("Cancel") } },
            containerColor = colors.surfaceElevated
        )
    }

    if (state.cancellingBookingId != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissCancel,
            title = { Text("Cancel this installation request?", style = PanelScan.type.sectionTitle) },
            text = { Text("This can't be undone. You can send a new request afterwards.", style = PanelScan.type.body) },
            confirmButton = {
                TextButton(onClick = viewModel::cancelBooking) { Text("Cancel request", color = colors.destructive) }
            },
            dismissButton = { TextButton(onClick = viewModel::dismissCancel) { Text("Keep request") } },
            containerColor = colors.surfaceElevated
        )
    }

    val hasQualifyingOrder = orders.any { it.status != OrderStatus.CANCELLED }

    val openDatePicker = {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, 1) // Minimum date is tomorrow
        val minMillis = cal.timeInMillis

        val parts = state.scheduledDate.split('-')
        val initialYear = parts.getOrNull(0)?.toIntOrNull() ?: cal.get(Calendar.YEAR)
        val initialMonth = (parts.getOrNull(1)?.toIntOrNull() ?: (cal.get(Calendar.MONTH) + 1)) - 1
        val initialDay = parts.getOrNull(2)?.toIntOrNull() ?: cal.get(Calendar.DAY_OF_MONTH)

        val dialog = DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                viewModel.onDateSelected(year, month + 1, dayOfMonth)
            },
            initialYear,
            initialMonth,
            initialDay
        )
        dialog.datePicker.minDate = minMillis
        dialog.show()
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Installation Services",
                subtitle = "By Disenyo Interior Solution",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        top = Spacing.xs,
                        bottom = bottomPadding + Spacing.xl
                    ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                // Service explanation card
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Engineering,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(22.dp)
                            )
                            Text(
                                text = "Professional Fitting Guarantee",
                                style = PanelScan.type.sectionTitle,
                                color = colors.textPrimary
                            )
                        }
                        Text(
                            text = "Disenyo Interior Solution provides end-to-end installation for all PVC wall and ceiling panels. Our installers handle surface preparation, tongue-and-groove alignment, edge trims, and neat finishing cuts.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )
                    }
                }

                state.successMessage?.let { success ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .background(colors.accentSoft)
                            .padding(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = success,
                            style = PanelScan.type.supporting,
                            color = colors.textPrimary
                        )
                    }
                }

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

                if (!state.isLoading && !hasQualifyingOrder) {
                    PanelCard(
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(Spacing.md)
                    ) {
                        Text(
                            text = "You need to complete an order before requesting installation.",
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                    }
                }

                // Request form
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text(
                            text = "Request Installation Schedule",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )

                        // Preferred Date
                        PanelScanTextField(
                            value = state.scheduledDate,
                            onValueChange = {},
                            label = "Preferred Installation Date",
                            placeholder = "Select date (min. tomorrow)",
                            leadingIcon = Icons.Rounded.CalendarToday,
                            trailingIcon = {
                                IconButton(onClick = openDatePicker) {
                                    Icon(
                                        imageVector = Icons.Rounded.DateRange,
                                        contentDescription = "Choose Date",
                                        tint = colors.accent,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            },
                            readOnly = true,
                            modifier = Modifier.pressScale(onClick = openDatePicker)
                        )

                        // Preferred Time Window
                        Text(
                            text = "Preferred Time Window",
                            style = PanelScan.type.label,
                            color = colors.textTertiary,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                        val timeSlots = listOf(
                            "Morning (9:00 AM - 12:00 PM)",
                            "Afternoon (1:00 PM - 5:00 PM)"
                        )
                        timeSlots.forEach { slot ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(PanelScan.shapes.controlCompact)
                                    .clickable { viewModel.onTimeSelected(slot) }
                                    .padding(vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                            ) {
                                RadioButton(
                                    selected = state.preferredTime == slot,
                                    onClick = { viewModel.onTimeSelected(slot) },
                                    colors = RadioButtonDefaults.colors(selectedColor = colors.accent)
                                )
                                Icon(
                                    imageVector = Icons.Rounded.Schedule,
                                    contentDescription = null,
                                    tint = if (state.preferredTime == slot) colors.accent else colors.textSecondary,
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    text = slot,
                                    style = PanelScan.type.body,
                                    color = colors.textPrimary
                                )
                            }
                        }

                        // Address
                        PanelScanTextField(
                            value = state.address,
                            onValueChange = viewModel::onAddressChange,
                            label = "Installation Address",
                            placeholder = "Unit / House No., Street, Barangay, City",
                            leadingIcon = Icons.Rounded.LocationOn,
                            singleLine = false,
                            maxLines = 3
                        )

                        // Optional Notes
                        PanelScanTextField(
                            value = state.notes,
                            onValueChange = viewModel::onNotesChange,
                            label = "Installation Notes (optional)",
                            placeholder = "Room type, wall condition (concrete/drywall), parking or gate pass details",
                            singleLine = false,
                            maxLines = 3
                        )

                        PrimaryButton(
                            text = if (state.isSubmitting) "Submitting Request…" else "Submit Installation Request",
                            icon = Icons.Rounded.Build,
                            onClick = viewModel::requestSubmit,
                            enabled = !state.isSubmitting && !state.isLoading,
                            fillMaxWidth = true,
                            modifier = Modifier.padding(top = Spacing.xxs)
                        )
                    }
                }

                // Existing Bookings Section
                if (bookings.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(
                            text = "Your Installation Requests",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary,
                            modifier = Modifier.fillMaxWidth(),
                            softWrap = true
                        )

                        bookings.forEach { booking ->
                            BookingCard(
                                booking = booking,
                                onCancel = { viewModel.askCancel(booking.id) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BookingCard(
    booking: InstallationBooking,
    onCancel: () -> Unit
) {
    val colors = PanelScan.colors
    val tone = when (booking.status) {
        InstallationStatus.COMPLETED -> BadgeTone.Success
        InstallationStatus.APPROVED, InstallationStatus.SCHEDULED -> BadgeTone.Accent
        InstallationStatus.PENDING -> BadgeTone.Warning
        InstallationStatus.CANCELLED -> BadgeTone.Neutral
    }

    PanelCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(Spacing.md)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Schedule: ${booking.scheduledDate}",
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary,
                    modifier = Modifier.weight(1f, fill = false).padding(end = Spacing.xs)
                )
                StatusBadge(text = booking.status.label, tone = tone)
            }

            SpecRow(label = "Time Window", value = booking.preferredTime)
            SpecRow(label = "Location", value = booking.address)
            booking.orderNumber?.let {
                SpecRow(label = "Linked Order", value = "#$it")
            }
            booking.installerName?.let { name ->
                SpecRow(label = "Assigned Installer", value = name, valueColor = colors.accent)
            }
            booking.installerSpecialty?.let { spec ->
                SpecRow(label = "Specialty", value = spec)
            }
            booking.notes?.let {
                SpecRow(label = "Notes", value = it)
            }

            if (booking.status == InstallationStatus.PENDING) {
                SecondaryButton(
                    text = "Cancel Request",
                    onClick = onCancel,
                    fillMaxWidth = true,
                    modifier = Modifier.padding(top = Spacing.xxs)
                )
            }
        }
    }
}
