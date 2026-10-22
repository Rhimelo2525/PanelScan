export type ProjectSurfaceType = "WALL" | "CEILING"
export type ProjectMeasurementSource = "MOBILE_AR" | "MANUAL"
export type CustomerProjectStatus = "MEASURED" | "ESTIMATED" | "READY_FOR_REVIEW" | "COMPLETED"
export type WebPreviewStatus = "AVAILABLE" | "PROCESSING" | "NOT_AVAILABLE"

export interface CustomerMeasurementProject {
  id: string
  /** Reference code to quote to the PanelScan team, e.g. "PRJ-2026-1A2B3C4D". */
  projectCode: string
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
  /** Category of the selected panel, for the store's representative photo when the panel has none. */
  panelCategorySlug: string
  webPreviewStatus: WebPreviewStatus
  webPreviewAssetUrl: string | null
  /** The photo of the measured wall, outlined with its size by the app; null if none was saved. */
  wallPhotoUrl: string | null
  estimationSummary: string
}

export interface CustomerProjectResultSet {
  projects: CustomerMeasurementProject[]
  source: "API"
  notice: string
}

