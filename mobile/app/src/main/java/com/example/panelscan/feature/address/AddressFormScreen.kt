package com.example.panelscan.feature.address

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.PinDrop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PhilippinePhoneField
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.data.repository.Place
import com.example.panelscan.data.repository.SavedAddress

/** Add a saved delivery address: map pin first, then the address the backend read off it, checked by the customer. */
@Composable
fun AddressFormScreen(
    viewModel: AddressFormViewModel,
    onPickLocation: () -> Unit,
    onSaved: (SavedAddress) -> Unit,
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    val colors = PanelScan.colors
    val editable = !state.isSaving

    ScreenScaffold {
        Column(modifier = Modifier.fillMaxSize().imePadding()) {
            PanelScanTopBar(title = "Add delivery address", subtitle = "Saved to your account, also on the website", onBack = onBack)

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
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

                PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text("1. Pin your location", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
                        Text(
                            "The rider goes to this exact spot. We fill in the address from your pin; you check it below.",
                            style = PanelScan.type.supporting,
                            color = colors.textSecondary
                        )
                        state.pin?.let { pin ->
                            Text(
                                String.format(java.util.Locale.US, "Pinned at %.5f, %.5f", pin.latitude, pin.longitude),
                                style = PanelScan.type.supporting,
                                color = colors.textPrimary
                            )
                        }
                        state.pinNotice?.let { Text(it, style = PanelScan.type.supporting, color = colors.accent) }
                        SecondaryButton(
                            text = if (state.pin == null) "Pin location on map" else "Move pin",
                            icon = Icons.Rounded.PinDrop,
                            onClick = onPickLocation,
                            enabled = editable,
                            fillMaxWidth = true
                        )
                    }
                }

                PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text("2. Address", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
                        PanelScanTextField(
                            value = state.addressLine1,
                            onValueChange = viewModel::onAddressLineChange,
                            label = "House / unit, building, street",
                            placeholder = "Unit 4B, 12 Mabini St.",
                            errorText = state.fieldErrors["addressLine1"],
                            enabled = editable
                        )
                        PlacePicker("Region", state.region, state.regions, viewModel::onRegionSelected, editable)
                        if (state.needsProvince) {
                            PlacePicker("Province", state.province, state.provinces, viewModel::onProvinceSelected, editable && state.region != null)
                        }
                        PlacePicker(
                            "City / Municipality", state.city, state.cities, viewModel::onCitySelected,
                            editable && state.region != null && (!state.needsProvince || state.province != null)
                        )
                        PlacePicker("Barangay", state.barangay, state.barangays, viewModel::onBarangaySelected, editable && state.city != null)
                        PanelScanTextField(
                            value = state.postalCode,
                            onValueChange = viewModel::onPostalCodeChange,
                            label = "Postal code",
                            placeholder = "1100",
                            errorText = state.fieldErrors["postalCode"],
                            enabled = editable,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                        )
                    }
                }

                PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text("3. Recipient", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
                        PanelScanTextField(
                            value = state.recipientName,
                            onValueChange = viewModel::onRecipientNameChange,
                            label = "Recipient name",
                            errorText = state.fieldErrors["recipientName"],
                            enabled = editable
                        )
                        PhilippinePhoneField(
                            value = state.recipientPhone,
                            onValueChange = viewModel::onRecipientPhoneChange,
                            label = "Recipient mobile number",
                            errorText = state.fieldErrors["recipientPhone"],
                            enabled = editable
                        )
                        PanelScanTextField(
                            value = state.label,
                            onValueChange = viewModel::onLabelChange,
                            label = "Label (optional)",
                            placeholder = "Home, Office…",
                            enabled = editable
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = state.isDefault, onCheckedChange = viewModel::onDefaultChange, enabled = editable)
                            Text("Use as my default address", style = PanelScan.type.body, color = colors.textPrimary)
                        }
                    }
                }
            }

            Column(
                modifier = Modifier.fillMaxWidth().background(colors.surfaceElevated).navigationBarsPadding()
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm)
            ) {
                PrimaryButton(
                    text = if (state.isSaving) "Saving…" else "Save address",
                    onClick = { viewModel.save(onSaved) },
                    enabled = editable,
                    fillMaxWidth = true
                )
            }
        }
    }
}

/** A field that opens a searchable list of official places. */
@Composable
private fun PlacePicker(
    label: String,
    selected: Place?,
    options: List<Place>,
    onSelect: (Place) -> Unit,
    enabled: Boolean
) {
    val colors = PanelScan.colors
    var open by remember { mutableStateOf(false) }
    var query by remember(open) { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = PanelScan.type.label, color = if (enabled) colors.textSecondary else colors.textTertiary)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(PanelScan.shapes.control)
                .border(1.dp, colors.border, PanelScan.shapes.control)
                .background(if (enabled) colors.surface else colors.surfaceMuted)
                .then(if (enabled) Modifier.clickable { open = true } else Modifier)
                .padding(horizontal = Spacing.sm, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = selected?.name ?: "Select ${label.lowercase()}",
                style = PanelScan.type.body,
                color = if (selected == null) colors.textTertiary else colors.textPrimary,
                modifier = Modifier.weight(1f)
            )
            Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = null, tint = colors.textSecondary, modifier = Modifier.size(20.dp))
        }
    }

    if (open) {
        val shown = options.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("Select ${label.lowercase()}", style = PanelScan.type.sectionTitle) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    PanelScanTextField(value = query, onValueChange = { query = it }, label = "Search", placeholder = label)
                    if (options.isEmpty()) {
                        Text("Loading…", style = PanelScan.type.supporting, color = colors.textSecondary)
                    }
                    LazyColumn(modifier = Modifier.heightIn(max = 320.dp)) {
                        items(shown, key = { it.code }) { place ->
                            Text(
                                text = place.name,
                                style = PanelScan.type.body,
                                color = if (place.code == selected?.code) colors.accent else colors.textPrimary,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        onSelect(place)
                                        open = false
                                    }
                                    .padding(vertical = 12.dp, horizontal = 4.dp)
                            )
                            HorizontalDivider(color = colors.border)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
            containerColor = colors.surfaceElevated
        )
    }
}
