/**
 * The skin-center settings row: the official stock look plus every installed
 * skin in the v2 catalog (package-shipped built-ins + market installs under
 * $DSH_HOME/skins), try-on / one-click apply through the shared switch
 * engine, background occlusion / blur / bubble-opacity sliders, and the
 * market browser (browse dsh-market.com skins, install one-click).
 *
 * Adapted from the community skin-center card (Apache-2.0,
 * zhu1090093659/dsh-web) with the Wallpaper Engine panel, custom-theme
 * controller, and telemetry deferred.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CatalogSkin, SkinRuntimeStore } from './skin-center/runtime/boot.ts'
import type { SkinBackgroundHandle } from './skin-center/background.ts'
import css from './SkinCenterRow.module.css'

/** Injected business face the apply() injects into the row. */
export interface SkinCenterRowInjected {
  /** The v2 skin runtime store (controller + catalog). */
  runtime: SkinRuntimeStore
  /** Background occluder over the shared skin-background namespace. */
  background: SkinBackgroundHandle
  /** One-shot market browse (fetches the public manifest proxy). */
  browseMarket: () => Promise<MarketSkin[]>
  /** One-click install a market skin into $DSH_HOME/skins. */
  installMarketSkin: (id: string, force: boolean) => Promise<void>
}

/** One market manifest entry (the fields the browser card needs). */
export interface MarketSkin {
  id: string
  name?: string
  nameEn?: string
  author?: string
  tagline?: string
  accent?: string
  preview?: { light?: string; dark?: string }
}

/** Full component props: runtime share + locale seat + injected face. */
export type SkinCenterRowComponentProps =
  PropsRuntime<'settings.appearance.item'>
  & PropsLocale<'settings.theme'>
  & SkinCenterRowInjected

/** The apply target of the official stock-look card. */
const OFFICIAL = 'official'

/**
 * Live-label helper: the shown value follows the in-drag thumb immediately,
 * and falls back to the store value once the store settles.
 */
function useLiveValue(value: number): [number, (v: number | null) => void] {
  const [live, setLive] = useState<number | null>(null)
  useEffect(() => {
    setLive(null)
  }, [value])
  return [live ?? value, setLive]
}

/** Read the numeric value off one range-input event. */
function rangeValue(event: FormEvent<HTMLInputElement>): number {
  const target = event.target as HTMLInputElement
  return Number(target.value)
}

/**
 * Render the skin-center row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function SkinCenterRow({ t, runtime, background, browseMarket, installMarketSkin }: SkinCenterRowComponentProps) {
  const enabled = useSyncExternalStore(background.subscribe, background.enabled)
  const opacity = useSyncExternalStore(background.subscribe, background.opacity)
  const blurEmpty = useSyncExternalStore(background.subscribe, background.blurEmpty)
  const blurContent = useSyncExternalStore(background.subscribe, background.blurContent)
  const inputCardBlur = useSyncExternalStore(background.subscribe, background.inputCardBlur)
  const bubbleOpacity = useSyncExternalStore(background.subscribe, background.bubbleOpacity)
  const [shownOpacity, setShownOpacity] = useLiveValue(opacity)
  const [shownBlurEmpty, setShownBlurEmpty] = useLiveValue(blurEmpty)
  const [shownBlurContent, setShownBlurContent] = useLiveValue(blurContent)
  const [shownInputCardBlur, setShownInputCardBlur] = useLiveValue(inputCardBlur)
  const [shownBubbleOpacity, setShownBubbleOpacity] = useLiveValue(bubbleOpacity)
  const catalog = useSyncExternalStore(runtime.subscribe, runtime.catalog)
  const state = useSyncExternalStore(runtime.subscribe, runtime.controller.getState)
  const activeId = state.active
  const previewing = state.previewing
  const tryingId = state.trying
  const activeEntry = activeId === null ? null : runtime.find(activeId)
  const backdropActive = activeEntry?.manifest.contributes.backgroundMedia !== undefined
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Market browser state.
  const [marketOpen, setMarketOpen] = useState(false)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketItems, setMarketItems] = useState<MarketSkin[] | null>(null)
  const [marketError, setMarketError] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  // Unmount guard: once the row is gone, pending async completions must not
  // setState (the controller itself owns the skin state and lives on).
  const mounted = useRef(false)
  // Latest-click-wins token; a newer click invalidates older completions.
  const requestSeq = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const run = (target: string, action: () => Promise<string | null>): void => {
    const seq = ++requestSeq.current
    setError(null)
    setBusyId(target)
    void action()
      .catch(() => {
        if (!mounted.current || seq !== requestSeq.current) return
        setError(t('skin.applyFailed'))
      })
      .finally(() => {
        if (!mounted.current || seq !== requestSeq.current) return
        setBusyId(null)
      })
  }

  const tryOn = (entry: CatalogSkin): void => {
    run(entry.manifest.id, () => runtime.controller.tryOn(entry.manifest.id, entry))
  }

  const tryOnOfficial = (): void => {
    run(OFFICIAL, () => runtime.controller.tryOn(null, null))
  }

  const exitTryOn = (): void => {
    run(tryingId ?? OFFICIAL, () => runtime.controller.exitTryOn())
  }

  /**
   * One-click apply: atomic client-side switch + persisted selection. No
   * reload 鈥?the next page load boots straight into this skin.
   * @param target - skin id, or `official` for the stock look.
   */
  const applySkin = (target: string): void => {
    if (target === OFFICIAL) {
      run(OFFICIAL, () => runtime.controller.switchTo(null, null))
      return
    }
    const entry = runtime.find(target)
    if (entry === null) {
      setError(t('skin.applyFailed'))
      return
    }
    run(target, () => runtime.controller.switchTo(target, entry))
  }

  const openMarket = async (): Promise<void> => {
    if (marketOpen) { setMarketOpen(false); return }
    setMarketOpen(true)
    if (marketItems !== null) return
    setMarketLoading(true)
    setMarketError(null)
    try {
      const items = await browseMarket()
      if (!mounted.current) return
      setMarketItems(items)
    } catch {
      if (mounted.current) setMarketError(t('skin.marketFailed'))
    } finally {
      if (mounted.current) setMarketLoading(false)
    }
  }

  const installSkin = (id: string): void => {
    setInstallingId(id)
    setMarketError(null)
    void installMarketSkin(id, false)
      .then(async () => {
        await runtime.refreshCatalog()
        if (!mounted.current) return
        setInstallingId(null)
      })
      .catch(async (err) => {
        // Conflict (already installed): report and keep the list.
        if (mounted.current) {
          setMarketError(err instanceof Error ? err.message : t('skin.installFailed'))
          setInstallingId(null)
        }
      })
  }

  const installedIds = new Set((catalog ?? []).map(entry => entry.manifest.id))

  /** One row: try-on control + apply button. Shared by the official card and every skin card. */
  const actionButtons = (opts: {
    key: string
    isActive: boolean
    isTrying: boolean
    onTryOn: () => void
    applyLabel: string
  }): ReactNode => (
    <div className={css.actions}>
      {opts.isActive && !opts.isTrying ? (
        <button type="button" className={`${css.button} ${css.buttonGhost}`} disabled>
          {t('skin.tryOn')}
        </button>
      ) : opts.isTrying ? (
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busyId !== null} onClick={exitTryOn}>
          {t('skin.exitTryOn')}
        </button>
      ) : (
        <button
          type="button"
          className={`${css.button} ${css.buttonPrimary}`}
          disabled={busyId !== null}
          onClick={opts.onTryOn}
        >
          {busyId === opts.key ? t('skin.loading') : t('skin.tryOn')}
        </button>
      )}
      <button
        type="button"
        className={css.button}
        disabled={busyId !== null}
        onClick={() => { applySkin(opts.key) }}
      >
        {busyId === opts.key ? t('skin.applying') : opts.applyLabel}
      </button>
    </div>
  )

  return (
    <div className={css.group}>
      <div className={css.titleRow}>
        <span className={css.title}>{t('skin.title')}</span>
        <button
          type="button" className={css.marketToggle} onClick={() => { void openMarket() }}
          disabled={marketLoading}
        >
          {marketLoading ? t('skin.marketLoading') : marketOpen ? t('skin.marketClose') : t('skin.marketBrowse')}
        </button>
      </div>

      {marketOpen && (
        <div className={css.market}>
          {marketError !== null && <div className={css.error} role="alert">{marketError}</div>}
          {marketItems !== null && (
            <div className={css.marketList}>
              {marketItems
                .filter(item => !installedIds.has(item.id))
                .map(item => (
                  <div className={css.marketCard} key={item.id}>
                    <span className={css.swatch} style={{ background: item.accent ?? '#98a1ab' }} aria-hidden="true" />
                    <span className={css.cardName} title={item.nameEn ?? item.id}>{item.nameEn ?? item.id}</span>
                    <span className={css.cardTagline}>{item.tagline ?? ''}</span>
                    <button
                      type="button"
                      className={`${css.button} ${css.buttonPrimary}`}
                      disabled={installingId !== null}
                      onClick={() => { installSkin(item.id) }}
                    >
                      {installingId === item.id ? t('skin.installing') : t('skin.install')}
                    </button>
                  </div>
                ))}
              {marketItems.filter(item => !installedIds.has(item.id)).length === 0 && (
                <p className={css.offNote} role="status">{t('skin.marketAllInstalled')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {error !== null && <div className={css.error} role="alert">{error}</div>}

      <div className={css.list}>
        {(() => {
          const isActive = activeId === null && !previewing
          const isTrying = previewing && tryingId === null
          const badge = isActive ? t('skin.active') : isTrying ? t('skin.tryingOn') : null
          return (
            <div className={css.card} key={OFFICIAL}>
              <div className={css.cardHead}>
                <span className={css.swatch} style={{ background: '#98a1ab' }} aria-hidden="true" />
                <span className={css.cardName} title={t('skin.official')}>{t('skin.official')}</span>
                {badge !== null && (
                  <span className={`${css.badge} ${isActive ? css.badgeActive : css.badgeTrying}`}>
                    {badge}
                  </span>
                )}
              </div>
              <div className={css.cardTagline} title={t('skin.officialTagline')}>{t('skin.officialTagline')}</div>
              {actionButtons({
                key: OFFICIAL,
                isActive,
                isTrying,
                onTryOn: tryOnOfficial,
                applyLabel: t('skin.restore'),
              })}
            </div>
          )
        })()}

        {(catalog ?? []).map((entry) => {
          const id = entry.manifest.id
          const isActive = id === activeId && !previewing
          const isTrying = previewing && id === tryingId
          const badge = isActive ? t('skin.active') : isTrying ? t('skin.tryingOn') : null
          return (
            <div className={css.card} key={id}>
              <div className={css.cardHead}>
                <span
                  className={css.swatch}
                  style={{ background: entry.manifest.accent ?? '#98a1ab' }}
                  aria-hidden="true"
                />
                <span className={css.cardName} title={entry.manifest.nameEn}>{entry.manifest.nameEn}</span>
                {badge !== null && (
                  <span className={`${css.badge} ${isActive ? css.badgeActive : css.badgeTrying}`}>
                    {badge}
                  </span>
                )}
              </div>
              <div className={css.cardTagline} title={entry.manifest.tagline ?? ''}>
                {entry.manifest.tagline ?? ''}
              </div>
              {actionButtons({
                key: id,
                isActive,
                isTrying,
                onTryOn: () => { tryOn(entry) },
                applyLabel: t('skin.apply'),
              })}
            </div>
          )
        })}
      </div>

      <div className={css.backgroundGroup}>
        <div className={css.enableRow}>
          <span className={css.enableLabel} title={t('skin.backgroundEnabled')}>{t('skin.backgroundEnabled')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t('skin.backgroundEnabled')}
            className={enabled ? css.switch + ' ' + css.switchOn : css.switch}
            onClick={() => { background.setEnabled(!enabled) }}
          >
            <span className={css.switchThumb} />
          </button>
        </div>
        {enabled && (
          <>
            <div className={css.backgroundRow}>
              <div className={css.backgroundHead}>
                <span className={css.backgroundLabel}>{t('skin.backgroundOpacity')}</span>
                <span className={css.backgroundValue} aria-hidden="true">{shownOpacity}%</span>
              </div>
              <input
                className={css.backgroundRange}
                type="range" min={0} max={100} step={5}
                value={shownOpacity}
                aria-label={t('skin.backgroundOpacity')}
                onChange={(e) => { setShownOpacity(null); background.set(rangeValue(e)) }}
                onInput={(e) => { setShownOpacity(rangeValue(e)) }}
              />
              <p className={backdropActive ? css.backgroundHint : css.backgroundHintMuted}>
                {backdropActive ? t('skin.backgroundHint') : t('skin.backgroundHintInert')}
              </p>
            </div>
            <div className={css.backgroundRow}>
              <div className={css.backgroundHead}>
                <span className={css.backgroundLabel}>{t('skin.backgroundBlurEmpty')}</span>
                <span className={css.backgroundValue} aria-hidden="true">{shownBlurEmpty}px</span>
              </div>
              <input
                className={css.backgroundRange}
                type="range" min={0} max={20} step={1}
                value={shownBlurEmpty}
                aria-label={t('skin.backgroundBlurEmpty')}
                onChange={(e) => { setShownBlurEmpty(null); background.setBlurEmpty(rangeValue(e)) }}
                onInput={(e) => { setShownBlurEmpty(rangeValue(e)) }}
              />
              <div className={css.backgroundHead}>
                <span className={css.backgroundLabel}>{t('skin.backgroundBlurContent')}</span>
                <span className={css.backgroundValue} aria-hidden="true">{shownBlurContent}px</span>
              </div>
              <input
                className={css.backgroundRange}
                type="range" min={0} max={20} step={1}
                value={shownBlurContent}
                aria-label={t('skin.backgroundBlurContent')}
                onChange={(e) => { setShownBlurContent(null); background.setBlurContent(rangeValue(e)) }}
                onInput={(e) => { setShownBlurContent(rangeValue(e)) }}
              />
            </div>
            <div className={css.backgroundRow}>
              <div className={css.backgroundHead}>
                <span className={css.backgroundLabel}>{t('skin.inputCardBlur')}</span>
                <span className={css.backgroundValue} aria-hidden="true">{shownInputCardBlur}px</span>
              </div>
              <input
                className={css.backgroundRange}
                type="range" min={0} max={20} step={1}
                value={shownInputCardBlur}
                aria-label={t('skin.inputCardBlur')}
                onChange={(e) => { setShownInputCardBlur(null); background.setInputCardBlur(rangeValue(e)) }}
                onInput={(e) => { setShownInputCardBlur(rangeValue(e)) }}
              />
            </div>
            <div className={css.backgroundRow}>
              <div className={css.backgroundHead}>
                <span className={css.backgroundLabel}>{t('skin.bubbleOpacity')}</span>
                <span className={css.backgroundValue} aria-hidden="true">{shownBubbleOpacity}%</span>
              </div>
              <input
                className={css.backgroundRange}
                type="range" min={0} max={100} step={5}
                value={shownBubbleOpacity}
                aria-label={t('skin.bubbleOpacity')}
                onChange={(e) => { setShownBubbleOpacity(null); background.setBubbleOpacity(rangeValue(e)) }}
                onInput={(e) => { setShownBubbleOpacity(rangeValue(e)) }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
