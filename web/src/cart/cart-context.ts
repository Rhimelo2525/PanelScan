import { createContext } from "react"

import type { Cart, CartItem } from "@/types/cart"

export interface CartContextValue {
  cart: Cart | null
  items: CartItem[]
  itemCount: number
  isLoading: boolean
  error: string | null
  pendingProductIds: ReadonlySet<string>
  isClearing: boolean
  refreshCart: () => Promise<void>
  addItem: (productId: string, quantity: number) => Promise<void>
  updateItem: (productId: string, quantity: number) => Promise<void>
  removeItem: (productId: string) => Promise<void>
  clearCart: () => Promise<void>
  getItemQuantity: (productId: string) => number
  selectedProductIds: ReadonlySet<string>
  toggleSelectProduct: (productId: string) => void
  selectAllProducts: (select: boolean) => void
  isProductSelected: (productId: string) => boolean
  selectedItems: CartItem[]
  selectedItemCount: number
  removeSelectedItems: () => Promise<void>
}

export const CartContext = createContext<CartContextValue | null>(null)
