import { MapPin } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { formatPhoneForDisplay } from "@/lib/delivery/address-formatter"
import type { SavedAddress } from "@/types/address"

/** Label, default badge, readable address, and recipient - identical in the profile list and the checkout picker. */
export function SavedAddressSummary({ address }: { address: SavedAddress }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{address.label || "Shipping address"}</span>
        {address.isDefault && <Badge variant="secondary" className="text-[0.65rem] tracking-wide uppercase">Default</Badge>}
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-foreground/85">
        <MapPin className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>{address.formattedAddress}</span>
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {address.recipientName} · {formatPhoneForDisplay(address.recipientPhone)}
      </p>
    </div>
  )
}
