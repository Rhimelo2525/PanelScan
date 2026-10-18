package com.example.panelscan.core.logic

import com.example.panelscan.core.model.PanelProfile
import kotlin.math.ceil
import kotlin.math.min

/**
 * The measured wall clad edge to edge in one panel shape, as triangle meshes
 * the 3D preview draws: the panel faces (photo textured) and the groove
 * bottoms (shaded darker). Panels run upright, [panelWidth] across and
 * [panelHeight] long, from the bottom-left corner; the last column and row
 * are cut at the measured edges, as an installer would cut them.
 *
 * The wall is centred on the origin, x to the right, y up, z out of the wall,
 * in metres. Texture coordinates repeat every [tileWidth] × [tileHeight]
 * metres so the photo keeps its real scale on any wall.
 */
object WallMesh {

    class Mesh(val positions: FloatArray, val normals: FloatArray, val uvs: FloatArray, val indices: IntArray) {
        val vertexCount: Int get() = positions.size / 3
    }

    class Result(val face: Mesh, val recess: Mesh)

    fun build(
        wallWidth: Float,
        wallHeight: Float,
        panelWidth: Float,
        panelHeight: Float,
        profile: PanelProfile,
        grooves: Int,
        relief: Float,
        tileWidth: Float,
        tileHeight: Float
    ): Result {
        val face = Builder()
        val recess = Builder()
        val columns = ceil(wallWidth / panelWidth - 1e-4f).toInt().coerceAtLeast(1)
        val rows = ceil(wallHeight / panelHeight - 1e-4f).toInt().coerceAtLeast(1)
        val fullSection = PanelShape.crossSection(profile, grooves, panelWidth, relief)

        for (column in 0 until columns) {
            val left = column * panelWidth
            val visibleWidth = min(panelWidth, wallWidth - left)
            val section = if (visibleWidth < panelWidth) PanelShape.clip(fullSection, visibleWidth) else fullSection
            for (row in 0 until rows) {
                val bottom = row * panelHeight
                val top = min(bottom + panelHeight, wallHeight)
                for (segment in section) {
                    val target = if (segment.recess) recess else face
                    target.quad(segment, left - wallWidth / 2f, bottom - wallHeight / 2f, top - wallHeight / 2f, wallWidth, wallHeight, tileWidth, tileHeight)
                }
            }
        }
        return Result(face.build(), recess.build())
    }

    private class Builder {
        val positions = ArrayList<Float>()
        val normals = ArrayList<Float>()
        val uvs = ArrayList<Float>()
        val indices = ArrayList<Int>()

        /** One segment of the cross-section run from [y0] to [y1], counter-clockwise seen from its front. */
        fun quad(
            segment: PanelShape.Segment,
            offsetX: Float,
            y0: Float,
            y1: Float,
            wallWidth: Float,
            wallHeight: Float,
            tileWidth: Float,
            tileHeight: Float
        ) {
            val first = positions.size / 3
            val x0 = offsetX + segment.x0
            val x1 = offsetX + segment.x1
            vertex(x0, y0, segment.z0, segment.nx0, segment.nz0, wallWidth, wallHeight, tileWidth, tileHeight)
            vertex(x1, y0, segment.z1, segment.nx1, segment.nz1, wallWidth, wallHeight, tileWidth, tileHeight)
            vertex(x1, y1, segment.z1, segment.nx1, segment.nz1, wallWidth, wallHeight, tileWidth, tileHeight)
            vertex(x0, y1, segment.z0, segment.nx0, segment.nz0, wallWidth, wallHeight, tileWidth, tileHeight)
            indices += listOf(first, first + 1, first + 2, first, first + 2, first + 3)
        }

        private fun vertex(x: Float, y: Float, z: Float, nx: Float, nz: Float, wallWidth: Float, wallHeight: Float, tileWidth: Float, tileHeight: Float) {
            positions += listOf(x, y, z)
            normals += listOf(nx, 0f, nz)
            // Filament puts a photo's bottom row at v = 0, so v grows upwards with the wall.
            uvs += listOf((x + wallWidth / 2f) / tileWidth, (y + wallHeight / 2f) / tileHeight)
        }

        fun build() = Mesh(positions.toFloatArray(), normals.toFloatArray(), uvs.toFloatArray(), indices.toIntArray())
    }
}
