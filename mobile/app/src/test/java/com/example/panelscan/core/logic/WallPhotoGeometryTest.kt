package com.example.panelscan.core.logic

import com.example.panelscan.core.logic.WallPhotoGeometry.Vec
import com.example.panelscan.core.model.WallPhoto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WallPhotoGeometryTest {

    private fun assertVec(expected: Vec, actual: Vec) {
        assertEquals(expected.x, actual.x, 1e-4f)
        assertEquals(expected.y, actual.y, 1e-4f)
        assertEquals(expected.z, actual.z, 1e-4f)
    }

    // A camera like the phone's: 60° tall view on a 1080 × 2400 screen.
    private val projection = FloatArray(16).also {
        it[5] = 1.7320508f
        it[0] = it[5] * 2400f / 1080f
        it[10] = -1.001f; it[11] = -1f; it[14] = -0.1f
    }

    @Test
    fun `the wall's corners come from the three taps, floor side first`() {
        // Width tapped left to right at 1 m high, then the height tapped 0.3 m below.
        val corners = WallPhotoGeometry.cornersFromTaps(Vec(0f, 1f, -2f), Vec(0.35f, 1f, -2f), Vec(0.1f, 0.7f, -2f))
        assertVec(Vec(0f, 0.7f, -2f), corners[0])
        assertVec(Vec(0.35f, 0.7f, -2f), corners[1])
        assertVec(Vec(0.35f, 1f, -2f), corners[2])
        assertVec(Vec(0f, 1f, -2f), corners[3])
    }

    @Test
    fun `sideways drift in the height tap does not skew the wall`() {
        val corners = WallPhotoGeometry.cornersFromTaps(Vec(0f, 0f, -2f), Vec(0.4f, 0f, -2f), Vec(0.25f, 0.3f, -2f))
        assertVec(Vec(0f, 0.3f, -2f), corners[3])
        assertVec(Vec(0.4f, 0.3f, -2f), corners[2])
    }

    @Test
    fun `the view matrix moves world points into the camera's view`() {
        // A camera 1 m to the right of the origin, looking down -z: world x = 1 is straight ahead.
        val view = FloatArray(16).also { it[0] = 1f; it[5] = 1f; it[10] = 1f; it[15] = 1f; it[12] = -1f }
        assertVec(Vec(0f, 0.5f, -2f), WallPhotoGeometry.transform(view, Vec(1f, 0.5f, -2f)))
    }

    @Test
    fun `the panels face the camera whichever way the width was tapped`() {
        val leftToRight = WallPhotoGeometry.placement(listOf(Vec(-0.2f, -0.1f, -1.5f), Vec(0.2f, -0.1f, -1.5f), Vec(0.2f, 0.2f, -1.5f), Vec(-0.2f, 0.2f, -1.5f)))
        val rightToLeft = WallPhotoGeometry.placement(listOf(Vec(0.2f, -0.1f, -1.5f), Vec(-0.2f, -0.1f, -1.5f), Vec(-0.2f, 0.2f, -1.5f), Vec(0.2f, 0.2f, -1.5f)))
        for (placement in listOf(leftToRight, rightToLeft)) {
            assertTrue(placement.out.z > 0.99f)
            assertVec(Vec(0f, 0.05f, -1.5f), placement.centre)
            assertEquals(0.4f, placement.width, 1e-4f)
            assertEquals(0.3f, placement.height, 1e-4f)
            assertVec(Vec(0f, 1f, 0f), placement.up)
        }
    }

    @Test
    fun `the photo backdrop fills exactly the camera's view`() {
        val corners = WallPhotoGeometry.backdropCorners(projection, 60f)
        val expected = listOf(-1f to -1f, 1f to -1f, 1f to 1f, -1f to 1f)
        corners.zip(expected).forEach { (corner, screen) ->
            val (x, y) = WallPhotoGeometry.project(projection, corner)
            assertEquals(screen.first, x, 1e-4f)
            assertEquals(screen.second, y, 1e-4f)
        }
    }

    @Test
    fun `a wider screen crops the photo top and bottom, a narrower one its sides`() {
        val photoAspect = 1080f / 2400f
        val wider = WallPhotoGeometry.fitProjection(projection, photoAspect, 0.5f)
        assertEquals(projection[0], wider[0], 1e-5f)
        assertEquals(projection[5] * (0.5f / photoAspect), wider[5], 1e-5f)
        val narrower = WallPhotoGeometry.fitProjection(projection, photoAspect, 0.4f)
        assertEquals(projection[0] * (photoAspect / 0.4f), narrower[0], 1e-5f)
        assertEquals(projection[5], narrower[5], 1e-5f)
    }

    @Test
    fun `the measured corners land on the photo's pixels, and none are drawn when one is behind the camera`() {
        // A 1080 × 2400 photo: a point straight ahead is its centre; one up the edge of the view is its top.
        val photo = WallPhoto(
            fileName = "p.jpg", imageWidth = 1080, imageHeight = 2400, projection = projection.toList(),
            corners = listOf(0f, 0f, -2f, 0.5f, 0f, -2f, 0.5f, 2f / 1.7320508f, -2f, 0f, 2f / 1.7320508f, -2f)
        )
        val pixels = WallPhotoGeometry.pixelCorners(photo, 1080, 2400)!!
        assertEquals(540f, pixels[0].first, 0.5f)
        assertEquals(1200f, pixels[0].second, 0.5f)
        assertEquals(0f, pixels[3].second, 0.5f)
        assertTrue(pixels[1].first > 540f)
        // Drawn at another size (the uploaded copy is scaled), the same spots scale with it.
        assertEquals(270f, WallPhotoGeometry.pixelCorners(photo, 540, 1200)!![0].first, 0.5f)

        val behind = photo.copy(corners = photo.corners.toMutableList().also { it[2] = 1f })
        assertNull(WallPhotoGeometry.pixelCorners(behind, 1080, 2400))
    }

    @Test
    fun `an edge's label clears the outline, and stays inside the photo`() {
        val square = listOf(300f to 500f, 500f to 500f, 500f to 300f, 300f to 300f)
        // A 120 × 30 label: below the bottom edge by half its height, left of the left edge by half its width.
        assertEquals(400f to 525f, WallPhotoGeometry.labelAnchor(square, 0, 1, 60f, 15f, 10f, 1000, 1000))
        assertEquals(230f to 400f, WallPhotoGeometry.labelAnchor(square, 0, 3, 60f, 15f, 10f, 1000, 1000))
        // A wall reaching the photo's bottom edge: the label is pulled back in, whole.
        assertEquals(400f to 485f, WallPhotoGeometry.labelAnchor(square, 0, 1, 60f, 15f, 10f, 1000, 500))
    }

    @Test
    fun `the wall's corners are the same when the upright side was tapped first`() {
        // Down the left side, then across to the right: the level side is still the width.
        val corners = WallPhotoGeometry.cornersFromTaps(Vec(0f, 1f, -2f), Vec(0f, 0.7f, -2f), Vec(0.35f, 0.7f, -2f))
        assertVec(Vec(0f, 0.7f, -2f), corners[0])
        assertVec(Vec(0.35f, 0.7f, -2f), corners[1])
        assertVec(Vec(0.35f, 1f, -2f), corners[2])
        assertVec(Vec(0f, 1f, -2f), corners[3])
    }
}
