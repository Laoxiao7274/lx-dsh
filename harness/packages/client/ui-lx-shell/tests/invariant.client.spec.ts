/** The package's invariant companion registers under its manifest name. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as LxShellInvariant from '@deepseek-ai/dsh-client-ui-lx-shell/invariant'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(LxShellInvariant).await()).resolves.toBeDefined()
  })
})
