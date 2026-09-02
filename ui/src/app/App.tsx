// LX-DSH root. The real dsh web UI is loaded directly into the main webContents
// once the backend is running, so its dropdowns / popovers are never clipped by
// a child-view rectangle. There is no titlebar: the window is frameless and its
// chrome (drag region, window controls) lives in the web UI's Session Header
// (ui-lx-shell). While booting the startup shell shows — it carries its own
// slim drag strip and window controls.
//
// When loaded with hash #plugins, the app shows the PluginView as a standalone
// window (opened from the Session Header chrome while the DSH web UI is running).
import { useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useLX, syncThemeFromSettings } from '@/dsh/store';
import { PluginView } from './PluginView';
import { RemoteView } from './RemoteView';
import { StartupView } from './StartupView';

// Hash routes: #plugins opens the plugin manager, #remote the remote-backend
// connection window (both standalone child windows).
function windowRoute(): 'plugins' | 'remote' | null {
  if (typeof window === 'undefined') return null;
  if (window.location.hash === '#plugins') return 'plugins';
  if (window.location.hash === '#remote') return 'remote';
  return null;
}

/** Plugin manager standalone window — syncs theme like the titlebar does. */
function PluginWindow() {
  const theme = useLX((s) => s.theme);
  useEffect(() => {
    useLX.getState().init();
    // The plugin window opens after the backend is already running, so the
    // init's backend:event(running) re-sync won't fire. Poll until the backend
    // responds, then sync the theme from the shared ui-theme setting.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (useLX.getState().backend.state === 'running' || attempts > 10) {
        clearInterval(timer);
        return;
      }
      void window.lx.backend.info().then((i) => {
        useLX.setState({ backend: { state: i.state, baseUrl: i.baseUrl, pid: i.pid, dshVersion: i.dshVersion } });
        if (i.state === 'running') void syncThemeFromSettings();
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
  const route = windowRoute();
  const running = useLX((s) => s.backend.state === 'running');
  const theme = useLX((s) => s.theme);
  useEffect(() => {
    useLX.getState().init();
  }, []);

  // Plugin manager standalone window: full-screen PluginView, no titlebar.
  if (route === 'plugins') {
    return <PluginWindow />;
  }

  // Remote-backend connection window: full-screen RemoteView, no titlebar.
  if (route === 'remote') {
    return (
      <TooltipProvider delayDuration={250}>
        <div className="h-screen overflow-hidden bg-background text-foreground">
          <RemoteView onClose={() => window.close()} />
        </div>
        <Toaster position="bottom-right" theme={theme} richColors closeButton />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {running ? null : <StartupView />}
      </div>
      <Toaster position="bottom-right" theme={theme} richColors closeButton />
    </TooltipProvider>
  );
}
