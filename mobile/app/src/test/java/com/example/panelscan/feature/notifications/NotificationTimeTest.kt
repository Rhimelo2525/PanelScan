package com.example.panelscan.feature.notifications

import com.example.panelscan.data.repository.parseIsoMillis
import org.junit.Assert.assertEquals
import org.junit.Test

/** Notification times read as on the website, in Philippine time. */
class NotificationTimeTest {

    private fun at(iso: String) = parseIsoMillis(iso)!!

    // 2026-10-11 10:00 in Manila.
    private val now = at("2026-10-11T02:00:00.000Z")

    @Test
    fun `recent notifications show how long ago`() {
        assertEquals("Just now", formatNotificationTime(now - 20_000, now))
        assertEquals("1 minute ago", formatNotificationTime(now - 60_000, now))
        assertEquals("45 minutes ago", formatNotificationTime(now - 45 * 60_000, now))
    }

    @Test
    fun `older ones show today, yesterday or the date in Manila`() {
        assertEquals("Today, 8:30 AM", formatNotificationTime(at("2026-10-11T00:30:00.000Z"), now))
        // 11:30 PM on the 10th in Manila is still "yesterday", though it is the 10th in UTC too.
        assertEquals("Yesterday, 11:30 PM", formatNotificationTime(at("2026-10-10T15:30:00.000Z"), now))
        assertEquals("Oct 2, 1:22 AM", formatNotificationTime(at("2026-10-01T17:22:00.000Z"), now))
        assertEquals("Dec 30, 2025, 9:00 AM", formatNotificationTime(at("2025-12-30T01:00:00.000Z"), now))
    }
}
