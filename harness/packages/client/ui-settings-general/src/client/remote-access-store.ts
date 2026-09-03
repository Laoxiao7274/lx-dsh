/** State owner for the General section's remote-access information row. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Browser state of the Host-reported connection facts. */
export interface RemoteAccessState {
  /** Read phase for the Host's connectionInfo; unavailable means the call failed. */
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  /** Whether the information area is expanded (the row's switch). */
  revealed: boolean
  /** Clean root URL without a token. */
  url: string
  /** The launch token to paste beside the address in a connect form. */
  token: string
  /** LAN IPv4 literals when the Host binds all interfaces. */
  lanAddresses: readonly string[]
  /** Whether the Host's webserver is loopback-only. */
  loopbackOnly: boolean
}

/** Loads the Host's connection facts once per reveal and owns the reveal switch. */
export class RemoteAccessStore {
  /** uSES-safe state source shared by the registered General-section row. */
  readonly store: SnapshotStore<RemoteAccessState> = createSnapshotStore({
    status: 'idle', revealed: false, url: '', token: '', lanAddresses: [], loopbackOnly: true,
  })

  private loading: Promise<void> | undefined

  /**
   * @param ctx - the plugin's context, whose `remote.settings` namespace
   * reports the Host connection facts.
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Toggle the information area; the first reveal loads the Host facts.
   */
  toggle(): void {
    const current = this.store.getSnapshot()
    const revealed = !current.revealed
    this.store.update((state) => { state.revealed = revealed })
    if (revealed && current.status === 'idle') void this.load()
  }

  /**
   * Load (or reload) the Host's connection facts once; concurrent calls
   * collapse behind the in-flight request.
   * @returns settlement once the snapshot reflects the answer.
   */
  async load(): Promise<void> {
    this.loading ??= (async () => {
      this.store.update((state) => {
        state.status = 'loading'
      })
      const result = await this.ctx.remote.settings.connectionInfo()
      this.store.update((state) => {
        state.status = result.ok ? 'ready' : 'unavailable'
        if (result.ok) {
          state.url = result.value.url
          state.token = result.value.token
          state.lanAddresses = result.value.lanAddresses
          state.loopbackOnly = result.value.loopbackOnly
        }
      })
    })()
    await this.loading
  }

  /** Clear the reveal switch when the row unmounts or the panel closes. */
  dispose(): void {
    this.store.update((state) => { state.revealed = false })
  }
}
