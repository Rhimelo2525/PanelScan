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
import { formatProductPrice } from "@/lib/format-price"
import type { Category } from "@/types/category"
import type { Product } from "@/types/product"

function stockStatus(product: Product): "HEALTHY" | "LOW_STOCK" | "OUT_OF_STOCK" {
  const available = Math.max(0, (product.inventory?.quantity ?? 0) - (product.inventory?.reservedQty ?? 0))
  if (available === 0) return "OUT_OF_STOCK"
  if (available <= (product.inventory?.reorderLevel ?? 0)) return "LOW_STOCK"
  return "HEALTHY"
}

export function AdminProductsPage() {
  useDocumentTitle("Products | PanelScan Admin")
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const isOwner = user?.role === "OWNER"
  // Both roles can manage products: MODERATOR writes go through the owner
  // approval workflow (see EditProductSheet/AddProductSheet), OWNER writes
  // apply directly - the backend (product.controller.ts) already supports
  // both, this just makes sure the OWNER sees the same management controls.
  const canManageProducts = isModerator || isOwner

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
  }, [])

  useEffect(() => {
    getCategories()
      .then((cats) => {
        // Keep ONLY Ceiling Panels and Wall Panels (removes Cladding, Flooring, Partition)
        const inScope = cats.filter((c) => c.slug === "wall-panels" || c.slug === "ceiling-panels")
        setCategories(inScope)
      })
      .catch(() => { })
  }, [])

  const products = productResource.data ?? []

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesSearch =
        term === "" ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        (product.description?.toLowerCase().includes(term) ?? false)

      const matchesCategory = categoryFilter === "" || product.categoryId === categoryFilter
      const matchesStock = stockFilter === "" || stockStatus(product) === stockFilter
      const matchesStatus =
        statusFilter === "" || (statusFilter === "ACTIVE" ? product.isActive : !product.isActive)

      return matchesSearch && matchesCategory && matchesStock && matchesStatus
    })
  }, [products, search, categoryFilter, stockFilter, statusFilter])

  // Summary metrics
  const totalCount = products.length
  const healthyCount = products.filter((p) => stockStatus(p) === "HEALTHY").length
  const lowStockCount = products.filter((p) => stockStatus(p) === "LOW_STOCK").length
  const outOfStockCount = products.filter((p) => stockStatus(p) === "OUT_OF_STOCK").length

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
          <StatusBadge status={stockStatus(product)} />
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
              label="Healthy stock"
              value={String(healthyCount)}
              isLoading={productResource.isLoading}
            />
            <MetricCard
              label="Low stock"
              value={String(lowStockCount)}
              hint="At or below reorder level"
              isLoading={productResource.isLoading}
            />
            <MetricCard
              label="Out of stock"
              value={String(outOfStockCount)}
              hint="Requires immediate replenishment"
              isLoading={productResource.isLoading}
            />
          </section>

          <FilterBar
            searchValue={search}
            searchPlaceholder="Search product name or SKU…"
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
              options={[
                { value: "HEALTHY", label: "Healthy" },
                { value: "LOW_STOCK", label: "Low stock" },
                { value: "OUT_OF_STOCK", label: "Out of stock" },
              ]}
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
                  title="No products found"
                  description="No catalogue products match the active search and filter criteria."
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
              <StatusBadge status={stockStatus(product)} />
            </div>
            <h2 className="mt-4 text-xl font-semibold">{product.name}</h2>
            {product.description && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description}</p>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
            <Detail label="Category" value={product.category?.name ?? "—"} />
            <Detail label="Price" value={formatProductPrice(product.price)} />
            <Detail label="SKU" value={product.sku} />
            <Detail label="Finish / material" value={product.material ?? "—"} />
            <Detail
              label="Dimensions"
              value={
                product.width && product.height
                  ? `${product.width} × ${product.height} × ${product.thickness ?? "—"} ${product.unit}`
                  : "—"
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
  const [unit, setUnit] = useState(product.unit || "panel")
  const [width, setWidth] = useState(product.width ?? "")
  const [height, setHeight] = useState(product.height ?? "")
  const [thickness, setThickness] = useState(product.thickness ?? "")
  const [stock, setStock] = useState(String(product.inventory?.quantity ?? 0))
  const [reorderLevel, setReorderLevel] = useState(String(product.inventory?.reorderLevel ?? 10))
  const [isActive, setIsActive] = useState(product.isActive)
  const [description, setDescription] = useState(product.description ?? "")

  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const [imageUrl, setImageUrl] = useState<string | null>(product.images[0]?.url ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleDelete() {
    setIsDeleting(true)
    setError(null)
    try {
      await deleteProduct(product.id)
      if (isModerator) {
        toast.success("Delete request submitted for owner approval", {
          description: `Request to delete "${product.name}" has been sent for owner review.`,
        })
      } else {
        toast.success("Product deleted successfully", {
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
      setError("Please fill in all required fields (Name, Category, SKU, Price).")
      return
    }

    const numPrice = Number(price)
    if (Number.isNaN(numPrice) || numPrice <= 0) {
      setError("Price must be a positive number in Philippine Peso.")
      return
    }

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
        unit: unit.trim() || "panel",
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        thickness: thickness ? Number(thickness) : undefined,
        stock: stock ? Number(stock) : undefined,
        reorderLevel: reorderLevel ? Number(reorderLevel) : undefined,
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
          <SheetDescription>Update product details, specifications, and stock level.</SheetDescription>
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
              <Label htmlFor="edit-sku">SKU *</Label>
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
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="edit-stock">Stock quantity</Label>
              <Input
                id="edit-stock"
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="edit-reorder">Reorder threshold</Label>
              <Input
                id="edit-reorder"
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                className="mt-1.5"
              />
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

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="edit-width" className="text-xs">Width</Label>
              <Input
                id="edit-width"
                type="number"
                step="0.1"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-height" className="text-xs">Height</Label>
              <Input
                id="edit-height"
                type="number"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-thickness" className="text-xs">Thickness</Label>
              <Input
                id="edit-thickness"
                type="number"
                step="0.1"
                value={thickness}
                onChange={(e) => setThickness(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-unit" className="text-xs">Unit</Label>
              <Input
                id="edit-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1"
              />
            </div>
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
              Delete product
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
              <AlertDialogTitle>Delete Product?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{product.name}&rdquo;? This action cannot be undone.
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
                {isDeleting ? "Deleting…" : "Delete"}
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
  const [unit, setUnit] = useState("panel")
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")
  const [thickness, setThickness] = useState("")
  const [stock, setStock] = useState("50")
  const [reorderLevel, setReorderLevel] = useState("10")
  const [description, setDescription] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
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
    setUnit("panel")
    setWidth("")
    setHeight("")
    setThickness("")
    setStock("50")
    setReorderLevel("10")
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
      setError("Please fill in all required fields (Name, Category, SKU, Price).")
      return
    }

    const numPrice = Number(price)
    if (Number.isNaN(numPrice) || numPrice <= 0) {
      setError("Price must be a positive number in Philippine Peso.")
      return
    }

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
        unit: unit.trim() || "panel",
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        thickness: thickness ? Number(thickness) : undefined,
        stock: stock ? Number(stock) : 0,
        reorderLevel: reorderLevel ? Number(reorderLevel) : 10,
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
          description: `${name} has been added to the catalogue and inventory.`,
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
              <Label htmlFor="add-sku">SKU *</Label>
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
              <Input
                id="add-price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1850.00"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="add-stock">Initial stock *</Label>
              <Input
                id="add-stock"
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="add-reorder">Reorder threshold *</Label>
              <Input
                id="add-reorder"
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                required
                className="mt-1.5"
              />
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

            <div>
              <Label htmlFor="add-unit">Unit</Label>
              <Input
                id="add-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="panel"
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="add-width" className="text-xs">Width (cm)</Label>
              <Input
                id="add-width"
                type="number"
                step="0.1"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="60"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="add-height" className="text-xs">Height (cm)</Label>
              <Input
                id="add-height"
                type="number"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="240"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="add-thickness" className="text-xs">Thickness (cm)</Label>
              <Input
                id="add-thickness"
                type="number"
                step="0.1"
                value={thickness}
                onChange={(e) => setThickness(e.target.value)}
                placeholder="1.2"
                className="mt-1"
              />
            </div>
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

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`bg-card p-4 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )
}
