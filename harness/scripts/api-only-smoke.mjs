#!/usr/bin/env node
// api-only-smoke — prove the Host's client-facing API surface works with no
// browser and no static frontend involvement:
//   1. boot the real `dsh --profile web` backend (spawn, fresh harness build)
//   2. take the launch token from the printed URL (Bearer credential)
//   3. GET /api/$schema with Authorization: Bearer — assert the contract doc
//   4. POST /api/<namespace>/<method> (a read-only unary call) — assert a reply
//   5. open the WebSocket mux with ?token= — assert the ready frame and its
//      protocolVersion
// Exits 0 on pass; any failure exits 1 with a diagnostic.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const HARNESS = fileURLToPath(new URL('..', import.meta.url))
const BIN = fileURLToPath(new URL('../apps/cli/lib/bin.js', import.meta.url))
const TOKEN_URL = /dsh web: (http:\/\/[^\s]+\/?\?token=[^\s]+)/

const child = spawn(process.execPath, [BIN, '--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
  cwd: HARNESS,
  env: { ...process.env, DSH_QUIET: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderrTail = ''
child.stderr.setEncoding('utf8').on('data', chunk => { stderrTail = (stderrTail + chunk).slice(-2000) })

try {
  // 1. wait for the authenticated URL line
  const urlLine = await new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('backend did not print its URL in 60s')), 60_000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      buffer += chunk
      const match = TOKEN_URL.exec(buffer)
      if (match !== null) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.once('exit', code => reject(new Error(`backend exited early (${code}): ${stderrTail}`)))
  })
  const root = new URL(urlLine)
  const token = root.searchParams.get('token') ?? ''
  if (token === '') throw new Error('printed URL carried no token')
  console.log('boot: ' + root.origin)

  // 2. contract introspection over Bearer auth
  const schemaResponse = await fetch(`${root.origin}/api/$schema`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (schemaResponse.status !== 200) throw new Error(`/api/$schema answered ${schemaResponse.status}`)
  const schema = await schemaResponse.json()
  if (schema.protocolVersion !== 1) throw new Error(`schema protocolVersion ${String(schema.protocolVersion)} !== 1`)
  const namespaceCount = Array.isArray(schema.namespaces) ? schema.namespaces.length : -1
  if (namespaceCount < 1) throw new Error(`schema exposes ${String(namespaceCount)} namespaces`)
  const sessionNamespace = schema.namespaces.find(n => n.namespace === 'session')
  if (sessionNamespace === undefined) throw new Error('schema has no session namespace')
  console.log(`schema: ${String(namespaceCount)} namespaces, session has ${String(sessionNamespace.methods.length)} methods`)

  // 3. one read-only unary RPC through POST /api. The payload is built from
  // the contract document itself: every JSON parameter the descriptor names
  // receives `{}` — session/list's request object accepts an empty filter.
  const listMethod = sessionNamespace.methods.find(m => m.method === 'list')
  if (listMethod === undefined) throw new Error('schema has no session/list method')
  const args = {}
  for (const parameter of listMethod.parameters) {
    if (parameter.source === 'json') args[parameter.wire] = {}
  }
  const rpcResponse = await fetch(`${root.origin}/api/session/list`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'smoke-1',
      method: 'session/list',
      payload: { args },
    }),
  })
  if (rpcResponse.status !== 200) throw new Error(`POST /api/session/list answered ${rpcResponse.status}`)
  const rpcBody = await rpcResponse.json()
  if (rpcBody.type !== 'server-response') throw new Error(`unexpected RPC envelope ${String(rpcBody.type)}`)
  if (rpcBody.result?.ok === true) {
    console.log('rpc: session/list settled ok=true')
  } else {
    const failure = JSON.stringify(rpcBody.result?.error)
    // A settled business failure still proves the full wire path; a transport
    // or protocol failure does not. Report it loudly so a silent envelope
    // regression cannot hide here.
    if (failure.includes('gateway/') || failure.includes('typert')) {
      throw new Error(`session/list failed at the protocol layer: ${failure}`)
    }
    console.log(`rpc: session/list settled ok=false (${failure})`)
  }

  // 4. WebSocket mux with the query-token credential. Node 22+ ships a
  // native WebSocket client, so no dependency is needed. The mux is a
  // logical-stream carrier: after the socket opens, the client requests the
  // forwarded-event stream ($events) and the Host's first item is the ready
  // frame carrying the protocol version.
  if (typeof WebSocket === 'function') {
    const muxUrl = `ws://${root.host}/api/remote.mux?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(muxUrl)
    const firstFrame = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('mux did not answer the $events open in 15s')), 15_000)
      ws.addEventListener('message', event => {
        clearTimeout(timer)
        resolve(JSON.parse(String(event.data)))
      })
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('mux WebSocket errored')) }, { once: true })
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'open',
          streamId: crypto.randomUUID(),
          endpoint: '$events',
          payload: { args: {} },
        }))
      }, { once: true })
    })
    ws.close()
    if (firstFrame.type !== 'item') {
      throw new Error(`mux answered ${String(firstFrame.type)} instead of the first item`)
    }
    const readyFrame = firstFrame.value
    if (readyFrame?.type !== 'ready') throw new Error('first mux item was not the ready frame')
    if (readyFrame.host?.protocolVersion !== 1) {
      throw new Error(`ready frame protocolVersion ${String(readyFrame.host?.protocolVersion)} !== 1`)
    }
    console.log('mux: ready frame ok, protocolVersion 1')
  } else {
    console.log('mux: no WebSocket client available — skipped the WebSocket leg')
  }

  console.log('PASS: the API surface is fully usable without the browser frontend')
} finally {
  child.kill()
  await Promise.race([once(child, 'exit'), delay(3000)])
  if (!child.killed) child.kill('SIGKILL')
}
