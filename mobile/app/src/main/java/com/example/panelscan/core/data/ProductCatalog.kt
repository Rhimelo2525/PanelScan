package com.example.panelscan.core.data

import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SurfaceType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The live PanelScan catalogue: the active products from the backend, as last
 * loaded by ProductRepository (the same products and prices as the website).
 * Empty until the first load; screens observe [panels] to update when it arrives.
 */
object ProductCatalog {

    private val _panels = MutableStateFlow<List<PVCPanel>>(emptyList())
    val panels: StateFlow<List<PVCPanel>> = _panels.asStateFlow()

    val allPanels: List<PVCPanel> get() = _panels.value

    val wallPanels: List<PVCPanel> get() = panelsFor(SurfaceType.WALL)

    val ceilingPanels: List<PVCPanel> get() = panelsFor(SurfaceType.CEILING)

    fun panelsFor(surfaceType: SurfaceType): List<PVCPanel> = panelsFor(allPanels, surfaceType)

    fun panelsFor(panels: List<PVCPanel>, surfaceType: SurfaceType): List<PVCPanel> =
        panels.filter { it.surfaceType == surfaceType }

    fun findById(id: String): PVCPanel? = allPanels.firstOrNull { it.id == id }

    /** Replaces the catalogue with a fresh load from the backend. */
    fun replace(panels: List<PVCPanel>) {
        _panels.value = panels
    }
}
