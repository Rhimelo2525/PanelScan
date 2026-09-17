import { apiRequest } from "@/api/client"
import type { Cart, CartResponse } from "@/types/cart"

function unwrapCart(response: CartResponse): Cart {
  return response.cart
}

export async function getCart(signal?: AbortSignal): Promise<Cart> {
  return unwrapCart(await apiRequest<CartResponse>("/cart", { authenticated: true, signal }))
}

export async function addCartItem(productId: string, quantity: number): Promise<Cart> {
  return unwrapCart(await apiRequest<CartResponse>("/cart/items", {
    method: "POST",
    authenticated: true,
    body: { productId, quantity },
  }))
}

export async function updateCartItem(productId: string, quantity: number): Promise<Cart> {
  return unwrapCart(await apiRequest<CartResponse>(`/cart/items/${productId}`, {
    method: "PATCH",
    authenticated: true,
    body: { quantity },
  }))
}

export async function removeCartItem(productId: string): Promise<Cart> {
  return unwrapCart(await apiRequest<CartResponse>(`/cart/items/${productId}`, {
    method: "DELETE",
    authenticated: true,
  }))
}

export async function clearCartRequest(): Promise<Cart> {
  return unwrapCart(await apiRequest<CartResponse>("/cart", {
    method: "DELETE",
    authenticated: true,
  }))
}
