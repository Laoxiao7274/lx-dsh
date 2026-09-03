/**
 * Browser theme registry over the `--dsw-*` token stylesheets. The service
 * owns the live theme preference (light/dark/system), resolves `system` through
 * `prefers-color-scheme`, and publishes immutable snapshots; it never touches
 * the DOM — ui-layout's presenter consumes the resolved snapshot. The Host
 * settings scope loads and stores the preference in the user-settings
 * document. The plugin also registers the Appearance preference row into the
 * settings General section — the theme feature owns its own settings surface.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ctx.settingsScope Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { AppearanceRowInjected } from './AppearanceRow.tsx'
import { AppearanceRow } from './AppearanceRow.tsx'
import { AppearanceSection } from './AppearanceSection.tsx'
import type { BackgroundRowInjected } from './BackgroundRow.tsx'
import { BackgroundRow } from './BackgroundRow.tsx'
import type { FontSizeRowInjected } from './FontSizeRow.tsx'
import { FontSizeRow } from './FontSizeRow.tsx'
import { SkinCenterRow } from './SkinCenterRow.tsx'
import { installSkinCenter } from './skin-center-apply.ts'
import { installBackgroundPresenter } from './background-presenter.ts'
import {
  createAppearanceRowStore, createBackgroundRowStore, createFontSizeRowStore,
} from './settings-store.ts'
import { installThemeStyles } from './styles.ts'
import { en, zh, type ThemeKey } from './locales.ts'
import {
  BACKGROUND_FIELD, DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, DEFAULT_SKIN, FONT_SIZE_FIELD,
  FONT_SIZE_MAX, FONT_SIZE_MIN,
  isThemePreference, SKIN_FIELD, THEME_PREFERENCE_FIELD, THEME_SETTINGS_NAMESPACE,
  type ThemePreference, type ThemeSettings,
} from '../theme-settings.ts'

export type { AppearanceRowComponentProps, AppearanceRowInjected } from './AppearanceRow.tsx'
export type { BackgroundRowComponentProps, BackgroundRowInjected } from './BackgroundRow.tsx'
export type { FontSizeRowComponentProps, FontSizeRowInjected } from './FontSizeRow.tsx'
export type { SkinCenterRowComponentProps, SkinCenterRowInjected, MarketSkin } from './SkinCenterRow.tsx'
export type {
  AppearanceRowState, BackgroundRowState, BackgroundRowStateBackground, FontSizeRowState,
} from './settings-store.ts'
export type { ThemeKey } from './locales.ts'
export type { ThemePreference, ThemeSettings } from '../theme-settings.ts'

/** Namespace owning this feature's settings-row copy. */
export const SETTINGS_NS = 'settings.theme'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Appearance settings rows' copy. */
    'settings.theme': ThemeKey
  }
  interface SlotMap {
    'settings.appearance.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

/** Theme token dictionary: --dsw-alias-* overrides keyed by variable name. */
export type ThemeTokens = Record<string, string>

/**
 * One override-layer token value: both palette modes are mandatory (repeat
 * the same value when the token is scheme-invariant) so an override never
 * goes illegible when the user switches to the other scheme.
 */
export interface ThemeTokenModes {
  /** Value applied while the light base palette is active. */
  light: string
  /** Value applied while the dark base palette is active. */
  dark: string
}

/** Override-layer dictionary: token names to per-mode value pairs. */
export type ThemeTokenOverrides = Record<string, ThemeTokenModes>

/** One selectable theme: id, dark/light semantics, and alias-token overrides. */
export interface ThemeDefinition {
  /** Theme id (the setTheme argument for concrete themes). */
  id: string
  /**
   * Which base palette this theme builds on. The presenter switches
   * `body[data-ds-dark-theme]` from this field — never from the id.
   */
  colorScheme: 'light' | 'dark'
  /** Alias-layer overrides applied as inline CSS variables over the base palette. */
  tokens: ThemeTokens
}

/** Immutable theme state published on every change. */
export interface ThemeSnapshot {
  /** The persisted preference (may be `system`). */
  preference: ThemePreference
  /** Conversation content font size in px (integer within FONT_SIZE_MIN..FONT_SIZE_MAX). */
  fontSize: number
  /** The persisted built-in skin id (`default` = no skin layer). */
  skin: string
  /** The persisted background display row; null while no image is stored. */
  background: { fileName: string; mediaType: string; opacity: number } | null
  /**
   * The resolved active theme (`system` resolved via prefers-color-scheme)
   * with override layers folded into its tokens (seq order, later layers win
   * per-token; each value picked for the active color scheme).
   */
  active: ThemeDefinition
  /** Registered themes in registration order. */
  themes: readonly ThemeDefinition[]
  /** Monotonic change counter (registry or active changes). */
  revision: number
}

/** One theme token exposed to pre-definition Cordis inspection. */
export interface ThemeTokenInspection {
  /** Token name accepted by {@link ThemeService.overrideTokens}. */
  name: string
  /** Intended visual role. */
  description: string
  /** CSS value category. */
  valueType: string
  /** Whether override layers must supply both palette modes. */
  requiresLightAndDark: boolean
  /** CSS custom property consumed by UI styles. */
  cssVariable?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    theme: ThemeRuntime
  }
  interface Events {
    /**
     * Theme state changed (preference switched, registry updated, or the OS
     * color scheme changed while the preference is `system`).
     * @param snapshot - Current immutable theme snapshot.
     * @mode emit
     */
    'theme/change'(snapshot: ThemeSnapshot): void
  }
}

const BUILTIN_THEMES: readonly ThemeDefinition[] = Object.freeze([
  Object.freeze({ id: 'light', colorScheme: 'light' as const, tokens: Object.freeze({}) }),
  Object.freeze({ id: 'dark', colorScheme: 'dark' as const, tokens: Object.freeze({}) }),
])

const BUILTIN_INSPECT_TOKENS: readonly ThemeTokenInspection[] = Object.freeze([
  { name: '--dsw-alias-bg-base', description: 'Application base background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-base' },
  { name: '--dsw-alias-bg-layer-1', description: 'Primary raised surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-layer-1' },
  { name: '--dsw-alias-bg-layer-2', description: 'Secondary nested surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-layer-2' },
  { name: '--dsw-alias-bg-overlay', description: 'Overlay and popover background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-overlay' },
  { name: '--dsw-alias-border-l1', description: 'Primary subtle border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-border-l1' },
  { name: '--dsw-alias-border-l2', description: 'Secondary stronger border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-border-l2' },
  { name: '--dsw-alias-brand-primary', description: 'Primary brand accent.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-brand-primary' },
  { name: '--dsw-alias-label-primary', description: 'Primary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-label-primary' },
  { name: '--dsw-alias-label-secondary', description: 'Secondary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-label-secondary' },
  { name: '--dsw-alias-state-error-primary', description: 'Primary error state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-error-primary' },
  { name: '--dsw-alias-state-success-primary', description: 'Primary success state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-success-primary' },
  { name: '--dsw-alias-state-warn-primary', description: 'Primary warning state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-warn-primary' },
  { name: '--dsw-specific-sidebar-fill', description: 'Sidebar column and title-row background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-specific-sidebar-fill' },
])

/**
 * Theme registry and preference owner. `light`/`dark` are built in (the base
 * stylesheets carry both palettes); third-party themes register alias-layer
 * overrides. Reads go through {@link getTheme}; preference writes only
 * through {@link setTheme}; continuous sync only through the `theme/change`
 * event. {@link overrideTokens} stacks partial token layers over the active
 * theme without touching the registry.
 * The service holds the `prefers-color-scheme` media query (environment
 * sensing, not presentation) and re-emits when the OS scheme flips while the
 * preference is `system`.
 */
export class ThemeRuntime {
  private readonly ctx: ClientContext
  private readonly host: SettingsScope<ThemeSettings>
  private themes: ThemeDefinition[] = [...BUILTIN_THEMES]
  private preference: ThemePreference
  /** Persisted built-in skin id; an unknown stored id resolves to `default`. */
  private skinId: string = DEFAULT_SKIN
  /** Persisted background display row (uploads write it through the scope). */
  private backgroundValue: ThemeSnapshot['background'] = null
  private fontSize: number = bootstrapFontSize()
  private revision = 0
  private snapshot: ThemeSnapshot
  private readonly media: MediaQueryList | undefined
  /** Override layers by source; seq (monotonic) is the stacking order. */
  private readonly overrides = new Map<string, { seq: number; tokens: ThemeTokenOverrides }>()
  private overrideSeq = 0

  /**
   * @param ctx - owning context (change events are emitted on it; the
   * media-query and scope listeners are released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the same plugin.
   */
  constructor(ctx: ClientContext, host: SettingsScope<ThemeSettings>) {
    this.ctx = ctx
    this.host = host
    this.preference = DEFAULT_PREFERENCE
    // Non-browser runs (node e2e booting the client tree) have no matchMedia.
    this.media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)')
    this.snapshot = this.buildSnapshot()
    if (this.media !== undefined) {
      const media = this.media
      const onChange = (): void => {
        if (this.preference !== 'system') return
        this.publish()
      }
      ctx.effect(() => {
        media.addEventListener('change', onChange)
        return () => { media.removeEventListener('change', onChange) }
      }, 'ui-theme: prefers-color-scheme listener')
    }
    ctx.effect(() => host.subscribe(() => { this.adopt() }), 'ui-theme: settings scope adoption')
    this.adopt()
  }

  /**
   * Read the current immutable theme snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getTheme(): ThemeSnapshot {
    return this.snapshot
  }

  /**
   * Export the current token directory without reading DOM or computed styles.
   * @returns stable JSON-safe token descriptions, including registered and override-only names.
   */
  exportInspectTokens(): ThemeTokenInspection[] {
    const tokens = new Map(BUILTIN_INSPECT_TOKENS.map(token => [token.name, token]))
    for (const theme of this.themes) {
      for (const name of Object.keys(theme.tokens)) {
        if (!tokens.has(name)) tokens.set(name, dynamicToken(name))
      }
    }
    for (const layer of this.overrides.values()) {
      for (const name of Object.keys(layer.tokens)) {
        if (!tokens.has(name)) tokens.set(name, dynamicToken(name))
      }
    }
    return [...tokens.values()].map(token => ({ ...token })).sort((left, right) => left.name.localeCompare(right.name))
  }

  /**
   * Switch the theme preference — the only user preference write entry.
   * Built-in preferences are written through the settings scope and every
   * accepted value emits `theme/change`.
   * @param id - a registered theme id or `system`; unknown ids throw.
   */
  setTheme(id: string): void {
    if (id !== 'system' && !this.themes.some(t => t.id === id)) {
      throw new Error(`theme "${id}" is not registered`)
    }
    if (this.preference === id) return
    this.preference = id as ThemePreference
    if (isThemePreference(id)) void this.host.set(THEME_PREFERENCE_FIELD, id)
    this.publish()
  }

  /**
   * Change the conversation content font size — the only font-size write
   * entry. Accepted values are written through the settings scope and emit
   * `theme/change`.
   * @param px - integer px within FONT_SIZE_MIN..FONT_SIZE_MAX; out-of-range or fractional values throw.
   */
  setFontSize(px: number): void {
    if (!Number.isInteger(px) || px < FONT_SIZE_MIN || px > FONT_SIZE_MAX) {
      throw new Error(`font size ${px} is outside ${FONT_SIZE_MIN}..${FONT_SIZE_MAX}`)
    }
    if (this.fontSize === px) return
    this.fontSize = px
    void this.host.set(FONT_SIZE_FIELD, px)
    this.publish()
  }

  /**
   * Switch the active skin — a pass-through marker write. The skin-center v2
   * runtime owns the real switch (CSS injection + persisted state); this
   * field only records the selection so the boot script can pre-apply the
   * active skin before first paint. The v2 channel validates ids against
   * the installed catalog.
   * @param id - a skin id or `default`.
   */
  setSkin(id: string): void {
    if (this.skinId === id) return
    this.skinId = id
    void this.host.set(SKIN_FIELD, id)
    this.publish()
  }

  /**
   * Replace the background display row — the display-side write entry (the
   * image bytes themselves go through the host upload route). Null clears.
   * Writes go through the settings scope and emit `theme/change`.
   * @param background - the durable display row, or null to clear.
   */
  setBackground(background: ThemeSnapshot['background']): void {
    if (this.backgroundValue === background) return
    this.backgroundValue = background
    void this.host.set(BACKGROUND_FIELD, background)
    this.publish()
  }

  /** Adopt the scope's accepted durable preference without writing it back. */
  private adopt(): void {
    const section = this.host.getSnapshot().value
    if (section === undefined) return
    if (this.preference === section.preference && this.fontSize === section.fontSize
      && this.skinId === section.skin && this.backgroundValue === (section.background ?? null)) return
    this.preference = section.preference
    this.fontSize = section.fontSize
    this.skinId = section.skin
    this.backgroundValue = section.background ?? null
    this.publish()
  }

  /**
   * Register a theme. Duplicate id throws (single occupant per id; the
   * built-in pair counts; `system` is a preference, not a registrable id).
   * @param definition - theme id, colorScheme, and alias-token overrides.
   * @returns disposer. Disposing the theme backing the active preference
   * resets the preference to the default so the UI never keeps tokens of an
   * unregistered theme.
   */
  register(definition: ThemeDefinition): () => void {
    if (definition.id === 'system') throw new Error('"system" is a preference, not a registrable theme id')
    if (this.themes.some(t => t.id === definition.id)) {
      throw new Error(`theme "${definition.id}" is already registered`)
    }
    this.themes = [...this.themes, definition]
    this.publish()
    return () => {
      if (!this.themes.some(t => t.id === definition.id)) return
      this.themes = this.themes.filter(t => t.id !== definition.id)
      if (this.preference === definition.id) {
        this.preference = DEFAULT_PREFERENCE
      }
      this.publish()
    }
  }

  /**
   * Stack a token override layer on top of the active theme — the token-level
   * analogue of slot shading: the base theme stays untouched, layers compose
   * in seq order with later layers winning per-token, and removing a layer
   * restores whatever it covered. Calling again with the same source replaces
   * that source's whole layer and restacks it on top (effect re-registration
   * semantics). Emits `theme/change` with the recomposed snapshot.
   * @param source - layer identity; one layer per source (dynamic packages
   * pass their package id — the façade pins it, so it also names the layer's
   * origin for inspection).
   * @param tokens - token-name → `{ light, dark }` value pairs. Validated at
   * runtime (model-authored callers reach this boundary with untyped JS);
   * a bare string value throws a teaching error.
   * @returns disposer removing exactly the layer this call created; a no-op
   * once the source has re-overridden (the newer layer is not torn down).
   */
  overrideTokens(source: string, tokens: ThemeTokenOverrides): () => void {
    const layer = { seq: this.overrideSeq++, tokens: validateOverrides(source, tokens) }
    this.overrides.set(source, layer)
    this.publish()
    return () => {
      if (this.overrides.get(source) !== layer) return
      this.overrides.delete(source)
      this.publish()
    }
  }

  private buildSnapshot(): ThemeSnapshot {
    const resolvedId = this.preference === 'system'
      ? (this.media?.matches === true ? 'dark' : 'light')
      : this.preference
    // Both built-ins always exist; a registered preference id resolves or has
    // been reset by its disposer, so the lookup cannot miss.
    const active = this.themes.find(t => t.id === resolvedId)
    /* v8 ignore next 2 -- needs a registry without light/dark, which register()/dispose() cannot produce */
    if (active === undefined) throw new Error(`theme registry lost "${resolvedId}"`)
    return Object.freeze({
      preference: this.preference,
      fontSize: this.fontSize,
      skin: this.skinId,
      background: this.backgroundValue,
      active: this.composeActive(active),
      themes: Object.freeze([...this.themes]),
      revision: this.revision,
    })
  }

  /**
   * Fold the override layers into the active definition: seq-ordered layers
   * compose per-token (later layers win; each value picked for the active
   * color scheme). Skin tokens are no longer composed here — the skin-center
   * v2 runtime injects skin CSS directly. Without layers the registered
   * definition passes through by identity.
   */
  private composeActive(active: ThemeDefinition): ThemeDefinition {
    if (this.overrides.size === 0) return active
    const tokens: ThemeTokens = { ...active.tokens }
    for (const layer of [...this.overrides.values()].sort((a, b) => a.seq - b.seq)) {
      for (const [name, modes] of Object.entries(layer.tokens)) {
        tokens[name] = modes[active.colorScheme]
      }
    }
    return Object.freeze({ ...active, tokens: Object.freeze(tokens) })
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    this.ctx.emit('theme/change', this.snapshot)
  }
}

/**
 * Read the font size the Host boot script wrote on `body` before any plugin
 * ran, so the initial snapshot matches first paint and ui-layout's presenter
 * does not flash the schema default while the settings read is in flight.
 * Non-browser runs and mounts without the boot script fall back to the
 * schema default; the durable settings adoption still lands afterwards.
 */
function bootstrapFontSize(): number {
  /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
  if (typeof document === 'undefined') return DEFAULT_FONT_SIZE
  const raw = document.body.style.getPropertyValue('--dsh-content-font-size')
  const parsed = Number.parseInt(raw, 10)
  return Number.isInteger(parsed) && parsed >= FONT_SIZE_MIN && parsed <= FONT_SIZE_MAX
    ? parsed
    : DEFAULT_FONT_SIZE
}

/**
 * Runtime shape check for one override layer (model-authored callers pass
 * untyped JS through the dynamic-package façade, so the static type cannot
 * enforce the pair shape there). Returns a defensive per-token copy so later
 * caller mutation cannot reach the stored layer.
 */function validateOverrides(source: string, tokens: ThemeTokenOverrides): ThemeTokenOverrides {
  const validated: ThemeTokenOverrides = {}
  for (const [name, value] of Object.entries<unknown>(tokens)) {
    if (typeof value === 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" is a bare string — pass { light: ${JSON.stringify(value)}, dark: ${JSON.stringify(value)} } `
        + '(repeat the value when it is the same in both palettes); a single value goes illegible when the user switches color scheme',
      )
    }
    if (typeof value !== 'object' || value === null
      || typeof (value as { light?: unknown }).light !== 'string'
      || typeof (value as { dark?: unknown }).dark !== 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" must map to a { light, dark } pair of strings — one value per color scheme`,
      )
    }
    const modes = value as ThemeTokenModes
    validated[name] = { light: modes.light, dark: modes.dark }
  }
  return validated
}

function dynamicToken(name: string): ThemeTokenInspection {
  return {
    name,
    description: 'Theme token registered by the current Client composition.',
    valueType: 'CSS value',
    requiresLightAndDark: true,
    ...(name.startsWith('--') ? { cssVariable: name } : {}),
  }
}

/**
 * Required services: settings transport plus slots/locale for the Appearance
 * section. `remote` carries the forwarded settings invalidation that
 * `ctx.settingsScope.bind(spec)` subscribes to on this context.
 */
export const inject = ['slots', 'locale', 'remote', 'settingsScope']

/**
 * Client plugin body: provide the theme service, register the feature-owned
 * Appearance settings section (scheme, skin, background rows), keep the
 * font-size row in the General section, and project the background layer.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  installThemeStyles(ctx)
  const host = ctx.settingsScope.bind<ThemeSettings>({ namespace: THEME_SETTINGS_NAMESPACE })
  const theme = new ThemeRuntime(ctx, host)
  ctx.provide('theme', theme)
  ctx.effect(() => installBackgroundPresenter(ctx, () => theme.getTheme()), 'ui-theme: background presenter')

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-theme: settings row dictionaries')

  const store = createAppearanceRowStore()
  let bound: BoundActions<typeof store> | undefined
  const fontSizeStore = createFontSizeRowStore()
  let fontSizeBound: BoundActions<typeof fontSizeStore> | undefined
  const backgroundStore = createBackgroundRowStore()
  let backgroundBound: BoundActions<typeof backgroundStore> | undefined
  const sync = (snapshot: ThemeSnapshot): void => {
    bound?.sync(snapshot.preference, snapshot.revision)
    fontSizeBound?.sync(snapshot.fontSize, snapshot.revision)
    backgroundBound?.sync(snapshot.background, snapshot.revision)
  }
  ctx.on('theme/change', sync)

  // The Appearance section: the nav entry plus the item slot its rows ride.
  const t = ctx.locale.bind(SETTINGS_NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'appearance',
    order: 12,
    label: () => t('appearance.nav'),
    locale: SETTINGS_NS,
    children: { 'settings.appearance.item': { kind: 'list', scope: 'root' } },
  }, AppearanceSection))

  const injected = (actions: BoundActions<typeof store>): AppearanceRowInjected => {
    bound = actions
    // Re-sync from the getter so no event is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    sync(theme.getTheme())
    return {
      setTheme: (id) => { theme.setTheme(id) },
    }
  }
  ctx.slots.inject('settings.appearance.item', () => ctx.slots.register({
    name: 'settings.appearance.item',
    id: 'scheme',
    order: 0,
    store,
    locale: SETTINGS_NS,
    inject: injected,
  }, AppearanceRow))

  // The skin-center row: the v2 runtime (catalog + try-on/apply engine) plus
  // the background-preference sliders and the market browser. Non-browser
  // contexts skip the runtime (the row never registers there).
  const skinCenter = installSkinCenter(ctx)
  if (skinCenter !== null) {
    ctx.slots.inject('settings.appearance.item', () => ctx.slots.register({
      name: 'settings.appearance.item',
      id: 'skin',
      order: 10,
      locale: SETTINGS_NS,
      inject: () => skinCenter,
    }, SkinCenterRow))
  }

  // Background uploads travel through the loopback host routes; non-loopback
  // browsers keep the row hidden (the writes cannot reach the durable store).
  const isLoopback = (ctx as unknown as { remote?: { $host?: { isLoopback?: boolean } } }).remote?.$host?.isLoopback === true
  if (isLoopback) {
    const backgroundInjected = (actions: BoundActions<typeof backgroundStore>): BackgroundRowInjected => {
      backgroundBound = actions
      sync(theme.getTheme())
      return {
        upload: async (file: File) => {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const response = await fetch('/api/ui-theme/background/upload', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ bytes: Array.from(bytes), mediaType: file.type, opacity: theme.getTheme().background?.opacity ?? 0.6 }),
          })
          if (!response.ok) throw new Error(`background upload failed: HTTP ${String(response.status)}`)
          const body = JSON.parse(await response.text()) as { ok?: boolean; error?: string; background?: ThemeSnapshot['background'] }
          if (body.ok !== true || body.background === undefined) throw new Error(body.error ?? 'background upload failed')
          theme.setBackground(body.background)
        },
        clear: async () => {
          const response = await fetch('/api/ui-theme/background/clear', { method: 'POST' })
          if (!response.ok) throw new Error(`background clear failed: HTTP ${String(response.status)}`)
          const body = JSON.parse(await response.text()) as { ok?: boolean; error?: string }
          if (body.ok !== true) throw new Error(body.error ?? 'background clear failed')
          theme.setBackground(null)
        },
        setOpacity: (opacity: number) => {
          const current = theme.getTheme().background
          if (current === null) return
          theme.setBackground({ ...current, opacity })
        },
      }
    }
    // The store mirror rides the same theme/change sync (the injected face
    // performs no stateful capture).
    ctx.slots.inject('settings.appearance.item', () => ctx.slots.register({
      name: 'settings.appearance.item',
      id: 'background',
      order: 20,
      store: backgroundStore,
      locale: SETTINGS_NS,
      inject: backgroundInjected,
    }, BackgroundRow))
  }

  const fontSizeInjected = (actions: BoundActions<typeof fontSizeStore>): FontSizeRowInjected => {
    fontSizeBound = actions
    sync(theme.getTheme())
    return {
      setFontSize: (px) => { theme.setFontSize(px) },
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'font-size',
    order: 11,
    store: fontSizeStore,
    locale: SETTINGS_NS,
    inject: fontSizeInjected,
  }, FontSizeRow))
}
