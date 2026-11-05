import { useSyncExternalStore } from "react"

/**
 * Light or dark, picked with the header's sun/moon button and kept in this
 * browser. Light until the visitor picks dark; it does not follow the
 * device's own setting. index.html applies the saved choice before the page
 * paints, so a dark visitor never sees a white flash.
 */
export type Theme = "light" | "dark"

const STORAGE_KEY = "panelscan.theme"
const THEME_COLOR: Record<Theme, string> = { light: "#f7f4ee", dark: "#171411" }
const listeners = new Set<() => void>()

function read(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light"
  } catch {
    return "light"
  }
}

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme])
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not saved; it still applies for this visit.
  }
  apply(theme)
  listeners.forEach((listener) => listener())
}

// Another tab switched: follow it.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return
    apply(read())
    listeners.forEach((listener) => listener())
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme)
  return [theme, setTheme]
}
