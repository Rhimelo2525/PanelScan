package com.example.panelscan.data.repository

import com.example.panelscan.core.model.*
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import com.example.panelscan.data.local.ProjectDao
import com.example.panelscan.data.local.ProjectEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
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
 * "My Projects" page and the team see. Like the cart: projects saved while
 * signed out join the account at the next sign-in, and the account's projects
 * leave the device at sign-out.
 */
class ProjectRepository(
    private val projectDao: ProjectDao,
    /** The live catalogue; a project shows its panel once the catalogue has loaded. */
    private val catalog: StateFlow<List<PVCPanel>>,
    private val api: ApiClient? = null,
    private val isSignedIn: () -> Boolean = { false }
) {
    /** App project ids known to be saved on the account. */
    private val syncedIds = mutableSetOf<String>()

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
        remote.filter { it.externalProjectId != null && it.externalProjectId !in local }
            .mapNotNull { it.toEntity() }
            .forEach { projectDao.insertProject(it) }
        var failure: String? = null
        local.values.filter { it.id !in remoteIds }.forEach { entity -> upload(entity)?.let { failure = it } }
        return failure
    }

    /** After signing out: the account's projects leave the device; ones never uploaded stay. */
    suspend fun onSignedOut() {
        val synced = synchronized(syncedIds) { syncedIds.toSet().also { syncedIds.clear() } }
        if (synced.isEmpty()) return
        projectDao.getAllProjects().first().filter { it.id in synced }.forEach { projectDao.deleteProject(it) }
    }

    private suspend fun upload(entity: ProjectEntity): String? {
        val client = api ?: return null
        val panel = catalog.value.firstOrNull { it.id == entity.selectedPanelId }
        val body = MobileProjectRequest(
            externalProjectId = entity.id,
            name = entity.name.trim().take(NAME_MAX),
            budget = entity.estimatedCost?.takeIf { it > 0 },
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
                    estimatedCost = entity.estimatedCost,
                    savedAt = entity.createdAt
                )
            ).jsonObject
        )
        return try {
            client.post<MobileProjectRequest, ProjectResponse>("/projects/mobile", body, authenticated = true)
            synchronized(syncedIds) { syncedIds += entity.id }
            null
        } catch (error: ApiException) {
            error.message
        }
    }

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
        val createdAt: String
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
