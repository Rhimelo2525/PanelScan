import { MapPinPlus, Pencil, Star, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { deleteSavedAddress, getSavedAddresses, setDefaultSavedAddress } from "@/api/addresses"
import { AddressDialog } from "@/components/addresses/address-dialog"
import { SavedAddressSummary } from "@/components/addresses/saved-address-summary"
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
import { Skeleton } from "@/components/ui/skeleton"
import type { SavedAddress } from "@/types/address"

const GENERIC_ERROR = "Please try again in a moment."

/** Profile "Shipping Addresses": the customer's saved delivery destinations, chosen from at checkout. */
export function ShippingAddressesSection() {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; address: SavedAddress | null }>({ open: false, address: null })
  const [pendingDelete, setPendingDelete] = useState<SavedAddress | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setAddresses(await getSavedAddresses(signal))
      setLoadError(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleSetDefault(address: SavedAddress) {
    setBusyId(address.id)
    try {
      await setDefaultSavedAddress(address.id)
      await load()
      toast.success(`${address.label || "Address"} is now your default`)
    } catch {
      toast.error("Default address not changed", { description: GENERIC_ERROR })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setBusyId(target.id)
    try {
      await deleteSavedAddress(target.id)
      await load()
      toast.success("Address deleted")
    } catch {
      toast.error("Address not deleted", { description: GENERIC_ERROR })
    } finally {
      setBusyId(null)
      setPendingDelete(null)
    }
  }

  return (
    <section className="surface-card p-6 sm:p-8" aria-labelledby="shipping-addresses-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="shipping-addresses-title" className="text-xl font-semibold tracking-[-0.025em]">Shipping addresses</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Save where you'd like deliveries to go, then just choose one at checkout.</p>
        </div>
        <Button variant="outline" onClick={() => setDialog({ open: true, address: null })}>
          <MapPinPlus data-icon="inline-start" aria-hidden="true" />Add new address
        </Button>
      </div>

      <div className="mt-6">
        {addresses === null && !loadError ? (
          <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading saved addresses" aria-busy="true">
            {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-36 w-full rounded-lg" />)}
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">
            <p>Your saved addresses could not be loaded.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoadError(false); setAddresses(null); void load() }}>Try again</Button>
          </div>
        ) : addresses && addresses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-secondary/35 px-6 py-10 text-center">
            <p className="text-sm font-medium">No shipping address saved yet.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">Pin your location on the map once, and checkout will be a single tap from then on.</p>
            <Button className="mt-5" onClick={() => setDialog({ open: true, address: null })}>
              <MapPinPlus data-icon="inline-start" aria-hidden="true" />Add shipping address
            </Button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {addresses?.map((address) => (
              <li key={address.id} className={address.isDefault ? "flex flex-col justify-between gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4" : "flex flex-col justify-between gap-4 rounded-lg border border-border p-4"}>
                <SavedAddressSummary address={address} />
                <div className="flex flex-wrap gap-2">
                  {!address.isDefault && (
                    <Button variant="outline" size="sm" disabled={busyId === address.id} onClick={() => void handleSetDefault(address)}>
                      <Star className="size-3.5" data-icon="inline-start" aria-hidden="true" />Set as default
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={busyId === address.id} onClick={() => setDialog({ open: true, address })} aria-label={`Edit ${address.label || "address"}`}>
                    <Pencil className="size-3.5" data-icon="inline-start" aria-hidden="true" />Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled={busyId === address.id} onClick={() => setPendingDelete(address)} aria-label={`Delete ${address.label || "address"}`} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden="true" />Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddressDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        address={dialog.address}
        isFirstAddress={(addresses?.length ?? 0) === 0}
        onSaved={(saved) => {
          void load()
          toast.success(dialog.address ? "Address updated" : "Address saved", { description: saved.formattedAddress })
        }}
      />

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open && !busyId) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.formattedAddress} will be removed from your saved addresses. Orders you've already placed keep the address they were delivered to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>Keep address</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={Boolean(busyId)} onClick={(event) => { event.preventDefault(); void handleDelete() }}>Delete address</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
