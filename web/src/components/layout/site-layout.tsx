import { useEffect } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { MessageSquare } from "lucide-react"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"

import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"

export function SiteLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [pathname])

  return (
    <div className="min-h-screen overflow-x-clip">
      <a href="#main-content" className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0">Skip to main content</a>
      <SiteHeader />
      {/* Entry-only route transition. Keying on the path remounts the main
          landmark so the fade-and-rise replays even between two params of the
          same route (one product to the next). Nothing animates on exit, so
          navigation is never held back waiting for an outgoing animation, and
          #main-content always exists for the skip link. */}
      <main id="main-content" key={pathname} className="motion-page"><Outlet /></main>
      <aside className="border-t border-border bg-secondary/30 py-5" aria-label="Customer support"><Container className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold">Questions about your panels?</p><p className="mt-1 text-xs text-muted-foreground">Chat directly with our team for orders, specs, or installation advice.</p></div><Button variant="outline" asChild><Link to="/messages"><MessageSquare className="size-4" aria-hidden="true" />Chat with Support</Link></Button></Container></aside>
      <SiteFooter />

    </div>
  )
}
