import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Section } from "@/components/study/shared"
import type { Measure } from "@/lib/study-measurements"
import type { Notice } from "@/lib/study-api"
import type { Messages } from "@/i18n"
import type { StudyResponse } from "@/lib/submit"

export function ChoiceGroup<T extends string>({ id, label, labelledBy, value, options, onChange, columns = 2, disabled }: {
  id: string
  label?: string
  labelledBy?: string
  value: T | ""
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  columns?: 1 | 2 | 3
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {label && <p id={`${id}-label`} className="font-medium">{label}</p>}
      <RadioGroup
        aria-labelledby={labelledBy ?? (label ? `${id}-label` : undefined)}
        value={value}
        onValueChange={(v) => onChange(v as T)}
        disabled={disabled}
        className={cn("grid gap-3", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}
      >
        {options.map((o) => (
          <Label
            key={o.value}
            htmlFor={`${id}-${o.value}`}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 text-base leading-snug font-normal transition-colors",
              value === o.value ? "border-primary bg-accent" : "border-border",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <RadioGroupItem value={o.value} id={`${id}-${o.value}`} />
            {o.label}
          </Label>
        ))}
      </RadioGroup>
    </div>
  )
}

export function CheckGroup<T extends string>({ id, label, value, options, onChange, columns = 2, chips = false }: {
  id: string
  label: string
  value: T[]
  options: { value: T; label: string }[]
  onChange: (v: T[]) => void
  columns?: 1 | 2
  chips?: boolean
}) {
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-label`} className="font-medium">{label}</p>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className={cn(chips ? "flex flex-wrap gap-2" : "grid gap-3", !chips && (columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"))}
      >
        {options.map((o) => {
          const active = value.includes(o.value)
          return (
            <Label
              key={o.value}
              htmlFor={`${id}-${o.value}`}
              className={cn(
                chips
                  ? "flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-sm leading-snug font-normal transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                  : "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 text-base leading-snug font-normal transition-colors",
                active
                  ? chips
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary bg-accent"
                  : chips
                    ? "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    : "border-border",
              )}
            >
              <Checkbox
                id={`${id}-${o.value}`}
                checked={active}
                onCheckedChange={() => toggle(o.value)}
                className={chips ? "sr-only" : undefined}
              />
              {chips && active && <Check className="size-3.5" />}
              {o.label}
            </Label>
          )
        })}
      </div>
    </div>
  )
}

export function Welcome({ t, onStart, notice, busy, failed, ready = true }: { t: Messages; onStart: () => void; notice?: Notice | null; busy?: boolean; failed?: boolean; ready?: boolean }) {
  const [agreed, setAgreed] = useState(false)
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <Section title={t.whatTitle}>
          <p className="text-muted-foreground">{t.what}</p>
        </Section>
        <Section title={t.prepTitle}>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground marker:text-border">
            <li><strong className="font-semibold text-foreground">{t.prep1.lead}</strong>{t.prep1.rest}</li>
            <li>{t.prep2}</li>
            <li>{t.prep3}</li>
          </ul>
        </Section>
        <Section title={t.privacyTitle}>
          <p className="text-muted-foreground">{t.privacy}{notice && " " + notice.notice.paragraphs.join(" ")}</p>
        </Section>
        {failed && <p role="alert" className="text-sm text-destructive">{t.sendError}</p>}
        <Separator />
        <Label htmlFor="consent" className="flex cursor-pointer items-start gap-3 text-base leading-snug font-normal">
          <Checkbox id="consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
          {t.consent}{notice && " " + notice.notice.acknowledgement}
        </Label>
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full sm:w-auto" disabled={!agreed || busy || !ready} onClick={onStart}>{busy ? t.loading : t.start}</Button>
      </CardFooter>
    </Card>
  )
}

type Participant = StudyResponse["participant"]

type MusicBackground = "instrument" | "singing" | "production" | "musicStudies" | "other"

const MUSIC_BACKGROUND_ORDER: MusicBackground[] = ["instrument", "singing", "production", "musicStudies", "other"]

export function Background({ t, onDone, measure }: { t: Messages; onDone: (p: Omit<Participant, "genres">) => void; measure?: Measure }) {
  const [music, setMusic] = useState<"yes" | "no" | "">("")
  const [musicTypes, setMusicTypes] = useState<MusicBackground[]>([])
  const [musicTypeOther, setMusicTypeOther] = useState("")
  const [phones, setPhones] = useState<Participant["headphones"] | "">("")
  useEffect(() => {
    measure?.show(['music_background','headphones', ...(music === 'yes' ? ['music_background_type', ...(musicTypes.includes('other') ? ['music_background_other'] : [])] : [])])
    measure?.answer('music_background', music || undefined)
    measure?.answer('headphones', phones || undefined)
    measure?.answer('music_background_type', music === 'yes' && musicTypes.length ? musicTypes : undefined)
    measure?.answer('music_background_other', music === 'yes' && musicTypes.includes('other') && musicTypeOther.trim() ? musicTypeOther.trim() : undefined)
  }, [music, musicTypes, musicTypeOther, phones, measure])
  const otherMissing = music === "yes" && musicTypes.includes("other") && musicTypeOther.trim() === ""
  const ok = music !== "" && phones !== "" && !otherMissing
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <Section title={t.bgTitle}>
          <p className="text-muted-foreground">{t.bgIntro}</p>
        </Section>
        <ChoiceGroup id="music" label={t.musicQ} value={music} onChange={setMusic} options={[{ value: "yes", label: t.yes }, { value: "no", label: t.no }]} />
        {music === "yes" && (
          <div className="flex flex-col gap-3">
            <CheckGroup
              id="music-type"
              label={t.musicTypeQ}
              value={musicTypes}
              onChange={setMusicTypes}
              options={[
                { value: "instrument", label: t.instrument },
                { value: "singing", label: t.singing },
                { value: "production", label: t.production },
                { value: "musicStudies", label: t.musicStudies },
                { value: "other", label: t.bgOther },
              ]}
            />
            {musicTypes.includes("other") && (
              <>
                <Input
                  id="music-type-other"
                  aria-label={t.bgOtherPh}
                  aria-describedby={otherMissing ? "music-type-other-hint" : undefined}
                  placeholder={t.bgOtherPh}
                  required
                  value={musicTypeOther}
                  onChange={(e) => setMusicTypeOther(e.target.value)}
                />
                {otherMissing && (
                  <p id="music-type-other-hint" className="text-xs text-muted-foreground">{t.bgOtherRequired}</p>
                )}
              </>
            )}
          </div>
        )}
        <ChoiceGroup id="phones" label={t.headphonesQ} value={phones} onChange={setPhones} options={[{ value: "in-ear", label: t.inEar }, { value: "over-ear", label: t.overEar }]} />
      </CardContent>
      <CardFooter>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={!ok}
          onClick={() =>
            onDone({
              music_background: music === "yes",
              ...(music === "yes" && musicTypes.length
                ? { music_background_type: MUSIC_BACKGROUND_ORDER.filter((v) => musicTypes.includes(v)).join(", ") }
                : {}),
              ...(music === "yes" && musicTypes.includes("other") && musicTypeOther.trim()
                ? { music_background_other: musicTypeOther.trim() }
                : {}),
              headphones: phones as Participant["headphones"],
            })
          }
        >
          {t.continue}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function Definitions({ t, onDone }: { t: Messages; onDone: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <Section title={t.defsTitle}>
          <p className="text-muted-foreground">{t.defsIntro}</p>
        </Section>
        <dl className="flex flex-col gap-5">
          {([[t.clarityTerm, t.clarityDef], [t.loudnessTerm, t.loudnessDef], [t.emotionTerm, t.emotionDef]] as const).map(([term, def]) => (
            <div key={term} className="flex flex-col gap-1.5 border-l-2 pl-4">
              <dt className="font-semibold">{term}</dt>
              <dd className="text-muted-foreground">{def}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full sm:w-auto" onClick={onDone}>{t.continue}</Button>
      </CardFooter>
    </Card>
  )
}

type Genre = "pop" | "rockIndie" | "hiphopRap" | "rnbSoul" | "electronic" | "jazzBlues" | "classical" | "latin" | "folk" | "metal" | "singerSongwriter" | "soundtrack" | "world" | "other"

const GENRE_ORDER: Genre[] = ["pop", "rockIndie", "hiphopRap", "rnbSoul", "electronic", "jazzBlues", "classical", "latin", "folk", "metal", "singerSongwriter", "soundtrack", "world", "other"]

export function Genres({ t, sending, failed, onSubmit, measure, locked }: { t: Messages; sending: boolean; failed: boolean; onSubmit: (genres: string, other: string) => void; measure?: Measure; locked?: boolean }) {
  const [genres, setGenres] = useState<Genre[]>([])
  const [other, setOther] = useState("")
  useEffect(() => {
    measure?.show(['genres', ...(genres.includes('other') ? ['genres_other'] : [])])
    measure?.answer('genres', genres.length ? genres : undefined)
    measure?.answer('genres_other', genres.includes('other') && other.trim() ? other.trim() : undefined)
  }, [genres, other, measure])
  const otherMissing = genres.includes("other") && other.trim() === ""
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Section title={t.genresTitle}>
          <CheckGroup
            id="genres"
            label={t.genresQ}
            chips
            value={genres}
            onChange={value => { if (!locked) setGenres(value) }}
            options={[
              { value: "pop", label: t.genrePop },
              { value: "rockIndie", label: t.genreRock },
              { value: "hiphopRap", label: t.genreHipHop },
              { value: "rnbSoul", label: t.genreRnb },
              { value: "electronic", label: t.genreElectronic },
              { value: "jazzBlues", label: t.genreJazz },
              { value: "classical", label: t.genreClassical },
              { value: "latin", label: t.genreLatin },
              { value: "folk", label: t.genreFolk },
              { value: "metal", label: t.genreMetal },
              { value: "singerSongwriter", label: t.genreSinger },
              { value: "soundtrack", label: t.genreSoundtrack },
              { value: "world", label: t.genreWorld },
              { value: "other", label: t.genreOther },
            ]}
          />
          {genres.includes("other") && (
            <>
              <Input
                id="genres-other"
                aria-label={t.genreOtherPh}
                aria-describedby={otherMissing ? "genres-other-hint" : undefined}
                placeholder={t.genreOtherPh}
                required
                value={other}
                readOnly={locked}
                onChange={(e) => setOther(e.target.value)}
              />
              {otherMissing && (
                <p id="genres-other-hint" className="text-xs text-muted-foreground">{t.genreOtherRequired}</p>
              )}
            </>
          )}
        </Section>
        {failed && <p role="alert" className="text-sm text-destructive">{t.sendError}</p>}
      </CardContent>
      <CardFooter>
        <Button size="lg" className="w-full sm:w-auto" disabled={sending || otherMissing} onClick={() => onSubmit(GENRE_ORDER.filter((g) => genres.includes(g)).join(", "), other.trim())}>{sending ? t.sending : t.submit}</Button>
      </CardFooter>
    </Card>
  )
}
