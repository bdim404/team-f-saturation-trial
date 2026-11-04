import type { Level } from "@/lib/audio"

export interface TrackConfig {
  id: string
  source?: string
  files?: Record<Level, string>
}

export const config = {
  studyId: "saturation-perceived-emotion-01",
  submitUrl: import.meta.env.VITE_SUBMIT_URL as string | undefined,
  tracks: [{ id: "synth-pop-loop" }] as TrackConfig[],
  drive: { less: 0, base: 2, more: 5 } as Record<Level, number>,
  minSecondsPerVersion: 3,
  durationMinutes: 7,
}
