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

/** A length in metres as centimetres, without needless decimals: 0.2 → "20", 0.012 → "1.2". */
fun formatCentimeters(meters: Double): String {
    val value = Math.round(meters * 1000) / 10.0
    return if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
}

/** A panel's face size in centimetres, as the admin enters it: "20 × 290 cm". */
fun formatPanelSizeCm(panel: PVCPanel): String =
    "${formatCentimeters(panel.widthMeters)} × ${formatCentimeters(panel.heightMeters)} cm"

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
