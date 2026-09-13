import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"

export interface LegalSectionContent {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export function LegalPage({ eyebrow, title, introduction, sections }: { eyebrow: string; title: string; introduction: string; sections: LegalSectionContent[] }) {
  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-12 sm:py-16 lg:py-20">
        <Container>
          <p className="section-eyebrow">{eyebrow}</p>
          <h1 className="type-h1 mt-4">{title}</h1>
          <p className="type-lead mt-5 max-w-3xl">{introduction}</p>
          <p className="mt-6 text-sm font-medium text-muted-foreground">Last updated: August 2026</p>
        </Container>
      </section>

      <Container className="py-10 sm:py-14 lg:py-18">
        <div className="grid items-start gap-10 lg:grid-cols-[15rem_minmax(0,46rem)] lg:justify-center">
          <nav className="surface-card p-5 lg:sticky lg:top-28" aria-label={`${title} sections`}>
            <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">On this page</p>
            <ol className="mt-4 space-y-2">
              {sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`} className="flex gap-2 rounded-md px-2 py-1.5 text-sm leading-5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><span className="text-xs tabular-nums text-primary">{String(index + 1).padStart(2, "0")}</span><span>{section.title}</span></a></li>)}
            </ol>
          </nav>

          <article className="min-w-0">
            <div className="rounded-lg border border-border bg-card p-5 text-sm leading-6 text-muted-foreground sm:p-6">These terms and policies are written for the current and planned PanelScan service. Business-specific details that have not yet been published should be confirmed through PanelScan support before relying on them.</div>
            <div className="mt-10 space-y-12">
              {sections.map((section, index) => (
                <section key={section.id} id={section.id} className="scroll-mt-28" aria-labelledby={`${section.id}-title`}>
                  <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Section {String(index + 1).padStart(2, "0")}</p>
                  <h2 id={`${section.id}-title`} className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{section.title}</h2>
                  <div className="mt-5 space-y-4 text-sm leading-7 text-muted-foreground sm:text-base">
                    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    {section.bullets && <ul className="list-disc space-y-2 pl-5 marker:text-primary">{section.bullets.map((item) => <li key={item} className="pl-1">{item}</li>)}</ul>}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-14 flex flex-wrap gap-3 border-t border-border pt-8 text-sm"><Link to="/terms" className="font-semibold text-primary underline-offset-4 hover:underline">Terms of Service</Link><span aria-hidden="true" className="text-border">/</span><Link to="/privacy" className="font-semibold text-primary underline-offset-4 hover:underline">Privacy Policy</Link></div>
          </article>
        </div>
      </Container>
    </>
  )
}
