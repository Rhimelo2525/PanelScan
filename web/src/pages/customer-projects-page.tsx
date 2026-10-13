import { ArrowLeft, CalendarDays, Calculator, ChevronRight, Copy, Maximize2, MessageSquareShare, Ruler, Send, Smartphone } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/products/product-image"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatPesos } from "@/lib/format-price"
import { cn } from "@/lib/utils"
import { listCustomerProjectResults } from "@/projects/project-results-repository"
import { SHARE_NOTE_MAX_LENGTH, shareProjectWithTeam } from "@/projects/project-share"
import type { CustomerMeasurementProject, CustomerProjectResultSet } from "@/types/customer-project"

const date = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" })

export function CustomerProjectsPage() {
  useDocumentTitle("Your projects | PanelScan")
  const [result, setResult] = useState<CustomerProjectResultSet | null>(null)
  // The open project lives in the URL (?project=<id>) so Back returns to the list.
  // A project code linked from Messages (?code=PRJ-...) opens the same way.
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get("project")
  const openCode = searchParams.get("code")?.trim().toUpperCase() ?? null
  const openProject = result?.projects.find((project) => (openId ? project.id === openId : openCode !== null && project.projectCode === openCode)) ?? null

  useEffect(() => { void listCustomerProjectResults().then(setResult) }, [])
  useEffect(() => { if (openId || openCode) window.scrollTo({ top: 0 }) }, [openId, openCode])

  function closeProject() {
    setSearchParams((params) => { params.delete("project"); params.delete("code"); return params })
  }

  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-12 sm:py-16">
        <Container>
          <Button variant="ghost" size="sm" className="-ml-2.5 mb-6" asChild><Link to="/dashboard"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back to dashboard</Link></Button>
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
            <div>
              <p className="section-eyebrow">Projects and measurements</p>
              <h1 className="type-h1 mt-4">Your saved AR &amp; 3D project results.</h1>
              <p className="type-lead mt-5 max-w-3xl">Review measurements, panel estimates, and mobile-generated project summaries in one place. Measurement happens in the PanelScan mobile app—the website only displays results saved to your account.</p>
            </div>
            <div className="surface-card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="size-4 text-primary" aria-hidden="true" />Mobile measurement, web review</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Measure in the PanelScan app. The website shows the measurements and panel estimates saved to your account. It does not use your camera or run AR.</p>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-10 sm:py-14">
        {!result ? <ProjectListSkeleton /> : openProject ? (
          <div className="space-y-5">
            <Button variant="ghost" size="sm" className="-ml-2.5" onClick={closeProject}><ArrowLeft data-icon="inline-start" aria-hidden="true" />All projects</Button>
            <ProjectResultCard project={openProject} />
          </div>
        ) : result.projects.length === 0 ? <ProjectEmptyState /> : (
          <>
            {(openId || openCode) && <p className="mb-5 rounded-lg border border-border bg-secondary/35 px-4 py-3 text-sm text-muted-foreground" role="status">That project could not be found. It may have been deleted in the app.</p>}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your projects">
              {result.projects.map((project) => <li key={project.id}><ProjectListCard project={project} /></li>)}
            </ul>
          </>
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

/** Compact, clickable project summary for the list, as on the app's Projects tab. */
function ProjectListCard({ project }: { project: CustomerMeasurementProject }) {
  const panels = project.requiredPanelQuantity
  return (
    <Link to={`?project=${encodeURIComponent(project.id)}`} className="surface-panel group block h-full p-4 transition-colors hover:border-primary/40 hover:bg-secondary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Open ${project.name}, ${project.projectCode}`}>
      <div className="flex items-center gap-3.5">
        <PanelThumbnail project={project} className="size-16 rounded-lg" small />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{project.name}</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{project.selectedPanel?.name ?? "No panel selected"}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{project.surfaceType === "WALL" ? "Wall" : "Ceiling"}</span>
            {panels !== null && <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium">{panels} {panels === 1 ? "panel" : "panels"}</span>}
          </div>
          <p className="mt-1.5 font-mono text-xs font-semibold tracking-wide text-muted-foreground">{project.projectCode}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        <div><dt className="text-muted-foreground">Size</dt><dd className="mt-0.5 font-semibold tabular-nums">{project.widthMeters.toFixed(2)} × {project.heightMeters.toFixed(2)} m</dd></div>
        <div><dt className="text-muted-foreground">Area</dt><dd className="mt-0.5 font-semibold tabular-nums">{project.areaSquareMeters.toFixed(2)} m²</dd></div>
        <div><dt className="text-muted-foreground">Saved</dt><dd className="mt-0.5 font-semibold">{date.format(new Date(project.measuredAt))}</dd></div>
      </dl>
    </Link>
  )
}

/** A project's full details: measurement, panels, and material estimate. */
function ProjectResultCard({ project }: { project: CustomerMeasurementProject }) {
  const panel = project.selectedPanel
  const cost = project.estimatedMaterialCost
  return (
    <article className="surface-panel mx-auto max-w-4xl overflow-hidden">
      {/* The selected panel's photo, large across the top, as in the app. */}
      <div className="relative">
        <PanelThumbnail project={project} className="aspect-[16/9] w-full rounded-none sm:aspect-[21/9]" />
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm">{project.surfaceType === "WALL" ? "Wall" : "Ceiling"}</span>
          {project.requiredPanelQuantity !== null && <span className="rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur">{project.requiredPanelQuantity} {project.requiredPanelQuantity === 1 ? "panel" : "panels"}</span>}
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={project.status} /><span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium"><Smartphone className="size-3" aria-hidden="true" />Measured with Mobile AR</span></div>
              <h2 className="mt-2.5 text-2xl font-semibold tracking-[-0.035em]">{project.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{project.roomName} · {project.surfaceType === "WALL" ? "Wall surface" : "Ceiling surface"}</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <ProjectCode code={project.projectCode} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden="true" />Saved {date.format(new Date(project.measuredAt))}</div>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MeasurementStat icon={Ruler} label="Width" value={`${project.widthMeters.toFixed(2)} m`} />
          <MeasurementStat icon={Ruler} label="Height" value={`${project.heightMeters.toFixed(2)} m`} />
          <MeasurementStat icon={Maximize2} label="Area" value={`${project.areaSquareMeters.toFixed(2)} m²`} />
          <MeasurementStat icon={Calculator} label="Panels needed" value={project.requiredPanelQuantity === null ? "—" : String(project.requiredPanelQuantity)} />
        </div>

        <section className="mt-4 rounded-lg border border-border bg-secondary/35 p-5" aria-labelledby={`estimate-${project.id}`}>
          <div className="flex items-center gap-2"><Calculator className="size-4 text-primary" aria-hidden="true" /><h3 id={`estimate-${project.id}`} className="font-semibold">Estimation summary</h3></div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Selected PVC panel</dt>
              <dd className="mt-1 font-medium">{panel?.name ?? "Not selected"}</dd>
              {panel?.sku && <dd className="mt-0.5 font-mono text-xs text-muted-foreground">{panel.sku}</dd>}
            </div>
            <div className="sm:text-right">
              <dt className="text-xs text-muted-foreground">Estimated material cost</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular-nums">{cost === null ? "Not estimated" : formatPesos(cost, true)}</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">{project.estimationSummary} Estimates are for planning; confirm with PanelScan before ordering.</p>
        </section>

        <SendProjectSection project={project} />
      </div>
    </article>
  )
}

function MeasurementStat({ icon: Icon, label, value }: { icon: typeof Ruler; label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-card p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{label}</p><Icon className="size-3.5 text-primary" aria-hidden="true" /></div><p className="mt-2 text-lg font-semibold tabular-nums">{value}</p></div>
}

function ProjectListSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading project results" aria-busy="true">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="surface-panel p-4"><div className="flex items-center gap-3.5"><Skeleton className="size-16 shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-28" /></div></div><Skeleton className="mt-4 h-8 w-full" /></div>)}</div>
}

function ProjectEmptyState() {
  return <section className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center"><Smartphone className="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><h2 className="mt-4 text-xl font-semibold">No measurement projects yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">When the PanelScan mobile app becomes available, use it to measure a wall or ceiling and save the project. Synced measurements, estimates, and compatible previews will appear here.</p></section>
}

/** The project's reference code, to quote when contacting PanelScan about it. */
function ProjectCode({ code }: { code: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      toast.success("Project code copied", { description: "Share it with PanelScan when you ask about this project." })
    } catch {
      toast.error("The code could not be copied", { description: code })
    }
  }
  return (
    <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 font-mono text-xs font-semibold tracking-wide hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Copy project code ${code}`} title="Copy project code">
      {code}<Copy className="size-3 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

/**
 * The selected panel's photo. Like the store, a panel without one shows its
 * category's representative photo, and the material pattern if that fails.
 */
function PanelThumbnail({ project, className, small = false }: { project: CustomerMeasurementProject; className: string; small?: boolean }) {
  return (
    <ProductImage
      image={project.previewImageUrl ? { url: project.previewImageUrl } : null}
      productName={project.selectedPanel?.name ?? project.name}
      categorySlug={project.panelCategorySlug}
      className={cn("shrink-0", className)}
      hideRepresentativeLabel={small}
    />
  )
}

/** "Send to PanelScan": shares the project in the customer's support chat, where the team can open it. */
function SendProjectSection({ project }: { project: CustomerMeasurementProject }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [isSending, setIsSending] = useState(false)

  async function send() {
    if (isSending) return
    setIsSending(true)
    try {
      await shareProjectWithTeam(project, note)
      setOpen(false)
      setNote("")
      toast.success("Project sent to PanelScan", {
        description: "The team can open it from your conversation. Their reply will appear in Messages.",
        action: { label: "Open messages", onClick: () => navigate("/messages") },
      })
    } catch {
      toast.error("The project was not sent", { description: "Please try again in a moment." })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-5" aria-labelledby={`send-${project.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <MessageSquareShare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h3 id={`send-${project.id}`} className="font-semibold">Questions about this project?</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Send it to the PanelScan team. They can open it straight from your conversation and reply in Messages.</p>
        </div>
      </div>
      <Button onClick={() => setOpen(true)}><Send data-icon="inline-start" aria-hidden="true" />Send to PanelScan</Button>

      <Dialog open={open} onOpenChange={(next) => { if (!isSending) setOpen(next) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send this project to PanelScan</DialogTitle>
            <DialogDescription>The team will see {project.name} ({project.projectCode}) in your support conversation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`send-note-${project.id}`}>Message (optional)</Label>
            <Textarea id={`send-note-${project.id}`} rows={4} value={note} onChange={(event) => setNote(event.target.value)} maxLength={SHARE_NOTE_MAX_LENGTH} placeholder="e.g. Can you check if these panels fit my wall? I'd like to order." />
            <p className="text-right text-xs text-muted-foreground tabular-nums">{note.length}/{SHARE_NOTE_MAX_LENGTH}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSending}>Cancel</Button>
            <Button onClick={() => void send()} disabled={isSending}><Send data-icon="inline-start" aria-hidden="true" />{isSending ? "Sending…" : "Send project"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
