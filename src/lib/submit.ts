import { config } from "@/config"
import type { Level, Slot } from "@/lib/audio"

export interface TrialResponse {
  trial: string
  language: string
  question: string
  stimulus: string
  answer: Slot
  answer_level: Level
  mapping: Record<Slot, { level: Level; drive: number }>
  switches: number
  seconds_heard: Record<Slot, number>
  consented: string
  started: string
  submitted: string
}

export async function submitResponse(response: TrialResponse) {
  if (!config.submitUrl) {
    console.info("trial response", response)
    return
  }
  const res = await fetch(config.submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  })
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
}
