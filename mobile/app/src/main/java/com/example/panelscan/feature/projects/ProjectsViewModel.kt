package com.example.panelscan.feature.projects

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.data.repository.ProjectRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ProjectsViewModel(private val repository: ProjectRepository) : ViewModel() {
    val projects: StateFlow<List<SavedProject>> = repository.allProjects
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    /** Saved on the device at once; an upload that fails is retried at the next sign-in. */
    fun saveProject(project: SavedProject) {
        viewModelScope.launch { repository.saveProject(project) }
    }

    /** [onResult] gets null when deleted, else why it could not be (e.g. the team is already on it). */
    fun deleteProject(project: SavedProject, onResult: (String?) -> Unit = {}) {
        viewModelScope.launch { onResult(repository.deleteProject(project)) }
    }
}
