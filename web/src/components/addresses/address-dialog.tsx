import { AddressForm } from "@/components/addresses/address-form"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { SavedAddress } from "@/types/address"

interface AddressDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The address to edit, or null to add a new one. */
  address: SavedAddress | null
  isFirstAddress: boolean
  onSaved: (address: SavedAddress) => void
}

/** Add / edit a saved shipping address - the same dialog from the profile page and from checkout. */
export function AddressDialog({ open, onOpenChange, address, isFirstAddress, onSaved }: AddressDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-2xl sm:p-7">
        <DialogHeader>
          <DialogTitle>{address ? "Edit shipping address" : "Add a shipping address"}</DialogTitle>
          <DialogDescription>Pin your exact delivery spot on the map - we'll fill in the address from it.</DialogDescription>
        </DialogHeader>
        {/* Keyed so each open starts from a fresh form (and a fresh map). */}
        {open && (
          <AddressForm
            key={address?.id ?? "new"}
            address={address}
            isFirstAddress={isFirstAddress}
            onSaved={(saved) => {
              onSaved(saved)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
