package com.example.panelscan

import com.example.panelscan.R
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SurfaceType

/**
 * Sample panels for unit tests (the app's former offline demo catalogue). The
 * app itself loads its catalogue from the backend (core/data/ProductCatalog.kt).
 */
object TestPanels {

    const val WALL_CATEGORY = "PVC Wall Panel"
    const val CEILING_CATEGORY = "PVC Ceiling Panel"

    val wallPanels = listOf(
        PVCPanel(
            id = "a1111111-1111-4111-8111-111111111111",
            name = "Oak Veneer Wall Panel",
            category = WALL_CATEGORY,
            widthMeters = 0.60,
            heightMeters = 2.40,
            textureResource = "wood_oak",
            pricePerUnit = 1850.0,
            finish = "Brushed timber",
            description = "Warm oak grain with a brushed, low-gloss surface. A premium timber face for architectural feature walls and alcoves.",
            inStock = true,
            sku = "WP-OAK-001",
            material = "Oak Veneer",
            inventoryQty = 42,
            imageResId = R.drawable.hero_fluted_interior,
            thicknessMm = 10
        ),
        PVCPanel(
            id = "a2222222-2222-4222-8222-222222222222",
            name = "Acoustic Fabric Wall Panel",
            category = WALL_CATEGORY,
            widthMeters = 0.60,
            heightMeters = 1.20,
            textureResource = "slate_grey",
            pricePerUnit = 2100.0,
            finish = "Acoustic matte",
            description = "Textured acoustic cladding for sound damping and visual warmth in media rooms and modern offices.",
            inStock = true,
            sku = "WP-ACO-002",
            material = "Fabric-wrapped Foam",
            inventoryQty = 9,
            imageResId = R.drawable.cat_wall_panels,
            thicknessMm = 25
        ),
        PVCPanel(
            id = "wall_01",
            name = "Classic White Marble",
            category = WALL_CATEGORY,
            widthMeters = 0.25,
            heightMeters = 2.40,
            textureResource = "marble_white",
            pricePerUnit = 1250.0,
            finish = "Satin marble",
            description = "A soft, veined marble face with a satin sheen. Warms up bathrooms and hallways without the weight or cost of stone.",
            inStock = true,
            sku = "WP-MRB-001",
            material = "PVC Composite",
            inventoryQty = 35,
            imageResId = R.drawable.cat_wall_panels,
            thicknessMm = 9
        ),
        PVCPanel(
            id = "wall_02",
            name = "Grey Slate",
            category = WALL_CATEGORY,
            widthMeters = 0.30,
            heightMeters = 2.60,
            textureResource = "slate_grey",
            pricePerUnit = 1400.0,
            finish = "Matte stone",
            description = "Deep matte slate with a fine mineral speckle. Reads as natural stone in daylight and holds its tone under warm lighting.",
            inStock = true,
            sku = "WP-SLT-002",
            material = "PVC Composite",
            inventoryQty = 20,
            imageResId = R.drawable.img_panel_installation,
            thicknessMm = 9
        ),
        PVCPanel(
            id = "wall_03",
            name = "Oak Wood Grain",
            category = WALL_CATEGORY,
            widthMeters = 0.20,
            heightMeters = 2.40,
            textureResource = "wood_oak",
            pricePerUnit = 1100.0,
            finish = "Brushed timber",
            description = "Warm oak grain with a brushed, low-gloss surface. A narrow board width that suits feature walls and alcoves.",
            inStock = false,
            sku = "WP-OAK-003",
            material = "PVC",
            inventoryQty = 0,
            imageResId = R.drawable.hero_fluted_interior,
            thicknessMm = 8
        )
    )

    val ceilingPanels = listOf(
        PVCPanel(
            id = "a3333333-3333-4333-8333-333333333333",
            name = "PVC Ceiling Tile",
            category = CEILING_CATEGORY,
            widthMeters = 0.60,
            heightMeters = 0.60,
            textureResource = "gloss_white",
            pricePerUnit = 450.0,
            finish = "High gloss",
            description = "Lightweight waterproof ceiling tile designed for suspended grid systems and moisture-exposed areas.",
            inStock = true,
            sku = "CP-PVC-001",
            material = "PVC",
            inventoryQty = 65,
            imageResId = R.drawable.cat_ceiling_panels,
            thicknessMm = 10
        ),
        PVCPanel(
            id = "a4444444-4444-4444-8444-444444444444",
            name = "Gypsum Ceiling Panel",
            category = CEILING_CATEGORY,
            widthMeters = 1.20,
            heightMeters = 0.60,
            textureResource = "silver_stripe",
            pricePerUnit = 620.0,
            finish = "Matte mineral",
            description = "Acoustic-rated ceiling panel offering crisp joint lines and exceptional sound absorption.",
            inStock = true,
            sku = "CP-GYP-002",
            material = "Gypsum",
            inventoryQty = 4,
            imageResId = R.drawable.cat_ceiling_panels,
            thicknessMm = 12
        ),
        PVCPanel(
            id = "ceiling_01",
            name = "High Gloss White",
            category = CEILING_CATEGORY,
            widthMeters = 0.20,
            heightMeters = 3.00,
            textureResource = "gloss_white",
            pricePerUnit = 800.0,
            finish = "High gloss",
            description = "A bright, reflective ceiling board that bounces light back into the room. The standard choice for kitchens and utility spaces.",
            inStock = true,
            sku = "CP-WHT-003",
            material = "PVC",
            inventoryQty = 50,
            imageResId = R.drawable.cat_ceiling_panels,
            thicknessMm = 8
        ),
        PVCPanel(
            id = "ceiling_02",
            name = "Silver Striped",
            category = CEILING_CATEGORY,
            widthMeters = 0.25,
            heightMeters = 3.00,
            textureResource = "silver_stripe",
            pricePerUnit = 950.0,
            finish = "Brushed metallic",
            description = "Fine silver striping with a brushed metallic finish. Adds rhythm to a plain ceiling and disguises minor joints.",
            inStock = true,
            sku = "CP-SLV-004",
            material = "PVC",
            inventoryQty = 28,
            imageResId = R.drawable.cat_ceiling_panels,
            thicknessMm = 10
        )
    )

    val allPanels = wallPanels + ceilingPanels

    fun panelsFor(surfaceType: SurfaceType): List<PVCPanel> = when (surfaceType) {
        SurfaceType.WALL -> wallPanels
        SurfaceType.CEILING -> ceilingPanels
    }

    fun findById(id: String): PVCPanel? = allPanels.firstOrNull { it.id == id }
}
