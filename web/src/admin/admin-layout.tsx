import { ChevronRight, ExternalLink, LogOut, Menu } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"

import { adminNavGroups, navGroupsForRole } from "@/admin/admin-nav"
import { useAuth } from "@/auth/use-auth"
import { BrandMark } from "@/components/layout/brand"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const roleLabels: Record<string, string> = { OWNER: "Owner", MODERATOR: "Moderator", CUSTOMER: "Customer" }

export function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  useEffect(() => { setIsMobileNavOpen(false) }, [location.pathname])

  if (!user) return null

  const groups = navGroupsForRole(user.role)
  const currentItem = adminNavGroups
    .flatMap((group) => group.items)
    .filter((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()

  async function handleSignOut() {
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="admin-surface min-h-screen lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-card lg:flex">
        <AdminBrand />
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin sections">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-2.5 pb-2 text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} className={({ isActive }) => cn("admin-nav-link flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none", isActive && "text-foreground")}>
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" asChild>
            <Link to="/"><ExternalLink data-icon="inline-start" aria-hidden="true" />View storefront</Link>
          </Button>
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
                              {item.label}
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

function AdminBrand() {
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
      <BrandMark className="size-8" />
      <span className="leading-tight"><span className="block text-sm font-semibold tracking-[-0.01em]">PanelScan</span><span className="block text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">Admin</span></span>
    </div>
  )
}
