package com.example.panelscan.feature.projects

import com.example.panelscan.core.model.SavedProject
import java.util.Locale

/** Longest note a customer can add when sending a project (the chat allows 2000 characters in all). */
const val SHARE_NOTE_MAX_LENGTH = 1000

/** A project code anywhere in a chat message, e.g. "PRJ-2026-1A2B3C4D". */
val PROJECT_CODE_IN_TEXT = Regex("""\bPRJ-\d{4}-[0-9A-F]{8}\b""", RegexOption.IGNORE_CASE)

/**
 * The support-chat message that shares a project with the PanelScan team, as
 * the website sends it. Its project code is what the chat (here and on the
 * website) turns into a link to the project.
 */
fun projectShareMessage(code: String, project: SavedProject, note: String): String {
    val quantity = project.estimation.finalQuantity
    val cost = project.estimation.estimatedCost
        ?: project.selectedPanel.pricePerUnit?.let { it * quantity }
    val details = buildList {
        add(project.name)
        add("$quantity × ${project.selectedPanel.name}")
        cost?.let { add("Est. " + String.format(Locale.US, "₱%,.2f", it)) }
    }
    return buildString {
        append("Project shared: ").append(code).append('\n')
        append(details.joinToString(" · "))
        note.trim().takeIf { it.isNotEmpty() }?.let { append("\n\n").append(it) }
    }
}
