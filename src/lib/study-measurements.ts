import type { Answer, Timing } from './study-model'
const empty = (): Timing => ({ firstSeenAt: null, firstAnsweredAt: null, lastAnsweredAt: null, activeMs: 0, elapsedMs: 0, changes: 0 })
/** Aggregate question measurements only. No clickstream, device data or browser persistence. */
export class Measurements {
  answers: Record<string, Answer> = {}
  languages: Record<string, string> = {}
  private timings: Record<string, Timing>
  private active: string[] = []
  private mark: number
  private visible = true
  private now: () => number
  private date: () => string
  constructor(ids: string[], now = () => performance.now(), date = () => new Date().toISOString()) {
    this.now = now; this.date = date
    this.timings = Object.fromEntries(ids.map(id => [id, empty()]))
    this.mark = now()
  }
  private flush() {
    const now = this.now(), elapsed = Math.max(0, now - this.mark)
    for (const id of this.active) {
      this.timings[id].elapsedMs += elapsed
      if (this.visible) this.timings[id].activeMs += elapsed
    }
    this.mark = now
  }
  show(ids: string[], visible = true) {
    this.flush(); this.visible = visible; this.active = ids
    if (visible) for (const id of ids) {
      if (!this.timings[id]) throw new Error('Unknown question.')
      if (!this.timings[id].firstSeenAt) { this.timings[id].firstSeenAt = this.date() }
    }
  }
  visibility(visible: boolean) { this.show(this.active, visible) }
  answer(id: string, value: Answer | undefined, language: string) {
    const previous = this.answers[id]
    if (JSON.stringify(previous) === JSON.stringify(value)) return
    const timing = this.timings[id]
    if (!timing?.firstSeenAt) {
      if (value === undefined) return
      throw new Error('Cannot answer an unseen question.')
    }
    if (value === undefined) { delete this.answers[id]; delete this.languages[id]; return }
    const date = this.date()
    timing.firstAnsweredAt ??= date; timing.lastAnsweredAt = date; timing.changes++
    this.answers[id] = structuredClone(value); this.languages[id] = language
  }
  snapshot() {
    this.flush()
    return { answers: structuredClone(this.answers), answer_languages: { ...this.languages }, timings: Object.fromEntries(Object.entries(this.timings).map(([id,t]) => [id, { ...t, activeMs: Math.round(t.activeMs), elapsedMs: Math.round(t.elapsedMs) }])) }
  }
  clear() { this.answers = {}; this.languages = {}; this.active = []; this.timings = {} }
}
export type Measure = { show: (ids: string[]) => void; answer: (id: string, value: Answer | undefined) => void }
