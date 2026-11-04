import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ChoiceGroup } from "@/components/study/steps"
import { KeyHint, Waveform } from "@/components/study/shared"
import { config } from "@/config"
import { fill, type Messages } from "@/i18n"
import { Player, SLOTS, type Slot } from "@/lib/audio"
import type { TrialResult, Why } from "@/lib/submit"
import type { LoadedTrack } from "@/lib/tracks"

const fmt = (s: number) => {
  const v = Math.max(0, s)
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`
}

const zero = () => Object.fromEntries(SLOTS.map((k) => [k, 0])) as Record<Slot, number>

function RankOrder({ id, question, hint, value, onChange, disabled, clearLabel }: {
  id: string
  question: string
  hint: string
  value: Slot[]
  onChange: React.Dispatch<React.SetStateAction<Slot[]>>
  disabled: boolean
  clearLabel: string
}) {
  const pick = (k: Slot) =>
    onChange((prev) => {
      if (prev.includes(k)) return prev
      const next = [...prev, k]
      if (next.length === SLOTS.length - 1) next.push(SLOTS.find((s) => !next.includes(s))!)
      return next
    })
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend className="mb-1 font-serif text-lg leading-snug font-medium text-balance">{question}</legend>
      <p id={`${id}-hint`} className="-mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {SLOTS.map((k) => {
          const pos = value.indexOf(k)
          return (
            <button
              key={k}
              type="button"
              onClick={() => pick(k)}
              aria-pressed={pos >= 0}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-xl border-2 px-2 text-base font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                pos >= 0 ? "border-primary bg-accent" : "border-border hover:bg-accent/60",
              )}
            >
              {pos >= 0 && (
                <span className="flex size-6 items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground tabular-nums">{pos + 1}</span>
              )}
              {k}
            </button>
          )
        })}
      </div>
      {value.length > 0 && (
        <Button type="button" variant="ghost" size="sm" className="-mt-1 self-end" onClick={() => onChange([])}>
          <RotateCcw /> {clearLabel}
        </Button>
      )}
    </fieldset>
  )
}

export function Trial({ t, track, index, total, onDone }: { t: Messages; track: LoadedTrack; index: number; total: number; onDone: (r: TrialResult) => void }) {
  const player = useRef<Player | null>(null)
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState<Slot>("A")
  const [time, setTime] = useState(0)
  const [heard, setHeard] = useState(zero)
  const [loud, setLoud] = useState<Slot[]>([])
  const [clear, setClear] = useState<Slot[]>([])
  const [emo, setEmo] = useState<Slot[]>([])
  const [why, setWhy] = useState<Why | "">("")
  const [whyText, setWhyText] = useState("")

  useEffect(() => {
    const p = new Player(track.stim)
    player.current = p
    return () => {
      p.dispose()
      player.current = null
    }
  }, [track])

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
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=radio], [role=combobox], [role=menu]")) return
      const key = e.key.toUpperCase()
      if (e.code === "Space") {
        e.preventDefault()
        toggle()
      } else if ((SLOTS as readonly string[]).includes(key)) select(key as Slot)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [toggle, select])

  useEffect(() => setWhy(""), [emo[0]])

  const min = config.minSecondsPerVersion
  const unlocked = SLOTS.every((k) => heard[k] >= min)
  const top = emo[0]
  const complete = loud.length === 3 && clear.length === 3 && emo.length === 3 && why !== "" && (why !== "other" || whyText.trim() !== "")

  const finish = () => {
    const p = player.current
    if (!p || !complete) return
    p.pause()
    setPlaying(false)
    const { stim } = track
    const levels = (order: Slot[]) => order.map((k) => stim.map[k])
    onDone({
      track: track.id,
      mapping: Object.fromEntries(SLOTS.map((k) => [k, { level: stim.map[k], drive: stim.slots[k].drive }])) as TrialResult["mapping"],
      rank_loudness: levels(loud),
      rank_clarity: levels(clear),
      rank_emotion: levels(emo),
      most_emotional_why: why === "other" ? { choice: why, text: whyText.trim() } : { choice: why as Why },
      switches: p.switches,
      seconds_heard: Object.fromEntries(SLOTS.map((k) => [k, +p.heard[k].toFixed(1)])) as Record<Slot, number>,
    })
  }

  const duration = track.stim.duration

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-xs font-normal tracking-wider text-muted-foreground uppercase">{fill(t.trackOf, { i: index + 1, n: total })}</CardTitle>
        <CardDescription className="text-base">{t.trialIntro}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-4 flex flex-col gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:mx-0 sm:gap-6 sm:border-b-0 sm:bg-card sm:p-0 sm:backdrop-blur-none">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button size="icon" className="size-12 shrink-0 rounded-full sm:size-14" onClick={toggle} aria-label={playing ? t.pause : t.play}>
              {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 translate-x-0.5 fill-current" />}
            </Button>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Waveform source={track.waveform} progress={duration ? time / duration : 0} />
              <div className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
                <span>{fmt(time)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>

          <div role="group" aria-label={t.versionGroup} className="grid grid-cols-3 gap-2 sm:gap-3">
            {SLOTS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={active === k}
                onClick={() => select(k)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 bg-card px-2 py-2.5 transition-colors sm:py-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active === k ? "border-primary bg-accent" : "border-border hover:bg-accent/60",
                )}
              >
                <span className="text-3xl leading-none font-semibold tracking-tight sm:text-4xl">{k}</span>
                <span className={cn("text-xs", active === k ? "text-foreground" : "text-muted-foreground")}>
                  {active === k && playing ? t.nowPlaying : fill(t.version, { v: k })}
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t.hintSwitch} <span className="[@media(pointer:coarse)]:hidden"><KeyHint t={t} /></span>
        </p>

        <Separator />

        {!unlocked && (
          <p className="text-sm text-muted-foreground">
            {fill(t.unlock, { n: min })}
            <span className="font-mono tabular-nums"> ({SLOTS.map((k) => `${k} ${Math.min(heard[k], min).toFixed(0)}/${min}`).join(" · ")})</span>
          </p>
        )}

        <RankOrder id="loud" question={t.loudQ} hint={t.loudHint} value={loud} onChange={setLoud} disabled={!unlocked} clearLabel={t.clear} />
        <RankOrder id="clear" question={t.clearQ} hint={t.clearHint} value={clear} onChange={setClear} disabled={!unlocked} clearLabel={t.clear} />
        <RankOrder id="emo" question={t.emoQ} hint={t.emoHint} value={emo} onChange={setEmo} disabled={!unlocked} clearLabel={t.clear} />

        {top && (
          <div className="flex flex-col gap-3">
            <ChoiceGroup
              id="why"
              label={fill(t.whyQ, { v: top })}
              value={why}
              onChange={setWhy}
              columns={3}
              options={[
                { value: "harsher", label: t.whyHarsh },
                { value: "warmer", label: t.whyWarm },
                { value: "other", label: t.whyOther },
              ]}
            />
            {why === "other" && (
              <>
                <Label htmlFor="why-text" className="sr-only">{t.whyOther}</Label>
                <Textarea id="why-text" value={whyText} onChange={(e) => setWhyText(e.target.value)} placeholder={t.whyOtherPh} rows={2} />
              </>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full sm:w-auto" disabled={!complete} onClick={finish}>{index + 1 < total ? t.nextTrack : t.continue}</Button>
      </CardFooter>
    </Card>
  )
}
