import { config } from "@/config"
import type { Level, Slot } from "@/lib/audio"

export type Why = "harsher" | "warmer" | "other"

export interface TrialResult {
  track: string
  mapping: Record<Slot, { level: Level; drive: number | null }>
  rank_loudness: Level[]
  rank_clarity: Level[]
  rank_emotion: Level[]
  most_emotional_why: { choice: Why; text?: string }
  switches: number
  seconds_heard: Record<Slot, number>
}

export interface StudyResponse {
  study: string
  language: string
  participant: {
    music_background: boolean
    music_background_type?: string
    headphones: "in-ear" | "over-ear"
    genres?: string
  }
  trials: TrialResult[]
  consented: string
  submitted: string
}

export async function submitResponse(response: StudyResponse) {
  if (!config.submitUrl) {
    console.info("study response", response)
    return
  }
  const res = await fetch(config.submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  })
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
}
