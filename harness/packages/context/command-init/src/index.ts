/**
 * Human-facing `/init` command: steer the agent to analyze the project and
 * draft (or, when one exists, improve) its `AGENTS.md`, which the
 * agent-instructions loader then injects into every session opened in the
 * project. The handler only steers; the analysis, the draft, and the file
 * write ride on the agent's normal disciplines (read-only exploration,
 * plan-first, confirmation before writing).
 * @module @deepseek-ai/dsh-command-init
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'

export const name = 'command-init'
export const inject = ['commands']

/** The standard AGENTS.md structure the draft or improvement follows. */
const STRUCTURE = '①项目概述——一段话说清这是什么项目、给谁用、解决什么问题；②构建、测试与常用命令；③代码约定与风格；④目录结构与关键模块；⑤核心业务流与边界（含异常流）；⑥已知坑与注意事项。只写事实、保持精简，多步骤流程与局部规则不塞入。'

/**
 * Build the steer prompt for one project state.
 * @param hasAgents - Whether the project already carries an AGENTS.md.
 * @param extra - User-supplied focus points, already trimmed.
 * @returns The user-message text steering the analysis and draft.
 */
function steerTask(hasAgents: boolean, extra: string): string {
  const tail = extra === '' ? '' : `\n用户补充关注点：${extra}`
  if (hasAgents) {
    return `项目已有 AGENTS.md。请通读它与代码库（只读探索），对照以下标准结构检查缺口——尤其是项目概述与核心业务流两段——以完整替换稿呈现改进建议，仍然成立的原有内容保留，等用户确认后再写入：${STRUCTURE}${tail}`
  }
  return `请分析当前项目并起草 AGENTS.md：先只读探索代码库结构与关键入口，再以完整草稿呈现，等用户确认后再写入。结构要求：${STRUCTURE}${tail}`
}

/**
 * Execute one /init invocation: steer the agent, never write directly.
 * @param invocation - The command invocation carrying the receiving agent.
 * @returns The human-facing outcome of the steer.
 */
function executeInit(invocation: CommandInvocation): CommandResult {
  const cwd = invocation.agent.session.header.cwd
  if (cwd === undefined) return { kind: 'error', text: 'No working directory available for /init.' }
  const hasAgents = existsSync(join(cwd, 'AGENTS.md'))
  const extra = invocation.rawInput.trim()
  invocation.agent.steer(createUserMessage({
    content: [{ type: 'text', text: steerTask(hasAgents, extra) }],
    source: { kind: 'user' },
  }))
  return {
    kind: 'success',
    text: hasAgents
      ? 'Analyzing the project to improve AGENTS.md — a draft will be presented for your confirmation.'
      : 'Analyzing the project to draft AGENTS.md — a draft will be presented for your confirmation.',
  }
}

/**
 * Register `/init` for every composed human-command adapter.
 * @param ctx - context carrying the command registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.commands.register({
    name: 'init',
    description: 'Analyze this project and draft (or improve) its AGENTS.md — business overview, commands, conventions, structure, pitfalls. The draft is presented for your confirmation before anything is written.',
    input: { hint: '[补充关注点]', images: false },
    handler: executeInit,
  }), 'command-init lifecycle')
}
