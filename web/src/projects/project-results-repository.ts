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
    panelCategorySlug: meta.surfaceType === "CEILING" ? "ceiling-panels" : "wall-panels",
    webPreviewStatus: "NOT_AVAILABLE" as const,
    webPreviewAssetUrl: null,
    wallPhotoUrl: p.wallPhotoUrl ?? null,
    estimationSummary: p.notes ?? estimate ?? p.description ?? "Saved project.",
  }
}

const PAGE_SIZE = 100

/** Every one of the customer's app projects: the page searches and filters them all, not just the first page. */
async function fetchAllMobileProjects(signal?: AbortSignal): Promise<AdminProject[]> {
  const projects: AdminProject[] = []
  for (let page = 1; ; page += 1) {
    const data = await apiRequest<{ projects: AdminProject[]; pagination: Pagination }>(`/projects?source=MOBILE_AR_3D&limit=${PAGE_SIZE}&page=${page}`, {
      authenticated: true,
      signal,
    })
    projects.push(...data.projects)
    if (page >= data.pagination.totalPages) return projects
  }
}

export async function listCustomerProjectResults(signal?: AbortSignal): Promise<CustomerProjectResultSet> {
  try {
    const projects = await fetchAllMobileProjects(signal)

    return {
      projects: await withPanelDetails(projects.map(toCustomerProject), signal),
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
 * Adds what the app shows from the selected panel's product: its photo as
 * the project thumbnail and, for projects saved by older app builds without
 * an estimated cost, the panel's current price × the panel quantity. A panel
 * that can no longer be loaded keeps the icon and stays "Not estimated".
 */
async function withPanelDetails(projects: CustomerMeasurementProject[], signal?: AbortSignal): Promise<CustomerMeasurementProject[]> {
  const panelIds = [...new Set(projects.flatMap((p) => (p.selectedPanel ? [p.selectedPanel.id] : [])))]
  if (panelIds.length === 0) return projects

  const panels = new Map<string, { price: number | null; imageUrl: string | null; categorySlug: string }>()
  await Promise.all(panelIds.map(async (id) => {
    try {
      const product = await getProductById(id, signal)
      if (!product) return
      const price = Number(product.price)
      const image = product.images.find((img) => img.isPrimary) ?? product.images[0]
      panels.set(id, { price: Number.isFinite(price) && price > 0 ? price : null, imageUrl: image?.url ?? null, categorySlug: product.category.slug })
    } catch {
      // Leave this panel's projects as saved.
    }
  }))

  return projects.map((p) => {
    const panel = p.selectedPanel ? panels.get(p.selectedPanel.id) : undefined
    if (!panel) return p
    const cost = p.estimatedMaterialCost ?? (p.requiredPanelQuantity !== null && panel.price !== null ? panel.price * p.requiredPanelQuantity : null)
    return { ...p, estimatedMaterialCost: cost, previewImageUrl: p.previewImageUrl ?? panel.imageUrl, panelCategorySlug: panel.categorySlug }
  })
}
