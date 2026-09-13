import { BarChart3, Boxes, ClipboardList, HardHat, LayoutDashboard, MessageSquare, Package, ShieldCheck, Star, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { UserRole } from "@/types/auth"

export interface AdminNavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Roles the backend actually serves this section to. */
  roles: UserRole[]
  description: string
  end?: boolean
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

/**
 * Navigation mirrors backend authorization rather than the capstone's wish
 * list: installers are MODERATOR-only (the backend 403s an OWNER on every
 * installer route) and team administration is OWNER-only, so neither role is
 * shown a link it cannot use.
 */
export const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["OWNER", "MODERATOR"], description: "Business and operational snapshot", end: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/products", label: "Products", icon: Package, roles: ["OWNER", "MODERATOR"], description: "Architectural panel catalogue and specifications" },
      { to: "/admin/projects", label: "Projects", icon: ClipboardList, roles: ["OWNER", "MODERATOR"], description: "Customer project monitoring and management" },
      { to: "/admin/inventory", label: "Inventory", icon: Boxes, roles: ["OWNER", "MODERATOR"], description: "Stock levels, reorder thresholds, adjustments" },
      { to: "/admin/sales", label: "Sales", icon: BarChart3, roles: ["OWNER", "MODERATOR"], description: "Orders, revenue, and fulfilment status" },
      { to: "/admin/installers", label: "Installers", icon: HardHat, roles: ["MODERATOR"], description: "Installer directory and availability" },
    ],
  },
  {
    label: "Customers",
    items: [
      { to: "/admin/chat", label: "Support chat", icon: MessageSquare, roles: ["OWNER", "MODERATOR"], description: "Customer conversations" },
      { to: "/admin/feedback", label: "Feedback", icon: Star, roles: ["OWNER", "MODERATOR"], description: "Customer service ratings" },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/admin/requests", label: "Requests", icon: ShieldCheck, roles: ["OWNER", "MODERATOR"], description: "Moderator change requests and owner approvals" },
      { to: "/admin/team", label: "Team", icon: Users, roles: ["OWNER"], description: "Staff and customer accounts" },
    ],
  },
]

export function navGroupsForRole(role: UserRole): AdminNavGroup[] {
  return adminNavGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0)
}

export function isAdminRole(role: UserRole | undefined): boolean {
  return role === "OWNER" || role === "MODERATOR"
}

/** Where each role lands after signing in. */
export function landingPathForRole(role: UserRole): string {
  return isAdminRole(role) ? "/admin" : "/dashboard"
}
