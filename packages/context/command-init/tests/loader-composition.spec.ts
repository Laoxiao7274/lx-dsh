import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import * as commandInit from '@deepseek-ai/dsh-command-init'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('command-init real Loader composition', () => {
  it('discovers and executes /init through the assembled command plane', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-init-loader-'))
    const configPath = join(root, 'cordis.yml')
    await (await import('node:fs/promises')).writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-commands'",
      "- name: '@deepseek-ai/dsh-command-init'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const steer = vi.fn()
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-commands', CommandRuntime],
      ['@deepseek-ai/dsh-command-init', commandInit],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const session = Session.create(SessionId('loader-command-init'), undefined, {
      version: SESSION_FORMAT_VERSION,
      id: SessionId('loader-command-init'),
      createdAt: Date.now(),
      isSeeded: false,
      cwd: root,
    })
    const agent = {
      session,
      status: 'idle',
      options: {},
      reserveTurnAdmission: () => () => undefined,
      steer,
    } as unknown as Agent
    const listed = context.commands.list(agent).find(command => command.name === 'init')
    expect(listed).toMatchObject({
      description: 'Analyze this project and draft (or improve) its AGENTS.md — business overview, commands, conventions, structure, pitfalls. The draft is presented for your confirmation before anything is written.',
      input: { hint: '[补充关注点]' },
    })
    const execution = await context.commands.execute(agent, '/init', [], new AbortController().signal)
    if (execution === undefined) throw new Error('Loader composition did not resolve /init')
    expect(execution.result).toEqual({
      kind: 'success',
      text: 'Analyzing the project to draft AGENTS.md — a draft will be presented for your confirmation.',
    })
    expect(steer).toHaveBeenCalledOnce()
    expect(session.snapshotEvents().map((event: { type: string, data: unknown }) => ({ type: event.type, data: event.data }))).toEqual([
      {
        type: 'command/run',
        data: {
          commandId: execution.commandId,
          name: 'init',
          args: '',
          source: { kind: 'user' },
        },
      },
      {
        type: 'command/done',
        data: {
          commandId: execution.commandId,
          kind: 'success',
          text: 'Analyzing the project to draft AGENTS.md — a draft will be presented for your confirmation.',
        },
      },
    ])
  })
})
