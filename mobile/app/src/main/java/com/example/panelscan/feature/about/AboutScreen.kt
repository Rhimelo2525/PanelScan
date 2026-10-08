package com.example.panelscan.feature.about

import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.panelscan.R
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ScreenScaffold

@Composable
fun AboutScreen(
    onNavigateBack: () -> Unit,
    onNavigateToProducts: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "About Disenyo",
                onBack = onNavigateBack
            )

            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        bottom = Spacing.xxl
                    ),
                verticalArrangement = Arrangement.spacedBy(Spacing.lg)
            ) {
                // Brand Header Section
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.lg)
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
                                    .size(48.dp)
                                    .clip(PanelScan.shapes.controlCompact)
                                    .border(1.dp, colors.border, PanelScan.shapes.controlCompact)
                            )
                            Column {
                                Text(
                                    text = "iDISENYO INTERIOR SOLUTIONS",
                                    style = PanelScan.type.label,
                                    color = colors.accent,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "PanelScan Platform",
                                    style = PanelScan.type.supporting,
                                    color = colors.textSecondary
                                )
                            }
                        }

                        Text(
                            text = "PVC panelling, supplied and fitted.",
                            style = PanelScan.type.title,
                            color = colors.textPrimary,
                            modifier = Modifier.padding(top = Spacing.xs)
                        )

                        Text(
                            text = "iDISENYO Interior Solutions supplies PVC wall and ceiling panels and provides installation services. PanelScan brings product browsing, ordering, measurement, estimation, and project preview together in one place.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )
                    }
                }

                // What We Do
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text(
                            text = "What we do",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )

                        Text(
                            text = "Disenyo Interior Solution supplies and installs PVC wall panels and PVC ceiling panels for interior finishing work. Panels are fixed over existing walls and ceilings, which keeps installation quick and avoids the mess of wet trades.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )

                        Text(
                            text = "PanelScan supports the customer journey with:\n\n" +
                                "• E-commerce for browsing panel products and placing local demo orders.\n" +
                                "• Installation service requests.\n" +
                                "• AR scanning and measuring for walls and ceilings.\n" +
                                "• Material quantity and cost estimation.\n" +
                                "• A 3D project preview based on the measured surface and selected panel.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )
                    }
                }

                // Mission Section
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(
                            text = "Mission",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "To provide quality and stylish interior finishing solutions that help customers improve their spaces through reliable PVC wall and ceiling panels, professional service, and convenient ordering.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )
                    }
                }

                // Vision Section
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(
                            text = "Vision",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "To become a trusted provider of modern interior solutions by offering dependable products, convenient services, and an easier way for customers to plan and improve their interior spaces.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )
                    }
                }

                // Core Values Section
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text(
                            text = "Core Values",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )

                        CoreValueItem(
                            title = "Quality",
                            description = "We aim to provide reliable products and workmanship that meet the needs of our customers."
                        )

                        CoreValueItem(
                            title = "Customer Service",
                            description = "We listen to our customers and provide clear, helpful, and responsive assistance."
                        )

                        CoreValueItem(
                            title = "Reliability",
                            description = "We value dependable service, accurate information, and responsible handling of every order and project."
                        )

                        CoreValueItem(
                            title = "Continuous Improvement",
                            description = "We continue improving our products, services, processes, and customer experience."
                        )
                    }
                }

                // Business Background Section
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(
                            text = "Business Background",
                            style = PanelScan.type.sectionTitle,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "iDISENYO Interior Solutions provides PVC wall panels and PVC ceiling panels for interior finishing applications. The business helps customers improve residential and commercial spaces through the supply of interior panel products and installation services. PanelScan is its digital platform for product browsing, e-commerce, AR scanning and measuring, estimation, 3D project preview, ordering, and installation requests.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary
                        )
                    }
                }

                // Contact Section
                PanelCard(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(Spacing.md)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Business,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = "Contact Information",
                                style = PanelScan.type.sectionTitle,
                                color = colors.textPrimary
                            )
                        }

                        ContactItem(
                            icon = Icons.Rounded.LocationOn,
                            text = "iDISENYO Interior Solutions - 1 M. Villarica Rd, San Jose Del Monte City, Bulacan, Philippines , 3023"
                        )
                        ContactItem(
                            icon = Icons.Rounded.Phone,
                            text = "0968 687 6753"
                        )
                        ContactItem(
                            icon = Icons.Rounded.Email,
                            text = "idisenyo.interiors2024@gmail.com"
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CoreValueItem(
    title: String,
    description: String
) {
    val colors = PanelScan.colors
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = title,
            style = PanelScan.type.cardTitle,
            color = colors.accent
        )
        Text(
            text = description,
            style = PanelScan.type.body,
            color = colors.textSecondary
        )
    }
}

@Composable
private fun ContactItem(
    icon: ImageVector,
    text: String
) {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = colors.textTertiary,
            modifier = Modifier.size(18.dp)
        )
        Text(
            text = text,
            style = PanelScan.type.supporting,
            color = colors.textSecondary,
            modifier = Modifier.weight(1f)
        )
    }
}
