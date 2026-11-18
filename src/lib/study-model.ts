export type Slot = 'A' | 'B' | 'C'
export type Level = 'less' | 'base' | 'more'
export type Rank = { kind: 'rank' | 'tie' | 'unsure'; order?: Slot[] }
export type Answer = Rank | string | string[] | number
export type Timing = { firstSeenAt: string | null; firstAnsweredAt: string | null; lastAnsweredAt: string | null; activeMs: number; elapsedMs: number; changes: number }
export type Copy = { title: string; description: string; direction: string; options: Record<string, string> }
export type Question = Omit<Copy, 'options'> & { id: string; type: 'rank' | 'single' | 'multi' | 'text' | 'scale'; required: boolean; audio: boolean; options: { id: string; label: string }[]; translations: Record<string, Copy> }
export type Protocol = { study_revision?: string; bundled_frontend?: { track: string }; release: string; title: string; version: number; minSecondsPerVersion: number; questions: Question[]; audio: { mode: string; files: Record<Level, { id: string; sha256: string }> }; flow?: { version: 1; pre_listening: string[]; conditions: Record<string, { question: string; equals?: string; kind?: 'rank' }>; reset_on_rank_change: Record<string, string[]>; key_terms?: Record<string, { id: string; label: string; text: string }[]> } }
export type Presentation = { ui: Record<string, string>; receipt: string[]; status: string[]; deletion: { title: string; body: string; cancel: string; confirm: string }; languages: { code: string; name: string }[] }
export type Instrument = { protocol: Protocol; mapping: Record<Slot, Level>; language: string; presentation: Presentation }
export const slots: Slot[] = ['A', 'B', 'C']
export const emptyTiming = (): Timing => ({ firstSeenAt: null, firstAnsweredAt: null, lastAnsweredAt: null, activeMs: 0, elapsedMs: 0, changes: 0 })
export function complete(q: Question, a: Answer | undefined) {
  if (a === undefined || a === '') return false
  if (q.type === 'rank') { const r = a as Rank; return r.kind === 'tie' || r.kind === 'unsure' || r.order?.length === 3 }
  if (q.type === 'text') return typeof a === 'string' && !!a.trim()
  if (q.type === 'multi') return Array.isArray(a) && a.length > 0
  return true
}
export function applicable(p: Protocol, answers: Record<string, Answer>) {
  const active = new Set<string>()
  return p.questions.filter(q => {
    const rule = p.flow?.conditions[q.id], source = rule ? answers[rule.question] : undefined, rank = source as Rank | undefined
    const yes = !rule || active.has(rule.question) && (rule.equals !== undefined ? source === rule.equals : rank?.kind === 'rank' && rank.order?.length === 3)
    if (yes) active.add(q.id)
    return yes
  })
}
const winner = (a: Answer | undefined) => { const r = a as Rank | undefined; return r?.kind === 'rank' && r.order?.length === 3 ? r.order[0] : null }
export function changeAnswer(p: Protocol, previous: Record<string, Answer>, q: Question, answer: Answer) {
  const answers = { ...previous, [q.id]: answer }, cleared = new Set<string>()
  if (winner(previous[q.id]) !== winner(answer)) for (const id of p.flow?.reset_on_rank_change[q.id] || []) if (id in answers) cleared.add(id)
  for (const id of cleared) delete answers[id]
  const active = new Set(applicable(p, answers).map(item => item.id))
  for (const id of Object.keys(answers)) if (!active.has(id)) { delete answers[id]; cleared.add(id) }
  return { answers, cleared }
}
export function addRank(order: Slot[], slot: Slot): Rank {
  if (order.includes(slot) || order.length === 3) return { kind: 'rank', order }
  const next = [...order, slot]
  return { kind: 'rank', order: next.length === 2 ? [...next, ...slots.filter(s => !next.includes(s))] : next }
}
export function listeningComplete(p: Protocol, heard: Record<Slot, number>) {
  return !p.questions.some(q => q.audio) || slots.every(s => p.minSecondsPerVersion === 0 || heard[s] > p.minSecondsPerVersion)
}
