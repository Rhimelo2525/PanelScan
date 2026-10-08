package com.example.panelscan.feature.measurement.ar.quality

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SurfaceLockRecoveryTest {
    private fun feed(r: SurfaceLockRecovery, from: Long, to: Long, tracking: Boolean = true, unavailable: Boolean = true, points: Int = 0): Boolean {
        var result = false
        var t = from
        while (t <= to) { result = r.shouldRestartSearch(tracking, unavailable, points, t); t += 100 }
        return result
    }

    @Test fun releasesUnusedPausedAnchorAfterGrace() {
        val r = SurfaceLockRecovery(750L)
        assertFalse(feed(r, 0, 600))
        assertTrue(feed(r, 0, 900))
    }

    @Test fun neverReleasesWhenPointsPlaced() {
        assertFalse(feed(SurfaceLockRecovery(750L), 0, 5000, points = 1))
    }

    @Test fun cameraTrackingLossRestartsGraceClock() {
        val r = SurfaceLockRecovery(750L)
        feed(r, 0, 600)
        assertFalse(r.shouldRestartSearch(false, true, 0, 700))
        assertFalse(feed(r, 800, 1300))
    }

    @Test fun frameGapDoesNotCountAsStableTime() {
        val r = SurfaceLockRecovery(750L)
        r.shouldRestartSearch(true, true, 0, 0)
        assertFalse(r.shouldRestartSearch(true, true, 0, 2000))
    }

    @Test fun usableAnchorNeverReleased() {
        assertFalse(feed(SurfaceLockRecovery(750L), 0, 5000, unavailable = false))
    }
}
