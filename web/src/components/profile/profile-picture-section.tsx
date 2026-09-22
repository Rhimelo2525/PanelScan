import { Camera, LoaderCircle, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { removeProfilePicture } from "@/api/auth"
import { getProfilePictureErrorMessage } from "@/auth/errors"
import { useAuth } from "@/auth/use-auth"
import { CustomerAvatar } from "@/components/profile/customer-avatar"
import { ProfilePictureDialog } from "@/components/profile/profile-picture-dialog"
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
import type { AuthUser } from "@/types/auth"

/** The customer's photo with Upload / Change / Remove, at the top of the Profile tab. */
export function ProfilePictureSection({ user }: { user: AuthUser }) {
  const { updateUser } = useAuth()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const hasPicture = Boolean(user.profilePictureUrl)

  async function handleRemove() {
    setIsRemoving(true)
    try {
      updateUser(await removeProfilePicture())
      setIsConfirmingRemove(false)
      toast.success("Profile picture removed", { description: "Your initials will be shown instead." })
    } catch (error) {
      toast.error("Photo not removed", { description: getProfilePictureErrorMessage(error, "We couldn't remove your photo right now. Please try again.") })
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <section className="surface-card p-6 sm:p-8" aria-labelledby="profile-picture-title">
      <h2 id="profile-picture-title" className="text-xl font-semibold tracking-[-0.025em]">Profile picture</h2>
      <div className="mt-6 flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-6 sm:text-left">
        <CustomerAvatar user={user} className="size-24 sm:size-28" fallbackClassName="text-3xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{user.firstName} {user.lastName}</p>
          <p className="mt-0.5 text-sm break-all text-muted-foreground">{user.email}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button onClick={() => setIsDialogOpen(true)}>
              <Camera data-icon="inline-start" aria-hidden="true" />
              {hasPicture ? "Change photo" : "Upload photo"}
            </Button>
            {hasPicture && (
              <Button variant="outline" onClick={() => setIsConfirmingRemove(true)} disabled={isRemoving}>
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                Remove photo
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">JPG, PNG, or WEBP, up to 5MB. You&apos;ll be able to crop it to a square before saving.</p>
        </div>
      </div>

      <ProfilePictureDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} hasPicture={hasPicture} />

      <AlertDialog open={isConfirmingRemove} onOpenChange={(open) => { if (!isRemoving) setIsConfirmingRemove(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your profile picture?</AlertDialogTitle>
            <AlertDialogDescription>Your initials will be shown instead. You can upload a new photo at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Keep photo</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isRemoving}
              onClick={(event) => { event.preventDefault(); void handleRemove() }}
            >
              {isRemoving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {isRemoving ? "Removing…" : "Remove photo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
