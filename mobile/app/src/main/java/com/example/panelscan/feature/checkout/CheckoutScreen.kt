package com.example.panelscan.feature.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PinDrop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.panelscan.core.data.PhilippineAddress
import com.example.panelscan.core.delivery.DeliveryBookingState
import com.example.panelscan.core.delivery.DeliveryCoordinationStatus
import com.example.panelscan.core.delivery.DeliveryQuoteState
import com.example.panelscan.core.delivery.DeliveryVehicle
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.location.LocationSource
import com.example.panelscan.core.model.CartItem
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.payment.PaymentState
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PhilippinePhoneField
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.core.ui.formatCurrency
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun CheckoutScreen(
    viewModel: CheckoutViewModel,
    onBack: () -> Unit,
    onOrderPlaced: (Order) -> Unit,
    onPickExactLocation: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val state by viewModel.uiState.collectAsState()
    val items by viewModel.checkoutItemsFlow.collectAsState()
    val colors = PanelScan.colors

    LaunchedEffect(viewModel) { viewModel.onCheckoutOpened() }

    val subtotal = items.sumOf { it.lineTotal }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Checkout",
                subtitle = "${items.size} selected ${if (items.size == 1) "item" else "items"} · ${items.sumOf { it.quantity }} panels",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Notice(
                    text = "When submitted, your order request is saved locally. A moderator will coordinate delivery and confirm " +
                        "any fees. GCash is not connected, so no payment is taken here."
                )

                state.errorMessage?.takeUnless { it.startsWith("Location selected.") }?.let { error ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(PanelScan.shapes.control)
                            .background(colors.destructiveSoft)
                            .padding(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = colors.destructive, modifier = Modifier.size(18.dp))
                        Text(text = error, style = PanelScan.type.supporting, color = colors.destructive)
                    }
                }

                ExactLocationSection(state, viewModel, onPickExactLocation)
                AddressDetailsSection(state, viewModel)
                RecipientSection(state, viewModel)
                PaymentSection()
                OrderSummarySection(state, items, subtotal, viewModel)

                Spacer(modifier = Modifier.height(Spacing.sm))
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surfaceElevated)
                    .border(1.dp, colors.border, RectangleShape)
                    .navigationBarsPadding()
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                    .padding(bottom = bottomPadding),
                verticalArrangement = Arrangement.spacedBy(Spacing.xxs)
            ) {
                Text(
                    text = "Materials subtotal only. Delivery and installation costs are pending confirmation.",
                    style = PanelScan.type.label,
                    color = colors.textSecondary
                )
                PrimaryButton(
                    text = if (state.isLoading) "Saving request…" else "Save order request · ${formatCurrency(subtotal)}",
                    icon = if (!state.isLoading) Icons.AutoMirrored.Rounded.ArrowForward else null,
                    onClick = { viewModel.placeOrder(onOrderPlaced) },
                    enabled = !state.isLoading && items.isNotEmpty(),
                    fillMaxWidth = true
                )
            }
        }
    }
}

// ------------------------------------------------------------------ sections

@Composable
private fun Section(
    number: Int,
    title: String,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val colors = PanelScan.colors
    PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(PanelScan.shapes.chip)
                    .background(colors.accentSoft),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "$number", style = PanelScan.type.label, color = colors.accent)
            }
            Text(
                text = title,
                style = PanelScan.type.sectionTitle,
                color = colors.textPrimary,
                modifier = Modifier.weight(1f)
            )
            trailing?.invoke()
        }
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm), content = content)
    }
}

@Composable
private fun AddressDetailsSection(state: CheckoutUiState, viewModel: CheckoutViewModel) {
    val editable = !state.isLoading
    val colors = PanelScan.colors
    Section(number = 2, title = "Address details") {
        Text(
            "Confirming a pin updates the detected address fields. Add your house or unit number afterward and correct anything that's off.",
            style = PanelScan.type.supporting,
            color = colors.textSecondary
        )
        state.errorMessage?.takeIf { it.startsWith("Location selected.") }?.let { message ->
            Text(text = message, style = PanelScan.type.supporting, color = colors.warning)
        }
        PanelScanTextField(
            value = state.street,
            onValueChange = viewModel::onStreetChange,
            label = "Street, building, or unit",
            placeholder = "House / Unit / Block / Lot, Building name, Street",
            leadingIcon = Icons.Rounded.LocationOn,
            singleLine = false,
            maxLines = 2,
            enabled = editable
        )
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Box(Modifier.weight(1f)) {
                AddressDropdown(
                    label = "Region",
                    selected = state.region,
                    placeholder = "Select region",
                    options = PhilippineAddress.regions.map { it.name },
                    onSelect = viewModel::onRegionSelected,
                    enabled = editable
                )
            }
            Box(Modifier.weight(1f)) {
                AddressDropdown(
                    label = "Province",
                    selected = state.province,
                    placeholder = if (state.region.isBlank()) "Select region first" else "Select province",
                    options = if (state.region.isBlank()) emptyList() else {
                        val code = PhilippineAddress.regions.firstOrNull { it.name == state.region }?.code.orEmpty()
                        PhilippineAddress.provincesFor(code)
                    },
                    onSelect = viewModel::onProvinceSelected,
                    enabled = editable && state.region.isNotBlank()
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Box(Modifier.weight(1f)) {
                AddressDropdown(
                    label = "City or municipality",
                    selected = state.city,
                    placeholder = if (state.province.isBlank()) "Select province first" else "Select city",
                    options = if (state.province.isBlank()) emptyList() else PhilippineAddress.citiesFor(state.province),
                    onSelect = viewModel::onCitySelected,
                    enabled = editable && state.province.isNotBlank()
                )
            }
            Box(Modifier.weight(1f)) {
                AddressDropdown(
                    label = "Barangay",
                    selected = state.barangay,
                    placeholder = if (state.city.isBlank()) "Select city first" else "Select barangay",
                    options = if (state.city.isBlank()) emptyList() else PhilippineAddress.barangaysFor(state.city),
                    onSelect = viewModel::onBarangaySelected,
                    enabled = editable && state.city.isNotBlank()
                )
            }
        }
        PanelScanTextField(
            value = state.postalCode,
            onValueChange = viewModel::onPostalCodeChange,
            label = "Postal code",
            placeholder = "4-digit postal code",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            enabled = editable
        )
        Text(
            "Your latest checkout details are saved on this device for next time.",
            style = PanelScan.type.supporting,
            color = colors.textTertiary
        )
    }
}

@Composable
private fun RecipientSection(state: CheckoutUiState, viewModel: CheckoutViewModel) {
    val editable = !state.isLoading
    Section(number = 3, title = "Recipient") {
        PanelScanTextField(
            value = state.fullName,
            onValueChange = viewModel::onFullNameChange,
            label = "Recipient full name",
            placeholder = "Juan Dela Cruz",
            leadingIcon = Icons.Rounded.Person,
            enabled = editable
        )
        PhilippinePhoneField(
            value = state.phone,
            onValueChange = viewModel::onPhoneChange,
            label = "Contact number",
            errorText = if (state.errorMessage?.contains("phone", ignoreCase = true) == true ||
                state.errorMessage?.contains("contact number", ignoreCase = true) == true
            ) state.errorMessage else null,
            enabled = editable
        )
        PanelScanTextField(
            value = state.orderNotes,
            onValueChange = viewModel::onOrderNotesChange,
            label = "Order notes (optional)",
            placeholder = "For example: call before delivery or ask about access.",
            singleLine = false,
            maxLines = 3,
            enabled = editable
        )
    }
}

@Composable
private fun ExactLocationSection(state: CheckoutUiState, viewModel: CheckoutViewModel, onPick: () -> Unit) {
    val colors = PanelScan.colors
    val location = state.exactLocation
    Section(
        number = 1,
        title = "Exact delivery location",
        trailing = {
            StatusBadge(
                text = if (location != null) "Pinned" else "Recommended",
                tone = if (location != null) BadgeTone.Success else BadgeTone.Accent
            )
        }
    ) {
        Text(
            "Pin your exact delivery spot on the map. We'll fill in the address from it when lookup is available.",
            style = PanelScan.type.supporting,
            color = colors.textSecondary
        )
        CheckoutMapPreview(location = location, enabled = !state.deliveryLocked, onOpenPicker = onPick)
        Text(
            "Tap the map to open the picker. There, tap or drag the pin to your exact door or gate, or use your current location.",
            style = PanelScan.type.supporting,
            color = colors.textSecondary
        )
        if (location == null) {
            SecondaryButton(
                text = "Pin location or use current location",
                icon = Icons.Rounded.PinDrop,
                onClick = onPick,
                enabled = !state.deliveryLocked
            )
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs), verticalAlignment = Alignment.Top) {
                Icon(Icons.Rounded.PinDrop, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = location.addressLine ?: state.formattedAddress.ifBlank { "Pinned location" },
                        style = PanelScan.type.cardTitle,
                        color = colors.textPrimary
                    )
                    Text(
                        text = if (location.source == LocationSource.CURRENT_LOCATION) "From your current location" else "Pinned on the map",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                }
            }
            SpecRow(label = "Latitude", value = location.latitudeText)
            SpecRow(label = "Longitude", value = location.longitudeText)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                SecondaryButton(
                    text = "Change pin",
                    onClick = onPick,
                    enabled = !state.deliveryLocked,
                    fillMaxWidth = false
                )
                TextButton(onClick = viewModel::onExactLocationCleared, enabled = !state.deliveryLocked) {
                    Text("Remove", color = colors.textSecondary)
                }
            }
        }
    }
}

@Composable
private fun PaymentSection() {
    val colors = PanelScan.colors
    Section(number = 4, title = "Payment", trailing = {
        StatusBadge(text = "Pending", tone = BadgeTone.Neutral, showDot = true)
    }) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(PanelScan.shapes.control)
                .background(colors.accentSoft)
                .padding(Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Icon(Icons.Rounded.Payments, contentDescription = null, tint = colors.accent, modifier = Modifier.size(24.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("GCash", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                Text("The planned payment method for this order.", style = PanelScan.type.supporting, color = colors.textSecondary)
            }
        }
        Text(
            "GCash integration is not connected. Payment remains pending until a real provider confirms it.",
            style = PanelScan.type.supporting,
            color = colors.textSecondary
        )
    }
}

@Composable
private fun OrderSummarySection(
    state: CheckoutUiState,
    items: List<CartItem>,
    subtotal: Double,
    viewModel: CheckoutViewModel
) {
    val colors = PanelScan.colors
    Section(number = 5, title = "Order summary") {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
            items.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(
                        text = "${item.quantity}× ${item.panel.name}",
                        style = PanelScan.type.body,
                        color = colors.textSecondary,
                        modifier = Modifier.weight(1f)
                    )
                    Text(text = formatCurrency(item.lineTotal), style = PanelScan.type.body, color = colors.textPrimary)
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(PanelScan.shapes.control)
                .clickable { viewModel.onToggleInstallation(!state.hasInstallation) },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = state.hasInstallation,
                onCheckedChange = viewModel::onToggleInstallation,
                colors = CheckboxDefaults.colors(checkedColor = colors.accent, checkmarkColor = colors.accentContrast)
            )
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                    Icon(Icons.Rounded.Build, contentDescription = null, tint = colors.accent, modifier = Modifier.size(14.dp))
                    Text("Add professional installation", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                }
                Text(
                    "Request professional installation. Price and scheduling will be confirmed later.",
                    style = PanelScan.type.supporting,
                    color = colors.textSecondary
                )
            }
        }

        HorizontalDivider(color = colors.border)
        SpecRow(label = "Delivery fee", value = "To be confirmed")
        if (state.hasInstallation) SpecRow(label = "Installation", value = "To be confirmed")
        HorizontalDivider(color = colors.border)
        SpecRow(label = "Materials subtotal", value = formatCurrency(subtotal), emphasised = true)
    }
}

@Composable
private fun Notice(text: String) {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(PanelScan.shapes.control)
            .background(colors.surfaceMuted)
            .border(1.dp, colors.border, PanelScan.shapes.control)
            .padding(Spacing.sm),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Icon(Icons.Rounded.Info, contentDescription = null, tint = colors.accent, modifier = Modifier.size(16.dp))
        Text(text = text, style = PanelScan.type.supporting, color = colors.textSecondary)
    }
}

private fun timeOf(millis: Long): String = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(millis))

/**
 * A tappable row that opens an AlertDialog picker for a single address field.
 * Disabled and shows placeholder text when [enabled] is false.
 */
@Composable
private fun AddressDropdown(
    label: String,
    selected: String,
    placeholder: String,
    options: List<String>,
    onSelect: (String) -> Unit,
    enabled: Boolean = true
) {
    val colors = PanelScan.colors
    var showDialog by remember { mutableStateOf(false) }
    var manualValue by remember(showDialog) { mutableStateOf(selected) }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = PanelScan.type.label,
            color = if (enabled) colors.textSecondary else colors.textTertiary
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(PanelScan.shapes.control)
                .border(
                    width = 1.dp,
                    color = if (!enabled) colors.border.copy(alpha = 0.5f) else colors.border,
                    shape = PanelScan.shapes.control
                )
                .background(if (enabled) colors.surface else colors.surfaceMuted)
                .then(
                    if (enabled) Modifier.clickable { showDialog = true } else Modifier
                )
                .padding(horizontal = Spacing.sm, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = selected.ifBlank { placeholder },
                style = PanelScan.type.body,
                color = if (selected.isBlank()) colors.textTertiary else colors.textPrimary,
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = Icons.Rounded.KeyboardArrowDown,
                contentDescription = null,
                tint = if (enabled) colors.textSecondary else colors.textTertiary,
                modifier = Modifier.size(20.dp)
            )
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text(text = "Select $label", style = PanelScan.type.sectionTitle) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    PanelScanTextField(
                        value = manualValue,
                        onValueChange = { manualValue = it },
                        label = "Or enter $label manually",
                        placeholder = label
                    )
                    LazyColumn(modifier = Modifier.heightIn(max = 280.dp)) {
                        items(options) { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onSelect(option)
                                    showDialog = false
                                }
                                .padding(vertical = 12.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = option,
                                style = PanelScan.type.body,
                                color = if (option == selected) colors.accent else colors.textPrimary,
                                modifier = Modifier.weight(1f)
                            )
                            if (option == selected) {
                                Icon(
                                    imageVector = Icons.Rounded.Home,
                                    contentDescription = null,
                                    tint = colors.accent,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        HorizontalDivider(color = colors.border)
                        }
                    }
                }
            },
            confirmButton = {
                Row {
                    TextButton(onClick = { showDialog = false }) { Text("Cancel") }
                    TextButton(
                        onClick = {
                            onSelect(manualValue.trim())
                            showDialog = false
                        },
                        enabled = manualValue.isNotBlank()
                    ) { Text("Use entered") }
                }
            },
            containerColor = colors.surfaceElevated
        )
    }
}
