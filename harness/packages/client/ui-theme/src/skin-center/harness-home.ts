/**
 * Harness-home resolution for the skin center: the same precedence the dsh
 * launcher uses, delegating to @deepseek-ai/dsh-home-paths. Adapted from
 * the community skin-center's harness-home (Apache-2.0) with the local
 * resolution swapped.
 * @module ui-theme/skin-center/harness-home
 */

import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/**
 * Resolve the DSH harness home: $DSH_HOME (or ~/.dsh). An optsHome value
 * joins `.dsh` like the launcher does.
 */
export function resolveHarnessHome(optsHome?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (optsHome !== undefined) {
    const trimmed = optsHome.trim()
    if (trimmed !== '') return trimmed.endsWith('.dsh') || trimmed.endsWith('.dsh/') ? trimmed : `${trimmed.replace(/\/+$/u, '')}/.dsh`
  }
  return resolveDshHome(undefined, env)
}
