import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"

export function FinalCta() {
  return (
    <section id="final-cta" className="scroll-mt-24 border-t border-border bg-foreground text-background">
      <Container className="section-space-tight">
        <div className="grid items-end gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div>
            <p className="type-label text-background/55">Disenyo Interior Solution</p>
            <h2 className="type-h1 mt-5 max-w-2xl">Ready to panel a wall or ceiling?</h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-background/65">Browse the range and create an account to see pricing, place an order, and arrange installation with the team.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Button variant="secondary" size="lg" className="h-11 px-5" asChild>
              <Link to="/products">Browse panels <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 border-background/30 bg-transparent px-5 text-background hover:bg-background/10 hover:text-background"
              asChild
            >
              <Link to="/register">Create an account</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
