import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { PANEL_TYPES } from "@/products/panel-types"
import { cn } from "@/lib/utils"
import { stagger } from "@/hooks/use-scroll-reveal"

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
              <figure className="media-hover relative overflow-hidden rounded-2xl" data-rv="media">
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
                <h2 className="type-h2" data-rv style={stagger(1)}>{panel.label}</h2>
                <p className="type-body mt-5" data-rv style={stagger(2)}>{panel.description}</p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground" data-rv style={stagger(3)}>{panel.tagline}</p>
                <Button className="arrow-nudge mt-8" data-rv style={stagger(4)} asChild>
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
