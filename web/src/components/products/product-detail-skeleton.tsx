import { Container } from "@/components/layout/container"
import { Skeleton } from "@/components/ui/skeleton"

export function ProductDetailSkeleton() {
  return (
    <Container className="py-10 sm:py-14" aria-label="Loading product details" aria-busy="true">
      <Skeleton className="h-5 w-72 max-w-full" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <Skeleton className="aspect-[4/3] w-full rounded-xl" />
        <div className="space-y-5 pt-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-14 w-4/5" />
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </Container>
  )
}
