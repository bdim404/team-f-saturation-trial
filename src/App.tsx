import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Copy, Headphones, Pause, Play, RotateCcw, Upload } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { buildStimuli, decodeFile, peakOf, Player, synthLoop, TARGET_LUFS, type Level, type Slot, type Stimuli } from "@/lib/audio"

const QUESTION = "Which version made you feel a more intense emotion?"
const MIN_SECONDS = 3

const fmt = (s: number) => {
  const v = Math.max(0, s)
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-b-2 bg-muted px-1.5 font-mono text-[11px] text-foreground">{children}</kbd>
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
    const pk = peakOf(source) || 1
    const out: number[] = []
    for (let b = 0; b < n; b++) {
      let m = 0
      for (let i = b * step; i < (b + 1) * step; i += 8) m = Math.max(m, Math.abs(d[i]))
      out.push(m / pk)
    }
    bars.current = out
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
    if (!g) return
    g.scale(dpr, dpr)
    const cs = getComputedStyle(cv)
    const on = cs.getPropertyValue("--wave-on")
    const off = cs.getPropertyValue("--wave-off")
    const n = bars.current.length
    if (!n) return
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

interface TrialRecord {
  trial: string
  question: string
  stimulus: string
  answer: Slot
  answer_is: string
  mapping: Record<Slot, { level: Level; drive: number }>
  switches: number
  seconds_heard: Record<Slot, number>
  started: string
  submitted: string
}

export default function App() {
  const [source, setSource] = useState<AudioBuffer | null>(null)
  const [sourceName, setSourceName] = useState("synth-pop-loop")
  const [drives, setDrives] = useState({ less: 0, more: 4 })
  const [stim, setStim] = useState<Stimuli | null>(null)
  const [status, setStatus] = useState("Preparing audio…")
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState<Slot>("A")
  const [time, setTime] = useState(0)
  const [heard, setHeard] = useState<Record<Slot, number>>({ A: 0, B: 0 })
  const [answer, setAnswer] = useState<Slot | "">("")
  const [record, setRecord] = useState<TrialRecord | null>(null)
  const [copied, setCopied] = useState(false)
  const player = useRef<Player | null>(null)
  const started = useRef(new Date().toISOString())
  const fileInput = useRef<HTMLInputElement>(null)

  const rebuild = useCallback(async (src: AudioBuffer, less: number, more: number) => {
    setStatus("Preparing audio…")
    player.current?.dispose()
    player.current = null
    setStim(null)
    const s = await buildStimuli(src, less, more)
    player.current = new Player(s)
    started.current = new Date().toISOString()
    setStim(s)
    setPlaying(false)
    setActive("A")
    setTime(0)
    setHeard({ A: 0, B: 0 })
    setAnswer("")
    setRecord(null)
    setCopied(false)
    setStatus("Ready")
  }, [])

  useEffect(() => {
    synthLoop()
      .then((b) => {
        setSource(b)
        return rebuild(b, 0, 4)
      })
      .catch(() => setStatus("This browser could not build the audio."))
    return () => player.current?.dispose()
  }, [rebuild])

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
      setStatus("Paused")
    } else {
      p.play()
      setPlaying(true)
      setStatus(`Playing ${p.active}`)
    }
  }, [])

  const select = useCallback((k: Slot) => {
    const p = player.current
    if (!p) return
    p.select(k)
    setActive(k)
    setHeard({ ...p.heard })
    if (p.playing) setStatus(`Playing ${k}`)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!stim || record) return
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=slider]")) return
      if (e.code === "Space") {
        e.preventDefault()
        toggle()
      } else if (e.key.toLowerCase() === "a") select("A")
      else if (e.key.toLowerCase() === "b") select("B")
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [stim, record, toggle, select])

  const unlocked = heard.A >= MIN_SECONDS && heard.B >= MIN_SECONDS

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const p = player.current
    if (!answer || !stim || !p) return
    p.pause()
    setPlaying(false)
    setRecord({
      trial: "saturation-felt-intensity-01",
      question: QUESTION,
      stimulus: sourceName,
      answer,
      answer_is: `${stim.map[answer]} saturated`,
      mapping: {
        A: { level: stim.map.A, drive: stim.slots.A.drive },
        B: { level: stim.map.B, drive: stim.slots.B.drive },
      },
      switches: p.switches,
      seconds_heard: { A: +p.heard.A.toFixed(1), B: +p.heard.B.toFixed(1) },
      started: started.current,
      submitted: new Date().toISOString(),
    })
    setStatus("Done")
  }

  const copy = () => {
    if (!record) return
    navigator.clipboard?.writeText(JSON.stringify(record, null, 2)).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setStatus("Decoding file…")
    try {
      const b = await decodeFile(f)
      setSource(b)
      setSourceName(f.name)
      await rebuild(b, drives.less, drives.more)
    } catch {
      setStatus("Could not read that file. Try a WAV or MP3.")
    }
  }

  const ready = !!stim
  const duration = stim?.duration ?? 0

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <Badge variant="outline" className="gap-1.5 font-mono text-[11px] tracking-wider uppercase">
          <Headphones /> MPC · Team F · Example trial
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Listen to both versions</h1>
        <p className="max-w-prose text-muted-foreground">
          You will hear the same piece of music in two versions, A and B. Switch between them as often as you like while it plays, then answer one question.
        </p>
      </header>

      {!record ? (
        <Card>
          <CardHeader>
            <CardTitle>Listening trial</CardTitle>
            <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
              <span><span className="font-mono text-foreground">1</span> Press play</span>
              <span><span className="font-mono text-foreground">2</span> Switch A / B</span>
              <span><span className="font-mono text-foreground">3</span> Answer</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Button size="icon" className="size-14 shrink-0 rounded-full" disabled={!ready} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 translate-x-0.5 fill-current" />}
              </Button>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Waveform source={source} progress={duration ? time / duration : 0} />
                <div className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
                  <span>{fmt(time)}</span>
                  <span>{status}</span>
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
              <h2 id="question" className="text-xl font-medium tracking-tight text-balance">{QUESTION}</h2>
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
                  Listen to both versions for at least {MIN_SECONDS} seconds each to unlock the answer
                  <span className="font-mono tabular-nums"> (A {Math.min(heard.A, MIN_SECONDS).toFixed(0)}/{MIN_SECONDS} s · B {Math.min(heard.B, MIN_SECONDS).toFixed(0)}/{MIN_SECONDS} s)</span>.
                </p>
              )}
              <Button type="submit" size="lg" className="self-start" disabled={!answer}>
                Submit answer
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Check className="size-5" /> Thanks, your answer is saved</CardTitle>
            <CardDescription>This is a demo, so nothing leaves this page. A real survey would send the record below to our server.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed">{JSON.stringify(record, null, 2)}</pre>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copy}><Copy /> {copied ? "Copied" : "Copy record"}</Button>
            <Button variant="outline" onClick={() => source && rebuild(source, drives.less, drives.more)}><RotateCcw /> Run another trial</Button>
          </CardFooter>
        </Card>
      )}

      <Collapsible asChild>
        <Card className="gap-0 py-0">
          <CollapsibleTrigger className="group flex w-full items-center justify-between px-6 py-5 text-left font-medium">
            For the team: stimuli and settings
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="flex flex-col gap-6 pb-6">
              <p className="text-sm text-muted-foreground">
                Saturation is a soft-clip curve <span className="font-mono text-foreground">y = tanh(d·x) / tanh(d)</span> applied to the peak-normalised mix; d = 0 means no saturation. Both versions are set to {TARGET_LUFS} LUFS (K-weighted, ITU-R BS.1770 filters, no gating), and which one is A or B is randomised per trial. The default sound is a synthesised pop loop so the demo works offline; load an unmastered mix to try real material.
              </p>

              {(["less", "more"] as Level[]).map((lv) => (
                <div key={lv} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`drive-${lv}`}>{lv === "less" ? "Less saturated" : "More saturated"}</Label>
                    <span className="font-mono text-sm text-muted-foreground tabular-nums">d = {drives[lv].toFixed(1)}</span>
                  </div>
                  <Slider id={`drive-${lv}`} min={0} max={10} step={0.5} value={[drives[lv]]} onValueChange={([v]) => setDrives((d) => ({ ...d, [lv]: v }))} />
                </div>
              ))}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead className="text-right">Drive d</TableHead>
                      <TableHead className="text-right">Loudness</TableHead>
                      <TableHead className="text-right">Crest factor</TableHead>
                      <TableHead className="text-right">Peak</TableHead>
                      <TableHead className="text-right">Shown as</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="font-mono tabular-nums">
                    {stim ? (
                      (["less", "more"] as Level[]).map((lv) => {
                        const v = stim.levels[lv]
                        return (
                          <TableRow key={lv}>
                            <TableCell className="font-sans">{lv === "less" ? "Less saturated" : "More saturated"}</TableCell>
                            <TableCell className="text-right">{v.drive.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{v.lufs.toFixed(1)} LUFS</TableCell>
                            <TableCell className="text-right">{v.crest.toFixed(1)} dB</TableCell>
                            <TableCell className="text-right">{v.peak.toFixed(1)} dBFS</TableCell>
                            <TableCell className="text-right"><Badge variant="secondary">{stim.map.A === lv ? "A" : "B"}</Badge></TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow><TableCell colSpan={6} className="font-sans text-muted-foreground">Preparing…</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => source && rebuild(source, drives.less, drives.more)} disabled={!source}>Rebuild stimuli</Button>
                <Button variant="outline" onClick={() => fileInput.current?.click()}><Upload /> Use your own mix</Button>
                <input ref={fileInput} type="file" accept="audio/*" className="hidden" onChange={onFile} />
                <span className="font-mono text-xs text-muted-foreground">
                  Source: {sourceName === "synth-pop-loop" ? "synthesised pop loop (8 bars, 112 BPM)" : sourceName}
                </span>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </main>
  )
}
