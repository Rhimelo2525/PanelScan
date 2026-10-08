package com.example.panelscan.feature.measurement.ar.quality

import android.media.Image
import com.example.panelscan.feature.measurement.ar.WorldPoint3
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

/** Short-lived images and metric points are consumed on the AR frame thread. */
class DepthPatchSampler {
    data class Patch(
        val fit: PlaneFitResult?, val centreDistance: Float?, val source: SurfaceEvidenceSource,
        val timestamp: Long, val confidentFraction: Float, val inlierFraction: Float, val coverage: Int
    )
    private var lastTimestamp = 0L

    fun reset() { lastTimestamp = 0L }

    fun sample(frame: Frame, width: Int, height: Int): Patch? {
        // Reprojected raw depth is useful for display, but never adds an independent vote.
        var rawPatch: Patch? = null
        var rawTimestamp: Long? = null
        val raw = runCatching { frame.acquireRawDepthImage16Bits() }.getOrNull()
        if (raw != null) {
            raw.use { depth ->
                if (depth.timestamp <= lastTimestamp) return null
                val confidence = runCatching { frame.acquireRawDepthConfidenceImage() }.getOrNull()
                confidence?.use { rawPatch = read(frame, depth, it, width, height, SurfaceEvidenceSource.RAW_DEPTH_FIT) }
                rawTimestamp = depth.timestamp
                lastTimestamp = depth.timestamp
                if (rawPatch?.fit != null) return rawPatch
            }
        }
        // Explicitly weaker fallback. If raw data exists, it owns freshness for both paths.
        val full = runCatching { frame.acquireDepthImage16Bits() }.getOrNull() ?: return rawPatch
        full.use { depth ->
            val id = rawTimestamp ?: depth.timestamp
            if (raw == null && id <= lastTimestamp) return null
            lastTimestamp = id
            return read(frame, depth, null, width, height, SurfaceEvidenceSource.DEPTH_FIT).copy(timestamp = id)
        }
    }

    private fun read(frame: Frame, depth: Image, confidence: Image?, width: Int, height: Int, source: SurfaceEvidenceSource): Patch {
        val count = 81
        val input = FloatArray(count * 2)
        val radius = 0.12f * min(width, height)
        for (i in 0 until count) {
            input[2 * i] = width / 2f + (i % 9 - 4) * radius / 4f
            input[2 * i + 1] = height / 2f + (i / 9 - 4) * radius / 4f
        }
        val uv = FloatArray(input.size)
        frame.transformCoordinates2d(Coordinates2d.VIEW, input, Coordinates2d.TEXTURE_NORMALIZED, uv)
        val intrinsics = frame.camera.textureIntrinsics
        val dims = intrinsics.imageDimensions
        val focal = intrinsics.focalLength
        val principal = intrinsics.principalPoint
        val sx = depth.width.toFloat() / dims[0]
        val sy = depth.height.toFloat() / dims[1]
        val p = depth.planes[0]
        val bytes = p.buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
        val cp = confidence?.planes?.get(0)
        val cb = cp?.buffer?.duplicate()
        val cameraPose = frame.camera.pose
        val cameraPosition = WorldPoint3(cameraPose.tx(), cameraPose.ty(), cameraPose.tz())
        val samples = ArrayList<RobustDepthGeometry.Sample>(count)
        val visited = HashSet<Int>()
        var centreDistance: Float? = null
        for (i in 0 until count) {
            if (!uv[2*i].isFinite() || !uv[2*i+1].isFinite() || uv[2*i] !in 0f..1f || uv[2*i+1] !in 0f..1f) continue
            val x = (uv[2*i] * depth.width).toInt().coerceIn(0, depth.width - 1)
            val y = (uv[2*i+1] * depth.height).toInt().coerceIn(0, depth.height - 1)
            if (!visited.add(y * depth.width + x)) continue
            val offset = y * p.rowStride + x * p.pixelStride
            if (offset + 1 >= bytes.limit()) continue
            val mm = bytes.getShort(offset).toInt() and 0xFFFF
            if (mm !in 500..5000) continue
            if (cp != null && cb != null) {
                val confidenceOffset = y * cp.rowStride + x * cp.pixelStride
                if (confidenceOffset >= cb.limit() || (cb.get(confidenceOffset).toInt() and 0xFF) < 180) continue
            }
            val cameraPoint = RobustDepthGeometry.cameraPoint(x + 0.5f, y + 0.5f, mm / 1000f,
                focal[0] * sx, focal[1] * sy, principal[0] * sx, principal[1] * sy) ?: continue
            val world = cameraPose.transformPoint(floatArrayOf(cameraPoint.x, cameraPoint.y, cameraPoint.z))
            val point = WorldPoint3(world[0], world[1], world[2])
            samples += RobustDepthGeometry.Sample(point, (i % 9 - 4).toFloat(), (i / 9 - 4).toFloat())
            if (i == count / 2) centreDistance = point.minus(cameraPosition).length()
        }
        val range = centreDistance ?: samples.takeIf { it.isNotEmpty() }?.let {
            it.map { s -> s.point.minus(cameraPosition).length() }.sorted()[it.size / 2]
        } ?: 1.5f
        val tolerance = max(0.012f, 0.008f * range)
        val minimum = if (confidence != null) 16 else 28
        val result = RobustDepthGeometry.fit(samples, tolerance, minimum)
        return Patch(result?.fit, centreDistance, source, depth.timestamp,
            (if (confidence != null) samples.size.toFloat() / count else 0f), result?.fraction ?: 0f, result?.coverage ?: 0)
    }
}
