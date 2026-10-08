package com.example.panelscan.feature.measurement.ar.quality

/**
 * An unused paused anchor must not keep the scanner waiting forever. Releasing it only
 * restarts evidence collection; SurfaceLockTracker still has to confirm a new surface.
 * A measurement with placed points always keeps its original anchors until user Reset.
 */
class SurfaceLockRecovery(private val graceMillis: Long = 750L) {
    private var unavailableSince: Long? = null
    private var lastSampleAt: Long? = null

    fun reset() {
        unavailableSince = null
        lastSampleAt = null
    }

    fun shouldRestartSearch(cameraTracking: Boolean, anchorUnavailable: Boolean, pointCount: Int, nowMs: Long): Boolean {
        if (!cameraTracking || !anchorUnavailable || pointCount != 0) {
            reset()
            return false
        }
        // An app pause or missing frame interval cannot count as stable camera tracking.
        if (lastSampleAt?.let { nowMs < it || nowMs - it > 500L } == true) reset()
        lastSampleAt = nowMs
        val since = unavailableSince ?: nowMs.also { unavailableSince = it }
        return nowMs - since >= graceMillis
    }
}
