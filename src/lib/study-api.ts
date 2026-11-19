import type { Instrument, Presentation } from './study-model'

export type Notice = { release: string; language: string; notice_version: string; csrf: string; synthetic_only: boolean; notice: { title: string; study: string; paragraphs: string[]; acknowledgement: string; start: string }; presentation: Presentation; turnstile: null | { site_key: string; action: string; cdata: string } }
type Session = { csrf: string; attempt: string; closed: boolean; saved: boolean }
export class ApiError extends Error { status: number; constructor(status: number) { super(`Study request failed (${status}).`); this.status = status } }
// 408/429 can be retried; other 4xx need explicit recovery, not a blind replay.
export function rejectedSubmissionStatus(error: unknown): number | null {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status) ? error.status : null
}
export function apiOrigin(value: string, local = false) {
  const url = new URL(value)
  if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Configure one HTTPS API origin.')
  return url.origin
}
export function deploymentOrigin(value: string, currentOrigin: string, development = false) {
  // Explicit same-origin mode also permits an HTTP loopback-only Docker test.
  return value === 'same-origin' ? apiOrigin(currentOrigin, true) : apiOrigin(value, development)
}
export class StudyAPI {
  private session: Session | null = null
  private frozen: string | null = null
  private origin: string
  private storage: Storage
  private request: typeof fetch
  constructor(origin: string, storage: Storage, request: typeof fetch = fetch) { this.origin = origin; this.storage = storage; this.request = request.bind(globalThis) }
  private async call(path: string, init: RequestInit = {}) {
    const response = await this.request(this.origin + '/integration/team-f/' + path, { ...init, credentials: 'include', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
    if (!response.ok) throw new ApiError(response.status)
    return response
  }
  async notice(language: string, release?: string) {
    const query = new URLSearchParams({ lang: language, ...(release ? { release } : {}) })
    return (await this.call('entry/?' + query)).json() as Promise<Notice>
  }
  async bootstrap() {
    this.session = await (await this.call('bootstrap/')).json()
    return this.session!
  }
  async restoreReceipt(release: string): Promise<Instrument | null> {
    let session: Session
    try { session = await this.bootstrap() }
    catch (error) { if (error instanceof ApiError && error.status === 403) return null; throw error }
    if (!session.saved || session.closed || !this.hasKey()) return null
    this.ensureKey() // Never replace the key of an already saved attempt.
    const instrument = await this.protocol()
    return instrument.protocol.release === release ? instrument : null
  }
  async start(notice: Notice, token: string) {
    const body = new URLSearchParams({ fictional: 'yes', notice_version: notice.notice_version, 'cf-turnstile-response': token })
    this.session = await (await this.call('entry/?' + new URLSearchParams({ lang: notice.language, release: notice.release }), { method: 'POST', headers: { 'X-CSRFToken': notice.csrf, 'Content-Type': 'application/x-www-form-urlencoded' }, body })).json()
    this.frozen = null
    this.ensureKey()
    return this.session!
  }
  async protocol(): Promise<Instrument> { return (await this.call('protocol/')).json() }
  private keyName() { if (!this.session) throw new Error('Start the study first.'); return 'mpc-local-key:' + this.session.attempt }
  hasKey() { return !!this.storage.getItem(this.keyName()) }
  ensureKey() {
    const name = this.keyName()
    let key = this.storage.getItem(name)
    if (!key) {
      if (this.session?.saved || this.session?.closed) throw new Error('The receipt key is unavailable in this tab.')
      key = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')
      this.storage.setItem(name, key)
    }
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid receipt key.')
    return key
  }
  private headers() {
    if (!this.session) throw new Error('Start the study first.')
    return { 'X-CSRFToken': this.session.csrf, 'X-Local-Submission-ID': this.session.attempt, 'X-Local-Withdrawal-Key': this.ensureKey() }
  }
  async language(language: string) {
    if (!this.session || this.frozen) throw new Error('This attempt is locked.')
    const result = await (await this.call('language/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.session.csrf }, body: JSON.stringify({ language }) })).json()
    if (result.language !== language) throw new Error('Language change unconfirmed.')
  }
  async submit(payload: object) {
    // Keep exact bytes even after 4xx: an earlier ambiguous request may have saved.
    // The UI exposes definitive rejection and offers reload/receipt recovery.
    this.frozen ??= JSON.stringify(payload)
    const result = await (await this.call('responses/', { method: 'POST', headers: { ...this.headers(), 'Content-Type': 'application/json' }, body: this.frozen })).json()
    if (result.saved !== true || result.id !== this.session?.attempt) throw new Error('Saving was not confirmed.')
    this.frozen = null
    this.session!.saved = true
  }
  async receipt(format: 'json' | 'csv') { return (await this.call('export/' + format + '/', { method: 'POST', headers: this.headers() })).blob() }
  async withdraw() {
    const result = await (await this.call('export/delete/', { method: 'POST', headers: this.headers() })).json()
    if (result.deleted !== true) throw new Error('Deletion was not confirmed.')
    this.storage.removeItem(this.keyName())
    this.frozen = null
    this.session = null
  }
  async audio(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid audio identifier.')
    return (await this.call('audio/' + id + '/')).arrayBuffer()
  }
}
