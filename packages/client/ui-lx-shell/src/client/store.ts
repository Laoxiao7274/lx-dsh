/**
 * Updater row slot store: a mirror of the LX-DSH Electron shell's updater
 * bridge state. The plugin's apply-world bridge subscriptions are the only
 * writers; the row component reads via props.useStore. The bridge lives
 * outside the Cordis topology, so the subscriptions are plain functions the
 * apply body owns and disposes with its fiber.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** One full status snapshot broadcast by the shell's updater (`updater:status`). */
export interface LxUpdateStatus {
  /** A check is in flight. */
  checking: boolean
  /** The update server reported a newer version. */
  available: boolean
  /** Pending or downloaded update version, when one exists. */
  version: string | null
  /** Download percent (0-100) while a download is in flight. */
  progress: number | null
  /** Last failure text, when the check or download failed. */
  error: string | null
  /** Release notes from the server manifest, when it carries them. */
  notes?: string | null
  /** The installed version the update dialog shows as the current one. */
  currentVersion?: string | null
}

/** Store state mirrored from the bridge. */
export interface UpdaterRowState {
  /** Last full status snapshot; null until the first sync. */
  status: LxUpdateStatus | null
  /** Download percent overlay from `updater:progress`; cleared when staged. */
  progress: number | null
  /** Version staged and ready to apply from `updater:downloaded`. */
  downloaded: string | null
}

/** Declared action shape giving the exported factory a stable return type. */
type UpdaterRowActions = {
  sync: (draft: UpdaterRowState, status: LxUpdateStatus) => void
  progress: (draft: UpdaterRowState, percent: number) => void
  downloaded: (draft: UpdaterRowState, version: string) => void
  failed: (draft: UpdaterRowState, message: string) => void
}

/**
 * Declares the updater row state and write surface.
 * @returns the store handle.
 */
export function createUpdaterRowStore(): EngineStoreHandle<UpdaterRowState, UpdaterRowActions> {
  return defineStore({
    init: (): UpdaterRowState => ({ status: null, progress: null, downloaded: null }),
    actions: {
      sync: (d, status: LxUpdateStatus) => {
        d.status = status
      },
      progress: (d, percent: number) => {
        d.progress = percent
      },
      downloaded: (d, version: string) => {
        d.downloaded = version
        d.progress = null
      },
      failed: (d, message: string) => {
        d.status = {
          checking: false,
          available: d.status?.available === true,
          version: d.status?.version ?? null,
          progress: null,
          error: message,
          notes: d.status?.notes ?? null,
          currentVersion: d.status?.currentVersion ?? null,
        }
      },
    },
  })
}
