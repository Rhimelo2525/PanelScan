package com.example.panelscan.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.panelscan.core.design.PanelScan

/**
 * 6-box input for an emailed 6-digit code.
 */
@Composable
fun OtpCodeBoxInput(
    code: String,
    onCodeChange: (String) -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center
    ) {
        // Invisible input taking actual keypresses
        BasicTextField(
            value = code,
            onValueChange = onCodeChange,
            enabled = enabled,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done
            ),
            modifier = Modifier.matchParentSize().clip(PanelScan.shapes.control)
        )

        // Visual 6 digit boxes
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            (0 until 6).forEach { index ->
                val char = code.getOrNull(index)?.toString() ?: ""
                val isFocused = code.length == index
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.surfaceElevated)
                        .border(
                            width = if (isFocused) 2.dp else 1.dp,
                            color = if (isFocused) colors.accent else colors.border,
                            shape = RoundedCornerShape(8.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = char,
                        style = PanelScan.type.display.copy(fontSize = 22.sp),
                        color = colors.textPrimary,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
