package com.example.panelscan.feature.checkout

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.Order
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.SpecRow
import com.example.panelscan.core.ui.formatCurrency
import com.example.panelscan.data.repository.SavedAddress
import java.util.Calendar

/**
 * Checkout, as on the website: a saved delivery address, optional installation,
 * then "Place order". The order waits for a moderator's approval and shipping
 * quote; products + shipping are then paid in one GCash payment from the order.
 */
@Composable
fun CheckoutScreen(
    viewModel: CheckoutViewModel,
    onBack: () -> Unit,
    onOrderPlaced: (Order) -> Unit,
    onAddAddress: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val state by viewModel.uiState.collectAsState()
    val items by viewModel.checkoutItemsFlow.collectAsState()
    val addresses by viewModel.addresses.collectAsState()
    val colors = PanelScan.colors
    var showConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(viewModel) { viewModel.onCheckoutOpened() }

    val subtotal = items.sumOf { it.lineTotal }
    val selectedAddress = addresses.firstOrNull { it.id == state.selectedAddressId }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize().imePadding()) {
            PanelScanTopBar(
                title = "Checkout",
                subtitle = "${items.size} ${if (items.size == 1) "item" else "items"} · ${items.sumOf { it.quantity }} panels",
                onBack = onBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().clip(PanelScan.shapes.control).background(colors.accentSoft).padding(Spacing.sm),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Icon(Icons.Rounded.Info, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                    Text(
                        "Your order is sent to PanelScan for approval. Once approved, the delivery fee is quoted and you pay products and shipping together in one GCash payment.",
                        style = PanelScan.type.supporting,
                        color = colors.textPrimary
                    )
                }

                state.errorMessage?.let { error ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(PanelScan.shapes.control).background(colors.destructiveSoft).padding(Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                    ) {
                        Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = colors.destructive, modifier = Modifier.size(18.dp))
                        Text(text = error, style = PanelScan.type.supporting, color = colors.destructive)
                    }
                }

                Section(number = 1, title = "Delivery address") {
                    when {
                        state.isLoadingAddresses && addresses.isEmpty() ->
                            Text("Loading your saved addresses…", style = PanelScan.type.supporting, color = colors.textSecondary)
                        state.addressesError != null && addresses.isEmpty() ->
                            Text(state.addressesError!!, style = PanelScan.type.supporting, color = colors.destructive)
                        addresses.isEmpty() ->
                            Text("You have no saved address yet. Add one to continue.", style = PanelScan.type.supporting, color = colors.textSecondary)
                    }
                    addresses.forEach { address ->
                        AddressOption(address, selected = address.id == state.selectedAddressId, onSelect = { viewModel.selectAddress(address.id) })
                    }
                    SecondaryButton(text = "Add new address", icon = Icons.Rounded.Add, onClick = onAddAddress, enabled = !state.isPlacing, fillMaxWidth = true)
                }

                Section(number = 2, title = "Items") {
                    items.forEach { item ->
                        SpecRow(
                            label = "${item.panel.name} × ${item.quantity}",
                            value = item.panel.pricePerUnit?.let { formatCurrency(item.lineTotal) } ?: "—"
                        )
                    }
                    SpecRow(label = "Products total", value = formatCurrency(subtotal))
                    SpecRow(label = "Shipping fee", value = "Quoted after approval")
                }

                Section(number = 3, title = "Installation") {
                    InstallationFields(state, viewModel)
                }

                Section(number = 4, title = "Notes (optional)") {
                    PanelScanTextField(
                        value = state.notes,
                        onValueChange = viewModel::onNotesChange,
                        label = "Notes for PanelScan",
                        placeholder = "Gate code, delivery time, anything we should know",
                        singleLine = false,
                        maxLines = 4,
                        enabled = !state.isPlacing
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surfaceElevated)
                    .navigationBarsPadding()
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
                    .padding(bottom = bottomPadding)
            ) {
                PrimaryButton(
                    text = if (state.isPlacing) "Placing order…" else "Place order · ${formatCurrency(subtotal)}",
                    icon = if (!state.isPlacing) Icons.AutoMirrored.Rounded.ArrowForward else null,
                    onClick = { if (viewModel.validate() == null) showConfirm = true else viewModel.placeOrder(onOrderPlaced) },
                    enabled = !state.isPlacing && items.isNotEmpty(),
                    fillMaxWidth = true
                )
            }
        }
    }

    if (showConfirm) {
        AlertDialog(
            onDismissRequest = { showConfirm = false },
            title = { Text("Place this order?", style = PanelScan.type.sectionTitle) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(
                        "Your order will be sent to PanelScan for approval. Once approved, the delivery fee is quoted and you pay products and shipping together in one GCash payment.",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                    items.forEach { SpecRow(label = it.panel.name, value = "× ${it.quantity}") }
                    SpecRow(label = "Products total", value = formatCurrency(subtotal))
                    SpecRow(label = "Shipping fee", value = "Quoted after approval")
                    selectedAddress?.let { SpecRow(label = "Deliver to", value = it.recipientName) }
                    SpecRow(label = "Installation", value = if (state.wantsInstallation) "Requested" else "Not requested")
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showConfirm = false
                    viewModel.placeOrder(onOrderPlaced)
                }) { Text("Place Order") }
            },
            dismissButton = { TextButton(onClick = { showConfirm = false }) { Text("Cancel") } },
            containerColor = colors.surfaceElevated
        )
    }
}

@Composable
private fun AddressOption(address: SavedAddress, selected: Boolean, onSelect: () -> Unit) {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(PanelScan.shapes.control)
            .border(if (selected) 2.dp else 1.dp, if (selected) colors.accent else colors.border, PanelScan.shapes.control)
            .clickable(onClick = onSelect)
            .padding(Spacing.sm),
        verticalAlignment = Alignment.Top
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Column(modifier = Modifier.weight(1f).padding(start = Spacing.xs), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                listOfNotNull(address.label, if (address.isDefault) "Default" else null).joinToString(" · ").ifBlank { address.recipientName },
                style = PanelScan.type.cardTitle,
                color = colors.textPrimary
            )
            Text("${address.recipientName} · ${address.recipientPhone}", style = PanelScan.type.supporting, color = colors.textSecondary)
            Text(address.formattedAddress, style = PanelScan.type.supporting, color = colors.textSecondary)
        }
    }
}

@Composable
private fun InstallationFields(state: CheckoutUiState, viewModel: CheckoutViewModel) {
    val colors = PanelScan.colors
    val context = LocalContext.current
    val editable = !state.isPlacing

    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = state.wantsInstallation, onCheckedChange = viewModel::onToggleInstallation, enabled = editable)
        Text("Request installation by Disenyo technicians", style = PanelScan.type.body, color = colors.textPrimary)
    }
    if (!state.wantsInstallation) return

    PanelScanTextField(
        value = state.installationDate,
        onValueChange = {},
        label = "Preferred installation date",
        placeholder = "Choose a date",
        readOnly = true,
        enabled = editable,
        errorText = state.installationError
    )
    SecondaryButton(
        text = if (state.installationDate.isBlank()) "Choose date" else "Change date",
        onClick = {
            val tomorrow = Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, 1) }
            DatePickerDialog(
                context,
                { _, year, month, day -> viewModel.onInstallationDateSelected(year, month + 1, day) },
                tomorrow.get(Calendar.YEAR), tomorrow.get(Calendar.MONTH), tomorrow.get(Calendar.DAY_OF_MONTH)
            ).apply { datePicker.minDate = tomorrow.timeInMillis }.show()
        },
        enabled = editable,
        fillMaxWidth = true
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = state.installationSameAsShipping, onCheckedChange = viewModel::onInstallationSameAsShippingChange, enabled = editable)
        Text("Install at the delivery address", style = PanelScan.type.body, color = colors.textPrimary)
    }
    if (!state.installationSameAsShipping) {
        PanelScanTextField(
            value = state.installationAddress,
            onValueChange = viewModel::onInstallationAddressChange,
            label = "Installation address",
            singleLine = false,
            maxLines = 3,
            enabled = editable
        )
    }
    PanelScanTextField(
        value = state.installationNotes,
        onValueChange = viewModel::onInstallationNotesChange,
        label = "Installation notes (optional)",
        singleLine = false,
        maxLines = 3,
        enabled = editable
    )
    Text(
        "The installation team confirms the schedule with you after the order is approved.",
        style = PanelScan.type.label,
        color = colors.textTertiary
    )
}

@Composable
private fun Section(number: Int, title: String, content: @Composable ColumnScope.() -> Unit) {
    val colors = PanelScan.colors
    PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            Box(
                modifier = Modifier.size(24.dp).clip(PanelScan.shapes.chip).background(colors.accentSoft),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "$number", style = PanelScan.type.label, color = colors.accent)
            }
            Text(text = title, style = PanelScan.type.sectionTitle, color = colors.textPrimary)
        }
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm), content = content)
    }
}
