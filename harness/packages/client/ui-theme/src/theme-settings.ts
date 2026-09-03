/** Theme preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'

/** Field carrying the conversation content font size. */
export const FONT_SIZE_FIELD = 'fontSize'

/** Field carrying the selected built-in skin id. */
export const SKIN_FIELD = 'skin'

/** The no-op skin id: no token overrides over the base palettes. */
export const DEFAULT_SKIN = 'default'

/** Field carrying the background-image display row (null = no background). */
export const BACKGROUND_FIELD = 'background'

/** Background opacity bounds. */
export const BACKGROUND_OPACITY_MIN = 0.1
export const BACKGROUND_OPACITY_MAX = 1

/** Theme preference persisted by the product Appearance row. */
export type ThemePreference = typeof THEME_PREFERENCES[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** Smallest accepted content font size (px). */
export const FONT_SIZE_MIN = 12

/** Largest accepted content font size (px). */
export const FONT_SIZE_MAX = 17

/** Content font size when the user-settings document has no override (px). */
export const DEFAULT_FONT_SIZE = 14

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in preference. */
  preference: ThemePreference
  /** Conversation content font size in px (integer within {@link FONT_SIZE_MIN}..{@link FONT_SIZE_MAX}). */
  fontSize: number
  /** Selected built-in skin id (`default` clears the skin layer). */
  skin: string
  /** Background-image display row; absent while no image is stored. */
  background?: { fileName: string; mediaType: string; opacity: number } | null
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
  [SKIN_FIELD]: z.string().default(DEFAULT_SKIN),
  [BACKGROUND_FIELD]: z.object({
    fileName: z.string(),
    mediaType: z.string(),
    opacity: z.number().min(BACKGROUND_OPACITY_MIN).max(BACKGROUND_OPACITY_MAX).default(0.6),
  }).required(false).default(null as unknown as { fileName: string; mediaType: string; opacity: number }),
})

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}
