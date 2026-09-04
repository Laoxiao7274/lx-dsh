// @vitest-environment jsdom
/** LxQuickDrawer: the left-anchored collapsible quick-answers panel — handle toggle, ask, reset. */
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
  it('stays mounted while collapsed and reports the collapsed state', () => {
    const store = mountInstance()
    const props = {
      ask: vi.fn(), reset: vi.fn(),
      useStore: (selector: (s: QuickDrawerState) => unknown) => selector(store.getSnapshot()),
      actions: store.actions,
      t: (key: string) => COPY[key as LxShellKey] ?? key,
    } as unknown as LxQuickDrawerProps
    render(<LxQuickDrawer {...props} />)
    // The collapse handle reports the collapsed state; the panel body stays
    // mounted (scroll and draft state survive collapse — only the CSS hides
    // it, which jsdom does not load, so the structural contract is asserted
    // here and the browser smoke owns the visual collapse). The stubbed
    // useStore does not subscribe, so post-click state is asserted on the
    // store, not on a re-render that never happens.
    const handle = screen.getByRole('button', { name: en['quick.label'] })
    expect(handle.getAttribute('aria-expanded')).toBe('false')
    expect(handle.hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('complementary')).toBeTruthy()
    fireEvent.click(handle)
    expect(store.getSnapshot().open).toBe(true)
  })

  it('expands through the handle and sends a typed question on Enter', () => {
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

  it('the handle toggles collapse and reset dispatches its action', () => {
    const store = mountInstance()
    store.actions.open()
    const { reset } = mountDrawer(store)
    const handle = screen.getByRole('button', { name: en['quick.label'] })
    expect(handle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(handle)
    expect(store.getSnapshot().open).toBe(false)
    fireEvent.click(handle)
    expect(store.getSnapshot().open).toBe(true)
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
