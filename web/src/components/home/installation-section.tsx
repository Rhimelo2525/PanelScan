import { ArrowRight, Hammer, Package } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"

/**
 * Two genuine ways to buy: materials only, or materials with installation
 * arranged through the team. Installation requests are a real backend flow
 * (bookings), so this section links to it rather than describing a future
 * feature.
 */
export function InstallationSection() {
  return (
    <section id="installation" className="section-space scroll-mt-24 bg-background">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <figure className="relative">
            <img
              src="/images/interiors/panel-installation.webp"
              alt="Representative view of panelling being aligned against a prepared interior wall"
              className="aspect-[4/3] w-full rounded-xl object-cover"
              width={1280}
              height={960}
              loading="lazy"
            />
          </figure>

          <div className="max-w-xl">
            <p className="section-eyebrow">Installation</p>
            <h2 className="type-h2 mt-5">Buy the panels, or have us fit them.</h2>
            <p className="type-body mt-5">Some customers order materials and handle the work themselves. Others prefer the panels fitted properly the first time. Both are fine — installation is arranged separately from your order, with a date confirmed by the team.</p>

            <dl className="mt-9 grid gap-8 sm:grid-cols-2">
              <div>
                <dt className="flex items-center gap-2 font-semibold"><Package className="size-4 text-primary" aria-hidden="true" />Materials only</dt>
                <dd className="mt-2 text-sm leading-7 text-muted-foreground">Order panels online and collect or receive them for your own installer.</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-semibold"><Hammer className="size-4 text-primary" aria-hidden="true" />With installation</dt>
                <dd className="mt-2 text-sm leading-7 text-muted-foreground">Submit an installation request with your preferred date and address; the team confirms and assigns an installer.</dd>
              </div>
            </dl>

            <Button className="mt-9" asChild>
              <Link to="/installation">Request installation <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
