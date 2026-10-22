import { ArrowLeft, ClipboardList, Copy, Eye, Search, Users } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { getProjectById, getProjectCustomers, getProjects } from "@/api/admin"
import { formatDate, formatMoneyDetail, fullName } from "@/admin/admin-format"
import { useAdminResource, useDebouncedValue } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar } from "@/components/admin/filter-bar"
import { WallPhoto } from "@/components/projects/wall-photo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatPanelCount, formatSize, readAppMeasurement } from "@/projects/app-project-measurement"
import { PROJECT_CODE_PATTERN, type AdminProject, type ProjectCustomer } from "@/types/admin"

const SOURCE = "MOBILE_AR_3D" as const

/**
 * Customer projects for the owner and moderators - view-only. Customers
 * create and delete their own projects in the mobile app; there is nothing
 * here (or in the API) that changes one. The page goes customer directory ->
 * one customer's projects -> a project's details, kept in the URL
 * (?customer=, ?project=) so a refresh, the back button and notification
 * links land on the same view. A project's reference code opens it directly.
 */
export function AdminProjectsPage() {
  useDocumentTitle("Projects | PanelScan Admin")
  const [searchParams, setSearchParams] = useSearchParams()
  const customerId = searchParams.get("customer")
  const projectId = searchParams.get("project")
  // A project code linked from the support chat (?code=PRJ-...), resolved to its project below.
  const linkedCode = searchParams.get("code")

  function navigate(next: { customer?: string | null; project?: string | null; code?: string | null }, options?: { replace?: boolean }) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      return params
    }, options)
  }

  useEffect(() => {
    if (!linkedCode) return
    const code = linkedCode.trim().toUpperCase()
    let cancelled = false
    const open = (next: { customer?: string | null; project?: string | null }) => setSearchParams((current) => {
      const params = new URLSearchParams(current)
      params.delete("code")
      for (const [key, value] of Object.entries(next)) if (value) params.set(key, value)
      return params
    }, { replace: true })

    if (!PROJECT_CODE_PATTERN.test(code)) {
      toast.error("That is not a project code", { description: linkedCode })
      open({})
      return
    }
    getProjects({ code, limit: 1 })
      .then((result) => {
        if (cancelled) return
        const project = result.projects[0]
        if (project) open({ customer: project.customerId, project: project.id })
        else {
          toast.error(`No project has the code ${code}`, { description: "The customer may have deleted it in the app." })
          open({})
        }
      })
      .catch(() => {
        if (cancelled) return
        toast.error("The project could not be opened", { description: "Please try again." })
        open({})
      })
    return () => { cancelled = true }
  }, [linkedCode, setSearchParams])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Project monitoring"
        title="Customer projects"
        description="Projects customers save in the PanelScan app, by customer. View-only: customers create and manage their own projects."
      />

      <CodeLookup onFound={(project) => navigate({ customer: project.customerId, project: project.id })} />

      {customerId
        ? <CustomerProjects customerId={customerId} onBack={() => navigate({ customer: null, project: null })} onOpen={(id) => navigate({ project: id })} />
        : <CustomerDirectory onOpen={(id) => navigate({ customer: id })} />}

      <ProjectSheet projectId={projectId} onClose={() => navigate({ project: null })} />
    </div>
  )
}

/** "Search by project code": the code a customer quotes opens that project at once. */
function CodeLookup({ onFound }: { onFound: (project: AdminProject) => void }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const wanted = code.trim().toUpperCase()
    if (!PROJECT_CODE_PATTERN.test(wanted)) {
      setError("Enter a project code like PRJ-2026-1A2B3C4D.")
      return
    }
    setIsSearching(true)
    setError(null)
    try {
      const result = await getProjects({ code: wanted, limit: 1 })
      const project = result.projects[0]
      if (project) {
        onFound(project)
        setCode("")
      } else {
        setError(`No project has the code ${wanted}.`)
      }
    } catch {
      setError("The project could not be looked up. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="surface-card flex flex-wrap items-start gap-3 p-4" aria-label="Find a project by code">
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <label htmlFor="project-code" className="text-xs font-medium text-muted-foreground">Find a project by its code</label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="project-code"
            value={code}
            onChange={(event) => { setCode(event.target.value); setError(null) }}
            placeholder="PRJ-2026-1A2B3C4D"
            className="h-9 pl-8 font-mono text-sm uppercase placeholder:normal-case"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "project-code-error" : undefined}
            maxLength={30}
          />
        </div>
        {error && <p id="project-code-error" className="mt-1.5 text-xs text-destructive">{error}</p>}
      </div>
      <Button type="submit" className="sm:mt-6" disabled={isSearching || !code.trim()}>{isSearching ? "Searching…" : "Open project"}</Button>
    </form>
  )
}

function CustomerDirectory({ onOpen }: { onOpen: (customerId: string) => void }) {
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput)
  const customers = useAdminResource((signal) => getProjectCustomers({ page, limit: 10, search: search || undefined, source: SOURCE }, signal), [page, search])

  if (customers.error) return <ErrorState message={customers.error} onRetry={customers.reload} />

  return (
    <section className="space-y-4" aria-labelledby="customer-directory-title">
      <h2 id="customer-directory-title" className="text-base font-semibold">Customers with projects</h2>
      <FilterBar
        searchValue={searchInput}
        searchPlaceholder="Search customer name or email"
        onSearchChange={(value) => { setSearchInput(value); setPage(1) }}
        hasActiveFilters={Boolean(searchInput)}
        onClear={() => { setSearchInput(""); setPage(1) }}
      />
      <div key={`${search}|${page}`} className="motion-swap">
        <DataTable<ProjectCustomer>
          caption="Customers with saved projects"
          isLoading={customers.isLoading}
          rows={customers.data?.customers ?? []}
          getRowId={(row) => row.id}
          empty={<EmptyState icon={Users} title={search ? "No customers match your search" : "No customer projects yet"} description={search ? "Try another name or email." : "Customers who save a project in the PanelScan app will appear here."} />}
          columns={[
            { key: "customer", header: "Customer", primary: true, cell: (row) => <span><span className="block font-medium">{fullName(row)}</span><span className="block text-xs text-muted-foreground">{row.email}</span></span> },
            { key: "phone", header: "Phone", secondary: true, cell: (row) => <span className="text-muted-foreground">{row.phone ?? "—"}</span> },
            { key: "projects", header: "Projects", numeric: true, cell: (row) => row.projectCount },
            { key: "last", header: "Last saved", cell: (row) => <span className="text-muted-foreground">{formatDate(row.lastProjectAt)}</span> },
          ]}
          rowAction={(row) => <Button variant="outline" size="sm" onClick={() => onOpen(row.id)}>View projects</Button>}
        />
      </div>
      <TablePagination pagination={customers.data?.pagination ?? null} onPageChange={setPage} isLoading={customers.isLoading} />
    </section>
  )
}

function CustomerProjects({ customerId, onBack, onOpen }: { customerId: string; onBack: () => void; onOpen: (projectId: string) => void }) {
  const [page, setPage] = useState(1)
  const projects = useAdminResource((signal) => getProjects({ page, limit: 10, customerId, source: SOURCE }, signal), [page, customerId])
  const customer = projects.data?.projects[0]?.customer

  return (
    <section className="space-y-4" aria-labelledby="customer-projects-title">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft data-icon="inline-start" aria-hidden="true" />All customers</Button>

      <div className="surface-card flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <h2 id="customer-projects-title" className="text-base font-semibold">{customer ? fullName(customer) : "Customer projects"}</h2>
          {customer && (
            <p className="mt-1 text-sm text-muted-foreground">
              <a className="underline-offset-4 hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a>
              {customer.phone && <> · <a className="underline-offset-4 hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a></>}
            </p>
          )}
        </div>
        {projects.data && <p className="text-sm text-muted-foreground">{projects.data.pagination.total} project{projects.data.pagination.total === 1 ? "" : "s"}</p>}
      </div>

      {projects.error ? <ErrorState message={projects.error} onRetry={projects.reload} /> : (
        <>
          <div key={page} className="motion-swap">
            <DataTable<AdminProject>
              caption="This customer's projects"
              isLoading={projects.isLoading}
              rows={projects.data?.projects ?? []}
              getRowId={(row) => row.id}
              empty={<EmptyState icon={ClipboardList} title="No projects" description="This customer has no saved projects." />}
              columns={[
                { key: "project", header: "Project", primary: true, cell: (row) => <span><span className="block font-medium">{row.name}</span><span className="block font-mono text-xs text-muted-foreground">{row.projectCode}</span></span> },
                { key: "estimate", header: "App estimate", cell: (row) => <EstimateCell project={row} /> },
                { key: "saved", header: "Saved", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDate(row.createdAt)}</span> },
              ]}
              rowAction={(row) => <Button variant="outline" size="sm" onClick={() => onOpen(row.id)}><Eye data-icon="inline-start" aria-hidden="true" />View</Button>}
            />
          </div>
          <TablePagination pagination={projects.data?.pagination ?? null} onPageChange={setPage} isLoading={projects.isLoading} />
        </>
      )}
    </section>
  )
}

/** One project's details, read-only. */
function ProjectSheet({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const project = useAdminResource(async (signal) => (projectId ? (await getProjectById(projectId, signal)).project : null), [projectId])
  const data = project.data

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success("Project code copied", { description: code })
    } catch {
      toast.error("The code could not be copied", { description: code })
    }
  }

  return (
    <Sheet open={Boolean(projectId)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{data?.name ?? "Project"}</SheetTitle>
          <SheetDescription>{data ? `Customer: ${fullName(data.customer)} · View-only` : project.error ?? "Loading…"}</SheetDescription>
        </SheetHeader>

        {data && (
          <div className="space-y-6 px-4 pb-8">
            <div className="surface-card flex items-center justify-between gap-3 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Project code</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tracking-wide">{data.projectCode}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyCode(data.projectCode)}><Copy data-icon="inline-start" aria-hidden="true" />Copy</Button>
            </div>

            {data.source === SOURCE && <WallPhoto url={data.wallPhotoUrl ?? null} name={data.name} />}

            <AppMeasurement project={data} />

            {data.customer && (
              <div>
                <h3 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Customer</h3>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Name</dt><dd className="mt-1">{fullName(data.customer)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 break-all"><a className="underline-offset-4 hover:underline" href={`mailto:${data.customer.email}`}>{data.customer.email}</a></dd></div>
                  <div><dt className="text-xs text-muted-foreground">Phone</dt><dd className="mt-1">{data.customer.phone ? <a className="underline-offset-4 hover:underline" href={`tel:${data.customer.phone}`}>{data.customer.phone}</a> : "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Saved to the account</dt><dd className="mt-1">{formatDate(data.createdAt)}</dd></div>
                </dl>
              </div>
            )}

            {data.description && <div><h3 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Description</h3><p className="mt-2 text-sm leading-6">{data.description}</p></div>}

            <p className="text-xs leading-5 text-muted-foreground">Customer projects are view-only for the PanelScan team. The customer can share this code when they contact you about it.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** The panel and amount the customer worked out in the app, at a glance. */
function EstimateCell({ project }: { project: AdminProject }) {
  const measurement = readAppMeasurement(project.arMetadata)
  if (!measurement?.panelName) return <span className="text-muted-foreground">—</span>
  const area = measurement.areaSquareMeters === null ? null : `${measurement.areaSquareMeters.toFixed(2)} m²`
  return (
    <span>
      <span className="block">{measurement.panelName}</span>
      <span className="block text-xs text-muted-foreground">{[measurement.finalQuantity === null ? null : `${measurement.finalQuantity} panels`, area].filter(Boolean).join(" · ")}</span>
    </span>
  )
}

/** The measurement and panel estimate saved in the mobile app. */
function AppMeasurement({ project }: { project: AdminProject }) {
  const measurement = readAppMeasurement(project.arMetadata)
  if (!measurement) return null
  const rows: { label: string; value: string | null }[] = [
    { label: "Surface", value: measurement.surface },
    { label: "Size", value: formatSize(measurement.widthMeters, measurement.heightMeters) },
    { label: "Area", value: measurement.areaSquareMeters === null ? null : `${measurement.areaSquareMeters.toFixed(2)} m²` },
    { label: "Panel", value: measurement.panelName && (measurement.panelSku ? `${measurement.panelName} (${measurement.panelSku})` : measurement.panelName) },
    { label: "Panel size", value: formatSize(measurement.panelWidthMeters, measurement.panelHeightMeters) },
    { label: "Panels needed", value: formatPanelCount(measurement) },
    { label: "Estimated cost", value: measurement.estimatedCost === null ? (project.budget ? formatMoneyDetail(Number(project.budget)) : null) : formatMoneyDetail(measurement.estimatedCost) },
    { label: "Saved in the app", value: measurement.savedAt ? formatDate(measurement.savedAt) : null },
  ]
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Measurement from the app</h3>
      <dl className="mt-2 grid grid-cols-2 gap-3 surface-card p-3 text-sm">
        {rows.filter((row) => row.value).map((row) => (
          <div key={row.label}><dt className="text-xs text-muted-foreground">{row.label}</dt><dd className="mt-1">{row.value}</dd></div>
        ))}
      </dl>
    </div>
  )
}
