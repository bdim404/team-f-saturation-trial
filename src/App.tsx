import { useEffect, useRef, useState } from "react"
import { Check, Headphones } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Toolbar } from "@/components/study/shared"
import { Background, Definitions, Genres, Welcome } from "@/components/study/steps"
import { Trial } from "@/components/study/Trial"
import { config } from "@/config"
import { initialLang, messages, saveLang, type Lang } from "@/i18n"
import { submitResponse, type StudyResponse, type TrialResult } from "@/lib/submit"
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
  const participant = useRef<Omit<StudyResponse["participant"], "genres"> | null>(null)
  const results = useRef<TrialResult[]>([])
  const consented = useRef("")
  const t = messages[lang]

  const setLang = (l: Lang) => {
    setLangState(l)
    saveLang(l)
  }
  const setTheme = (v: Theme) => {
    setThemeState(v)
    saveTheme(v)
  }
  const go = (s: Step) => {
    setStep(s)
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.title
  }, [lang, t.title])

  useEffect(() => {
    let cancelled = false
    loadTracks()
      .then((ts) => !cancelled && setTracks(ts))
      .catch(() => !cancelled && setLoadFailed(true))
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (genres: string) => {
    if (!participant.current) return
    setSending(true)
    setSendFailed(false)
    try {
      await submitResponse({
        study: config.studyId,
        language: lang,
        participant: { ...participant.current, ...(genres ? { genres } : {}) },
        trials: results.current,
        consented: consented.current,
        submitted: new Date().toISOString(),
      })
      go({ kind: "done" })
    } catch {
      setSendFailed(true)
    } finally {
      setSending(false)
    }
  }

  const total = config.tracks.length

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
      <Toolbar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} t={t} />

      <header className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Headphones className="size-4" /> {t.headphones}
        </p>
        <h1 className="font-serif text-3xl font-semibold text-balance sm:text-4xl">{t.title}</h1>
        {step.kind === "welcome" && <p className="max-w-prose text-muted-foreground">{t.welcomeLead}</p>}
      </header>

      {step.kind === "welcome" && (
        <Welcome
          t={t}
          onStart={() => {
            consented.current = new Date().toISOString()
            go({ kind: "background" })
          }}
        />
      )}

      {step.kind === "background" && (
        <Background
          t={t}
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

      {step.kind === "genres" && <Genres t={t} sending={sending} failed={sendFailed} onSubmit={submit} />}

      {step.kind === "done" && (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-xl"><Check className="size-5" /> {t.thanksTitle}</CardTitle>
            <CardDescription>{t.thanksBody}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <footer className="mt-auto pt-4 text-xs text-muted-foreground">{t.about}</footer>
    </main>
  )
}
