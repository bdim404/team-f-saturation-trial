import { Fragment, useEffect, useRef, useState } from "react"
import { ChevronDown, Globe, Info, Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

export function Highlight({ text }: { text: string }) {
  return (
    <>
      {text.split("*").map((part, i) =>
        i % 2 ? <span key={i} className="font-semibold text-red-600 dark:text-red-400">{part}</span> : part,
      )}
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

export function TermInfo({ term, definition, label }: { term: string; definition: string; label: string }) {
  const [open, setOpen] = useState(false)
  const keyboard = useRef(false)
  const closeTimer = useRef(0)
  const keepOpen = () => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="relative ml-1.5 inline-flex size-[18px] translate-y-px items-center justify-center rounded-full border border-border text-muted-foreground transition-colors select-none after:absolute after:-inset-1.5 after:content-[''] hover:border-foreground/40 hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          onPointerEnter={(e) => {
            if (e.pointerType !== "mouse") return
            keyboard.current = false
            keepOpen()
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleClose()
          }}
          onPointerDown={() => {
            keyboard.current = false
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") keyboard.current = true
          }}
        >
          <Info className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={10}
        className="max-h-[min(22rem,calc(100dvh-4rem))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
        onOpenAutoFocus={(e) => {
          if (!keyboard.current) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          if (!keyboard.current) e.preventDefault()
        }}
        onPointerEnter={keepOpen}
        onPointerLeave={scheduleClose}
      >
        <PopoverArrow width={12} height={6} />
        <p className="font-serif text-sm font-semibold">{term}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{definition}</p>
      </PopoverContent>
    </Popover>
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
      <a href="https://www.upf.edu/web/mtg" target="_blank" rel="noreferrer" className="shrink-0">
        <img src={`${import.meta.env.BASE_URL}mtg-logo.png`} alt="MTG, Music Technology Group, Universitat Pompeu Fabra" className="h-8 w-auto sm:h-9 dark:brightness-0 dark:invert" />
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
