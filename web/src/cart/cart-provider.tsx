import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { addCartItem, clearCartRequest, getCart, removeCartItem, updateCartItem } from "@/api/cart"
import { useAuth } from "@/auth/use-auth"
import { CartContext } from "@/cart/cart-context"
import { getCartErrorMessage } from "@/cart/cart-errors"
import type { Cart } from "@/types/cart"

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth()
  const [cart, setCart] = useState<Cart | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null)
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(new Set())
  const [isClearing, setIsClearing] = useState(false)
  const currentUserIdRef = useRef(user?.id)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingMutationsRef = useRef<Map<string, Promise<void>>>(new Map())

  const isCustomer = user?.role === "CUSTOMER"
  currentUserIdRef.current = user?.id

  const enqueueMutation = useCallback((mutation: () => Promise<Cart>): Promise<Cart> => {
    const result = mutationQueueRef.current.catch(() => undefined).then(mutation)
    mutationQueueRef.current = result.then(() => undefined, () => undefined)
    return result
  }, [])

  const loadCart = useCallback(async (signal?: AbortSignal) => {
    const customerId = user?.id
    if (!isCustomer || !customerId) return
    setIsLoading(true)
    setError(null)
    try {
      const nextCart = await getCart(signal)
      if (currentUserIdRef.current !== customerId) return
      setCart(nextCart)
      setResolvedUserId(customerId)
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
      if (currentUserIdRef.current !== customerId) return
      setError(getCartErrorMessage(caughtError))
      setResolvedUserId(customerId)
    } finally {
      if (!signal?.aborted && currentUserIdRef.current === customerId) setIsLoading(false)
    }
  }, [isCustomer, user?.id])

  useEffect(() => {
    setCart(null)
    setError(null)
    setResolvedUserId(null)
    setPendingProductIds(new Set())
    pendingMutationsRef.current.clear()
    setIsClearing(false)

    if (isAuthLoading || !isCustomer) {
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const requestTimer = window.setTimeout(() => void loadCart(controller.signal), 0)
    return () => {
      window.clearTimeout(requestTimer)
      controller.abort()
    }
  }, [isAuthLoading, isCustomer, loadCart, user?.id])

  const refreshCart = useCallback(async () => {
    await loadCart()
  }, [loadCart])

  const mutateItem = useCallback((productId: string, mutation: () => Promise<Cart>): Promise<void> => {
    const customerId = user?.id
    if (!isCustomer || !customerId) return Promise.resolve()
    const existingMutation = pendingMutationsRef.current.get(productId)
    if (existingMutation) return existingMutation

    setPendingProductIds((current) => new Set(current).add(productId))
    const operation = enqueueMutation(mutation).then((nextCart) => {
      if (currentUserIdRef.current !== customerId) return
      setCart(nextCart)
      setError(null)
      setResolvedUserId(customerId)
    }).finally(() => {
      if (pendingMutationsRef.current.get(productId) !== operation) return
      pendingMutationsRef.current.delete(productId)
      setPendingProductIds((current) => {
        const next = new Set(current)
        next.delete(productId)
        return next
      })
    })
    pendingMutationsRef.current.set(productId, operation)
    return operation
  }, [enqueueMutation, isCustomer, user?.id])

  const addItem = useCallback(async (productId: string, quantity: number) => {
    await mutateItem(productId, () => addCartItem(productId, quantity))
  }, [mutateItem])

  const updateItem = useCallback(async (productId: string, quantity: number) => {
    await mutateItem(productId, () => updateCartItem(productId, quantity))
  }, [mutateItem])

  const removeItem = useCallback(async (productId: string) => {
    await mutateItem(productId, () => removeCartItem(productId))
  }, [mutateItem])

  const clearCart = useCallback(async () => {
    const customerId = user?.id
    if (!isCustomer || !customerId || isClearing) return
    setIsClearing(true)
    try {
      const nextCart = await enqueueMutation(clearCartRequest)
      if (currentUserIdRef.current !== customerId) return
      setCart(nextCart)
      setError(null)
      setResolvedUserId(customerId)
    } finally {
      if (currentUserIdRef.current === customerId) setIsClearing(false)
    }
  }, [enqueueMutation, isClearing, isCustomer, user?.id])

  const isResolvedForCurrentUser = Boolean(isCustomer && user?.id && resolvedUserId === user.id)
  const activeCart = isResolvedForCurrentUser && cart?.customerId === user?.id ? cart : null
  const activeError = isResolvedForCurrentUser ? error : null
  const effectiveLoading = Boolean(isCustomer && (!isResolvedForCurrentUser || isLoading))
  const items = useMemo(() => activeCart?.items ?? [], [activeCart])
  const itemCount = useMemo(() => items.reduce((total, item) => total + item.quantity, 0), [items])
  const getItemQuantity = useCallback((productId: string) => activeCart?.items.find((item) => item.productId === productId)?.quantity ?? 0, [activeCart])

  const value = useMemo(() => ({
    cart: activeCart,
    items,
    itemCount,
    isLoading: effectiveLoading,
    error: activeError,
    pendingProductIds,
    isClearing,
    refreshCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
    getItemQuantity,
  }), [activeCart, activeError, addItem, clearCart, effectiveLoading, getItemQuantity, isClearing, itemCount, items, pendingProductIds, refreshCart, removeItem, updateItem])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
