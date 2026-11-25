package com.example.panelscan.core.data

import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.PanelProfile
import com.example.panelscan.core.model.SurfaceType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The live PanelScan catalogue: the active products from the backend, as last
 * loaded by ProductRepository (the same products and prices as the website).
 * Empty until the first load; screens observe [panels] to update when it arrives.
 *
 * For estimation screens, [panelsOrFallbackFor] provides standard PanelScan ceiling
 * and wall panel specifications whenever the live catalogue is still loading or
 * unreachable, so a customer who just finished an AR scan never loses their estimate.
 */
object ProductCatalog {

    private val _panels = MutableStateFlow<List<PVCPanel>>(emptyList())
    val panels: StateFlow<List<PVCPanel>> = _panels.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    private val _hasLoadedFromBackend = MutableStateFlow(false)
    val hasLoadedFromBackend: StateFlow<Boolean> = _hasLoadedFromBackend.asStateFlow()

    /**
     * Standard PanelScan ceiling and wall panel specifications (matching the live catalogue's
     * 25 × 290 × 0.8 cm ceiling panels and 15–20 × 290 cm fluted wall panels) used as a
     * fallback when the backend has not responded yet or has no published panels for a surface.
     */
    val standardFallbackPanels: List<PVCPanel> = listOf(
        PVCPanel(
            id = "dc7ab415-4869-45af-8fcd-9e329012ee32",
            name = "PVC Ceiling Spandrel",
            category = "Ceiling Panels",
            widthMeters = 0.25,
            heightMeters = 2.90,
            textureResource = "gloss_white",
            finish = "PVC Spandrel",
            description = "Standard 25 × 290 cm interlocking PVC ceiling spandrel panel tiled across large and small ceilings.",
            inStock = true,
            sku = "CP-001",
            material = "PVC",
            thicknessMm = 8,
            profile = PanelProfile.SPANDREL,
            grooveCount = 2
        ),
        PVCPanel(
            id = "a60538dc-a094-4675-9110-ee4fa8ac77d1",
            name = "PVC Ceiling Spandrel (Wood Series)",
            category = "Ceiling Panels",
            widthMeters = 0.25,
            heightMeters = 2.90,
            textureResource = "wood_oak",
            finish = "Wood Grain PVC",
            description = "Standard 25 × 290 cm wood-grain PVC ceiling spandrel panel.",
            inStock = true,
            sku = "CP-002",
            material = "Wood Series PVC",
            thicknessMm = 8,
            profile = PanelProfile.SPANDREL,
            grooveCount = 2
        ),
        PVCPanel(
            id = "3727b5f3-94fa-4cef-b141-85f503757cce",
            name = "PVC Seamless Ceiling Panel",
            category = "Ceiling Panels",
            widthMeters = 0.25,
            heightMeters = 2.90,
            textureResource = "gloss_white",
            finish = "Seamless Flat PVC",
            description = "Standard 25 × 290 cm flat seamless PVC ceiling panel.",
            inStock = true,
            sku = "CP-003",
            material = "PVC",
            thicknessMm = 8,
            profile = PanelProfile.FLAT,
            grooveCount = 0
        ),
        PVCPanel(
            id = "29f3d179-26f6-4fd6-aaff-8929456f0b8b",
            name = "WPC Fluted 5in1",
            category = "Wall Panels",
            widthMeters = 0.20,
            heightMeters = 2.90,
            textureResource = "wood_oak",
            finish = "WPC Fluted",
            description = "Standard 20 × 290 cm 5-groove fluted WPC wall panel.",
            inStock = true,
            sku = "WP-001",
            material = "WPC",
            thicknessMm = 20,
            profile = PanelProfile.FLUTED,
            grooveCount = 5
        ),
        PVCPanel(
            id = "824e9037-9101-4683-9756-9b432743a4db",
            name = "WPC Fluted 6in1",
            category = "Wall Panels",
            widthMeters = 0.17,
            heightMeters = 2.90,
            textureResource = "wood_oak",
            finish = "WPC Fluted",
            description = "Standard 17 × 290 cm 6-groove fluted WPC wall panel.",
            inStock = true,
            sku = "WP-002",
            material = "WPC",
            thicknessMm = 18,
            profile = PanelProfile.FLUTED,
            grooveCount = 6
        )
    )

    val allPanels: List<PVCPanel> get() = _panels.value

    val wallPanels: List<PVCPanel> get() = panelsFor(SurfaceType.WALL)

    val ceilingPanels: List<PVCPanel> get() = panelsFor(SurfaceType.CEILING)

    fun panelsFor(surfaceType: SurfaceType): List<PVCPanel> = panelsFor(allPanels, surfaceType)

    fun panelsFor(panels: List<PVCPanel>, surfaceType: SurfaceType): List<PVCPanel> =
        panels.filter { it.surfaceType == surfaceType }

    fun fallbackPanelsFor(surfaceType: SurfaceType): List<PVCPanel> =
        standardFallbackPanels.filter { it.surfaceType == surfaceType }

    /**
     * Returns live backend panels for [surfaceType] when available, or standard PanelScan
     * fallback panels for [surfaceType] so estimation and 3D tiling always work even during
     * cold starts, network hiccups, or empty categories.
     */
    fun panelsOrFallbackFor(panels: List<PVCPanel>, surfaceType: SurfaceType): List<PVCPanel> =
        panelsFor(panels, surfaceType).ifEmpty { fallbackPanelsFor(surfaceType) }

    fun findById(id: String): PVCPanel? =
        allPanels.firstOrNull { it.id == id } ?: standardFallbackPanels.firstOrNull { it.id == id }

    /** Replaces the catalogue with a fresh load from the backend. */
    fun replace(panels: List<PVCPanel>) {
        _panels.value = panels
        _lastError.value = null
        _hasLoadedFromBackend.value = panels.isNotEmpty()
    }

    fun recordError(message: String?) {
        _lastError.value = message
    }
}
