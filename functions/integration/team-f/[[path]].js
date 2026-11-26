// Opt-in participant-only gateway. No storage, logging, automatic retry or admin routes.
const API = 'https://api.soundandmusic.eu'
const PREFIX = '/integration/team-f/'
const MAX_BODY = 1024 * 1024
const COOKIES = new Set(['__Host-mpc_api_session', '__Host-mpc_api_csrf'])
const METHODS = { 'entry/': ['GET', 'POST'], 'bootstrap/': ['GET'], 'protocol/': ['GET'], 'language/': ['POST'], 'responses/': ['POST'], 'export/json/': ['POST'], 'export/csv/': ['POST'], 'export/delete/': ['POST'] }
const failure = status => new Response('Study service unavailable.', { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
async function boundedBody(request) {
  if (!request.body) return undefined
  const reader = request.body.getReader(), parts = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) { await reader.cancel(); throw new RangeError('Request too large.') }
    parts.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { body.set(part, offset); offset += part.byteLength }
  return body
}
export async function gateway(request, env, send = fetch) {
  const url = new URL(request.url), configured = env.MPC_FRONTEND_ORIGIN
  if (env.MPC_GATEWAY_ENABLED !== 'synthetic' || typeof configured !== 'string' || !/^https:\/\/[a-z0-9.-]+$/.test(configured) || url.origin !== configured) return failure(503)
  if (!url.pathname.startsWith(PREFIX)) return failure(404)
  const path = url.pathname.slice(PREFIX.length)
  const methods = Object.prototype.hasOwnProperty.call(METHODS, path) ? METHODS[path] : (/^audio\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/$/.test(path) ? ['GET'] : [])
  if (!methods.length) return failure(404)
  if (!methods.includes(request.method)) return failure(405)
  const origin = request.headers.get('Origin')
  if ((origin && origin !== configured) || (request.method === 'POST' && origin !== configured)) return failure(403)
  for (const key of url.searchParams.keys()) if (path !== 'entry/' || !['release', 'lang'].includes(key) || url.searchParams.getAll(key).length !== 1) return failure(400)
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return failure(413)
  const headers = new Headers({ Origin: configured, Accept: '*/*' })
  for (const name of ['Content-Type', 'X-CSRFToken', 'X-Local-Submission-ID', 'X-Local-Withdrawal-Key']) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  const cookies = (request.headers.get('Cookie') || '').split(';').map(c => c.trim()).filter(c => COOKIES.has(c.slice(0, c.indexOf('='))))
  if (cookies.length) headers.set('Cookie', cookies.join('; '))
  let body
  try { body = await boundedBody(request) } catch { return failure(413) }
  try {
    const upstream = await send(API + url.pathname + url.search, {
      method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (upstream.status >= 300 && upstream.status < 400) return failure(502)
    const output = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    for (const name of ['Content-Type', 'Content-Disposition', 'Retry-After']) {
      const value = upstream.headers.get(name)
      if (value !== null) output.set(name, value)
    }
    const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : upstream.headers.getAll('Set-Cookie')
    for (let cookie of setCookies) {
      if (!COOKIES.has(cookie.slice(0, cookie.indexOf('=')))) continue
      // Preserve host-only Secure Lax cookies under the frontend's own origin.
      if (cookie.startsWith('__Host-mpc_api_session=') && !/;\s*HttpOnly(?:;|$)/i.test(cookie) && /;\s*Max-Age=0(?:;|$)/i.test(cookie)) cookie += '; HttpOnly'
      if ((cookie.startsWith('__Host-mpc_api_session=') && !/;\s*HttpOnly(?:;|$)/i.test(cookie)) || /;\s*Domain=/i.test(cookie) || !/;\s*Secure(?:;|$)/i.test(cookie) || !/;\s*Path=\/(?:;|$)/i.test(cookie) || !/;\s*SameSite=Lax(?:;|$)/i.test(cookie)) return failure(502)
      output.append('Set-Cookie', cookie)
    }
    return new Response(upstream.body, { status: upstream.status, headers: output })
  } catch { return failure(502) }
}
export const onRequest = ({ request, env }) => gateway(request, env)
