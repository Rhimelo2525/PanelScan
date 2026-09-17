import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/auth/use-auth"
import { Container } from "@/components/layout/container"
import { Skeleton } from "@/components/ui/skeleton"

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <Container className="flex min-h-[58vh] items-center justify-center"><div className="w-full max-w-sm space-y-4" aria-label="Restoring your session" aria-busy="true"><Skeleton className="mx-auto size-12 rounded-full" /><Skeleton className="mx-auto h-7 w-52" /><Skeleton className="mx-auto h-4 w-72 max-w-full" /></div></Container>
  }

  if (!isAuthenticated) {
    const intendedPath = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from: intendedPath }} />
  }

  return <Outlet />
}
