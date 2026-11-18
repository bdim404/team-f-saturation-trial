import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
globalThis.crypto ??= webcrypto
const load = async name => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(fs.readFileSync(new URL('../src/lib/' + name + '.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64'))
const { StudyAPI, apiOrigin } = await load('study-api')
const { addRank, applicable, changeAnswer, listeningComplete } = await load('study-model')
const { Player } = await load('audio')
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
test('only one configured HTTPS origin; loopback HTTP requires explicit development', () => {
  assert.equal(apiOrigin('https://api.example.org'), 'https://api.example.org')
  for (const value of ['', 'https://api.example.org/', 'https://api.example.org/path', 'https://user:password@api.example.org', 'http://api.example.org', 'https://api.example.org?q=x']) assert.throws(() => apiOrigin(value))
  assert.throws(() => apiOrigin('http://localhost:9999'))
  assert.equal(apiOrigin('http://localhost:9999', true), 'http://localhost:9999')
})
test('ambiguous submit retries exact bytes and identity, without storing answers', async () => {
  const storage = memory(), requests = [], id = '00000000-0000-4000-8000-000000000001'
  let sends = 0
  const api = new StudyAPI('https://api.example.org', storage, async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('bootstrap/')) return response({ csrf: 'test-csrf', attempt: id, closed: false, saved: false })
    if (url.endsWith('responses/')) { sends++; if (sends === 1) throw new TypeError('Synthetic network loss'); return response({ saved: true, id }) }
    return response({ deleted: true })
  })
  await api.bootstrap(); api.ensureKey()
  const payload = { answers: { text: 'synthetic private answer' }, submitted: 'fixed' }
  await assert.rejects(api.submit(payload)); payload.answers.text = 'edited after failure'
  await api.submit(payload)
  const posts = requests.filter(r => r.url.endsWith('responses/'))
  assert.equal(posts[0].options.body, posts[1].options.body)
  assert.deepEqual(posts[0].options.headers, posts[1].options.headers)
  assert.match(posts[0].options.headers['X-Local-Withdrawal-Key'], /^[a-f0-9]{64}$/)
  assert.equal(storage.values.size, 1)
  assert(!JSON.stringify([...storage.values]).includes('synthetic private answer'))
  for (const { options } of requests) { assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer') }
  await api.receipt('csv'); await api.withdraw(); assert.equal(storage.values.size, 0)
})
test('HTTP success without matching saved receipt is not accepted', async () => {
  for (const body of [{}, { saved: false }, { saved: true, id: 'wrong' }]) {
    const api = new StudyAPI('https://api.example.org', memory(), async url => url.endsWith('bootstrap/') ? response({ attempt: 'attempt', csrf: 'csrf', saved: false }) : response(body))
    await api.bootstrap(); await assert.rejects(api.submit({ answers: {} }))
  }
})
test('saved attempts with lost keys cannot generate replacement identities', async () => {
  const storage = memory(), api = new StudyAPI('https://api.example.org', storage, async () => response({ attempt: 'saved', csrf: 'csrf', saved: true }))
  await api.bootstrap(); assert.throws(() => api.ensureKey()); assert.equal(storage.values.size, 0)
})
test('conflict retains locked payload and prevents language mutation', async () => {
  const api = new StudyAPI('https://api.example.org', memory(), async url => url.endsWith('bootstrap/') ? response({ attempt: 'attempt', csrf: 'csrf' }) : response({}, 409))
  await api.bootstrap(); await assert.rejects(api.submit({ answers: {} }), e => e.status === 409); await assert.rejects(api.language('ca'))
})
test('rank third position is automatic, ties and uncertainty remain distinct', () => {
  const first = addRank([], 'C'); assert.deepEqual(first.order, ['C'])
  const second = addRank(first.order, 'A'); assert.deepEqual(second.order, ['C', 'A', 'B'])
  assert.deepEqual(addRank(second.order, 'B'), second)
})
const p = { minSecondsPerVersion: 3, questions: [{ id: 'rank', type: 'rank', audio: true }, { id: 'reason', type: 'single' }, { id: 'text', type: 'text' }], flow: { conditions: { reason: { question: 'rank', kind: 'rank' }, text: { question: 'reason', equals: 'other' } }, reset_on_rank_change: { rank: ['reason'] } } }
test('changing a winner clears the reason and its dependent text', () => {
  const answers = { rank: { kind: 'rank', order: ['A', 'B', 'C'] }, reason: 'other', text: 'synthetic' }
  const changed = changeAnswer(p, answers, p.questions[0], { kind: 'rank', order: ['B', 'A', 'C'] })
  assert.deepEqual([...changed.cleared], ['reason', 'text'])
  assert.deepEqual(applicable(p, { rank: { kind: 'tie' } }).map(q => q.id), ['rank'])
  assert.deepEqual(applicable(p, { rank: { kind: 'unsure' } }).map(q => q.id), ['rank'])
})
test('listen minimum is strictly greater, never greater-or-equal', () => {
  assert.equal(listeningComplete(p, { A: 3, B: 4, C: 4 }), false)
  assert.equal(listeningComplete(p, { A: 3.01, B: 4, C: 4 }), true)
})
test('audio start scheduling never yields negative listening or wall-clock credit', () => {
  const player = new Player({ duration: 10, slots: {}, map: {} })
  player.ctx = { currentTime: 1 }; player.playing = true; player.lastMark = 1.03; player.startedAt = 1.03
  player.tally(); assert.equal(player.heard.A, 0); assert.equal(player.time(), 0)
  player.ctx.currentTime = 2.03; player.tally(); assert(Math.abs(player.heard.A - 1) < 1e-10)
  const heard = player.heard.A; player.tally(); assert.equal(player.heard.A, heard)
})

const { Measurements } = await load('study-measurements')
test('aggregate question times exclude hidden intervals and preserve answer language', () => {
  let clock = 0
  const data = new Measurements(['music','other'], () => clock, () => new Date(1700000000000+clock).toISOString())
  data.show(['music']); clock=100; data.answer('music','yes','es'); data.answer('music','yes','en')
  clock=200; data.visibility(false); clock=1200; data.visibility(true)
  clock=1250; data.answer('music','no','ca'); data.show([])
  clock=9000 // Time on another question must not inflate this question.
  const p=data.snapshot()
  assert.equal(p.timings.music.activeMs,250); assert.equal(p.timings.music.elapsedMs,1250)
  assert.equal(p.timings.music.changes,2); assert.equal(p.answer_languages.music,'ca')
  assert.equal(p.timings.other.firstSeenAt,null)
  assert.throws(() => data.answer('other','unseen','es'))
  data.answer('music',undefined,'ca'); assert.deepEqual(data.snapshot().answers,{})
})

test('reload recovers only a matching saved receipt, without fetching or storing answers', async () => {
  const storage = memory(), requests = [], key = 'ab'.repeat(32)
  storage.setItem('mpc-local-key:saved', key)
  const instrument = { protocol: { release: 'release-1' }, language: 'ca', presentation: {} }
  const api = new StudyAPI('https://api.example.org', storage, async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('bootstrap/')) return response({ attempt: 'saved', csrf: 'fresh-csrf', saved: true, closed: false })
    if (url.endsWith('protocol/')) return response(instrument)
    return response({ deleted: true })
  })
  assert.deepEqual(await api.restoreReceipt('release-1'), instrument)
  assert(requests.every(r => r.options.method !== 'POST'))
  assert.deepEqual([...storage.values], [['mpc-local-key:saved', key]])
  await api.withdraw()
  assert.equal(requests.at(-1).options.headers['X-Local-Withdrawal-Key'], key)
  assert.equal(requests.at(-1).options.headers['X-CSRFToken'], 'fresh-csrf')
  assert.equal(storage.values.size, 0)
})
test('receipt recovery cannot revive withdrawn, unsaved, keyless or unrelated attempts', async () => {
  for (const state of [
    { saved: false, closed: false, key: true },
    { saved: true, closed: true, key: true },
    { saved: true, closed: false, key: false },
    { saved: true, closed: false, key: true, release: 'another-release' },
  ]) {
    const storage = memory(); if (state.key) storage.setItem('mpc-local-key:saved', 'ab'.repeat(32))
    const api = new StudyAPI('https://api.example.org', storage, async url => url.endsWith('bootstrap/')
      ? response({ attempt: 'saved', csrf: 'csrf', ...state })
      : response({ protocol: { release: state.release || 'release-1' } }))
    assert.equal(await api.restoreReceipt('release-1'), null)
    assert.equal(storage.values.size, state.key ? 1 : 0)
  }
})
test('receipt recovery distinguishes missing session from transport or server failure', async () => {
  for (const status of [403, 500]) {
    const api = new StudyAPI('https://api.example.org', memory(), async () => response({}, status))
    if (status === 403) assert.equal(await api.restoreReceipt('release-1'), null)
    else await assert.rejects(api.restoreReceipt('release-1'), error => error.status === status)
  }
})
