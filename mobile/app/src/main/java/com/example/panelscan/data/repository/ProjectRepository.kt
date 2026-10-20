package com.example.panelscan.data.repository

import com.example.panelscan.core.model.*
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import com.example.panelscan.data.local.ProjectDao
import com.example.panelscan.data.local.ProjectEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import java.net.URLEncoder

/**
 * Saved measurement projects. They are kept on the device (so measuring works
 * offline) and, while signed in, also saved to the account on the backend as
 * MOBILE_AR_3D projects (POST /api/projects/mobile), which the website's
 * "My Projects" page and the team see (owner and moderators, on the admin
 * Projects page, view-only). Each gets a reference code ([references]) the
 * customer can quote to the team. Like the cart: projects saved while
 * signed out join the account at the next sign-in, and the account's projects
 * leave the device at sign-out.
 */
class ProjectRepository(
    private val projectDao: ProjectDao,
    /** The live catalogue; a project shows its panel once the catalogue has loaded. */
    private val catalog: StateFlow<List<PVCPanel>>,
    private val api: ApiClient? = null,
    private val wallPhotos: WallPhotoUploads? = null,
    private val isSignedIn: () -> Boolean = { false }
) {
    /**
     * The photos of measured walls sent with projects, so the team sees which
     * wall was measured (staff only; not shown on the customer's website).
     */
    interface WallPhotoUploads {
        /** The photo with [measurementKey]'s measurement drawn on it; null when there is none or it was already sent. */
        suspend fun photoToSend(projectId: String, measurementKey: String, widthMeters: Double, heightMeters: Double, surfaceType: SurfaceType): ByteArray?
        fun markSent(projectId: String, measurementKey: String)
    }

    /** App project ids known to be saved on the account. */
    private val syncedIds = mutableSetOf<String>()

    private val _references = MutableStateFlow<Map<String, ProjectReference>>(emptyMap())

    /** The account's reference per app project id, for projects saved to the account. */
    val references: StateFlow<Map<String, ProjectReference>> = _references.asStateFlow()

    val allProjects: Flow<List<SavedProject>> = combine(projectDao.getAllProjects(), catalog) { entities, panels ->
        entities.map { it.toDomain(panels) }
    }

    suspend fun getProjectById(id: String): SavedProject? {
        return projectDao.getProjectById(id)?.toDomain(catalog.value)
    }

    /** Saves on the device, then to the account; null when both worked (or signed out), else why the upload failed. */
    suspend fun saveProject(project: SavedProject): String? {
        val entity = project.toEntity()
        projectDao.insertProject(entity)
        return if (isSignedIn()) upload(entity) else null
    }

    /**
     * Deletes a project. One saved on the account is removed there first; the
     * backend refuses once the team has taken it on, and then it stays.
     * Null on success, else why it could not be deleted.
     */
    suspend fun deleteProject(project: SavedProject): String? {
        val client = api
        if (client != null && isSignedIn() && synchronized(syncedIds) { project.id in syncedIds }) {
            try {
                client.send("DELETE", "/projects/mobile/${encode(project.id)}", authenticated = true)
            } catch (error: ApiException) {
                if (error.status != 404) return error.message
            }
            synchronized(syncedIds) { syncedIds -= project.id }
            _references.update { it - project.id }
        }
        projectDao.deleteProject(project.toEntity())
        return null
    }

    /** After signing in: the account's projects come to this device and this device's projects go to the account. */
    suspend fun onSignedIn(): String? {
        val client = api ?: return null
        val remote = try {
            client.get<ProjectPage>("/projects?source=MOBILE_AR_3D&limit=$PAGE_SIZE", authenticated = true).projects
        } catch (error: ApiException) {
            return error.message
        }
        val local = projectDao.getAllProjects().first().associateBy { it.id }
        val remoteIds = remote.mapNotNull { it.externalProjectId }.toSet()
        synchronized(syncedIds) {
            syncedIds.clear()
            syncedIds += remoteIds
        }
        _references.value = remote.referencesById()
        remote.filter { it.externalProjectId != null && it.externalProjectId !in local }
            .mapNotNull { it.toEntity() }
            .forEach { projectDao.insertProject(it) }
        var failure: String? = null
        local.values.filter { it.id !in remoteIds }.forEach { entity -> upload(entity)?.let { failure = it } }
        return failure
    }

    /** Reloads the account's references (when the Projects screens open); null on success. */
    suspend fun refreshReferences(): String? {
        val client = api ?: return null
        if (!isSignedIn()) return null
        return try {
            val remote = client.get<ProjectPage>("/projects?source=MOBILE_AR_3D&limit=$PAGE_SIZE", authenticated = true).projects
            synchronized(syncedIds) { syncedIds += remote.mapNotNull { it.externalProjectId } }
            _references.value = remote.referencesById()
            sendPendingWallPhotos(client)
            null
        } catch (error: ApiException) {
            error.message
        }
    }

    /** Wall photos that did not go with their project (offline, or an error) are retried here. */
    private suspend fun sendPendingWallPhotos(client: ApiClient) {
        if (wallPhotos == null) return
        val synced = synchronized(syncedIds) { syncedIds.toSet() }
        projectDao.getAllProjects().first().filter { it.id in synced }.forEach { sendWallPhoto(client, it) }
    }

    /** Best effort: a photo that fails to send never fails saving the project; it is tried again later. */
    private suspend fun sendWallPhoto(client: ApiClient, entity: ProjectEntity) {
        val photos = wallPhotos ?: return
        val surface = runCatching { SurfaceType.valueOf(entity.surfaceType) }.getOrNull() ?: return
        val key = "${entity.widthMeters}|${entity.heightMeters}|${entity.surfaceType}"
        val bytes = photos.photoToSend(entity.id, key, entity.widthMeters, entity.heightMeters, surface) ?: return
        try {
            client.uploadFile("PUT", "/projects/mobile/${encode(entity.id)}/wall-photo", "image", "wall.jpg", "image/jpeg", bytes)
            photos.markSent(entity.id, key)
        } catch (_: ApiException) {
            // Kept for the next save, sign-in or visit to Projects.
        }
    }

    /** After signing out: the account's projects leave the device; ones never uploaded stay. */
    suspend fun onSignedOut() {
        _references.value = emptyMap()
        val synced = synchronized(syncedIds) { syncedIds.toSet().also { syncedIds.clear() } }
        if (synced.isEmpty()) return
        projectDao.getAllProjects().first().filter { it.id in synced }.forEach { projectDao.deleteProject(it) }
    }

    private suspend fun upload(entity: ProjectEntity): String? {
        val client = api ?: return null
        val panel = catalog.value.firstOrNull { it.id == entity.selectedPanelId }
        // Saved without a price (e.g. measured signed out): the team still sees today's estimate.
        val cost = entity.estimatedCost ?: panel?.pricePerUnit?.let { it * entity.finalQuantity }
        val body = MobileProjectRequest(
            externalProjectId = entity.id,
            name = entity.name.trim().take(NAME_MAX),
            budget = cost?.takeIf { it > 0 },
            arMetadata = metadataJson.encodeToJsonElement(
                ProjectMetadata(
                    surfaceType = entity.surfaceType,
                    widthMeters = entity.widthMeters,
                    heightMeters = entity.heightMeters,
                    areaSquareMeters = entity.areaSquareMeters,
                    panelId = entity.selectedPanelId,
                    panelName = panel?.name,
                    panelSku = panel?.sku?.ifBlank { null },
                    panelWidthMeters = panel?.widthMeters,
                    panelHeightMeters = panel?.heightMeters,
                    baseQuantity = entity.baseQuantity,
                    wastePercent = entity.wastePercent,
                    finalQuantity = entity.finalQuantity,
                    estimatedCost = cost,
                    savedAt = entity.createdAt
                )
            ).jsonObject
        )
        return try {
            val saved = client.post<MobileProjectRequest, ProjectResponse>("/projects/mobile", body, authenticated = true).project
            synchronized(syncedIds) { syncedIds += entity.id }
            _references.update { it + (entity.id to saved.toReference()) }
            sendWallPhoto(client, entity)
            null
        } catch (error: ApiException) {
            error.message
        }
    }

    private fun List<ApiProject>.referencesById(): Map<String, ProjectReference> =
        mapNotNull { project -> project.externalProjectId?.let { it to project.toReference() } }.toMap()

    private fun ApiProject.toReference() = ProjectReference(
        backendId = id,
        code = projectCode ?: projectCodeFor(id, parseIsoMillis(createdAt) ?: System.currentTimeMillis())
    )

    /** A project saved from another device; null when its measurement can't be read. */
    private fun ApiProject.toEntity(): ProjectEntity? {
        val id = externalProjectId ?: return null
        val meta = arMetadata?.let { runCatching { metadataJson.decodeFromJsonElement<ProjectMetadata>(it) }.getOrNull() } ?: return null
        if (runCatching { SurfaceType.valueOf(meta.surfaceType) }.isFailure) return null
        return ProjectEntity(
            id = id,
            name = name,
            surfaceType = meta.surfaceType,
            widthMeters = meta.widthMeters,
            heightMeters = meta.heightMeters,
            areaSquareMeters = meta.areaSquareMeters,
            selectedPanelId = meta.panelId,
            baseQuantity = meta.baseQuantity,
            wastePercent = meta.wastePercent,
            finalQuantity = meta.finalQuantity,
            estimatedCost = meta.estimatedCost,
            createdAt = meta.savedAt ?: parseIsoMillis(createdAt) ?: System.currentTimeMillis()
        )
    }

    /** The measurement and estimate sent in the project's arMetadata (also read by the website). */
    @Serializable
    private data class ProjectMetadata(
        val surfaceType: String,
        val widthMeters: Double,
        val heightMeters: Double,
        val areaSquareMeters: Double,
        val panelId: String,
        val panelName: String? = null,
        val panelSku: String? = null,
        val panelWidthMeters: Double? = null,
        val panelHeightMeters: Double? = null,
        val baseQuantity: Int,
        val wastePercent: Int,
        val finalQuantity: Int,
        val estimatedCost: Double? = null,
        val savedAt: Long? = null
    )

    @Serializable
    private data class MobileProjectRequest(
        val externalProjectId: String,
        val name: String,
        val budget: Double?,
        val arMetadata: JsonObject
    )

    @Serializable
    private data class ApiProject(
        val id: String,
        val name: String,
        val externalProjectId: String? = null,
        val arMetadata: JsonObject? = null,
        val createdAt: String,
        /** Sent by the backend; worked out here the same way if it isn't. */
        val projectCode: String? = null
    )

    @Serializable
    private data class ProjectPage(val projects: List<ApiProject> = emptyList())

    @Serializable
    private data class ProjectResponse(val project: ApiProject)

    private companion object {
        const val PAGE_SIZE = 100
        const val NAME_MAX = 150
        val metadataJson = Json { ignoreUnknownKeys = true; explicitNulls = false }

        fun encode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}

private fun ProjectEntity.toDomain(panels: List<PVCPanel>): SavedProject {
    val panel = panels.find { it.id == selectedPanelId } ?: PVCPanel(
        id = selectedPanelId,
        name = "Unknown Panel",
        category = "Unknown",
        widthMeters = 0.0,
        heightMeters = 0.0,
        textureResource = ""
    )

    return SavedProject(
        id = id,
        name = name,
        measurement = MeasurementResult(
            widthMeters = widthMeters,
            heightMeters = heightMeters,
            areaSquareMeters = areaSquareMeters,
            surfaceType = SurfaceType.valueOf(surfaceType)
        ),
        selectedPanel = panel,
        estimation = Estimation(
            surfaceArea = areaSquareMeters,
            panelArea = panel.areaSquareMeters,
            baseQuantity = baseQuantity,
            wastePercent = wastePercent,
            finalQuantity = finalQuantity,
            estimatedCost = estimatedCost
        ),
        createdAt = createdAt
    )
}

private fun SavedProject.toEntity(): ProjectEntity {
    return ProjectEntity(
        id = id,
        name = name,
        surfaceType = measurement.surfaceType.name,
        widthMeters = measurement.widthMeters,
        heightMeters = measurement.heightMeters,
        areaSquareMeters = measurement.areaSquareMeters,
        selectedPanelId = selectedPanel.id,
        baseQuantity = estimation.baseQuantity,
        wastePercent = estimation.wastePercent,
        finalQuantity = estimation.finalQuantity,
        estimatedCost = estimation.estimatedCost,
        createdAt = createdAt
    )
}

/**
 * A project's reference code, as the backend makes it (project.code.ts): the
 * year it was saved in Philippine time and the first 8 hex digits of its id,
 * e.g. "PRJ-2026-1A2B3C4D".
 */
internal fun projectCodeFor(backendId: String, createdAtMillis: Long): String {
    val year = java.util.Calendar.getInstance(com.example.panelscan.core.util.ManilaTime.ZONE)
        .apply { timeInMillis = createdAtMillis }
        .get(java.util.Calendar.YEAR)
    return "PRJ-$year-${backendId.replace("-", "").take(8).uppercase()}"
}
