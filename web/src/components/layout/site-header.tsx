import { ChevronDown, HardHat, LayoutDashboard, LogOut, Menu, MessageSquare, PackageCheck, PanelsTopLeft, ScanLine, ShoppingCart, Star, UserRound } from "lucide-react"
import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import { isAdminRole } from "@/admin/admin-nav"
import { useAuth } from "@/auth/use-auth"
import { useCart } from "@/cart/use-cart"
import { Brand } from "@/components/layout/brand"
import { Container } from "@/components/layout/container"
import { CustomerAvatar } from "@/components/profile/customer-avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Primary navigation reflects the two things Disenyo Interior Solution actually
 * sells, plus installation and company information. Nothing here advertises AR,
 * 3D, or measurement features, which are not part of the website.
 */
const navigation = [
  { label: "Wall panels", href: "/products?category=wall-panels" },
  { label: "Ceiling panels", href: "/products?category=ceiling-panels" },
  { label: "Installation", href: "/#installation" },
  { label: "How ordering works", href: "/#how-it-works" },
  { label: "About", href: "/about" },
]

export function SiteHeader() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { itemCount, isLoading: isCartLoading, error: cartError } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleNavClick = (href: string, e: React.MouseEvent) => {
    if (href.includes("#")) {
      const [path, hash] = href.split("#")
      const targetPath = path || "/"
      const targetId = hash
      if (location.pathname === targetPath) {
        e.preventDefault()
        const element = document.getElementById(targetId)
        if (element) {
          element.scrollIntoView({ behavior: "smooth" })
          window.history.pushState(null, "", `#${targetId}`)
        }
      }
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
      navigate("/", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/92 backdrop-blur-md">
      <Container className="flex h-[4.75rem] items-center justify-between gap-6">
        <Brand />
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              onClick={(e) => handleNavClick(item.href, e)}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden min-w-44 items-center justify-end gap-2 lg:flex">
          {isLoading && <div className="flex items-center gap-2" aria-label="Checking account session"><Skeleton className="h-9 w-16" /><Skeleton className="h-9 w-28" /></div>}
          {!isLoading && !isAuthenticated && <><Button variant="ghost" size="lg" asChild><Link to="/login">Log in</Link></Button><Button size="lg" asChild><Link to="/register">Create account</Link></Button></>}
          {!isLoading && user && <>
            {user.role === "CUSTOMER" && <Button variant="ghost" size="icon-lg" className="relative" asChild><Link to="/cart" aria-label={`Cart${!isCartLoading && !cartError ? `, ${itemCount} items` : ""}`}><ShoppingCart aria-hidden="true" />{isCartLoading ? <Skeleton className="absolute -top-1 -right-1 size-4 rounded-full ring-2 ring-background" /> : !cartError && <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] leading-5 font-semibold text-primary-foreground ring-2 ring-background">{itemCount > 99 ? "99+" : itemCount}</span>}</Link></Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="lg" className="gap-2" aria-label={`Open account menu for ${user.firstName}`}>
                  <CustomerAvatar user={user} className="size-6" />
                  <span className="max-w-28 truncate">{user.firstName}</span><ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel><span className="block font-medium">{user.firstName} {user.lastName}</span><span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{user.email}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdminRole(user.role) && <DropdownMenuItem asChild><Link to="/admin"><PanelsTopLeft aria-hidden="true" />PanelScan Admin</Link></DropdownMenuItem>}
                <DropdownMenuItem asChild><Link to="/dashboard"><LayoutDashboard aria-hidden="true" />My dashboard</Link></DropdownMenuItem>
                {user.role === "CUSTOMER" && <DropdownMenuItem asChild><Link to="/profile"><UserRound aria-hidden="true" />Profile</Link></DropdownMenuItem>}
                {user.role === "CUSTOMER" && <DropdownMenuItem asChild><Link to="/orders"><PackageCheck aria-hidden="true" />Orders</Link></DropdownMenuItem>}
                {user.role === "CUSTOMER" && <>
                  <DropdownMenuItem asChild><Link to="/projects"><ScanLine aria-hidden="true" />AR &amp; 3D projects</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/messages"><MessageSquare aria-hidden="true" />Messages</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/installation"><HardHat aria-hidden="true" />Installation</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/feedback"><Star aria-hidden="true" />Feedback</Link></DropdownMenuItem>
                </>}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={isLoggingOut} onSelect={() => void handleLogout()}><LogOut aria-hidden="true" />{isLoggingOut ? "Logging out…" : "Log out"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>}
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-lg" className="lg:hidden" aria-label="Open navigation menu">
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(24rem,88vw)] bg-background p-0">
            <SheetHeader className="border-b border-border px-6 py-6 text-left">
              <SheetTitle className="sr-only">Website navigation</SheetTitle>
              <SheetDescription className="sr-only">Navigate PanelScan public pages and account options.</SheetDescription>
              <SheetClose asChild>
                <div>
                  <Brand />
                </div>
              </SheetClose>
            </SheetHeader>
            <nav className="flex flex-col px-4 py-5" aria-label="Mobile navigation">
              {navigation.map((item) => (
                <SheetClose key={item.label} asChild>
                  <Link
                    to={item.href}
                    onClick={(e) => handleNavClick(item.href, e)}
                    className="rounded-lg px-3 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>
            <div className="mt-auto grid gap-2 border-t border-border p-6">
              {isLoading && <div className="space-y-2" aria-label="Checking account session"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
              {!isLoading && !isAuthenticated && <><SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/login">Log in</Link></Button></SheetClose><SheetClose asChild><Button size="lg" asChild><Link to="/register">Create account</Link></Button></SheetClose></>}
              {!isLoading && user && <><div className="mb-3 flex items-center gap-3"><CustomerAvatar user={user} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.firstName} {user.lastName}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div></div>{user.role === "CUSTOMER" && <><SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/cart"><ShoppingCart data-icon="inline-start" aria-hidden="true" />Cart{isCartLoading ? <Skeleton className="ml-auto size-4 rounded-full" /> : !cartError && <span className="ml-auto tabular-nums">{itemCount > 99 ? "99+" : itemCount}</span>}</Link></Button></SheetClose><SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/orders"><PackageCheck data-icon="inline-start" aria-hidden="true" />Orders</Link></Button></SheetClose><SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/projects"><ScanLine data-icon="inline-start" aria-hidden="true" />AR &amp; 3D projects</Link></Button></SheetClose></>}{isAdminRole(user.role) && <SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/admin"><PanelsTopLeft data-icon="inline-start" aria-hidden="true" />PanelScan Admin</Link></Button></SheetClose>}<SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/dashboard">My dashboard</Link></Button></SheetClose>{user.role === "CUSTOMER" && <><SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/profile"><UserRound data-icon="inline-start" aria-hidden="true" />Profile</Link></Button></SheetClose><SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/messages"><MessageSquare data-icon="inline-start" aria-hidden="true" />Messages</Link></Button></SheetClose><SheetClose asChild><Button variant="outline" size="lg" asChild><Link to="/installation"><HardHat data-icon="inline-start" aria-hidden="true" />Installation</Link></Button></SheetClose></>}<SheetClose asChild><Button variant="ghost" size="lg" onClick={() => void handleLogout()} disabled={isLoggingOut}><LogOut data-icon="inline-start" aria-hidden="true" />{isLoggingOut ? "Logging out…" : "Log out"}</Button></SheetClose></>}
            </div>
          </SheetContent>
        </Sheet>
      </Container>
    </header>
  )
}
