import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import * as commandInit from '@deepseek-ai/dsh-command-init'

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
  readonly steer: ReturnType<typeof vi.fn>
  readonly plugin: Awaited<ReturnType<Context['plugin']>>
}

async function harness(cwd?: string): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(CommandRuntime)
  const plugin = await ctx.plugin(commandInit)
  const steer = vi.fn()
  const session = Session.create(SessionId('command-init'), undefined, {
    version: SESSION_FORMAT_VERSION,
    id: SessionId('command-init'),
    createdAt: Date.now(),
    isSeeded: false,
    ...(cwd === undefined ? {} : { cwd }),
  })
  const agent = {
    session,
    status: 'idle',
    options: {},
    reserveTurnAdmission: () => () => undefined,
    steer,
  } as unknown as Agent
  return { ctx, agent, steer, plugin }
}

async function run(test: Harness, suffix = ''): Promise<{ kind: string; text: string }> {
  const execution = await test.ctx.commands.execute(test.agent, `/init${suffix}`, [], new AbortController().signal)
  if (execution === undefined) throw new Error('init command was not registered')
  return execution.result as { kind: string; text: string }
}

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('@deepseek-ai/dsh-command-init registration', () => {
  it('registers the steer-only command with Loader-safe exports and disposes it', async () => {
    const test = await harness()
    expect(commandInit.name).toBe('command-init')
    expect(commandInit.inject).toEqual(['commands'])
    expect('default' in commandInit).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(commandInit)).toBe(commandInit)
    const listed = test.ctx.commands.list(test.agent).find(command => command.name === 'init')
    expect(listed).toMatchObject({
      description: 'Analyze this project and draft (or improve) its AGENTS.md — business overview, commands, conventions, structure, pitfalls. The draft is presented for your confirmation before anything is written.',
      input: { hint: '[补充关注点]' },
    })

    await test.plugin.dispose()
    expect(test.ctx.commands.find(test.agent, 'init')).toBeUndefined()
  })
})

describe('/init human command', () => {
  it('errors when the session carries no working directory', async () => {
    const test = await harness()
    expect(await run(test)).toEqual({
      kind: 'error',
      text: 'No working directory available for /init.',
    })
    expect(test.steer).not.toHaveBeenCalled()
  })

  it('steers a fresh draft when no AGENTS.md exists', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-init-draft-'))
    const test = await harness(root)
    const result = await run(test)
    expect(result).toEqual({
      kind: 'success',
      text: 'Analyzing the project to draft AGENTS.md — a draft will be presented for your confirmation.',
    })
    const message = test.steer.mock.calls[0]![0] as UserMessage
    expect(message.source).toEqual({ kind: 'user' })
    const text = (message.content[0] as { text: string }).text
    expect(text).toContain('请分析当前项目并起草 AGENTS.md')
    expect(text).not.toContain('用户补充关注点')
  })

  it('steers an improvement when AGENTS.md exists and appends focus points', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-init-improve-'))
    await writeFile(join(root, 'AGENTS.md'), '# existing\n', 'utf8')
    const test = await harness(root)
    const result = await run(test, ' 重点关注部署脚本  ')
    expect(result).toEqual({
      kind: 'success',
      text: 'Analyzing the project to improve AGENTS.md — a draft will be presented for your confirmation.',
    })
    const message = test.steer.mock.calls[0]![0] as UserMessage
    const text = (message.content[0] as { text: string }).text
    expect(text).toContain('项目已有 AGENTS.md')
    expect(text.endsWith('用户补充关注点：重点关注部署脚本')).toBe(true)
  })

  it('records the command lifecycle without touching model history', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-init-lifecycle-'))
    const test = await harness(root)
    await run(test, ' notes')
    const lifecycle = test.agent.session.snapshotEvents()
      .filter((event: { type: string }) => event.type === 'command/run' || event.type === 'command/done')
      .map((event: SessionEvent) => ({ type: event.type, data: event.data as { commandId: string } }))
    const commandId = lifecycle[0]!.data.commandId
    expect(lifecycle).toEqual([
      {
        type: 'command/run',
        data: {
          commandId,
          name: 'init',
          args: ' notes',
          source: { kind: 'user' },
        },
      },
      {
        type: 'command/done',
        data: {
          commandId,
          kind: 'success',
          text: 'Analyzing the project to draft AGENTS.md — a draft will be presented for your confirmation.',
        },
      },
    ])
    expect(test.agent.session.surface.nodes).toEqual([])
    expect(test.agent.session.deriveMessages()).toEqual([])
  })
})
