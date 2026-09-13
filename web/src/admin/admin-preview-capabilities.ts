export type AdminPreviewRole = "OWNER" | "MODERATOR"

export interface AdminPreviewCapabilities {
  manageBusiness: boolean
  manageProducts: boolean
  manageInventory: boolean
  manageSales: boolean
  manageInstallers: boolean
  manageProjects: boolean
  manageSupport: boolean
  manageRequests: boolean
  manageModerators: boolean
}

/**
 * Frontend preview configuration only. This describes the intended interface;
 * it is not authentication or authorization and must eventually be enforced by
 * the PanelScan backend.
 */
export const adminPreviewCapabilities: Record<AdminPreviewRole, AdminPreviewCapabilities> = {
  OWNER: {
    manageBusiness: true,
    manageProducts: false,
    manageInventory: true,
    manageSales: true,
    manageInstallers: true,
    manageProjects: true,
    manageSupport: false,
    manageRequests: true,
    manageModerators: true,
  },
  MODERATOR: {
    manageBusiness: true,
    manageProducts: true,
    manageInventory: true,
    manageSales: true,
    manageInstallers: true,
    manageProjects: true,
    manageSupport: true,
    manageRequests: false,
    manageModerators: false,
  },
}

export function canViewPreviewSection(role: AdminPreviewRole, section: string) {
  const normalized = section === "orders" ? "sales" : section
  if (normalized === "customers") return false
  if (normalized === "moderators") return adminPreviewCapabilities[role].manageModerators
  if (normalized === "support") return adminPreviewCapabilities[role].manageSupport
  return true
}
