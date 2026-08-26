// Session sidebar: workspaces (directories) with their sessions, new-session dialog
// (native directory picker via host.pickDirectory intercept), rename / archive.
import { useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, unwrap, errText } from '@/dsh/bridge';
import { useLX } from '@/dsh/store';
import { cn } from '@/lib/utils';
import type { SessionSummary, WorkspaceView } from '@/dsh/types';
import { toast } from 'sonner';

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function sessionTitle(s: SessionSummary): string {
  const t = s.projections?.values?.title;
  if (typeof t === 'string' && t) return t;
  if (s.cwd) return s.cwd.split(/[\\/]/).pop() || 'session';
  return 'untitled';
}

export function Sidebar() {
  const workspaces = useLX((s) => s.workspaces);
  const archived = useLX((s) => s.archived);
  const sessions = useLX((s) => s.sessions);
  const openSessionId = useLX((s) => s.openSessionId);
  const backend = useLX((s) => s.backend);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState<SessionSummary | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const visible = sessions
    .filter((s) => !s.blank && s.origin !== 'subagent' && !archived.includes(s.sessionId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const ownerOf = (s: SessionSummary): WorkspaceView | null =>
    workspaces.find((w) => w.sessionIds.includes(s.sessionId)) ??
    workspaces.find((w) => (s.cwd ?? '').startsWith(w.path)) ??
    null;
  const byWorkspace = new Map<string, SessionSummary[]>();
  const ungrouped: SessionSummary[] = [];
  for (const s of visible) {
    const w = ownerOf(s);
    if (w) {
      const arr = byWorkspace.get(w.workspaceId) ?? [];
      arr.push(s);
      byWorkspace.set(w.workspaceId, arr);
    } else {
      ungrouped.push(s);
    }
  }

  const pickDir = async () => {
    setPicking(true);
    try {
      const res = unwrap(await api('host', 'pickDirectory'));
      if (res.path) setNewPath(res.path);
    } catch (err) {
      toast.error('pick directory: ' + errText(err as any));
    } finally {
      setPicking(false);
    }
  };

  const create = async () => {
    if (!newPath.trim()) return;
    setDialogOpen(false);
    const p = newPath.trim();
    setNewPath('');
    await useLX.getState().createWorkspaceAndSession(p);
  };

  const port = backend.baseUrl ? backend.baseUrl.split(':').pop() : null;

  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Sessions
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          {workspaces.map((w) => {
            const list = byWorkspace.get(w.workspaceId) ?? [];
            const isCollapsed = collapsed[w.workspaceId];
            return (
              <div key={w.workspaceId}>
                <div
                  className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
                  onClick={() => setCollapsed((c) => ({ ...c, [w.workspaceId]: !c[w.workspaceId] }))}
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <Folder className="size-3.5 shrink-0 text-brand-2/80" />
                  <span className="truncate text-[13px] font-medium text-secondary-foreground">{w.title}</span>
                  <span className="ml-auto font-mono text-[9.5px] text-muted-foreground/70">{list.length}</span>
                  <button
                    className="no-drag hidden size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex"
                    title="new session in this workspace"
                    onClick={(e) => {
                      e.stopPropagation();
                      void useLX.getState().createSessionInWorkspace(w.workspaceId);
                    }}
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <div className="ml-[9px] border-l border-sidebar-border pl-1">
                  {list.map((s) => (
                    <SessionRow
                      key={s.sessionId}
                      s={s}
                      active={s.sessionId === openSessionId}
                      onOpen={() => void useLX.getState().openSession(s.sessionId)}
                      onRename={() => {
                        setRenaming(s);
                        setRenameVal(sessionTitle(s));
                      }}
                      onArchive={() => {
                        const w2 = ownerOf(s);
                        if (w2) void useLX.getState().archiveSession(w2.workspaceId, s.sessionId);
                      }}
                    />
                  ))}
                </div>
                {!isCollapsed && list.length === 0 ? (
                  <div className="ml-[26px] py-1 font-mono text-[10px] text-muted-foreground/50">no sessions</div>
                ) : null}
              </div>
            );
          })}

          {ungrouped.length > 0 || workspaces.length === 0 ? (
            <div>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {workspaces.length === 0 ? 'No workspaces yet' : 'Ungrouped'}
                </span>
              </div>
              {workspaces.length === 0 ? (
                <button
                  className="mx-1 my-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md border border-dashed border-sidebar-border px-3 py-4 text-left text-[12px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-secondary-foreground"
                  onClick={() => setDialogOpen(true)}
                >
                  <FolderOpen className="size-4 text-brand-2/70" />
                  <span>
                    Create your first workspace + session
                    <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground/60">
                      pick a directory to start
                    </span>
                  </span>
                </button>
              ) : (
                ungrouped.map((s) => (
                  <SessionRow
                    key={s.sessionId}
                    s={s}
                    active={s.sessionId === openSessionId}
                    onOpen={() => void useLX.getState().openSession(s.sessionId)}
                    onRename={() => {
                      setRenaming(s);
                      setRenameVal(sessionTitle(s));
                    }}
                    onArchive={() => {
                      const w2 = ownerOf(s);
                      if (w2) void useLX.getState().archiveSession(w2.workspaceId, s.sessionId);
                    }}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t border-sidebar-border px-3 py-2">
        <span
          className={cn(
            'size-1.5 rounded-full',
            backend.state === 'running' ? 'dot-pulse bg-ok' : backend.state === 'failed' ? 'bg-err' : 'bg-warn',
          )}
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
          {backend.state}
          {port ? ' : ' + port : ''}
        </span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">{backend.dshVersion ?? ''}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={() => {
              // The plugin tab is opened from the titlebar; this sidebar button
              // is a secondary entry point that dispatches a custom event the
              // App root listens for.
              window.dispatchEvent(new CustomEvent('lx:open-plugins'));
            }}>
              <Settings className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>插件管理</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-sidebar-border bg-surface-1">
          <DialogHeader>
            <DialogTitle className="text-[15px]">New workspace + session</DialogTitle>
            <DialogDescription className="text-[12px]">
              A workspace is a local directory; a new session starts inside it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="C:\path\to\project"
              className="font-mono text-[12px]"
              autoFocus
            />
            <Button variant="outline" size="sm" onClick={() => void pickDir()} disabled={picking}>
              {picking ? '…' : 'Browse…'}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!newPath.trim()} onClick={() => void create()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-sm border-sidebar-border bg-surface-1">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Rename session</DialogTitle>
          </DialogHeader>
          <Input
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renaming && renameVal.trim()) {
                void useLX.getState().renameSession(renaming.sessionId, renameVal.trim());
                setRenaming(null);
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!renameVal.trim()}
              onClick={() => {
                if (renaming) void useLX.getState().renameSession(renaming.sessionId, renameVal.trim());
                setRenaming(null);
              }}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function SessionRow({
  s,
  active,
  onOpen,
  onRename,
  onArchive,
}: {
  s: SessionSummary;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-[5px] transition-colors',
        active ? 'bg-primary/15 text-foreground' : 'text-secondary-foreground hover:bg-sidebar-accent',
      )}
      onClick={onOpen}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          s.running ? 'dot-pulse bg-ok' : active ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px]">{sessionTitle(s)}</span>
      <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">{timeAgo(s.updatedAt)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="hidden size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40 border-sidebar-border bg-popover">
          <DropdownMenuItem className="text-[12px]" onClick={onRename}>
            <Pencil data-icon="inline-start" className="size-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-[12px] text-err focus:text-err"
            onClick={onArchive}
          >
            <Archive data-icon="inline-start" className="size-3.5" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
