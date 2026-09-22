import { BadgeCheck, MailWarning } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/** Shows whether a customer's email address has been proven, using the API's `emailVerified` flag. */
export function EmailStatusBadge({ verified }: { verified: boolean | undefined }) {
  if (verified) {
    return <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400"><BadgeCheck data-icon="inline-start" aria-hidden="true" />Verified</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground"><MailWarning data-icon="inline-start" aria-hidden="true" />Not verified</Badge>
}
