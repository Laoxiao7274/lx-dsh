/**
 * Projection from a quick session's event window to the drawer's exchange
 * turns. Re-derived from the complete window on every publication — the
 * window is a small contiguous tail, so a full pass is cheaper than the
 * incremental bookkeeping a streaming fold would need, and it cannot drift.
 */
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { QuickToolCall, QuickTurn } from './quick-store.ts'

/**
 * Fold the event window into ordered question/answer turns.
 * @param entries - the session's current event window, in seq order.
 * @param running - whether the session has a live turn (a question was sent
 *   and its turn/end has not arrived).
 * @returns the ordered turns; the last one's `running` mirrors `running`.
 */
export function deriveQuickTurns(
  entries: readonly SessionEventLikeEntry[],
  running: boolean,
): QuickTurn[] {
  const turns: QuickTurn[] = []
  let index = 0
  for (const { event } of entries) {
    if (event.type === 'user/message') {
      // Only direct human prompts open a turn; injected contexts stay out.
      if (event.data.source.kind !== 'user') continue
      const text = textOf(event.data.content)
      if (text !== '') {
        index += 1
        turns.push({ id: `q${index}`, question: text, reasoning: '', answer: '', tools: [], running: false })
      }
      continue
    }
    if (event.type === 'assistant/message') {
      const last = turns[turns.length - 1]
      const text = textOf(event.data.message.content)
      if (last !== undefined && text !== '') last.answer = text
      continue
    }
    if (event.type === 'assistant/chunk') {
      const last = turns[turns.length - 1]
      const chunk = event.data.chunk
      if (last === undefined) continue
      if (chunk.type === 'text-delta') last.answer += chunk.text
      else if (chunk.type === 'reasoning-delta') last.reasoning += chunk.text
      continue
    }
    if (event.type === 'tool/call') {
      const last = turns[turns.length - 1]
      if (last !== undefined) last.tools.push({ name: event.data.name })
    }
  }
  const last = turns[turns.length - 1]
  if (last !== undefined && running) last.running = true
  return turns
}

/** Extract joined text blocks from a message content array. */
function textOf(content: readonly unknown[]): string {
  let out = ''
  for (const block of content) {
    if (typeof block === 'object' && block !== null && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') out += text
    }
  }
  return out
}

export type { QuickToolCall }
