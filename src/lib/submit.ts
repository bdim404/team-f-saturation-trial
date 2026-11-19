import type { Level, Slot } from "@/lib/audio"

export type Why = "harsher" | "softer" | "moreDynamic" | "lessDynamic" | "memories" | "felt" | "other"

export interface TrialResult {
  track: string
  mapping: Record<Slot, { level: Level; drive: number | null }>
  ratings: {
    loudness: Record<Slot, number>
    clarity: Record<Slot, number>
    emotion: Record<Slot, number>
  }
  why?: {
    kind: "most" | "least"
    version: Slot
    choices: Why[]
    text?: string
  }
  switches: number
  seconds_heard: Record<Slot, number>
}

export interface StudyResponse {
  study: string
  language: string
  participant: {
    music_background: boolean
    music_background_type?: string
    music_background_other?: string
    headphones: "in-ear" | "over-ear"
    genres?: string
    genres_other?: string
  }
  trials: TrialResult[]
  consented: string
  submitted: string
}
