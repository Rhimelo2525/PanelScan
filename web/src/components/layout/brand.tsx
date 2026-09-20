import { Link, useLocation, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"

/**
 * Official PanelScan logo, used as supplied. The artwork is a square PNG whose
 * warm wood background is part of the file (there is no transparent version),
 * so it is never recoloured, redrawn, or stretched:
 *
 *  - `mark` shows the bracketed room symbol only, framed by a CSS background
 *    crop (aspect ratio preserved) for small placements where the logo's own
 *    wordmark would be illegible. The live text beside it carries the name.
 *  - `full` shows the complete logo untouched, for places with room for it.
 *
 * Because the plate carries its own light warm background, it is always placed
 * on a warm neutral surface rather than a dark one.
 */
const LOGO_SRC = "/brand/panelscan-logo.png"

export function BrandMark({ className, decorative = true }: { className?: string; decorative?: boolean }) {
  return (
    <span
      className={cn("block shrink-0 rounded-md bg-[#f2e3d5] bg-contain bg-center bg-no-repeat", className)}
      style={{ backgroundImage: `url(${LOGO_SRC})` }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "PanelScan"}
      aria-hidden={decorative ? true : undefined}
    />
  )
}

/** The complete supplied logo, undistorted. */
export function BrandLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <img
      src={LOGO_SRC}
      alt="PanelScan by Disenyo Interior Solution"
      className={cn("h-auto w-full object-contain", className)}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      width={720}
      height={720}
    />
  )
}

interface BrandProps {
  inverse?: boolean
  className?: string
  /** Renders the wordmark without a link, for use inside an existing link or heading. */
  asStatic?: boolean
}

export function Brand({ inverse = false, className, asStatic = false }: BrandProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const handleBrandClick = (e: React.MouseEvent) => {
    if (location.pathname === "/") {
      e.preventDefault()
      if (location.hash) {
        navigate("/", { replace: true })
      }
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const content = (
    <>
      <BrandMark className="size-9 sm:size-10" />
      <span className="flex flex-col leading-none">
        <span className={cn("text-[1.1rem] font-semibold tracking-[-0.035em]", inverse ? "text-primary-foreground" : "text-foreground")}>
          PanelScan
        </span>
        <span className={cn("mt-1 text-[0.54rem] font-semibold tracking-[0.19em] uppercase", inverse ? "text-primary-foreground/65" : "text-muted-foreground")}>
          Disenyo Interior Solution
        </span>
      </span>
    </>
  )

  if (asStatic) return <span className={cn("inline-flex items-center gap-2.5", className)}>{content}</span>

  return (
    <Link
      to="/"
      onClick={handleBrandClick}
      className={cn("inline-flex items-center gap-2.5 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4", className)}
      aria-label="PanelScan home"
    >
      {content}
    </Link>
  )
}
