/**
 * Whether decorative motion (gsap entrances/exits) may run. Honors
 * "prefers-reduced-motion". The unit lane flips __DSH_TEST_MOTION_OFF__
 * (scripts/test-invariants.ts): specs assert structure, not tweens, and jsdom
 * never ticks animation frames. Missing matchMedia means motion is allowed --
 * same reading AttachmentRail's pageBehavior already established.
 */
declare global {
  interface Window {
    /** Set by the vitest setup to disable decorative tweens under test. */
    __DSH_TEST_MOTION_OFF__?: boolean
  }
}

export function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__DSH_TEST_MOTION_OFF__ === true) return false
  try {
    // Environments without matchMedia throw here; the catch keeps motion on
    // (same reading AttachmentRail's pageBehavior established).
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}
