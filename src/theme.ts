export type Theme = "light" | "dark" | "system"

const media = window.matchMedia("(prefers-color-scheme: dark)")

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem("theme")
    if (v === "light" || v === "dark" || v === "system") return v
  } catch {
    void 0
  }
  return "system"
}

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && media.matches)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem("theme", theme)
  } catch {
    void 0
  }
  applyTheme(theme)
}

export function watchSystemTheme() {
  media.addEventListener("change", () => {
    if (storedTheme() === "system") applyTheme("system")
  })
}
