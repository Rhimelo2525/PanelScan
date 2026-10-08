package com.example.panelscan.core.util

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Philippine-time days and hours for installation dates, converted to and from
 * the UTC instants the backend stores (java.time needs API 26, so this uses
 * SimpleDateFormat).
 */
object ManilaTime {
    val ZONE: TimeZone = TimeZone.getTimeZone("Asia/Manila")
    private val UTC: TimeZone = TimeZone.getTimeZone("UTC")

    private fun dayFormat() = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = ZONE }

    /** True when "yyyy-MM-dd" is after today in the Philippines. */
    fun isFutureDay(day: String): Boolean = day > dayFormat().format(Calendar.getInstance(ZONE).time)

    /** "yyyy-MM-dd" at "HH:mm" Philippine time, as a UTC ISO-8601 instant. */
    fun toUtcIso(day: String, time: String = "09:00"): String {
        val local = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { timeZone = ZONE }.parse("$day $time")!!
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = UTC }.format(local)
    }

    /** A backend instant as Philippine time, e.g. "Oct 20, 2026" and the hour of day; null if unreadable. */
    fun fromUtcIso(iso: String): Pair<String, Int>? = runCatching {
        val instant = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = UTC }.parse(iso.take(19))!!
        val day = SimpleDateFormat("MMM d, yyyy", Locale.US).apply { timeZone = ZONE }.format(instant)
        val hour = Calendar.getInstance(ZONE).apply { time = instant }.get(Calendar.HOUR_OF_DAY)
        day to hour
    }.getOrNull()
}
