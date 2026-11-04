import { Fragment, useEffect, useRef } from "react"
import { ChevronDown, Globe, Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LANGUAGES, type Lang, type Messages } from "@/i18n"
import type { Theme } from "@/theme"

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-b-2 bg-muted px-1.5 font-mono text-[11px] text-foreground">{children}</kbd>
}

export function KeyHint({ t }: { t: Messages }) {
  const keys: Record<string, string> = { "{space}": t.space, "{a}": "A", "{b}": "B", "{c}": "C" }
  return (
    <>
      {t.hintKeys.split(/(\{space\}|\{a\}|\{b\}|\{c\})/).map((part, i) => (
        <Fragment key={i}>{keys[part] ? <Kbd>{keys[part]}</Kbd> : part}</Fragment>
      ))}
    </>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export function Waveform({ source, progress }: { source: AudioBuffer | null; progress: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bars = useRef<number[]>([])

  useEffect(() => {
    if (!source) return
    const d = source.getChannelData(0)
    const n = 160
    const step = Math.floor(d.length / n)
    const out: number[] = []
    for (let b = 0; b < n; b++) {
      let m = 0
      for (let i = b * step; i < (b + 1) * step; i += 8) m = Math.max(m, Math.abs(d[i]))
      out.push(m)
    }
    const pk = Math.max(...out) || 1
    bars.current = out.map((v) => v / pk)
  }, [source])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    const h = cv.clientHeight
    cv.width = w * dpr
    cv.height = h * dpr
    const g = cv.getContext("2d")
    const n = bars.current.length
    if (!g || !n) return
    g.scale(dpr, dpr)
    const cs = getComputedStyle(cv)
    const on = cs.getPropertyValue("--wave-on")
    const off = cs.getPropertyValue("--wave-off")
    const bw = w / n
    bars.current.forEach((v, i) => {
      const bh = Math.max(2, v * (h - 4))
      g.fillStyle = i / n <= progress ? on : off
      g.beginPath()
      g.roundRect(i * bw + bw * 0.2, (h - bh) / 2, Math.max(1, bw * 0.6), bh, 1)
      g.fill()
    })
  })

  return <canvas ref={ref} aria-hidden className="h-12 w-full [--wave-off:var(--border)] [--wave-on:var(--primary)]" />
}

export function Toolbar({ lang, setLang, theme, setTheme, t }: { lang: Lang; setLang: (l: Lang) => void; theme: Theme; setTheme: (t: Theme) => void; t: Messages }) {
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor
  return (
    <div className="flex items-center justify-between gap-3">
      <a href="https://www.upf.edu" target="_blank" rel="noreferrer" className="shrink-0">
        <img src={`${import.meta.env.BASE_URL}upf-rgb.png`} alt="Universitat Pompeu Fabra" className="h-8 w-auto sm:h-9 dark:hidden" />
        <img src={`${import.meta.env.BASE_URL}upf-white.png`} alt="Universitat Pompeu Fabra" className="hidden h-8 w-auto sm:h-9 dark:block" />
      </a>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label={t.language} className="gap-2 font-normal">
              <Globe className="size-4 text-muted-foreground" />
              {LANGUAGES[lang]}
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuLabel>{t.language}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
              {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
                <DropdownMenuRadioItem key={l} value={l} lang={l}>{LANGUAGES[l]}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8" aria-label={t.theme}>
              <ThemeIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t.theme}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <DropdownMenuRadioItem value="light"><Sun /> {t.light}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon /> {t.dark}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor /> {t.system}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
