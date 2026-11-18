import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Pause, Play } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ChoiceGroup } from "@/components/study/steps"
import { KeyHint, TermInfo, Waveform } from "@/components/study/shared"
import { config } from "@/config"
import { fill, type Messages } from "@/i18n"
import { Player, SLOTS, type Slot } from "@/lib/audio"
import type { TrialResult, Why } from "@/lib/submit"
import type { Measure } from "@/lib/study-measurements"
import type { LoadedTrack } from "@/lib/tracks"

const fmt = (s: number) => {
  const v = Math.max(0, s)
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`
}

const zero = () => Object.fromEntries(SLOTS.map((k) => [k, 0])) as Record<Slot, number>

const SCALE = [0, 1, 2, 3, 4, 5] as const

type Ratings = Record<Slot, number | null>

const emptyRatings = (): Ratings => ({ A: null, B: null, C: null })

const allRated = (r: Ratings) => SLOTS.every((k) => r[k] !== null)

function RatingGroup({ id, question, hint, value, onChange, disabled, t }: {
  id: string
  question: React.ReactNode
  hint: string
  value: Ratings
  onChange: React.Dispatch<React.SetStateAction<Ratings>>
  disabled: boolean
  t: Messages
}) {
  return (
    <div role="group" aria-labelledby={`${id}-q`} className="flex flex-col gap-4">
      <h3 id={`${id}-q`} className="font-serif text-lg leading-snug font-medium text-balance">{question}</h3>
      <p className="-mt-2 text-sm text-muted-foreground">{hint}</p>
      {SLOTS.map((k) => (
        <div key={k} className="flex flex-col gap-2">
          <p id={`${id}-${k}`} className="text-sm font-medium">{fill(t.version, { v: k })}</p>
          <RadioGroupPrimitive.Root
            value={value[k] === null ? undefined : String(value[k])}
            onValueChange={(v) => onChange((prev) => ({ ...prev, [k]: Number(v) }))}
            disabled={disabled}
            aria-labelledby={`${id}-${k}`}
            className={cn("flex gap-1 rounded-2xl bg-muted p-1 transition-opacity", disabled && "opacity-50")}
          >
            {SCALE.map((n) => (
              <RadioGroupPrimitive.Item
                key={n}
                value={String(n)}
                disabled={disabled}
                className="h-11 flex-1 rounded-xl font-mono text-sm tabular-nums text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed data-[state=unchecked]:hover:bg-foreground/10 data-[state=unchecked]:hover:text-foreground data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:shadow-sm"
              >
                {n}
              </RadioGroupPrimitive.Item>
            ))}
          </RadioGroupPrimitive.Root>
        </div>
      ))}
    </div>
  )
}

export function Trial({ t, track, index, total, onDone, measure }: { t: Messages; track: LoadedTrack; index: number; total: number; onDone: (r: TrialResult) => void; measure?: Measure }) {
  const player = useRef<Player | null>(null)
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState<Slot>("A")
  const [time, setTime] = useState(0)
  const [heard, setHeard] = useState(zero)
  const [page, setPage] = useState(0)
  const [loud, setLoud] = useState<Ratings>(emptyRatings)
  const [clarity, setClarity] = useState<Ratings>(emptyRatings)
  const [emotion, setEmotion] = useState<Ratings>(emptyRatings)
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
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=combobox], [role=menu]")) return
      if (e.code === "Space") {
        e.preventDefault()
        toggle()
      } else {
        const key = e.key.toUpperCase()
        if ((SLOTS as readonly string[]).includes(key)) select(key as Slot)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [toggle, select])

  useEffect(() => {
    const pauseHidden = () => {
      if (document.visibilityState !== 'visible') {
        const p = player.current
        p?.pause(); setPlaying(false)
        if (p) { setTime(p.time()); setHeard({ ...p.heard }) }
      }
    }
    document.addEventListener('visibilitychange', pauseHidden)
    return () => document.removeEventListener('visibilitychange', pauseHidden)
  }, [])

  const min = config.minSecondsPerVersion
  const unlocked = SLOTS.every((k) => heard[k] > min)

  const emotionRated = allRated(emotion)
  const values = SLOTS.map((k) => emotion[k] ?? 0)
  const peak = Math.max(...values)
  const floor = Math.min(...values)
  const most = SLOTS.filter((k) => emotion[k] === peak)
  const least = SLOTS.filter((k) => emotion[k] === floor)
  const target: { kind: "most" | "least"; slot: Slot } | null = !emotionRated
    ? null
    : most.length === 1
      ? { kind: "most", slot: most[0] }
      : least.length === 1
        ? { kind: "least", slot: least[0] }
        : null

  useEffect(() => {
    setWhy("")
    setWhyText("")
    measure?.answer("why", undefined)
    measure?.answer("why_other", undefined)
  }, [target?.kind, target?.slot])

  useEffect(() => {
    const dimension = ['loudness','clarity','emotion'][page]
    measure?.show(page < 3 ? SLOTS.map(s => `${dimension}_${s}`) : target ? ['why', ...(why === 'other' ? ['why_other'] : [])] : [])
    for (const [d, ratings] of Object.entries({ loudness: loud, clarity, emotion })) {
      for (const slot of SLOTS) measure?.answer(`${d}_${slot}`, ratings[slot] === null ? undefined : String(ratings[slot]))
    }
    measure?.answer('why', target && why ? why : undefined)
    measure?.answer('why_other', target && why === 'other' && whyText.trim() ? whyText.trim() : undefined)
  }, [page, unlocked, loud, clarity, emotion, target?.kind, target?.slot, why, whyText, measure])

  const ratedSteps = [allRated(loud), allRated(clarity), allRated(emotion)]
  const whyAnswered = !target || (why !== "" && (why !== "other" || whyText.trim() !== ""))
  const lastPage = target ? 3 : 2
  const pageDone = unlocked && (page === 0 ? ratedSteps[0] : page === 1 ? ratedSteps[1] : page === 2 ? ratedSteps[2] : whyAnswered)
  const complete = unlocked && ratedSteps[0] && ratedSteps[1] && ratedSteps[2] && whyAnswered
  const steps = [
    { label: t.loudnessTerm, done: ratedSteps[0] },
    { label: t.clarityTerm, done: ratedSteps[1] },
    { label: t.emotionTerm, done: ratedSteps[2] },
    ...(target ? [{ label: t.whyStep, done: whyAnswered }] : []),
  ]

  useEffect(() => {
    if (page === 3 && !target) setPage(2)
  }, [page, target])

  const finish = () => {
    const p = player.current
    if (!p || !complete) return
    p.pause()
    setPlaying(false)
    const { stim } = track
    const records = (r: Ratings) => Object.fromEntries(SLOTS.map((k) => [k, r[k] as number])) as Record<Slot, number>
    onDone({
      track: track.id,
      mapping: Object.fromEntries(SLOTS.map((k) => [k, { level: stim.map[k], drive: stim.slots[k].drive }])) as TrialResult["mapping"],
      ratings: { loudness: records(loud), clarity: records(clarity), emotion: records(emotion) },
      ...(target ? { why: { kind: target.kind, version: target.slot, choice: why as Why, ...(why === "other" ? { text: whyText.trim() } : {}) } } : {}),
      switches: p.switches,
      seconds_heard: Object.fromEntries(SLOTS.map((k) => [k, p.heard[k]])) as Record<Slot, number>,
    })
  }

  const goTo = (i: number) => {
    if (i === 3 ? !target : !ratedSteps[i]) return
    setPage(i)
    window.scrollTo({ top: 0 })
  }

  const next = () => {
    if (page < lastPage) {
      setPage(page + 1)
      window.scrollTo({ top: 0 })
    } else {
      finish()
    }
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
                <span aria-hidden className="text-[10px] leading-tight text-muted-foreground">
                  {fill(t.listenedFor, { s: Math.min(heard[k], min).toFixed(0), n: min })}
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t.hintSwitch} <span className="[@media(pointer:coarse)]:hidden"><KeyHint t={t} /></span>
        </p>

        <Separator />

        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map(({ label, done }, i) => {
            const current = i === page
            const className = cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-medium transition-colors",
              current ? "bg-primary text-primary-foreground" : done ? "text-foreground" : "text-muted-foreground",
            )
            return done && !current ? (
              <button key={label} type="button" onClick={() => goTo(i)} className={cn(className, "hover:bg-muted")}>
                <Check className="size-3" />
                {label}
              </button>
            ) : (
              <span key={label} className={className} aria-current={current ? "step" : undefined}>
                <span className="font-mono tabular-nums">{i + 1}</span>
                {label}
              </span>
            )
          })}
        </div>

        {!unlocked && <p className="text-sm text-muted-foreground">{fill(t.unlock, { n: min })}</p>}

        <div key={page} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
        {page === 0 && (
          <RatingGroup
            id="loud"
            t={t}
            question={<>{t.loudQ} <TermInfo term={t.loudnessTerm} definition={t.loudnessDef} label={fill(t.termInfo, { term: t.loudnessTerm })} /></>}
            hint={t.scaleHint}
            value={loud}
            onChange={setLoud}
            disabled={!unlocked}
          />
        )}

        {page === 1 && (
          <RatingGroup
            id="clarity"
            t={t}
            question={<>{t.clearQ} <TermInfo term={t.clarityTerm} definition={t.clarityDef} label={fill(t.termInfo, { term: t.clarityTerm })} /></>}
            hint={t.scaleHint}
            value={clarity}
            onChange={setClarity}
            disabled={!unlocked}
          />
        )}

        {page === 2 && (
          <>
            <RatingGroup
              id="emotion"
              t={t}
              question={<>{t.emoQ} <TermInfo term={t.emotionTerm} definition={t.emotionDef} label={fill(t.termInfo, { term: t.emotionTerm })} /></>}
              hint={t.scaleHint}
              value={emotion}
              onChange={setEmotion}
              disabled={!unlocked}
            />
          </>
        )}

        {page === 3 && target && (
          <div className="flex flex-col gap-4">
            <h3 id="why-q" className="font-serif text-lg leading-snug font-medium text-balance">
              {fill(target.kind === "most" ? t.whyMostQ : t.whyLeastQ, { v: target.slot })}
            </h3>
            <ChoiceGroup
              id="why"
              labelledBy="why-q"
              value={why}
              onChange={setWhy}
              columns={2}
              options={[
                { value: "harsher", label: t.whyHarsher },
                { value: "softer", label: t.whySofter },
                { value: "moreDynamic", label: t.whyMoreDynamic },
                { value: "lessDynamic", label: t.whyLessDynamic },
                { value: "memories", label: t.whyMemories },
                { value: "felt", label: t.whyFelt },
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
        </div>
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full sm:w-auto" disabled={!pageDone} onClick={next}>
          {page < lastPage ? t.nextQuestion : index + 1 < total ? t.nextTrack : t.continue}
        </Button>
      </CardFooter>
    </Card>
  )
}
