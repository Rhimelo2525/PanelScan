import { useEffect, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { MessageSquare } from "lucide-react"
import { useAuth } from "@/auth/use-auth"
import { SupportChatWidget } from "@/components/chat/support-chat-widget"

import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"

const CHAT_BUBBLE_CLASS = "fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:right-6 sm:bottom-6"

export function SiteLayout() {
  const location = useLocation()
  const isMessagesPage = location.pathname.startsWith("/messages")
  const { user } = useAuth()
  // The round chat button opens the small chat for a signed-in customer; anyone
  // else goes to Messages (which asks them to sign in with a customer account).
  const canChat = user?.role === "CUSTOMER"
  const [isChatOpen, setIsChatOpen] = useState(false)
  const showChat = isChatOpen && canChat && !isMessagesPage
  // Reaching Messages (by any link) closes the small chat: the full one is on screen.
  useEffect(() => { if (isMessagesPage) setIsChatOpen(false) }, [isMessagesPage])

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "")
      let attempts = 0
      const maxAttempts = 20
      const scrollToHashElement = () => {
        const element = document.getElementById(id)
        if (element) {
          element.scrollIntoView({ behavior: "smooth" })
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(scrollToHashElement, 50)
        }
      }
      const timer = setTimeout(scrollToHashElement, 30)
      return () => clearTimeout(timer)
    } else {
      window.scrollTo({ top: 0, behavior: "instant" })
    }
  }, [location.pathname, location.hash])

  return (
    <div className="min-h-screen overflow-x-clip">
      <a href="#main-content" className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0">Skip to main content</a>
      <SiteHeader />
      {/* Entry-only route transition. Keying on the path remounts the main
          landmark so the fade-and-rise replays even between two params of the
          same route (one product to the next). Nothing animates on exit, so
          navigation is never held back waiting for an outgoing animation, and
          #main-content always exists for the skip link. */}
      <main id="main-content" key={location.pathname} className="motion-page"><Outlet /></main>
      <SiteFooter />
      {/* A round chat button that stays in the corner on every page, except on
          Messages itself (the customer is already chatting there) and while the
          small chat, which opens in the same corner, is showing. */}
      {!isMessagesPage && !showChat && (canChat ? (
        <button type="button" onClick={() => setIsChatOpen(true)} aria-expanded={false} aria-label="Chat with Support" title="Chat with Support" className={CHAT_BUBBLE_CLASS}>
          <MessageSquare className="size-6" aria-hidden="true" />
        </button>
      ) : (
        <Link to="/messages" aria-label="Chat with Support" title="Chat with Support" className={CHAT_BUBBLE_CLASS}>
          <MessageSquare className="size-6" aria-hidden="true" />
        </Link>
      ))}
      {showChat && <SupportChatWidget onClose={() => setIsChatOpen(false)} />}

    </div>
  )
}
