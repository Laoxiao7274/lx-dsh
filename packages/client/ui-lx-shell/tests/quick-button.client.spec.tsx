// @vitest-environment jsdom
/** LxQuickButton: the sidebar-foot quick-answers entry in both column states. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxQuickButton, type LxQuickButtonProps } from '../src/client/LxQuickButton.tsx'
import { createQuickDrawerStore, type QuickDrawerState } from '../src/client/quick-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

function mount(wide: boolean): { toggle: ReturnType<typeof vi.fn> } {
  const store = createQuickDrawerStore().create()
  const toggle = vi.fn()
  const props = {
    wide,
    toggle,
    useStore: (selector: (s: QuickDrawerState) => unknown) => selector(store.getSnapshot()),
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxQuickButtonProps
  render(<LxQuickButton {...props} />)
  return { toggle }
}

describe('LxQuickButton', () => {
  it('renders the labelled row in the wide column and toggles open on click', () => {
    const { toggle } = mount(true)
    const button = screen.getByRole('button', { name: en['quick.title'] })
    expect(button.textContent).toContain(en['quick.label'])
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(toggle).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('renders the icon-only circle on the rail', () => {
    const { toggle } = mount(false)
    const button = screen.getByRole('button', { name: en['quick.title'] })
    expect(button.textContent).not.toContain(en['quick.label'])
    fireEvent.click(button)
    expect(toggle).toHaveBeenCalledExactlyOnceWith(true)
  })
})
