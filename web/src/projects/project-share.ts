import { createConversation, postMessage } from "@/api/support"
import { formatPesos } from "@/lib/format-price"
import type { CustomerMeasurementProject } from "@/types/customer-project"

/** Longest note a customer can add when sending a project (the chat allows 2000 characters in all). */
export const SHARE_NOTE_MAX_LENGTH = 1000

/**
 * The support-chat message that shares a project with the PanelScan team.
 * Its project code is what the chat turns into a link to the project.
 */
export function projectShareMessage(project: CustomerMeasurementProject, note: string): string {
  const details = [project.name]
  if (project.selectedPanel && project.requiredPanelQuantity !== null) details.push(`${project.requiredPanelQuantity} × ${project.selectedPanel.name}`)
  if (project.estimatedMaterialCost !== null) details.push(`Est. ${formatPesos(project.estimatedMaterialCost, true)}`)
  const lines = [`Project shared: ${project.projectCode}`, details.join(" · ")]
  const text = note.trim()
  if (text) lines.push("", text)
  return lines.join("\n")
}

/** Sends the project to the customer's ongoing support conversation (opening one if they have none). */
export async function shareProjectWithTeam(project: CustomerMeasurementProject, note: string): Promise<void> {
  const conversation = await createConversation()
  await postMessage(conversation.id, projectShareMessage(project, note))
}
