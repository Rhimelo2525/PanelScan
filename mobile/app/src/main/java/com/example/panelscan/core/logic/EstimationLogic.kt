package com.example.panelscan.core.logic

import com.example.panelscan.core.model.Estimation
import com.example.panelscan.core.model.PVCPanel
import kotlin.math.ceil

object EstimationLogic {

    /** Waste allowances offered on the estimation result; 10% is the trade default. */
    val WASTE_OPTIONS = listOf(0, 5, 10, 15)
    const val DEFAULT_WASTE_PERCENT = 10

    /** Standard ceiling panel dimensions (25 cm × 290 cm) used if a product record is missing dimensions. */
    private const val DEFAULT_PANEL_WIDTH_M = 0.25
    private const val DEFAULT_PANEL_HEIGHT_M = 2.90

    /** Columns × rows of whole-or-cut panels needed to lay out the surface, for the 3D preview. */
    fun layout(width: Double, height: Double, panel: PVCPanel): Pair<Int, Int> {
        if (!width.isFinite() || !height.isFinite() || width <= 0 || height <= 0) return 0 to 0
        val panelW = panel.widthMeters.takeIf { it.isFinite() && it > 0.0 } ?: DEFAULT_PANEL_WIDTH_M
        val panelH = panel.heightMeters.takeIf { it.isFinite() && it > 0.0 } ?: DEFAULT_PANEL_HEIGHT_M
        // Tolerance so 3.0 / 0.6 stays 5 columns despite floating point; tiles multiple standard panels across any large surface.
        val columns = ceilTolerant(width / panelW).coerceAtLeast(1)
        val rows = ceilTolerant(height / panelH).coerceAtLeast(1)
        return columns to rows
    }

    fun calculateEstimation(
        width: Double,
        height: Double,
        panel: PVCPanel,
        wastePercent: Int = 10
    ): Estimation {
        if (!width.isFinite() || !height.isFinite() || width <= 0 || height <= 0) {
            return Estimation(0.0, panel.areaSquareMeters.takeIf { it.isFinite() && it > 0.0 } ?: 0.0, 0, wastePercent, 0, null)
        }

        val surfaceArea = width * height
        if (!surfaceArea.isFinite() || surfaceArea <= 0.0) {
            return Estimation(0.0, 0.0, 0, wastePercent, 0, null)
        }
        val panelArea = panel.areaSquareMeters.takeIf { it.isFinite() && it > 0.0 }

        if (panelArea == null) {
            return Estimation(surfaceArea, 0.0, 0, wastePercent, 0, null)
        }

        // Measured and catalogue sizes are decimal metres that binary floating point cannot
        // represent exactly: 3.6 × 2.4 / (0.6 × 1.2) evaluates to 12.000000000000002, and a
        // bare ceil() would order a 13th panel. Allow a tiny tolerance before rounding up.
        val baseQuantity = ceilTolerant(surfaceArea / panelArea).coerceAtLeast(1)

        // Ensure wastePercent is non-negative
        val safeWastePercent = if (wastePercent < 0) 0 else wastePercent

        // Long arithmetic prevents 32-bit Int overflow when estimating very large ceilings or halls.
        val finalQuantity = (((baseQuantity.toLong() * (100L + safeWastePercent)) + 99L) / 100L)
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()
        
        val estimatedCost = panel.pricePerUnit?.takeIf { it.isFinite() }?.let { it * finalQuantity }

        return Estimation(
            surfaceArea = surfaceArea,
            panelArea = panelArea,
            baseQuantity = baseQuantity,
            wastePercent = safeWastePercent,
            finalQuantity = finalQuantity,
            estimatedCost = estimatedCost
        )
    }

    private fun ceilTolerant(value: Double): Int {
        if (!value.isFinite() || value <= 0.0) return 0
        val c = ceil(value - 1e-9)
        return if (c >= Int.MAX_VALUE.toDouble()) Int.MAX_VALUE else c.toInt()
    }
}
