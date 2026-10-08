package com.example.panelscan.feature.measurement.ar.quality

import com.example.panelscan.feature.measurement.ar.PlaneSignature
import com.example.panelscan.feature.measurement.ar.WorldPoint3
import kotlin.math.abs

/** Where the evidence for a surface came from. */
enum class SurfaceEvidenceSource {
    /** An ARCore-tracked plane of the selected orientation. The strongest evidence. */
    TRACKED_PLANE,

    /**
     * A plane fitted to ARCore depth hits. Used on plain, white or brightly lit walls where
     * ARCore has too few visual features to publish a plane, but its depth estimate does
     * describe a consistent flat surface.
     */
    DEPTH_FIT,
    RAW_DEPTH_FIT,
    REFERENCE_IMAGE;

    val isDepth: Boolean get() = this == DEPTH_FIT || this == RAW_DEPTH_FIT
    val isPoseTracked: Boolean get() = this == TRACKED_PLANE || this == REFERENCE_IMAGE
}

/** One sample of "the surface under the reticle looks like this plane". */
data class SurfaceObservation(
    val normal: WorldPoint3,
    val point: WorldPoint3,
    val source: SurfaceEvidenceSource,
    val timestampMs: Long,
    /** Fit residual for depth samples; 0 for tracked planes. */
    val residual: Float = 0f,
    /** Camera/depth acquisition identity; reused or reprojected data cannot add votes. */
    val evidenceId: Long = timestampMs
) {
    fun signature() = PlaneSignature(normal.x, normal.y, normal.z, point.x, point.y, point.z)
}

/** The surface the measurement is locked to — "Surface confirmed". */
data class LockedSurface(
    val normal: WorldPoint3,
    val point: WorldPoint3,
    val source: SurfaceEvidenceSource,
    val lockedAtMs: Long,
    val sampleCount: Int
) {
    fun signature() = PlaneSignature(normal.x, normal.y, normal.z, point.x, point.y, point.z)
}

enum class LockPhase { NONE, DETECTED, CONFIRMED }

data class LockStatus(
    val phase: LockPhase,
    /** 0..1 progress towards confirmation for the current candidate. */
    val stability: Float,
    val candidateSource: SurfaceEvidenceSource?,
    /** Non-null only on the sample where a (re)lock happened, so the caller creates an anchor. */
    val newlyLocked: LockedSurface?
)

/**
 * Turns noisy per-frame surface samples into a stable, confirmed surface.
 *
 * A surface is **detected** as soon as one sample of the right orientation exists, and
 * **confirmed** once enough mutually coplanar samples have been seen over a short window.
 * Depth-fitted samples are noisier than tracked planes, so they need more agreement and a
 * longer window — this is what lets a low-texture wall be measured without trusting a single
 * lucky depth reading.
 *
 * Once confirmed the lock is kept; a *different* surface can only replace it while no points
 * have been placed (the caller passes `allowRelock`), and only after it is itself confirmed.
 */
class SurfaceLockTracker(private val config: Config = Config()) {

    data class Config(
        val windowMs: Long = 1_500L,
        val trackedPlaneSamples: Int = 3,
        val trackedPlaneMinSpanMs: Long = 150L,
        val depthSamples: Int = 6,
        val depthMinSpanMs: Long = 500L,
        val maxAngleDegrees: Float = 7f,
        val maxOffsetMetres: Float = 0.035f,
        val maxDepthResidualMetres: Float = 0.015f,
        val depthAgreementFraction: Float = 0.7f,
        /** Looser tolerance for deciding a sample belongs to the *current lock*. */
        val lockAngleDegrees: Float = 12f,
        val lockOffsetMetres: Float = 0.10f
    )

    private val window = ArrayDeque<SurfaceObservation>()
    private val lastEvidenceIds = mutableMapOf<SurfaceEvidenceSource, Long>()

    var locked: LockedSurface? = null
        private set

    fun reset() {
        clearSamples()
        locked = null
    }

    /** Clears samples but keeps any lock — used when the camera loses tracking briefly. */
    fun clearSamples() {
        window.clear()
        // Keep acquisition IDs: an old image after tracking loss is still old evidence.
    }

    /**
     * Follows the lock anchor as ARCore refines its map, so "belongs to the lock" is judged
     * against where the surface is now rather than where it was first seen.
     */
    fun refreshLock(normal: WorldPoint3, point: WorldPoint3) {
        locked = locked?.copy(normal = normal, point = point)
    }

    fun observe(observation: SurfaceObservation, allowRelock: Boolean): LockStatus {
        val evidenceKey = if (observation.source.isDepth) SurfaceEvidenceSource.DEPTH_FIT else observation.source
        val fresh = observation.evidenceId > (lastEvidenceIds[evidenceKey] ?: Long.MIN_VALUE)
        if (fresh) {
            lastEvidenceIds[evidenceKey] = observation.evidenceId
            window.addLast(observation)
        }
        while (window.isNotEmpty() && observation.timestampMs - window.first().timestampMs > config.windowMs) {
            window.removeFirst()
        }

        val current = locked
        val promoteToTrackedPlane = current?.source?.isDepth == true &&
            observation.source == SurfaceEvidenceSource.TRACKED_PLANE && allowRelock
        if (current != null && belongsToLock(observation, current) && !promoteToTrackedPlane) {
            // Evidence for the surface we already hold. Nothing to decide.
            return LockStatus(LockPhase.CONFIRMED, 1f, observation.source, null)
        }

        val agreeing = window.filter { agrees(it, observation) }
        val trackedCount = agreeing.count { it.source.isPoseTracked }
        val span = if (agreeing.isEmpty()) 0L else agreeing.last().timestampMs - agreeing.first().timestampMs
        val depthUsable = agreeing.count {
            it.source.isDepth && it.residual <= config.maxDepthResidualMetres
        }
        // Geometric stability: most recent depth samples must describe this same plane. A
        // window that flips between two planes (a corner, a moving object) is not stable
        // even if either plane alone has enough samples.
        val depthTotal = window.count { it.source.isDepth }
        val depthMajority = depthTotal == 0 ||
            agreeing.count { it.source.isDepth } >= config.depthAgreementFraction * depthTotal

        val trackedProgress = trackedCount.toFloat() / config.trackedPlaneSamples
        val depthProgress = depthUsable.toFloat() / config.depthSamples
        val progress = maxOf(trackedProgress, depthProgress).coerceIn(0f, 1f)

        val confirmedByPlane = trackedCount >= config.trackedPlaneSamples && span >= config.trackedPlaneMinSpanMs
        // Tracked-plane samples also count towards a depth-led confirmation: they are
        // stronger evidence, not weaker.
        val confirmedByDepth = (depthUsable + trackedCount) >= config.depthSamples &&
            depthUsable > 0 && span >= config.depthMinSpanMs && depthMajority

        if ((confirmedByPlane || confirmedByDepth) && (current == null || allowRelock)) {
            val source = if (confirmedByPlane) observation.source.takeIf { it.isPoseTracked }
                ?: SurfaceEvidenceSource.TRACKED_PLANE else observation.source.takeIf { it.isDepth }
                ?: SurfaceEvidenceSource.DEPTH_FIT
            val lock = average(agreeing, source, observation.timestampMs)
            locked = lock
            window.clear()
            return LockStatus(LockPhase.CONFIRMED, 1f, source, lock)
        }

        return LockStatus(
            phase = if (current != null) LockPhase.CONFIRMED else LockPhase.DETECTED,
            stability = if (current != null) 1f else progress,
            candidateSource = observation.source,
            newlyLocked = null
        )
    }

    /** Whether a sample describes the same geometric plane as the lock. */
    fun belongsToLock(observation: SurfaceObservation, lock: LockedSurface? = locked): Boolean {
        if (lock == null) return false
        val angle = SurfaceOrientationClassifier.angleBetweenDegrees(observation.normal, lock.normal)
        if (angle > config.lockAngleDegrees) return false
        val offset = abs(SurfaceMath.signedDistance(lock.signature(), observation.point))
        return offset <= config.lockOffsetMetres
    }

    private fun agrees(a: SurfaceObservation, b: SurfaceObservation): Boolean {
        if (SurfaceOrientationClassifier.angleBetweenDegrees(a.normal, b.normal) > config.maxAngleDegrees) return false
        // Symmetric offset test: each point against the other's plane.
        val ab = abs(SurfaceMath.signedDistance(b.signature(), a.point))
        val ba = abs(SurfaceMath.signedDistance(a.signature(), b.point))
        return maxOf(ab, ba) <= config.maxOffsetMetres
    }

    /** Averages normals (sign-aligned) and projects the mean point, weighting tracked planes higher. */
    private fun average(samples: List<SurfaceObservation>, source: SurfaceEvidenceSource, now: Long): LockedSurface {
        val reference = samples.last().normal
        var nx = 0f; var ny = 0f; var nz = 0f
        var px = 0f; var py = 0f; var pz = 0f
        var weight = 0f
        samples.forEach { s ->
            val w = if (s.source.isPoseTracked) 3f else 1f
            val n = if (s.normal.dot(reference) < 0f) s.normal.times(-1f) else s.normal
            nx += n.x * w; ny += n.y * w; nz += n.z * w
            px += s.point.x * w; py += s.point.y * w; pz += s.point.z * w
            weight += w
        }
        val normal = WorldPoint3(nx, ny, nz).normalisedOrNull() ?: reference
        return LockedSurface(
            normal = normal,
            point = WorldPoint3(px / weight, py / weight, pz / weight),
            source = source,
            lockedAtMs = now,
            sampleCount = samples.size
        )
    }
}
