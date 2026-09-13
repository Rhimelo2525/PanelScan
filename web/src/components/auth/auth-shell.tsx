import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { BrandLogo } from "@/components/layout/brand"
import { Container } from "@/components/layout/container"

interface AuthShellProps {
  eyebrow: string
  title: string
  description: string
  asideTitle: string
  asideDescription: string
  children: ReactNode
}

export function AuthShell({ eyebrow, title, description, asideTitle, asideDescription, children }: AuthShellProps) {
  return (
    <section className="border-b border-border bg-background py-10 sm:py-14 lg:py-20">
      <Container>
        <div className="mx-auto grid max-w-xl overflow-hidden rounded-xl border border-border bg-card lg:mx-0 lg:max-w-none lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="auth-material-panel relative hidden min-h-[42rem] overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-end xl:p-14">
            <div className="relative z-10 max-w-md">
              <span className="mb-8 block w-24 overflow-hidden rounded-lg bg-[#f2e3d5] p-1.5"><BrandLogo /></span>
              <p className="text-xs font-semibold tracking-[0.17em] text-primary-foreground/55 uppercase">PanelScan account</p>
              <h2 className="type-h2 mt-5">{asideTitle}</h2>
              <p className="mt-5 text-sm leading-7 text-primary-foreground/68">{asideDescription}</p>
            </div>
          </aside>
          <div className="px-5 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-16 xl:px-20">
            <div className="mx-auto max-w-lg">
              <span className="mb-7 block w-16 overflow-hidden rounded-lg lg:hidden"><BrandLogo /></span>
              <p className="section-eyebrow">{eyebrow}</p>
              <h1 className="type-h1 mt-4">{title}</h1>
              <p className="mt-5 text-base leading-7 text-muted-foreground">{description}</p>
              <div className="mt-9">{children}</div>
              <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border pt-6 text-xs text-muted-foreground" aria-label="Account legal links">
                <Link to="/terms" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">Terms of Service</Link>
                <Link to="/privacy" className="underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">Privacy Policy</Link>
              </nav>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
