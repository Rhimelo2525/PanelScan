package com.example.panelscan.feature.products

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.IconAffordance
import com.example.panelscan.core.ui.PanelScanChip
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ProductCard
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.data.repository.ProductRepository
import com.example.panelscan.data.repository.Resource

enum class CatalogFilter(val label: String) {
    All("All panels"),
    Wall("Wall"),
    Ceiling("Ceiling")
}

@Composable
fun ProductsScreen(
    productRepository: ProductRepository,
    sessionState: CustomerSessionState,
    onOpenProduct: (PVCPanel) -> Unit,
    modifier: Modifier = Modifier,
    initialFilter: CatalogFilter = CatalogFilter.All,
    onOpenCart: () -> Unit = {},
    bottomPadding: Dp = 0.dp
) {
    var filter by remember { mutableStateOf(initialFilter) }
    var refreshTrigger by remember { mutableStateOf(0) }
    var isRefreshing by remember { mutableStateOf(false) }

    // Start with all panels from repository cache
    val cachedPanels by productRepository.panels.collectAsState(initial = productRepository.getAllPanels())
    var displayedPanels by remember { mutableStateOf(cachedPanels) }

    val showPrice = com.example.panelscan.core.ui.PriceVisibility.isPriceVisible(sessionState)

    LaunchedEffect(refreshTrigger) {
        productRepository.fetchProducts().collect { resource ->
            when (resource) {
                is Resource.Loading -> {
                    isRefreshing = true
                    if (resource.cachedData != null) displayedPanels = resource.cachedData
                }
                is Resource.Success -> {
                    isRefreshing = false
                    displayedPanels = resource.data
                }
                is Resource.Error -> {
                    isRefreshing = false
                    if (resource.cachedData != null) displayedPanels = resource.cachedData
                }
            }
        }
    }

    val filteredPanels = remember(displayedPanels, filter) {
        when (filter) {
            CatalogFilter.All -> displayedPanels
            CatalogFilter.Wall -> displayedPanels.filter { it.surfaceType == SurfaceType.WALL }
            CatalogFilter.Ceiling -> displayedPanels.filter { it.surfaceType == SurfaceType.CEILING }
        }
    }

    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Panels",
                subtitle = "PVC cladding for walls and ceilings",
                large = true,
                actions = {
                    IconAffordance(onClick = onOpenCart) {
                        Icon(
                            imageVector = Icons.Rounded.ShoppingCart,
                            contentDescription = "Cart",
                            tint = PanelScan.colors.textPrimary,
                            modifier = Modifier.padding(2.dp)
                        )
                    }
                    IconAffordance(onClick = { refreshTrigger++ }) {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = "Refresh catalogue",
                            tint = PanelScan.colors.textPrimary,
                            modifier = Modifier.padding(2.dp)
                        )
                    }
                }
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.gutter, vertical = Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                CatalogFilter.entries.forEach { option ->
                    PanelScanChip(
                        text = option.label,
                        selected = filter == option,
                        onClick = { filter = option }
                    )
                }
            }

            if (filteredPanels.isEmpty()) {
                EmptyState(
                    icon = Icons.Rounded.GridView,
                    title = "No panels found",
                    description = "There are no published panels matching this category.",
                    actionLabel = "View all panels",
                    onAction = { filter = CatalogFilter.All }
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        top = Spacing.xxs,
                        bottom = bottomPadding + Spacing.xl
                    ),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "count") {
                        Text(
                            text = "${filteredPanels.size} ${if (filteredPanels.size == 1) "product" else "products"}" +
                                if (!showPrice) " · Log in to view pricing" else "",
                            style = PanelScan.type.supporting,
                            color = PanelScan.colors.textTertiary,
                            modifier = Modifier.padding(bottom = Spacing.xxs)
                        )
                    }
                    items(filteredPanels, key = { it.id }) { panel ->
                        ProductCard(
                            panel = panel,
                            onClick = { onOpenProduct(panel) },
                            showPrice = showPrice,
                            modifier = Modifier.animateItem()
                        )
                    }
                }
            }
        }
    }
}
