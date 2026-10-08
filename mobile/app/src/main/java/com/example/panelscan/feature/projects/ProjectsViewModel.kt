package com.example.panelscan.feature.projects

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.data.repository.ProjectRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ProjectsViewModel(
    private val repository: ProjectRepository,
    private val onProjectSaved: ((SavedProject) -> Unit)? = null
) : ViewModel() {
    val projects: StateFlow<List<SavedProject>> = repository.allProjects
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    fun saveProject(project: SavedProject) {
        viewModelScope.launch {
            repository.saveProject(project)
            onProjectSaved?.invoke(project)
        }
    }

    fun deleteProject(project: SavedProject) {
        viewModelScope.launch { repository.deleteProject(project) }
    }
}
