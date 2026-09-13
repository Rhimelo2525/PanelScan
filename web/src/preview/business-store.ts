import { useSyncExternalStore } from "react"

import { adminPreviewCapabilities } from "@/admin/admin-preview-capabilities"
import type { AdminPreviewRole } from "@/admin/admin-preview-capabilities"
import { adminReviewSections } from "@/data/admin-review"
import type { AdminReviewRow } from "@/data/admin-review"
import { validateProjectRecord } from "@/preview/business-validation"

// In-memory preview only. Shared across route/role changes; reload starts over.
const records = new Map(adminReviewSections.map((section) => [section.id, section.rows.map((row) => ({ ...row }))]))
const listeners = new Set<() => void>()
const empty: AdminReviewRow[] = []

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getBusinessRows(section: string): AdminReviewRow[] {
  return records.get(section) ?? empty
}

export function setBusinessRows(section: string, rows: AdminReviewRow[]): void {
  records.set(section, rows)
  listeners.forEach((listener) => listener())
}

export function resolveProjectForOrder(orderRow: AdminReviewRow, projectList?: AdminReviewRow[]): AdminReviewRow | undefined {
  const list = projectList ?? getBusinessRows("projects")
  return list.find(
    (p) =>
      p.id === orderRow.projectId ||
      p.orderId === orderRow.id ||
      (orderRow.order && p.orderNumber === orderRow.order) ||
      (orderRow.customer && p.customer?.trim().toLowerCase() === orderRow.customer?.trim().toLowerCase())
  )
}

export function updateProjectRecord(
  role: AdminPreviewRole,
  projectId: string,
  updates: { status: string; surface?: string; notes?: string }
): { success: boolean; errors?: Record<string, string>; project?: AdminReviewRow } {
  if (!adminPreviewCapabilities[role]?.manageProjects) {
    return { success: false, errors: { form: "This role does not have permission to manage projects." } }
  }

  const errors = validateProjectRecord(updates)
  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  const currentProjects = getBusinessRows("projects")
  const target = currentProjects.find((p) => p.id === projectId)
  if (!target) {
    return { success: false, errors: { form: "Project not found." } }
  }

  const updatedProject: AdminReviewRow = {
    ...target,
    status: updates.status,
    ...(updates.surface !== undefined ? { surface: updates.surface.trim() } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes.trim() } : {}),
  }

  setBusinessRows(
    "projects",
    currentProjects.map((p) => (p.id === projectId ? updatedProject : p))
  )

  // Synchronize linked sales/order records
  const currentSales = getBusinessRows("sales")
  const updatedSales = currentSales.map((order) => {
    if (order.projectId === projectId || order.id === target.orderId || order.customer === target.customer) {
      return {
        ...order,
        projectStatus: updates.status,
        ...(updates.surface ? { projectSurface: updates.surface.trim() } : {}),
      }
    }
    return order
  })
  setBusinessRows("sales", updatedSales)

  return { success: true, project: updatedProject }
}

export function useBusinessRows(section: string) {
  const rows = useSyncExternalStore(subscribe, () => records.get(section) ?? empty)
  function updateRows(update: (previous: AdminReviewRow[]) => AdminReviewRow[]) {
    records.set(section, update(records.get(section) ?? empty))
    listeners.forEach((listener) => listener())
  }
  return [rows, updateRows] as const
}
