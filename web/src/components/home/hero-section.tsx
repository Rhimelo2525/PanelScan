import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { BrandMark } from "@/components/layout/brand"
import { Button } from "@/components/ui/button"

/**
 * The hero states the business plainly: PVC wall and ceiling panels. The two
 * calls to action go straight to the two product lines, because those are the
 * only two things the client sells.
 */
export function HeroSection() {
  return (
    <section className="border-b border-border bg-background">
      <Container className="py-14 sm:py-20 lg:py-26">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div className="max-w-[38rem]">
            <div className="flex items-center gap-3">
              <BrandMark className="size-11" />
              <p className="type-label text-muted-foreground">Disenyo Interior Solution</p>
            </div>
            <h1 className="type-display mt-8">PVC wall &amp; ceiling panels for modern interiors.</h1>
            <p className="type-lead mt-7 max-w-xl">Durable, moisture-resistant panelling that installs over existing walls and ceilings. Browse the range, order online, and arrange installation with our team.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="h-11 px-5" asChild>
                <Link to="/products?category=wall-panels">Explore wall panels <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
              </Button>
              <Button variant="outline" size="lg" className="h-11 px-5" asChild>
                <Link to="/products?category=ceiling-panels">Explore ceiling panels <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
              </Button>
            </div>
          </div>

          <figure className="relative overflow-hidden rounded-2xl">
            <img
              src="/images/home/hero-fluted-interior.webp"
              alt="Representative living room interior with fluted wall panelling behind a low console"
              className="aspect-[4/5] w-full object-cover lg:aspect-[3/4]"
              width={1586}
              height={992}
              fetchPriority="high"
            />
            <figcaption className="absolute right-4 bottom-4 bg-background/90 px-3 py-2 text-[0.68rem] font-medium text-foreground backdrop-blur-sm">
              Representative interior — finishes vary by product
            </figcaption>
          </figure>
        </div>
      </Container>
    </section>
  )
}
