/** createArtifactPanelStore: tab open/focus/close semantics and read entries. */
import { describe, expect, it } from 'vitest'
import {
  artifactTabKey, createArtifactPanelStore, type ArtifactTab,
} from '../src/client/artifact-store.ts'

const A: ArtifactTab = { sessionId: 's1' as never, path: '/w/a.md', name: 'a.md', kind: 'markdown' }
const B: ArtifactTab = { sessionId: 's1' as never, path: '/w/b.ts', name: 'b.ts', kind: 'code' }
const C: ArtifactTab = { sessionId: 's2' as never, path: '/w/c.png', name: 'c.png', kind: 'image' }

describe('createArtifactPanelStore', () => {
  it('opens the panel on the first tab and focuses it', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(A)
    const snap = store.getSnapshot()
    expect(snap.open).toBe(true)
    expect(snap.tabs).toEqual([A])
    expect(snap.activeKey).toBe(artifactTabKey('s1' as never, '/w/a.md'))
  })

  it('re-opening the same artifact focuses the existing tab without duplicating', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(A)
    store.actions.openTab(B)
    store.actions.openTab(A)
    const snap = store.getSnapshot()
    expect(snap.tabs).toEqual([A, B])
    expect(snap.activeKey).toBe(artifactTabKey('s1' as never, '/w/a.md'))
  })

  it('closing the active tab focuses its right neighbor and drops its read', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(A)
    store.actions.openTab(B)
    store.actions.openTab(C)
    const keyB = artifactTabKey(B.sessionId, B.path)
    store.actions.setRead(keyB, { status: 'loading' })
    store.actions.focusTab(keyB)
    store.actions.closeTab(keyB)
    const snap = store.getSnapshot()
    expect(snap.tabs).toEqual([A, C])
    expect(snap.activeKey).toBe(artifactTabKey('s2' as never, '/w/c.png'))
    expect(snap.reads[keyB]).toBeUndefined()
  })

  it('closing the last tab leaves the panel open on the empty state', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(A)
    store.actions.closeTab(artifactTabKey(A.sessionId, A.path))
    const snap = store.getSnapshot()
    expect(snap.open).toBe(true)
    expect(snap.tabs).toEqual([])
    expect(snap.activeKey).toBeNull()
  })

  it('closing an inactive tab keeps the active focus', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(A)
    store.actions.openTab(B)
    store.actions.closeTab(artifactTabKey(A.sessionId, A.path))
    const snap = store.getSnapshot()
    expect(snap.tabs).toEqual([B])
    expect(snap.activeKey).toBe(artifactTabKey(B.sessionId, B.path))
  })

  it('focus on an unknown key is refused and closePanel only hides', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(A)
    store.actions.focusTab('nope')
    expect(store.getSnapshot().activeKey).toBe(artifactTabKey(A.sessionId, A.path))
    store.actions.closePanel()
    const snap = store.getSnapshot()
    expect(snap.open).toBe(false)
    expect(snap.tabs).toEqual([A])
    store.actions.focusTab(artifactTabKey(A.sessionId, A.path))
    expect(store.getSnapshot().open).toBe(true)
  })

  it('setRead replaces and clearRead removes one entry', () => {
    const store = createArtifactPanelStore().create()
    const key = artifactTabKey(A.sessionId, A.path)
    store.actions.setRead(key, { status: 'loading' })
    expect(store.getSnapshot().reads[key]).toEqual({ status: 'loading' })
    store.actions.setRead(key, { status: 'ready', text: 'x', byteSize: 1 })
    expect(store.getSnapshot().reads[key]).toEqual({ status: 'ready', text: 'x', byteSize: 1 })
    store.actions.clearRead(key)
    expect(store.getSnapshot().reads[key]).toBeUndefined()
  })
})
