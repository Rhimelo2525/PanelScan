package com.example.panelscan.feature.projects

import com.example.panelscan.TestPanels
import com.example.panelscan.core.model.Estimation
import com.example.panelscan.core.model.MeasurementResult
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.model.SurfaceType
import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectShareTest {

    private val panel = TestPanels.wallPanels.first()

    private fun project(estimatedCost: Double?) = SavedProject(
        id = "app-1",
        name = "Wall · 3.20 × 2.60 m",
        measurement = MeasurementResult(3.2, 2.6, 8.32, SurfaceType.WALL),
        selectedPanel = panel,
        estimation = Estimation(surfaceArea = 8.32, panelArea = 1.44, baseQuantity = 6, wastePercent = 10, finalQuantity = 7, estimatedCost = estimatedCost),
        createdAt = 1_000L
    )

    @Test
    fun `the message carries the code, the estimate and the note, as the website sends it`() {
        assertEquals(
            "Project shared: PRJ-2026-1A2B3C4D\n" +
                "Wall · 3.20 × 2.60 m · 7 × ${panel.name} · Est. ₱12,950.00\n\n" +
                "Will these fit?",
            projectShareMessage("PRJ-2026-1A2B3C4D", project(12950.0), "  Will these fit?  ")
        )
    }

    @Test
    fun `without a saved cost it uses the panel price, and a blank note adds nothing`() {
        assertEquals(
            "Project shared: PRJ-2026-1A2B3C4D\nWall · 3.20 × 2.60 m · 7 × ${panel.name} · Est. ₱12,950.00",
            projectShareMessage("PRJ-2026-1A2B3C4D", project(null), "   ")
        )
    }

    @Test
    fun `project codes are found anywhere in a message, in any letter case`() {
        val text = "See prj-2026-a6b41ce1 and PRJ-2026-8757806B, not PRJ-12."
        assertEquals(
            listOf("prj-2026-a6b41ce1", "PRJ-2026-8757806B"),
            PROJECT_CODE_IN_TEXT.findAll(text).map { it.value }.toList()
        )
    }
}
