import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
globalThis.crypto ??= webcrypto
const load = async name => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(fs.readFileSync(new URL('../src/lib/' + name + '.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64'))
const { StudyAPI, apiOrigin, deploymentOrigin } = await load('study-api')
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

test('same-origin deployment is explicit and allows HTTP only on loopback', () => {
  assert.equal(deploymentOrigin('same-origin','https://listening.example.org'),'https://listening.example.org')
  assert.equal(deploymentOrigin('same-origin','http://localhost:5178'),'http://localhost:5178')
  assert.throws(() => deploymentOrigin('same-origin','http://public.example.org'))
  assert.throws(() => deploymentOrigin('http://localhost:8357','https://listening.example.org'))
  assert.equal(deploymentOrigin('https://api.example.org','https://listening.example.org'),'https://api.example.org')
})


test('audio credits only the selected variant and excludes paused time', () => {
  const player = new Player({ duration: 10, slots: {}, map: {} })
  player.ctx = { currentTime: 0 }; player.playing = true; player.lastMark = 0
  player.ctx.currentTime = 4; player.select('B')
  player.ctx.currentTime = 9; player.select('C')
  player.ctx.currentTime = 15; player.tally(); player.playing = false
  player.ctx.currentTime = 115; player.tally()
  assert.deepEqual(player.heard, { A: 4, B: 5, C: 6 }); assert.equal(player.switches, 2)
})
test('multiple reasons retain all choices and clearing other removes its text', () => {
  const data = new Measurements(['why','why_other'])
  data.show(['why','why_other']); data.answer('why',['felt','other'],'es'); data.answer('why_other','Synthetic reason','es')
  const selected=['felt','moreDynamic']; data.answer('why',selected,'ca'); data.answer('why_other',undefined,'ca')
  selected.push('memories')
  const result=data.snapshot()
  assert.deepEqual(result.answers,{why:['felt','moreDynamic']}); assert.equal(result.answer_languages.why,'ca')
  assert.equal(result.timings.why.changes,2); assert(!('why_other' in result.answer_languages))
})

const { canRestartTest, newTestLabel } = await load('staging')
test('test restart fails closed outside explicitly enabled staging demo', () => {
  assert.equal(canRestartTest('true', 'https://staging.soundandmusic.eu', true), true)
  for (const origin of ['https://listening.bdim.es', 'https://mpc-study-staging.pages.dev', 'http://staging.soundandmusic.eu', 'https://staging.soundandmusic.eu.attacker.example']) {
    assert.equal(canRestartTest('true', origin, true), false)
  }
  for (const flag of [undefined, '', 'false']) assert.equal(canRestartTest(flag, 'https://staging.soundandmusic.eu', true), false)
  assert.equal(canRestartTest('true', 'https://staging.soundandmusic.eu', false), false)
  assert.equal(canRestartTest('true', 'https://staging.soundandmusic.eu', undefined), false)
  assert.deepEqual(Object.keys(newTestLabel).sort(), ['en','es','ca','fr','de','it','pt','nl','pl','sv','el','tr','zh'].sort())
})
test('starting another test uses a distinct identity without deleting the saved submission', async () => {
  const storage = memory(), rows = new Map(), requests = []
  let attempt = 'first'
  const api = new StudyAPI('https://api.example.org', storage, async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('bootstrap/')) return response({ attempt, csrf: 'csrf', saved: rows.has(attempt), closed: false })
    if (url.endsWith('protocol/')) return response({ protocol: { release: 'release-1' }, language: 'es' })
    if (url.includes('entry/?')) { attempt = 'second'; return response({ attempt, csrf: 'csrf-new', saved: false, closed: false }) }
    if (url.endsWith('responses/')) {
      const id = options.headers['X-Local-Submission-ID']
      assert.equal(id, attempt); rows.set(id, options.body)
      return response({ saved: true, id }, 201)
    }
    throw new Error('Unexpected route, including deletion')
  })
  await api.bootstrap(); await api.submit({ answers: { why: ['softer'] } })
  const firstKey = storage.getItem('mpc-local-key:first')
  assert(await api.restoreReceipt('release-1'))
  await api.start({ language: 'es', release: 'release-1', notice_version: 'test', csrf: 'csrf' }, '')
  await api.submit({ answers: { why: ['moreDynamic'] } })
  assert.equal(rows.size, 2)
  assert.equal(storage.getItem('mpc-local-key:first'), firstKey)
  assert.notEqual(storage.getItem('mpc-local-key:second'), firstKey)
  assert(!JSON.stringify([...storage.values]).includes('answers'))
  assert(await api.restoreReceipt('release-1'))
  assert(!requests.some(r => r.url.includes('export/delete/')))
})

const { rejectedSubmissionStatus, ApiError } = await load('study-api')
const { listeningProgress } = await load('study-model')
test('listening progress does not round up at or below the strict threshold', () => {
  assert.equal(listeningProgress(2.99, 3), '2.9')
  assert.equal(listeningProgress(3, 3), '3.0')
  assert.equal(listeningProgress(3.001, 3), '3+')
})
test('4xx recovery is distinct from retryable timeout, throttling and ambiguous failures', () => {
  for (const status of [400,401,403,404,405,409,413,415,422]) assert.equal(rejectedSubmissionStatus(new ApiError(status)), status)
  for (const status of [408,429,500,502,503]) assert.equal(rejectedSubmissionStatus(new ApiError(status)), null)
  assert.equal(rejectedSubmissionStatus(new TypeError('Network lost')), null)
})
test('network loss followed by 4xx cannot mutate a potentially saved attempt', async () => {
  const storage=memory(), bodies=[], keys=[]; let requests=0
  const api=new StudyAPI('https://api.example.org', storage, async (url,options) => {
    if (url.endsWith('bootstrap/')) return response({ attempt:'saved',csrf:'csrf',saved:false })
    if (url.endsWith('responses/')) {
      bodies.push(options.body);keys.push(options.headers['X-Local-Withdrawal-Key']);requests++
      if (requests===1) throw new TypeError('Lost acknowledgement')
      return requests===2 ? response({},400) : response({ saved:true,id:'saved' })
    }
    throw new Error('Unexpected request')
  })
  await api.bootstrap()
  await assert.rejects(api.submit({ answers:{why:['felt']} }))
  await assert.rejects(api.submit({ answers:{why:['softer']} }), error=>error.status===400)
  await api.submit({ answers:{why:['moreDynamic']} })
  assert.equal(new Set(bodies).size,1);assert.equal(new Set(keys).size,1)
  assert.equal(storage.values.size,1)
})
test('all languages include entry, recovery and strict-listening copy', async () => {
  const source=fs.readFileSync(new URL('../src/i18n.ts',import.meta.url),'utf8')
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  const {messages}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
  assert.equal(Object.keys(messages).length,13)
  for (const t of Object.values(messages)) {
    for (const key of ['starting','entryError','sendRejected','reload']) assert(t[key]?.trim())
    assert.notEqual(t.entryError,t.sendError);assert.notEqual(t.starting,t.loading)
    assert(t.sendRejected.includes('{status}'));assert(t.unlock.includes('{n}'))
  }
})


test('a question mounted while hidden accrues no time before its first visible exposure', () => {
  let clock = 0
  const data = new Measurements(['why'], () => clock, () => new Date(1700000000000 + clock).toISOString())
  data.show(['why'], false); clock = 500
  assert.deepEqual(data.snapshot().timings.why, { firstSeenAt: null, firstAnsweredAt: null, lastAnsweredAt: null, activeMs: 0, elapsedMs: 0, changes: 0 })
  data.visibility(true); clock = 700; data.answer('why', ['felt'], 'en')
  data.show([]); data.answer('why', undefined, 'en')
  const result = data.snapshot()
  assert.equal(result.timings.why.firstSeenAt, new Date(1700000000500).toISOString())
  assert.equal(result.timings.why.activeMs, 200)
  assert.equal(result.timings.why.elapsedMs, 200)
  assert.equal(result.timings.why.changes, 1)
  assert.equal(result.answers.why, undefined)
})
test('a second tab sees an in-progress tab and stops seeing it once that tab finishes or closes', async () => {
  const { TabGuard } = await load('tab-guard')
  const channels = [new BroadcastChannel('tab-guard-test'), new BroadcastChannel('tab-guard-test')]
  const first = new TabGuard(channels[0]), second = new TabGuard(channels[1])
  assert.equal(await second.elsewhere(100), false)
  first.hold(true)
  assert.equal(await second.elsewhere(100), true)
  assert.equal(await first.elsewhere(100), false)
  first.hold(false)
  assert.equal(await second.elsewhere(100), false)
  first.hold(true); channels[0].close()
  assert.equal(await second.elsewhere(100), false)
  channels[1].close()
  assert.equal(await new TabGuard(null).elsewhere(), false)
})
test('playback switches the iOS audio session to playback so the silent switch does not mute it', () => {
  const session = { type: 'auto' }
  Object.defineProperty(globalThis.navigator, 'audioSession', { value: session, configurable: true })
  try {
    const node = () => ({ gain: { value: 0 }, connect: next => next, start() {} })
    const slot = { buf: {}, gain: 1 }
    const player = new Player({ duration: 10, slots: { A: slot, B: slot, C: slot }, map: {} })
    player.ctx = { currentTime: 0, destination: {}, resume: async () => {}, createGain: node, createBufferSource: node }
    player.play()
    assert.equal(session.type, 'playback'); assert.equal(player.playing, true)
  } finally { delete globalThis.navigator.audioSession }
})
