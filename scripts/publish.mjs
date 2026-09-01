/**
 * Publish the built LX-DSH installer to the update server in one step.
 *
 * Usage: node scripts/publish.mjs [installer-path]
 *   - installer-path defaults to dist/LX-DSH Setup <version>.exe
 *   - credentials come from lx-dsh/.env.publish (LX_UPDATE_ADMIN_USER /
 *     LX_UPDATE_ADMIN_PASS) or the environment; that file is git-ignored
 *
 * The endpoint is the update server's one-shot publish API: it creates or
 * updates the version record (summary = RELEASE_NOTES text, notes = bullet
 * list) and upserts the win asset in one multipart call, so a release is one
 * command after `pnpm run dist:full`.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Credentials: environment first, then .env.publish (KEY=VALUE lines).
function loadEnvPublish() {
  const path = join(root, '.env.publish')
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m !== null) out[m[1]] = m[2]
  }
  return out
}
const env = { ...loadEnvPublish(), ...process.env }
const BASE = env.LX_UPDATE_SERVER ?? 'http://123.57.129.111'
const USER = env.LX_UPDATE_ADMIN_USER
const PASS = env.LX_UPDATE_ADMIN_PASS
if (USER === undefined || PASS === undefined) {
  console.error('publish: set LX_UPDATE_ADMIN_USER / LX_UPDATE_ADMIN_PASS (env or lx-dsh/.env.publish)')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
// Only the releasing version's own section reaches the update dialog: the
// file keeps one cumulative ledger, but the changelog a user sees while
// updating from x.y.z must describe x.y.(z+1) alone, not the whole history.
const fullNotes = existsSync(join(root, 'RELEASE_NOTES.md'))
  ? readFileSync(join(root, 'RELEASE_NOTES.md'), 'utf8').trim()
  : ''
const sectionHeader = new RegExp(`^# LX-DSH ${version.replace(/\./g, '\\.')} 更新日志\\s*$`, 'm')
const sectionStart = fullNotes.search(sectionHeader)
const notesText = sectionStart === -1
  ? fullNotes
  : fullNotes
    .slice(sectionStart)
    .split(/^# LX-DSH \d+\.\d+\.\d+ 更新日志\s*$/m)
    .filter(part => part.trim() !== '')
    .at(0)
    ?.trim() ?? ''
const bullets = notesText.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2).trim())

const installer = process.argv[2] ?? join(root, 'dist', `LX-DSH Setup ${version}.exe`)
if (!existsSync(installer)) {
  console.error(`publish: installer missing: ${installer} — build it first (pnpm run dist:full)`)
  process.exit(1)
}
const size = statSync(installer).size

// Login for the bearer token.
const loginRes = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER, password: PASS }),
})
if (!loginRes.ok) {
  console.error(`publish: login failed ${loginRes.status}`)
  process.exit(1)
}
const { token } = await loginRes.json()

// One-shot publish: multipart file + version metadata.
const form = new FormData()
const bytes = readFileSync(installer)
form.set('file', new Blob([bytes]), `LX-DSH-Setup-${version}.exe`)
form.set('version', version)
form.set('channel', 'stable')
form.set('date', new Date().toISOString().slice(0, 10))
form.set('summary', notesText)
form.set('notes', JSON.stringify(bullets))
form.set('platform', 'win')
const publishRes = await fetch(`${BASE}/api/admin/publish`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
const publishBody = await publishRes.json()
if (!publishRes.ok) {
  console.error(`publish: failed ${publishRes.status}`, publishBody)
  process.exit(1)
}
console.log(`published: ${publishBody.filename} (${(publishBody.size / 1048576).toFixed(1)} MB)`)

// Verify the public manifest reflects the release before declaring success.
const latest = await (await fetch(`${BASE}/update/win/latest.json`)).json()
if (latest.version !== version || latest.size !== size) {
  console.error(`publish: manifest mismatch — served v${latest.version} size ${latest.size}, expected v${version} size ${size}`)
  process.exit(1)
}
console.log(`verified: /update/win/latest.json serves v${latest.version}${latest.notes === null || latest.notes === undefined ? '' : ` with changelog (${latest.notes.length} chars)`}`)
