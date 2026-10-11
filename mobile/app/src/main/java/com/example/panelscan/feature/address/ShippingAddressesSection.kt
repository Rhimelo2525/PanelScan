package com.example.panelscan.feature.address

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddLocationAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import com.example.panelscan.core.ui.BadgeTone
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.SecondaryButton
import com.example.panelscan.core.ui.StatusBadge
import com.example.panelscan.data.repository.AddressRepository
import com.example.panelscan.data.repository.SavedAddress
import kotlinx.coroutines.launch

/**
 * Profile "Shipping addresses", as on the website: the customer's saved delivery
 * destinations, chosen from at checkout. Adding and editing open the address form.
 */
@Composable
fun ShippingAddressesSection(
    addressRepository: AddressRepository,
    /** "Address saved" / "Address updated" after the form, shown once. */
    notice: String?,
    onNoticeShown: () -> Unit,
    onAddAddress: () -> Unit,
    onEditAddress: (SavedAddress) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    val scope = rememberCoroutineScope()
    val addresses by addressRepository.addresses.collectAsState()
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var pendingDelete by remember { mutableStateOf<SavedAddress?>(null) }
    // Text and whether it is good news.
    var message by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    fun load() {
        scope.launch {
            loading = true
            loadError = addressRepository.refresh()
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }
    LaunchedEffect(notice) {
        if (notice != null) {
            message = notice to true
            onNoticeShown()
        }
    }

    PanelCard(modifier = modifier.fillMaxWidth(), contentPadding = PaddingValues(Spacing.md)) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text("Shipping addresses", style = PanelScan.type.sectionTitle, color = colors.textPrimary)
            Text(
                "Save where you'd like deliveries to go, then just choose one at checkout.",
                style = PanelScan.type.supporting,
                color = colors.textSecondary
            )
            if (addresses.isNotEmpty()) {
                SecondaryButton(text = "Add new address", icon = Icons.Rounded.AddLocationAlt, onClick = onAddAddress, fillMaxWidth = false)
            }

            message?.let { (text, good) -> Notice(text, good) }

            when {
                loading && addresses.isEmpty() -> Text("Loading your saved addresses…", style = PanelScan.type.supporting, color = colors.textSecondary)
                loadError != null && addresses.isEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Notice("Your saved addresses could not be loaded.", good = false)
                    SecondaryButton(text = "Try again", onClick = ::load, fillMaxWidth = false)
                }
                addresses.isEmpty() -> Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(PanelScan.shapes.control)
                        .border(1.dp, colors.border, PanelScan.shapes.control)
                        .background(colors.surfaceMuted)
                        .padding(Spacing.md),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                ) {
                    Text("No shipping address saved yet.", style = PanelScan.type.cardTitle, color = colors.textPrimary)
                    Text(
                        "Pin your location on the map once, and checkout will be a single tap from then on.",
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                    PrimaryButton(text = "Add shipping address", icon = Icons.Rounded.AddLocationAlt, onClick = onAddAddress, fillMaxWidth = false)
                }
                else -> addresses.forEach { address ->
                    AddressCard(
                        address = address,
                        busy = busyId == address.id,
                        onSetDefault = {
                            busyId = address.id
                            scope.launch {
                                val error = addressRepository.setDefault(address.id)
                                message = if (error == null) "${address.label?.ifBlank { null } ?: "Address"} is now your default" to true
                                else "Default address not changed. $error" to false
                                busyId = null
                            }
                        },
                        onEdit = { onEditAddress(address) },
                        onDelete = { pendingDelete = address }
                    )
                }
            }
        }
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { if (busyId == null) pendingDelete = null },
            containerColor = colors.surface,
            shape = PanelScan.shapes.card,
            title = { Text("Delete this address?", style = PanelScan.type.sectionTitle) },
            text = {
                Text(
                    "${target.formattedAddress} will be removed from your saved addresses. " +
                        "Orders you've already placed keep the address they were delivered to.",
                    style = PanelScan.type.body,
                    color = colors.textSecondary
                )
            },
            confirmButton = {
                TextButton(
                    enabled = busyId == null,
                    onClick = {
                        busyId = target.id
                        scope.launch {
                            val error = addressRepository.delete(target.id)
                            message = if (error == null) "Address deleted" to true else "Address not deleted. $error" to false
                            busyId = null
                            pendingDelete = null
                        }
                    }
                ) { Text("Delete address", style = PanelScan.type.button, color = colors.destructive) }
            },
            dismissButton = {
                TextButton(enabled = busyId == null, onClick = { pendingDelete = null }) {
                    Text("Keep address", style = PanelScan.type.button, color = colors.textSecondary)
                }
            }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddressCard(
    address: SavedAddress,
    busy: Boolean,
    onSetDefault: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val colors = PanelScan.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(PanelScan.shapes.control)
            .border(1.dp, if (address.isDefault) colors.accent.copy(alpha = 0.4f) else colors.border, PanelScan.shapes.control)
            .background(if (address.isDefault) colors.accentSoft.copy(alpha = 0.35f) else colors.surface)
            .padding(Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Text(address.label?.ifBlank { null } ?: "Shipping address", style = PanelScan.type.cardTitle, color = colors.textPrimary)
            if (address.isDefault) StatusBadge(text = "DEFAULT", tone = BadgeTone.Neutral)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Rounded.LocationOn, contentDescription = null, tint = colors.accent, modifier = Modifier.padding(top = 2.dp).size(16.dp))
            Text(address.formattedAddress, style = PanelScan.type.body, color = colors.textPrimary)
        }
        Text(
            "${address.recipientName} · ${formatPhilippinePhone(address.recipientPhone)}",
            style = PanelScan.type.supporting,
            color = colors.textSecondary
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            if (!address.isDefault) {
                SecondaryButton(text = "Set as default", icon = Icons.Rounded.Star, onClick = onSetDefault, enabled = !busy, fillMaxWidth = false)
            }
            SecondaryButton(text = "Edit", icon = Icons.Rounded.Edit, onClick = onEdit, enabled = !busy, fillMaxWidth = false)
            SecondaryButton(text = "Delete", icon = Icons.Rounded.Delete, onClick = onDelete, enabled = !busy, fillMaxWidth = false, destructive = true)
        }
    }
}

@Composable
private fun Notice(text: String, good: Boolean) {
    val colors = PanelScan.colors
    val tint = if (good) colors.success else colors.destructive
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(PanelScan.shapes.control)
            .background(if (good) colors.successSoft else colors.destructiveSoft)
            .padding(Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Icon(if (good) Icons.Rounded.Check else Icons.Rounded.ErrorOutline, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        Text(text, style = PanelScan.type.supporting, color = tint)
    }
}

/** "+639603052318" reads as "+63 960 305 2318", as on the website. */
internal fun formatPhilippinePhone(phone: String): String {
    val digits = phone.filter { it.isDigit() }
    if (digits.length != 12 || !digits.startsWith("63")) return phone
    return "+63 ${digits.substring(2, 5)} ${digits.substring(5, 8)} ${digits.substring(8)}"
}
