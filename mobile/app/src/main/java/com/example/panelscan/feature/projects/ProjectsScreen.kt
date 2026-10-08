package com.example.panelscan.feature.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.ProjectCard
import com.example.panelscan.core.ui.ScreenScaffold

@Composable
fun ProjectsScreen(
    projects: List<SavedProject>,
    onOpenProject: (SavedProject) -> Unit,
    onStartMeasurement: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    ScreenScaffold(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            PanelScanTopBar(
                title = "Projects",
                subtitle = if (projects.isEmpty()) {
                    "Saved measurements and estimates"
                } else {
                    "${projects.size} saved ${if (projects.size == 1) "estimate" else "estimates"}"
                },
                large = true
            )

            if (projects.isEmpty()) {
                EmptyState(
                    icon = Icons.Rounded.Straighten,
                    title = "Nothing saved yet",
                    description = "Measure a wall or ceiling, pick a panel, and your estimate " +
                        "will be kept here for later.",
                    actionLabel = "Start a measurement",
                    onAction = onStartMeasurement,
                    modifier = Modifier.padding(top = Spacing.xl)
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = Spacing.gutter,
                        end = Spacing.gutter,
                        top = Spacing.xs,
                        bottom = bottomPadding + Spacing.xl
                    ),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    items(projects, key = { it.id }) { project ->
                        ProjectCard(
                            project = project,
                            onClick = { onOpenProject(project) },
                            modifier = Modifier.animateItem()
                        )
                    }
                    item {
                        Text(
                            text = "Estimates include a 10% waste allowance.",
                            style = PanelScan.type.supporting,
                            color = PanelScan.colors.textTertiary,
                            modifier = Modifier.padding(top = Spacing.xs)
                        )
                    }
                }
            }
        }
    }
}
