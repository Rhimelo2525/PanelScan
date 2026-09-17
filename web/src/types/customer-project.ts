export type ProjectSurfaceType = "WALL" | "CEILING"
export type ProjectMeasurementSource = "MOBILE_AR" | "MANUAL"
export type CustomerProjectStatus = "MEASURED" | "ESTIMATED" | "READY_FOR_REVIEW" | "COMPLETED"
export type WebPreviewStatus = "AVAILABLE" | "PROCESSING" | "NOT_AVAILABLE"

export interface CustomerMeasurementProject {
  id: string
  name: string
  roomName: string
  surfaceType: ProjectSurfaceType
  measuredAt: string
  widthMeters: number
  heightMeters: number
  areaSquareMeters: number
  selectedPanel: {
    id: string
    name: string
    sku: string
  } | null
  requiredPanelQuantity: number | null
  estimatedMaterialCost: number | null
  status: CustomerProjectStatus
  measurementSource: ProjectMeasurementSource
  previewImageUrl: string | null
  webPreviewStatus: WebPreviewStatus
  webPreviewAssetUrl: string | null
  estimationSummary: string
}

export interface CustomerProjectResultSet {
  projects: CustomerMeasurementProject[]
  source: "API"
  notice: string
}

