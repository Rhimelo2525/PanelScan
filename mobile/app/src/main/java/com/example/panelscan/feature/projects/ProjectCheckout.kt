package com.example.panelscan.feature.projects

import com.example.panelscan.core.model.PVCPanel

/**
 * Why a project's panels cannot go to checkout right now, or null when they can.
 * [panel] is the catalogue's current copy (null when it is no longer sold), and
 * [quantity] the project's calculated order quantity. Unknown stock passes: the
 * backend checks it again when the order is placed.
 */
fun projectCheckoutProblem(panel: PVCPanel?, quantity: Int): String? {
    if (panel == null) return "This panel is no longer available. Choose another panel to continue."
    if (quantity <= 0) return "This project has no panels to order."
    val available = panel.inventoryQty
    return when {
        !panel.inStock || (available != null && available <= 0) -> "This panel is currently out of stock."
        available != null && quantity > available ->
            "This project needs $quantity panels, but only $available are available."
        else -> null
    }
}
