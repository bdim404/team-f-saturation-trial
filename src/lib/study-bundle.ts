import { messages, type Lang, type Messages } from '../i18n'
import type { Question } from './study-model'

// This revision describes the bundled questionnaire, not a live collection approval.
export const BUNDLE_REVISION = 'bdim-73d43ab-ratings-v1'
export const backgroundOptions = ['instrument', 'singing', 'production', 'musicStudies', 'other']
export const genreOptions = ['pop', 'rockIndie', 'hiphopRap', 'rnbSoul', 'electronic', 'jazzBlues', 'classical', 'latin', 'folk', 'metal', 'singerSongwriter', 'soundtrack', 'world', 'other']
const genreLabels = ['genrePop','genreRock','genreHipHop','genreRnb','genreElectronic','genreJazz','genreClassical','genreLatin','genreFolk','genreMetal','genreSinger','genreSoundtrack','genreWorld','genreOther']
const reasonOptions = ['harsher','softer','moreDynamic','lessDynamic','memories','felt','other']
const reasonLabels = ['whyHarsher','whySofter','whyMoreDynamic','whyLessDynamic','whyMemories','whyFelt','whyOther']
type Definition = { id: string; title: keyof Messages; type: Question['type']; required: boolean; audio: boolean; options?: string[]; labels?: string[]; slot?: string }
const definitions: Definition[] = [
  { id: 'music_background', title: 'musicQ', type: 'single', required: true, audio: false, options: ['yes','no'] },
  { id: 'music_background_type', title: 'musicTypeQ', type: 'multi', required: false, audio: false, options: backgroundOptions, labels: ['instrument','singing','production','musicStudies','bgOther'] },
  { id: 'music_background_other', title: 'bgOtherPh', type: 'text', required: true, audio: false },
  { id: 'headphones', title: 'headphonesQ', type: 'single', required: true, audio: false, options: ['in-ear','over-ear'], labels: ['inEar','overEar'] },
  ...(['loudness','clarity','emotion'] as const).flatMap((dimension, i) => ['A','B','C'].map(slot => ({ id: `${dimension}_${slot}`, title: ['loudQ','clearQ','emoQ'][i] as keyof Messages, type: 'single' as const, required: true, audio: true, options: ['0','1','2','3','4','5'], slot }))),
  { id: 'why', title: 'whyStep', type: 'single', required: true, audio: true, options: reasonOptions, labels: reasonLabels },
  { id: 'why_other', title: 'whyOtherPh', type: 'text', required: true, audio: true },
  { id: 'genres', title: 'genresQ', type: 'multi', required: false, audio: false, options: genreOptions, labels: genreLabels },
  { id: 'genres_other', title: 'genreOtherPh', type: 'text', required: true, audio: false },
]
export const questionIds = definitions.map(q => q.id)
export function bundleQuestions(): Question[] {
  return definitions.map(d => {
    const copy = (language: Lang) => {
      const t = messages[language]
      return { title: String(t[d.title]) + (d.slot ? ` — ${t.version.replace('{v}', d.slot)}` : ''), description: d.slot ? t.scaleHint : '', direction: '', options: Object.fromEntries((d.options || []).map((id, i) => [id, String(t[(d.labels?.[i] || id) as keyof Messages] ?? id)])) }
    }
    const english = copy('en')
    return { id: d.id, type: d.type, required: d.required, audio: d.audio, ...english, options: Object.entries(english.options).map(([id, label]) => ({ id, label })), translations: Object.fromEntries((Object.keys(messages) as Lang[]).filter(l => l !== 'en').map(l => [l, copy(l)])) }
  })
}
export const bundleFlow = { version: 1, pre_listening: questionIds.slice(0,4), conditions: {
  music_background_type: { question: 'music_background', equals: 'yes' },
  music_background_other: { question: 'music_background_type', contains: 'other' },
  why: { questions: ['emotion_A','emotion_B','emotion_C'], kind: 'rating_extreme' },
  why_other: { question: 'why', equals: 'other' },
  genres_other: { question: 'genres', contains: 'other' },
}, reset_on_rank_change: {} }
export const bundleCopy = Object.fromEntries(Object.entries(messages).map(([lang, t]) => [lang, { privacy: t.privacy, consent: t.consent, whyMostQ: t.whyMostQ, whyLeastQ: t.whyLeastQ, definitions: [t.loudnessDef,t.clarityDef,t.emotionDef] }]))
