package com.example.panelscan.core.logic

import com.example.panelscan.core.model.PanelProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

class PanelShapeTest {

    @Test
    fun `uses the shape set on the website`() {
        assertEquals(PanelProfile.FLUTED to 7, PanelShape.resolve("FLUTED", 7, "Anything"))
        assertEquals(PanelProfile.FLAT to 0, PanelShape.resolve("FLAT", null, "WPC Fluted 5in1"))
        assertEquals(PanelProfile.SPANDREL to 2, PanelShape.resolve("SPANDREL", null, "Ceiling"))
    }

    @Test
    fun `guesses the shape from the name until one is set`() {
        assertEquals(PanelProfile.FLUTED to 5, PanelShape.resolve(null, null, "WPC Fluted 5in1"))
        assertEquals(PanelProfile.FLUTED to 7, PanelShape.resolve(null, null, "WPC Fluted 7in1"))
        assertEquals(PanelProfile.INVERTED_CIRCLE to 6, PanelShape.resolve(null, null, "WPC Fluted 6in1 Inverted Circle"))
        assertEquals(PanelProfile.SPANDREL to 2, PanelShape.resolve(null, null, "PVC Ceiling Spandrel (Wood Series)"))
        assertEquals(PanelProfile.FLAT to 0, PanelShape.resolve(null, null, "Seamless PVC Ceiling Panel"))
        assertEquals(PanelProfile.FLAT to 0, PanelShape.resolve("SOMETHING_NEW", 3, "Seamless PVC Ceiling Panel"))
    }

    @Test
    fun `every shape spans the whole panel width without gaps`() {
        for (profile in PanelProfile.entries) {
            val section = PanelShape.crossSection(profile, grooves = 5, width = 0.2f, relief = 0.01f)
            assertEquals(0f, section.first().x0, 1e-6f)
            assertEquals(0.2f, section.last().x1, 1e-5f)
            section.zipWithNext().forEach { (a, b) ->
                assertEquals("$profile joins", a.x1, b.x0, 1e-5f)
                assertEquals("$profile joins", a.z1, b.z0, 1e-5f)
            }
        }
    }

    @Test
    fun `a fluted panel has one ridge per groove and darker groove bottoms`() {
        val section = PanelShape.crossSection(PanelProfile.FLUTED, grooves = 6, width = 0.17f, relief = 0.009f)
        assertEquals(6, section.count { !it.recess && it.z0 == 0.009f && it.z1 == 0.009f })
        assertTrue(section.filter { it.recess }.all { it.z0 == 0f && it.z1 == 0f })
    }

    @Test
    fun `a spandrel panel has its lines between equal strips`() {
        val section = PanelShape.crossSection(PanelProfile.SPANDREL, grooves = 2, width = 0.25f, relief = 0.004f)
        val lineCentres = section.filter { it.recess }.map { (it.x0 + it.x1) / 2f }
        assertEquals(2, lineCentres.size)
        assertEquals(0.25f / 3f, lineCentres[0], 1e-5f)
        assertEquals(0.5f / 3f, lineCentres[1], 1e-5f)
    }

    @Test
    fun `half-round flutes dip into the face with outward normals`() {
        val section = PanelShape.crossSection(PanelProfile.INVERTED_CIRCLE, grooves = 6, width = 0.15f, relief = 0.01f)
        assertTrue(section.all { it.z0 <= 0.01f + 1e-6f && it.z1 <= 0.01f + 1e-6f && it.z1 >= 0f })
        assertTrue(section.all { it.nz0 > 0f && it.nz1 > 0f })
        section.forEach { assertEquals(1f, sqrt(it.nx0 * it.nx0 + it.nz0 * it.nz0), 1e-4f) }
    }

    @Test
    fun `half-round flutes are true arcs cut nearly a half circle deep`() {
        // 6in1 Inverted Circle: 15 cm wide, 1.5 cm thick.
        val relief = PanelShape.relief(PanelProfile.INVERTED_CIRCLE, 6, 0.15f, 15)
        val section = PanelShape.crossSection(PanelProfile.INVERTED_CIRCLE, grooves = 6, width = 0.15f, relief = relief)
        val flute = section.filter { it.x0 >= 0f && it.x1 <= 0.025f }
        val deepest = flute.minOf { minOf(it.z0, it.z1) }
        // About 0.42 of the 23 mm flute width deep, i.e. nearly a 11.5 mm half circle.
        assertEquals(0.0097f, relief - deepest, 0.0005f)
        // Every point of the arc is the same distance from one centre: a circle, not a wave.
        val points = flute.filter { it.z0 < relief }.map { it.x0 to it.z0 }
        val centreX = 0.0125f
        val radii = points.map { (x, z) -> val dx = x - centreX; val radius = (0.023f * 0.023f / 4f + 0.0097f * 0.0097f) / (2f * 0.0097f); kotlin.math.abs(sqrt(dx * dx + (relief - 0.0097f + radius - z) * (relief - 0.0097f + radius - z)) - radius) }
        assertTrue(radii.all { it < 0.0003f })
    }

    @Test
    fun `fluted ridges stand half the panel's thickness out`() {
        assertEquals(0.01f, PanelShape.relief(PanelProfile.FLUTED, 5, 0.2f, 20), 1e-6f)
        assertEquals(0.004f, PanelShape.relief(PanelProfile.FLAT, 0, 0.25f, 8), 1e-6f)
    }

    @Test
    fun `a cut panel stops at the measured edge`() {
        val section = PanelShape.crossSection(PanelProfile.FLUTED, grooves = 5, width = 0.2f, relief = 0.01f)
        val clipped = PanelShape.clip(section, 0.15f)
        assertTrue(clipped.all { maxOf(it.x0, it.x1) <= 0.15f + 1e-6f })
        assertEquals(0.15f, clipped.maxOf { maxOf(it.x0, it.x1) }, 1e-5f)
    }

    @Test
    fun `the wall mesh covers exactly the measured wall`() {
        // 0.35 × 0.31 m wall, 20 × 290 cm panels: one full panel and one cut to 15 cm.
        val mesh = WallMesh.build(0.35f, 0.31f, 0.2f, 2.9f, PanelProfile.FLUTED, 5, 0.01f, 0.1f, 0.3f)
        // Faces and groove bottoms together (a fluted panel's edges are groove bottoms).
        val positions = mesh.face.positions + mesh.recess.positions
        val xs = (positions.indices step 3).map { positions[it] }
        val ys = (positions.indices step 3).map { positions[it + 1] }
        assertEquals(-0.175f, xs.min(), 1e-4f)
        assertEquals(0.175f, xs.max(), 1e-4f)
        assertEquals(-0.155f, ys.min(), 1e-4f)
        assertEquals(0.155f, ys.max(), 1e-4f)
        assertTrue(mesh.recess.vertexCount > 0)
        assertEquals(mesh.face.vertexCount / 4 * 6, mesh.face.indices.size)
    }

    @Test
    fun `faces wind counter-clockwise towards their normals`() {
        val mesh = WallMesh.build(0.4f, 0.5f, 0.15f, 2.9f, PanelProfile.INVERTED_CIRCLE, 6, 0.01f, 0.1f, 0.3f).face
        val p = mesh.positions
        for (t in mesh.indices.indices step 3) {
            val (a, b, c) = Triple(mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3)
            val ux = p[b] - p[a]; val uy = p[b + 1] - p[a + 1]; val uz = p[b + 2] - p[a + 2]
            val vx = p[c] - p[a]; val vy = p[c + 1] - p[a + 1]; val vz = p[c + 2] - p[a + 2]
            val cross = floatArrayOf(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
            val normal = floatArrayOf(mesh.normals[a], mesh.normals[a + 1], mesh.normals[a + 2])
            val dot = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2]
            if (abs(cross[0]) + abs(cross[1]) + abs(cross[2]) > 1e-9f) assertTrue("triangle $t faces away", dot > 0f)
        }
    }
}
