/**
 * Quick-answers drawer state: the open flag, the bound quick session, and
 * the message list projected from the session's event window. The apply body
 * owns the session lifecycle (create with the quick-answers preset, open the
 * event window, subscribe); this store carries only the render-facing
 * projection so the drawer stays a pure-props component.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One tool call inside a quick-answers turn (search and friends). */
export interface QuickToolCall {
  /** The tool's registered name (e.g. web_search). */
  readonly name: string
}

/** One rendered exchange turn. */
export interface QuickTurn {
  /** Session-scoped identity for list keys. */
  readonly id: string
  /** The user's question, verbatim. */
  readonly question: string
  /** Assistant reasoning so far (streaming deltas append). */
  reasoning: string
  /** Assistant text so far (streaming deltas append). */
  answer: string
  /** Tool calls the turn made, in order. */
  tools: QuickToolCall[]
  /** Whether the answering turn is still running. */
  running: boolean
}

/** The drawer's presentation mode: never opened, expanded, or hidden. */
export type QuickDrawerMode = 'closed' | 'expanded' | 'collapsed'

/** Render-facing quick-answers drawer state. */
export interface QuickDrawerState {
  /** Drawer presentation: closed/collapsed hide it; only the label differs. */
  mode: QuickDrawerMode
  /** The quick session; undefined until the first open creates one. */
  sessionId: SessionId | undefined
  /** Exchange turns in order. */
  turns: readonly QuickTurn[]
  /** A create/prompt failure the drawer surfaces. */
  error: string | undefined
}

/** Declared action shape giving the exported factory a stable return type. */
export type QuickDrawerActions = {
  /** Expand the drawer (an entry click). */
  expand: (draft: QuickDrawerState) => void
  /** Collapse to hidden (keeps the session and turns). */
  collapse: (draft: QuickDrawerState) => void
  /** Hide entirely (kept for the close affordance the shell may offer). */
  close: (draft: QuickDrawerState) => void
  /** Expand when hidden, collapse when expanded. */
  toggle: (draft: QuickDrawerState) => void
  /** Bind a newly created quick session (apply body calls this after create). */
  bindSession: (draft: QuickDrawerState, id: SessionId) => void
  /** Replace the whole turn list from a fresh event-window projection. */
  setTurns: (draft: QuickDrawerState, turns: readonly QuickTurn[]) => void
  /** A create/prompt failure the drawer surfaces. */
  setError: (draft: QuickDrawerState, message: string | undefined) => void
}

/**
 * Factory for the quick-answers drawer store. Declared at register in
 * {@link ../index.ts} — one instance per shell (module-level handles are
 * forbidden).
 * @returns the store handle (snapshot source + bound actions).
 */
export function createQuickDrawerStore(): EngineStoreHandle<QuickDrawerState, QuickDrawerActions> {
  return defineStore({
    init: (): QuickDrawerState => ({ mode: 'closed', sessionId: undefined, turns: [], error: undefined }),
    actions: {
      expand: (d) => { d.mode = 'expanded' },
      collapse: (d) => {
        if (d.mode !== 'closed') d.mode = 'collapsed'
      },
      close: (d) => { d.mode = 'closed' },
      toggle: (d) => {
        d.mode = d.mode === 'expanded' ? 'collapsed' : 'expanded'
      },
      bindSession: (d, id) => {
        d.sessionId = id
        d.turns = []
        d.error = undefined
      },
      setTurns: (d, turns) => { d.turns = turns },
      setError: (d, message) => { d.error = message },
    },
  })
}
