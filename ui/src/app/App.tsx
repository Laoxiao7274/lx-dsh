// LX-DSH root. The real dsh web UI is loaded directly into the main webContents
// once the backend is running, so its dropdowns / popovers are never clipped by
// a child-view rectangle. The custom titlebar is an overlay WebContentsView (see
// main.ts) that floats on top — drag region, telemetry and window controls live
// there. While booting the startup shell shows underneath that overlay.
//
// When loaded with hash #plugins, the app shows the PluginView as a standalone
// window (opened from the titlebar button while the DSH web UI is running).
import { useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useLX } from '@/dsh/store';
import { PluginView } from './PluginView';
import { StartupView } from './StartupView';
import { Titlebar } from './Titlebar';

// Hash route: #plugins opens the plugin manager as a standalone window.
function isPluginWindow(): boolean {
  return typeof window !== 'undefined' && window.location.hash === '#plugins';
}

/** Plugin manager standalone window — syncs theme like the titlebar does. */
function PluginWindow() {
  const theme = useLX((s) => s.theme);
  useEffect(() => {
    useLX.getState().init();
    // The plugin window opens after the backend is already running, so the
    // init's backend:event(running) re-sync won't fire. Poll the theme a
    // few times until the backend responds.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (useLX.getState().backend.state === 'running' || attempts > 10) {
        clearInterval(timer);
      }
      // syncThemeFromSettings is a module-level function we can't call
      // directly, but toggling the theme action re-reads settings. Instead,
      // dispatch a backend info refresh which triggers the running handler.
      void window.lx.backend.info().then((i) => {
        useLX.setState({ backend: { state: i.state, baseUrl: i.baseUrl, pid: i.pid, dshVersion: i.dshVersion } });
        if (i.state === 'running') {
          // Manually trigger theme sync by calling the settings API
          void window.lx.api('settings', 'describe', {}).then((res: any) => {
            const ns = res?.result?.ok ? res.result.value?.namespaces?.find((n: any) => n.ns === 'ui-theme') : null;
            const pref = ns?.value?.preference ?? 'system';
            const resolved = pref === 'dark' ? 'dark' : pref === 'light' ? 'light'
              : typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', resolved === 'dark');
            useLX.setState({ theme: resolved });
          }).catch(() => {});
        }
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <PluginView onClose={() => window.close()} />
      </div>
      <Toaster position="bottom-right" theme={theme} richColors closeButton />
    </TooltipProvider>
  );
}

export default function App() {
  const pluginMode = isPluginWindow();
  const running = useLX((s) => s.backend.state === 'running');
  const theme = useLX((s) => s.theme);
  const [showPlugins, setShowPlugins] = useState(false);
  useLX.getState().init();

  useEffect(() => {
    const handler = (): void => setShowPlugins(true);
    window.addEventListener('lx:open-plugins', handler);
    return () => window.removeEventListener('lx:open-plugins', handler);
  }, []);

  // Plugin manager standalone window: full-screen PluginView, no titlebar.
  if (pluginMode) {
    return <PluginWindow />;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Titlebar onPlugins={() => void window.lx.plugins.open()} />
        {showPlugins ? (
          <PluginView onClose={() => setShowPlugins(false)} />
        ) : running ? null : (
          <StartupView />
        )}
      </div>
      <Toaster position="bottom-right" theme={theme} richColors closeButton />
    </TooltipProvider>
  );
}
