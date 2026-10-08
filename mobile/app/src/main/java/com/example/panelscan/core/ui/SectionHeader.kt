package com.example.panelscan.core.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.example.panelscan.core.design.PanelScan

@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    actionLabel: String? = null,
    onActionClick: (() -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = PanelScan.type.sectionTitle,
                color = PanelScan.colors.textPrimary
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = PanelScan.type.supporting,
                    color = PanelScan.colors.textSecondary
                )
            }
        }
        if (actionLabel != null && onActionClick != null) {
            TertiaryButton(text = actionLabel, onClick = onActionClick)
        }
    }
}
