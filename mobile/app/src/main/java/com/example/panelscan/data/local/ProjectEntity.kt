package com.example.panelscan.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.example.panelscan.core.model.SavedProject

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val surfaceType: String,
    val widthMeters: Double,
    val heightMeters: Double,
    val areaSquareMeters: Double,
    val selectedPanelId: String,
    val baseQuantity: Int,
    val wastePercent: Int,
    val finalQuantity: Int,
    val estimatedCost: Double?,
    val createdAt: Long
)
