import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Headphones, Pause, Play } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { config } from "@/config"
import { buildStimuli, loadStimulus, Player, synthLoop, type Slot, type Stimuli } from "@/lib/audio"
import { submitResponse } from "@/lib/submit"

const fmt = (s: number) => {
  const v = Math.max(0, s)
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-b-2 bg-muted px-1.5 font-mono text-[11px] text-foreground">{children}</kbd>
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
  }, [progress, source])

  return <canvas ref={ref} aria-hidden className="h-12 w-full [--wave-off:var(--border)] [--wave-on:var(--primary)]" />
}

function VersionButton({ slot, active, playing, disabled, onSelect }: { slot: Slot; active: boolean; playing: boolean; disabled: boolean; onSelect: (s: Slot) => void }) {
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
      <span className={cn("text-xs", active ? "text-foreground" : "text-muted-foreground")}>
        {active && playing ? "Now playing" : `Version ${slot}`}
      </span>
    </button>
  )
}

type Phase = "loading" | "error" | "trial" | "sending" | "done"

export default function App() {
  const [source, setSource] = useState<AudioBuffer | null>(null)
  const [stim, setStim] = useState<Stimuli | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  const [error, setError] = useState("")
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState<Slot>("A")
  const [time, setTime] = useState(0)
  const [heard, setHeard] = useState<Record<Slot, number>>({ A: 0, B: 0 })
  const [answer, setAnswer] = useState<Slot | "">("")
  const player = useRef<Player | null>(null)
  const started = useRef(new Date().toISOString())

  useEffect(() => {
    let cancelled = false
    const load = config.stimulusUrl ? loadStimulus(config.stimulusUrl) : synthLoop()
    load
      .then(async (b) => {
        const s = await buildStimuli(b, config.drive.less, config.drive.more)
        if (cancelled) return
        player.current?.dispose()
        player.current = new Player(s)
        started.current = new Date().toISOString()
        setSource(b)
        setStim(s)
        setPhase("trial")
      })
      .catch(() => {
        if (cancelled) return
        setError("The audio could not be loaded. Please reload the page.")
        setPhase("error")
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

  useEffect(() => {
    if (phase !== "trial") return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=radio]")) return
      if (e.code === "Space") {
        e.preventDefault()
        toggle()
      } else if (e.key.toLowerCase() === "a") select("A")
      else if (e.key.toLowerCase() === "b") select("B")
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [phase, toggle, select])

  const min = config.minSecondsPerVersion
  const unlocked = heard.A >= min && heard.B >= min

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = player.current
    if (!answer || !stim || !p) return
    p.pause()
    setPlaying(false)
    setPhase("sending")
    try {
      await submitResponse({
        trial: config.trialId,
        stimulus: config.stimulusUrl ?? "synth-pop-loop",
        answer,
        answer_level: stim.map[answer],
        mapping: {
          A: { level: stim.map.A, drive: stim.slots.A.drive },
          B: { level: stim.map.B, drive: stim.slots.B.drive },
        },
        switches: p.switches,
        seconds_heard: { A: +p.heard.A.toFixed(1), B: +p.heard.B.toFixed(1) },
        started: started.current,
        submitted: new Date().toISOString(),
      })
      setPhase("done")
    } catch {
      setError("Your answer could not be sent. Please check your connection and try again.")
      setPhase("trial")
    }
  }

  const ready = phase === "trial"
  const duration = stim?.duration ?? 0

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Headphones className="size-4" /> Please use headphones
        </p>
        <h1 className="font-serif text-3xl font-semibold text-balance sm:text-4xl">Listening study</h1>
        <p className="max-w-prose text-muted-foreground">
          You will hear the same piece of music in two versions, A and B. Switch between them as often as you like while it plays, then answer one question.
        </p>
      </header>

      {phase === "done" ? (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-xl"><Check className="size-5" /> Thank you</CardTitle>
            <CardDescription>Your answer has been recorded. You can close this page now.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Button size="icon" className="size-14 shrink-0 rounded-full" disabled={!ready} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 translate-x-0.5 fill-current" />}
              </Button>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Waveform source={source} progress={duration ? time / duration : 0} />
                <div className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
                  <span>{fmt(time)}</span>
                  {phase === "loading" && <span>Loading audio…</span>}
                  <span>{fmt(duration)}</span>
                </div>
              </div>
            </div>

            <div role="group" aria-label="Version" className="grid grid-cols-2 gap-3">
              <VersionButton slot="A" active={active === "A"} playing={playing} disabled={!ready} onSelect={select} />
              <VersionButton slot="B" active={active === "B"} playing={playing} disabled={!ready} onSelect={select} />
            </div>
            <p className="text-sm text-muted-foreground">
              The music keeps playing from the same point when you switch. Keys: <Kbd>Space</Kbd> play / pause, <Kbd>A</Kbd> and <Kbd>B</Kbd> switch.
            </p>

            <Separator />

            <form onSubmit={submit} className="flex flex-col gap-4">
              <h2 id="question" className="font-serif text-xl font-medium text-balance sm:text-2xl">{config.question}</h2>
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
                    Version {k}
                  </Label>
                ))}
              </RadioGroup>
              {!unlocked && (
                <p className="text-sm text-muted-foreground">
                  Listen to each version for at least {min} seconds to answer
                  <span className="font-mono tabular-nums"> (A {Math.min(heard.A, min).toFixed(0)}/{min} s · B {Math.min(heard.B, min).toFixed(0)}/{min} s)</span>.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="self-start" disabled={!answer || phase !== "trial"}>
                {phase === "sending" ? "Sending…" : "Submit answer"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
