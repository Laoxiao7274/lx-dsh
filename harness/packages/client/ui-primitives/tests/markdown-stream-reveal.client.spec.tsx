// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownText } from './markdown-test-components.tsx'
import { useStreamReveal } from '../src/markdown/stream-reveal.ts'

const windowWithLane = window as unknown as { __DSH_TEST_MOTION_OFF__?: boolean }

afterEach(() => {
  cleanup()
  windowWithLane.__DSH_TEST_MOTION_OFF__ = true
})

describe('useStreamReveal', () => {
  it('paces newly appended text and catches up within the pour window', async () => {
    windowWithLane.__DSH_TEST_MOTION_OFF__ = false
    let received: string | undefined
    const Probe = ({ text }: { text: string }) => {
      received = useStreamReveal(text)
      return null
    }
    const { rerender } = render(<Probe text={'one two'} />)
    rerender(<Probe text={'one two three four five six'} />)
    // The reveal starts behind the newly appended suffix.
    expect(received).not.toBe('one two three four five six')
    await vi.waitFor(() => { expect(received).toBe('one two three four five six') }, { timeout: 3000 })
  })

  it('snaps a replaced stream instead of replaying it', () => {
    windowWithLane.__DSH_TEST_MOTION_OFF__ = false
    let received: string | undefined
    const Probe = ({ text }: { text: string }) => {
      received = useStreamReveal(text)
      return null
    }
    const { rerender } = render(<Probe text={'alpha'} />)
    rerender(<Probe text={'beta gamma'} />)
    expect(received).toBe('beta gamma')
  })

  it('snaps when the gap exceeds the replay ceiling', () => {
    windowWithLane.__DSH_TEST_MOTION_OFF__ = false
    let received: string | undefined
    const Probe = ({ text }: { text: string }) => {
      received = useStreamReveal(text)
      return null
    }
    const { rerender } = render(<Probe text={'x'} />)
    rerender(<Probe text={'x' + 'y'.repeat(5000)} />)
    expect(received).toBe('x' + 'y'.repeat(5000))
  })

  it('renders the full text when the unit lane disables pacing', () => {
    windowWithLane.__DSH_TEST_MOTION_OFF__ = true
    let received: string | undefined
    const Probe = ({ text }: { text: string }) => {
      received = useStreamReveal(text)
      return null
    }
    const { rerender } = render(<Probe text={'one'} />)
    rerender(<Probe text={'one two three four'} />)
    expect(received).toBe('one two three four')
  })
})

describe('MarkdownText streaming reveal', () => {
  it('holds the streaming arm until the paced reveal caught up', async () => {
    windowWithLane.__DSH_TEST_MOTION_OFF__ = false
    const live = render(<MarkdownText text={'Hello, '} streaming />)
    live.rerender(<MarkdownText text={'Hello, world! The paced reveal types this suffix in.'} streaming />)
    expect(live.container.querySelector('[data-md-streaming="true"]')).not.toBeNull()
    await vi.waitFor(() => {
      expect(live.container.textContent).toBe('Hello, world! The paced reveal types this suffix in.')
    }, { timeout: 3000 })
    // Caught up while the turn still runs: the streaming arm stays mounted.
    expect(live.container.querySelector('[data-md-streaming="true"]')).not.toBeNull()
    live.rerender(<MarkdownText text={'Hello, world! The paced reveal types this suffix in.'} />)
    expect(live.container.querySelector('[data-md-streaming="true"]')).toBeNull()
  })
})
