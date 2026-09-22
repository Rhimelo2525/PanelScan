import { useProfilePictureSrc } from "@/hooks/use-profile-picture"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { AuthUser } from "@/types/auth"

interface CustomerAvatarProps {
  user: Pick<AuthUser, "firstName" | "lastName" | "profilePictureUrl">
  className?: string
  fallbackClassName?: string
}

/**
 * The customer's circular photo. The initials avatar (the site's existing
 * default look) stands in while the image loads, when there is none, and if it
 * can't be loaded - so the layout never jumps and a failure is invisible.
 */
export function CustomerAvatar({ user, className, fallbackClassName }: CustomerAvatarProps) {
  const { src } = useProfilePictureSrc(user.profilePictureUrl)
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()

  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt={`${user.firstName} ${user.lastName}'s profile picture`} decoding="async" />}
      <AvatarFallback className={cn("bg-primary font-semibold text-primary-foreground", fallbackClassName)}>{initials}</AvatarFallback>
    </Avatar>
  )
}
