import { ArrowLeft, Box, CalendarDays, Calculator, Maximize2, PanelsTopLeft, Ruler, Smartphone, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { StatusBadge } from "@/components/admin/status-badge"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatPesos } from "@/lib/format-price"
import { listCustomerProjectResults } from "@/projects/project-results-repository"
import type { CustomerMeasurementProject, CustomerProjectResultSet } from "@/types/customer-project"

const date = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" })

export function CustomerProjectsPage({ previewMode = false }: { previewMode?: boolean }) {
  useDocumentTitle(previewMode ? "Project results preview | PanelScan" : "Your projects | PanelScan")
  const [result, setResult] = useState<CustomerProjectResultSet | null>(null)

  useEffect(() => { void listCustomerProjectResults().then(setResult) }, [])

  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-12 sm:py-16">
        <Container>
          <Button variant="ghost" size="sm" className="-ml-2.5 mb-6" asChild><Link to={previewMode ? "/" : "/dashboard"}><ArrowLeft data-icon="inline-start" aria-hidden="true" />{previewMode ? "Back to storefront" : "Back to dashboard"}</Link></Button>
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
            <div>
              <p className="section-eyebrow">Projects and measurements</p>
              <h1 className="type-h1 mt-4">Your saved AR &amp; 3D project results.</h1>
              <p className="type-lead mt-5 max-w-3xl">Review measurements, panel estimates, and mobile-generated project summaries in one place. Measurement happens in the PanelScan mobile app—the website only displays results saved to your account.</p>
            </div>
            <div className="surface-card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="size-4 text-primary" aria-hidden="true" />Mobile measurement, web review</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">The web portal does not request camera access or run AR. Compatible 3D files may be viewable here after mobile and backend integration is available.</p>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-10 sm:py-14">
        {previewMode && <div className="mb-6 rounded-lg border border-[color-mix(in_oklch,var(--status-info),transparent_70%)] bg-[var(--status-info-surface)] p-4"><p className="text-sm font-semibold text-[var(--status-info)]">Customer project preview</p><p className="mt-1 text-sm leading-6 text-muted-foreground">This public review route contains fictional sample records only. It is not a customer account and displays no private project data.</p></div>}
        {result?.source === "DEMO_FALLBACK" && <div className="mb-8 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4" role="status"><div><p className="text-sm font-semibold">Preview data</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{result.notice}</p></div><span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium">Not synced</span></div>}

        {!result ? <ProjectListSkeleton /> : result.projects.length === 0 ? <ProjectEmptyState /> : (
          <div className="space-y-7">
            {result.projects.map((project) => <ProjectResultCard key={project.id} project={project} />)}
          </div>
        )}

        <section className="mt-10 rounded-xl bg-primary p-6 text-primary-foreground sm:p-8" aria-labelledby="measurement-guidance-title">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div><p className="text-xs font-semibold tracking-[0.15em] text-primary-foreground/55 uppercase">Measurement guidance</p><h2 id="measurement-guidance-title" className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Verify before ordering, cutting, or installation.</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-primary-foreground/70">Mobile AR and 3D estimates are assistive planning tools. Device capability, calibration, lighting, surface detection, obstructions, and user input can affect results. Confirm dimensions and material coverage with the installation team before final work.</p></div>
            <Button variant="secondary" asChild><Link to="/products">Browse PVC panels</Link></Button>
          </div>
        </section>
      </Container>
    </>
  )
}

function ProjectResultCard({ project }: { project: CustomerMeasurementProject }) {
  return (
    <article className="surface-panel overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(17rem,0.78fr)_minmax(0,1.22fr)]">
        <div className="relative min-h-64 overflow-hidden bg-secondary lg:min-h-full">
          {project.previewImageUrl ? <img src={project.previewImageUrl} alt={`Representative preview for ${project.name}`} className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 grid place-items-center"><PanelsTopLeft className="size-10 text-muted-foreground" aria-hidden="true" /></div>}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-5 pt-14 pb-5 text-white"><p className="text-xs font-medium text-white/72">Representative project thumbnail</p><p className="mt-1 font-semibold">{project.roomName}</p></div>
        </div>

        <div className="p-5 sm:p-7 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={project.status} /><span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium"><Smartphone className="size-3" aria-hidden="true" />Measured with Mobile AR</span></div><h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em]">{project.name}</h2><p className="mt-1.5 text-sm text-muted-foreground">{project.roomName} · {project.surfaceType === "WALL" ? "Wall surface" : "Ceiling surface"}</p></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden="true" />{date.format(new Date(project.measuredAt))}</div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MeasurementStat icon={Ruler} label="Width" value={`${project.widthMeters.toFixed(2)} m`} />
            <MeasurementStat icon={Ruler} label="Height" value={`${project.heightMeters.toFixed(2)} m`} />
            <MeasurementStat icon={Maximize2} label="Calculated area" value={`${project.areaSquareMeters.toFixed(2)} m²`} />
            <MeasurementStat icon={Calculator} label="Required panels" value={project.requiredPanelQuantity === null ? "Not estimated" : String(project.requiredPanelQuantity)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-border bg-secondary/35 p-5" aria-label="Material estimate">
              <div className="flex items-center gap-2"><Calculator className="size-4 text-primary" aria-hidden="true" /><h3 className="font-semibold">Estimation summary</h3></div>
              <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Selected PVC panel</dt><dd className="mt-1 font-medium">{project.selectedPanel?.name ?? "Not selected"}</dd>{project.selectedPanel && <dd className="mt-0.5 text-xs text-muted-foreground">{project.selectedPanel.sku}</dd>}</div><div><dt className="text-xs text-muted-foreground">Estimated material cost</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{project.estimatedMaterialCost === null ? "Not estimated" : formatPesos(project.estimatedMaterialCost, true)}</dd></div></dl>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">{project.estimationSummary}</p>
            </section>

            <section className="rounded-lg border border-border bg-card p-5" aria-label="3D preview result">
              <div className="flex items-center gap-2"><Box className="size-4 text-primary" aria-hidden="true" /><h3 className="font-semibold">3D preview result</h3></div>
              {project.webPreviewStatus === "AVAILABLE" && project.webPreviewAssetUrl ? <p className="mt-4 text-sm leading-6 text-muted-foreground">A compatible web-viewable project asset is available.</p> : <div className="mt-4"><div className="grid size-12 place-items-center rounded-lg bg-secondary"><Sparkles className="size-5 text-primary" aria-hidden="true" /></div><p className="mt-3 text-sm font-medium">{project.webPreviewStatus === "PROCESSING" ? "Preview asset is being prepared" : "No web-viewable asset yet"}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">The mobile app will create and save project results. This portal will display a 3D preview only when the backend provides a compatible asset.</p></div>}
            </section>
          </div>
        </div>
      </div>
    </article>
  )
}

function MeasurementStat({ icon: Icon, label, value }: { icon: typeof Ruler; label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-card p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{label}</p><Icon className="size-3.5 text-primary" aria-hidden="true" /></div><p className="mt-2 text-lg font-semibold tabular-nums">{value}</p></div>
}

function ProjectListSkeleton() {
  return <div className="space-y-7" aria-label="Loading project results" aria-busy="true">{Array.from({ length: 2 }).map((_, index) => <div key={index} className="surface-panel grid gap-6 p-6 lg:grid-cols-[20rem_1fr]"><Skeleton className="h-64 w-full" /><div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-10 w-72 max-w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div></div>)}</div>
}

function ProjectEmptyState() {
  return <section className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center"><Smartphone className="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><h2 className="mt-4 text-xl font-semibold">No measurement projects yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">When the PanelScan mobile app becomes available, use it to measure a wall or ceiling and save the project. Synced measurements, estimates, and compatible previews will appear here.</p></section>
}
