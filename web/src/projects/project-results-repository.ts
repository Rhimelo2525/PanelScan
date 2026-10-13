import { apiRequest } from "@/api/client"
import { getProductById } from "@/api/products"
import type { CustomerMeasurementProject, CustomerProjectResultSet, CustomerProjectStatus } from "@/types/customer-project"
import type { AdminProject, Pagination } from "@/types/admin"

const toNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
const toText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)

/**
 * A project saved in the mobile app. The app sends its measurement and panel
 * estimate in arMetadata (surfaceType, widthMeters, heightMeters,
 * areaSquareMeters, panelId, panelName, panelSku, finalQuantity, wastePercent,
 * estimatedCost).
 */
function toCustomerProject(p: AdminProject): CustomerMeasurementProject {
  const meta = (p.arMetadata ?? {}) as Record<string, unknown>
  const panelId = toText(meta.panelId)
  const panelName = toText(meta.panelName)
  const quantity = toNumber(meta.finalQuantity)
  const waste = toNumber(meta.wastePercent)
  const estimate = panelName && quantity !== null
    ? `${quantity} × ${panelName}${waste ? `, including a ${waste}% cutting allowance` : ""}.`
    : null
  return {
    id: p.id,
    projectCode: p.projectCode,
    name: p.name,
    roomName: p.description ?? "Main Space",
    surfaceType: meta.surfaceType === "CEILING" ? "CEILING" : "WALL",
    measuredAt: p.createdAt,
    widthMeters: toNumber(meta.widthMeters) ?? 0,
    heightMeters: toNumber(meta.heightMeters) ?? 0,
    areaSquareMeters: toNumber(meta.areaSquareMeters) ?? 0,
    selectedPanel: panelId && panelName ? { id: panelId, name: panelName, sku: toText(meta.panelSku) ?? "" } : null,
    requiredPanelQuantity: quantity,
    estimatedMaterialCost: toNumber(meta.estimatedCost) ?? (p.budget ? Number(p.budget) : null),
    status: (p.status === "COMPLETED" ? "COMPLETED" : "READY_FOR_REVIEW") as CustomerProjectStatus,

    measurementSource: "MANUAL" as const,
    previewImageUrl: null,
    webPreviewStatus: "NOT_AVAILABLE" as const,
    webPreviewAssetUrl: null,
    estimationSummary: p.notes ?? estimate ?? p.description ?? "Saved project.",
  }
}

export async function listCustomerProjectResults(signal?: AbortSignal): Promise<CustomerProjectResultSet> {
  try {
    const data = await apiRequest<{ projects: AdminProject[]; pagination: Pagination }>("/projects?source=MOBILE_AR_3D", {
      authenticated: true,
      signal,
    })

    return {
      projects: await withPanelCostFallback(data.projects.map(toCustomerProject), signal),
      source: "API",
      notice: "",
    }
  } catch {
    return {
      projects: [],
      source: "API",
      notice: "",
    }
  }
}

/**
 * Projects saved by older app builds carry no estimated cost. Like the app,
 * fall back to the panel's current price × the panel quantity. A panel that
 * can no longer be loaded (deleted, no price) simply stays "Not estimated".
 */
async function withPanelCostFallback(projects: CustomerMeasurementProject[], signal?: AbortSignal): Promise<CustomerMeasurementProject[]> {
  const panelIds = [...new Set(projects
    .filter((p) => p.estimatedMaterialCost === null && p.requiredPanelQuantity !== null && p.selectedPanel)
    .map((p) => p.selectedPanel!.id))]
  if (panelIds.length === 0) return projects

  const prices = new Map<string, number>()
  await Promise.all(panelIds.map(async (id) => {
    try {
      const price = Number((await getProductById(id, signal))?.price)
      if (Number.isFinite(price) && price > 0) prices.set(id, price)
    } catch {
      // Leave this panel's projects unestimated.
    }
  }))

  return projects.map((p) => {
    const price = p.selectedPanel ? prices.get(p.selectedPanel.id) : undefined
    return p.estimatedMaterialCost === null && p.requiredPanelQuantity !== null && price !== undefined
      ? { ...p, estimatedMaterialCost: price * p.requiredPanelQuantity }
      : p
  })
}
