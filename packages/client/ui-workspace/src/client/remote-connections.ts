/**
 * Remote-backend connection bookmarks: browser-local navigation records for
 * reaching another dsh web Host over the network. A bookmark is not a
 * Workspace — it owns no sessions and lives only in this browser (the
 * persisted store below), because one backend cannot and should not register
 * connections to a different backend. Opening one navigates to that Host's
 * own web UI with its launch token, which the remote-access settings row
 * on the target Host provides for copying.
 */

/** Bookmark identity inside this browser's persisted store. */
export type RemoteBookmarkId = string & { readonly __remoteBookmark: unique symbol }

/** One saved remote backend connection. */
export interface RemoteBookmark {
  /** Stable unique id minted at creation. */
  readonly id: RemoteBookmarkId
  /** Display name shown in the workspace menus. */
  readonly title: string
  /** Scheme plus authority, for example `http://192.168.1.5:3080`; no path, query, or fragment. */
  readonly origin: string
  /** Launch token for the remote Host's browser exchange; empty opens the plain root. */
  readonly token: string
  /** ISO-8601 creation instant. */
  readonly createdAt: string
}

/** Parse and normalize a user-supplied remote address into a bookmark origin. */
export function normalizeRemoteOrigin(input: string): string | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined
  let url: URL
  try {
    // Browsers and users paste bare `ip:port` more often than scheme-qualified
    // URLs; hostnames without a dot would otherwise parse as a path.
    url = new URL(/^\w+:\/\//u.test(trimmed) ? trimmed : `http://${trimmed}`)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.username !== '' || url.password !== '') return undefined
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return undefined
  const host = url.hostname.replace(/\.$/u, '')
  if (host === '' || host.includes(' ')) return undefined
  return `${url.protocol}//${host}${url.port === '' ? '' : `:${url.port}`}`
}

/** Compose the URL that opens a bookmark's remote Host, carrying its token. */
export function remoteBookmarkUrl(bookmark: RemoteBookmark): string {
  const root = bookmark.token === '' ? bookmark.origin : `${bookmark.origin}/`
  return bookmark.token === '' ? root : `${root}?token=${encodeURIComponent(bookmark.token)}`
}

/** Mint a bookmark id distinct from any WorkspaceId spelling. */
export function newRemoteBookmarkId(): RemoteBookmarkId {
  return `remote-${crypto.randomUUID()}` as RemoteBookmarkId
}
