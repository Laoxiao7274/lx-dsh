import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { gsap } from 'gsap'
import { motionAllowed } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Apply searchable hidden state without unmounting a stable subtree, with a
 * height-and-fade tween between the states (turn-process disclosure members).
 * @param hidden - whether the subtree is currently hidden.
 * @param reveal - callback for browser find's `beforematch` reveal.
 * @returns ref for the stable subtree root.
 */
export function useSearchableHidden(
  hidden: boolean,
  reveal: () => void,
): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null)
  // The hidden state this hook last observed; null until the first effect
  // pass, so a mount applies its state directly (no tween) while later
  // transitions animate.
  const prevHiddenRef = useRef<boolean | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    if (hidden && element.contains(element.ownerDocument.activeElement)) {
      reveal()
      return
    }
    const transitioned = prevHiddenRef.current !== null && prevHiddenRef.current !== hidden
    prevHiddenRef.current = hidden
    if (!transitioned) {
      if (hidden) element.setAttribute('hidden', 'until-found')
      else element.removeAttribute('hidden')
      return
    }
    if (!hidden) {
      // Expand: unhide first, then grow from zero. A collapse in flight is
      // simply overwritten — the element was never unhidden yet.
      element.removeAttribute('hidden')
      if (motionAllowed()) {
        gsap.fromTo(
          element,
          { height: 0, opacity: 0 },
          { height: 'auto', opacity: 1, duration: 0.22, ease: 'power2.out', overwrite: true },
        )
      }
      return
    }
    if (!motionAllowed()) {
      element.setAttribute('hidden', 'until-found')
      return
    }
    // Collapse: tween height and opacity to zero, then hide for find-in-page.
    gsap.to(element, {
      height: 0,
      opacity: 0,
      duration: 0.16,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => { element.setAttribute('hidden', 'until-found') },
    })
  }, [hidden, reveal])
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    element.addEventListener('beforematch', reveal)
    return () => { element.removeEventListener('beforematch', reveal) }
  }, [reveal])
  return ref
}
