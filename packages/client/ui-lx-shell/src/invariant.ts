/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-lx-shell`.
 * @module @deepseek-ai/dsh-client-ui-lx-shell/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-lx-shell'

/** Cordis companion plugin name. */
export const name = 'client-ui-lx-shell-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the row mirrors an Electron preload bridge that lives
 * outside the Cordis topology, so there is no in-process event/data relation
 * this package could assert; the bridge subscription lifecycle is covered by
 * the apply behavior spec.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
