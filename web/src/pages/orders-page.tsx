import { AlertCircle, PackageSearch } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { getOrders } from "@/api/orders"
import { Container } from "@/components/layout/container"
import { OrderCard } from "@/components/orders/order-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getOrderErrorMessage } from "@/orders/order-errors"
import type { Order, OrderPagination } from "@/types/order"

export function OrdersPage() {
  useDocumentTitle("Your orders | PanelScan")
  const [orders, setOrders] = useState<Order[]>([])
  const [pagination, setPagination] = useState<OrderPagination | null>(null)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    getOrders({ page, limit: 10 }, controller.signal).then((result) => {
      setOrders(result.orders)
      setPagination(result.pagination)
    }).catch((caughtError) => {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
      setError(getOrderErrorMessage(caughtError))
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false)
    })
    return () => controller.abort()
  }, [page, retryKey])

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="max-w-3xl"><p className="section-eyebrow">Customer account</p><h1 className="type-h1 mt-4">Your orders</h1><p className="mt-4 text-base leading-7 text-muted-foreground">Review orders created from your PanelScan cart and follow their actual backend status.</p></div>
      <div className="mt-10">
        {isLoading ? <OrdersSkeleton /> : error ? <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-8 text-center"><AlertCircle className="mx-auto size-7 text-destructive" aria-hidden="true" /><h2 className="mt-4 text-xl font-semibold">Orders could not be loaded</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{error}</p><Button variant="outline" className="mt-6" onClick={() => setRetryKey((value) => value + 1)}>Try again</Button></div> : orders.length === 0 ? <div className="rounded-lg border border-border bg-secondary/35 px-6 py-16 text-center"><PackageSearch className="mx-auto size-8 text-primary" aria-hidden="true" /><h2 className="mt-5 text-2xl font-semibold">No orders yet</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Orders you place from your cart will appear here.</p><Button className="mt-7" asChild><Link to="/products">Browse products</Link></Button></div> : <div className="grid gap-5 lg:grid-cols-2">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</div>}
      </div>
      {pagination && pagination.totalPages > 1 && !isLoading && !error && <nav className="mt-8 flex items-center justify-between" aria-label="Order history pages"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p><Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></nav>}
    </Container>
  )
}

function OrdersSkeleton() {
  return <div className="grid gap-5 lg:grid-cols-2" aria-label="Loading orders" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-lg border border-border p-6"><div className="flex justify-between"><Skeleton className="h-4 w-36" /><Skeleton className="h-6 w-20" /></div><Skeleton className="mt-4 h-4 w-44" /><Skeleton className="mt-7 h-20 w-full" /></div>)}</div>
}
