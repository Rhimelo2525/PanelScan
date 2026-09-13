import { AlertCircle, PackageOpen, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function ProductGridSkeleton() {
  return (
    <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading products" aria-busy="true">
      {Array.from({ length: 8 }, (_, index) => (
        <Card key={index} className="gap-0 overflow-hidden py-0 shadow-none">
          <Skeleton className="aspect-[4/3] rounded-xl" />
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-6 h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface EmptyCatalogProps {
  filtered: boolean
  onReset: () => void
}

export function EmptyCatalog({ filtered, onReset }: EmptyCatalogProps) {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 text-center">
      <PackageOpen className="size-8 text-primary" aria-hidden="true" />
      <h2 className="mt-5 text-2xl font-medium tracking-[-0.03em]">No products found</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{filtered ? "Try adjusting your search or category filter." : "The public catalog does not contain any available products yet."}</p>
      {filtered && <Button className="mt-6" variant="outline" onClick={onReset}>Reset filters</Button>}
    </div>
  )
}

interface CatalogErrorProps {
  title?: string
  onRetry: () => void
}

export function CatalogError({ title = "The catalog could not be loaded", onRetry }: CatalogErrorProps) {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center surface-card px-6 text-center" role="alert">
      <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      <h2 className="mt-5 text-2xl font-medium tracking-[-0.03em]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Please check your connection and try again. No server details have been exposed.</p>
      <Button className="mt-6" variant="outline" onClick={onRetry}><RefreshCw data-icon="inline-start" aria-hidden="true" />Retry</Button>
    </div>
  )
}

