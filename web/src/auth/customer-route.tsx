import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/auth/use-auth"
import { Container } from "@/components/layout/container"
import { Skeleton } from "@/components/ui/skeleton"

export function CustomerRoute() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <Container className="flex min-h-[58vh] items-center justify-center"><div className="w-full max-w-sm space-y-4" aria-label="Restoring your session" aria-busy="true"><Skeleton className="mx-auto size-12 rounded-full" /><Skeleton className="mx-auto h-7 w-52" /><Skeleton className="mx-auto h-4 w-72 max-w-full" /></div></Container>
  }

  if (!isAuthenticated) {
    const intendedPath = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from: intendedPath }} />
  }

  if (user?.role !== "CUSTOMER") {
    return <Container className="flex min-h-[58vh] items-center py-16"><div className="max-w-xl"><p className="section-eyebrow">Customer access</p><h1 className="type-h1 mt-4">This area is for customer accounts.</h1><p className="mt-4 text-muted-foreground">Your current account does not have access to customer checkout and order tools.</p></div></Container>
  }

  return <Outlet />
}
