import type { LucideIcon } from "lucide-react"
import type { ReactNode, Ref } from "react"

import { cn } from "@/lib/utils"

type PaymentResultTone = "positive" | "neutral" | "critical"

const toneClasses: Record<PaymentResultTone, string> = {
  positive: "border-emerald-700/20 bg-emerald-50/70",
  neutral: "border-border bg-secondary/40",
  critical: "border-destructive/25 bg-destructive/5",
}

const toneIconClasses: Record<PaymentResultTone, string> = {
  positive: "text-emerald-700",
  neutral: "text-primary",
  critical: "text-destructive",
}

interface PaymentResultCardProps {
  tone: PaymentResultTone
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  /** Result headings receive focus when a payment resolves, so screen reader users land on the outcome. */
  headingRef?: Ref<HTMLHeadingElement>
  children?: ReactNode
}

export function PaymentResultCard({ tone, icon: Icon, eyebrow, title, description, headingRef, children }: PaymentResultCardProps) {
  return (
    <section className={cn("border p-6 sm:p-9", toneClasses[tone])} aria-labelledby="payment-result-title">
      <Icon className={cn("size-8", toneIconClasses[tone])} aria-hidden="true" />
      <p className="mt-5 text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground">{eyebrow}</p>
      <h1 id="payment-result-title" ref={headingRef} tabIndex={-1} className="type-h2 mt-2 outline-none">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      {children}
    </section>
  )
}
