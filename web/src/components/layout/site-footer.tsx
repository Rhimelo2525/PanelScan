import { ArrowUpRight } from "lucide-react"
import { Link } from "react-router-dom"

import { useAuth } from "@/auth/use-auth"
import { BrandLogo } from "@/components/layout/brand"
import { Container } from "@/components/layout/container"
import { Separator } from "@/components/ui/separator"

const exploreLinks = [
  { label: "PVC wall panels", href: "/products?category=wall-panels" },
  { label: "PVC ceiling panels", href: "/products?category=ceiling-panels" },
  { label: "Installation", href: "/installation" },
  { label: "How ordering works", href: "/#how-it-works" },
  { label: "About", href: "/about" },
]

const legalLinks = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
]

export function SiteFooter() {
  const { user, isAuthenticated, isLoading } = useAuth()

  return (
    <footer className="bg-primary text-primary-foreground">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.45fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <span className="block w-28 overflow-hidden rounded-lg bg-[#f2e3d5] p-2"><BrandLogo /></span>
            <p className="mt-6 text-sm leading-6 text-primary-foreground/68">PVC wall and ceiling panels from Disenyo Interior Solution, with online ordering and installation arranged by our own team.</p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary-foreground/50 uppercase">Explore</p>
            <ul className="mt-5 space-y-3">
              {exploreLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary-foreground/50 uppercase">Account</p>
            <ul className="mt-5 space-y-3">
              {!isLoading && !isAuthenticated && <><li><Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Log in <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></li><li><Link to="/register" className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Register <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></li></>}
              {!isLoading && isAuthenticated && <><li><Link to="/account" className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">My account <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></li>{user?.role === "CUSTOMER" && <li><Link to="/orders" className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Orders <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></li>}<li><Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Projects <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></li></>}
              {isLoading && <li className="text-sm text-primary-foreground/48">Checking account…</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary-foreground/50 uppercase">Legal</p>
            <ul className="mt-5 space-y-3">
              {legalLinks.map((link) => <li key={link.href}><Link to={link.href} className="text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">{link.label}</Link></li>)}
              <li><Link to="/admin-preview" className="text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Demo Admin preview</Link></li>
              <li><Link to="/customer-preview" className="text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Customer order preview</Link></li>
              <li><Link to="/moderator-preview" className="text-sm text-primary-foreground/78 transition-colors hover:text-primary-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">Moderator preview</Link></li>
            </ul>
          </div>
        </div>
        <Separator className="my-10 bg-primary-foreground/14" />
        <div className="flex flex-col gap-2 text-xs text-primary-foreground/48 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 PanelScan. All rights reserved.</p>
          <p>For Disenyo Interior Solution · <Link to="/privacy" className="underline-offset-4 hover:text-primary-foreground hover:underline">Privacy</Link></p>
        </div>
      </Container>
    </footer>
  )
}
