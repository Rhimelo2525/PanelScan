import { LockKeyhole } from "lucide-react"
import { Link } from "react-router-dom"

import { useAuth } from "@/auth/use-auth"
import { Skeleton } from "@/components/ui/skeleton"
import { formatProductPrice } from "@/lib/format-price"
import { cn } from "@/lib/utils"

interface ProductPriceProps {
  price: string | null
  returnTo: string
  className?: string
}

export function ProductPrice({ price, returnTo, className }: ProductPriceProps) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <Skeleton className="mt-2 h-5 w-32" aria-label="Checking price access" />

  if (!isAuthenticated || !price) {
    return <Link to="/login" state={{ from: returnTo }} className={cn("mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground outline-none hover:text-primary focus-visible:underline", className)}><LockKeyhole className="size-3.5 text-primary" aria-hidden="true" />Sign in to view pricing</Link>
  }

  return <p className={cn("mt-2 text-lg font-semibold tracking-[-0.02em] text-foreground", className)}>{formatProductPrice(price)}</p>
}

