package com.example.panelscan.core.logic

import com.example.panelscan.core.model.PVCPanel
import org.junit.Assert.assertEquals
import org.junit.Test

class EstimationLogicTest {

    private val samplePanel = PVCPanel(
        id = "p1",
        name = "Standard Wall Panel",
        category = "PVC Wall Panel",
        widthMeters = 0.25,
        heightMeters = 2.4,
        textureResource = "wall_p1",
        pricePerUnit = 15.0
    )

    @Test
    fun `test normal wall dimensions`() {
        val estimation = EstimationLogic.calculateEstimation(3.0, 2.4, samplePanel, 0)
        // surfaceArea = 7.2, panelArea = 0.6, baseQuantity = 12
        assertEquals(7.2, estimation.surfaceArea, 0.01)
        assertEquals(12, estimation.baseQuantity)
        assertEquals(12, estimation.finalQuantity)
        assertEquals(180.0, estimation.estimatedCost!!, 0.01)
    }

    @Test
    fun `test rounding behavior`() {
        // surfaceArea = 1.0, panelArea = 0.6, baseQuantity = ceil(1.66) = 2
        val estimation = EstimationLogic.calculateEstimation(1.0, 1.0, samplePanel, 0)
        assertEquals(2, estimation.baseQuantity)
    }

    @Test
    fun `test waste allowance`() {
        val estimation = EstimationLogic.calculateEstimation(3.0, 2.4, samplePanel, 10)
        // baseQuantity = 12, 12 * 1.1 = 13.2, ceil = 14
        assertEquals(14, estimation.finalQuantity)
    }

    @Test
    fun `test zero dimensions`() {
        val estimation = EstimationLogic.calculateEstimation(0.0, 2.4, samplePanel, 10)
        assertEquals(0, estimation.baseQuantity)
        assertEquals(0, estimation.finalQuantity)
    }

    @Test
    fun `test negative dimensions`() {
        val estimation = EstimationLogic.calculateEstimation(-1.0, 2.4, samplePanel, 10)
        assertEquals(0, estimation.baseQuantity)
    }

    @Test
    fun `test custom waste`() {
        val estimation = EstimationLogic.calculateEstimation(3.0, 2.4, samplePanel, 20)
        // 12 * 1.2 = 14.4, ceil = 15
        assertEquals(15, estimation.finalQuantity)
    }

    private val panel600x1200 = PVCPanel(
        id = "p2", name = "Panel A", category = "PVC Wall Panel",
        widthMeters = 0.6, heightMeters = 1.2, textureResource = "t", pricePerUnit = 100.0, thicknessMm = 10
    )

    @Test
    fun `floating point does not order an extra panel`() {
        // 3.6 × 2.4 / 0.72 is 12.000000000000002 in floating point.
        val estimation = EstimationLogic.calculateEstimation(3.6, 2.4, panel600x1200, 0)
        assertEquals(12, estimation.baseQuantity)
        assertEquals(12, estimation.finalQuantity)
    }

    @Test
    fun `waste is rounded up in whole panels without floating point error`() {
        // 10 × 1.1 is 11.000000000000002 in floating point; the answer is 11.
        val ten = PVCPanel("p3", "P", "PVC Wall Panel", 1.0, 1.0, "t", 10.0)
        assertEquals(11, EstimationLogic.calculateEstimation(10.0, 1.0, ten, 10).finalQuantity)
        assertEquals(10, EstimationLogic.calculateEstimation(10.0, 1.0, ten, 0).finalQuantity)
        assertEquals(11, EstimationLogic.calculateEstimation(10.0, 1.0, ten, 5).finalQuantity)
        assertEquals(12, EstimationLogic.calculateEstimation(10.0, 1.0, ten, 15).finalQuantity)
    }

    @Test
    fun `client example wall 3_20 by 2_70 with 1200 by 600 panels`() {
        val panel = PVCPanel("pa", "PVC Panel A", "PVC Wall Panel", 0.6, 1.2, "t", 500.0, thicknessMm = 10)
        val estimation = EstimationLogic.calculateEstimation(3.2, 2.7, panel, 10)
        assertEquals(8.64, estimation.surfaceArea, 1e-9)
        assertEquals(12, estimation.baseQuantity) // 8.64 / 0.72 = 12
        assertEquals(14, estimation.finalQuantity) // 12 × 1.10 = 13.2 → 14
        assertEquals(14 * 0.72, estimation.totalMaterialArea, 1e-9)
        assertEquals(7000.0, estimation.estimatedCost!!, 1e-9)
    }

    @Test
    fun `layout counts columns and rows for the 3D preview`() {
        assertEquals(6 to 2, EstimationLogic.layout(3.6, 2.4, panel600x1200))
        assertEquals(6 to 3, EstimationLogic.layout(3.2, 2.7, panel600x1200))
        assertEquals(0 to 0, EstimationLogic.layout(0.0, 2.4, panel600x1200))
    }

    @Test
    fun `every catalogue panel estimates consistently`() {
        com.example.panelscan.TestPanels.allPanels.forEach { panel ->
            val e = EstimationLogic.calculateEstimation(3.0, 2.4, panel, 10)
            assertEquals(true, e.finalQuantity >= e.baseQuantity)
            assertEquals(true, e.baseQuantity * panel.areaSquareMeters >= e.surfaceArea - 1e-9)
        }
    }
}
