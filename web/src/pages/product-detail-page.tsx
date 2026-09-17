import { ArrowLeft, ArrowRight, Box, Hammer, Info, Ruler } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { ApiRequestError } from "@/api/client"
import { getProductById, getProducts } from "@/api/products"
import { Container } from "@/components/layout/container"
import { CatalogError } from "@/components/products/catalog-states"
import { ProductCard } from "@/components/products/product-card"
import { ProductDetailSkeleton } from "@/components/products/product-detail-skeleton"
import { ProductGallery } from "@/components/products/product-gallery"
import { ProductPricingPanel } from "@/components/products/product-pricing-panel"
import { ProductRatings } from "@/components/products/product-ratings"
import { REFERENCE_CATALOGUE_NOTICE, isPvcProduct, panelTypeForProduct, panelTypeLabel } from "@/products/panel-types"
import { StockStatus } from "@/components/products/stock-status"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { Product } from "@/types/product"

export function ProductDetailPage() {
  const { id = "" } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useDocumentTitle(product ? `${product.name} | PanelScan` : "Product details | PanelScan")

  useEffect(() => {
    const controller = new AbortController()

    async function loadProduct() {
      setIsLoading(true)
      setError(false)
      setNotFound(false)

      try {
        const nextProduct = await getProductById(id, controller.signal)
        if (!nextProduct) {
          setNotFound(true)
          setProduct(null)
          return
        }

        setProduct(nextProduct)
        try {
          const related = await getProducts({ categoryId: nextProduct.categoryId, categorySlug: nextProduct.category.slug, sort: "name-asc", limit: 4 }, controller.signal)
          setRelatedProducts(related.products.filter((item) => item.id !== nextProduct.id).slice(0, 3))
        } catch (relatedError) {
          if (relatedError instanceof DOMException && relatedError.name === "AbortError") return
          setRelatedProducts([])
        }
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
        if (caughtError instanceof ApiRequestError && (caughtError.status === 400 || caughtError.status === 404)) setNotFound(true)
        else setError(true)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadProduct()
    return () => controller.abort()
  }, [id, retryKey])


  if (isLoading) return <ProductDetailSkeleton />

  if (notFound) {
    return (
      <Container className="flex min-h-[64vh] items-center py-20">
        <div className="max-w-2xl">
          <p className="section-eyebrow">Product not found</p>
          <h1 className="type-h1 mt-5">This material is not available.</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">It may have been removed, made inactive, or the product address may be incorrect.</p>
          <Button className="mt-8" asChild><Link to="/products"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Return to products</Link></Button>
        </div>
      </Container>
    )
  }

  if (error || !product) {
    return <Container className="py-20"><CatalogError title="This product could not be loaded" onRetry={() => setRetryKey((value) => value + 1)} /></Container>
  }

  // Direct links to products outside the supported lines must never become shoppable pages.
  if (panelTypeForProduct(product) === null) {
    return (
      <Container className="flex min-h-[64vh] items-center py-20">
        <div className="max-w-2xl">
          <p className="section-eyebrow">Outside the current range</p>
          <h1 className="type-h1 mt-5">This product is not part of the PVC range.</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">Disenyo Interior Solution currently supplies PVC wall panels and PVC ceiling panels. <span className="font-medium text-foreground">{product.name}</span> is a reference catalogue item and is not offered for sale.</p>
          <p className="type-caption mt-4">{REFERENCE_CATALOGUE_NOTICE}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild><Link to="/products"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Browse PVC panels</Link></Button>
            <Button variant="outline" asChild><Link to="/products?category=ceiling-panels">Ceiling panels</Link></Button>
          </div>
        </div>
      </Container>
    )
  }

  // Specs relevant to a panel: what it is, how big it is, and how it is sold.
  // Values and units are shown exactly as the catalog stores them.
  const specifications = [
    { label: "Panel type", value: panelTypeLabel(product) },
    { label: "Finish / material", value: product.material },
    { label: "Width", value: product.width ? `${product.width} cm` : null },
    { label: "Length / height", value: product.height ? `${product.height} cm` : null },
    { label: "Thickness", value: product.thickness ? `${product.thickness} cm` : null },
    { label: "Sold per", value: product.unit },
    { label: "SKU", value: product.sku },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))

  return (
    <>
      <Container className="py-8 sm:py-10 lg:py-14">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/products">Products</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="max-w-52 truncate sm:max-w-sm">{product.name}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
          <ProductGallery product={product} />

          <div className="lg:pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{panelTypeLabel(product) ?? product.category.name}</Badge>
              {product.isFeatured && <Badge>Featured</Badge>}
            </div>
            <h1 className="type-h1 mt-5">{product.name}</h1>
            <div className="mt-5"><StockStatus inventory={product.inventory} /></div>
            {product.description && <p className="mt-7 whitespace-pre-line text-base leading-7 text-muted-foreground">{product.description}</p>}

            <Separator className="my-8" />

            <section aria-labelledby="specifications-title">
              <div className="flex items-center gap-2"><Ruler className="size-4 text-primary" aria-hidden="true" /><h2 id="specifications-title" className="type-label">Panel specifications</h2></div>
              <dl className="mt-5 grid grid-cols-2 border-t border-l border-border sm:grid-cols-3">
                {specifications.map((item) => (
                  <div key={item.label} className="border-r border-b border-border bg-card p-4">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="mt-1.5 text-sm font-medium break-words">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Box className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Dimensions are shown exactly as stored in the product catalog. Confirm colour and finish against a physical sample before ordering.</p>
            </section>

            <div className="mt-8"><ProductPricingPanel product={product} returnTo={`/products/${product.id}`} /></div>
            <ProductRatings productId={product.id} detailed />

            <section className="mt-6 rounded-lg border border-border bg-secondary/45 p-5" aria-labelledby="installation-cta-title">
              <div className="flex items-center gap-2"><Hammer className="size-4 text-primary" aria-hidden="true" /><h2 id="installation-cta-title" className="text-sm font-semibold">Need this fitted?</h2></div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Disenyo Interior Solution can install the panels you order. Request installation with your preferred date and address, and the team will confirm the schedule.</p>
              <Button variant="outline" className="mt-4 w-full" asChild><Link to="/installation">Request installation<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button>
            </section>

            {!isPvcProduct(product) && (
              <p className="mt-6 flex items-start gap-2.5 surface-card p-4 text-sm leading-6 text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {REFERENCE_CATALOGUE_NOTICE}
              </p>
            )}
          </div>
        </div>
      </Container>

      {relatedProducts.length > 0 && (
        <section className="border-t border-border bg-secondary/30 py-16 sm:py-20" aria-labelledby="related-products-title">
          <Container>
            <div className="flex items-end justify-between gap-5">
              <div><p className="section-eyebrow">More to consider</p><h2 id="related-products-title" className="type-h2 mt-4">More from {product.category.name}</h2></div>
              <Button variant="outline" className="hidden sm:inline-flex" asChild><Link to={`/products?category=${product.category.slug}`}>View category</Link></Button>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} headingLevel="h3" />)}</div>
          </Container>
        </section>
      )}
    </>
  )
}
