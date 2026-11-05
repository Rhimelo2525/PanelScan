import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/theme/theme"

/** Sun/moon button: switches the site between light and dark. */
export function ThemeToggle({ size = "icon-lg", className }: { size?: "icon-lg" | "icon-sm" | "icon"; className?: string }) {
  const [theme, setTheme] = useTheme()
  const isDark = theme === "dark"
  return (
    <Button
      variant="ghost"
      size={size}
      className={className}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  )
}
