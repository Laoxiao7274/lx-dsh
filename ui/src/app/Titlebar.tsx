// LX-DSH custom title bar — quiet window chrome for a frameless window: window
// dragging via pointer events + IPC (NOT -webkit-app-region: inside a
// WebContentsView overlay the draggable-region pass ignores paint order, so a
// drag layer silently swallows button clicks no matter how the layers stack),
// the brand mark, one restrained status signal, and window controls.
// Technical detail (port / pid / dsh version) lives in a hover tooltip, not in
// the bar itself, so the chrome stays calm. Styled to match the dsh web UI's
// light DSW palette (system font, --dsw tokens mirrored in index.css).
import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, Minus, Moon, Package, Square, SunMedium, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLX } from '@/dsh/store';
import { cn } from '@/lib/utils';
import logoUrl from '@/assets/lx-logo.png';
import type { UpdateStatus } from '@/dsh/bridge';

// Brand mark: the lx-code logo (rounded square, pre-baked in ui/src/assets).
export function BrandMark({ className }: { className?: string }) {
  return <img src={logoUrl} className={className} alt="" draggable={false} />;
}

// Status dot tone per backend state.
const DOT: Record<string, string> = {
  running: 'bg-ok',
  starting: 'bg-warn',
  handshaking: 'bg-warn',
  stopping: 'bg-muted-foreground/50',
  idle: 'bg-muted-foreground/50',
  failed: 'bg-err',
};

/** Update indicator: shows a badge when a new version is downloaded.
 *  Click to quit-and-install. Silent until an update is ready. */
function UpdateButton() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!window.lx.updater) return;
    const offStatus = window.lx.updater.onStatus(setStatus);
    const offProgress = window.lx.updater.onProgress((d) => setProgress(d.percent));
    const offDownloaded = window.lx.updater.onDownloaded(() => setProgress(null));
    void window.lx.updater.status().then(setStatus).catch(() => {});
    return () => { offStatus(); offProgress(); offDownloaded(); };
  }, []);

  const downloading = progress !== null && progress < 100;
  const ready = status?.available && !downloading;

  if (!ready && !downloading) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'relative size-8 text-muted-foreground hover:text-foreground',
        ready && 'text-ok hover:text-ok',
      )}
      title={
        downloading
          ? `正在下载更新 ${progress ?? 0}%`
          : `新版本 ${status?.version ?? ''} 已就绪，点击重启安装`
      }
      onClick={() => {
        if (ready) void window.lx.updater.install();
      }}
    >
      <ArrowDownToLine className="size-4" />
      {downloading && (
        <span className="absolute bottom-1 left-1 right-1 h-0.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full bg-ok transition-all" style={{ width: `${progress ?? 0}%` }} />
        </span>
      )}
      {ready && (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-ok dot-pulse" />
      )}
    </Button>
  );
}

export function Titlebar({ onPlugins }: { onPlugins?: () => void }) {
  const backend = useLX((s) => s.backend);
  const describe = useLX((s) => s.describe);
  const theme = useLX((s) => s.theme);
  const running = backend.state === 'running';
  const port = backend.baseUrl ? backend.baseUrl.split(':').pop() : null;

  // Hover tooltip: the one place the technical detail lives.
  const statusDetail =
    backend.state === 'running'
      ? [
          'Backend running',
          port ? `port ${port}` : null,
          backend.pid != null ? `pid ${backend.pid}` : null,
          describe?.version ? `dsh ${describe.version}` : null,
        ]
          .filter(Boolean)
          .join('  ·  ')
      : `Backend ${backend.state}`;

  /** Window drag: pointer events -> IPC; the main process follows the cursor.
   *  Interactive children (buttons) opt out by stopping propagation. */
  function onHeaderPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, label, a')) return;
    e.preventDefault();
    const startX = e.screenX;
    const startY = e.screenY;
    window.lx.win.dragStart();
    const onMove = (ev: PointerEvent): void => {
      window.lx.win.dragMove(ev.screenX - startX, ev.screenY - startY);
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.lx.win.dragEnd();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onHeaderDoubleClick(): void {
    window.lx.win.max(); // titlebar convention: double-click toggles maximize
  }

  return (
    <header
      className="relative flex h-11 shrink-0 select-none items-center gap-2.5 border-b border-sidebar-border bg-sidebar pl-3 pr-1"
      onPointerDown={onHeaderPointerDown}
      onDoubleClick={onHeaderDoubleClick}
    >
      {/* brand — a calm, draggable identity mark */}
      <div className="flex items-center gap-2">
        <BrandMark className="size-4" />
        <span className="text-[13px] font-semibold tracking-tight text-foreground">LX-DSH</span>
      </div>

      {/* one restrained signal: backend status dot. The active model is shown in the
          composer's selector, so it is NOT repeated here (and a CSS tooltip would be
          clipped by the 44px overlay — use the native `title`, which the OS renders
          outside the webContents bounds). */}
      <span
        className={cn(
          'ml-1 size-1.5 shrink-0 rounded-full',
          DOT[backend.state] ?? 'bg-muted-foreground/50',
          running && 'dot-pulse',
        )}
        title={statusDetail}
      />

      {/* drag spacer */}
      <div className="flex-1" />

      {/* update indicator */}
      <UpdateButton />

      {/* plugin manager */}
      {onPlugins ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          title="插件管理"
          onClick={onPlugins}
        >
          <Package className="size-4" />
        </Button>
      ) : null}

      {/* chrome theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        title={theme === 'dark' ? 'Switch to light chrome' : 'Switch to dark chrome'}
        onClick={() => useLX.getState().toggleTheme()}
      >
        {theme === 'dark' ? <SunMedium className="size-4" /> : <Moon className="size-4" />}
      </Button>

      {/* window controls */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={() => window.lx.win.min()}
        >
          <Minus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={() => window.lx.win.max()}
        >
          <Square className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:bg-err/12 hover:text-err"
          onClick={() => window.lx.win.close()}
        >
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}