/**
 * Browser half of the LX-DSH shell integration: the updater General-settings
 * row, the Session Header window chrome, the sidebar/hero brand, and the
 * quick-answers sidebar-foot entry with its in-shell drawer, all backed by
 * the LX-DSH Electron preload bridge (`window.lx`). The bridge exists only
 * inside the desktop shell, so the plugin registers nothing under a plain
 * browser host — hosted dsh web builds are untouched.
 *
 * Bridge events are an external source outside the Cordis topology, so the
 * apply body owns the updater subscriptions and feeds the declared store;
 * both the settings row and the header chrome read it via props.useStore.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the settings slot types (`settings.general.item`).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the conversation slot types (header utilities + hero brand).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the sidebar slot types (brand mark/name + footer actions).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the workspace slot types (`sidebar.workspaces.leading`).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: the layout slot types (`shell.overlay`).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LxShellKey } from './locales.ts'
import type { LxUpdateStatus } from './store.ts'
import type { LxHeaderChromeInjected, LxEditorBridge, LxEditorTarget, LxPluginsBridge, LxWindowBridge } from './LxHeaderChrome.tsx'
import type { LxTodosPanelInjected } from './LxTodosPanel.tsx'
import { LxHeaderChrome } from './LxHeaderChrome.tsx'
import { LxBrandMark, LxBrandName, LxHeroBrandMark } from './LxBrand.tsx'
import { LxQuickButton } from './LxQuickButton.tsx'
import { LxQuickDrawer } from './LxQuickDrawer.tsx'
import { LxTodosEntry } from './LxTodosEntry.tsx'
import { LxTodosPanel } from './LxTodosPanel.tsx'
import { LxTodosTreeRow, type TodoWorkspaceContext } from './LxTodosTreeRow.tsx'
import { LxUpdaterRow, type UpdaterRowInjected } from './LxUpdaterRow.tsx'
import { createQuickDrawerStore } from './quick-store.ts'
import { createTodoPanelStore, type TodoAnchor, type TodoItem } from './todo-store.ts'
import { createUpdaterRowStore } from './store.ts'
import { deriveQuickTurns } from './quick-turns.ts'
import { en, zh } from './locales.ts'

export type { LxUpdateStatus, UpdaterRowState } from './store.ts'
export type { UpdaterRowComponentProps, UpdaterRowInjected } from './LxUpdaterRow.tsx'
export type { LxHeaderChromeProps, LxHeaderChromeInjected, LxEditorBridge, LxEditorTarget, LxWindowBridge, LxPluginsBridge } from './LxHeaderChrome.tsx'
export type { LxBrandMarkProps, LxBrandNameProps, LxHeroBrandMarkProps, LxAppVersionBridge } from './LxBrand.tsx'
export type { LxQuickButtonProps } from './LxQuickButton.tsx'
export type { LxQuickDrawerProps, LxQuickDrawerInjected } from './LxQuickDrawer.tsx'
export type { QuickDrawerState, QuickDrawerActions, QuickTurn } from './quick-store.ts'
export type { LxTodosEntryProps } from './LxTodosEntry.tsx'
export type { LxTodosPanelProps, LxTodosPanelInjected, TodoAnchorRect } from './LxTodosPanel.tsx'
export type { TodoPanelState, TodoPanelActions } from './todo-store.ts'
export type { LxUpdateButtonProps, LxUpdateButtonInjected } from './LxUpdateButton.tsx'
export type { LxShellKey } from './locales.ts'

/** Namespace owning this package's copy. */
export const SETTINGS_NS = 'settings.lxShell'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The LX-DSH shell rows' copy (updater row + header chrome). */
    'settings.lxShell': LxShellKey
  }
}

/** One user to-do entry mirrored from the shell's persisted list. */
export interface LxTodoItem {
  /** Stable identity for list keys and targeted mutations. */
  readonly id: string
  /** The user's text, verbatim. */
  readonly text: string
  /** Whether the item is checked off. */
  readonly done: boolean
  /** Creation time (epoch ms). */
  readonly createdAt: number
  /** Completion time, present once done. */
  readonly doneAt?: number
}

/** The shell's to-do operations, bucketed per workspace (LX-DSH only). */
export interface LxTodosBridge {
  get: (workspaceKey: string) => Promise<{ items: LxTodoItem[] }>
  counts: () => Promise<{ counts: Record<string, number> }>
  add: (workspaceKey: string, text: string) => Promise<{ items: LxTodoItem[] }>
  remove: (workspaceKey: string, id: string) => Promise<{ items: LxTodoItem[] }>
  toggle: (workspaceKey: string, id: string) => Promise<{ items: LxTodoItem[] }>
}

/**
 * Minimal structural face of the shell's preload bridge. The full bridge
 * (`window.lx`) carries more members; the package names only what it calls,
 * and every registration stays behind the presence guard in {@link apply}.
 */
export interface LxShellBridge {
  updater: {
    check: () => Promise<LxUpdateStatus>
    install: () => Promise<boolean>
    status: () => Promise<LxUpdateStatus>
    onStatus: (cb: (status: LxUpdateStatus) => void) => () => void
    onAvailable: (cb: (event: { version: string }) => void) => () => void
    onProgress: (cb: (event: { percent: number }) => void) => () => void
    onDownloaded: (cb: (event: { version: string }) => void) => () => void
    onError: (cb: (event: { message: string }) => void) => () => void
  }
  win?: LxWindowBridge
  plugins?: LxPluginsBridge
  /** Opens a project folder in the desktop editor (VS Code protocol);
   * absent when the running shell predates the editor bridge. */
  editor?: LxEditorBridge
  /** The desktop app's own version (added after the header chrome; optional so
   * an older shell degrades to a version-less footer). */
  appVersion?: () => Promise<string>
  /** The user's to-do list (added with the sidebar panel; optional so an
   * older shell degrades to no todos surface). */
  todos?: LxTodosBridge
}

/** Read the shell bridge off the window without assuming the desktop shell. */
function readBridge(): LxShellBridge | undefined {
  // The typed client face has no window typing of its own; reach through the
  // global record once and let the structural check decide presence.
  const lx = (globalThis as { lx?: Partial<LxShellBridge> }).lx
  const updater = lx?.updater
  if (updater === undefined || typeof updater.check !== 'function' || typeof updater.status !== 'function') return undefined
  // exactOptionalPropertyTypes: the optional members are only named when present.
  const win = lx?.win
  const plugins = lx?.plugins
  const shell: LxShellBridge = {
    updater,
    ...(win === undefined ? {} : { win }),
    ...(plugins === undefined ? {} : { plugins }),
  }
  const withVersion = typeof lx?.appVersion === 'function' ? { ...shell, appVersion: lx.appVersion } : shell
  const withEditor = typeof lx?.editor === 'object' && typeof lx.editor.open === 'function'
    ? { ...withVersion, editor: lx.editor }
    : withVersion
  return typeof lx?.todos === 'object' && typeof lx.todos.get === 'function'
    ? { ...withEditor, todos: lx.todos }
    : withEditor
}

/** Cordis services the registrations need (quick drawer: sessions + workspaces). */
export const inject = ['slots', 'sessions', 'workspaces', 'locale']

/**
 * Client plugin body: subscribe to the shell's updater bridge and register
 * the settings row, the Session Header window chrome, and the brand slots.
 * Registers nothing when the bridge is absent.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const shell = readBridge()
  if (shell === undefined) return

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-lx-shell: dictionaries')

  // Two store instances of the same shape: a handle may mount under one
  // scope only, and the settings row (root) and the brand row's update pill
  // (also root, but a distinct slot seat) each mount their own. The
  // apply-world subscriptions fan every bridge event out to both, so the
  // mirrors stay identical.
  const rowStore = createUpdaterRowStore()
  const chromeStore = createUpdaterRowStore()
  let rowBound: BoundActions<typeof rowStore> | undefined
  let chromeBound: BoundActions<typeof chromeStore> | undefined
  const sync = (status: LxUpdateStatus): void => {
    rowBound?.sync(status)
    chromeBound?.sync(status)
  }
  const progress = (percent: number): void => {
    rowBound?.progress(percent)
    chromeBound?.progress(percent)
  }
  const downloaded = (version: string): void => {
    rowBound?.downloaded(version)
    chromeBound?.downloaded(version)
  }
  const failed = (message: string): void => {
    rowBound?.failed(message)
    chromeBound?.failed(message)
  }

  // The subscriptions live for the plugin fiber; the disposer detaches every
  // listener so an HMR swap never leaves a stale writer behind.
  const detach: Array<() => void> = [
    shell.updater.onStatus(sync),
    shell.updater.onProgress((event) => { progress(event.percent) }),
    shell.updater.onDownloaded((event) => { downloaded(event.version) }),
    shell.updater.onError((event) => { failed(event.message) }),
  ]
  ctx.effect(() => () => { for (const off of detach) off() }, 'ui-lx-shell: bridge subscriptions')
  // Catch up on anything that fired before this plugin activated (the shell
  // auto-checks shortly after startup).
  void shell.updater.status().then(sync).catch(() => { /* bridge unavailable — surfaces stay empty */ })

  const injectedRow = (actions: BoundActions<typeof rowStore>): UpdaterRowInjected => {
    rowBound = actions
    // Re-read on bind so a check that fired between registration and first
    // render is not lost (the store's snapshot is the source, not events).
    void shell.updater.status().then(sync).catch(() => { /* same empty fallback */ })
    return {
      check: () => { void shell.updater.check().then(sync).catch(() => { /* events carry the failure */ }) },
      install: () => { void shell.updater.install().catch(() => { /* fire and forget; shell quits on success */ }) },
    }
  }

  // Parameter-free so both seats can mount it: the Session Header utilities
  // (session-scoped inject) and the no-Session hero utilities (root inject).
  const injectedChrome: () => LxHeaderChromeInjected = () => ({
    min: () => { shell.win?.min() },
    max: () => { shell.win?.max() },
    close: () => { shell.win?.close() },
    openPlugins: () => { void shell.plugins?.open() },
    ...(shell.editor === undefined ? {} : {
      openEditor: (cwd: string, target: LxEditorTarget): void => {
        void shell.editor?.open(cwd, target).catch(() => { /* the shell surfaces protocol failures */ })
      },
    }),
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'lx-updater',
    order: 30,
    store: rowStore,
    locale: SETTINGS_NS,
    inject: injectedRow,
  }, LxUpdaterRow))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'lx-window-chrome',
    locale: SETTINGS_NS,
    inject: injectedChrome,
  }, LxHeaderChrome))
  // The no-Session hero seats the same window chrome (editor picker
  // included — it disables for lack of a working directory) at its top band,
  // so the controls never disappear or narrow between hero and Session.
  ctx.slots.inject('conversation.hero.utilities', () => ctx.slots.register({
    name: 'conversation.hero.utilities',
    id: 'lx-window-chrome',
    locale: SETTINGS_NS,
    inject: injectedChrome,
  }, LxHeaderChrome))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark' }, LxBrandMark))
  // Quick-answers: the sidebar-foot entry toggles the in-shell drawer; the
  // drawer rides the shell overlay. Pure client-side — no preload bridge
  // involved.
  const quickStore = createQuickDrawerStore()
  let quickBound: BoundActions<typeof quickStore> | undefined
  // Apply-side mirror of the bound quick session id (set where created; the
  // store copy is the render-facing mirror).
  let quickId: SessionId | undefined

  const sessions = ctx.sessions

  /** The live quick session binding, when one exists and is addressable. */
  const quickSession = (): ReturnType<typeof sessions.binding> | undefined => {
    return quickId === undefined ? undefined : sessions.binding(quickId)
  }

  /** Project the quick session's event window into the drawer store. */
  const projectQuick = (): void => {
    const binding = quickSession()
    if (binding === undefined) return
    quickBound?.setTurns(deriveQuickTurns(
      binding.eventSource.getSnapshot().entries,
      binding.session.getSnapshot().running,
    ))
  }

  /** Create a fresh quick-answers session and wire its event feed. */
  const startQuickSession = (): void => {
    void (async () => {
      try {
        const sessionId = await sessions.create({ agentPreset: 'quick-answers' })
        quickId = sessionId
        quickBound?.bindSession(sessionId)
        const binding = sessions.binding(sessionId)
        if (binding === undefined) return
        ctx.effect(() => binding.eventSource.subscribe(projectQuick), 'ui-lx-shell: quick feed')
        await binding.session.open()
        projectQuick()
      } catch (error) {
        quickBound?.setError(String((error as Error)?.message ?? error))
      }
    })()
  }

  /** First open creates the session; later opens reuse it. */
  const ensureQuickSession = (): void => {
    if (quickId === undefined) startQuickSession()
  }

  /** Archive the current quick session and start a fresh one (the reset). */
  const resetQuickSession = (): void => {
    const current = quickSession()
    quickId = undefined
    quickBound?.setTurns([])
    quickBound?.setError(undefined)
    void (async () => {
      if (current !== undefined) {
        try {
          await ctx.workspaces.archiveSession(current.sessionId)
        } catch {
          // Archiving is best-effort; the replacement create is the reset.
        }
      }
      startQuickSession()
    })()
  }

  const injectedQuickButton = (actions: BoundActions<typeof quickStore>): { toggle: (open: boolean) => void } => {
    quickBound = actions
    return {
      // The target state arrives from the component (it owns the open read),
      // so expanding is the only path that lazily creates the session.
      toggle: (open) => {
        if (open) actions.open()
        else actions.close()
        if (open) ensureQuickSession()
      },
    }
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'lx-quick-answers',
    store: quickStore,
    locale: SETTINGS_NS,
    inject: injectedQuickButton,
  }, LxQuickButton))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'lx-quick-drawer',
    store: quickStore,
    locale: SETTINGS_NS,
    inject: (): { ask: (text: string) => void, reset: () => void } => ({
      ask: (text) => {
        const binding = quickSession()
        if (binding === undefined) return
        void binding.session.prompt([{ type: 'text', text }], 'queue')
          .then((result) => {
            if (!result.ok) quickBound?.setError(result.error.message)
          })
          .catch((error: unknown) => { quickBound?.setError(String((error as Error)?.message ?? error)) })
      },
      reset: resetQuickSession,
    }),
  }, LxQuickDrawer))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
    // The brand row's update pill carries the bridge-state mirror now (a
    // handle mounts under one scope only; the chrome strip needs none).
    store: chromeStore,
    locale: SETTINGS_NS,
    inject: (actions: BoundActions<typeof chromeStore>) => {
      chromeBound = actions
      // Bind-time catch-up: the brand row can mount well after activation.
      void shell.updater.status().then(sync).catch(() => { /* same empty fallback */ })
      return {
        readVersion: shell.appVersion,
        install: () => { void shell.updater.install().catch(() => { /* fire and forget; shell quits on success */ }) },
      }
    },
  }, LxBrandName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark',
    inject: (): { max: () => void } => ({ max: () => { shell.win?.max() } }),
  }, LxHeroBrandMark))

  // User todos: a leading tree row beside the workspace folders plus a
  // sidebar-foot entry (the rail fallback — the tree hides on the rail), both
  // opening one anchored panel over the bridge's persisted list. The bridge
  // member is optional; an older shell degrades to no todos surface.
  if (shell.todos === undefined) return
  const todos = shell.todos
  const todoStore = createTodoPanelStore()
  let todoBound: BoundActions<typeof todoStore> | undefined
  /** The bucket the open panel is showing (apply-side mirror of the store). */
  let todoKey = ''

  /** Refresh the per-bucket open counts (the badges' data source). */
  const ensureCounts = (): void => {
    void todos.counts().then(counts => { todoBound?.setCounts(counts.counts) })
      .catch(() => { /* the badge keeps the last good counts */ })
  }

  /** Replace the mirrored list and refresh the badge counts. */
  const todoSync = (reply: { items: TodoItem[] }): void => {
    todoBound?.setLoading(false)
    todoBound?.setItems(reply.items)
    ensureCounts()
  }

  /** Load the shown bucket once per opening panel. */
  const ensureTodos = (workspaceKey: string): void => {
    todoBound?.setLoading(true)
    void todos.get(workspaceKey)
      .then(todoSync)
      .catch(() => { todoBound?.setLoading(false) })
  }

  /** One bridge mutation whose reply lands in the mirror. */
  const todoMutate = (workspaceKey: string, run: () => Promise<{ items: TodoItem[] }>): void => {
    void run().then(todoSync)
      .catch(() => { /* the mirror keeps the last good list */ })
  }

  /** Bind the store actions and hand both entries the same open write. */
  const injectedTodosEntry = (
    actions: BoundActions<typeof todoStore>,
  ): { open: (anchor: TodoAnchor, workspace: TodoWorkspaceContext) => void } => {
    todoBound = actions
    // Bind-time catch-up: the tree row's badges need the counts before any
    // panel opens (the first mount pulls them once).
    ensureCounts()
    return {
      open: (anchor, workspace) => {
        todoKey = workspace.key
        actions.open(anchor, workspace.key, workspace.title)
        ensureTodos(workspace.key)
      },
    }
  }

  ctx.slots.inject('sidebar.workspaces.leading', () => ctx.slots.register({
    name: 'sidebar.workspaces.leading',
    id: 'lx-user-todos-row',
    store: todoStore,
    locale: SETTINGS_NS,
    inject: injectedTodosEntry,
  }, LxTodosTreeRow))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'lx-user-todos',
    store: todoStore,
    locale: SETTINGS_NS,
    inject: injectedTodosEntry,
  }, LxTodosEntry))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'lx-user-todos-panel',
    store: todoStore,
    locale: SETTINGS_NS,
    inject: (): LxTodosPanelInjected & { close: () => void } => ({
      add: (text) => { todoMutate(todoKey, () => todos.add(todoKey, text)) },
      remove: (id) => { todoMutate(todoKey, () => todos.remove(todoKey, id)) },
      toggle: (id) => { todoMutate(todoKey, () => todos.toggle(todoKey, id)) },
      close: () => { todoBound?.close() },
    }),
  }, LxTodosPanel))
}
