package com.example.panelscan.core.logic

import com.example.panelscan.core.model.PanelProfile
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * The 3D shape of a panel's face, built from the shape a moderator picks on
 * the website (or a guess from the product name until then), so any product
 * shows in 3D without an app update.
 */
object PanelShape {

    const val MAX_GROOVES = 12

    /**
     * The shape the API gives, or a guess from the name when none is set yet:
     * "WPC Fluted 7in1" → fluted with 7, "… Inverted Circle" → half-round,
     * "PVC Ceiling Spandrel" → 2 lines, anything else flat. Same rules as the
     * website's admin form (admin/panel-3d.ts).
     */
    fun resolve(profile: String?, grooveCount: Int?, name: String): Pair<PanelProfile, Int> {
        val known = PanelProfile.entries.firstOrNull { it.name == profile }
        if (known != null) {
            val grooves = if (known == PanelProfile.FLAT) 0 else (grooveCount ?: defaultGrooves(known)).coerceIn(1, MAX_GROOVES)
            return known to grooves
        }
        return guess(name)
    }

    fun guess(name: String): Pair<PanelProfile, Int> {
        val count = Regex("""(\d{1,2})\s*-?\s*in\s*-?\s*1\b""", RegexOption.IGNORE_CASE)
            .find(name)?.groupValues?.get(1)?.toInt()?.coerceIn(1, MAX_GROOVES)
        return when {
            Regex("""inverted\s*circle|half[-\s]*round""", RegexOption.IGNORE_CASE).containsMatchIn(name) ->
                PanelProfile.INVERTED_CIRCLE to (count ?: 6)
            name.contains("spandrel", ignoreCase = true) -> PanelProfile.SPANDREL to (count ?: 2)
            name.contains("flut", ignoreCase = true) || count != null -> PanelProfile.FLUTED to (count ?: 5)
            else -> PanelProfile.FLAT to 0
        }
    }

    private fun defaultGrooves(profile: PanelProfile): Int = when (profile) {
        PanelProfile.FLUTED -> 5
        PanelProfile.INVERTED_CIRCLE -> 6
        PanelProfile.SPANDREL -> 2
        PanelProfile.FLAT -> 0
    }

    /**
     * How far the face stands out from the wall, in metres. Fluted ridges
     * stand about half the panel's thickness; half-round flutes are cut
     * almost a full half circle deep (as in the product cross-sections), so
     * their depth follows the flute width; flat faces are a few millimetres.
     */
    fun relief(profile: PanelProfile, grooves: Int, panelWidth: Float, thicknessMm: Int): Float = when (profile) {
        PanelProfile.FLUTED -> (thicknessMm / 2000f).coerceIn(0.005f, 0.015f)
        PanelProfile.INVERTED_CIRCLE -> {
            val pitch = panelWidth / grooves.coerceIn(1, MAX_GROOVES)
            (pitch * (1f - 2 * HALF_ROUND_LAND) * HALF_ROUND_DEPTH + 0.0015f).coerceIn(0.004f, 0.03f)
        }
        PanelProfile.FLAT, PanelProfile.SPANDREL -> 0.004f
    }

    /** Each half-round flute leaves this share of its pitch flat on both sides (the crest). */
    private const val HALF_ROUND_LAND = 0.04f
    /** A half-round flute is cut this share of its width deep (0.5 would be a full half circle). */
    private const val HALF_ROUND_DEPTH = 0.42f

    /**
     * One straight piece of the face seen from above (the cross-section),
     * from ([x0], [z0]) to ([x1], [z1]) in metres across one panel; z is how
     * far it stands out from the wall. Normals are given per end so curves
     * shade smoothly. A [recess] is the bottom of a groove, drawn darker.
     */
    data class Segment(
        val x0: Float, val z0: Float,
        val x1: Float, val z1: Float,
        val nx0: Float, val nz0: Float,
        val nx1: Float, val nz1: Float,
        val recess: Boolean = false
    )

    /**
     * The face of one panel [width] metres wide whose ridges stand [relief]
     * metres out, from its left edge to its right. Proportions follow the
     * product cross-sections: fluted ridges take about 70% of each groove
     * pitch, half-round flutes dip about a third of their width, spandrel
     * lines are 4 mm wide.
     */
    fun crossSection(profile: PanelProfile, grooves: Int, width: Float, relief: Float): List<Segment> {
        val count = grooves.coerceIn(1, MAX_GROOVES)
        return when (profile) {
            PanelProfile.FLAT -> listOf(flat(0f, width, relief))
            PanelProfile.FLUTED -> fluted(count, width, relief)
            PanelProfile.INVERTED_CIRCLE -> halfRound(count, width, relief)
            PanelProfile.SPANDREL -> spandrel(count, width, relief)
        }
    }

    private fun flat(from: Float, to: Float, z: Float, recess: Boolean = false) =
        Segment(from, z, to, z, 0f, 1f, 0f, 1f, recess)

    /** A side wall of a ridge; [facing] is -1 for the left side, +1 for the right. */
    private fun wall(x: Float, zLow: Float, zHigh: Float, facing: Float) =
        if (facing < 0) Segment(x, zLow, x, zHigh, -1f, 0f, -1f, 0f)
        else Segment(x, zHigh, x, zLow, 1f, 0f, 1f, 0f)

    private fun fluted(count: Int, width: Float, relief: Float): List<Segment> {
        val pitch = width / count
        val gap = pitch * 0.3f
        val segments = mutableListOf<Segment>()
        for (i in 0 until count) {
            val start = i * pitch
            val ridgeLeft = start + gap / 2f
            val ridgeRight = start + pitch - gap / 2f
            segments += flat(start, ridgeLeft, 0f, recess = true)
            segments += wall(ridgeLeft, 0f, relief, facing = -1f)
            segments += flat(ridgeLeft, ridgeRight, relief)
            segments += wall(ridgeRight, 0f, relief, facing = 1f)
            segments += flat(ridgeRight, start + pitch, 0f, recess = true)
        }
        return segments
    }

    /**
     * Half-round flutes: each pitch is a narrow crest, then a circular arc cut
     * into the face (a true circle, nearly a half circle deep), then a crest.
     */
    private fun halfRound(count: Int, width: Float, relief: Float): List<Segment> {
        val pitch = width / count
        val land = pitch * HALF_ROUND_LAND
        val span = pitch - 2 * land
        val dip = min(span * HALF_ROUND_DEPTH, relief - 0.001f).coerceAtLeast(0.0005f)
        // The circle through both crest edges and the bottom of the dip.
        val radius = (span * span / 4f + dip * dip) / (2f * dip)
        val centreZ = relief - dip + radius
        val steps = 16
        val segments = mutableListOf<Segment>()
        for (i in 0 until count) {
            val start = i * pitch
            val centreX = start + land + span / 2f
            segments += flat(start, start + land, relief)
            fun point(t: Float): FloatArray {
                val x = start + land + span * t
                val z = centreZ - sqrt(max(radius * radius - (x - centreX) * (x - centreX), 0f))
                // On a hollow, the face looks towards the circle's centre.
                return floatArrayOf(x, z, (centreX - x) / radius, (centreZ - z) / radius)
            }
            var previous = point(0f)
            for (step in 1..steps) {
                val next = point(step / steps.toFloat())
                segments += Segment(previous[0], previous[1], next[0], next[1], previous[2], previous[3], next[2], next[3])
                previous = next
            }
            segments += flat(start + pitch - land, start + pitch, relief)
        }
        return segments
    }

    private fun spandrel(count: Int, width: Float, relief: Float): List<Segment> {
        val line = min(0.004f, width / (count + 1) / 4f)
        val strip = width / (count + 1)
        val segments = mutableListOf<Segment>()
        var x = 0f
        for (i in 1..count) {
            val centre = strip * i
            segments += flat(x, centre - line / 2f, relief)
            segments += wall(centre - line / 2f, relief * 0.3f, relief, facing = 1f)
            segments += flat(centre - line / 2f, centre + line / 2f, relief * 0.3f, recess = true)
            segments += wall(centre + line / 2f, relief * 0.3f, relief, facing = -1f)
            x = centre + line / 2f
        }
        segments += flat(x, width, relief)
        return segments
    }

    /**
     * Cuts the cross-section at [limit] metres from the left, for a panel the
     * measured edge cuts through (the last column of the wall).
     */
    fun clip(segments: List<Segment>, limit: Float): List<Segment> = segments.mapNotNull { segment ->
        val left = min(segment.x0, segment.x1)
        val right = max(segment.x0, segment.x1)
        when {
            left >= limit -> null
            right <= limit -> segment
            else -> {
                // Only flat or sloped pieces cross the cut; keep the part left of it.
                val t = (limit - segment.x0) / (segment.x1 - segment.x0)
                segment.copy(
                    x1 = limit,
                    z1 = segment.z0 + (segment.z1 - segment.z0) * t,
                    nx1 = segment.nx0 + (segment.nx1 - segment.nx0) * t,
                    nz1 = segment.nz0 + (segment.nz1 - segment.nz0) * t
                )
            }
        }
    }
}
