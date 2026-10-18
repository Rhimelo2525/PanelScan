package com.example.panelscan.data.local

import com.example.panelscan.core.model.WallPhoto
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Photos of measured walls, kept in the app's private storage and never
 * uploaded: a project's photo is `<projectId>.jpg` with its placement in
 * `<projectId>.json`. A photo taken during a measurement stays "pending"
 * (copied to each project saved from that measurement) until the next
 * measurement replaces it.
 */
class WallPhotoStore(filesDir: File) {

    private val dir = File(filesDir, "wall-photos").apply { mkdirs() }
    private val json = Json { ignoreUnknownKeys = true }

    /** Where a newly taken photo is written; the previous measurement's pending photo goes. */
    fun newPendingFile(): File {
        dir.listFiles { file -> file.name.startsWith("pending-") }?.forEach { it.delete() }
        return File(dir, "pending-${System.currentTimeMillis()}.jpg")
    }

    fun file(photo: WallPhoto): File = File(dir, photo.fileName)

    fun load(projectId: String): WallPhoto? {
        val meta = metaFile(projectId)
        if (!meta.exists()) return null
        val photo = runCatching { json.decodeFromString(WallPhoto.serializer(), meta.readText()) }.getOrNull() ?: return null
        return photo.takeIf { file(it).exists() }
    }

    /** Gives the project its own copy of a pending photo, replacing any earlier one. */
    fun attach(projectId: String, pending: WallPhoto) {
        val source = file(pending)
        if (!source.exists()) return
        val target = File(dir, "${safe(projectId)}.jpg")
        if (source != target) source.copyTo(target, overwrite = true)
        val owned = pending.copy(fileName = target.name)
        metaFile(projectId).writeText(json.encodeToString(WallPhoto.serializer(), owned))
    }

    fun delete(projectId: String) {
        File(dir, "${safe(projectId)}.jpg").delete()
        metaFile(projectId).delete()
    }

    private fun metaFile(projectId: String) = File(dir, "${safe(projectId)}.json")

    private fun safe(id: String) = id.replace(Regex("[^A-Za-z0-9_-]"), "_")
}
