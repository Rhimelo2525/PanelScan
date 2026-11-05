import { ArrowRight } from "lucide-react"
import { Fragment } from "react"
import type { CSSProperties } from "react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { useParallax } from "@/hooks/use-scroll-reveal"

const HEADLINE = "PVC wall & ceiling panels for modern interiors."

/**
 * The hero states the business plainly: PVC wall and ceiling panels. The two
 * calls to action go straight to the two product lines, because those are the
 * only two things the client sells.
 *
 * On load the headline arrives word by word, the photo opens upwards while
 * zooming out, then the copy and buttons follow; the photo drifts gently as
 * the page scrolls. All of it is skipped for reduced-motion visitors.
 */
export function HeroSection() {
  const words = HEADLINE.split(" ")
  const parallaxRef = useParallax<HTMLImageElement>(0.1)
  const after = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties

  return (
    <section className="overflow-hidden border-b border-border bg-background">
      <Container className="py-14 sm:py-20 lg:py-26">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div className="max-w-[38rem]">
            <h1 className="type-display" aria-label={HEADLINE}>
              {words.map((word, index) => (
                <Fragment key={index}>
                  <span className="hero-word" style={{ "--i": index } as CSSProperties} aria-hidden="true">{word}</span>
                  {index < words.length - 1 && " "}
                </Fragment>
              ))}
            </h1>
            <p className="hero-rise type-lead mt-7 max-w-xl" style={after(650)}>Durable, moisture-resistant panelling that installs over existing walls and ceilings. Browse the range, order online, and arrange installation with our team.</p>
            <div className="hero-rise mt-9 flex flex-col gap-3 sm:flex-row" style={after(800)}>
              <Button size="lg" className="arrow-nudge h-11 px-5" asChild>
                <Link to="/products?category=wall-panels">Explore wall panels <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
              </Button>
              <Button variant="outline" size="lg" className="arrow-nudge h-11 px-5" asChild>
                <Link to="/products?category=ceiling-panels">Explore ceiling panels <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
              </Button>
            </div>
          </div>

          <figure className="hero-media media-hover relative overflow-hidden rounded-2xl">
            <img
              ref={parallaxRef}
              src="/images/home/hero-fluted-interior.webp"
              alt="Representative living room interior with fluted wall panelling behind a low console"
              className="hero-photo aspect-[4/5] w-full object-cover lg:aspect-[3/4]"
              width={1586}
              height={992}
              fetchPriority="high"
            />
            <figcaption className="hero-rise absolute right-4 bottom-4 bg-background/90 px-3 py-2 text-[0.68rem] font-medium text-foreground backdrop-blur-sm" style={after(1300)}>
              Representative interior — finishes vary by product
            </figcaption>
          </figure>
        </div>
      </Container>
    </section>
  )
}
