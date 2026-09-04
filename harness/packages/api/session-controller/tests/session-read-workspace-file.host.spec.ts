import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionTestRemote } from './test-remote.ts'

async function context(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  return ctx
}

describe('session/readWorkspaceFile', () => {
  it('returns whole-file UTF-8 text for a text read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lx-rwf-'))
    try {
      const file = join(dir, 'notes.md')
      await writeFile(file, '# hello\n', 'utf8')
      const remote = createSessionTestRemote(await context(), {
        defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
        cwd: dir,
      })
      await expect(remote.readWorkspaceFile(
        { sessionId: 's1' as never, path: file, as: 'text' },
      )).resolves.toEqual({
        ok: true,
        value: { kind: 'text', text: '# hello\n', byteSize: 8, truncated: false },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns base64 bytes with an extension-derived media type', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lx-rwf-'))
    try {
      const file = join(dir, 'capture.png')
      await writeFile(file, Uint8Array.of(1, 2, 250))
      const remote = createSessionTestRemote(await context(), {
        defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
        cwd: dir,
      })
      await expect(remote.readWorkspaceFile(
        { sessionId: 's1' as never, path: file, as: 'bytes' },
      )).resolves.toEqual({
        ok: true,
        value: { kind: 'bytes', mediaType: 'image/png', data: 'AQL6', byteSize: 3 },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('falls back to a generic stream media type for unknown extensions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lx-rwf-'))
    try {
      const file = join(dir, 'blob.ckpt')
      await writeFile(file, Uint8Array.of(9))
      const remote = createSessionTestRemote(await context(), {
        defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
        cwd: dir,
      })
      await expect(remote.readWorkspaceFile(
        { sessionId: 's1' as never, path: file, as: 'bytes' },
      )).resolves.toMatchObject({
        ok: true,
        value: { kind: 'bytes', mediaType: 'application/octet-stream', byteSize: 1 },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects a missing file as workspace/not-found', async () => {
    const remote = createSessionTestRemote(await context(), {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: '/default',
    })
    await expect(remote.readWorkspaceFile(
      { sessionId: 's1' as never, path: '/definitely/absent.md', as: 'text' },
    )).resolves.toMatchObject({ ok: false, error: { code: 'session/file-not-found' } })
  })

  it('rejects an empty path before touching the filesystem', async () => {
    const remote = createSessionTestRemote(await context(), {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: '/default',
    })
    await expect(remote.readWorkspaceFile(
      { sessionId: 's1' as never, path: '  ', as: 'text' },
    )).resolves.toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
  })

  it('enforces the configured cap for each delivery form', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lx-rwf-'))
    try {
      const file = join(dir, 'big.bin')
      await writeFile(file, Uint8Array.of(7, 7, 7))
      const remote = createSessionTestRemote(await context(), {
        defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
        cwd: dir,
        textReadCapBytes: 2,
        bytesReadCapBytes: 2,
      })
      await expect(remote.readWorkspaceFile(
        { sessionId: 's1' as never, path: file, as: 'text' },
      )).resolves.toMatchObject({
        ok: false,
        error: { code: 'session/file-too-large', details: { byteSize: 3, cap: 2 } },
      })
      await expect(remote.readWorkspaceFile(
        { sessionId: 's1' as never, path: file, as: 'bytes' },
      )).resolves.toMatchObject({ ok: false, error: { code: 'session/file-too-large' } })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('translates a pre-read abort into the cancellation error', async () => {
    const remote = createSessionTestRemote(await context(), {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: '/default',
    })
    const aborted = new AbortController()
    aborted.abort()
    await expect(remote.readWorkspaceFile(
      { sessionId: 's1' as never, path: '/some/file.md', as: 'text' },
      aborted.signal,
    )).resolves.toMatchObject({ ok: false, error: { code: 'gateway/cancelled' } })
  })
})
