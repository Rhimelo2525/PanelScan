import { apiRequest } from "@/api/client"
import type { CustomerProjectResultSet, CustomerProjectStatus } from "@/types/customer-project"
import type { AdminProject, Pagination } from "@/types/admin"

export async function listCustomerProjectResults(signal?: AbortSignal): Promise<CustomerProjectResultSet> {
  try {
    const data = await apiRequest<{ projects: AdminProject[]; pagination: Pagination }>("/projects", {
      authenticated: true,
      signal,
    })

    const projects = data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      roomName: p.description ?? "Main Space",
      surfaceType: "WALL" as const,
      measuredAt: p.createdAt,
      widthMeters: 0,
      heightMeters: 0,
      areaSquareMeters: 0,
      selectedPanel: null,
      requiredPanelQuantity: null,
      estimatedMaterialCost: p.budget ? Number(p.budget) : null,
      status: (p.status === "COMPLETED" ? "COMPLETED" : "READY_FOR_REVIEW") as CustomerProjectStatus,

      measurementSource: "MANUAL" as const,
      previewImageUrl: null,
      webPreviewStatus: "NOT_AVAILABLE" as const,
      webPreviewAssetUrl: null,
      estimationSummary: p.notes ?? p.description ?? "Saved project.",
    }))

    return {
      projects,
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

