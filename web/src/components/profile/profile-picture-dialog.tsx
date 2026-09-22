import { ImagePlus, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"
import { toast } from "sonner"

import { uploadProfilePicture } from "@/api/auth"
import { getProfilePictureErrorMessage } from "@/auth/errors"
import { useAuth } from "@/auth/use-auth"
import { FormError } from "@/components/auth/form-error"
import { SquareCropper } from "@/components/profile/square-cropper"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  checkImageFile,
  decodeImage,
  exportCroppedImage,
  initialCrop,
  PROFILE_PICTURE_ACCEPT,
  PROFILE_PICTURE_MESSAGES,
} from "@/lib/profile-picture"
import type { CropState, DecodedImage } from "@/lib/profile-picture"

interface ProfilePictureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasPicture: boolean
}

type Step = "select" | "crop"

/**
 * Pick -> validate -> crop & preview -> confirm. Nothing is sent until the
 * customer presses Save; cancelling at any point discards the selection.
 */
export function ProfilePictureDialog({ open, onOpenChange, hasPicture }: ProfilePictureDialogProps) {
  const { updateUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("select")
  const [image, setImage] = useState<DecodedImage | null>(null)
  const [crop, setCrop] = useState<CropState | null>(null)
  const [error, setError] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Free the decoded pixels whenever the image is replaced, discarded, or the dialog unmounts.
  useEffect(() => () => image?.dispose(), [image])

  function reset() {
    setStep("select")
    setImage(null)
    setCrop(null)
    setError("")
    setIsDragging(false)
  }

  function handleOpenChange(next: boolean) {
    if (isSaving) return // Don't abandon an upload that's in flight.
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      setError(PROFILE_PICTURE_MESSAGES.noFile)
      return
    }

    setError("")
    setIsChecking(true)
    try {
      const problem = await checkImageFile(file)
      if (problem) {
        setError(problem)
        return
      }
      const decoded = await decodeImage(file)
      setImage(decoded)
      setCrop(initialCrop(decoded))
      setStep("crop")
    } catch {
      setError(PROFILE_PICTURE_MESSAGES.unreadable)
    } finally {
      setIsChecking(false)
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0])
    event.target.value = "" // Lets the same file be chosen again after an error.
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (isChecking) return
    void handleFile(event.dataTransfer.files[0])
  }

  async function handleSave() {
    if (!image || !crop) return
    setIsSaving(true)
    setError("")
    try {
      const updated = await uploadProfilePicture(await exportCroppedImage(image, crop))
      updateUser(updated)
      toast.success("Profile picture updated", { description: "Your new photo has been saved." })
      reset()
      onOpenChange(false)
    } catch (caught) {
      setError(getProfilePictureErrorMessage(caught))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby="profile-picture-dialog-description">
        <DialogHeader>
          <DialogTitle>{hasPicture ? "Change profile picture" : "Upload profile picture"}</DialogTitle>
          <DialogDescription id="profile-picture-dialog-description">
            {step === "select" ? "Choose a JPG, PNG, or WEBP image up to 5MB." : "Drag to reposition and zoom until it looks right, then save."}
          </DialogDescription>
        </DialogHeader>

        {error && <FormError message={error} />}

        {step === "select" && (
          <>
            <input ref={inputRef} type="file" accept={PROFILE_PICTURE_ACCEPT} className="sr-only" tabIndex={-1} onChange={handleInputChange} aria-label="Choose a profile picture" />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              disabled={isChecking}
              className={cn(
                "flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/35 px-4 py-8 text-center transition-colors outline-none hover:border-primary/50 hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70",
                isDragging && "border-primary bg-secondary/70",
              )}
            >
              {isChecking ? <LoaderCircle className="size-7 animate-spin text-muted-foreground" aria-hidden="true" /> : <ImagePlus className="size-7 text-muted-foreground" aria-hidden="true" />}
              <span className="text-sm font-medium">{isChecking ? "Checking your photo…" : "Choose a photo"}</span>
              <span className="text-xs text-muted-foreground">{isChecking ? "One moment." : "or drag and drop it here"}</span>
            </button>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {step === "crop" && image && crop && (
          <>
            <SquareCropper image={image} crop={crop} onChange={setCrop} disabled={isSaving} />
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => { reset() }} disabled={isSaving}>Choose a different photo</Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>Cancel</Button>
                <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                  {isSaving ? "Saving…" : "Save photo"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
