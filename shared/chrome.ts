// The `window.__DSH_HOST__` declaration exposed to the hosted dsh web UI
// (deepseek-harness packages/client/web/src/host.ts). The window is frameless
// with no titlebar overlay, so no insets are reserved: the web UI fills the
// whole viewport and its Session Header hosts the window chrome itself.
export const DSH_HOST_ENV = {
  rev: 'host.v1',
  kind: 'desktop-shell',
  name: 'lx-dsh',
} as const;
