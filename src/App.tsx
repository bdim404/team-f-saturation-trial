import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Toolbar } from "@/components/study/shared"
import { Background, Definitions, Genres, Welcome } from "@/components/study/steps"
import { Trial } from "@/components/study/Trial"
import { Button } from "@/components/ui/button"
import { StudyAPI, deploymentOrigin, rejectedSubmissionStatus, type Notice } from "@/lib/study-api"
import { canRestartTest, newTestLabel } from "@/lib/staging"
import { Measurements, type Measure } from "@/lib/study-measurements"
import { BUNDLE_REVISION, questionIds } from "@/lib/study-bundle"
import type { Instrument } from "@/lib/study-model"
import { config } from "@/config"
import { initialLang, messages, saveLang, type Lang } from "@/i18n"
import { type StudyResponse, type TrialResult } from "@/lib/submit"
import { loadTracks, type LoadedTrack } from "@/lib/tracks"
import { saveTheme, storedTheme, type Theme } from "@/theme"

type Step = { kind: "welcome" } | { kind: "background" } | { kind: "definitions" } | { kind: "trial"; index: number } | { kind: "genres" } | { kind: "done" }

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [theme, setThemeState] = useState<Theme>(storedTheme)
  const [tracks, setTracks] = useState<LoadedTrack[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [step, setStep] = useState<Step>({ kind: "welcome" })
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const [sendRejected, setSendRejected] = useState<number | null>(null)
  const participant = useRef<Omit<StudyResponse["participant"], "genres"> | null>(null)
  const results = useRef<TrialResult[]>([])
  const [api] = useState(() => {
    const origin = import.meta.env.VITE_API_ORIGIN
    return origin ? new StudyAPI(deploymentOrigin(origin, window.location.origin, import.meta.env.DEV), sessionStorage) : null
  })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [starting, setStarting] = useState(false)
  const [entryFailed, setEntryFailed] = useState(false)
  const [receiptFailed, setReceiptFailed] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const instrument = useRef<Instrument | null>(null)
  const measurements = useRef<Measurements | null>(null)
  const currentLang = useRef(lang)
  const locked = useRef(false)
  const skipReceipt = useRef(false)
  const restartAllowed = canRestartTest(import.meta.env.VITE_ENABLE_TEST_RESTART, window.location.origin, instrument.current?.protocol.demo)
  const [measure] = useState<Measure>(() => ({
    show: ids => measurements.current?.show(ids, document.visibilityState === 'visible'),
    answer: (id, value) => { if (!locked.current) measurements.current?.answer(id, value, currentLang.current) },
  }))
  const t = messages[lang]

  const setLang = async (l: Lang) => {
    if (starting || sending || locked.current || step.kind === 'done') return
    try {
      setStarting(true)
      if (api && instrument.current) await api.language(l)
      currentLang.current = l; setLangState(l); saveLang(l)
      if (api && instrument.current) instrument.current = await api.protocol()
    } catch { setEntryFailed(true) }
    finally { setStarting(false) }
  }
  const setTheme = (v: Theme) => {
    setThemeState(v)
    saveTheme(v)
  }
  const go = (s: Step) => {
    measure.show([])
    setStep(s)
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.title
  }, [lang, t.title])

  useEffect(() => {
    let cancelled = false
    if (!api) {
      if (!import.meta.env.DEV) { setEntryFailed(true); return }
      loadTracks().then(ts => !cancelled && setTracks(ts)).catch(() => !cancelled && setLoadFailed(true))
    }
    return () => { cancelled = true }
  }, [api])

  useEffect(() => {
    if (!api || step.kind !== 'welcome') return
    let cancelled = false
    setNotice(null); setEntryFailed(false)
    const release = import.meta.env.VITE_STUDY_RELEASE
    if (!release) { setEntryFailed(true); return }
    const prepare = async () => {
      const saved = skipReceipt.current ? null : await api.restoreReceipt(release)
      if (cancelled) return
      if (saved) {
        if (!Object.prototype.hasOwnProperty.call(messages, saved.language)) throw new Error('Unsupported receipt language.')
        instrument.current = saved; locked.current = true
        currentLang.current = saved.language as Lang
        setLangState(saved.language as Lang); setStep({ kind: 'done' })
        return
      }
      const value = await api.notice(lang, release)
      if (!value.synthetic_only || value.turnstile) throw new Error('Unsupported collection configuration.')
      if (!cancelled) setNotice(value)
    }
    prepare().catch(() => !cancelled && setEntryFailed(true))
    return () => { cancelled = true }
  }, [api, lang, step.kind])

  useEffect(() => {
    const visibility = () => measurements.current?.visibility(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])

  const restartTest = () => {
    if (!restartAllowed || step.kind !== 'done' || starting || sending) return
    // Do not delete the previous submission or discard its receipt key.
    // A fresh server attempt is created only after consent and Start.
    skipReceipt.current = true
    participant.current = null; results.current = []
    measurements.current = null; instrument.current = null; locked.current = false
    setTracks(null); setNotice(null); setDeleted(false)
    setLoadFailed(false); setSendFailed(false); setSendRejected(null); setReceiptFailed(false); setEntryFailed(false)
    go({ kind: 'welcome' })
  }

  const start = async () => {
    if (starting || (api && (!notice || notice.language !== lang))) return
    setStarting(true); setEntryFailed(false)
    try {
      if (api && notice) {
        await api.start(notice, '')
        const value = await api.protocol()
        if (value.protocol.study_revision !== BUNDLE_REVISION || config.tracks.length !== 1 || value.protocol.bundled_frontend?.track !== config.tracks[0].id || value.protocol.audio.mode !== 'synthetic' || value.protocol.minSecondsPerVersion !== config.minSecondsPerVersion || JSON.stringify(value.protocol.questions.map(q => q.id)) !== JSON.stringify(questionIds)) throw new Error('Questionnaire release mismatch.')
        instrument.current = value
        measurements.current = new Measurements(questionIds)
        setTracks(await loadTracks(value.mapping))
      }
      skipReceipt.current = false
      go({ kind: 'background' })
    } catch { setEntryFailed(true) }
    finally { setStarting(false) }
  }

  const submit = async (_genres: string, _other: string) => {
    if (sending || sendRejected) return
    setSending(true); setSendFailed(false)
    try {
      const release = instrument.current, data = measurements.current, trial = results.current[0]
      if (!api || !release || !data || !trial) throw new Error('Collection is not configured.')
      if (!locked.current) await api.language(currentLang.current)
      locked.current = true
      await api.submit({ schema_version: 2, release: release.protocol.release, language: currentLang.current,
        ...data.snapshot(), mapping: release.mapping, seconds_heard: trial.seconds_heard,
        switches: trial.switches, submitted: new Date().toISOString() })
      go({ kind: 'done' })
      data.clear(); participant.current = null; results.current = []; setTracks(null)
    } catch (error) { setSendRejected(rejectedSubmissionStatus(error)); setSendFailed(true) }
    finally { setSending(false) }
  }

  const download = async (format: 'json' | 'csv') => {
    if (!api) return
    setReceiptFailed(false)
    try {
      const url = URL.createObjectURL(await api.receipt(format))
      const link = document.createElement('a'); link.href = url; link.download = `study-receipt.${format}`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setReceiptFailed(true) }
  }
  const withdraw = async () => {
    const copy = instrument.current?.presentation.deletion
    if (!api || !copy || !window.confirm(copy.body)) return
    try { await api.withdraw(); setDeleted(true); setReceiptFailed(false) }
    catch { setReceiptFailed(true) }
  }

  const total = config.tracks.length

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-5 pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:gap-6 sm:py-8">
      <Toolbar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} t={t} />

      {step.kind !== "trial" && (
        <header className="flex flex-col gap-3">
          <h1 className="font-serif text-3xl font-semibold text-balance sm:text-4xl">{t.title}</h1>
          {step.kind === "welcome" && <p className="max-w-prose text-muted-foreground">{t.welcomeLead}</p>}
        </header>
      )}
      {entryFailed && step.kind !== "welcome" && <p role="alert" className="text-sm text-destructive">{t.entryError}</p>}

      {step.kind === "welcome" && (
        <Welcome
          t={t}
          notice={notice}
          busy={starting}
          failed={entryFailed}
          ready={(!api && import.meta.env.DEV) || !!notice}
          onStart={start}
        />
      )}

      {step.kind === "background" && (
        <Background
          t={t}
          measure={measure}
          onDone={(p) => {
            participant.current = p
            go({ kind: "definitions" })
          }}
        />
      )}

      {step.kind === "definitions" && <Definitions t={t} onDone={() => go({ kind: "trial", index: 0 })} />}

      {step.kind === "trial" &&
        (tracks ? (
          <Trial
            key={step.index}
            t={t}
            track={tracks[step.index]}
            measure={measure}
            index={step.index}
            total={total}
            onDone={(r) => {
              results.current = [...results.current.slice(0, step.index), r]
              go(step.index + 1 < total ? { kind: "trial", index: step.index + 1 } : { kind: "genres" })
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardDescription role="status" className={loadFailed ? "text-destructive" : undefined}>{loadFailed ? t.loadError : t.loading}</CardDescription>
            </CardHeader>
          </Card>
        ))}

      {step.kind === "genres" && <Genres t={t} sending={sending} failed={sendFailed} onSubmit={submit} measure={measure} locked={locked.current} rejectedStatus={sendRejected} onReload={() => window.location.reload()} />}

      {step.kind === "done" && (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-xl"><Check className="size-5" /> {t.thanksTitle}</CardTitle>
            <CardDescription>{deleted ? instrument.current?.presentation.status[2] : t.thanksBody}</CardDescription>
          </CardHeader>
          {api && (!deleted || restartAllowed) && <CardContent className="flex flex-wrap gap-3">
            {!deleted && <>
            <Button variant="outline" onClick={() => download('json')}>{instrument.current?.presentation.receipt[2]}</Button>
            <Button variant="outline" onClick={() => download('csv')}>{instrument.current?.presentation.receipt[3]}</Button>
            <Button variant="outline" onClick={withdraw}>{instrument.current?.presentation.deletion.confirm}</Button>
            </>}
            {restartAllowed && <Button variant="outline" onClick={restartTest}>{newTestLabel[lang]}</Button>}
            {receiptFailed && <p role="alert" className="text-sm text-destructive">{t.sendError}</p>}
          </CardContent>}
        </Card>
      )}

      <footer className="mt-auto pt-4 text-xs text-muted-foreground">{t.about}</footer>
    </main>
  )
}
