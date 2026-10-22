import { ChevronRight, ExternalLink, LogOut, Menu, Pin, PinOff } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"

import { adminNavGroups, navGroupsForRole } from "@/admin/admin-nav"
import { useSupportChatUnread } from "@/admin/use-support-chat-unread"
import { useAuth } from "@/auth/use-auth"
import { useConfirm } from "@/components/confirm/use-confirm"
import { BrandMark } from "@/components/layout/brand"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const roleLabels: Record<string, string> = { OWNER: "Owner", MODERATOR: "Moderator", CUSTOMER: "Customer" }

// The desktop sidebar's "keep open" choice, remembered per browser (a convenience only).
const SIDEBAR_PINNED_KEY = "panelscan.admin.sidebarPinned"

function readSidebarPinned(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_PINNED_KEY) === "true"
  } catch {
    return false
  }
}

function writeSidebarPinned(pinned: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, String(pinned))
  } catch {
    // Storage blocked (private window): the choice lasts until the page reloads.
  }
}

export function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const confirm = useConfirm()
  // Desktop: the sidebar is a rail of icons that opens while the pointer (or keyboard focus)
  // is on it, or stays open when pinned.
  const [isSidebarPinned, setIsSidebarPinned] = useState(readSidebarPinned)
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)
  const [isSidebarFocused, setIsSidebarFocused] = useState(false)
  const isSidebarOpen = isSidebarPinned || isSidebarHovered || isSidebarFocused

  function toggleSidebarPinned() {
    setIsSidebarPinned((pinned) => {
      writeSidebarPinned(!pinned)
      return !pinned
    })
  }

  useEffect(() => { setIsMobileNavOpen(false) }, [location.pathname])

  // Only the staff roles that can see Support chat ever ask for its unread state.
  const hasUnreadChat = useSupportChatUnread(user?.role === "OWNER" || user?.role === "MODERATOR")

  if (!user) return null

  const navLabel = (item: { to: string; label: string }) => (
    <>
      {item.label}
      {item.to === "/admin/chat" && hasUnreadChat && <span className="size-2 shrink-0 rounded-full bg-(--unread-dot)" role="status" aria-label="Unread messages" />}
    </>
  )

  const groups = navGroupsForRole(user.role)
  const currentItem = adminNavGroups
    .flatMap((group) => group.items)
    .filter((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()

  async function handleSignOut() {
    if (!(await confirm({ title: "Are you sure you want to sign out?", confirmLabel: "Sign Out" }))) return
    await logout()
    navigate("/login/admin", { replace: true })
  }

  return (
    <div className={cn("admin-surface min-h-screen lg:grid lg:transition-[grid-template-columns] lg:duration-200", isSidebarPinned ? "lg:grid-cols-[15.5rem_minmax(0,1fr)]" : "lg:grid-cols-[4rem_minmax(0,1fr)]")}>
      {/* The grid keeps a 4rem column for the rail; opened unpinned, the panel slides out over the page. */}
      <aside
        className="sticky top-0 z-30 hidden h-screen lg:block"
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        onFocus={() => setIsSidebarFocused(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsSidebarFocused(false) }}
      >
        <div className={cn(
          "flex h-full flex-col overflow-hidden border-r border-border bg-card transition-[width,box-shadow] duration-200",
          isSidebarOpen ? "w-62" : "w-16",
          isSidebarOpen && !isSidebarPinned && "shadow-xl",
        )}>
          <div className="flex items-center justify-between gap-2 border-b border-border">
            <AdminBrand compact={!isSidebarOpen} />
            {isSidebarOpen && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-2 shrink-0 text-muted-foreground"
                onClick={toggleSidebarPinned}
                aria-pressed={isSidebarPinned}
                aria-label={isSidebarPinned ? "Unpin the sidebar (show icons only)" : "Pin the sidebar open"}
                title={isSidebarPinned ? "Unpin: show icons only" : "Pin: keep the sidebar open"}
              >
                {isSidebarPinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
              </Button>
            )}
          </div>
          <nav className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4" aria-label="Admin sections">
            {groups.map((group) => (
              <div key={group.label} className="mb-5">
                <p className={cn("px-2.5 pb-2 text-[0.65rem] font-semibold tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase", !isSidebarOpen && "invisible")}>{group.label}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        title={isSidebarOpen ? undefined : item.label}
                        aria-label={isSidebarOpen ? undefined : item.label}
                        className={({ isActive }) => cn("admin-nav-link relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none", isActive && "text-foreground")}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden="true" />
                        {isSidebarOpen ? navLabel(item) : item.to === "/admin/chat" && hasUnreadChat && (
                          <span className="absolute top-1.5 left-6 size-2 rounded-full bg-(--unread-dot)" role="status" aria-label="Unread messages" />
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-border p-3">
            <Button variant="ghost" size="sm" className="w-full justify-start overflow-hidden whitespace-nowrap text-muted-foreground" asChild>
              <Link to="/" title={isSidebarOpen ? undefined : "View storefront"} aria-label={isSidebarOpen ? undefined : "View storefront"}>
                <ExternalLink data-icon="inline-start" aria-hidden="true" />{isSidebarOpen && "View storefront"}
              </Link>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Open admin navigation"><Menu aria-hidden="true" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="admin-surface w-72 p-0">
                <SheetHeader className="border-b border-border p-0"><SheetTitle className="sr-only">Admin navigation</SheetTitle><AdminBrand /></SheetHeader>
                <nav className="overflow-y-auto px-3 pb-6" aria-label="Admin sections">
                  {groups.map((group) => (
                    <div key={group.label} className="mb-5">
                      <p className="px-2.5 pb-2 text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{group.label}</p>
                      <ul className="space-y-0.5">
                        {group.items.map((item) => (
                          <li key={item.to}>
                            <NavLink to={item.to} end={item.end} className={({ isActive }) => cn("admin-nav-link flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground", isActive && "text-foreground")}>
                              <item.icon className="size-4 shrink-0" aria-hidden="true" />
                              {navLabel(item)}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>

            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-1.5 text-sm">
                <li className="text-muted-foreground">Admin</li>
                {currentItem && <><li aria-hidden="true"><ChevronRight className="size-3.5 text-muted-foreground" /></li><li className="truncate font-medium" aria-current="page">{currentItem.label}</li></>}
              </ol>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium sm:inline">{roleLabels[user.role] ?? user.role}</span>
            <NotificationBell size="icon-sm" className="mr-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2" aria-label={`Account menu for ${user.firstName}`}>
                  <Avatar className="size-6"><AvatarFallback className="bg-primary text-[0.65rem] text-primary-foreground">{initials}</AvatarFallback></Avatar>
                  <span className="hidden max-w-32 truncate sm:inline">{user.firstName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal"><span className="block text-sm font-medium">{user.firstName} {user.lastName}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/">Storefront</Link></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleSignOut()}><LogOut aria-hidden="true" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** The PanelScan mark and name; `compact` (the closed sidebar rail) shows the mark alone. */
function AdminBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-4 py-3.5">
      <BrandMark className="size-8 shrink-0" />
      <span className={cn("min-w-0 leading-tight whitespace-nowrap", compact && "sr-only")}>
        <span className="block text-sm font-semibold tracking-[-0.01em]">PanelScan</span>
        <span className="block truncate text-[0.55rem] font-medium tracking-[0.11em] text-muted-foreground uppercase">
          Disenyo Interior Solution
        </span>
      </span>
    </div>
  )
}
