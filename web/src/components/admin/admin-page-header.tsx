import type { ReactNode } from "react"

interface AdminPageHeaderProps {
  eyebrow?: string
  title: string
  actions?: ReactNode
}

export function AdminPageHeader({ eyebrow, title, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="text-[0.68rem] font-semibold tracking-[0.13em] text-muted-foreground uppercase">{eyebrow}</p>}
        <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
