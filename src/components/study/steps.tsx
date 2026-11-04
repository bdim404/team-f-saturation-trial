import { useState } from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Section } from "@/components/study/shared"
import { config } from "@/config"
import { fill, type Messages } from "@/i18n"
import type { StudyResponse } from "@/lib/submit"

export function ChoiceGroup<T extends string>({ id, label, value, options, onChange, columns = 2, disabled }: {
  id: string
  label: string
  value: T | ""
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  columns?: 1 | 2 | 3
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-label`} className="font-medium">{label}</p>
      <RadioGroup
        aria-labelledby={`${id}-label`}
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

export function Welcome({ t, onStart }: { t: Messages; onStart: () => void }) {
  const [agreed, setAgreed] = useState(false)
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <Section title={t.whatTitle}>
          <p className="text-muted-foreground">{fill(t.what, { m: config.durationMinutes })}</p>
        </Section>
        <Section title={t.prepTitle}>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground marker:text-border">
            <li>{t.prep1}</li>
            <li>{t.prep2}</li>
            <li>{t.prep3}</li>
          </ul>
        </Section>
        <Section title={t.privacyTitle}>
          <p className="text-muted-foreground">{t.privacy}</p>
        </Section>
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

type Participant = StudyResponse["participant"]

export function Background({ t, onDone }: { t: Messages; onDone: (p: Omit<Participant, "genres">) => void }) {
  const [music, setMusic] = useState<"yes" | "no" | "">("")
  const [musicType, setMusicType] = useState("")
  const [phones, setPhones] = useState<Participant["headphones"] | "">("")
  const ok = music !== "" && phones !== ""
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <Section title={t.bgTitle}>
          <p className="text-muted-foreground">{t.bgIntro}</p>
        </Section>
        <ChoiceGroup id="music" label={t.musicQ} value={music} onChange={setMusic} options={[{ value: "yes", label: t.yes }, { value: "no", label: t.no }]} />
        {music === "yes" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="music-type" className="text-base font-medium">{t.musicTypeQ}</Label>
            <Input id="music-type" value={musicType} onChange={(e) => setMusicType(e.target.value)} placeholder={t.musicTypePh} />
          </div>
        )}
        <ChoiceGroup id="phones" label={t.headphonesQ} value={phones} onChange={setPhones} options={[{ value: "in-ear", label: t.inEar }, { value: "over-ear", label: t.overEar }]} />
      </CardContent>
      <CardFooter>
        <Button
          size="lg"
          disabled={!ok}
          onClick={() =>
            onDone({
              music_background: music === "yes",
              ...(music === "yes" && musicType.trim() ? { music_background_type: musicType.trim() } : {}),
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
        <Button size="lg" onClick={onDone}>{t.continue}</Button>
      </CardFooter>
    </Card>
  )
}

export function Genres({ t, sending, failed, onSubmit }: { t: Messages; sending: boolean; failed: boolean; onSubmit: (genres: string) => void }) {
  const [genres, setGenres] = useState("")
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Section title={t.genresTitle}>
          <Label htmlFor="genres" className="text-base font-normal text-muted-foreground">{t.genresQ}</Label>
        </Section>
        <Textarea id="genres" value={genres} onChange={(e) => setGenres(e.target.value)} placeholder={t.genresPh} rows={3} />
        {failed && <p role="alert" className="text-sm text-destructive">{t.sendError}</p>}
      </CardContent>
      <CardFooter>
        <Button size="lg" disabled={sending} onClick={() => onSubmit(genres.trim())}>{sending ? t.sending : t.submit}</Button>
      </CardFooter>
    </Card>
  )
}
