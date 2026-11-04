import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { Check, Globe, Headphones, Monitor, Moon, Pause, Play, Sun } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { config } from "@/config"
import { fill, initialLang, LANGUAGES, messages, saveLang, type Lang, type Messages } from "@/i18n"
import { buildStimuli, loadStimulus, Player, synthLoop, type Slot, type Stimuli } from "@/lib/audio"
import { submitResponse } from "@/lib/submit"
import { saveTheme, storedTheme, type Theme } from "@/theme"

const fmt = (s: number) => {
  const v = Math.max(0, s)
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-b-2 bg-muted px-1.5 font-mono text-[11px] text-foreground">{children}</kbd>
}

function KeyHint({ t }: { t: Messages }) {
  const keys: Record<string, string> = { "{space}": t.space, "{a}": "A", "{b}": "B" }
  return (
    <>
      {t.hintKeys.split(/(\{space\}|\{a\}|\{b\})/).map((part, i) => (
        <Fragment key={i}>{keys[part] ? <Kbd>{keys[part]}</Kbd> : part}</Fragment>
      ))}
    </>
  )
}

function Waveform({ source, progress }: { source: AudioBuffer | null; progress: number }) {
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

function VersionButton({ slot, label, active, disabled, onSelect }: { slot: Slot; label: string; active: boolean; disabled: boolean; onSelect: (s: Slot) => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onSelect(slot)}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border-2 bg-card px-3 py-5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        active ? "border-primary bg-accent" : "border-border hover:bg-accent/60",
      )}
    >
      <span className="text-4xl leading-none font-semibold tracking-tight">{slot}</span>
      <span className={cn("text-xs", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </button>
  )
}

function Toolbar({ lang, setLang, theme, setTheme, t }: { lang: Lang; setLang: (l: Lang) => void; theme: Theme; setTheme: (t: Theme) => void; t: Messages }) {
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor
  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
        <SelectTrigger size="sm" aria-label={t.language} className="gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {(Object.keys(LANGUAGES) as Lang[]).map((l) => (
            <SelectItem key={l} value={l} lang={l}>{LANGUAGES[l]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
  )
}

function Welcome({ t, onStart }: { t: Messages; onStart: () => void }) {
  const [agreed, setAgreed] = useState(false)
  const section = (title: string, body: React.ReactNode) => (
    <section className="flex flex-col gap-2">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      {body}
    </section>
  )
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        {section(t.whatTitle, <p className="text-muted-foreground">{fill(t.what, { m: config.durationMinutes })}</p>)}
        {section(
          t.prepTitle,
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground marker:text-border">
            <li>{t.prep1}</li>
            <li>{t.prep2}</li>
            <li>{t.prep3}</li>
          </ul>,
        )}
        {section(t.privacyTitle, <p className="text-muted-foreground">{t.privacy}</p>)}
        <Separator />
        <Label htmlFor="consent" className="flex cursor-pointer items-start gap-3 text-base leading-snug font-normal">
          <Checkbox id="consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
          {t.consent}
        </Label>
      </CardContent>
      <CardFooter>
        <Button size="lg" disabled={!agreed} onClick={onStart}>{t.start}</Button>
      </CardFooter>
    </Card>
  )
}

type Phase = "welcome" | "trial" | "sending" | "done"

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [theme, setThemeState] = useState<Theme>(storedTheme)
  const [source, setSource] = useState<AudioBuffer | null>(null)
  const [stim, setStim] = useState<Stimuli | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const [phase, setPhase] = useState<Phase>("welcome")
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState<Slot>("A")
  const [time, setTime] = useState(0)
  const [heard, setHeard] = useState<Record<Slot, number>>({ A: 0, B: 0 })
  const [answer, setAnswer] = useState<Slot | "">("")
  const player = useRef<Player | null>(null)
  const consented = useRef("")
  const started = useRef("")
  const t = messages[lang]

  const setLang = (l: Lang) => {
    setLangState(l)
    saveLang(l)
  }
  const setTheme = (v: Theme) => {
    setThemeState(v)
    saveTheme(v)
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.title
  }, [lang, t.title])

  useEffect(() => {
    let cancelled = false
    const load = config.stimulusUrl ? loadStimulus(config.stimulusUrl) : synthLoop()
    load
      .then(async (b) => {
        const s = await buildStimuli(b, config.drive.less, config.drive.more)
        if (cancelled) return
        player.current?.dispose()
        player.current = new Player(s)
        setSource(b)
        setStim(s)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
      player.current?.dispose()
      player.current = null
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      const p = player.current
      if (!p) return
      p.tally()
      setTime(p.time())
      setHeard({ ...p.heard })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const toggle = useCallback(() => {
    const p = player.current
    if (!p) return
    if (p.playing) {
      p.pause()
      setTime(p.time())
      setHeard({ ...p.heard })
      setPlaying(false)
    } else {
      p.play()
      setPlaying(true)
    }
  }, [])

  const select = useCallback((k: Slot) => {
    const p = player.current
    if (!p) return
    p.select(k)
    setActive(k)
    setHeard({ ...p.heard })
  }, [])

  const ready = phase === "trial" && !!stim

  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=radio], [role=combobox], [role=menu]")) return
      if (e.code === "Space") {
        e.preventDefault()
        toggle()
      } else if (e.key.toLowerCase() === "a") select("A")
      else if (e.key.toLowerCase() === "b") select("B")
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [ready, toggle, select])

  const start = () => {
    const now = new Date().toISOString()
    consented.current = now
    started.current = now
    setPhase("trial")
    window.scrollTo({ top: 0 })
  }

  const min = config.minSecondsPerVersion
  const unlocked = heard.A >= min && heard.B >= min

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = player.current
    if (!answer || !stim || !p) return
    p.pause()
    setPlaying(false)
    setSendFailed(false)
    setPhase("sending")
    try {
      await submitResponse({
        trial: config.trialId,
        language: lang,
        question: messages.en.question,
        stimulus: config.stimulusUrl ?? "synth-pop-loop",
        answer,
        answer_level: stim.map[answer],
        mapping: {
          A: { level: stim.map.A, drive: stim.slots.A.drive },
          B: { level: stim.map.B, drive: stim.slots.B.drive },
        },
        switches: p.switches,
        seconds_heard: { A: +p.heard.A.toFixed(1), B: +p.heard.B.toFixed(1) },
        consented: consented.current,
        started: started.current,
        submitted: new Date().toISOString(),
      })
      setPhase("done")
    } catch {
      setSendFailed(true)
      setPhase("trial")
    }
  }

  const duration = stim?.duration ?? 0
  const status = loadFailed ? t.loadError : !stim ? t.loading : null

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
      <Toolbar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} t={t} />

      <header className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Headphones className="size-4" /> {t.headphones}
        </p>
        <h1 className="font-serif text-3xl font-semibold text-balance sm:text-4xl">{t.title}</h1>
        <p className="max-w-prose text-muted-foreground">{phase === "welcome" ? t.welcomeLead : t.intro}</p>
      </header>

      {phase === "welcome" && <Welcome t={t} onStart={start} />}

      {phase === "done" && (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-xl"><Check className="size-5" /> {t.thanksTitle}</CardTitle>
            <CardDescription>{t.thanksBody}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {(phase === "trial" || phase === "sending") && (
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Button size="icon" className="size-14 shrink-0 rounded-full" disabled={!ready} onClick={toggle} aria-label={playing ? t.pause : t.play}>
                {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 translate-x-0.5 fill-current" />}
              </Button>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Waveform source={source} progress={duration ? time / duration : 0} />
                <div className="flex justify-between gap-2 font-mono text-xs text-muted-foreground tabular-nums">
                  <span>{fmt(time)}</span>
                  {status && <span role="status" className={cn("text-center font-sans", loadFailed && "text-destructive")}>{status}</span>}
                  <span>{fmt(duration)}</span>
                </div>
              </div>
            </div>

            <div role="group" aria-label={t.versionGroup} className="grid grid-cols-2 gap-3">
              {(["A", "B"] as Slot[]).map((k) => (
                <VersionButton
                  key={k}
                  slot={k}
                  label={active === k && playing ? t.nowPlaying : fill(t.version, { v: k })}
                  active={active === k}
                  disabled={!ready}
                  onSelect={select}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {t.hintSwitch} <KeyHint t={t} />
            </p>

            <Separator />

            <form onSubmit={submit} className="flex flex-col gap-4">
              <h2 id="question" className="font-serif text-xl font-medium text-balance sm:text-2xl">{t.question}</h2>
              <RadioGroup
                aria-labelledby="question"
                value={answer}
                onValueChange={(v) => setAnswer(v as Slot)}
                disabled={!unlocked}
                className="grid grid-cols-2 gap-3"
              >
                {(["A", "B"] as Slot[]).map((k) => (
                  <Label
                    key={k}
                    htmlFor={`ans${k}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 text-base transition-colors",
                      answer === k ? "border-primary bg-accent" : "border-border",
                      !unlocked && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <RadioGroupItem value={k} id={`ans${k}`} />
                    {fill(t.version, { v: k })}
                  </Label>
                ))}
              </RadioGroup>
              {!unlocked && (
                <p className="text-sm text-muted-foreground">
                  {fill(t.unlock, { n: min })}
                  <span className="font-mono tabular-nums"> (A {Math.min(heard.A, min).toFixed(0)}/{min} · B {Math.min(heard.B, min).toFixed(0)}/{min})</span>
                </p>
              )}
              {sendFailed && <p role="alert" className="text-sm text-destructive">{t.sendError}</p>}
              <Button type="submit" size="lg" className="self-start" disabled={!answer || phase !== "trial"}>
                {phase === "sending" ? t.sending : t.submit}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <footer className="mt-auto pt-4 text-xs text-muted-foreground">{t.about}</footer>
    </main>
  )
}
