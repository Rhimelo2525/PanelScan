package com.example.panelscan.feature.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.RateReview
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material.icons.rounded.ViewInAr
import androidx.compose.material.icons.rounded.Calculate
import androidx.compose.material.icons.rounded.CenterFocusStrong
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.panelscan.R
import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.ui.ArchitecturalHeroVisual
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelTexture
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.RecentProjectCard
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.core.ui.SectionHeader
import com.example.panelscan.core.ui.IconAffordance
import com.example.panelscan.core.ui.panelSurface
import com.example.panelscan.core.ui.pressScale

/**
 * The storefront. Header, hero, category shortcuts, recent work, customer services, then the explanation of
 * why the AR workflow exists — the same reading order as the website's landing page.
 */
@Composable
fun HomeScreen(
    recentProjects: List<SavedProject>,
    onStartMeasurement: () -> Unit,
    onOpenCategory: (SurfaceType) -> Unit,
    onOpenProject: (SavedProject) -> Unit,
    onOpenAccount: () -> Unit,
    onSeeAllProjects: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenCart: () -> Unit = {},
    onOpenInstallation: () -> Unit = {},
    onOpenOrders: () -> Unit = {},
    onOpenChat: () -> Unit = {},
    onOpenFeedback: () -> Unit = {},
    onOpenAbout: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    unreadNotifications: Int = 0,
    bottomPadding: androidx.compose.ui.unit.Dp = 0.dp
) {
    val colors = PanelScan.colors
    val catalogue by ProductCatalog.panels.collectAsState()

    ScreenScaffold(modifier = modifier) {
        LazyColumn(
            contentPadding = PaddingValues(
                start = Spacing.gutter,
                end = Spacing.gutter,
                bottom = bottomPadding + Spacing.xl
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.xl)
        ) {
            item {
                HomeHeader(
                    onOpenAccount = onOpenAccount,
                    onOpenCart = onOpenCart,
                    onOpenNotifications = onOpenNotifications,
                    unreadNotifications = unreadNotifications
                )
            }

            item { HeroCard(onStartMeasurement = onStartMeasurement) }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    SectionHeader(
                        title = "Shop by category",
                        subtitle = "Two ranges, measured and estimated the same way"
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        CategoryShortcut(
                            title = "Wall Panels",
                            supporting = "${ProductCatalog.panelsFor(catalogue, SurfaceType.WALL).size} finishes",
                            textureResource = "slate_grey",
                            imageResId = R.drawable.cat_wall_panels,
                            modifier = Modifier.weight(1f),
                            onClick = { onOpenCategory(SurfaceType.WALL) }
                        )
                        CategoryShortcut(
                            title = "Ceiling Panels",
                            supporting = "${ProductCatalog.panelsFor(catalogue, SurfaceType.CEILING).size} finishes",
                            textureResource = "gloss_white",
                            imageResId = R.drawable.cat_ceiling_panels,
                            modifier = Modifier.weight(1f),
                            onClick = { onOpenCategory(SurfaceType.CEILING) }
                        )
                    }
                }
            }

            item {
                CustomerServicesSection(
                    onOpenInstallation = onOpenInstallation,
                    onOpenOrders = onOpenOrders,
                    onOpenChat = onOpenChat,
                    onOpenProjects = onSeeAllProjects,
                    onOpenFeedback = onOpenFeedback,
                    onOpenAbout = onOpenAbout
                )
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    SectionHeader(
                        title = "Recent projects",
                        actionLabel = if (recentProjects.isNotEmpty()) "See all" else null,
                        onActionClick = if (recentProjects.isNotEmpty()) onSeeAllProjects else null
                    )
                    if (recentProjects.isEmpty()) {
                        PanelCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(0.dp)) {
                            EmptyState(
                                icon = Icons.Rounded.Straighten,
                                title = "No projects yet",
                                description = "Measure a wall or ceiling and your saved estimate will appear here.",
                                actionLabel = "Start measuring",
                                onAction = onStartMeasurement
                            )
                        }
                    } else {
                        LazyRow(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                        ) {
                            items(recentProjects, key = { it.id }) { project ->
                                RecentProjectCard(
                                    project = project,
                                    onClick = { onOpenProject(project) }
                                )
                            }
                        }
                    }
                }
            }

            item { WhyMobileArCard() }

            item {
                Text(
                    text = "Estimates are a planning guide. Confirm quantities against the " +
                        "supplier's coverage figures before ordering.",
                    style = PanelScan.type.supporting,
                    color = colors.textTertiary
                )
            }
        }
    }
}

@Composable
private fun HomeHeader(
    onOpenAccount: () -> Unit,
    onOpenCart: () -> Unit,
    onOpenNotifications: () -> Unit,
    unreadNotifications: Int
) {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(top = Spacing.md, bottom = Spacing.xxs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Image(
            painter = painterResource(id = R.drawable.panelscan_logo),
            contentDescription = "PanelScan Logo",
            modifier = Modifier
                .size(46.dp)
                .clip(RoundedCornerShape(12.dp))
                .border(1.dp, colors.border, RoundedCornerShape(12.dp))
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "PanelScan",
                style = PanelScan.type.display,
                color = colors.textPrimary
            )
            Text(
                text = "PVC wall and ceiling panels, measured in your own room.",
                style = PanelScan.type.supporting,
                color = colors.textSecondary
            )
        }
        Box {
            IconAffordance(onClick = onOpenNotifications) {
                Icon(
                    imageVector = Icons.Rounded.Notifications,
                    contentDescription = "Notifications, $unreadNotifications unread",
                    tint = colors.textPrimary,
                    modifier = Modifier.padding(2.dp)
                )
            }
            if (unreadNotifications > 0) {
                Text(
                    text = unreadNotifications.coerceAtMost(99).toString(),
                    style = PanelScan.type.label,
                    color = colors.accentContrast,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 3.dp, y = (-3).dp)
                        .clip(RoundedCornerShape(50))
                        .background(colors.accent)
                        .padding(horizontal = 4.dp)
                )
            }
        }
        IconAffordance(onClick = onOpenCart) {
            Icon(
                imageVector = Icons.Rounded.ShoppingCart,
                contentDescription = "Cart",
                tint = colors.textPrimary,
                modifier = Modifier.padding(2.dp)
            )
        }
        IconAffordance(onClick = onOpenAccount) {
            Icon(
                imageVector = Icons.Rounded.Person,
                contentDescription = "Account",
                tint = colors.textPrimary,
                modifier = Modifier.padding(2.dp)
            )
        }
    }
}

@Composable
private fun HeroCard(onStartMeasurement: () -> Unit) {
    val colors = PanelScan.colors
    PanelCard(
        modifier = Modifier.fillMaxWidth(),
        shape = PanelScan.shapes.hero,
        elevation = 2.dp,
        contentPadding = PaddingValues(Spacing.xs)
    ) {
        Image(
            painter = painterResource(id = R.drawable.hero_fluted_interior),
            contentDescription = "PanelScan Fluted Interior",
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(PanelScan.shapes.cardCompact)
        )
        Column(
            modifier = Modifier.padding(
                start = Spacing.sm, end = Spacing.sm, top = Spacing.md, bottom = Spacing.xs
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            Text(
                text = "Measure the room, not the guesswork",
                style = PanelScan.type.title,
                color = colors.textPrimary
            )
            Text(
                text = "Scan a wall or ceiling with your camera, get the area in seconds, " +
                    "then see exactly how many panels the job takes.",
                style = PanelScan.type.body,
                color = colors.textSecondary
            )
            PrimaryButton(
                text = "Start Measurement",
                icon = Icons.Rounded.Straighten,
                onClick = onStartMeasurement,
                modifier = Modifier.padding(top = Spacing.xs)
            )
        }
    }
}

@Composable
private fun CategoryShortcut(
    title: String,
    supporting: String,
    textureResource: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    imageResId: Int? = null
) {
    val colors = PanelScan.colors
    Column(
        modifier = modifier
            .panelSurface(shape = PanelScan.shapes.card)
            .pressScale(onClick = onClick)
    ) {
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f)) {
            if (imageResId != null) {
                Image(
                    painter = painterResource(id = imageResId),
                    contentDescription = title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f)
                )
            } else {
                PanelTexture(
                    textureResource = textureResource,
                    modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(0.dp)
                )
            }
        }
        Column(modifier = Modifier.padding(Spacing.sm)) {
            Text(
                text = title,
                style = PanelScan.type.cardTitle,
                color = colors.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(text = supporting, style = PanelScan.type.supporting, color = colors.textSecondary)
        }
    }
}

@Composable
private fun WhyMobileArCard() {
    val colors = PanelScan.colors
    // Not a card. Home already stacks three of them, and a fourth turns the page into a
    // list of identical rounded rectangles. This section sits directly on the page with a
    // rule above it, so the rhythm breaks and the eye gets somewhere to rest.
    Column {
        HorizontalDivider(color = colors.border)
        Text(
            text = "Why measure on your phone",
            style = PanelScan.type.sectionTitle,
            color = colors.textPrimary,
            modifier = Modifier.padding(top = Spacing.md)
        )
        Text(
            text = "A tape measure gives you a number. PanelScan turns it into a panel " +
                "count, a cost and a preview — before you buy anything.",
            style = PanelScan.type.body,
            color = colors.textSecondary,
            modifier = Modifier.padding(top = Spacing.xxs, bottom = Spacing.xs)
        )
        Image(
            painter = painterResource(id = R.drawable.img_panel_installation),
            contentDescription = "PanelScan Panel Installation",
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .height(148.dp)
                .padding(bottom = Spacing.md)
                .clip(PanelScan.shapes.card)
        )
        WorkflowStep(
            index = "01",
            title = "Measure",
            description = "Point the camera at the surface and mark its corners."
        )
        WorkflowStep(
            index = "02",
            title = "Estimate",
            description = "Panels, waste allowance and cost are worked out for you."
        )
        WorkflowStep(
            index = "03",
            title = "Visualise",
            description = "Preview the finish on the measured surface in 3D.",
            last = true
        )
    }
}

@Composable
private fun WorkflowStep(
    index: String,
    title: String,
    description: String,
    last: Boolean = false
) {
    val colors = PanelScan.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = if (last) 0.dp else Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text(
            text = index,
            style = PanelScan.type.label,
            color = colors.accent,
            modifier = Modifier.padding(top = 3.dp)
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = PanelScan.type.cardTitle, color = colors.textPrimary)
            Text(text = description, style = PanelScan.type.supporting, color = colors.textSecondary)
        }
    }
}

@Composable
private fun CustomerServicesSection(
    onOpenInstallation: () -> Unit,
    onOpenOrders: () -> Unit,
    onOpenChat: () -> Unit,
    onOpenProjects: () -> Unit,
    onOpenFeedback: () -> Unit,
    onOpenAbout: () -> Unit
) {
    val colors = PanelScan.colors
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        SectionHeader(
            title = "Dashboard",
            subtitle = "Installation, order tracking and direct support"
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            ServiceQuickTile(
                icon = Icons.Rounded.Build,
                title = "Installation",
                subtitle = "Request fitting",
                onClick = onOpenInstallation,
                modifier = Modifier.weight(1f)
            )
            ServiceQuickTile(
                icon = Icons.Rounded.LocalShipping,
                title = "My Orders",
                subtitle = "Live tracking",
                onClick = onOpenOrders,
                modifier = Modifier.weight(1f)
            )
            ServiceQuickTile(
                icon = Icons.Rounded.Chat,
                title = "Live Chat",
                subtitle = "Consultants",
                onClick = onOpenChat,
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            ServiceQuickTile(
                icon = Icons.Rounded.ViewInAr,
                title = "Projects",
                subtitle = "Saved rooms",
                onClick = onOpenProjects,
                modifier = Modifier.weight(1f)
            )
            ServiceQuickTile(
                icon = Icons.Rounded.RateReview,
                title = "Reviews",
                subtitle = "Verified feedback",
                onClick = onOpenFeedback,
                modifier = Modifier.weight(1f)
            )
            ServiceQuickTile(
                icon = Icons.Rounded.Info,
                title = "About Us",
                subtitle = "Disenyo Solution",
                onClick = onOpenAbout,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun ServiceQuickTile(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = PanelScan.colors
    Column(
        modifier = modifier
            .panelSurface(shape = PanelScan.shapes.cardCompact)
            .pressScale(onClick = onClick)
            .padding(Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = colors.accent,
            modifier = Modifier.size(20.dp)
        )
        Text(
            text = title,
            style = PanelScan.type.cardTitle,
            color = colors.textPrimary,
            maxLines = 1
        )
        Text(
            text = subtitle,
            style = PanelScan.type.supporting,
            color = colors.textSecondary,
            maxLines = 1
        )
    }
}
