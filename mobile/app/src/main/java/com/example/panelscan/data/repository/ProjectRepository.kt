package com.example.panelscan.data.repository

import com.example.panelscan.core.model.*
import com.example.panelscan.data.local.ProjectDao
import com.example.panelscan.data.local.ProjectEntity
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class ProjectRepository(
    private val projectDao: ProjectDao,
    /** The live catalogue; a project shows its panel once the catalogue has loaded. */
    private val catalog: StateFlow<List<PVCPanel>>
) {
    val allProjects: Flow<List<SavedProject>> = combine(projectDao.getAllProjects(), catalog) { entities, panels ->
        entities.map { it.toDomain(panels) }
    }

    suspend fun getProjectById(id: String): SavedProject? {
        return projectDao.getProjectById(id)?.toDomain(catalog.value)
    }

    suspend fun saveProject(project: SavedProject) {
        projectDao.insertProject(project.toEntity())
    }

    suspend fun deleteProject(project: SavedProject) {
        projectDao.deleteProject(project.toEntity())
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
