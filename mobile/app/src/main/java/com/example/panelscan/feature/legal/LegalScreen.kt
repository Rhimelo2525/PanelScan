package com.example.panelscan.feature.legal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SecondaryButton

@Composable
fun PrivacyPolicyScreen(
    onNavigateBack: () -> Unit,
    onNavigateToTerms: () -> Unit,
    modifier: Modifier = Modifier
) {
    LegalDocumentView(
        document = LegalContent.privacyPolicy,
        onNavigateBack = onNavigateBack,
        alternateTitle = "Terms of Service",
        onNavigateToAlternate = onNavigateToTerms,
        modifier = modifier
    )
}

@Composable
fun TermsAndConditionsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToPrivacyPolicy: () -> Unit,
    modifier: Modifier = Modifier
) {
    LegalDocumentView(
        document = LegalContent.termsOfService,
        onNavigateBack = onNavigateBack,
        alternateTitle = "Privacy Policy",
        onNavigateToAlternate = onNavigateToPrivacyPolicy,
        modifier = modifier
    )
}

@Composable
private fun LegalDocumentView(
    document: LegalDocument,
    onNavigateBack: () -> Unit,
    alternateTitle: String,
    onNavigateToAlternate: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = document.title,
                subtitle = "Compliance & Legal Information",
                onBack = onNavigateBack
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        bottom = Spacing.xxl
                    ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                // Header Card
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.lg)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Row(
                            modifier = Modifier
                                .clip(PanelScan.shapes.chip)
                                .background(colors.accentSoft)
                                .border(1.dp, colors.accent.copy(alpha = 0.3f), PanelScan.shapes.chip)
                                .padding(horizontal = Spacing.sm, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(Spacing.xxs)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Shield,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = document.eyebrow.uppercase(),
                                style = PanelScan.type.label,
                                color = colors.accent,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(2.dp))

                        Text(
                            text = document.title,
                            style = PanelScan.type.display,
                            color = colors.textPrimary
                        )

                        Text(
                            text = document.introduction,
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )

                        HorizontalDivider(
                            modifier = Modifier.padding(vertical = Spacing.xs),
                            color = colors.border
                        )

                        Text(
                            text = "Last updated: ${document.lastUpdated}",
                            style = PanelScan.type.supporting,
                            color = colors.textTertiary
                        )
                    }
                }

                // Advisory Notice Card
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(PanelScan.shapes.control)
                        .background(colors.surfaceElevated)
                        .border(1.dp, colors.border, PanelScan.shapes.control)
                        .padding(Spacing.md),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Info,
                        contentDescription = null,
                        tint = colors.accent,
                        modifier = Modifier
                            .size(20.dp)
                            .padding(top = 2.dp)
                    )
                    Text(
                        text = document.advisoryNotice,
                        style = PanelScan.type.supporting,
                        color = colors.textSecondary
                    )
                }

                // Document Sections
                document.sections.forEachIndexed { index, section ->
                    PanelCard(
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(Spacing.md)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                            ) {
                                Text(
                                    text = "SECTION ${String.format("%02d", index + 1)}",
                                    style = PanelScan.type.label,
                                    color = colors.accent,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Text(
                                text = section.title,
                                style = PanelScan.type.sectionTitle,
                                color = colors.textPrimary
                            )

                            section.paragraphs.forEach { paragraph ->
                                Text(
                                    text = paragraph,
                                    style = PanelScan.type.body,
                                    color = colors.textSecondary
                                )
                            }

                            if (section.bullets.isNotEmpty()) {
                                Column(
                                    verticalArrangement = Arrangement.spacedBy(Spacing.xs),
                                    modifier = Modifier.padding(start = Spacing.xs, top = Spacing.xxs)
                                ) {
                                    section.bullets.forEach { bullet ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.Top,
                                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .padding(top = 7.dp)
                                                    .size(6.dp)
                                                    .clip(PanelScan.shapes.chip)
                                                    .background(colors.accent)
                                            )
                                            Text(
                                                text = bullet,
                                                style = PanelScan.type.body,
                                                color = colors.textSecondary,
                                                modifier = Modifier.weight(1f)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Cross Navigation to Alternate Legal Page
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(Spacing.xs),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Related Documentation",
                            style = PanelScan.type.label,
                            color = colors.textTertiary
                        )
                        SecondaryButton(
                            text = "View $alternateTitle",
                            icon = Icons.AutoMirrored.Rounded.ArrowForward,
                            onClick = onNavigateToAlternate,
                            fillMaxWidth = true
                        )
                    }
                }
            }
        }
    }
}
