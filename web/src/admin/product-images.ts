import { uploadProductImage } from "@/api/admin"

/** Most photos a product can have from the admin form (the backend allows 10). */
export const MAX_PRODUCT_IMAGES = 4
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024

/** A photo in the form: one already saved (url only) or one picked to upload (file + local preview). */
export interface ProductImageItem {
  key: string
  url: string
  file?: File
}

let nextKey = 0
/** A key for a photo in the form, stable while it is reordered. */
export const newProductImageKey = () => `img-${++nextKey}`

/** The product's saved photos, main photo first. */
export function productImageItems(images: Array<{ url: string; isPrimary: boolean; sortOrder: number }>): ProductImageItem[] {
  return [...images]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
    .map((image) => ({ key: newProductImageKey(), url: image.url }))
}

/**
 * Uploads the photos picked in the form and returns the product's full photo
 * list, in order, the first as the main photo. The backend replaces a
 * product's photos with this list, so it always carries every photo kept.
 */
export async function uploadProductImages(items: ProductImageItem[], altText: string) {
  const urls = await Promise.all(items.map(async (item) => (item.file ? (await uploadProductImage(item.file)).url : item.url)))
  return urls.map((url, index) => ({ url, altText, isPrimary: index === 0, sortOrder: index }))
}
