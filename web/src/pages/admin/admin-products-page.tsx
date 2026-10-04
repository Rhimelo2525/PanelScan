import { Eye, ImagePlus, Package, PackageSearch, Pencil, Plus, Trash2, Upload, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { formatDate } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { createProduct, deleteProduct, updateProduct, uploadProductImage } from "@/api/admin"
import { getCategories } from "@/api/categories"
import { getProducts } from "@/api/products"
import { useAuth } from "@/auth/use-auth"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import type { Column } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/products/product-image"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { dimensionError, dimensionInputRejection, formatDimensions } from "@/lib/dimensions"
import type { DimensionField } from "@/lib/dimensions"
import { formatProductPrice } from "@/lib/format-price"
import { useConfirm } from "@/components/confirm/use-confirm"
import { getStockStatus, STOCK_STATUS_LABELS, STOCK_STATUS_OPTIONS } from "@/lib/stock-status"
import type { StockStatus } from "@/lib/stock-status"
import type { Category } from "@/types/category"
import type { Product } from "@/types/product"

/** Same shared rule the customer pages and the Inventory page use. */
function StockBadge({ product }: { product: Product }) {
  const status = getStockStatus(product.inventory)
  return <StatusBadge status={status} label={STOCK_STATUS_LABELS[status]} />
}

export function AdminProductsPage() {
  useDocumentTitle("Products | PanelScan Admin")
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  // Operational changes are MODERATOR-only (creates change requests). OWNER views, reviews, and approves.
  const canManageProducts = isModerator

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [stockFilter, setStockFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const [categories, setCategories] = useState<Category[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)

  // Fetch live products with authentication so prices are populated
  const productResource = useAdminResource(async (signal) => {
    const data = await getProducts({ limit: 100 }, signal)
    return data.products
  }, [], { pollIntervalMs: 30_000 })

  useEffect(() => {
    getCategories()
      .then((cats) => {
        // Keep ONLY Ceiling Panels and Wall Panels (removes Cladding, Flooring, Partition)
        const inScope = cats.filter((c) => c.slug === "wall-panels" || c.slug === "ceiling-panels")
        setCategories(inScope)
      })
      .catch(() => { })
  }, [])

  const products = useMemo(() => productResource.data ?? [], [productResource.data])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesSearch =
        term === "" ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        (product.description?.toLowerCase().includes(term) ?? false)

      const matchesCategory = categoryFilter === "" || product.categoryId === categoryFilter
      const matchesStock = stockFilter === "" || getStockStatus(product.inventory) === stockFilter
      const matchesStatus =
        statusFilter === "" || (statusFilter === "ACTIVE" ? product.isActive : !product.isActive)

      return matchesSearch && matchesCategory && matchesStock && matchesStatus
    })
  }, [products, search, categoryFilter, stockFilter, statusFilter])

  // Summary metrics
  const totalCount = products.length
  const countWithStatus = (status: StockStatus) => products.filter((p) => getStockStatus(p.inventory) === status).length
  const inStockCount = countWithStatus("IN_STOCK")
  const lowStockCount = countWithStatus("LOW_STOCK")
  const criticalCount = countWithStatus("CRITICAL")
  const outOfStockCount = countWithStatus("OUT_OF_STOCK")

  const columns: Column<Product>[] = [
    {
      key: "product",
      header: "Product",
      primary: true,
      cell: (product) => (
        <div className="flex min-w-0 items-center gap-3">
          <ProductImage
            image={product.images[0]}
            productName={product.name}
            categorySlug={product.category?.slug ?? "wall-panels"}
            className="size-12 shrink-0 rounded-md"
          />
          <div className="min-w-0">
            <p className="font-medium break-words [overflow-wrap:anywhere]">{product.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{product.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (product) => <span className="text-muted-foreground">{product.category?.name ?? "—"}</span>,
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      cell: (product) => <span className="font-medium">{formatProductPrice(product.price)}</span>,
    },
    {
      key: "stock",
      header: "Stock",
      numeric: true,
      cell: (product) => (
        <span className="font-medium tabular-nums">{product.inventory?.quantity ?? 0}</span>
      ),
    },
    {
      key: "added",
      header: "Added",
      secondary: true,
      cell: (product) => (
        <span className="text-muted-foreground">{formatDate(product.createdAt)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (product) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={product.isActive ? "ACTIVE" : "DRAFT"} />
          <StockBadge product={product} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Add and maintain products that flow into the shared customer storefront."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/products">
                <Eye className="size-4" data-icon="inline-start" aria-hidden="true" />
                View storefront
              </Link>
            </Button>
            {canManageProducts && (
              <Button onClick={() => setShowAddProduct(true)}>
                <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
                Add product
              </Button>
            )}
          </div>
        }
      />

      {productResource.error ? (
        <ErrorState message={productResource.error} onRetry={productResource.reload} />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Products summary">
            <MetricCard
              label="Total catalogue"
              value={String(totalCount)}
              isLoading={productResource.isLoading}
              icon={Package}
            />
            <MetricCard
              label="In Stock"
              value={String(inStockCount)}
              isLoading={productResource.isLoading}
            />
            <MetricCard
              label="Low Stock"
              value={String(lowStockCount)}
              hint={`Critical: ${criticalCount} (at or below half the reorder level)`}
              isLoading={productResource.isLoading}
            />
            <MetricCard
              label="Out of Stock"
              value={String(outOfStockCount)}
              hint="Requires immediate replenishment"
              isLoading={productResource.isLoading}
            />
          </section>

          <FilterBar
            searchValue={search}
            searchPlaceholder="Search product name or product code…"
            onSearchChange={setSearch}
            hasActiveFilters={Boolean(search || categoryFilter || stockFilter || statusFilter)}
            onClear={() => {
              setSearch("")
              setCategoryFilter("")
              setStockFilter("")
              setStatusFilter("")
            }}
          >
            <FilterSelect
              label="Category"
              value={categoryFilter}
              allLabel="All categories"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCategoryFilter}
            />
            <FilterSelect
              label="Stock status"
              value={stockFilter}
              allLabel="All stock levels"
              options={STOCK_STATUS_OPTIONS}
              onChange={setStockFilter}
            />
            <FilterSelect
              label="Listing status"
              value={statusFilter}
              allLabel="All listing states"
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "DRAFT", label: "Draft" },
              ]}
              onChange={setStatusFilter}
            />
          </FilterBar>

          <div className="motion-swap">
            <DataTable
              caption="Products catalogue"
              isLoading={productResource.isLoading}
              rows={filtered}
              getRowId={(p) => p.id}
              empty={
                <EmptyState
                  icon={PackageSearch}
                  title={products.length === 0 ? "No products yet" : "No products found"}
                  description={
                    products.length === 0
                      ? "Add your first product to start building the PanelScan catalog."
                      : "No catalogue products match the active search and filter criteria."
                  }
                  action={
                    products.length === 0 && canManageProducts ? (
                      <Button onClick={() => setShowAddProduct(true)}>
                        <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
                        Add Product
                      </Button>
                    ) : undefined
                  }
                />
              }
              columns={columns}
              rowAction={(product) => (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedProduct(product)}
                    aria-label={`View ${product.name}`}
                  >
                    <Eye className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                    View
                  </Button>
                  {canManageProducts && (
                    <Button
                      size="sm"
                      onClick={() => setEditingProduct(product)}
                      aria-label={`Edit ${product.name}`}
                    >
                      <Pencil className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                      Edit
                    </Button>
                  )}
                </div>
              )}
            />
          </div>
        </>
      )}

      {/* View Product Details Sheet */}
      <ProductDetailsSheet
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      {/* Edit Product Sheet (OWNER + MODERATOR) */}
      {canManageProducts && editingProduct && (
        <EditProductSheet
          product={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(null)}
          onSuccess={() => {
            setEditingProduct(null)
            productResource.reload()
          }}
        />
      )}

      {/* Add Product Sheet (OWNER + MODERATOR) */}
      {canManageProducts && (
        <AddProductSheet
          open={showAddProduct}
          categories={categories}
          onClose={() => setShowAddProduct(false)}
          onSuccess={() => {
            setShowAddProduct(false)
            productResource.reload()
          }}
        />
      )}
    </div>
  )
}

function ProductDetailsSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  if (!product) return null

  return (
    <Sheet open={Boolean(product)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:max-w-lg!">
        <SheetHeader className="pr-12">
          <SheetTitle>Product details</SheetTitle>
          <SheetDescription>{product.sku} · Specification & Stock</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          <ProductImage
            image={product.images[0]}
            productName={product.name}
            categorySlug={product.category?.slug ?? "wall-panels"}
            className="aspect-[4/3] w-full rounded-lg"
          />

          <div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={product.isActive ? "ACTIVE" : "DRAFT"} />
              <StockBadge product={product} />
            </div>
            <h2 className="mt-4 text-xl font-semibold">{product.name}</h2>
            {product.description && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description}</p>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
            <Detail label="Category" value={product.category?.name ?? "—"} />
            <Detail label="Price" value={formatProductPrice(product.price)} />
            <Detail label="Product Code" value={product.sku} />
            <Detail label="Finish / material" value={product.material ?? "—"} />
            <Detail
              label="Dimensions"
              value={
formatDimensions(product.width, product.height, product.thickness) ?? "—"
              }
            />
            <Detail label="Stock on hand" value={String(product.inventory?.quantity ?? 0)} />
            <Detail label="Reserved quantity" value={String(product.inventory?.reservedQty ?? 0)} />
            <Detail label="Reorder threshold" value={String(product.inventory?.reorderLevel ?? 0)} />
            <Detail label="Date added" value={formatDate(product.createdAt)} wide />
          </dl>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EditProductSheet({
  product,
  categories,
  onClose,
  onSuccess,
}: {
  product: Product
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(product.name)
  const [categoryId, setCategoryId] = useState(product.categoryId)
  const [sku, setSku] = useState(product.sku)
  const [price, setPrice] = useState(product.price ?? "")
  const [material, setMaterial] = useState(product.material ?? "")
  const [width, setWidth] = useState(product.width ?? "")
  const [height, setHeight] = useState(product.height ?? "")
  const [thickness, setThickness] = useState(product.thickness ?? "")
  const [isActive, setIsActive] = useState(product.isActive)
  const [description, setDescription] = useState(product.description ?? "")

  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const [imageUrl, setImageUrl] = useState<string | null>(product.images[0]?.url ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleDelete() {
    setIsDeleting(true)
    setError(null)
    try {
      await deleteProduct(product.id)
      if (isModerator) {
        toast.success("Removal request submitted for owner approval", {
          description: `Request to remove "${product.name}" has been sent for owner review.`,
        })
      } else {
        toast.success("Product removed successfully", {
          description: `"${product.name}" has been removed from the catalogue.`,
        })
      }
      setShowDeleteDialog(false)
      onSuccess()
    } catch (err) {
      setError(getAdminErrorMessage(err))
      setShowDeleteDialog(false)
    } finally {
      setIsDeleting(false)
    }
  }

  function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPG, PNG, WebP).")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image file size must be less than 5 MB.")
      return
    }
    setError(null)
    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !categoryId || !sku.trim() || !price) {
      setError("Please fill in all required fields (Name, Category, Product Code, Price).")
      return
    }

    const numPrice = Number(price)
    if (Number.isNaN(numPrice) || numPrice <= 0) {
      setError("Price must be a positive number in Philippine Peso.")
      return
    }
    if (!PRICE_PATTERN.test(price.trim())) {
      setError(PRICE_MESSAGE)
      return
    }

    const dimensionProblem = dimensionError("width", width) ?? dimensionError("height", height) ?? dimensionError("thickness", thickness)
    if (dimensionProblem) {
      setError(dimensionProblem)
      return
    }

    if (!(await confirm({
      title: `Save changes to ${product.name}?`,
      description: `The product listing will be updated for customers.${isModerator ? " It is sent to the owner for approval first." : ""}`,
      details: [{ label: "Name", value: name.trim() }, { label: "Price", value: `₱${numPrice.toFixed(2)}` }, { label: "Listing", value: isActive ? "Active" : "Hidden" }],
      confirmLabel: "Save Changes",
    }))) return

    setIsSaving(true)
    setError(null)

    try {
      let finalImageUrl = imageUrl
      if (imageFile) {
        const uploadRes = await uploadProductImage(imageFile)
        finalImageUrl = uploadRes.url
      }

      const payload = {
        name: name.trim(),
        categoryId,
        sku: sku.trim(),
        price: numPrice,
        material: material.trim() || undefined,
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        thickness: thickness ? Number(thickness) : undefined,
        isActive,
        description: description.trim() || undefined,
        images: finalImageUrl
          ? [{ url: finalImageUrl, altText: name.trim(), isPrimary: true, sortOrder: 0 }]
          : undefined,
      }

      await updateProduct(product.id, payload)
      if (isModerator) {
        toast.success("Change request submitted for owner approval", {
          description: `Request to update "${name}" has been sent for owner review.`,
        })
      } else {
        toast.success("Product updated successfully", {
          description: `${name} has been updated in the catalogue.`,
        })
      }
      onSuccess()
    } catch (err) {
      setError(getAdminErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:max-w-2xl!">
        <SheetHeader className="pr-12">
          <SheetTitle>Edit product</SheetTitle>
          <SheetDescription>Update product details and specifications.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-6">
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Product Image */}
          <div>
            <Label>Product image</Label>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/30">
                {imageUrl ? (
                  <img src={imageUrl} alt="Product preview" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImagePlus className="size-6" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="sr-only"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                  {imageUrl ? "Replace image" : "Upload image"}
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 5 MB</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-name">Product name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="edit-category">Category *</Label>
              <select
                id="edit-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                {!categories.some((c) => c.id === categoryId) && product.category && (
                  <option value={product.category.id} disabled>
                    {product.category.name} (Archived)
                  </option>
                )}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="edit-sku">Product Code *</Label>
              <Input
                id="edit-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="edit-price">Price (₱ PHP) *</Label>
              <PriceInput id="edit-price" value={price} onChange={setPrice} />
            </div>

            <div>
              <Label htmlFor="edit-material">Material / Finish</Label>
              <Input
                id="edit-material"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. Oak Veneer, PVC"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="edit-status">Listing status</Label>
              <select
                id="edit-status"
                value={isActive ? "ACTIVE" : "DRAFT"}
                onChange={(e) => setIsActive(e.target.value === "ACTIVE")}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <option value="ACTIVE">Active (Storefront Visible)</option>
                <option value="DRAFT">Draft (Hidden)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <DimensionInput id="edit-width" field="width" label="Width" value={width} onChange={setWidth} />
            <DimensionInput id="edit-height" field="height" label="Height" value={height} onChange={setHeight} />
            <DimensionInput id="edit-thickness" field="thickness" label="Thickness" value={thickness} onChange={setThickness} />
          </div>

          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1.5"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isSaving || isDeleting}
            >
              <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden="true" />
              Remove Product
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isDeleting}>
                {isSaving ? "Saving changes…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Product?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove &ldquo;{product.name}&rdquo;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={(e) => {
                  e.preventDefault()
                  void handleDelete()
                }}
              >
                {isDeleting ? "Removing…" : "Remove Product"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}

function AddProductSheet({
  open,
  categories,
  onClose,
  onSuccess,
}: {
  open: boolean
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [sku, setSku] = useState("")
  const [price, setPrice] = useState("")
  const [material, setMaterial] = useState("")
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")
  const [thickness, setThickness] = useState("")
  const [description, setDescription] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id)
    }
  }, [open, categories, categoryId])

  function resetForm() {
    setName("")
    setSku("")
    setPrice("")
    setMaterial("")
    setWidth("")
    setHeight("")
    setThickness("")
    setDescription("")
    setImageFile(null)
    setImagePreview(null)
    setError(null)
  }

  function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPG, PNG, WebP).")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image file size must be less than 5 MB.")
      return
    }
    setError(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !categoryId || !sku.trim() || !price) {
      setError("Please fill in all required fields (Name, Category, Product Code, Price).")
      return
    }

    const numPrice = Number(price)
    if (Number.isNaN(numPrice) || numPrice <= 0) {
      setError("Price must be a positive number in Philippine Peso.")
      return
    }
    if (!PRICE_PATTERN.test(price.trim())) {
      setError(PRICE_MESSAGE)
      return
    }

    const dimensionProblem = dimensionError("width", width) ?? dimensionError("height", height) ?? dimensionError("thickness", thickness)
    if (dimensionProblem) {
      setError(dimensionProblem)
      return
    }

    if (!(await confirm({
      title: `Add ${name.trim()} to the catalogue?`,
      description: `A new product will be created.${isModerator ? " It is sent to the owner for approval first." : ""}`,
      details: [{ label: "Product Code", value: sku.trim() }, { label: "Price", value: `₱${numPrice.toFixed(2)}` }],
      confirmLabel: "Add Product",
    }))) return

    setIsSaving(true)
    setError(null)

    try {
      let uploadedImageUrl: string | undefined
      if (imageFile) {
        const uploadRes = await uploadProductImage(imageFile)
        uploadedImageUrl = uploadRes.url
      }

      await createProduct({
        name: name.trim(),
        categoryId,
        sku: sku.trim(),
        price: numPrice,
        material: material.trim() || undefined,
        unit: "panel",
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        thickness: thickness ? Number(thickness) : undefined,
        description: description.trim() || undefined,
        images: uploadedImageUrl
          ? [{ url: uploadedImageUrl, altText: name.trim(), isPrimary: true, sortOrder: 0 }]
          : undefined,
      })

      if (isModerator) {
        toast.success("Change request submitted for owner approval", {
          description: `Request to add "${name}" has been sent for owner review.`,
        })
      } else {
        toast.success("Product created successfully", {
          description: `${name} has been added to the catalogue.`,
        })
      }
      resetForm()
      onSuccess()
    } catch (err) {
      setError(getAdminErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent className="admin-surface w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:max-w-2xl!">
        <SheetHeader className="pr-12">
          <SheetTitle>Add product</SheetTitle>
          <SheetDescription>
            Create a new wall or ceiling panel listing with initial inventory tracking.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-6">
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Image upload */}
          <div>
            <Label>Product image</Label>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/30">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImagePlus className="size-6" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="sr-only"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                  {imagePreview ? "Change image" : "Upload image"}
                </Button>
                {imagePreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImageFile(null)
                      setImagePreview(null)
                    }}
                  >
                    <X className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                    Remove
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 5 MB</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-name">Product name *</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Oak Veneer Wall Panel"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="add-category">Category *</Label>
              <select
                id="add-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="add-sku">Product Code *</Label>
              <Input
                id="add-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. WP-OAK-003"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="add-price">Price (₱ PHP) *</Label>
              <PriceInput id="add-price" value={price} onChange={setPrice} placeholder="1850.00" />
            </div>

            <div>
              <Label htmlFor="add-material">Material / Finish</Label>
              <Input
                id="add-material"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. Natural Oak, PVC"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <DimensionInput id="add-width" field="width" label="Width" value={width} onChange={setWidth} placeholder="60" />
            <DimensionInput id="add-height" field="height" label="Height" value={height} onChange={setHeight} placeholder="240" />
            <DimensionInput id="add-thickness" field="thickness" label="Thickness" value={thickness} onChange={setThickness} placeholder="1.2" />
          </div>

          <div>
            <Label htmlFor="add-description">Description</Label>
            <Textarea
              id="add-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the architectural panel..."
              rows={3}
              maxLength={2000}
              className="mt-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Adding product…" : "Add Product"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// Up to 5 digits of whole pesos and 2 centavo digits (at most 99,999.99).
// Must match the API's price rule in product validation, which enforces it.
const PRICE_MESSAGE = "Price can have at most 5 digits (up to ₱99,999.99), with no more than 2 decimal places."
// A trailing "." left while typing ("1850.") is still 1850.
const PRICE_PATTERN = /^[0-9]{1,5}([.][0-9]{0,2})?$/

function priceInputRejection(value: string): string | null {
  if (!/^[0-9]*[.]?[0-9]*$/.test(value)) return "Price accepts numbers only."
  const [pesos, centavos = ""] = value.split(".")
  if ((pesos ?? "").length > 5 || centavos.length > 2) return PRICE_MESSAGE
  return null
}

/**
 * Price field limited to 5 digits of pesos and 2 of centavos. A keystroke or
 * paste that would break that is refused whole (the field keeps its value)
 * and the reason is shown under it.
 */
function PriceInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [notice, setNotice] = useState<string | null>(null)
  const noticeId = `${id}-notice`

  return (
    <>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const next = e.target.value.trim()
          const rejection = priceInputRejection(next)
          setNotice(rejection)
          if (!rejection) onChange(next)
        }}
        onBlur={() => setNotice(null)}
        placeholder={placeholder}
        required
        aria-invalid={Boolean(notice)}
        aria-describedby={notice ? noticeId : undefined}
        className="mt-1.5"
      />
      {notice && <p id={noticeId} className="mt-1 text-xs text-destructive">{notice}</p>}
    </>
  )
}

/**
 * Dimension field that only takes digits and one decimal point, up to the
 * field's digit limit. A keystroke or paste that would break that is refused
 * whole (the field keeps its value) and the reason is shown under it.
 */
function DimensionInput({ id, field, label, value, onChange, placeholder }: { id: string; field: DimensionField; label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [notice, setNotice] = useState<string | null>(null)
  const noticeId = `${id}-notice`

  return (
    <div>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const next = e.target.value.trim()
          const rejection = dimensionInputRejection(field, next)
          setNotice(rejection)
          if (!rejection) onChange(next)
        }}
        onBlur={() => setNotice(null)}
        placeholder={placeholder}
        aria-invalid={Boolean(notice)}
        aria-describedby={notice ? noticeId : undefined}
        className="mt-1"
      />
      {notice && <p id={noticeId} className="mt-1 text-xs text-destructive">{notice}</p>}
    </div>
  )
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`bg-card p-4 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )
}
