import { AlertCircle, ArrowRight, Boxes, HardHat, LayoutGrid, Mail, MessageSquare, PackageCheck, Phone, ScanLine, ShoppingCart, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { getOrders } from "@/api/orders"
import { getMyBookings, getMyConversations } from "@/api/support"
import type { Booking } from "@/api/support"
import { useAuth } from "@/auth/use-auth"
import { useCart } from "@/cart/use-cart"
import { Container } from "@/components/layout/container"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { StatusBadge } from "@/components/admin/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatProductPrice } from "@/lib/format-price"
import { formatOrderDate } from "@/orders/order-format"
import type { Order } from "@/types/order"

/**
 * The customer's web hub. It shows only what the website can actually do:
 * orders, cart, support messages, installation requests, and feedback. Nothing
 * here implies the browser performs scanning, measurement, or 3D work.
 */
export function DashboardPage() {
  useDocumentTitle("Your dashboard | PanelScan")
  const { user } = useAuth()
  const { itemCount } = useCart()
  const [orders, setOrders] = useState<Order[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [conversationCount, setConversationCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Tracked per section: a failed read must never render as "0 orders" or an
  // empty list, which would misreport the customer's own account back to them.
  const [failed, setFailed] = useState({ orders: false, bookings: false, conversations: false })
  const [reloadKey, setReloadKey] = useState(0)

  const isCustomer = user?.role === "CUSTOMER"

  useEffect(() => {
    if (!isCustomer) {
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    Promise.allSettled([getOrders({ limit: 3 }, controller.signal), getMyBookings(controller.signal), getMyConversations(controller.signal)])
      .then(([orderResult, bookingResult, conversationResult]) => {
        if (controller.signal.aborted) return
        if (orderResult.status === "fulfilled") setOrders(orderResult.value.orders)
        if (bookingResult.status === "fulfilled") setBookings(bookingResult.value)
        if (conversationResult.status === "fulfilled") setConversationCount(conversationResult.value.length)
        setFailed({
          orders: orderResult.status === "rejected",
          bookings: bookingResult.status === "rejected",
          conversations: conversationResult.status === "rejected",
        })
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [isCustomer, reloadKey])

  if (!user) return null

  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
  const activeOrders = orders.filter((order) => order.status !== "DELIVERED" && order.status !== "CANCELLED").length
  const openBookings = bookings.filter((booking) => booking.status !== "COMPLETED" && booking.status !== "CANCELLED")

  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-12 sm:py-16">
        <Container>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <Avatar className="size-14"><AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">{initials}</AvatarFallback></Avatar>
              <div>
                <p className="section-eyebrow">Your PanelScan</p>
                <h1 className="type-h2 mt-2">{user.firstName} {user.lastName}</h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild><Link to="/products">Browse panels</Link></Button>
              {isCustomer && <Button variant="outline" asChild><Link to="/orders">Your orders</Link></Button>}
              {isCustomer && <Button variant="outline" asChild><Link to="/projects"><ScanLine data-icon="inline-start" aria-hidden="true" />Project results</Link></Button>}
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-10 sm:py-14">
        {isCustomer ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile icon={PackageCheck} label="Active orders" value={isLoading ? null : String(activeOrders)} failed={failed.orders} to="/orders" linkLabel="Order history" />
              <SummaryTile icon={ShoppingCart} label="Items in cart" value={String(itemCount)} to="/cart" linkLabel="View cart" />
              <SummaryTile icon={HardHat} label="Installation requests" value={isLoading ? null : String(openBookings.length)} failed={failed.bookings} to="/installation" linkLabel="Request installation" />
              <SummaryTile icon={MessageSquare} label="Conversations" value={isLoading ? null : String(conversationCount ?? 0)} failed={failed.conversations} to="/messages" linkLabel="Open messages" />
            </div>

            <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <section aria-labelledby="recent-orders-title">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="recent-orders-title" className="text-xl font-semibold tracking-[-0.025em]">Recent orders</h2>
                  <Button variant="ghost" size="sm" asChild><Link to="/orders">All orders<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button>
                </div>
                {isLoading ? <div className="mt-5 space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div> : failed.orders ? (
                  <div className="mt-5 rounded-lg border border-[color-mix(in_oklch,var(--status-critical),transparent_75%)] bg-[var(--status-critical-surface)] px-6 py-10 text-center">
                    <AlertCircle className="mx-auto size-5 text-[var(--status-critical)]" aria-hidden="true" />
                    <p className="mt-3 font-medium">Your orders could not be loaded</p>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">This is a connection problem, not a change to your orders.</p>
                    <Button variant="outline" className="mt-5" onClick={() => setReloadKey((value) => value + 1)}>Try again</Button>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="mt-5 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
                    <Boxes className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
                    <p className="mt-3 font-medium">No orders yet</p>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">Wall and ceiling panels you order will appear here with their fulfilment and payment status.</p>
                    <Button className="mt-5" asChild><Link to="/products">Browse panels</Link></Button>
                  </div>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {orders.map((order) => (
                      <li key={order.id}>
                        <Link to={`/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 surface-card p-4 transition-colors hover:border-primary/40">
                          <span>
                            <span className="block text-sm font-semibold">{order.orderNumber}</span>
                            <span className="block text-xs text-muted-foreground">{formatOrderDate(order.createdAt)} · {order.items.length} item{order.items.length === 1 ? "" : "s"}</span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="font-semibold tabular-nums">{formatProductPrice(order.totalAmount)}</span>
                            <OrderStatusBadge status={order.status} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <aside className="space-y-5">
                <section className="surface-card p-6" aria-labelledby="projects-title">
                  <div className="flex items-center gap-2"><ScanLine className="size-4 text-primary" aria-hidden="true" /><h2 id="projects-title" className="font-semibold">AR &amp; 3D projects</h2></div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">View measurements, estimates, and compatible previews saved by the PanelScan mobile app. AR measurement remains a mobile feature.</p>
                  <Button variant="outline" size="sm" className="mt-4 w-full" asChild><Link to="/projects">View project results</Link></Button>
                </section>

                <section className="surface-card p-6" aria-labelledby="installation-title">
                  <div className="flex items-center gap-2"><HardHat className="size-4 text-primary" aria-hidden="true" /><h2 id="installation-title" className="font-semibold">Installation</h2></div>
                  {isLoading ? <Skeleton className="mt-4 h-16 w-full" /> : failed.bookings ? (
                    <p className="mt-3 text-sm leading-6 text-[var(--status-critical)]">Your installation requests could not be loaded.</p>
                  ) : openBookings.length === 0 ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">No open installation requests. Ask the team to install panels you have ordered.</p>
                  ) : (
                    <ul className="mt-4 space-y-3 text-sm">
                      {openBookings.slice(0, 3).map((booking) => (
                        <li key={booking.id} className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                          <span>{formatOrderDate(booking.scheduledDate)}</span>
                          <StatusBadge status={booking.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button variant="outline" size="sm" className="mt-4 w-full" asChild><Link to="/installation">Installation requests</Link></Button>
                </section>

                <section className="surface-card p-6" aria-labelledby="support-title">
                  <div className="flex items-center gap-2"><MessageSquare className="size-4 text-primary" aria-hidden="true" /><h2 id="support-title" className="font-semibold">Talk to the team</h2></div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">Questions about panel selection, quantities, or a project? Messages are answered by the Disenyo Interior Solution team.</p>
                  <div className="mt-4 grid gap-2">
                    <Button variant="outline" size="sm" asChild><Link to="/messages">Messages</Link></Button>
                    <Button variant="ghost" size="sm" asChild><Link to="/feedback"><Star data-icon="inline-start" aria-hidden="true" />Leave feedback</Link></Button>
                  </div>
                </section>

                <section className="surface-card p-6" aria-labelledby="account-title">
                  <div className="flex items-center gap-2"><LayoutGrid className="size-4 text-primary" aria-hidden="true" /><h2 id="account-title" className="font-semibold">Account</h2></div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="size-3.5" aria-hidden="true" />Email</dt><dd className="mt-1 break-all">{user.email}</dd></div>
                    {user.phone && <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="size-3.5" aria-hidden="true" />Phone</dt><dd className="mt-1">{user.phone}</dd></div>}
                  </dl>
                </section>
              </aside>
            </div>
          </>
        ) : (
          <section className="surface-card p-8" aria-labelledby="staff-account-title">
            <h2 id="staff-account-title" className="text-xl font-semibold">Staff account</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">This account is a PanelScan staff account. Orders, cart, installation requests, and customer messaging belong to customer accounts — your work lives in PanelScan Admin.</p>
            <Button className="mt-5" asChild><Link to="/admin">Open PanelScan Admin</Link></Button>
          </section>
        )}
      </Container>
    </>
  )
}

function SummaryTile({ icon: Icon, label, value, failed, to, linkLabel }: { icon: typeof Boxes; label: string; value: string | null; failed?: boolean; to: string; linkLabel: string }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><Icon className="size-4 text-primary" aria-hidden="true" /></div>
      {value === null ? <Skeleton className="mt-3 h-8 w-16" /> : failed ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[var(--status-critical)]"><AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />Unavailable</p>
      ) : <p className="type-metric mt-2">{value}</p>}
      <Button variant="ghost" size="sm" className="mt-3 -ml-2.5" asChild><Link to={to}>{linkLabel}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button>
    </div>
  )
}
