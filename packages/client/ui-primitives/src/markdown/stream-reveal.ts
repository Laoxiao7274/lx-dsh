/**
 * Paced reveal of one growing streaming text: newly appended characters pour
 * through a steady typewriter flow instead of per-chunk en-bloc jumps (the
 * AICSS streaming-text pattern, adapted to live arrival: each backlog drains
 * over a fixed pour window, so the display rate tracks the emission rate with
 * ~350ms of smoothing and a per-second floor). Pacing is content
 * presentation, not decorative motion: it stays on regardless of
 * reduced-motion preferences, and only the unit test lane disables it.
 */

import { useEffect, useRef, useState } from 'react'

/** Slowest reveal while a gap remains, in characters per second. */
const REVEAL_MIN_CPS = 30
/** Fastest reveal regardless of backlog size, so a burst still pours visibly. */
const REVEAL_MAX_CPS = 1000
/** Every backlog drains over this many seconds; larger gaps pour proportionally faster. */
const REVEAL_POUR_SECONDS = 0.35
/** Gaps beyond this many characters snap: a diverged stream must not replay. */
const REVEAL_MAX_LAG = 4000

function pacingAllowed(): boolean {
  if (typeof window === 'undefined') return false
  return (window as unknown as { __DSH_TEST_MOTION_OFF__?: boolean }).__DSH_TEST_MOTION_OFF__ !== true
}

/**
 * Reveal `text` at a paced rate while it grows.
 * @param text - the complete accumulated streaming text.
 * @returns the prefix of `text` that is visible now.
 */
export function useStreamReveal(text: string): string {
  // Mount shows the full text (a mid-stream remount must not replay from the
  // start); only growth after mount is paced.
  const [shown, setShown] = useState(text)
  const shownRef = useRef(text)
  const frameRef = useRef(0)
  const lastRef = useRef(0)

  useEffect(() => {
    if (!pacingAllowed() || !text.startsWith(shownRef.current) || text === shownRef.current) {
      if (shownRef.current !== text) {
        shownRef.current = text
        setShown(text)
      }
      return
    }
    if (text.length - shownRef.current.length > REVEAL_MAX_LAG) {
      shownRef.current = text
      setShown(text)
      return
    }
    const tick = (now: number): void => {
      const elapsed = Math.max(0, now - lastRef.current)
      lastRef.current = now
      const gap = text.length - shownRef.current.length
      if (gap <= 0) {
        frameRef.current = 0
        return
      }
      const rate = Math.min(REVEAL_MAX_CPS, Math.max(REVEAL_MIN_CPS, gap / REVEAL_POUR_SECONDS))
      const step = Math.max(1, Math.round(rate * elapsed / 1000))
      const next = Math.min(text.length, shownRef.current.length + step)
      shownRef.current = text.slice(0, next)
      setShown(shownRef.current)
      frameRef.current = next === text.length ? 0 : requestAnimationFrame(tick)
    }
    lastRef.current = performance.now()
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== 0) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = 0
      }
    }
  }, [text])

  return shown
}
