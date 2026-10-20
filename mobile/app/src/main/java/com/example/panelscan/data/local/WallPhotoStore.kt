package com.example.panelscan.data.local

import com.example.panelscan.core.model.WallPhoto
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Photos of measured walls, kept in the app's private storage: a project's
 * photo is `<projectId>.jpg` with its placement in `<projectId>.json`. A photo
 * taken during a measurement stays "pending" (copied to each project saved
 * from that measurement) until the next measurement replaces it. A copy with
 * the measurement drawn on it goes to the PanelScan team with the project;
 * `<projectId>.sent` records which measurement that copy showed, so it is
 * sent again only when the photo or the size changes.
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
        sentFile(projectId).delete()
    }

    /** Whether the team already has this project's photo drawn with [measurementKey]. */
    fun isSent(projectId: String, measurementKey: String): Boolean =
        sentFile(projectId).let { it.exists() && it.readText() == measurementKey }

    fun markSent(projectId: String, measurementKey: String) {
        sentFile(projectId).writeText(measurementKey)
    }

    fun delete(projectId: String) {
        File(dir, "${safe(projectId)}.jpg").delete()
        metaFile(projectId).delete()
        sentFile(projectId).delete()
    }

    private fun metaFile(projectId: String) = File(dir, "${safe(projectId)}.json")

    private fun sentFile(projectId: String) = File(dir, "${safe(projectId)}.sent")

    private fun safe(id: String) = id.replace(Regex("[^A-Za-z0-9_-]"), "_")
}
