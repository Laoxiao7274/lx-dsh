/** classifyArtifacts: kind detection, two lanes, and lane ordering. */
import { describe, expect, it } from 'vitest'
import {
  artifactKind, basename, classifyArtifacts, readForm,
} from '../src/client/classify.ts'

describe('artifactKind', () => {
  it('detects media kinds by extension', () => {
    expect(artifactKind('a.png')).toBe('image')
    expect(artifactKind('a.JPG')).toBe('image')
    expect(artifactKind('dir/a.mp4')).toBe('video')
    expect(artifactKind('a.webm')).toBe('video')
    expect(artifactKind('a.mp3')).toBe('audio')
    expect(artifactKind('a.flac')).toBe('audio')
  })

  it('detects text kinds by extension', () => {
    expect(artifactKind('a.md')).toBe('markdown')
    expect(artifactKind('a.markdown')).toBe('markdown')
    expect(artifactKind('a.csv')).toBe('csv')
    expect(artifactKind('a.json')).toBe('json')
    expect(artifactKind('a.html')).toBe('web')
    expect(artifactKind('a.htm')).toBe('web')
    expect(artifactKind('a.ts')).toBe('code')
    expect(artifactKind('a.py')).toBe('code')
    expect(artifactKind('src\\nested\\a.rs')).toBe('code')
  })

  it('falls to binary for unknown or missing extensions', () => {
    expect(artifactKind('a.ckpt')).toBe('binary')
    expect(artifactKind('noext')).toBe('binary')
    expect(artifactKind('.dotfile')).toBe('binary')
  })
})

describe('readForm', () => {
  it('maps kinds to their delivery form', () => {
    expect(readForm('image')).toBe('bytes')
    expect(readForm('video')).toBe('bytes')
    expect(readForm('audio')).toBe('bytes')
    expect(readForm('markdown')).toBe('text')
    expect(readForm('web')).toBe('text')
    expect(readForm('binary')).toBe('text')
  })
})

describe('basename', () => {
  it('splits on both separators', () => {
    expect(basename('C:/work/a.md')).toBe('a.md')
    expect(basename('C:\\work\\a.md')).toBe('a.md')
    expect(basename('a.md')).toBe('a.md')
  })
})

describe('classifyArtifacts', () => {
  it('lanes media first with video > image > audio inside the lane', () => {
    const out = classifyArtifacts(['a.png', 'b.mp3', 'c.mp4'])
    expect(out.map(a => a.kind)).toEqual(['video', 'image', 'audio'])
    expect(out.every(a => a.lane === 'media')).toBe(true)
  })

  it('lanes files second with web > doc > data > code > binary', () => {
    const out = classifyArtifacts(['z.ts', 'y.md', 'x.ckpt', 'w.html', 'v.csv', 'u.json'])
    expect(out.map(a => a.kind)).toEqual(['web', 'markdown', 'csv', 'json', 'code', 'binary'])
    expect(out.every(a => a.lane === 'file')).toBe(true)
  })

  it('keeps log order for same-rank ties', () => {
    const out = classifyArtifacts(['b.md', 'a.md'])
    expect(out.map(a => a.path)).toEqual(['b.md', 'a.md'])
  })

  it('places the whole media lane before any file artifact', () => {
    const out = classifyArtifacts(['z.md', 'a.png'])
    expect(out[0]?.kind).toBe('image')
    expect(out[1]?.kind).toBe('markdown')
  })

  it('returns an empty classification for no paths', () => {
    expect(classifyArtifacts([])).toEqual([])
  })
})
