import { ImagePlus, Star, X } from "lucide-react"
import { useRef, type ChangeEvent } from "react"

import { MAX_PRODUCT_IMAGE_BYTES, MAX_PRODUCT_IMAGES, newProductImageKey, type ProductImageItem } from "@/admin/product-images"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface ProductImagesFieldProps {
  items: ProductImageItem[]
  onChange: (items: ProductImageItem[]) => void
  onError: (message: string | null) => void
  disabled?: boolean
  /** At least one photo is needed (marked like the other required fields). */
  required?: boolean
}

/** Up to four product photos: add several at once, remove one, or make one the main photo. */
export function ProductImagesField({ items, onChange, onError, disabled = false, required = false }: ProductImagesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const slotsLeft = MAX_PRODUCT_IMAGES - items.length

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (files.length === 0) return
    const invalid = files.find((file) => !file.type.startsWith("image/"))
    if (invalid) return onError("Please select valid image files (JPG, PNG, WebP).")
    const tooLarge = files.find((file) => file.size > MAX_PRODUCT_IMAGE_BYTES)
    if (tooLarge) return onError(`${tooLarge.name} is larger than 5 MB.`)
    const accepted = files.slice(0, Math.max(slotsLeft, 0))
    onError(files.length > accepted.length ? `A product can have up to ${MAX_PRODUCT_IMAGES} photos; only the first ${accepted.length} were added.` : null)
    onChange([...items, ...accepted.map((file) => ({ key: newProductImageKey(), url: URL.createObjectURL(file), file }))])
  }

  function remove(key: string) {
    onError(null)
    onChange(items.filter((item) => item.key !== key))
  }

  function makeMain(key: string) {
    const item = items.find((candidate) => candidate.key === key)
    if (item) onChange([item, ...items.filter((candidate) => candidate.key !== key)])
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label>Product photos{required && " *"}</Label>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}/{MAX_PRODUCT_IMAGES}</span>
      </div>
      <ul className="mt-2 grid grid-cols-4 gap-2.5" aria-label="Product photos">
        {items.map((item, index) => (
          <li key={item.key} className={cn("group relative aspect-square overflow-hidden rounded-lg border bg-secondary/30", index === 0 ? "border-primary ring-1 ring-primary" : "border-border")}>
            <img src={item.url} alt={index === 0 ? "Main product photo" : `Product photo ${index + 1}`} className="size-full object-cover" />
            {index === 0 ? (
              <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">Main</span>
            ) : (
              <button type="button" onClick={() => makeMain(item.key)} disabled={disabled} className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[0.65rem] font-semibold shadow-sm hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Make photo ${index + 1} the main photo`}>
                <Star className="size-3" aria-hidden="true" />Main
              </button>
            )}
            <button type="button" onClick={() => remove(item.key)} disabled={disabled} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-background/90 shadow-sm hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Remove photo ${index + 1}`}>
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
        {slotsLeft > 0 && (
          <li className="aspect-square">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-secondary/20 text-xs text-muted-foreground hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <ImagePlus className="size-5" aria-hidden="true" />Add photo
            </button>
          </li>
        )}
      </ul>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleSelect} className="sr-only" tabIndex={-1} />
      <p className="mt-1.5 text-xs text-muted-foreground">{required ? `1 to ${MAX_PRODUCT_IMAGES} photos` : `Up to ${MAX_PRODUCT_IMAGES} photos`}, JPG, PNG, or WebP up to 5 MB each. The main photo shows first in the store.</p>
    </div>
  )
}
