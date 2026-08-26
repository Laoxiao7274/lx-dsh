// Single source of truth for the LX-DSH shell chrome geometry. electron/main.ts
// sizes the titlebar overlay view with TITLEBAR_H; preload/index.ts declares the
// same band to the hosted dsh web UI through the __DSH_HOST__ contract
// (deepseek-harness packages/client/web/src/host.ts). One constant, two
// consumers — the overlay bounds and the hosted inset can never drift apart.
export const TITLEBAR_H = 44;

/** The `window.__DSH_HOST__` declaration exposed to the hosted dsh web UI. */
export const DSH_HOST_ENV = {
  rev: 'host.v1',
  kind: 'desktop-shell',
  name: 'lx-dsh',
  chrome: { insets: { top: TITLEBAR_H } },
} as const;
