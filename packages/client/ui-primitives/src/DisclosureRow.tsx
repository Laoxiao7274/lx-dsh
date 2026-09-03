import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { gsap } from 'gsap'
import { IconChevronDownOutline14 } from './icons/index.tsx'
import { motionAllowed } from './motion.ts'
import css from './DisclosureRow.module.css'

/** Shared 24px disclosure chrome for compact flow rows. */
export interface DisclosureRowProps {
  icon: ReactNode
  title: string
  open: boolean
  expandable: boolean
  onToggle: () => void
  /** Makes the complete title row the disclosure target. */
  expandOnRowClick?: boolean | undefined
  /** Replaces the collapsed icon with a chevron while the row is hovered. */
  previewChevron?: boolean | undefined
  /** Keeps `collapsedContent` inline while open. */
  keepContentWhenOpen?: boolean | undefined
  collapsedContent?: ReactNode
  children?: ReactNode
  className?: string | undefined
  rowClassName?: string | undefined
  leadingClassName?: string | undefined
  chevronClassName?: string | undefined
  titleClassName?: string | undefined
}

/**
 * Render a disclosure header and its controlled expanded content.
 * @param props - Visual content, controlled state, and interaction policy.
 * @returns the disclosure row.
 */
export function DisclosureRow({
  icon,
  title,
  open,
  expandable,
  onToggle,
  expandOnRowClick = false,
  previewChevron = expandable,
  keepContentWhenOpen = false,
  collapsedContent,
  children,
  className,
  rowClassName,
  leadingClassName,
  chevronClassName,
  titleClassName,
}: DisclosureRowProps) {
  const rowExpands = expandable && expandOnRowClick
  const bodyRef = useRef<HTMLDivElement>(null)
  // The body stays mounted while a collapse tween plays, then unmounts. It
  // mounts as soon as `open` rises (mount render paints at height 0 — the
  // layout effect below grows it before the first frame is visible).
  const [bodyMounted, setBodyMounted] = useState(open)
  const animate = expandable && motionAllowed()
  // True only when this instance mounted with the row already open (e.g. a
  // virtualization remount): the first expand effect pass skips its tween.
  const mountedOpenRef = useRef(open)
  const toggleFromLeading = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onToggle()
  }
  const toggleFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!rowExpands || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onToggle()
  }
  const collapsedLeading = previewChevron
    ? (
      <>
        <span className={css.iconIdle}>{icon}</span>
        <IconChevronDownOutline14 className={clsx(chevronClassName, css.chevronHover)} />
      </>
    )
    : icon
  const leading = open
    ? <IconChevronDownOutline14 className={chevronClassName} />
    : collapsedLeading

  useEffect(() => {
    if (open) {
      setBodyMounted(true)
      return
    }
    if (!animate) {
      // No tween to wait for: unmount immediately, matching the historic
      // hard-swap behavior of the reduced-motion and unit lanes.
      setBodyMounted(false)
    }
    // With animation the collapse tween owns the unmount (its onComplete).
  }, [animate, open])

  // The expand tween, on the frame the body exists. A body present at mount
  // (a virtualization remount of an already-open row) skips the tween.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body === null || !animate || !open) return
    if (mountedOpenRef.current) {
      mountedOpenRef.current = false
      return
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        body,
        { height: 0, opacity: 0 },
        { height: 'auto', opacity: 1, duration: 0.22, ease: 'power2.out', overwrite: true },
      )
    })
    return () => { ctx.revert() }
  }, [animate, bodyMounted, open])

  // The collapse tween: height to 0, then unmount.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body === null || !animate || open) return
    const ctx = gsap.context(() => {
      gsap.to(body, {
        height: 0,
        opacity: 0,
        duration: 0.16,
        ease: 'power2.in',
        overwrite: true,
        onComplete: () => { setBodyMounted(false) },
      })
    })
    return () => { ctx.revert() }
  }, [animate, open])

  return (
    <div className={clsx(css.root, className)} data-open={open || undefined}>
      <div
        className={clsx(css.row, rowClassName)}
        data-disclosure-row
        data-expandable={rowExpands || undefined}
        role={rowExpands ? 'button' : undefined}
        tabIndex={rowExpands ? 0 : undefined}
        aria-expanded={rowExpands ? open : undefined}
        onClick={rowExpands ? onToggle : undefined}
        onKeyDown={rowExpands ? toggleFromKeyboard : undefined}
      >
        {expandable && !rowExpands ? (
          <button
            type="button"
            className={clsx(css.leading, leadingClassName)}
            aria-expanded={open}
            onClick={toggleFromLeading}
          >
            {leading}
          </button>
        ) : (
          <span className={clsx(css.leading, leadingClassName)}>
            {leading}
          </span>
        )}
        <span className={clsx(css.title, titleClassName)}>{title}</span>
        {(keepContentWhenOpen || !open) && collapsedContent}
      </div>
      {bodyMounted && (
        <div ref={bodyRef} className={css.body}>
          {children}
        </div>
      )}
    </div>
  )
}
