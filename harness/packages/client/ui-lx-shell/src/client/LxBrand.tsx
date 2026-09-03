/**
 * LX-DSH brand occupants: the sidebar mark/name pair and the blank-hero mark.
 * The LX-DSH composition drops the shipped official brand plugin, so these
 * fill the brand slots under the desktop shell. The sidebar name carries the
 * desktop app's version as a quiet badge beside it, and — when the shell's
 * updater has found something newer — the green update pill after that.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps,
} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { claimWindowDragRegion } from './LxHeaderChrome.tsx'
import { LxUpdateButton } from './LxUpdateButton.tsx'
import type { createUpdaterRowStore } from './store.ts'
import { LX_MARK_SRC } from './brand.ts'
import css from './LxBrand.module.css'

/** Full props of the sidebar brand-mark occupant. */
export type LxBrandMarkProps = PropsRuntime<'sidebar.brand.mark'> & SidebarBrandMarkOwnerProps

/**
 * Render the LX-DSH mark at the owner-requested square size.
 * @param props - slot runtime share and the requested edge length.
 * @returns the mark image.
 */
export function LxBrandMark({ size }: LxBrandMarkProps): ReactNode {
  return <img src={LX_MARK_SRC} width={size} height={size} alt="" draggable={false} className={css.mark} />
}

/** The one-shot version read the brand name badge performs (typed structurally). */
export type LxAppVersionBridge = () => Promise<string>

/** Full props of the sidebar brand-name occupant. */
export type LxBrandNameProps = PropsRuntime<'sidebar.brand.name'> & SidebarBrandNameOwnerProps
  & PropsStore<ReturnType<typeof createUpdaterRowStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** One-shot read of the desktop app version; absent renders no badge. */
    readVersion: LxAppVersionBridge | undefined
    /** Apply the staged update (the shell quits on success). */
    install: () => void
  }

/**
 * Render the product name with the desktop app's version badge beside it, and
 * the green update pill after that whenever the updater has something to
 * offer. The version is fixed for the shell's lifetime, so the badge does a
 * single fetch on mount and never subscribes; it stays hidden until the read
 * resolves and disappears entirely when the bridge predates the version
 * exposure.
 * @param props - slot runtime share, the updater store, the version read, and
 *   the install write.
 * @returns the name span with its version badge and update pill.
 */
export function LxBrandName({ readVersion, install, useStore, actions, t }: LxBrandNameProps): ReactNode {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (readVersion === undefined) return
    let stale = false
    void readVersion().then(
      (v) => { if (!stale && v !== '') setVersion(v) },
      () => { /* bridge absent or refused — the badge stays hidden */ },
    )
    return () => { stale = true }
  }, [readVersion])
  return (
    <>
      <span className={css.name}>LX-DSH</span>
      {version !== null ? <span className={css.version}>v{version}</span> : null}
      <LxUpdateButton useStore={useStore} actions={actions} t={t} install={install} />
    </>
  )
}

/** Full props of the blank-hero brand-mark occupant. */
export type LxHeroBrandMarkProps = PropsRuntime<'conversation.hero.brand.mark'> & HeroBrandMarkOwnerProps & {
  /** The maximize/restore write the claimed drag region's double-click fires. */
  max: () => void
}

/**
 * Render the LX-DSH mark in the blank-session hero, carrying the owner's
 * className so the host's hero sizing/motion keeps applying. The hero state
 * mounts no Session Header, so this occupant claims the hero shell itself as
 * the window drag region: the mark sits three elements deep in the fixed
 * EmptyHero tree (img → fishHitbox span → headline → stack → shell root), and
 * the walk is null-guarded so a future structure change degrades to no drag
 * rather than a wrong claim.
 * @param props - slot runtime share, the requested edge, the host class, and max.
 * @returns the mark image.
 */
export function LxHeroBrandMark({ size, className, max }: LxHeroBrandMarkProps): ReactNode {
  const ref = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    // EmptyHero: <div root><div stack><div headline><span fishHitbox>{mark}</span>.
    const headline = ref.current?.parentElement
    const stack = headline?.parentElement
    const shellRoot = stack?.parentElement
    // The shell root fills the conversation column (height: 100%), so the
    // stamp makes every non-interactive band of the blank view draggable.
    if (shellRoot === undefined || shellRoot === null || headline === null || headline === undefined) return undefined
    return claimWindowDragRegion(shellRoot, max)
  }, [max])
  return (
    <img
      ref={ref}
      src={LX_MARK_SRC}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={className === undefined ? css.mark : `${css.mark} ${className}`}
    />
  )
}
