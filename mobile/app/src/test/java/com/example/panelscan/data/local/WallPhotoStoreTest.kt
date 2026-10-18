package com.example.panelscan.data.local

import com.example.panelscan.core.model.WallPhoto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class WallPhotoStoreTest {

    @get:Rule
    val folder = TemporaryFolder()

    private fun pending(store: WallPhotoStore): WallPhoto {
        val file = store.newPendingFile().apply { writeBytes(byteArrayOf(1, 2, 3)) }
        return WallPhoto(file.name, 1080, 2400, List(16) { it.toFloat() }, List(12) { it * 0.1f })
    }

    @Test
    fun `each project saved from a measurement gets its own copy of the photo`() {
        val store = WallPhotoStore(folder.root)
        val photo = pending(store)

        store.attach("project-1", photo)
        store.attach("project-2", photo)

        val first = store.load("project-1")!!
        assertEquals("project-1.jpg", first.fileName)
        assertEquals(photo.corners, first.corners)
        assertTrue(store.file(first).exists())
        assertTrue(store.file(store.load("project-2")!!).exists())
    }

    @Test
    fun `deleting a project removes its photo`() {
        val store = WallPhotoStore(folder.root)
        store.attach("project-1", pending(store))

        store.delete("project-1")

        assertNull(store.load("project-1"))
    }

    @Test
    fun `a new measurement's photo replaces the last pending one, not saved projects'`() {
        val store = WallPhotoStore(folder.root)
        val old = pending(store)
        store.attach("project-1", old)

        pending(store)

        assertFalse(store.file(old).exists())
        assertTrue(store.file(store.load("project-1")!!).exists())
    }

    @Test
    fun `a project without a photo has none`() {
        assertNull(WallPhotoStore(folder.root).load("unknown"))
    }
}
