import { AlertCircle, ShoppingCart } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function CartEmptyState() {
  return (
    <div className="rounded-lg border border-border bg-secondary/35 px-6 py-16 text-center sm:py-20">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><ShoppingCart className="size-5" aria-hidden="true" /></div>
      <h2 className="mt-6 text-2xl font-semibold tracking-[-0.035em]">Your cart is empty</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Explore the material catalog and add the quantities you want to review.</p>
      <Button className="mt-7" size="lg" asChild><Link to="/products">Browse products</Link></Button>
    </div>
  )
}

export function CartErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-6 py-14 text-center">
      <AlertCircle className="mx-auto size-7 text-destructive" aria-hidden="true" />
      <h2 className="mt-5 text-xl font-semibold">Your cart could not be loaded</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" className="mt-6" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function CartPageSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-label="Loading your cart" aria-busy="true">
      <div className="space-y-6">{Array.from({ length: 2 }).map((_, index) => <div key={index} className="grid gap-5 border-b border-border pb-6 sm:grid-cols-[8rem_1fr]"><Skeleton className="aspect-square w-full" /><div className="space-y-4"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-36" /><Skeleton className="h-10 w-32" /></div></div>)}</div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}
