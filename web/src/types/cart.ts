export interface CartProductImage {
  url: string
}

export interface CartProductInventory {
  quantity: number
  reservedQty: number
}

export interface CartProduct {
  id: string
  name: string
  slug: string
  sku: string
  price: string
  unit: string
  isActive: boolean
  deletedAt: string | null
  images: CartProductImage[]
  inventory: CartProductInventory | null
}

export interface CartItem {
  id: string
  cartId: string
  productId: string
  quantity: number
  createdAt: string
  updatedAt: string
  product: CartProduct
}

export interface Cart {
  id: string
  customerId: string
  createdAt: string
  updatedAt: string
  items: CartItem[]
}

export interface CartResponse {
  cart: Cart
}
