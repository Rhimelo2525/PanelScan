import { AlertCircle, PackageSearch, Search, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { useDebouncedValue } from "@/admin/use-admin-resource"
import { getOrders } from "@/api/orders"
import { Container } from "@/components/layout/container"
import { OrderCard } from "@/components/orders/order-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getOrderErrorMessage } from "@/orders/order-errors"
import { cn } from "@/lib/utils"
import type { Order, OrderPagination, OrderStatus } from "@/types/order"

const TABS: { value: OrderStatus | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
]

const isOrderStatus = (value: string | null): value is OrderStatus => TABS.some((tab) => tab.value === value)

/**
 * The customer's orders, one status per tab (kept in the URL as ?status=, so
 * a refresh or a shared link opens the same tab), with a search by order
 * number or product name. Filtering happens on the server, so every tab pages
 * through all of the customer's orders, not just the ones already loaded.
 */
export function OrdersPage() {
  useDocumentTitle("Your orders | PanelScan")
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get("status")?.toUpperCase() ?? null
  const status = isOrderStatus(statusParam) ? statusParam : null
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search.trim(), 350)
  const [orders, setOrders] = useState<Order[]>([])
  const [pagination, setPagination] = useState<OrderPagination | null>(null)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  // A new tab or search starts again from the first page.
  useEffect(() => setPage(1), [status, debouncedSearch])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    getOrders({ page, limit: 10, status: status ?? undefined, search: debouncedSearch || undefined }, controller.signal).then((result) => {
      setOrders(result.orders)
      setPagination(result.pagination)
    }).catch((caughtError) => {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
      setError(getOrderErrorMessage(caughtError))
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false)
    })
    return () => controller.abort()
  }, [page, status, debouncedSearch, retryKey])

  function selectTab(value: OrderStatus | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set("status", value.toLowerCase())
      else next.delete("status")
      return next
    }, { replace: true })
  }

  const activeLabel = TABS.find((tab) => tab.value === status)?.label ?? "All"
  const isFiltered = Boolean(status) || Boolean(debouncedSearch)

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="max-w-3xl"><p className="section-eyebrow">Customer account</p><h1 className="type-h1 mt-4">Your orders</h1><p className="mt-4 text-base leading-7 text-muted-foreground">Review orders created from your PanelScan cart and follow their actual backend status.</p></div>

      <div className="mt-10 space-y-4">
        <div className="surface-card overflow-x-auto p-0" role="tablist" aria-label="Order status">
          <div className="flex min-w-max">
            {TABS.map((tab) => {
              const isActive = tab.value === status
              return (
                <button
                  key={tab.label}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => selectTab(tab.value)}
                  className={cn(
                    "flex-1 border-b-2 px-5 py-3.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:px-6",
                    isActive ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by order number or product name"
            aria-label="Search your orders"
            maxLength={100}
            className="h-11 pr-10 pl-10"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Clear search">
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {isLoading ? <OrdersSkeleton /> : error ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-8 text-center"><AlertCircle className="mx-auto size-7 text-destructive" aria-hidden="true" /><h2 className="mt-4 text-xl font-semibold">Orders could not be loaded</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{error}</p><Button variant="outline" className="mt-6" onClick={() => setRetryKey((value) => value + 1)}>Try again</Button></div>
        ) : orders.length === 0 ? (
          isFiltered ? (
            <div className="rounded-lg border border-border bg-secondary/35 px-6 py-14 text-center">
              <PackageSearch className="mx-auto size-8 text-primary" aria-hidden="true" />
              <h2 className="mt-5 text-xl font-semibold">{debouncedSearch ? "No orders match your search" : `No ${activeLabel.toLowerCase()} orders`}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{debouncedSearch ? `Nothing in ${activeLabel === "All" ? "your orders" : `${activeLabel.toLowerCase()} orders`} matches "${debouncedSearch}".` : "Orders with this status will appear here."}</p>
              <Button variant="outline" className="mt-6" onClick={() => { setSearch(""); selectTab(null) }}>Show all orders</Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-secondary/35 px-6 py-16 text-center"><PackageSearch className="mx-auto size-8 text-primary" aria-hidden="true" /><h2 className="mt-5 text-2xl font-semibold">No orders yet</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Orders you place from your cart will appear here.</p><Button className="mt-7" asChild><Link to="/products">Browse products</Link></Button></div>
          )
        ) : (
          <div className="space-y-4">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</div>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && !isLoading && !error && <nav className="mt-8 flex items-center justify-between" aria-label="Order history pages"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p><Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></nav>}
    </Container>
  )
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading orders" aria-busy="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="surface-card overflow-hidden">
          <div className="flex justify-between border-b border-border px-6 py-4"><Skeleton className="h-4 w-40" /><Skeleton className="h-6 w-20" /></div>
          <div className="flex items-center gap-4 px-6 py-4"><Skeleton className="size-16" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-10" /></div><Skeleton className="h-4 w-16" /></div>
          <div className="flex justify-end border-t border-border px-6 py-4"><Skeleton className="h-8 w-48" /></div>
        </div>
      ))}
    </div>
  )
}
