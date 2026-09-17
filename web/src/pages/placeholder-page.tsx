import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"

interface PlaceholderPageProps { eyebrow: string; title: string; description: string; notFound?: boolean }

export function PlaceholderPage({ eyebrow, title, description, notFound = false }: PlaceholderPageProps) {
  return (
    <section className="flex min-h-[64vh] items-center border-b border-border bg-background py-20">
      <Container><div className="max-w-2xl"><p className="section-eyebrow">{eyebrow}</p><h1 className="type-h1 mt-5">{title}</h1><p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{description}</p><Button className="mt-8" variant={notFound ? "default" : "outline"} asChild><Link to="/"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back to homepage</Link></Button></div></Container>
    </section>
  )
}
