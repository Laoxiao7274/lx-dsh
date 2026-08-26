// Pre-running surface: a calm, large boot screen — brand mark with an orbiting
// ring while busy, one status line, quiet telemetry, and a collapsed log.
// No telemetry grid, no raw log wall.
import { useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLX } from '@/dsh/store';
import { cn } from '@/lib/utils';
import { BrandMark } from './Titlebar';

const STATUS_TEXT: Record<string, string> = {
  starting: 'Starting dsh backend',
  handshaking: 'Connecting to backend',
  stopping: 'Stopping backend',
  failed: 'Backend failed to start',
  idle: 'Backend stopped',
  running: 'Ready',
};

export function StartupView() {
  const backend = useLX((s) => s.backend);
  const logTail = useLX((s) => s.logTail);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logTail.length]);

  const busy = backend.state === 'starting' || backend.state === 'handshaking';
  const failed = backend.state === 'failed';

  const telemetry = [
    backend.baseUrl ? `port ${backend.baseUrl.split(':').pop()}` : null,
    backend.pid != null ? `pid ${backend.pid}` : null,
    backend.dshVersion ? `dsh ${backend.dshVersion}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-background p-8">
      {/* ambient glow behind the mark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-72 rounded-full bg-brand-1/10 blur-3xl" />
      </div>

      {/* brand */}
      <div className="relative flex flex-col items-center">
        <div className="relative">
          {busy ? (
            <div className="absolute -inset-3 animate-spin rounded-full border-2 border-transparent border-t-brand-1/70" />
          ) : null}
          <BrandMark className="size-28" />
        </div>
        <div className="mt-7 text-2xl font-semibold tracking-tight">LX-DSH</div>
        <div className="mt-1.5 text-[13px] text-muted-foreground">deepseek harness desktop</div>
      </div>

      {/* one calm status line */}
      <div className="relative mt-10 flex flex-col items-center gap-3.5">
        <div className="flex items-center gap-2 text-[13px]">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              busy ? 'bg-brand-1' : failed ? 'bg-err' : 'bg-muted-foreground/50',
              busy && 'dot-pulse',
            )}
          />
          <span className={failed ? 'text-err' : 'text-secondary-foreground'}>
            {STATUS_TEXT[backend.state] ?? backend.state}
            {busy ? '…' : ''}
          </span>
        </div>
        {busy ? <div className="shimmer h-1 w-56 rounded-full" /> : null}
      </div>

      {/* failure detail */}
      {backend.error ? (
        <div className="relative mt-8 w-[480px] max-w-full rounded-xl border border-err/25 bg-err/6 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-err" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground">Backend error</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground">
                {backend.error}
                {backend.detail ? ` — ${backend.detail}` : ''}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* actions */}
      <div className="relative mt-8 flex gap-2">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => window.lx.backend.restart()}
          disabled={busy}
        >
          <RefreshCw data-icon="inline-start" className={cn('size-3.5', busy && 'animate-spin')} />
          {busy ? 'starting…' : failed ? 'retry' : 'restart backend'}
        </Button>
        {backend.baseUrl ? (
          <Button
            variant="outline"
            size="sm"
            className="border-sidebar-border bg-card"
            onClick={() => window.lx.webview()}
          >
            open in web view
          </Button>
        ) : null}
      </div>

      {/* quiet telemetry + collapsed log */}
      <div className="relative mt-12 flex flex-col items-center gap-2.5">
        <div className="font-mono text-[11px] text-muted-foreground/60">
          {telemetry || 'backend not started'}
        </div>
        <details className="group w-[480px] max-w-full">
          <summary className="cursor-pointer select-none text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground group-open:text-muted-foreground">
            backend log ({logTail.length})
          </summary>
          <div
            ref={logRef}
            className="mt-2 max-h-36 overflow-y-auto rounded-lg bg-code-bg p-3 font-mono text-[11px] leading-[1.7]"
          >
            {logTail.length === 0 ? (
              <span className="text-muted-foreground/50">waiting for output…</span>
            ) : (
              logTail.map((l, i) => (
                <div key={i} className={cn(l.stream === 'stderr' ? 'text-err/80' : 'text-muted-foreground/90')}>
                  {l.line}
                </div>
              ))
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
