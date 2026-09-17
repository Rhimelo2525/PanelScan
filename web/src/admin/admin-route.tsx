import { Navigate, Outlet, useLocation } from "react-router-dom"

import { isAdminRole } from "@/admin/admin-nav"
import { useAuth } from "@/auth/use-auth"
import { Container } from "@/components/layout/container"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * UX-level guard only. Every admin endpoint independently enforces role on the
 * backend (403), so this exists to route people sensibly, not to protect data:
 * a customer who forces their way to /admin still receives nothing from the API.
 */
export function AdminRoute() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <Container className="flex min-h-[60vh] items-center justify-center"><div className="w-full max-w-sm space-y-4" aria-label="Restoring your session" aria-busy="true"><Skeleton className="mx-auto h-7 w-52" /><Skeleton className="mx-auto h-4 w-72 max-w-full" /></div></Container>
  }

  if (!isAuthenticated) {
    const intendedPath = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from: intendedPath }} />
  }

  // Customers are sent to their own dashboard rather than shown an admin-shaped
  // error page that would confirm what lives here.
  if (!isAdminRole(user?.role)) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
