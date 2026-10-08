package com.example.panelscan.feature.measurement.ar.quality

import com.example.panelscan.feature.measurement.ar.WorldPoint3
import kotlin.math.abs

/** Bounded deterministic consensus fit; rejects clutter instead of averaging across it. */
object RobustDepthGeometry {
    data class Sample(val point: WorldPoint3, val u: Float, val v: Float)
    data class Result(val fit: PlaneFitResult, val fraction: Float, val coverage: Int)

    fun fit(samples: List<Sample>, tolerance: Float, minimum: Int): Result? {
        if (samples.size < minimum || tolerance <= 0f) return null
        var best = emptyList<Sample>()
        repeat(48) { i ->
            val a = samples[(i * 7) % samples.size].point
            val b = samples[(i * 13 + samples.size / 3) % samples.size].point
            val c = samples[(i * 19 + samples.size * 2 / 3) % samples.size].point
            val normal = b.minus(a).cross(c.minus(a)).normalisedOrNull() ?: return@repeat
            val inliers = samples.filter { abs(it.point.minus(a).dot(normal)) <= tolerance }
            if (inliers.size > best.size) best = inliers
        }
        if (best.size < minimum || best.size < samples.size * 0.8f) return null
        var fit = PlaneFitter.fit(best.map { it.point }) ?: return null
        best = best.filter { abs(it.point.minus(fit.centroid).dot(fit.normal)) <= tolerance }
        if (best.size < minimum || best.size < samples.size * 0.8f) return null
        fit = PlaneFitter.fit(best.map { it.point }) ?: return null
        val quadrants = IntArray(4)
        best.forEach { quadrants[(if (it.u >= 0f) 1 else 0) + (if (it.v >= 0f) 2 else 0)]++ }
        val coverage = quadrants.count { it >= 2 }
        if (coverage < 4 || fit.spread < 0.06f || fit.rmsResidual > tolerance * 0.65f) return null
        return Result(fit, best.size.toFloat() / samples.size, coverage)
    }

    /** Depth is camera-axis Z, not radial range. Coordinates use scaled texture intrinsics. */
    fun cameraPoint(u: Float, v: Float, z: Float, fx: Float, fy: Float, cx: Float, cy: Float): WorldPoint3? {
        if (listOf(u, v, z, fx, fy, cx, cy).any { !it.isFinite() } || z <= 0f || fx <= 0f || fy <= 0f) return null
        return WorldPoint3((u - cx) * z / fx, -(v - cy) * z / fy, -z)
    }
}
