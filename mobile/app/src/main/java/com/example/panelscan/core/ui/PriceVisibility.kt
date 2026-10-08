package com.example.panelscan.core.ui

import com.example.panelscan.core.session.CustomerSessionState

/**
 * Centralized business rule for customer price privacy.
 *
 * Logged-out customers can browse products, see dimensions, materials, and calculation
 * quantities, but monetary pricing (unit price, material cost, cart subtotal, checkout totals)
 * is strictly hidden behind "Log in to view pricing".
 */
object PriceVisibility {
    const val LOGGED_OUT_PRICING_LABEL = "Log in to view pricing"
    const val LOGGED_OUT_UNIT_PRICE_LABEL = "Log in to view price"
    const val LOGGED_OUT_SHORT_LABEL = "Log in to view"

    fun isPriceVisible(sessionState: CustomerSessionState): Boolean {
        return sessionState is CustomerSessionState.LoggedIn
    }

    fun formatPriceOrHidden(
        amount: Double?,
        isPriceVisible: Boolean,
        fallback: String = LOGGED_OUT_PRICING_LABEL
    ): String {
        if (!isPriceVisible) return fallback
        return amount?.let { formatCurrency(it) } ?: "—"
    }

    fun formatUnitPriceOrHidden(
        amount: Double?,
        isPriceVisible: Boolean,
        suffix: String = " each"
    ): String {
        if (!isPriceVisible) return LOGGED_OUT_UNIT_PRICE_LABEL
        return amount?.let { "${formatCurrency(it)}$suffix" } ?: "—"
    }
}
