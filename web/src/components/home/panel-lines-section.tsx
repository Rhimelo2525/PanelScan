import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { PANEL_TYPES } from "@/products/panel-types"
import { cn } from "@/lib/utils"

/**
 * The two product lines, each given a full editorial band rather than a card in
 * a grid. Imagery leads; type carries the explanation.
 */
export function PanelLinesSection() {
  return (
    <section id="panels" className="scroll-mt-24">
      {PANEL_TYPES.map((panel, index) => (
        <div key={panel.type} className={cn("border-b border-border", index % 2 === 0 ? "bg-background" : "bg-secondary/45")}>
          <Container className="section-space-tight">
            <div className={cn("grid items-center gap-10 lg:grid-cols-2 lg:gap-20", index % 2 === 1 && "lg:[&>figure]:order-last")}>
              <figure className="relative">
                <img
                  src={panel.image}
                  alt={panel.imageAlt}
                  className="aspect-[4/3] w-full rounded-2xl object-cover"
                  width={1280}
                  height={960}
                  loading="lazy"
                />
              </figure>
              <div className="max-w-xl">
                <p className="type-label text-primary">0{index + 1} — {panel.shortLabel}</p>
                <h2 className="type-h2 mt-5">{panel.label}</h2>
                <p className="type-body mt-5">{panel.description}</p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{panel.tagline}</p>
                <Button className="mt-8" asChild>
                  <Link to={`/products?category=${panel.slug}`}>Browse {panel.shortLabel.toLowerCase()} <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
                </Button>
              </div>
            </div>
          </Container>
        </div>
      ))}
    </section>
  )
}
