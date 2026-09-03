/**
 * LX-DSH Session Header window chrome: the plugin manager and the window
 * controls a frameless window needs, rendered at the far right of the Session
 * Header row. (The update affordance lives on the sidebar brand row, beside
 * the version it upgrades — see LxUpdateButton.) The owning header doubles as
 * the window drag region (see drag.css): this component stamps `data-lx-drag`
 * onto it at mount and removes the stamp at unmount, so no foreign selector
 * is ever targeted.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import './drag.css'
import css from './HeaderChrome.module.css'

/** The window-control face of the shell bridge (typed structurally). */
export interface LxWindowBridge {
  min: () => void
  max: () => void
  close: () => void
}

/** The plugin-manager face of the shell bridge (typed structurally). */
export interface LxPluginsBridge {
  open: () => Promise<unknown>
}

/** Where an open-in-tool request lands; the shell maps each to its launcher. */
export type LxEditorTarget = 'vscode' | 'cursor' | 'explorer'

/** The open-in-editor face of the shell bridge (typed structurally). */
export interface LxEditorBridge {
  open: (cwd: string, target: LxEditorTarget) => Promise<{ ok: boolean; error?: string }>
}

/** Injected business face: the shell writes (t rides the standard locale seat). */
export interface LxHeaderChromeInjected {
  min: () => void
  max: () => void
  close: () => void
  openPlugins: () => void
  /** Opens the session's project folder in the desktop editor; absent when
   * the running shell predates the editor bridge (the button stays hidden). */
  openEditor?: (cwd: string, target: LxEditorTarget) => void
}

/** Full component props: runtime share + locale + injected face. Mounted both
 * in the Session Header utilities (sessionId present) and the no-Session hero
 * utilities band (no sessionId; the editor picker disables for lack of a
 * working directory). */
export type LxHeaderChromeProps =
  (PropsRuntime<'conversation.session.header.utilities'> | PropsRuntime<'conversation.hero.utilities'>)
  & PropsLocale<'settings.lxShell'> & LxHeaderChromeInjected

/** 10px window-control glyphs (the primitives set ships no window chrome). */
export function MinGlyph(): ReactNode {
  return <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" /></svg>
}
export function MaxGlyph(): ReactNode {
  return <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
}
export function CloseGlyph(): ReactNode {
  return <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" /></svg>
}
export function PluginGlyph(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5.5 2.5a1.5 1.5 0 0 1 3 0V4h2A1.5 1.5 0 0 1 12 5.5v2h1.5a1.5 1.5 0 0 1 0 3H12v2A1.5 1.5 0 0 1 10.5 14h-2v-1.5a1.5 1.5 0 0 0-3 0V14h-2A1.5 1.5 0 0 1 2 12.5v-2h1.5a1.5 1.5 0 0 0 0-3H2v-2A1.5 1.5 0 0 1 3.5 4h2V2.5Z"
        fill="none" stroke="currentColor" strokeWidth="1.2"
      />
    </svg>
  )
}

/** 14px `</>` glyph: the open-in-editor affordance. */
function EditorGlyph(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5.5 5-3 3 3 3" />
      <path d="m10.5 5 3 3-3 3" />
      <path d="m9.2 3.6-2.4 8.8" />
    </svg>
  )
}

/** 10px dropdown chevron for the editor menu split button. */
function EditorMenuGlyph(): ReactNode {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2 3.8 3 3 3-3" />
    </svg>
  )
}

/** One selectable open-target row; extensible as new launchers land. */
const EDITOR_TARGETS: readonly { id: LxEditorTarget; labelKey: 'chrome.editor.vscode' | 'chrome.editor.cursor' | 'chrome.editor.explorer' }[] = [
  { id: 'vscode', labelKey: 'chrome.editor.vscode' },
  { id: 'cursor', labelKey: 'chrome.editor.cursor' },
  { id: 'explorer', labelKey: 'chrome.editor.explorer' },
]

const EDITOR_LABEL_KEYS: Readonly<Record<LxEditorTarget, 'chrome.editor.vscode' | 'chrome.editor.cursor' | 'chrome.editor.explorer'>> = {
  vscode: 'chrome.editor.vscode',
  cursor: 'chrome.editor.cursor',
  explorer: 'chrome.editor.explorer',
}

/**
 * Stamp the window drag region onto an owned host: `data-lx-drag` turns the
 * element into the frameless window's drag band (see drag.css), double-click
 * toggles maximize, and interactive children opt out through the stylesheet's
 * no-drag rules. Returns the cleanup that unstamps.
 * @param host - the element to claim, or null (no-op).
 * @param onMax - the maximize/restore write for the double-click affordance.
 * @returns the disposer restoring the host.
 */
export function claimWindowDragRegion(host: HTMLElement | null | undefined, onMax: () => void): () => void {
  if (host === null || host === undefined) return () => {}
  host.setAttribute('data-lx-drag', '')
  const onDoubleClick = (event: MouseEvent): void => {
    if ((event.target as HTMLElement | null)?.closest('button, input, select, textarea, a, [role="tab"]') !== null) return
    onMax()
  }
  host.addEventListener('dblclick', onDoubleClick)
  return () => {
    host.removeEventListener('dblclick', onDoubleClick)
    host.removeAttribute('data-lx-drag')
  }
}

/**
 * Render the window chrome strip and claim the owning header as the drag
 * region. The strip rides the Session Header's utilities seat, so it appears
 * exactly where a titlebar's controls would — at the top-right edge.
 * @param props - composed slot props.
 * @returns the chrome element tree.
 */
export function LxHeaderChrome(props: LxHeaderChromeProps): ReactNode {
  const { t, useSessions, min, max, close, openPlugins, openEditor } = props
  // Present only in the Session Header seat; the hero seat has none.
  const sessionId = 'sessionId' in props ? props.sessionId : undefined
  const ref = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // The session's project folder; the editor picker is inert without one.
  const cwd = useSessions(list => sessionId === undefined ? undefined : list.byId[sessionId]?.cwd)
  const noCwd = cwd === undefined || cwd === ''
  // The last launcher the user picked; shown on the picker and pre-checked.
  const [target, setTarget] = useState<LxEditorTarget>('vscode')

  // The Session Header owns the drag region while a Session is open; the
  // hero utilities band owns it otherwise.
  useEffect(() => claimWindowDragRegion(
    ref.current?.closest('header, [data-hero-utilities]'),
    max,
  ), [max])

  const entries: readonly MenuEntry[] = EDITOR_TARGETS.map(({ id, labelKey }) => ({
    id,
    label: t(labelKey),
    disabled: noCwd,
  }))

  return (
    <div ref={ref} className={css.strip}>
      {openEditor !== undefined && (
        <Menu
          open={menuOpen}
          onClose={() => { setMenuOpen(false) }}
          onSelect={(id) => {
            setMenuOpen(false)
            const picked = id as LxEditorTarget
            setTarget(picked)
            if (!noCwd) openEditor(cwd, picked)
          }}
          items={entries}
          selectedId={target}
          portal
          align="end"
          anchor={(
            <button
              type="button"
              className={css.toolPicker}
              title={t('chrome.editorMenu')}
              aria-label={t('chrome.editorMenu')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={noCwd}
              onClick={() => { setMenuOpen(open => !open) }}
            >
              <EditorGlyph />
              <span className={css.toolPickerLabel}>{t(EDITOR_LABEL_KEYS[target])}</span>
              <EditorMenuGlyph />
            </button>
          )}
        />
      )}
      <button type="button" className={css.iconButton} title={t('chrome.plugins')} aria-label={t('chrome.plugins')} onClick={openPlugins}>
        <PluginGlyph />
      </button>
      <span className={css.separator} aria-hidden="true" />
      <button type="button" className={css.iconButton} title={t('chrome.minimize')} aria-label={t('chrome.minimize')} onClick={min}>
        <MinGlyph />
      </button>
      <button type="button" className={css.iconButton} title={t('chrome.maximize')} aria-label={t('chrome.maximize')} onClick={max}>
        <MaxGlyph />
      </button>
      <button type="button" className={`${css.iconButton} ${css.close}`} title={t('chrome.close')} aria-label={t('chrome.close')} onClick={close}>
        <CloseGlyph />
      </button>
    </div>
  )
}
