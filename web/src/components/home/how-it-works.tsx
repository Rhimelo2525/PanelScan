import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"

const steps = [
  { title: "Browse the range", body: "Compare wall and ceiling panels with their sizes and availability." },
  { title: "Create your account", body: "Pricing shows once you are signed in as a customer." },
  { title: "Build your cart", body: "Add the quantities you need; stock is checked against live inventory." },
  { title: "Check out", body: "Confirm your delivery address and place the order." },
  { title: "Pay securely", body: "Payment is completed on PayMongo's hosted checkout page." },
  { title: "Arrange installation", body: "Request installation and the team confirms your schedule." },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-space scroll-mt-24 border-y border-border bg-secondary/45">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="section-eyebrow">How ordering works</p>
            <h2 className="type-h2 mt-5">From browsing to installation, online.</h2>
          </div>
          <Button variant="outline" asChild><Link to="/products">Start browsing <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button>
        </div>

        <ol className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="border-t border-border pt-5">
              <span className="type-label text-primary">Step {index + 1}</span>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em]">{step.title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}
