package com.example.panelscan.core.logic

import com.example.panelscan.core.model.Estimation
import com.example.panelscan.core.model.PVCPanel
import kotlin.math.ceil

object EstimationLogic {

    /** Waste allowances offered on the estimation result; 10% is the trade default. */
    val WASTE_OPTIONS = listOf(0, 5, 10, 15)
    const val DEFAULT_WASTE_PERCENT = 10

    /** Columns × rows of whole-or-cut panels needed to lay out the surface, for the 3D preview. */
    fun layout(width: Double, height: Double, panel: PVCPanel): Pair<Int, Int> {
        if (width <= 0 || height <= 0 || panel.widthMeters <= 0 || panel.heightMeters <= 0) return 0 to 0
        // Tolerance so 3.0 / 0.6 stays 5 columns despite floating point.
        val columns = ceilTolerant(width / panel.widthMeters)
        val rows = ceilTolerant(height / panel.heightMeters)
        return columns to rows
    }

    fun calculateEstimation(
        width: Double,
        height: Double,
        panel: PVCPanel,
        wastePercent: Int = 10
    ): Estimation {
        if (width <= 0 || height <= 0) {
            return Estimation(0.0, panel.areaSquareMeters, 0, wastePercent, 0, null)
        }

        val surfaceArea = width * height
        val panelArea = panel.areaSquareMeters

        if (panelArea <= 0) {
            return Estimation(surfaceArea, 0.0, 0, wastePercent, 0, null)
        }

        // Measured and catalogue sizes are decimal metres that binary floating point cannot
        // represent exactly: 3.6 × 2.4 / (0.6 × 1.2) evaluates to 12.000000000000002, and a
        // bare ceil() would order a 13th panel. Allow a tiny tolerance before rounding up.
        val baseQuantity = ceilTolerant(surfaceArea / panelArea)

        // Ensure wastePercent is non-negative
        val safeWastePercent = if (wastePercent < 0) 0 else wastePercent

        // Integer arithmetic: 10 panels × 1.1 is 11.000000000000002 in floating point.
        val finalQuantity = ((baseQuantity * (100 + safeWastePercent)) + 99) / 100
        
        val estimatedCost = panel.pricePerUnit?.let { it * finalQuantity }

        return Estimation(
            surfaceArea = surfaceArea,
            panelArea = panelArea,
            baseQuantity = baseQuantity,
            wastePercent = safeWastePercent,
            finalQuantity = finalQuantity,
            estimatedCost = estimatedCost
        )
    }

    private fun ceilTolerant(value: Double): Int = ceil(value - 1e-9).toInt()
}
