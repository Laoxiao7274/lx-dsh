/**
 * User-todos panel: a small popover anchored beside the sidebar entry,
 * hosting add / toggle / remove / view over the shell's persisted to-do
 * list. It rides the shell overlay layer; the anchor rectangle is captured
 * by the entry at open time (reopening re-centers it — the panel does not
 * follow a live resize). Outside clicks close through the layer backdrop.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import css from './LxTodosPanel.module.css'
import type { LxTodoItem } from './index.ts'
import type { createTodoPanelStore } from './todo-store.ts'

/** Anchor rectangle captured from the entry button (viewport coordinates). */
export interface TodoAnchorRect {
  readonly left: number
  readonly top: number
  readonly bottom: number
}

/** Injected share (apply-closure callbacks; see {@link ../index.ts}). */
export interface LxTodosPanelInjected {
  /** Add one item from text (empty text is a no-op on the shell side). */
  add: (text: string) => void
  /** Remove one item by id. */
  remove: (id: string) => void
  /** Toggle one item's done flag. */
  toggle: (id: string) => void
}

/** Full props of the user-todos panel. */
export type LxTodosPanelProps = PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createTodoPanelStore>>
  & PropsLocale<'settings.lxShell'> & LxTodosPanelInjected & {
    /** The entry button's rectangle at open time. */
    anchor: TodoAnchorRect
    /** Close the panel (the entry's aria-pressed follows the store). */
    close: () => void
  }

/**
 * Render the user-todos panel.
 * @param props - slot runtime share, the panel store, the locale seat, the
 *   mutation writes, the anchor rectangle, and the close write.
 * @returns the panel, or nothing while closed.
 */
export function LxTodosPanel({
  useStore, actions, t, add, remove, toggle, anchor, close,
}: LxTodosPanelProps): ReactNode {
  const state = useStore(s => s)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState('')

  // Focus the composer on open.
  useEffect(() => {
    if (state.open) inputRef.current?.focus()
  }, [state.open])

  if (!state.open) return null

  const submit = (): void => {
    const text = draft.trim()
    if (text === '') return
    add(text)
    setDraft('')
  }

  const open = state.items.filter(item => !item.done)
  const done = state.items.filter(item => item.done)

  return (
    <>
      {/* Layer backdrop: outside clicks close. The panel itself stops
       * propagation so its own clicks never reach the backdrop. */}
      <div className={css.backdrop} onClick={() => { close() }} aria-hidden />
      <div
        className={css.panel} role="dialog" aria-label={t('todo.title')}
        style={{ left: anchor.left, top: anchor.top }}
        onClick={(e) => { e.stopPropagation() }}
      >
        <div className={css.header}>
          <span className={css.title}>{t('todo.title')}</span>
        </div>
        <div className={css.composer}>
          <input
            ref={inputRef}
            className={css.input}
            type="text"
            placeholder={t('todo.placeholder')}
            value={draft}
            maxLength={500}
            onChange={(e) => { setDraft(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') {
                close()
              }
            }}
          />
          <button type="button" className={css.add} aria-label={t('todo.add')} onClick={submit}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={css.list}>
          {state.loading
            ? <div className={css.hint}>{t('todo.loading')}</div>
            : state.items.length === 0
              ? <div className={css.hint}>{t('todo.empty')}</div>
              : (
                <>
                  {open.map(item => <TodoRow key={item.id} item={item} toggle={toggle} remove={remove} t={t} />)}
                  {done.length > 0 && open.length > 0 && <div className={css.divider} aria-hidden />}
                  {done.map(item => <TodoRow key={item.id} item={item} toggle={toggle} remove={remove} t={t} />)}
                </>
              )}
        </div>
      </div>
    </>
  )
}

/** One row: the done checkbox, the text, and the remove button. */
function TodoRow({ item, toggle, remove, t }: {
  item: LxTodoItem
  toggle: (id: string) => void
  remove: (id: string) => void
  t: LxTodosPanelProps['t']
}): ReactNode {
  return (
    <div className={css.row} data-done={item.done || undefined}>
      <button
        type="button" className={css.check}
        aria-label={t('todo.toggle')} aria-pressed={item.done}
        onClick={() => { toggle(item.id) }}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className={css.text}>{item.text}</span>
      <button
        type="button" className={css.remove}
        aria-label={t('todo.remove')} title={t('todo.remove')}
        onClick={() => { remove(item.id) }}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
