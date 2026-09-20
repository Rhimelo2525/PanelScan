import { Info, Search, SlidersHorizontal, X } from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useSearchParams } from "react-router-dom"

import { getCategories } from "@/api/categories"
import { getProducts } from "@/api/products"
import { Container } from "@/components/layout/container"
import { CatalogError, EmptyCatalog, ProductGridSkeleton } from "@/components/products/catalog-states"
import { ProductCard } from "@/components/products/product-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { cn } from "@/lib/utils"
import { PANEL_TYPES, REFERENCE_CATALOGUE_NOTICE, inScopeCategories, inScopeProducts, isPvcProduct } from "@/products/panel-types"
import type { Category } from "@/types/category"
import type { PaginatedProducts, ProductSort } from "@/types/product"

const validSorts: ProductSort[] = ["newest", "name-asc", "name-desc"]

function getSort(value: string | null): ProductSort {
  return validSorts.includes(value as ProductSort) ? value as ProductSort : "newest"
}

export function ProductsPage() {
  useDocumentTitle("PVC Wall & Ceiling Panels | PanelScan")

  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get("search")?.trim() ?? ""
  const categorySlug = searchParams.get("category") ?? ""
  const sort = getSort(searchParams.get("sort"))
  const [searchDraft, setSearchDraft] = useState(search)
  const [categories, setCategories] = useState<Category[]>([])
  const [result, setResult] = useState<PaginatedProducts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => setSearchDraft(search), [search])

  useEffect(() => {
    const controller = new AbortController()

    async function loadCatalog() {
      setIsLoading(true)
      setError(false)

      try {
        let panelCategories: Category[]
        let nextResult: PaginatedProducts

        if (!categorySlug) {
          const [rawCategories, productsResult] = await Promise.all([
            getCategories(controller.signal),
            getProducts({ search: search || undefined, sort, limit: 100 }, controller.signal),
          ])
          if (controller.signal.aborted) return
          panelCategories = inScopeCategories(rawCategories)
          nextResult = productsResult
        } else {
          panelCategories = inScopeCategories(await getCategories(controller.signal))
          if (controller.signal.aborted) return

          const selectedCategory = panelCategories.find((category) => category.slug === categorySlug)
          nextResult = !selectedCategory
            ? { products: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } }
            : await getProducts({ search: search || undefined, categoryId: selectedCategory.id, categorySlug, sort, limit: 100 }, controller.signal)
        }

        if (controller.signal.aborted) return

        const panelProducts = inScopeProducts(nextResult.products)
        setCategories(panelCategories)
        setResult({ ...nextResult, products: panelProducts, pagination: { ...nextResult.pagination, total: panelProducts.length } })
      } catch (caughtError) {
        if (controller.signal.aborted) return
        setError(true)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadCatalog()
    return () => controller.abort()
  }, [categorySlug, retryKey, search, sort])


  function updateParam(key: "search" | "category" | "sort", value: string) {
    const nextParams = new URLSearchParams(searchParams)
    if (value && !(key === "sort" && value === "newest")) nextParams.set(key, value)
    else nextParams.delete(key)
    setSearchParams(nextParams)
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateParam("search", searchDraft.trim())
  }

  function resetFilters() {
    setSearchDraft("")
    setSearchParams(new URLSearchParams())
  }

  const hasFilters = Boolean(search || categorySlug)

  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-14 sm:py-18 lg:py-20">
        <Container>
          <p className="section-eyebrow">PVC panels</p>
          <h1 className="type-h1 mt-5">Wall and ceiling panels</h1>
          <p className="type-lead mt-5 max-w-2xl">Explore PVC wall and ceiling panel solutions for interior finishing projects. Sizes and availability come straight from current stock.</p>
        </Container>
      </section>

      <section className="py-10 sm:py-12 lg:py-16" aria-labelledby="catalog-results-heading">
        <Container>
          <form onSubmit={submitSearch} className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_auto_auto]" role="search">
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className="h-11 bg-card pr-28 pl-10" placeholder="Search by name, finish, or SKU" />
              <Button type="submit" size="sm" className="absolute top-2 right-2">Search</Button>
            </label>

            <div className="sm:hidden">
              <label className="sr-only" htmlFor="mobile-category-filter">Filter by category</label>
              <Select value={categorySlug || "all"} onValueChange={(value) => updateParam("category", value === "all" ? "" : value)}>
                <SelectTrigger id="mobile-category-filter" className="h-11 w-full bg-card"><SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" /><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All panels</SelectItem>
                  {categories.map((category) => <SelectItem key={category.id} value={category.slug}>{PANEL_TYPES.find((definition) => definition.slug === category.slug)?.label ?? category.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="sr-only" htmlFor="catalog-sort">Sort products</label>
              <Select value={sort} onValueChange={(value) => updateParam("sort", value)}>
                <SelectTrigger id="catalog-sort" className="h-11 w-full bg-card lg:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="name-asc">Name A–Z</SelectItem>
                  <SelectItem value="name-desc">Name Z–A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </form>

          <div className="mt-8 hidden flex-wrap gap-2 sm:flex" aria-label="Product categories">
            <button type="button" onClick={() => updateParam("category", "")} aria-pressed={!categorySlug} className={cn("rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-(--motion-fast) ease-(--ease-standard) focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]", !categorySlug ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40")}>All panels</button>
            {categories.map((category) => {
              const panel = PANEL_TYPES.find((definition) => definition.slug === category.slug)
              return (
                <button key={category.id} type="button" onClick={() => updateParam("category", category.slug)} aria-pressed={categorySlug === category.slug} className={cn("rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-(--motion-fast) ease-(--ease-standard) focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]", categorySlug === category.slug ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40")}>{panel?.label ?? category.name}</button>
              )
            })}
          </div>

          <div className="mt-9 flex min-h-6 items-center justify-between gap-4 border-t border-border pt-6">
            <p id="catalog-results-heading" className="text-sm font-medium" aria-live="polite">{isLoading ? "Loading panels…" : error ? "Catalog unavailable" : `${result?.pagination.total ?? 0} ${result?.pagination.total === 1 ? "panel" : "panels"}`}</p>
            {hasFilters && <Button variant="ghost" size="sm" onClick={resetFilters}><X data-icon="inline-start" aria-hidden="true" />Clear filters</Button>}
          </div>

          {!isLoading && !error && (result?.products ?? []).some((product) => !isPvcProduct(product)) && (
            <p className="mt-6 flex items-start gap-2.5 surface-card p-4 text-sm leading-6 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Some records below are reference catalogue items whose material is not PVC. {REFERENCE_CATALOGUE_NOTICE.split(". ")[1]} They are marked on each card and will be replaced when Disenyo Interior Solution supplies the approved PVC catalogue.
            </p>
          )}

          <div key={`${categorySlug}|${search}|${sort}`} className="motion-swap mt-7">
            {isLoading && <ProductGridSkeleton />}
            {!isLoading && error && <CatalogError onRetry={() => setRetryKey((value) => value + 1)} />}
            {!isLoading && !error && result?.products.length === 0 && <EmptyCatalog filtered={hasFilters} onReset={resetFilters} />}
            {!isLoading && !error && result && result.products.length > 0 && (
              <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {result.products.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
            )}
          </div>
        </Container>
      </section>
    </>
  )
}
