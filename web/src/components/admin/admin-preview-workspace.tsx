import { ArrowLeft, BarChart3, Boxes, ClipboardList, Eye, HardHat, LayoutDashboard, LockKeyhole, MessageSquare, PackageSearch, ShieldCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { canViewPreviewSection } from "@/admin/admin-preview-capabilities"
import type { AdminPreviewRole } from "@/admin/admin-preview-capabilities"
import { AdminOperationalPreview } from "@/components/admin/admin-operational-preview"
import { ModeratorManagementPreview } from "@/components/admin/moderator-management-preview"
import { BusinessManagementPreview } from "@/components/admin/business-management-preview"
import { ProductManagementPreview } from "@/components/admin/product-management-preview"
import { ModeratorSupportPreview } from "@/components/admin/moderator-support-preview"
import { BrandMark } from "@/components/layout/brand"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { adminReviewSections } from "@/data/admin-review"
import { cn } from "@/lib/utils"

const sectionIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: PackageSearch,
  inventory: Boxes,
  sales: BarChart3,
  installers: HardHat,
  moderators: ShieldCheck,
  requests: ShieldCheck,
  projects: ClipboardList,
  support: MessageSquare,
}

const roleConfig: Record<AdminPreviewRole, { label: string; name: string; initials: string; counterpartLabel: string; counterpartPath: string }> = {
  OWNER: { label: "Owner", name: "Demo Owner", initials: "DO", counterpartLabel: "View as Moderator", counterpartPath: "/moderator-preview" },
  MODERATOR: { label: "Moderator", name: "Sample Moderator", initials: "SM", counterpartLabel: "View Owner Preview", counterpartPath: "/admin-preview" },
}

export function AdminPreviewWorkspace({ role }: { role: AdminPreviewRole }) {
  const config = roleConfig[role]
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSection = searchParams.get("view")
  const requestedSection = rawSection === "orders" ? "sales" : rawSection
  const sections = useMemo(() => adminReviewSections.filter((section) => canViewPreviewSection(role, section.id)), [role])
  const accessDenied = !canViewPreviewSection(role, requestedSection ?? "dashboard")
  const section = sections.find((item) => item.id === requestedSection) ?? sections[0]

  function selectSection(id: string) {
    setSearchParams(id === "dashboard" ? {} : { view: id })
  }

  return (
    <div className="admin-surface min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a href="#admin-preview-content" className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0">Skip to preview content</a>
      <aside className="hidden min-h-screen border-r border-border bg-card lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-4"><BrandMark className="size-8" /><span className="leading-tight"><span className="block text-sm font-semibold">PanelScan Admin</span><span className="block text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">{config.label} Preview</span></span></div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={`${config.label} preview sections`}>
            <p className="px-2.5 pb-2 text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Business workspace</p>
            <ul className="space-y-0.5">
              {sections.map((item) => {
                const Icon = sectionIcons[item.id] ?? Eye
                const active = !accessDenied && item.id === section.id
                return <li key={item.id}><button type="button" onClick={() => selectSection(item.id)} aria-current={active ? "page" : undefined} className={cn("admin-nav-link flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none", active && "bg-secondary text-foreground")}><Icon className="size-4 shrink-0" aria-hidden="true" />{item.label}</button></li>
              })}
            </ul>
          </nav>
          <div className="space-y-1 border-t border-border p-3"><Button variant="ghost" size="sm" className="w-full justify-start" asChild><Link to={config.counterpartPath}><ShieldCheck data-icon="inline-start" aria-hidden="true" />{config.counterpartLabel}</Link></Button><Button variant="ghost" size="sm" className="w-full justify-start" asChild><Link to="/"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Storefront</Link></Button></div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Eye className="size-4 text-primary" aria-hidden="true" /><span className="text-sm font-semibold">{config.label} Preview</span><span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase">Session only</span></div>
            <div className="flex items-center gap-2"><Button variant="ghost" size="sm" asChild><Link to={config.counterpartPath}>{config.counterpartLabel}</Link></Button><div className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 py-1 pr-2.5 pl-1"><Avatar className="size-7"><AvatarFallback className="bg-primary text-[0.65rem] text-primary-foreground">{config.initials}</AvatarFallback></Avatar><span className="leading-tight"><span className="block text-xs font-medium">{config.name}</span><span className="block text-[0.65rem] text-muted-foreground">{config.label}</span></span></div></div>
          </div>
        </header>

        <main id="admin-preview-content" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <section className="mb-6 rounded-lg border border-[color-mix(in_oklch,var(--status-info),transparent_70%)] bg-[var(--status-info-surface)] p-4" aria-label={`${config.label} preview notice`}>
            <p className="text-sm font-semibold text-[var(--status-info)]">{config.label} Preview · Operational Mode</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Preview mode — changes are not persisted. Fictional sample data and controls demonstrate the intended business workflow without creating accounts, calling APIs, or changing production data.</p>
          </section>

          <div className="mb-6 lg:hidden"><label htmlFor={`${role.toLowerCase()}-preview-view`} className="text-xs font-semibold text-muted-foreground">Business view</label><select id={`${role.toLowerCase()}-preview-view`} value={accessDenied ? "access-denied" : section.id} onChange={(event) => selectSection(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">{accessDenied && <option value="access-denied" disabled>Section unavailable for this role</option>}{sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>

          {accessDenied ? requestedSection === "support" ? <section className="surface-card p-6"><h1 className="text-xl font-semibold">Support is a Moderator workspace</h1><p className="mt-3 text-sm text-muted-foreground">Owner oversight does not include customer chat or feedback operations.</p><Button className="mt-5" onClick={() => selectSection("dashboard")}>Return to dashboard</Button></section> : requestedSection === "customers" ? <section className="surface-card mx-auto max-w-xl p-8 text-center" aria-labelledby="customers-retired-title"><h1 id="customers-retired-title" className="text-xl font-semibold">Customer directory unavailable</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">The customer accounts tab has been removed from preview workspaces. Customer information remains accessible within orders, support conversations, and product reviews.</p><Button className="mt-6" onClick={() => selectSection("dashboard")}>Return to dashboard</Button></section> : <ModeratorAccessDenied onReturn={() => selectSection("dashboard")} /> : section.id === "moderators" ? <ModeratorManagementPreview /> : section.id === "products" ? <ProductManagementPreview role={role} /> : section.id === "support" ? <ModeratorSupportPreview /> : section.id === "inventory" || section.id === "installers" ? <BusinessManagementPreview key={section.id} kind={section.id} role={role} /> : <AdminOperationalPreview key={section.id} role={role} section={section} icon={sectionIcons[section.id]} />}
        </main>
      </div>
    </div>
  )
}

function ModeratorAccessDenied({ onReturn }: { onReturn: () => void }) {
  return <section className="surface-card mx-auto max-w-xl p-8 text-center" aria-labelledby="moderator-access-denied-title"><span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><LockKeyhole className="size-5" aria-hidden="true" /></span><p className="mt-5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Owner-only capability</p><h1 id="moderator-access-denied-title" className="mt-2 text-xl font-semibold">Moderator management is unavailable</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Moderators share PanelScan&apos;s operational business tools, but they cannot view, create, edit, disable, or remove moderator accounts.</p><Button className="mt-6" onClick={onReturn}>Return to dashboard</Button></section>
}
