import { Building2, Info, Mail, MapPin, Phone } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function AboutPage() {
  useDocumentTitle("About PanelScan | Disenyo Interior Solution")

  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-14 sm:py-20">
        <Container>
          <p className="section-eyebrow">Disenyo Interior Solution</p>
          <h1 className="type-display mt-5 max-w-3xl">PVC panelling, supplied and fitted.</h1>
          <p className="type-lead mt-6 max-w-2xl">Disenyo Interior Solution supplies PVC wall and ceiling panels and installs them for homes and businesses. PanelScan brings the range, ordering, and service coordination together in one place.</p>
        </Container>
      </section>

      <Container className="py-12 sm:py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
          <div className="space-y-12">
            <section aria-labelledby="what-we-do">
              <h2 id="what-we-do" className="type-h2">What we do</h2>
              <div className="mt-6 space-y-6 text-base leading-7 text-muted-foreground">
                <p>Disenyo Interior Solution supplies and installs PVC wall panels and PVC ceiling panels for interior finishing work. Panels are fixed over existing walls and ceilings, which keeps installation quick and avoids the mess of wet trades.</p>
                <p>PanelScan is the platform we use to run that service online: customers browse the current range with live stock, order and pay through a hosted PayMongo checkout, request installation, and message the team. Behind it, the same records drive our own inventory, sales, and service operations.</p>
              </div>
            </section>

            <PendingCompanyContent
              id="mission"
              title="Mission"
              note="Disenyo Interior Solution's own mission statement belongs here."
            />
            <PendingCompanyContent
              id="vision"
              title="Vision"
              note="The company's vision statement belongs here."
            />
            <PendingCompanyContent
              id="values"
              title="Core values"
              note="The company's core values belong here, in the company's own words."
            />

            <section aria-labelledby="background">
              <h2 id="background" className="type-h2">Business background</h2>
              <div className="mt-5 flex items-start gap-3 rounded-lg border border-dashed border-border bg-card p-5">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">Information pending.</span> Company history, service area, and team background will be published after the business has supplied and approved them.</p>
              </div>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28">
            <section className="surface-card p-6" aria-labelledby="contact">
              <div className="flex items-center gap-2"><Building2 className="size-4 text-primary" aria-hidden="true" /><h2 id="contact" className="font-semibold">Contact</h2></div>
              <ul className="mt-5 space-y-4 text-sm">
                <li className="flex items-start gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="text-muted-foreground">Business address to be supplied by Disenyo Interior Solution.</span></li>
                <li className="flex items-start gap-2.5"><Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="text-muted-foreground">Contact number to be supplied.</span></li>
                <li className="flex items-start gap-2.5"><Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="text-muted-foreground">Enquiry email address to be supplied.</span></li>
              </ul>
              <p className="mt-5 text-xs leading-5 text-muted-foreground">Contact details are deliberately left unfilled rather than guessed — publishing an incorrect address or number would misdirect real customers.</p>
            </section>

            <section className="rounded-lg border border-border bg-primary p-6 text-primary-foreground" aria-labelledby="start">
              <h2 id="start" className="text-xl font-medium tracking-[-0.03em]">Browse the range</h2>
              <p className="mt-3 text-sm leading-6 text-primary-foreground/70">PVC wall and ceiling panels, with current sizes and availability.</p>
              <Button variant="secondary" className="mt-5 w-full" asChild><Link to="/products">View panels</Link></Button>
            </section>
          </aside>
        </div>
      </Container>
    </>
  )
}

function PendingCompanyContent({ id, title, note }: { id: string; title: string; note: string }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="type-h2">{title}</h2>
      <div className="mt-5 flex items-start gap-3 rounded-lg border border-dashed border-border bg-card p-5">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">Information pending.</span> {note} This section remains unfilled until the company supplies and approves the wording.</p>
      </div>
    </section>
  )
}
