package com.example.panelscan.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing

/**
 * Standard Philippine Mobile Phone input component.
 * Features a fixed non-editable "+63 |" prefix, 10-digit limit, and standardized placeholder.
 */
@Composable
fun PhilippinePhoneField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String = "Contact Phone",
    placeholder: String = "9123456789",
    errorText: String? = null,
    enabled: Boolean = true,
    imeAction: ImeAction = ImeAction.Next,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.xxs)
    ) {
        Text(
            text = label,
            style = PanelScan.type.label,
            color = if (errorText != null) colors.destructive else colors.textSecondary
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(PanelScan.shapes.control)
                .background(if (enabled) colors.surface else colors.surfaceMuted)
                .border(
                    width = 1.dp,
                    color = when {
                        errorText != null -> colors.destructive
                        else -> colors.border
                    },
                    shape = PanelScan.shapes.control
                )
                .padding(horizontal = Spacing.sm, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            // Fixed Country Code Prefix (+63 |)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "🇵🇭 +63",
                    style = PanelScan.type.cardTitle,
                    color = colors.textPrimary,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "|",
                    style = PanelScan.type.cardTitle,
                    color = colors.borderStrong,
                    modifier = Modifier.padding(horizontal = 6.dp)
                )
            }

            BasicTextField(
                value = value,
                onValueChange = { input ->
                    val cleanDigits = input.filter { it.isDigit() }.take(10)
                    onValueChange(cleanDigits)
                },
                enabled = enabled,
                singleLine = true,
                textStyle = PanelScan.type.cardTitle.copy(color = colors.textPrimary),
                cursorBrush = SolidColor(colors.accent),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = imeAction
                ),
                decorationBox = { innerTextField ->
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            style = PanelScan.type.body,
                            color = colors.textTertiary
                        )
                    }
                    innerTextField()
                },
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 2.dp)
            )
        }

        if (errorText != null) {
            Text(
                text = errorText,
                style = PanelScan.type.supporting,
                color = colors.destructive,
                modifier = Modifier.padding(start = 4.dp)
            )
        }
    }
}
