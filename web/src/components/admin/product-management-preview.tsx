import { Eye, ImagePlus, PackageSearch, Pencil, Plus, Upload, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import type { AdminPreviewRole } from "@/admin/admin-preview-capabilities"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import type { Column } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { StatusBadge } from "@/components/admin/status-badge"
import { ProductImage } from "@/components/products/product-image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { fallbackCategories } from "@/data/catalog-fallback"
import { formatProductPrice } from "@/lib/format-price"
import { imageFileError } from "@/preview/product-policy"
import type { ProductDraft } from "@/preview/product-policy"
import { savePreviewProduct, usePreviewProducts } from "@/preview/product-store"
import type { PreviewProduct } from "@/preview/product-store"

const emptyDraft: ProductDraft = { name: "", categoryId: "", description: "", price: "", material: "PVC", quantity: "0", status: "ACTIVE" }

function stockStatus(product: PreviewProduct) {
  const available = Math.max(0, (product.inventory?.quantity ?? 0) - (product.inventory?.reservedQty ?? 0))
  if (available === 0) return "OUT_OF_STOCK"
  if (available <= (product.inventory?.reorderLevel ?? 0)) return "LOW_STOCK"
  return "HEALTHY"
}

export function ProductManagementPreview({ role }: { role: AdminPreviewRole }) {
  const products = usePreviewProducts()
  const canManage = role === "MODERATOR"
  const [selected, setSelected] = useState<PreviewProduct | null>(null)
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [imageBusy, setImageBusy] = useState(false)
  const imageOwnedRef = useRef(false)
  const imageUrlRef = useRef<string | null>(null)
  const imageChoiceRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => { imageUrlRef.current = imageUrl }, [imageUrl])
  useEffect(() => () => {
    imageChoiceRef.current += 1
    if (imageOwnedRef.current && imageUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(imageUrlRef.current)
  }, [])

  function releaseDraftImage() {
    if (imageOwnedRef.current && imageUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(imageUrlRef.current)
    imageOwnedRef.current = false
    imageUrlRef.current = null
  }

  function closeEditor() {
    imageChoiceRef.current += 1
    setImageBusy(false)
    releaseDraftImage()
    setDraft(null)
    setEditingId(undefined)
    setImageUrl(null)
    setErrors({})
  }

  function openEditor(product?: PreviewProduct) {
    imageChoiceRef.current += 1
    setImageBusy(false)
    releaseDraftImage()
    setSelected(null)
    setErrors({})
    setEditingId(product?.id)
    setImageUrl(product?.images[0]?.url ?? null)
    imageUrlRef.current = product?.images[0]?.url ?? null
    setDraft(product ? {
      name: product.name,
      categoryId: product.categoryId,
      description: product.description ?? "",
      price: product.price,
      material: product.material ?? "",
      quantity: String(product.inventory?.quantity ?? 0),
      status: product.isActive ? "ACTIVE" : "DRAFT",
    } : { ...emptyDraft, categoryId: fallbackCategories[0]?.id ?? "" })
  }

  function updateField(key: keyof ProductDraft, value: string) {
    setDraft((current) => current ? { ...current, [key]: value } : null)
    setErrors((current) => { const next = { ...current }; delete next[key]; return next })
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const problem = imageFileError(file)
    if (problem) { setErrors((current) => ({ ...current, image: problem })); return }
    const nextUrl = URL.createObjectURL(file)
    const choice = ++imageChoiceRef.current
    setImageBusy(true)
    try {
      const image = new Image()
      image.src = nextUrl
      await image.decode()
      if (choice !== imageChoiceRef.current) { URL.revokeObjectURL(nextUrl); return }
      releaseDraftImage()
      imageOwnedRef.current = true
      imageUrlRef.current = nextUrl
      setImageUrl(nextUrl)
      setErrors((current) => { const next = { ...current }; delete next.image; return next })
    } catch {
      URL.revokeObjectURL(nextUrl)
      if (choice === imageChoiceRef.current) setErrors((current) => ({ ...current, image: "This image could not be read. Choose another file." }))
    } finally {
      if (choice === imageChoiceRef.current) setImageBusy(false)
    }
  }

  function removeImage() {
    imageChoiceRef.current += 1
    setImageBusy(false)
    releaseDraftImage()
    setImageUrl(null)
    setErrors((current) => { const next = { ...current }; delete next.image; return next })
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const result = savePreviewProduct(role, draft, imageUrl, editingId)
    setErrors(result.errors)
    if (!result.product) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    // The store now owns a newly selected object URL and will release it on replace/HMR.
    imageOwnedRef.current = false
    imageUrlRef.current = null
    setDraft(null)
    setEditingId(undefined)
    setImageUrl(null)
    toast.success(editingId ? "Product updated" : "Product added", { description: "The shared preview catalogue has been updated until reload." })
  }

  const columns: Column<PreviewProduct>[] = [
    { key: "product", header: "Product", primary: true, cell: (product) => <div className="flex min-w-0 items-center gap-3"><ProductImage image={product.images[0]} productName={product.name} categorySlug={product.category.slug} className="size-12 shrink-0 rounded-md" /><div className="min-w-0"><p className="font-medium break-words [overflow-wrap:anywhere]">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{product.previewSource === "MODERATOR" ? "Moderator-added" : "Existing product"}</p></div></div> },
    { key: "category", header: "Category", cell: (product) => product.category.name },
    { key: "price", header: "Price", numeric: true, cell: (product) => formatProductPrice(product.price) },
    { key: "stock", header: "Stock", numeric: true, cell: (product) => String(product.inventory?.quantity ?? 0) },
    { key: "added", header: "Added", secondary: true, cell: (product) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(product.createdAt)) },
    { key: "status", header: "Status", cell: (product) => <div className="flex flex-wrap justify-end gap-1.5 md:justify-start"><StatusBadge status={product.isActive ? "ACTIVE" : "DRAFT"} /><StatusBadge status={stockStatus(product)} /></div> },
  ]

  return <>
    <AdminPageHeader eyebrow="Catalogue" title="Products" description={canManage ? "Add and maintain products that flow into the shared customer storefront preview." : "Review the complete catalogue, including products recently added by Moderators."} actions={<><Button variant="outline" asChild><Link to="/products"><Eye aria-hidden="true" />View storefront</Link></Button>{canManage ? <Button ref={addButtonRef} onClick={() => openEditor()}><Plus aria-hidden="true" />Add product</Button> : <StatusBadge status="VIEW_ONLY" label="View only" />}</>} />
    <p className="mt-3 text-xs text-muted-foreground">Fictional records · Changes remain in this browser until reload</p>
    <div className="mt-6"><DataTable rows={[...products]} columns={columns} getRowId={(product) => product.id} caption="Product preview catalogue" empty={<EmptyState icon={PackageSearch} title="No products yet" description="The preview catalogue is empty." />} rowAction={(product) => <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setSelected(product)} aria-label={`View ${product.name}`}><Eye aria-hidden="true" />View</Button>{canManage && <Button size="sm" onClick={() => openEditor(product)} aria-label={`Edit ${product.name}`}><Pencil aria-hidden="true" />Edit</Button>}</div>} /></div>

    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
      <SheetContent className="admin-surface w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:max-w-lg!">
        <SheetHeader className="pr-12"><SheetTitle>Product details</SheetTitle><SheetDescription>{selected?.previewSource === "MODERATOR" ? "Moderator-added preview product" : "Existing catalogue product"} · View only</SheetDescription></SheetHeader>
        {selected && <div className="space-y-6 px-4 pb-6"><ProductImage image={selected.images[0]} productName={selected.name} categorySlug={selected.category.slug} className="aspect-[4/3] w-full" /><div><div className="flex flex-wrap gap-2"><StatusBadge status={selected.isActive ? "ACTIVE" : "DRAFT"} /><StatusBadge status={stockStatus(selected)} /><StatusBadge status="VIEW_ONLY" label="View only" /></div><h2 className="mt-4 text-xl font-semibold">{selected.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.description}</p></div><dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm"><Detail label="Category" value={selected.category.name} /><Detail label="Price" value={formatProductPrice(selected.price)} /><Detail label="Finish / material" value={selected.material ?? "—"} /><Detail label="Stock quantity" value={String(selected.inventory?.quantity ?? 0)} /><Detail label="Added" value={new Intl.DateTimeFormat("en-PH", { dateStyle: "long" }).format(new Date(selected.createdAt))} wide /></dl></div>}
      </SheetContent>
    </Sheet>

    <Sheet open={Boolean(draft)} onOpenChange={(open) => { if (!open) closeEditor() }}>
      <SheetContent className="admin-surface @container/product-form w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:max-w-2xl!" onCloseAutoFocus={(event) => { event.preventDefault(); addButtonRef.current?.focus() }}>
        <SheetHeader className="pr-12"><SheetTitle>{editingId ? "Edit product" : "Add product"}</SheetTitle><SheetDescription>Build a storefront-ready PVC panel listing. Nothing is uploaded to a server.</SheetDescription></SheetHeader>
        {draft && <form ref={formRef} onSubmit={save} noValidate className="space-y-6 px-4 pb-6">
          {errors.form && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errors.form}</p>}
          <section aria-labelledby="product-image-heading"><div className="flex items-center justify-between gap-3"><Label id="product-image-heading">Product image</Label>{imageUrl && <Button type="button" variant="ghost" size="sm" onClick={removeImage}><X aria-hidden="true" />Remove</Button>}</div><div className="mt-2 overflow-hidden rounded-xl border border-dashed border-border bg-secondary/35">{imageUrl ? <ProductImage image={{ url: imageUrl }} productName={draft.name || "New product"} categorySlug={fallbackCategories.find((category) => category.id === draft.categoryId)?.slug ?? "wall-panels"} className="aspect-[16/9] w-full rounded-none" /> : <div className="flex aspect-[16/9] flex-col items-center justify-center p-6 text-center"><ImagePlus className="size-8 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-sm font-medium">Add a clear product image</p><p className="mt-1 text-xs text-muted-foreground">JPG, PNG, or WebP · maximum 5 MB</p></div>}</div><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event)} className="sr-only" aria-label="Upload product image" /><Button type="button" variant="outline" className="mt-3 w-full" disabled={imageBusy} onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" />{imageBusy ? "Checking image…" : imageUrl ? "Replace image" : "Upload image"}</Button>{errors.image && <p className="mt-2 text-xs text-destructive" role="alert">{errors.image}</p>}</section>
          <div className="grid gap-5 @md/product-form:grid-cols-2">
            <Field label="Product name" id="product-name" error={errors.name} wide><Input id="product-name" value={draft.name} onChange={(event) => updateField("name", event.target.value)} maxLength={100} aria-invalid={Boolean(errors.name)} required /></Field>
            <Field label="Category" id="product-category" error={errors.categoryId}><select id="product-category" value={draft.categoryId} onChange={(event) => updateField("categoryId", event.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3" aria-invalid={Boolean(errors.categoryId)}>{fallbackCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
            <Field label="Price (₱)" id="product-price" error={errors.price}><Input id="product-price" value={draft.price} onChange={(event) => updateField("price", event.target.value)} inputMode="decimal" maxLength={18} aria-invalid={Boolean(errors.price)} required /></Field>
            <Field label="Finish / material" id="product-material" error={errors.material}><Input id="product-material" value={draft.material} onChange={(event) => updateField("material", event.target.value)} maxLength={100} aria-invalid={Boolean(errors.material)} required /></Field>
            <Field label="Stock quantity" id="product-stock" error={errors.quantity}><Input id="product-stock" value={draft.quantity} onChange={(event) => updateField("quantity", event.target.value)} inputMode="numeric" maxLength={7} aria-invalid={Boolean(errors.quantity)} required /></Field>
            <Field label="Status" id="product-status" error={errors.status}><select id="product-status" value={draft.status} onChange={(event) => updateField("status", event.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3" aria-invalid={Boolean(errors.status)}><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option></select></Field>
            <Field label="Description" id="product-description" error={errors.description} wide><Textarea id="product-description" value={draft.description} onChange={(event) => updateField("description", event.target.value)} maxLength={1500} className="min-h-28" aria-invalid={Boolean(errors.description)} required /><p className="mt-1 text-right text-xs text-muted-foreground">{draft.description.length}/1500</p></Field>
          </div>
          <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-popover px-4 py-3 @md/product-form:flex-row @md/product-form:justify-end"><Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button><Button type="submit" disabled={imageBusy}>{editingId ? "Save changes" : "Add to catalogue"}</Button></div>
        </form>}
      </SheetContent>
    </Sheet>
  </>
}

function Field({ label, id, error, wide, children }: { label: string; id: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={wide ? "@md/product-form:col-span-2" : "min-w-0"}><Label htmlFor={id}>{label}</Label><div className="mt-2">{children}</div>{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}</div>
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={`bg-card p-4 ${wide ? "col-span-2" : ""}`}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium [overflow-wrap:anywhere]">{value}</dd></div>
}
