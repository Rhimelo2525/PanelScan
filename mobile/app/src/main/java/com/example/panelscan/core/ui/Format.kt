package com.example.panelscan.core.ui

import com.example.panelscan.core.model.MeasurementResult
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SurfaceType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** One place for every number the UI prints, so units read the same on every screen. */

fun formatMeters(value: Double, decimals: Int = 2): String =
    String.format(Locale.getDefault(), "%.${decimals}f", value)

fun formatMetersWithUnit(value: Double): String = "${formatMeters(value)} m"

fun formatArea(value: Double): String =
    String.format(Locale.getDefault(), "%.2f", value)

fun formatAreaWithUnit(value: Double): String = "${formatArea(value)} m²"

fun formatCurrency(value: Double): String =
    String.format(Locale.getDefault(), "₱%,.2f", value)

fun formatDimensions(panel: PVCPanel): String =
    "${formatMeters(panel.widthMeters)} × ${formatMeters(panel.heightMeters)} m"

fun formatDimensions(measurement: MeasurementResult): String =
    "${formatMeters(measurement.widthMeters)} × ${formatMeters(measurement.heightMeters)} m"

fun formatDate(epochMillis: Long): String =
    SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(Date(epochMillis))

fun SurfaceType.label(): String = when (this) {
    SurfaceType.WALL -> "Wall"
    SurfaceType.CEILING -> "Ceiling"
}
