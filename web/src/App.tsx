import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AdminRoute } from "@/admin/admin-route"
import { AuthProvider } from "@/auth/auth-provider"
import { CustomerRoute } from "@/auth/customer-route"
import { ProtectedRoute } from "@/auth/protected-route"
import { CartProvider } from "@/cart/cart-provider"
import { Container } from "@/components/layout/container"
import { SiteLayout } from "@/components/layout/site-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { Toaster } from "@/components/ui/sonner"
import { AboutPage } from "@/pages/about-page"
import { HomePage } from "@/pages/home-page"
import { LoginPage } from "@/pages/login-page"
import { ProductsPage } from "@/pages/products-page"
import { PlaceholderPage } from "@/pages/placeholder-page"
import { RegisterPage } from "@/pages/register-page"

const CartPage = lazy(() => import("@/pages/cart-page").then((module) => ({ default: module.CartPage })))
const ProductDetailPage = lazy(() => import("@/pages/product-detail-page").then((module) => ({ default: module.ProductDetailPage })))
const CheckoutPage = lazy(() => import("@/pages/checkout-page").then((module) => ({ default: module.CheckoutPage })))
const DashboardPage = lazy(() => import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })))
const OrdersPage = lazy(() => import("@/pages/orders-page").then((module) => ({ default: module.OrdersPage })))
const OrderDetailPage = lazy(() => import("@/pages/order-detail-page").then((module) => ({ default: module.OrderDetailPage })))
const MessagesPage = lazy(() => import("@/pages/messages-page").then((module) => ({ default: module.MessagesPage })))
const FeedbackPage = lazy(() => import("@/pages/feedback-page").then((module) => ({ default: module.FeedbackPage })))
const InstallationPage = lazy(() => import("@/pages/installation-page").then((module) => ({ default: module.InstallationPage })))
const PaymentSuccessPage = lazy(() => import("@/pages/payment-success-page").then((module) => ({ default: module.PaymentSuccessPage })))
const PaymentCancelPage = lazy(() => import("@/pages/payment-cancel-page").then((module) => ({ default: module.PaymentCancelPage })))
const CustomerProjectsPage = lazy(() => import("@/pages/customer-projects-page").then((module) => ({ default: module.CustomerProjectsPage })))
const TermsPage = lazy(() => import("@/pages/terms-page").then((module) => ({ default: module.TermsPage })))
const PrivacyPage = lazy(() => import("@/pages/privacy-page").then((module) => ({ default: module.PrivacyPage })))

const AdminLayout = lazy(() => import("@/admin/admin-layout").then((module) => ({ default: module.AdminLayout })))
const AdminDashboardPage = lazy(() => import("@/pages/admin/admin-dashboard-page").then((module) => ({ default: module.AdminDashboardPage })))
const AdminProductsPage = lazy(() => import("@/pages/admin/admin-products-page").then((module) => ({ default: module.AdminProductsPage })))
const AdminProjectsPage = lazy(() => import("@/pages/admin/admin-projects-page").then((module) => ({ default: module.AdminProjectsPage })))
const AdminInventoryPage = lazy(() => import("@/pages/admin/admin-inventory-page").then((module) => ({ default: module.AdminInventoryPage })))
const AdminSalesPage = lazy(() => import("@/pages/admin/admin-sales-page").then((module) => ({ default: module.AdminSalesPage })))
const AdminRequestsPage = lazy(() => import("@/pages/admin/admin-requests-page").then((module) => ({ default: module.AdminRequestsPage })))
const AdminTeamPage = lazy(() => import("@/pages/admin/admin-team-page").then((module) => ({ default: module.AdminTeamPage })))
const AdminInstallersPage = lazy(() => import("@/pages/admin/admin-installers-page").then((module) => ({ default: module.AdminInstallersPage })))
const AdminFeedbackPage = lazy(() => import("@/pages/admin/admin-feedback-page").then((module) => ({ default: module.AdminFeedbackPage })))
const AdminChatPage = lazy(() => import("@/pages/admin/admin-chat-page").then((module) => ({ default: module.AdminChatPage })))

function RoutePageFallback() {
  return <Container className="py-14" aria-label="Loading page" aria-busy="true"><Skeleton className="h-10 w-52" /><div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div></Container>
}

function AdminPageFallback() {
  return <div className="admin-surface min-h-screen p-8" aria-label="Loading admin" aria-busy="true"><Skeleton className="h-8 w-52" /><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div><Skeleton className="mt-6 h-72 w-full" /></div>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route element={<AdminRoute />}>
              <Route path="admin" element={<Suspense fallback={<AdminPageFallback />}><AdminLayout /></Suspense>}>
                <Route index element={<Suspense fallback={<AdminPageFallback />}><AdminDashboardPage /></Suspense>} />
                <Route path="products" element={<Suspense fallback={<AdminPageFallback />}><AdminProductsPage /></Suspense>} />
                <Route path="projects" element={<Suspense fallback={<AdminPageFallback />}><AdminProjectsPage /></Suspense>} />
                <Route path="inventory" element={<Suspense fallback={<AdminPageFallback />}><AdminInventoryPage /></Suspense>} />
                <Route path="sales" element={<Suspense fallback={<AdminPageFallback />}><AdminSalesPage /></Suspense>} />
                <Route path="installers" element={<Suspense fallback={<AdminPageFallback />}><AdminInstallersPage /></Suspense>} />
                <Route path="chat" element={<Suspense fallback={<AdminPageFallback />}><AdminChatPage /></Suspense>} />
                <Route path="feedback" element={<Suspense fallback={<AdminPageFallback />}><AdminFeedbackPage /></Suspense>} />
                <Route path="requests" element={<Suspense fallback={<AdminPageFallback />}><AdminRequestsPage /></Suspense>} />
                <Route path="team" element={<Suspense fallback={<AdminPageFallback />}><AdminTeamPage /></Suspense>} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Route>

            <Route element={<SiteLayout />}>
              <Route index element={<HomePage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/:id" element={<Suspense fallback={<RoutePageFallback />}><ProductDetailPage /></Suspense>} />
              {/* Preserve retired route compatibility without adding browser-based AR or 3D. */}
              <Route path="designer" element={<Navigate to="/products" replace />} />
              <Route path="visualizer" element={<Navigate to="/products" replace />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="terms" element={<Suspense fallback={<RoutePageFallback />}><TermsPage /></Suspense>} />
              <Route path="privacy" element={<Suspense fallback={<RoutePageFallback />}><PrivacyPage /></Suspense>} />
              <Route element={<ProtectedRoute />}>
                <Route path="dashboard" element={<Suspense fallback={<RoutePageFallback />}><DashboardPage /></Suspense>} />
                <Route path="account" element={<Navigate to="/dashboard" replace />} />
              </Route>

              <Route element={<CustomerRoute />}>
                <Route path="cart" element={<Suspense fallback={<RoutePageFallback />}><CartPage /></Suspense>} />
                <Route path="checkout" element={<Suspense fallback={<RoutePageFallback />}><CheckoutPage /></Suspense>} />
                <Route path="orders" element={<Suspense fallback={<RoutePageFallback />}><OrdersPage /></Suspense>} />
                <Route path="orders/:id" element={<Suspense fallback={<RoutePageFallback />}><OrderDetailPage /></Suspense>} />
                <Route path="messages" element={<Suspense fallback={<RoutePageFallback />}><MessagesPage /></Suspense>} />
                <Route path="feedback" element={<Suspense fallback={<RoutePageFallback />}><FeedbackPage /></Suspense>} />
                <Route path="installation" element={<Suspense fallback={<RoutePageFallback />}><InstallationPage /></Suspense>} />
                <Route path="projects" element={<Suspense fallback={<RoutePageFallback />}><CustomerProjectsPage /></Suspense>} />
                {/* PayMongo return routes. These match the backend's PAYMENT_SUCCESS_URL / PAYMENT_CANCEL_URL paths and stay behind the customer guard: an unauthenticated return is sent to login and back here, never shown payment data. */}
                <Route path="payment/success" element={<Suspense fallback={<RoutePageFallback />}><PaymentSuccessPage /></Suspense>} />
                <Route path="payment/cancel" element={<Suspense fallback={<RoutePageFallback />}><PaymentCancelPage /></Suspense>} />
              </Route>
              <Route path="*" element={<PlaceholderPage eyebrow="404" title="This page could not be found." description="The address may have changed, or this part of PanelScan may not be available yet." notFound />} />
            </Route>
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
