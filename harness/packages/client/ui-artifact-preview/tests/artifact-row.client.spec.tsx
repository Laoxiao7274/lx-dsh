// @vitest-environment jsdom
/** ArtifactRow: two-lane layout, kind tags, and the open write. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ArtifactRow, type ArtifactRowProps } from '../src/client/ArtifactRow.tsx'
import { classifyArtifacts, type ClassifiedArtifact } from '../src/client/classify.ts'
import { en, type ArtifactPreviewKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<ArtifactPreviewKey, string> = en

function mountRow(
  paths: readonly string[],
  thumbnails: Readonly<Record<string, string>> = {},
): { open: ReturnType<typeof vi.fn> } {
  const open = vi.fn()
  const thumbs = createSnapshotStore(thumbnails)
  const props = {
    sessionId: 's1' as never,
    matched: classifyArtifacts(paths) as readonly ClassifiedArtifact[],
    openFile: vi.fn(),
    open,
    useThumbnails: (selector: (snap: Readonly<Record<string, string>>) => string | undefined) =>
      selector(thumbs.getSnapshot()),
    t: (key: string) => COPY[key as ArtifactPreviewKey] ?? key,
  } as unknown as ArtifactRowProps
  render(<ArtifactRow {...props} />)
  return { open }
}

describe('ArtifactRow', () => {
  it('renders the caption with per-lane counts', () => {
    mountRow(['a.mp4', 'b.png', 'c.mp3', 'd.md', 'e.html'])
    const cap = screen.getByText('Produced', { exact: false })
    expect(cap.textContent).toContain('media 3')
    expect(cap.textContent).toContain('files 2')
  })

  it('renders only the file lane when nothing is media', () => {
    mountRow(['a.md'])
    expect(screen.getByText('a.md')).toBeTruthy()
    expect(screen.queryByText('b.png')).toBeNull()
  })

  it('orders the media lane video > image > audio', () => {
    mountRow(['a.png', 'b.mp3', 'c.mp4'])
    const cards = screen.getAllByRole('button').map(button => button.title)
    expect(cards).toEqual(['c.mp4', 'a.png', 'b.mp3'])
  })

  it('orders the file lane web > doc > data > code > binary', () => {
    mountRow(['z.ts', 'y.md', 'x.ckpt', 'w.html', 'v.csv', 'u.json'])
    const names = screen.getAllByRole('button').map(button => button.textContent)
    expect(names.join(' ')).toContain('w.html')
    expect(names[0]).toContain('w.html')
    const last = names[names.length - 1]
    expect(last).toContain('x.ckpt')
  })

  it('renders a pending placeholder before the thumbnail settles, then the image', () => {
    mountRow(['a.png'])
    expect(document.querySelectorAll('img').length).toBe(0)
    cleanup()
    mountRow(['a.png'], { 's1:a.png': 'blob:thumb' })
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toBe('blob:thumb')
  })

  it('opens the clicked artifact through the injected write', () => {
    const { open } = mountRow(['a.md', 'b.mp4'])
    fireEvent.click(screen.getByTitle('a.md'))
    expect(open).toHaveBeenCalledExactlyOnceWith('s1' as never, 'a.md')
    fireEvent.click(screen.getByTitle('b.mp4'))
    expect(open).toHaveBeenNthCalledWith(2, 's1' as never, 'b.mp4')
  })
})
