// Chat surface: session header (title / cwd / model picker / watermark), folded
// message list with streaming render, composer with send/stop + queue hint.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  Check,
  ChevronDown,
  Cpu,
  FolderOpen,
  Inbox,
  Loader2,
  Square,
  Terminal,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLX } from '@/dsh/store';
import { cn } from '@/lib/utils';
import type { Block, Item } from './fold';
import { foldEvents } from './fold';
import { md } from './markdown';
import { BrandMark } from './Titlebar';

export function ChatView() {
  const openSessionId = useLX((s) => s.openSessionId);
  if (!openSessionId) return <EmptyChat />;
  return <SessionChat key={openSessionId} />;
}

function SeqTag({ seq }: { seq: number }) {
  return (
    <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[8.5px] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/50">
      #{seq}
    </span>
  );
}

function SessionChat() {
  const id = useLX((s) => s.openSessionId) as string;
  const events = useLX((s) => s.events);
  const loading = useLX((s) => s.historyLoading);
  const hasMore = useLX((s) => s.hasMore);
  const running = useLX((s) => s.sessionRunning);
  const title = useLX((s) => s.title);
  const cwd = useLX((s) => s.sessionCwd);
  const lastSeq = useLX((s) => s.lastSeq);
  const items = useMemo(() => foldEvents(events), [events]);

  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastItem = items[items.length - 1];

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 110;
  };
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, lastItem && lastItem.key, lastItem && (lastItem as any).blocks && (lastItem as any).blocks.length]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <ChatHeader id={id} title={title} cwd={cwd} running={running} lastSeq={lastSeq} />
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-[880px] flex-col gap-5">
          {hasMore ? (
            <button
              className="self-center rounded-full border border-sidebar-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-secondary-foreground"
              onClick={() => void useLX.getState().loadOlder()}
            >
              load earlier messages
            </button>
          ) : null}
          {items.map((it) => (
            <Row key={it.key} item={it} />
          ))}
          {loading ? (
            <div className="flex items-center gap-2 px-1 font-mono text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> loading history…
            </div>
          ) : null}
          {items.length === 0 && !loading ? (
            <div className="py-16 text-center">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
                blank session
              </div>
              <div className="mt-2 text-[13px] text-muted-foreground">
                send the first message to start
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <Composer running={running} />
    </main>
  );
}

function ChatHeader({
  title,
  cwd,
  running,
  lastSeq,
}: {
  id: string;
  title: string | null;
  cwd: string | null;
  running: boolean;
  lastSeq: number;
}) {
  const models = useLX((s) => s.models);
  const current = models?.current;
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border bg-background px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[14px] font-semibold tracking-tight">
            {title ?? 'new session'}
          </h1>
          {running ? (
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ok">
              <span className="dot-pulse size-1.5 rounded-full bg-ok" />
              running
            </span>
          ) : null}
        </div>
        {cwd ? (
          <button
            className="mt-0.5 flex max-w-full items-center gap-1 font-mono text-[10px] text-muted-foreground/80 hover:text-secondary-foreground"
            onClick={() => void window.lx.openPath(cwd)}
            title={cwd}
          >
            <FolderOpen className="size-2.5 shrink-0" />
            <span className="truncate">{cwd}</span>
          </button>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {lastSeq > 0 ? (
          <span className="hidden font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground/50 md:inline">
            seq {lastSeq}
          </span>
        ) : null}
        <ModelPicker />
      </div>
    </div>
  );
}

function ModelPicker() {
  const models = useLX((s) => s.models);
  const current = models?.current;
  const openSessionId = useLX((s) => s.openSessionId);
  if (!openSessionId) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1.5 border-sidebar-border bg-surface-1 font-mono text-[11px] tracking-tight',
            !models && 'opacity-60',
          )}
        >
          <Cpu className="size-3.5 text-brand-2" />
          {current ? current.model : 'model?'}
          {current?.reasoningEffort ? (
            <span className="text-muted-foreground">· {current.reasoningEffort}</span>
          ) : null}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 border-sidebar-border bg-popover">
        <DropdownMenuLabel className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          model
          {!models?.routable ? <Badge variant="secondary" className="text-[9px]">not routable</Badge> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {models?.groups.map((g) => (
          <DropdownMenuGroup key={g.id}>
            <DropdownMenuLabel className="pl-2 text-[11px] font-medium text-muted-foreground">
              {g.name}
            </DropdownMenuLabel>
            {g.models.map((m) => (
              <ModelRow key={m.id} groupId={g.id} modelId={m.id} name={m.name} efforts={m.reasoning?.efforts ?? []} defaultEffort={m.reasoning?.defaultEffort} />
            ))}
          </DropdownMenuGroup>
        ))}
        {models?.failures.length ? (
          <>
            <DropdownMenuSeparator />
            {models.failures.map((f) => (
              <DropdownMenuItem key={f.id} disabled className="text-[11px] text-muted-foreground">
                {f.name} — {f.message.slice(0, 40)}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelRow({
  groupId,
  modelId,
  name,
  efforts,
  defaultEffort,
}: {
  groupId: string;
  modelId: string;
  name: string;
  efforts: { id: string; name: string; description?: string }[];
  defaultEffort?: string;
}) {
  const current = useLX((s) => s.models?.current);
  const isCurrent = current?.provider === groupId && current?.model === modelId;
  if (efforts.length <= 1) {
    return (
      <DropdownMenuItem
        className="flex items-center gap-2 text-[12px]"
        onClick={() => {
          const eff = efforts[0]?.id;
          void useLX.getState().selectModel(groupId, modelId, eff);
        }}
      >
        <span className="flex w-4 justify-center">{isCurrent ? <Check className="size-3.5 text-brand-2" /> : null}</span>
        {name}
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-[12px]">
        <span className="flex w-4 justify-center">{isCurrent ? <Check className="size-3.5 text-brand-2" /> : null}</span>
        {name}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44 border-sidebar-border bg-popover">
        {efforts.map((e) => (
          <DropdownMenuCheckboxItem
            key={e.id}
            className="text-[12px]"
            checked={isCurrent && current?.reasoningEffort === e.id}
            onCheckedChange={() => void useLX.getState().selectModel(groupId, modelId, e.id)}
          >
            {e.name}
            {e.id === defaultEffort ? <span className="ml-2 text-[9px] text-muted-foreground">default</span> : null}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function Row({ item }: { item: Item }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="group relative flex flex-col items-end">
          <div className="max-w-[78%] whitespace-pre-wrap rounded-lg rounded-br-sm border border-primary/25 bg-primary/12 px-3.5 py-2.5 text-[13.5px] leading-[1.65]">
            {item.text}
          </div>
          <SeqTag seq={item.seq} />
        </div>
      );
    case 'context':
      return (
        <div className="group relative flex items-start gap-2 px-1">
          <Badge
            variant="outline"
            className="mt-0.5 h-4 shrink-0 border-sidebar-border bg-surface-1 px-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground"
          >
            {item.label}
          </Badge>
          <span className="line-clamp-2 min-w-0 text-[11.5px] leading-snug text-muted-foreground/80">
            {item.text}
          </span>
          <SeqTag seq={item.seq} />
        </div>
      );
    case 'assistant':
      return <AssistantRow item={item} />;
    case 'tool':
      return <ToolRow item={item} />;
    case 'divider': {
      const tone =
        item.tone === 'ok'
          ? 'text-ok/80'
          : item.tone === 'warn'
            ? 'text-warn/90'
            : item.tone === 'info'
              ? 'text-brand-2/70'
              : 'text-muted-foreground/60';
      return (
        <div className={cn('group relative flex items-center gap-2.5 px-1 font-mono text-[9.5px] uppercase tracking-[0.16em]', tone)}>
          <span className="h-px w-5 bg-current opacity-40" />
          <span className="truncate normal-case tracking-normal">{item.text}</span>
          <span className="ml-auto h-px flex-1 bg-sidebar-border/50" />
          <SeqTag seq={item.seq} />
        </div>
      );
    }
  }
}

function AssistantRow({ item }: { item: Extract<Item, { kind: 'assistant' }> }) {
  const blocks = item.blocks.filter(Boolean) as Block[];
  const streaming = item.streaming;
  const showThinking = streaming && blocks.length === 0;
  return (
    <div className="group relative flex gap-3">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-surface-1">
        <BrandMark className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-brand-2/80">
            assistant
          </span>
          {item.stepLabel ? (
            <span className="font-mono text-[8.5px] text-muted-foreground/50">{item.stepLabel}</span>
          ) : null}
          {item.usage?.outputTokens ? (
            <span className="ml-auto font-mono text-[8.5px] text-muted-foreground/40">
              out {item.usage.outputTokens} tok
            </span>
          ) : null}
        </div>
        {showThinking ? (
          <div className="flex items-center gap-2 py-1">
            <div className="shimmer h-3.5 w-40 rounded" />
            <div className="shimmer h-3.5 w-24 rounded" />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {blocks.map((b, i) => {
              if (b.type === 'reasoning') return <ReasoningBlock key={i} text={b.text} />;
              if (b.type === 'tool-call')
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-sidebar-border/70 bg-surface-1 px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground"
                  >
                    <Wrench className="size-3 text-brand-2/70" />
                    {b.name ?? 'tool'}
                    {b.id ? <span className="truncate opacity-50">{b.id}</span> : null}
                  </div>
                );
              return (
                <div key={i} className="text-[13.5px] leading-[1.7] text-foreground/95">
                  {md(b.text)}
                  {streaming && i === blocks.length - 1 ? (
                    <span className="stream-cursor ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-brand-2/90" />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SeqTag seq={item.seq} />
    </div>
  );
}

function ReasoningBlock({ text }: { text: string }) {
  return (
    <details className="group/r rounded-md border border-sidebar-border/70 bg-surface-1/60">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground hover:text-secondary-foreground">
        <BrainCircuit className="size-3" />
        thinking
        <span className="ml-auto normal-case tracking-normal opacity-60">{text.length} chars</span>
        <ChevronDown className="size-3 transition-transform group-open/r:rotate-180" />
      </summary>
      <pre className="overflow-x-auto whitespace-pre-wrap border-t border-sidebar-border/70 px-3 py-2 font-mono text-[11px] leading-[1.6] text-muted-foreground">
        {text}
      </pre>
    </details>
  );
}

function ToolRow({ item }: { item: Extract<Item, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const out = typeof item.output === 'string' ? item.output : item.output != null ? JSON.stringify(item.output) : '';
  const outLines = out ? out.split('\n').length : 0;
  const long = outLines > 14;
  const Icon = item.viewCard === 'terminal' ? Terminal : Wrench;
  let prettyArgs: string | null = null;
  if (item.args && item.viewCard !== 'terminal') {
    try {
      prettyArgs = JSON.stringify(JSON.parse(item.args), null, 2);
    } catch {
      prettyArgs = item.args;
    }
  }
  return (
    <div className="group relative rounded-md border border-sidebar-border bg-surface-1/80">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon className={cn('size-3.5 shrink-0', item.done ? 'text-muted-foreground' : 'text-warn')} />
        <span className="truncate font-mono text-[11px] font-semibold text-secondary-foreground">
          {item.title || item.name}
        </span>
        {item.description ? (
          <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">{item.description}</span>
        ) : null}
        <span
          className={cn(
            'ml-auto shrink-0 font-mono text-[8.5px] uppercase tracking-[0.16em]',
            item.done ? 'text-ok/80' : 'text-warn',
          )}
        >
          {item.done ? 'done' : 'running'}
        </span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-sidebar-border px-3 py-2.5">
          {prettyArgs ? (
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded bg-code-bg px-2.5 py-2 font-mono text-[10.5px] leading-[1.6] text-secondary-foreground/80">
              {prettyArgs.slice(0, 6000)}
            </pre>
          ) : null}
          {out ? (
            <>
              <pre
                className={cn(
                  'overflow-x-auto whitespace-pre rounded bg-code-bg px-2.5 py-2 font-mono text-[10.5px] leading-[1.6] text-secondary-foreground',
                  long && !expanded && 'max-h-44 overflow-y-auto',
                )}
              >
                {out.slice(0, 30000)}
              </pre>
              {long ? (
                <button
                  className="self-start font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground hover:text-secondary-foreground"
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? 'collapse output' : 'expand output (' + outLines + ' lines)'}
                </button>
              ) : null}
            </>
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {item.done ? '— no output —' : '…'}
            </span>
          )}
        </div>
      ) : null}
      <SeqTag seq={item.seq} />
    </div>
  );
}

function Composer({ running }: { running: boolean }) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const queueCount = useLX((s) => s.queue.length);
  const jobs = useLX((s) => s.jobs);

  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 168) + 'px';
  };
  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    requestAnimationFrame(autosize);
    void useLX.getState().sendPrompt(t);
  };

  return (
    <div className="shrink-0 border-t border-sidebar-border bg-sidebar/50 px-6 py-4">
      <div className="mx-auto max-w-[880px]">
        {queueCount > 0 || jobs > 0 ? (
          <div className="mb-2 flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
            {queueCount > 0 ? <span>{queueCount} queued</span> : null}
            {jobs > 0 ? <span>{jobs} background jobs</span> : null}
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-xl border border-input bg-surface-1 p-2 transition-colors focus-within:border-ring/50">
          <Textarea
            ref={taRef as any}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              autosize();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              running
                ? 'Agent is running — Enter queues this message'
                : 'Message the agent…  (Enter send · Shift+Enter newline)'
            }
            className="max-h-42 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[13.5px] shadow-none focus-visible:ring-0"
          />
          {running ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0 border-err/40 text-err hover:bg-err/10 hover:text-err"
                  onClick={() => void useLX.getState().stop()}
                >
                  <Square className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">stop current turn</TooltipContent>
            </Tooltip>
          ) : (
            <Button size="icon" className="size-9 shrink-0" disabled={!text.trim()} onClick={send}>
              <ChevronDown className="size-4 rotate-180" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-background">
      <div className="flex size-14 items-center justify-center rounded-xl border border-sidebar-border bg-surface-1">
        <BrandMark className="size-7" />
      </div>
      <div className="text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          no session open
        </div>
        <div className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          Pick a session from the sidebar, or create a new workspace + session to start talking to the agent.
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-sidebar-border bg-surface-1"
        onClick={() => void useLX.getState().refresh()}
      >
        <Inbox className="size-3.5" />
        refresh sessions
      </Button>
    </main>
  );
}
