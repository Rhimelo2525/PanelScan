import { Droplets, Hammer, PackageCheck, Wrench } from "lucide-react"

import { Container } from "@/components/layout/container"
import { stagger } from "@/hooks/use-scroll-reveal"

/**
 * Reasons stated in terms of what PVC panelling and this business actually offer
 * - no statistics, awards, or testimonials, none of which the client has
 * supplied.
 */
const reasons = [
  {
    icon: Droplets,
    title: "Moisture-resistant by material",
    body: "PVC panelling does not absorb water the way board and timber do, which suits Philippine humidity, kitchens, and wet areas.",
  },
  {
    icon: Wrench,
    title: "Installs over existing surfaces",
    body: "Panels are fixed onto walls and ceilings that are already there, so there is far less demolition, dust, and wet work.",
  },
  {
    icon: Hammer,
    title: "Installation by our own team",
    body: "Order materials only, or request installation and let Disenyo Interior Solution schedule and carry out the work.",
  },
  {
    icon: PackageCheck,
    title: "Ordering and records in one place",
    body: "Your quantities, orders, payments, installation requests, and messages stay together in your PanelScan account.",
  },
]

export function WhySection() {
  return (
    <section className="section-space bg-background">
      <Container>
        <div className="max-w-2xl">
          <p className="section-eyebrow" data-rv>Why Disenyo</p>
          <h2 className="type-h2 mt-5" data-rv style={stagger(1)}>A practical way to finish a room.</h2>
        </div>
        <div className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2">
          {reasons.map((reason, index) => (
            <div key={reason.title} className="group max-w-md" data-rv style={stagger(index)}>
              <span className="icon-tile inline-grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                <reason.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{reason.title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{reason.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
