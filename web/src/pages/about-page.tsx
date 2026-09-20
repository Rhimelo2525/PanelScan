import { Building2, Mail, MapPin, MessageSquare, Phone } from "lucide-react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function AboutPage() {
  useDocumentTitle("About PanelScan | Disenyo Interior Solution")

  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-14 sm:py-20">
        <Container>
          <p className="section-eyebrow">Disenyo Interior Solution</p>
          <h1 className="type-display mt-5 max-w-3xl">PVC panelling, supplied and fitted.</h1>
          <p className="type-lead mt-6 max-w-2xl">Disenyo Interior Solution supplies PVC wall and ceiling panels and installs them for homes and businesses. PanelScan brings the range, ordering, and service coordination together in one place.</p>
        </Container>
      </section>

      <Container className="py-12 sm:py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
          <div className="space-y-12">
            <section aria-labelledby="what-we-do">
              <h2 id="what-we-do" className="type-h2">What we do</h2>
              <div className="mt-6 space-y-6 text-base leading-7 text-muted-foreground">
                <p>Disenyo Interior Solution supplies and installs PVC wall panels and PVC ceiling panels for interior finishing work. Panels are fixed over existing walls and ceilings, which keeps installation quick and avoids the mess of wet trades.</p>
                <p>PanelScan is the platform we use to run that service online: customers browse the current range with live stock, order and pay through a hosted PayMongo checkout, request installation, and message the team. Behind it, the same records drive our own inventory, sales, and service operations.</p>
              </div>
            </section>

            <section aria-labelledby="mission">
              <h2 id="mission" className="type-h2">Mission</h2>
              <div className="mt-6 text-base leading-7 text-muted-foreground">
                <p>To provide quality and stylish interior finishing solutions that help customers improve their spaces through reliable PVC wall and ceiling panels, professional service, and convenient ordering.</p>
              </div>
            </section>

            <section aria-labelledby="vision">
              <h2 id="vision" className="type-h2">Vision</h2>
              <div className="mt-6 text-base leading-7 text-muted-foreground">
                <p>To become a trusted provider of modern interior solutions by offering dependable products, convenient services, and an easier way for customers to plan and improve their interior spaces.</p>
              </div>
            </section>

            <section aria-labelledby="values">
              <h2 id="values" className="type-h2">Core values</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="surface-card p-5">
                  <h3 className="text-base font-semibold text-foreground">Quality</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    We aim to provide reliable products and workmanship that meet the needs of our customers.
                  </p>
                </div>
                <div className="surface-card p-5">
                  <h3 className="text-base font-semibold text-foreground">Customer Service</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    We listen to our customers and provide clear, helpful, and responsive assistance.
                  </p>
                </div>
                <div className="surface-card p-5">
                  <h3 className="text-base font-semibold text-foreground">Reliability</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    We value dependable service, accurate information, and responsible handling of every order and project.
                  </p>
                </div>
                <div className="surface-card p-5">
                  <h3 className="text-base font-semibold text-foreground">Continuous Improvement</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    We continue improving our products, services, processes, and customer experience.
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="background">
              <h2 id="background" className="type-h2">Business background</h2>
              <div className="mt-6 space-y-6 text-base leading-7 text-muted-foreground">
                <p>iDISENYO Interior Solutions provides PVC wall panels and PVC ceiling panels for interior finishing applications. The business helps customers improve residential and commercial spaces through the supply of interior panel products and installation services.</p>
                <p>To make the customer experience more convenient, the business uses PanelScan as its digital platform for browsing available products, checking product information, placing orders, and requesting installation services.</p>
              </div>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28">
            <section className="surface-card p-6" aria-labelledby="contact">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" aria-hidden="true" />
                <h2 id="contact" className="font-semibold text-foreground">Contact</h2>
              </div>
              <ul className="mt-5 space-y-4 text-sm">
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="text-muted-foreground">
                    <p className="font-medium text-foreground">iDISENYO Interior Solutions</p>
                    <p>1 M. Villarica Rd</p>
                    <p>San Jose Del Monte City, Bulacan</p>
                    <p>Philippines 3023</p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <a
                    href="tel:09686876753"
                    className="text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    0968 687 6753
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <a
                    href="mailto:idisenyo.interiors2024@gmail.com"
                    className="break-all text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    idisenyo.interiors2024@gmail.com
                  </a>
                </li>
                <li className="flex items-start gap-2.5">
                  <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-muted-foreground">
                    Idisenyo Interior Solutions
                  </span>
                </li>
              </ul>
            </section>

            <section className="rounded-lg border border-border bg-primary p-6 text-primary-foreground" aria-labelledby="start">
              <h2 id="start" className="text-xl font-medium tracking-[-0.03em]">Browse the range</h2>
              <p className="mt-3 text-sm leading-6 text-primary-foreground/70">PVC wall and ceiling panels, with current sizes and availability.</p>
              <Button variant="secondary" className="mt-5 w-full" asChild><Link to="/products">View panels</Link></Button>
            </section>
          </aside>
        </div>
      </Container>
    </>
  )
}
