import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { addCartItem, clearCartRequest, getCart, removeCartItem, removeCartItems, updateCartItem } from "@/api/cart"
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

  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const hasInitializedSelectionRef = useRef(false)

  const addItem = useCallback(async (productId: string, quantity: number) => {
    setSelectedProductIds((current) => new Set(current).add(productId))
    await mutateItem(productId, () => addCartItem(productId, quantity))
  }, [mutateItem])

  const updateItem = useCallback(async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedProductIds((prev) => {
        const next = new Set(prev)
        next.delete(productId)
        return next
      })
      await mutateItem(productId, () => removeCartItem(productId))
    } else {
      await mutateItem(productId, () => updateCartItem(productId, quantity))
    }
  }, [mutateItem])

  const removeItem = useCallback(async (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
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
      setSelectedProductIds(new Set())
      setError(null)
      setResolvedUserId(customerId)
    } finally {
      if (currentUserIdRef.current === customerId) setIsClearing(false)
    }
  }, [enqueueMutation, isClearing, isCustomer, user?.id])

  const removeSelectedItems = useCallback(async () => {
    const customerId = user?.id
    if (!isCustomer || !customerId || isClearing) return
    const idsToRemove = Array.from(selectedProductIds)
    if (idsToRemove.length === 0) return

    setIsClearing(true)
    try {
      const nextCart = await enqueueMutation(() => removeCartItems(idsToRemove))
      if (currentUserIdRef.current !== customerId) return
      setCart(nextCart)
      setSelectedProductIds(new Set())
      setError(null)
      setResolvedUserId(customerId)
    } finally {
      if (currentUserIdRef.current === customerId) setIsClearing(false)
    }
  }, [enqueueMutation, isClearing, isCustomer, selectedProductIds, user?.id])

  const isResolvedForCurrentUser = Boolean(isCustomer && user?.id && resolvedUserId === user.id)
  const activeCart = isResolvedForCurrentUser && cart?.customerId === user?.id ? cart : null
  const activeError = isResolvedForCurrentUser ? error : null
  const effectiveLoading = Boolean(isCustomer && (!isResolvedForCurrentUser || isLoading))
  const items = useMemo(() => activeCart?.items ?? [], [activeCart])
  const itemCount = useMemo(() => items.reduce((total, item) => total + item.quantity, 0), [items])
  const getItemQuantity = useCallback((productId: string) => activeCart?.items.find((item) => item.productId === productId)?.quantity ?? 0, [activeCart])

  // Sync selectedProductIds whenever activeCart items change
  useEffect(() => {
    if (!activeCart) {
      setSelectedProductIds(new Set())
      hasInitializedSelectionRef.current = false
      return
    }

    const currentItemProductIds = new Set(activeCart.items.map((item) => item.productId))

    setSelectedProductIds((prev) => {
      // First time loading activeCart for this user session:
      if (!hasInitializedSelectionRef.current) {
        hasInitializedSelectionRef.current = true
        try {
          const stored = sessionStorage.getItem(`panelscan_cart_selected_${user?.id}`)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed)) {
              const valid = parsed.filter((id: string) => currentItemProductIds.has(id))
              if (valid.length > 0) {
                return new Set(valid)
              }
            }
          }
        } catch {
          // ignore session storage read errors
        }
        // Default: all items selected
        return new Set(currentItemProductIds)
      }

      // If items changed, retain existing selections that are still in the cart
      const next = new Set<string>()
      for (const id of prev) {
        if (currentItemProductIds.has(id)) {
          next.add(id)
        }
      }
      return next
    })
  }, [activeCart, user?.id])

  // Persist selectedProductIds to sessionStorage
  useEffect(() => {
    if (!user?.id || !hasInitializedSelectionRef.current) return
    try {
      sessionStorage.setItem(
        `panelscan_cart_selected_${user.id}`,
        JSON.stringify(Array.from(selectedProductIds))
      )
    } catch {
      // ignore session storage write errors
    }
  }, [selectedProductIds, user?.id])

  const toggleSelectProduct = useCallback((productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }, [])

  const selectAllProducts = useCallback((select: boolean) => {
    if (select) {
      const allIds = new Set(items.map((item) => item.productId))
      setSelectedProductIds(allIds)
    } else {
      setSelectedProductIds(new Set())
    }
  }, [items])

  const isProductSelected = useCallback((productId: string) => selectedProductIds.has(productId), [selectedProductIds])

  const selectedItems = useMemo(
    () => items.filter((item) => selectedProductIds.has(item.productId)),
    [items, selectedProductIds]
  )

  const selectedItemCount = useMemo(
    () => selectedItems.reduce((total, item) => total + item.quantity, 0),
    [selectedItems]
  )

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
    removeSelectedItems,
    getItemQuantity,
    selectedProductIds,
    toggleSelectProduct,
    selectAllProducts,
    isProductSelected,
    selectedItems,
    selectedItemCount,
  }), [activeCart, activeError, addItem, clearCart, effectiveLoading, getItemQuantity, isClearing, isProductSelected, itemCount, items, pendingProductIds, refreshCart, removeItem, removeSelectedItems, selectAllProducts, selectedItemCount, selectedItems, selectedProductIds, toggleSelectProduct, updateItem])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
