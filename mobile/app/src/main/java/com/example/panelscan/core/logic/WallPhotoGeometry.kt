package com.example.panelscan.core.logic

import kotlin.math.sqrt

/**
 * The maths that puts the 3D panels on the photo of the measured wall: the
 * wall's corners from the three AR taps, those corners as the camera saw
 * them, and the camera's view of the photo. Points are float triples in
 * metres; matrices are 4×4, column-major, as ARCore and Filament use them.
 */
object WallPhotoGeometry {

    /** x, y, z of a point or direction. */
    class Vec(val x: Float, val y: Float, val z: Float) {
        operator fun plus(o: Vec) = Vec(x + o.x, y + o.y, z + o.z)
        operator fun minus(o: Vec) = Vec(x - o.x, y - o.y, z - o.z)
        operator fun times(s: Float) = Vec(x * s, y * s, z * s)
        infix fun dot(o: Vec) = x * o.x + y * o.y + z * o.z
        infix fun cross(o: Vec) = Vec(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
        val length: Float get() = sqrt(this dot this)
        fun normalized(): Vec = length.let { if (it == 0f) this else Vec(x / it, y / it, z / it) }
        fun toList() = listOf(x, y, z)
    }

    /**
     * The wall's corners from the AR taps: [p0] and [p1] mark the width, [p2]
     * the height (only its distance square to the width counts, as on the
     * result screen). Returned bottom-left, bottom-right, top-right, top-left,
     * with "up" turned to point up in the world (AR y is up) for a wall, so
     * panel rows start at the floor whichever end was tapped first.
     */
    fun cornersFromTaps(p0: Vec, p1: Vec, p2: Vec): List<Vec> {
        val across = p1 - p0
        val right = across.normalized()
        val toHeight = p2 - p0
        var up = toHeight - right * (toHeight dot right)
        var start = p0
        if (up.y < 0f) {
            start = p0 + up
            up = up * -1f
        }
        return listOf(start, start + across, start + across + up, start + up)
    }

    /** [point] as the camera sees it, given the camera's view matrix. */
    fun transform(view: FloatArray, point: Vec): Vec = Vec(
        view[0] * point.x + view[4] * point.y + view[8] * point.z + view[12],
        view[1] * point.x + view[5] * point.y + view[9] * point.z + view[13],
        view[2] * point.x + view[6] * point.y + view[10] * point.z + view[14]
    )

    /**
     * Where to put the wall mesh (centred, x across, y up, z out) so it lies
     * on the photo's wall: its centre and axes in camera space. The axes are
     * mirrored if needed so the panels face the camera.
     */
    class Placement(val centre: Vec, val right: Vec, val up: Vec, val out: Vec, val width: Float, val height: Float)

    fun placement(corners: List<Vec>): Placement {
        val (bottomLeft, bottomRight, _, topLeft) = corners
        var origin = bottomLeft
        var across = bottomRight - bottomLeft
        val alongUp = topLeft - bottomLeft
        var out = (across cross alongUp).normalized()
        // The camera sits at the origin: the face must point back towards it.
        val centre = bottomLeft + across * 0.5f + alongUp * 0.5f
        if (out dot centre > 0f) {
            origin = bottomRight
            across = across * -1f
            out = out * -1f
        }
        return Placement(
            centre = origin + across * 0.5f + alongUp * 0.5f,
            right = across.normalized(),
            up = alongUp.normalized(),
            out = out,
            width = across.length,
            height = alongUp.length
        )
    }

    /**
     * The photo's projection fitted to a screen of another shape, cropping the
     * photo to fill it (as a centre-cropped image would): the side that is too
     * long for the screen is cut, the other is kept.
     */
    fun fitProjection(projection: FloatArray, photoAspect: Float, screenAspect: Float): FloatArray {
        val fitted = projection.copyOf()
        if (screenAspect > photoAspect) fitted[5] = projection[5] * (screenAspect / photoAspect)
        else fitted[0] = projection[0] * (photoAspect / screenAspect)
        return fitted
    }

    /**
     * The corners of the photo as a flat picture [distance] metres in front of
     * the camera, filling exactly what the photo's [projection] sees:
     * bottom-left, bottom-right, top-right, top-left.
     */
    fun backdropCorners(projection: FloatArray, distance: Float): List<Vec> {
        val sx = projection[0]; val sy = projection[5]
        val ox = projection[8]; val oy = projection[9]
        fun at(ndcX: Float, ndcY: Float) = Vec((ndcX + ox) * distance / sx, (ndcY + oy) * distance / sy, -distance)
        return listOf(at(-1f, -1f), at(1f, -1f), at(1f, 1f), at(-1f, 1f))
    }

    /** Where a camera-space point lands on screen, -1..1 each way (y up). */
    fun project(projection: FloatArray, point: Vec): Pair<Float, Float> {
        val w = -point.z
        val x = (projection[0] * point.x + projection[8] * point.z) / w
        val y = (projection[5] * point.y + projection[9] * point.z) / w
        return x to y
    }
}
