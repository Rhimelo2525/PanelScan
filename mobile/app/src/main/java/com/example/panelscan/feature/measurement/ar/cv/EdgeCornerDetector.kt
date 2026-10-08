package com.example.panelscan.feature.measurement.ar.cv

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * A detected straight edge in analysis-image space, in normal form:
 * `x*cos(theta) + y*sin(theta) = rho`.
 */
data class DetectedLine(
    val theta: Float,
    val rho: Float,
    val strength: Int,
    val vertical: Boolean,
    /** Extent of supporting pixels along the line, in analysis pixels. */
    val lengthPx: Float = 0f,
    /** Supporting pixels per unit length. Low means a fragmented, dashed edge. */
    val density: Float = 0f,
    /** True when this line belongs to a family of evenly spaced parallel lines. */
    val repetitive: Boolean = false
)

/** Intersection of a near-vertical and a near-horizontal edge — a candidate corner. */
data class CornerCandidate(
    /** Analysis-image pixel coordinates. */
    val x: Float,
    val y: Float,
    /** Combined edge strength, and how close to square the two edges meet. */
    val strength: Int,
    val orthogonality: Float,
    /** Shorter of the two contributing lines, in analysis pixels. */
    val minLengthPx: Float,
    /** Longer of the two, in analysis pixels. */
    val maxLengthPx: Float,
    /** Lowest support density of the two lines. */
    val minDensity: Float,
    /** Either contributing line belongs to a repeating parallel family. */
    val repetitive: Boolean,
    /**
     * How differently the four quadrants around the intersection are lit. A printed cross
     * usually leaves all four looking alike; two wall faces meeting rarely do.
     */
    val quadrantContrast: Float
)

data class DetectionResult(
    val lines: List<DetectedLine>,
    val corners: List<CornerCandidate>,
    val analysisWidth: Int,
    val analysisHeight: Int,
    val elapsedMillis: Long
)

/**
 * A deliberately small edge/corner detector for architectural scenes.
 *
 * Rather than pulling in OpenCV — tens of megabytes of native libraries for what amounts to
 * a gradient operator and a line vote — this runs a restricted Hough transform directly on
 * ARCore's luminance plane:
 *
 *   Y plane -> box blur -> Sobel -> keep strong gradients only
 *           -> vote into ~26 candidate angles -> peak pick -> intersect
 *
 * The angle set is restricted to two families (near-vertical and near-horizontal, ±35°),
 * because room corners and wall/ceiling junctions are near-axis-aligned in the image when
 * the phone is held roughly upright, and a full 180° accumulator would cost far more for
 * lines we would then discard.
 *
 * Every buffer is allocated once and reused; a detection cycle allocates nothing but the
 * small result lists.
 */
class EdgeCornerDetector(
    private val width: Int,
    private val height: Int
) {
    private val pixelCount = width * height

    private val blurred = ByteArray(pixelCount)
    private val gradientIsVertical = BooleanArray(pixelCount)

    // Strong-gradient pixel coordinates, packed to avoid per-frame list allocation.
    private val strongX = ShortArray(MAX_STRONG_PIXELS)
    private val strongY = ShortArray(MAX_STRONG_PIXELS)
    private val strongVertical = BooleanArray(MAX_STRONG_PIXELS)

    private val maxRho = hypot(width.toFloat(), height.toFloat()).roundToInt() + 1
    private val rhoBins = (2 * maxRho) / RHO_STEP + 1

    private val verticalAccumulator = IntArray(VERTICAL_ANGLES.size * rhoBins)
    private val horizontalAccumulator = IntArray(HORIZONTAL_ANGLES.size * rhoBins)

    private val verticalCos = FloatArray(VERTICAL_ANGLES.size)
    private val verticalSin = FloatArray(VERTICAL_ANGLES.size)
    private val horizontalCos = FloatArray(HORIZONTAL_ANGLES.size)
    private val horizontalSin = FloatArray(HORIZONTAL_ANGLES.size)

    init {
        VERTICAL_ANGLES.forEachIndexed { i, a -> verticalCos[i] = cos(a); verticalSin[i] = sin(a) }
        HORIZONTAL_ANGLES.forEachIndexed { i, a -> horizontalCos[i] = cos(a); horizontalSin[i] = sin(a) }
    }

    /**
     * Runs one detection pass over a downscaled luminance buffer.
     *
     * [luma] must be [width] * [height] bytes, unsigned luminance. Call from a background
     * dispatcher only — this is tens of milliseconds of tight numeric work.
     *
     * [gradientThreshold] comes from the adaptive enhancer: it equals the original fixed
     * value on normal scenes and drops only for compressed, low-contrast frames such as a
     * brightly lit white wall. [chromaU]/[chromaV] (same size as [luma]) add colour edges
     * with [chromaWeight]; pass null to skip that work entirely.
     */
    fun detect(
        luma: ByteArray,
        gradientThreshold: Int = GRADIENT_THRESHOLD,
        chromaU: ByteArray? = null,
        chromaV: ByteArray? = null,
        chromaWeight: Float = 0f,
        /** Original luma for glare rejection, even when brightness has been remapped. */
        rawLuma: ByteArray? = null
    ): DetectionResult {
        val startedAt = System.nanoTime()

        boxBlur(luma)
        val useChroma = chromaWeight > 0f && chromaU != null && chromaV != null &&
            chromaU.size >= pixelCount && chromaV.size >= pixelCount
        val strongCount = sobelAndCollect(
            threshold = gradientThreshold,
            chromaU = if (useChroma) chromaU else null,
            chromaV = if (useChroma) chromaV else null,
            chromaWeight = chromaWeight,
            rawLuma = rawLuma
        )

        if (strongCount < MIN_STRONG_PIXELS) {
            return DetectionResult(emptyList(), emptyList(), width, height, elapsedMs(startedAt))
        }

        java.util.Arrays.fill(verticalAccumulator, 0)
        java.util.Arrays.fill(horizontalAccumulator, 0)
        vote(strongCount)

        val verticalLines = peaks(
            accumulator = verticalAccumulator,
            angles = VERTICAL_ANGLES,
            vertical = true
        )
        val horizontalLines = peaks(
            accumulator = horizontalAccumulator,
            angles = HORIZONTAL_ANGLES,
            vertical = false
        )

        val measuredVerticals = markRepetitive(measureLines(verticalLines, strongCount))
        val measuredHorizontals = markRepetitive(measureLines(horizontalLines, strongCount))

        val corners = intersect(measuredVerticals, measuredHorizontals)

        return DetectionResult(
            lines = measuredVerticals + measuredHorizontals,
            corners = corners,
            analysisWidth = width,
            analysisHeight = height,
            elapsedMillis = elapsedMs(startedAt)
        )
    }

    private fun elapsedMs(startedAt: Long) = (System.nanoTime() - startedAt) / 1_000_000

    /** 3x3 box blur into [blurred]. Cheap noise suppression so Sobel does not chase grain. */
    private fun boxBlur(src: ByteArray) {
        for (y in 0 until height) {
            val row = y * width
            val up = if (y > 0) row - width else row
            val down = if (y < height - 1) row + width else row
            for (x in 0 until width) {
                val xm = if (x > 0) x - 1 else x
                val xp = if (x < width - 1) x + 1 else x
                var sum = 0
                sum += src[up + xm].toInt() and 0xFF
                sum += src[up + x].toInt() and 0xFF
                sum += src[up + xp].toInt() and 0xFF
                sum += src[row + xm].toInt() and 0xFF
                sum += src[row + x].toInt() and 0xFF
                sum += src[row + xp].toInt() and 0xFF
                sum += src[down + xm].toInt() and 0xFF
                sum += src[down + x].toInt() and 0xFF
                sum += src[down + xp].toInt() and 0xFF
                blurred[row + x] = (sum / 9).toByte()
            }
        }
    }

    /**
     * Sobel gradient, keeping only pixels above [threshold] and classifying each as
     * belonging to a vertical or horizontal edge by which gradient component dominates.
     * Colour gradients, when supplied, are added to the same components so a colour-only
     * boundary (beige wall against white ceiling) votes like a brightness edge.
     */
    private fun sobelAndCollect(
        threshold: Int,
        chromaU: ByteArray?,
        chromaV: ByteArray?,
        chromaWeight: Float,
        rawLuma: ByteArray?
    ): Int {
        var count = 0
        for (y in 2 until height - 2) {
            val row = y * width
            val prev = row - width
            val next = row + width
            for (x in 2 until width - 2) {
                // Specular highlight boundaries are not architectural edge evidence.
                if (rawLuma != null && rawLuma.size >= pixelCount) {
                    var clipped = false
                    for (dy in -2..2) for (dx in -2..2) {
                        if ((rawLuma[(y + dy) * width + x + dx].toInt() and 0xFF) >= 250) clipped = true
                    }
                    if (clipped) continue
                }
                val tl = blurred[prev + x - 1].toInt() and 0xFF
                val tc = blurred[prev + x].toInt() and 0xFF
                val tr = blurred[prev + x + 1].toInt() and 0xFF
                val ml = blurred[row + x - 1].toInt() and 0xFF
                val mr = blurred[row + x + 1].toInt() and 0xFF
                val bl = blurred[next + x - 1].toInt() and 0xFF
                val bc = blurred[next + x].toInt() and 0xFF
                val br = blurred[next + x + 1].toInt() and 0xFF

                var gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl)
                var gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr)
                if (chromaU != null && chromaV != null) {
                    val cx = abs(chromaGx(chromaU, prev, row, next, x)) + abs(chromaGx(chromaV, prev, row, next, x))
                    val cy = abs(chromaGy(chromaU, prev, next, x)) + abs(chromaGy(chromaV, prev, next, x))
                    gx += (chromaWeight * cx).toInt() * sign(gx)
                    gy += (chromaWeight * cy).toInt() * sign(gy)
                }
                val magnitude = abs(gx) + abs(gy)

                if (magnitude < threshold) continue
                val index = row + x

                // A strong horizontal gradient means a vertical edge, and vice versa.
                val isVerticalEdge = abs(gx) > abs(gy)
                gradientIsVertical[index] = isVerticalEdge

                if (count < MAX_STRONG_PIXELS) {
                    strongX[count] = x.toShort()
                    strongY[count] = y.toShort()
                    strongVertical[count] = isVerticalEdge
                    count++
                }
            }
        }
        return count
    }

    private fun sign(value: Int): Int = if (value < 0) -1 else 1

    /** Horizontal Sobel on an unblurred chroma plane; chroma is already spatially smooth. */
    private fun chromaGx(plane: ByteArray, prev: Int, row: Int, next: Int, x: Int): Int =
        ((plane[prev + x + 1].toInt() and 0xFF) + 2 * (plane[row + x + 1].toInt() and 0xFF) +
            (plane[next + x + 1].toInt() and 0xFF)) -
            ((plane[prev + x - 1].toInt() and 0xFF) + 2 * (plane[row + x - 1].toInt() and 0xFF) +
                (plane[next + x - 1].toInt() and 0xFF))

    /** Vertical Sobel on an unblurred chroma plane. */
    private fun chromaGy(plane: ByteArray, prev: Int, next: Int, x: Int): Int =
        ((plane[next + x - 1].toInt() and 0xFF) + 2 * (plane[next + x].toInt() and 0xFF) +
            (plane[next + x + 1].toInt() and 0xFF)) -
            ((plane[prev + x - 1].toInt() and 0xFF) + 2 * (plane[prev + x].toInt() and 0xFF) +
                (plane[prev + x + 1].toInt() and 0xFF))

    private fun vote(strongCount: Int) {
        for (i in 0 until strongCount) {
            val x = strongX[i].toInt()
            val y = strongY[i].toInt()
            if (strongVertical[i]) {
                for (a in VERTICAL_ANGLES.indices) {
                    val rho = x * verticalCos[a] + y * verticalSin[a]
                    val bin = ((rho + maxRho) / RHO_STEP).toInt()
                    if (bin in 0 until rhoBins) verticalAccumulator[a * rhoBins + bin]++
                }
            } else {
                for (a in HORIZONTAL_ANGLES.indices) {
                    val rho = x * horizontalCos[a] + y * horizontalSin[a]
                    val bin = ((rho + maxRho) / RHO_STEP).toInt()
                    if (bin in 0 until rhoBins) horizontalAccumulator[a * rhoBins + bin]++
                }
            }
        }
    }

    /** Picks the strongest well-separated peaks out of one accumulator. */
    private fun peaks(
        accumulator: IntArray,
        angles: FloatArray,
        vertical: Boolean
    ): List<DetectedLine> {
        val found = ArrayList<DetectedLine>(MAX_LINES_PER_FAMILY)
        repeat(MAX_LINES_PER_FAMILY) {
            var bestIndex = -1
            var bestValue = MIN_LINE_VOTES
            for (i in accumulator.indices) {
                if (accumulator[i] > bestValue) {
                    bestValue = accumulator[i]
                    bestIndex = i
                }
            }
            if (bestIndex < 0) return@repeat

            val angleIndex = bestIndex / rhoBins
            val rhoBin = bestIndex % rhoBins
            found += DetectedLine(
                theta = angles[angleIndex],
                rho = rhoBin * RHO_STEP.toFloat() - maxRho,
                strength = bestValue,
                vertical = vertical
            )

            // Suppress this peak's neighbourhood so the next pick is a different edge.
            for (a in angles.indices) {
                for (d in -SUPPRESS_RHO_BINS..SUPPRESS_RHO_BINS) {
                    val bin = rhoBin + d
                    if (bin in 0 until rhoBins) accumulator[a * rhoBins + bin] = 0
                }
            }
        }
        return found
    }

    /**
     * Walks the strong-gradient pixels once per line to recover how far the edge actually
     * runs and how densely it is supported.
     *
     * Vote count alone cannot tell a long architectural edge from a short, busy texture
     * mark: a 30px grout line crossing a noisy patch can out-vote a clean 200px wall
     * corner. Length and density separate them.
     */
    private fun measureLines(lines: List<DetectedLine>, strongCount: Int): List<DetectedLine> {
        if (lines.isEmpty()) return lines
        return lines.map { line ->
            val c = cos(line.theta)
            val sn = sin(line.theta)
            // Direction along the line is the normal rotated by 90 degrees.
            val dirX = -sn
            val dirY = c

            var minAlong = Float.MAX_VALUE
            var maxAlong = -Float.MAX_VALUE
            var support = 0

            // Every second pixel is plenty to recover extent and density, and it halves
            // the cost on exactly the busy surfaces where strongCount hits its ceiling.
            var i = 0
            while (i < strongCount) {
                val x = strongX[i].toInt()
                val y = strongY[i].toInt()
                i += MEASURE_STRIDE
                if (strongVertical[i - MEASURE_STRIDE] != line.vertical) continue
                val distance = abs(x * c + y * sn - line.rho)
                if (distance > LINE_BAND_PX) continue
                val along = x * dirX + y * dirY
                if (along < minAlong) minAlong = along
                if (along > maxAlong) maxAlong = along
                support++
            }

            if (support == 0) return@map line
            val length = (maxAlong - minAlong).coerceAtLeast(1f)
            line.copy(
                lengthPx = length,
                density = (support * MEASURE_STRIDE) / length
            )
        }
    }

    /**
     * Flags families of evenly spaced parallel lines — wallpaper stripes, tile grout, panel
     * seams. Architectural boundaries rarely arrive in a regular comb, so a candidate built
     * from a repeating family is treated as texture until geometry says otherwise.
     */
    private fun markRepetitive(lines: List<DetectedLine>): List<DetectedLine> {
        if (lines.size < 3) return lines
        val sorted = lines.sortedBy { it.rho }
        val gaps = ArrayList<Float>(sorted.size - 1)
        for (i in 1 until sorted.size) gaps += abs(sorted[i].rho - sorted[i - 1].rho)
        if (gaps.size < 2) return lines

        val mean = gaps.average().toFloat()
        if (mean < MIN_REPEAT_SPACING_PX) return lines
        var variance = 0f
        gaps.forEach { variance += (it - mean) * (it - mean) }
        val deviation = sqrt(variance / gaps.size)

        // Evenly spaced within a fifth of the spacing counts as a comb.
        val repetitive = deviation / mean < REPEAT_REGULARITY
        return if (repetitive) lines.map { it.copy(repetitive = true) } else lines
    }

    /**
     * Mean absolute difference between the four quadrants around a point. Cheap, and it
     * catches the common case where a printed cross leaves all four quadrants identically
     * lit while two real surfaces meeting do not.
     */
    private fun quadrantContrast(cx: Int, cy: Int): Float {
        val half = QUADRANT_HALF_PX
        if (cx - half < 0 || cy - half < 0 || cx + half >= width || cy + half >= height) return 0f

        val means = FloatArray(4)
        var q = 0
        for (sy in 0..1) {
            for (sx in 0..1) {
                var sum = 0
                var count = 0
                val y0 = if (sy == 0) cy - half else cy + 1
                val x0 = if (sx == 0) cx - half else cx + 1
                for (y in y0 until y0 + half) {
                    val row = y * width
                    for (x in x0 until x0 + half) {
                        sum += blurred[row + x].toInt() and 0xFF
                        count++
                    }
                }
                means[q++] = if (count > 0) sum.toFloat() / count else 0f
            }
        }

        var total = 0f
        var pairs = 0
        for (i in means.indices) {
            for (j in i + 1 until means.size) {
                total += abs(means[i] - means[j])
                pairs++
            }
        }
        return if (pairs > 0) total / pairs else 0f
    }

    private fun intersect(
        verticals: List<DetectedLine>,
        horizontals: List<DetectedLine>
    ): List<CornerCandidate> {
        if (verticals.isEmpty() || horizontals.isEmpty()) return emptyList()
        val corners = ArrayList<CornerCandidate>(verticals.size * horizontals.size)

        for (v in verticals) {
            val cv = cos(v.theta)
            val sv = sin(v.theta)
            for (h in horizontals) {
                val ch = cos(h.theta)
                val sh = sin(h.theta)
                val determinant = cv * sh - sv * ch
                if (abs(determinant) < 1e-4f) continue

                val x = (v.rho * sh - h.rho * sv) / determinant
                val y = (h.rho * cv - v.rho * ch) / determinant

                // Only intersections that actually fall inside the frame are corners; the
                // rest are where two edges would meet somewhere off-screen.
                if (x < EDGE_MARGIN || y < EDGE_MARGIN) continue
                if (x > width - EDGE_MARGIN || y > height - EDGE_MARGIN) continue

                // 1.0 when the two edges meet at a right angle.
                val angleBetween = abs(abs(v.theta - h.theta) - HALF_PI)
                val orthogonality = (1f - angleBetween / HALF_PI).coerceIn(0f, 1f)
                if (orthogonality < MIN_ORTHOGONALITY) continue

                corners += CornerCandidate(
                    x = x,
                    y = y,
                    strength = v.strength + h.strength,
                    orthogonality = orthogonality,
                    minLengthPx = min(v.lengthPx, h.lengthPx),
                    maxLengthPx = max(v.lengthPx, h.lengthPx),
                    minDensity = min(v.density, h.density),
                    repetitive = v.repetitive || h.repetitive,
                    quadrantContrast = quadrantContrast(x.roundToInt(), y.roundToInt())
                )
            }
        }
        // Longest, cleanest, least repetitive first — raw vote count rewards busy texture.
        corners.sortByDescending { candidate ->
            var rank = candidate.minLengthPx
            if (candidate.repetitive) rank *= REPETITIVE_RANK_PENALTY
            rank
        }
        return if (corners.size > MAX_CORNERS) corners.subList(0, MAX_CORNERS) else corners
    }

    companion object {
        private const val HALF_PI = (Math.PI / 2).toFloat()

        /** Near-vertical edges: 90° ± 35°, every 5°. */
        private val VERTICAL_ANGLES = FloatArray(15) { i ->
            (Math.toRadians(-35.0 + i * 5.0)).toFloat()
        }

        /** Near-horizontal edges: 0° ± 35°, every 5°. */
        private val HORIZONTAL_ANGLES = FloatArray(15) { i ->
            (Math.toRadians(55.0 + i * 5.0)).toFloat()
        }

        private const val RHO_STEP = 2
        /** Threshold for full-range frames; see AdaptiveEnhancer for compressed ones. */
        const val GRADIENT_THRESHOLD = 90
        private const val MIN_STRONG_PIXELS = 220
        private const val MAX_STRONG_PIXELS = 8_000
        private const val MIN_LINE_VOTES = 55
        private const val MAX_LINES_PER_FAMILY = 4
        private const val SUPPRESS_RHO_BINS = 6
        private const val MIN_ORTHOGONALITY = 0.55f
        private const val MAX_CORNERS = 6
        private const val EDGE_MARGIN = 12

        /** How far a pixel may sit from a line and still count as supporting it. */
        private const val LINE_BAND_PX = 2.5f

        /** Below this spacing, "parallel lines" are really one thick edge. */
        private const val MIN_REPEAT_SPACING_PX = 8f

        /** Spacing deviation below this fraction of the mean reads as a regular comb. */
        private const val REPEAT_REGULARITY = 0.22f

        private const val REPETITIVE_RANK_PENALTY = 0.35f
        private const val QUADRANT_HALF_PX = 9
        private const val MEASURE_STRIDE = 2
    }
}
