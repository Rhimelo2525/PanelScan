import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function FormError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" role="alert" aria-live="polite" className="motion-swap">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>We couldn't continue</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

