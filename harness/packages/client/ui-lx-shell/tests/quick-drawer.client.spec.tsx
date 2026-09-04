// @vitest-environment jsdom
/** LxQuickDrawer: the right-side quick-answers panel — open state, ask, reset. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxQuickDrawer, type LxQuickDrawerProps } from '../src/client/LxQuickDrawer.tsx'
import { createQuickDrawerStore, type QuickDrawerState } from '../src/client/quick-store.ts'
import { deriveQuickTurns } from '../src/client/quick-turns.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

type StoreInstance = ReturnType<ReturnType<typeof createQuickDrawerStore>['create']>

function mountInstance(): StoreInstance {
  return createQuickDrawerStore().create()
}

function mountDrawer(store: StoreInstance, turns?: ReturnType<typeof store.getSnapshot>['turns']) {
  const ask = vi.fn()
  const reset = vi.fn()
  if (turns !== undefined) store.actions.setTurns(turns)
  const props = {
    ask,
    reset,
    useStore: (selector: (s: QuickDrawerState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxQuickDrawerProps
  render(<LxQuickDrawer {...props} />)
  return { ask, reset }
}

describe('LxQuickDrawer', () => {
  it('renders nothing while closed', () => {
    const store = mountInstance()
    const props = {
      ask: vi.fn(), reset: vi.fn(),
      useStore: (selector: (s: QuickDrawerState) => unknown) => selector(store.getSnapshot()),
      actions: store.actions,
      t: (key: string) => COPY[key as LxShellKey] ?? key,
    } as unknown as LxQuickDrawerProps
    const { container } = render(<LxQuickDrawer {...props} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the empty hint and sends a typed question on Enter', () => {
    const store = mountInstance()
    store.actions.open()
    const { ask } = mountDrawer(store)
    expect(screen.getByText(en['quick.empty'])).toBeTruthy()
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '深空探测的最新进展？' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ask).toHaveBeenCalledExactlyOnceWith('深空探测的最新进展？')
    expect(input.value).toBe('')
  })

  it('Enter with shift does not send; blank input does not send', () => {
    const store = mountInstance()
    store.actions.open()
    const { ask } = mountDrawer(store)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '多行' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(ask).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ask).not.toHaveBeenCalled()
  })

  it('renders turns with reasoning, tools, and errors', () => {
    const store = mountInstance()
    store.actions.open()
    mountDrawer(store, [
      { id: 'q1', question: 'a?', reasoning: '想一想', answer: 'answer one', tools: [{ name: 'web_search' }], running: false },
      { id: 'q2', question: 'b?', reasoning: '', answer: 'answering', tools: [], running: true },
    ])
    expect(screen.getByText('a?')).toBeTruthy()
    expect(screen.getByText('answer one')).toBeTruthy()
    expect(screen.getByText('answering')).toBeTruthy()
    expect(screen.getByText(en['quick.think'])).toBeTruthy()
    expect(screen.getByText('web_search')).toBeTruthy()
  })

  it('close and reset dispatch their actions', () => {
    const store = mountInstance()
    store.actions.open()
    const { reset } = mountDrawer(store)
    fireEvent.click(screen.getByRole('button', { name: en['quick.close'] }))
    expect(store.getSnapshot().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: en['quick.reset'] }))
    expect(reset).toHaveBeenCalledExactlyOnceWith()
  })
})

describe('deriveQuickTurns', () => {
  const entry = (event: { type: string } & Record<string, unknown>) =>
    ({ type: 'event', event: { type: event.type, data: event } }) as never

  it('folds a human question, streamed chunks, and the final message', () => {
    const turns = deriveQuickTurns([
      entry({ type: 'user/message', source: { kind: 'user' }, content: [{ type: 'text', text: '问一下' }] }),
      entry({ type: 'assistant/chunk', chunk: { type: 'reasoning-delta', text: '先想想' } }),
      entry({ type: 'tool/call', name: 'web_search' }),
      entry({ type: 'assistant/chunk', chunk: { type: 'text-delta', text: '部分' } }),
      entry({ type: 'assistant/chunk', chunk: { type: 'text-delta', text: '回答' } }),
      entry({ type: 'assistant/message', message: { content: [{ type: 'text', text: '完整回答' }] } }),
    ], false)
    expect(turns).toEqual([
      { id: 'q1', question: '问一下', reasoning: '先想想', answer: '完整回答', tools: [{ name: 'web_search' }], running: false },
    ])
  })

  it('ignores injected contexts and marks a running turn', () => {
    const turns = deriveQuickTurns([
      entry({ type: 'user/message', source: { kind: 'plugin' }, content: [{ type: 'text', text: '上下文' }] }),
      entry({ type: 'user/message', source: { kind: 'user' }, content: [{ type: 'text', text: 'q' }] }),
    ], true)
    expect(turns).toEqual([
      { id: 'q1', question: 'q', reasoning: '', answer: '', tools: [], running: true },
    ])
  })
})
