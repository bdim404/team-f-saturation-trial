import test from 'node:test'
import assert from 'node:assert/strict'
import { gateway } from '../functions/integration/team-f/[[path]].js'
const origin='https://listening.bdim.es', env={MPC_GATEWAY_ENABLED:'synthetic',MPC_FRONTEND_ORIGIN:origin}
const req=(path,options={})=>new Request(origin+'/integration/team-f/'+path,options)
const empty=async()=>new Response('{}',{headers:{'Content-Type':'application/json'}})
test('gateway disabled by default and bound to one exact origin',async()=>{
 assert.equal((await gateway(req('protocol/'),{},empty)).status,503)
 assert.equal((await gateway(new Request('https://other.example/integration/team-f/protocol/'),env,empty)).status,503)
})
test('gateway blocks admin, unexpected paths/methods/query and cross-origin mutations',async()=>{
 for(const path of ['admin/','../../admin/','constructor','__proto__','audio/not-a-uuid/']) assert.equal((await gateway(req(path),env,empty)).status,404)
 assert.equal((await gateway(req('responses/'),env,empty)).status,405)
 assert.equal((await gateway(req('protocol/?redirect=https://evil.example'),env,empty)).status,400)
 assert.equal((await gateway(req('entry/?lang=es&lang=ca'),env,empty)).status,400)
 for(const headers of [{},{Origin:'https://other.example'}]) assert.equal((await gateway(req('responses/',{method:'POST',headers,body:'{}'}),env,empty)).status,403)
})
test('gateway forwards exact bytes and only study credentials to fixed upstream',async()=>{
 const body='{"schema_version":2,"synthetic":true}', calls=[]
 const response=await gateway(req('responses/',{method:'POST',body,headers:{Origin:origin,'Content-Type':'application/json','X-CSRFToken':'test-csrf','X-Local-Submission-ID':'test-id','X-Local-Withdrawal-Key':'ab'.repeat(32),Authorization:'unrelated-secret',Cookie:'unrelated=value; __Host-mpc_api_session=test-session; __Host-mpc_api_csrf=test-csrf','X-Forwarded-Host':'evil.example'}}),env,async(url,init)=>{calls.push({url,init});return new Response('{"saved":true}',{status:201,headers:{'Content-Type':'application/json','Set-Cookie':'__Host-mpc_api_session=new; Path=/; HttpOnly; SameSite=Lax; Secure'}})})
 assert.equal(calls.length,1); const {url,init}=calls[0]
 assert.equal(url,'https://api.soundandmusic.eu/integration/team-f/responses/')
 assert.equal(new TextDecoder().decode(init.body),body)
 assert.equal(init.headers.get('Origin'),origin);assert.equal(init.headers.get('Authorization'),null)
 assert.equal(init.headers.get('X-Forwarded-Host'),null)
 assert.equal(init.headers.get('Cookie'),'__Host-mpc_api_session=test-session; __Host-mpc_api_csrf=test-csrf')
 assert.equal(init.headers.get('X-CSRFToken'),'test-csrf');assert.equal(init.redirect,'manual');assert.equal(init.cache,'no-store')
 assert.equal(response.status,201);assert.equal(response.headers.get('Cache-Control'),'no-store')
 assert.equal(response.headers.getSetCookie().length,1)
})
test('gateway rejects large bodies including requests without content-length',async()=>{
 let called=false;const send=async()=>{called=true;return empty()}
 const response=await gateway(req('responses/',{method:'POST',headers:{Origin:origin},body:'x'.repeat(1024*1024+1)}),env,send)
 assert.equal(response.status,413);assert.equal(called,false)
})
test('gateway rejects redirects and unsafe cookie scope; failures never retry',async()=>{
 const unsafe=['__Host-mpc_api_session=x; Domain=soundandmusic.eu; Path=/; HttpOnly; SameSite=Lax; Secure','__Host-mpc_api_session=x; Path=/; HttpOnly; SameSite=Lax','__Host-mpc_api_session=x; Path=/; SameSite=Lax; Secure']
 for(const cookie of unsafe) assert.equal((await gateway(req('protocol/'),env,async()=>new Response('{}',{headers:{'Set-Cookie':cookie}}))).status,502)
 assert.equal((await gateway(req('protocol/'),env,async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}}))).status,502)
 let calls=0;assert.equal((await gateway(req('protocol/'),env,async()=>{calls++;throw new Error('private diagnostic')})).status,502);assert.equal(calls,1)
})
test('gateway passes the upstream deletion of a stale session cookie as HttpOnly',async()=>{
 const expired='__Host-mpc_api_session=""; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=Lax; Secure'
 const response=await gateway(req('bootstrap/',{headers:{Cookie:'__Host-mpc_api_session=stale'}}),env,async()=>new Response('{"error":"Open the local test notice first."}',{status:403,headers:{'Content-Type':'application/json','Set-Cookie':expired}}))
 assert.equal(response.status,403)
 assert.deepEqual(response.headers.getSetCookie(),[expired+'; HttpOnly'])
 const insecure='__Host-mpc_api_session=""; Max-Age=0; Path=/; SameSite=Lax'
 assert.equal((await gateway(req('bootstrap/'),env,async()=>new Response('{}',{status:403,headers:{'Set-Cookie':insecure}}))).status,502)
})
test('gateway preserves export disposition and rate-limit signal without unrelated cookies',async()=>{
 const response=await gateway(req('export/csv/',{method:'POST',headers:{Origin:origin}}),env,async()=>new Response('csv',{status:429,headers:{'Content-Disposition':'attachment; filename="receipt.csv"','Retry-After':'60','Set-Cookie':'unrelated=x; Path=/; Secure'}}))
 assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');assert.match(response.headers.get('Content-Disposition'),/receipt.csv/);assert.equal(response.headers.get('Set-Cookie'),null)
})
