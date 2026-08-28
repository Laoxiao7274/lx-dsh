// LX-DSH renderer state: backend lifecycle, workspace/session registries, open-session
// history + live mux frames (rAF-batched), models, queue.
import { create } from 'zustand';
import { api, unwrap, errText } from './bridge';
import type {
  BackendEvent,
  BackendLogLine,
  HistoryEntry,
  HostDescribe,
  ModelsValue,
  MuxFrame,
  HostFrame,
  QueueItem,
  SessionSummary,
  WorkspaceView,
} from './types';
import { toast } from 'sonner';

interface LXState {
  backend: BackendEvent;
  logTail: BackendLogLine[];
  describe: HostDescribe | null;
  workspaces: WorkspaceView[];
  archived: string[];
  sessions: SessionSummary[];
  refreshBusy: boolean;
  theme: 'light' | 'dark';
  openSessionId: string | null;
  events: HistoryEntry[];
  lastSeq: number;
  hasMore: boolean;
  historyLoading: boolean;
  title: string | null;
  sessionCwd: string | null;
  sessionRunning: boolean;
  models: ModelsValue | null;
  queue: QueueItem[];
  jobs: number;

  init(): void;
  refresh(): Promise<void>;
  openSession(id: string): Promise<void>;
  closeSession(): void;
  loadOlder(): Promise<void>;
  sendPrompt(text: string): Promise<void>;
  stop(): Promise<void>;
  selectModel(provider: string, model: string, effort?: string): Promise<void>;
  createWorkspaceAndSession(path: string): Promise<void>;
  createSessionInWorkspace(workspaceId: string): Promise<void>;
  renameSession(sessionId: string, title: string): Promise<void>;
  archiveSession(workspaceId: string, sessionId: string): Promise<void>;
  toggleTheme(): void;
}

// LRU cache for recently-visited sessions. When switching away, the current
// session's events/models/etc are snapshotted here so switching back is instant
// (no HTTP history re-fetch). Capped at 3 entries to bound memory.
interface SessionCache {
  events: HistoryEntry[];
  lastSeq: number;
  hasMore: boolean;
  title: string | null;
  models: ModelsValue | null;
  queue: QueueItem[];
  jobs: number;
}

const SESSION_CACHE_SIZE = 3;
const sessionCache = new Map<string, SessionCache>();

function cacheSnapshot(state: LXState): SessionCache {
  return {
    events: state.events,
    lastSeq: state.lastSeq,
    hasMore: state.hasMore,
    title: state.title,
    models: state.models,
    queue: state.queue,
    jobs: state.jobs,
  };
}

let inited = false;
let flushScheduled = false;
// Accumulate mux frames between rAF flushes using a plain array with push
// (O(1)) instead of spreading the whole array on every frame (O(N) per frame,
// O(N²) per batch). Cleared on each rAF flush.
let pendingFrames: MuxFrame[] = [];

const initialBackend: BackendEvent = { state: 'idle' };

export const useLX = create<LXState>((set, get) => ({
  backend: initialBackend,
  logTail: [],
  describe: null,
  workspaces: [],
  archived: [],
  sessions: [],
  theme: 'light',
  refreshBusy: false,
  openSessionId: null,
  events: [],
  lastSeq: 0,
  hasMore: false,
  historyLoading: false,
  title: null,
  sessionCwd: null,
  sessionRunning: false,
  models: null,
  queue: [],
  jobs: 0,

  init: () => {
    if (inited) return;
    inited = true;
    // Theme follows the DSH ui-theme setting (shared with the web UI). Sync it now,
    // and keep the chrome in step when the OS color scheme flips (for `system`).
    void syncThemeFromSettings();
    if (typeof matchMedia !== 'undefined' && typeof matchMedia('(prefers-color-scheme: dark)').addEventListener === 'function') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        void (async () => {
          try {
            if ((await readUiThemePreference()) === 'system') await syncThemeFromSettings();
          } catch {
            /* ignore */
          }
        })();
      });
    }
    window.lx.backend.onEvent((e: BackendEvent) => {
      set((s) => ({ backend: { ...s.backend, ...e } }));
      if (e.state === 'running' && !get().describe) {
        void (async () => {
          try {
            const d = unwrap(await api('host', 'describe'));
            set({ describe: d });
            await get().refresh();
            // Re-sync theme now that the backend is ready (the initial
            // syncThemeFromSettings in init likely failed because the
            // backend wasn't running yet).
            void syncThemeFromSettings();
          } catch (err) {
            toast.error('host.describe failed: ' + errText(err as any));
          }
        })();
      }
      if (e.state !== 'running') {
        sessionCache.clear();
        set({ describe: null, workspaces: [], archived: [], sessions: [], openSessionId: null, events: [], models: null, queue: [], jobs: 0, title: null, sessionRunning: false });
      }
    });
    window.lx.backend.onLog((l: BackendLogLine) => {
      set((s) => ({ logTail: [...s.logTail.slice(-160), l] }));
    });
    window.lx.backend.onFrame((m) => {
      const frame = m.frame.payload as MuxFrame | HostFrame;
      if (m.stream === 'host') {
        applyHostFrame(frame as HostFrame, set, get);
      } else {
        // Accumulate mux frames in a plain array (O(1) push) and process
        // them in a single rAF batch. No state update per frame — the old
        // code did set(frameCount++) + set(pending=[...pending, frame]) on
        // every frame, which was O(N²) per batch and triggered Zustand
        // notifications for frameCount that nothing consumed.
        pendingFrames.push(frame as MuxFrame);
        if (!flushScheduled) {
          flushScheduled = true;
          requestAnimationFrame(() => {
            flushScheduled = false;
            const frames = pendingFrames;
            pendingFrames = [];
            const s = get();
            const openId = s.openSessionId;
            if (!openId) return; // no session open — frames discarded
            // Only process frames for the currently open session. Most frames
            // during multi-session operation are for OTHER sessions and can
            // be skipped entirely.
            let events = s.events;
            let lastSeq = s.lastSeq;
            let title = s.title;
            let queue = s.queue;
            let jobs = s.jobs;
            let changed = false;
            for (const f of frames) {
              // stream/error has no sessionId — let it through to the toast below.
              const sid = (f as { sessionId?: string }).sessionId;
              if (sid !== undefined && sid !== openId) continue;
              if (f.type === 'session/event' && f.event.seq > lastSeq) {
                if (!changed) { events = events.slice(); changed = true; }
                events.push({ event: f.event, view: f.view });
                lastSeq = f.event.seq;
              } else if (f.type === 'session/projection') {
                if (f.key === 'title' && typeof f.value === 'string') { title = f.value; changed = true; }
                if (f.key === 'sessionStats') void f.value;
              } else if (f.type === 'session/queue') {
                queue = f.items; changed = true;
              } else if (f.type === 'session/jobs') {
                jobs = f.jobs.length; changed = true;
              } else if (f.type === 'question/requested') {
                toast.warning('Agent is asking a question — answer it in the Web view or via API (respond channel is P1).');
              } else if (f.type === 'approval/requested') {
                toast.warning('Approval requested for ' + f.toolName);
              }
            }
            if (changed) {
              set({ events, lastSeq, title, queue, jobs });
              // Update the session cache so a switch-back reflects live frames
              const cached = sessionCache.get(openId);
              if (cached) {
                cached.events = events;
                cached.lastSeq = lastSeq;
                cached.title = title;
                cached.queue = queue;
                cached.jobs = jobs;
              }
            }
          });
        }
      }
    });
    void window.lx.backend.info().then((i) => {
      set({ backend: { state: i.state, baseUrl: i.baseUrl, pid: i.pid, dshVersion: i.dshVersion } });
      // If the backend is already running (e.g. late init or plugin window),
      // trigger the running handler manually so theme sync + describe fire.
      if (i.state === 'running') {
        void syncThemeFromSettings();
      }
    });
  },

  refresh: async () => {
    if (get().refreshBusy) return;
    set({ refreshBusy: true });
    try {
      const [sess, ws] = await Promise.all([api('sessions', 'list'), api('workspace', 'list')]);
      const sv = unwrap(sess);
      const wv = unwrap(ws);
      set({ sessions: sv.items ?? [], workspaces: wv.items ?? [], archived: wv.archivedSessionIds ?? [] });
      // refresh running flag for the open session
      const openId = get().openSessionId;
      if (openId) {
        const s = (sv.items ?? []).find((x) => x.sessionId === openId);
        if (s) set({ sessionRunning: s.running });
      }
    } catch (err) {
      toast.error('refresh failed: ' + errText(err as any));
    } finally {
      set({ refreshBusy: false });
    }
  },

  openSession: async (id) => {
    if (get().openSessionId === id) return;

    // Snapshot the outgoing session into the LRU cache before switching.
    const oldId = get().openSessionId;
    if (oldId) {
      sessionCache.set(oldId, cacheSnapshot(get()));
      // Evict oldest if over capacity (Map preserves insertion order).
      if (sessionCache.size > SESSION_CACHE_SIZE) {
        const oldest = sessionCache.keys().next().value;
        if (oldest !== undefined) sessionCache.delete(oldest);
      }
    }

    // Check cache first — a recently-visited session restores instantly
    // without an HTTP history round-trip.
    const cached = sessionCache.get(id);
    if (cached) {
      // Move to most-recent position (delete + re-insert preserves Map order).
      sessionCache.delete(id);
      sessionCache.set(id, cached);
      set({
        openSessionId: id,
        historyLoading: false,
        ...cached,
      });
      const s = get().sessions.find((x) => x.sessionId === id);
      set({ sessionCwd: s?.cwd ?? null, sessionRunning: s?.running ?? false });
      void get().refresh();
      return;
    }

    // Cache miss — fetch history from the backend.
    set({ openSessionId: id, events: [], lastSeq: 0, hasMore: true, historyLoading: true, title: null, models: null, queue: [], jobs: 0 });
    try {
      const res = unwrap(await openHistoryWithRetry(id));
      const cur = get().openSessionId;
      if (cur !== id) return; // user switched away mid-load
      set({
        events: res.events,
        hasMore: res.hasMore,
        lastSeq: res.events.length ? res.events[res.events.length - 1].event.seq : 0,
        title: res.projections?.values?.title != null ? String(res.projections.values.title) : null,
        historyLoading: false,
      });
      const s = get().sessions.find((x) => x.sessionId === id);
      set({ sessionCwd: s?.cwd ?? null, sessionRunning: s?.running ?? false });
      void get().refresh();
      void (async () => {
        try {
          const m = unwrap(await api('sessions', 'models', { sessionId: id }));
          if (get().openSessionId === id) set({ models: m });
        } catch (err) {
          console.error('[lx-ui] models failed:', err);
        }
      })();
    } catch (err) {
      if (get().openSessionId === id) set({ historyLoading: false });
      console.error('[lx-ui] open session failed:', err);
      toast.error(historyFailText(err), { duration: 8000 });
    }
  },

  closeSession: () => {
    const oldId = get().openSessionId;
    if (oldId) {
      sessionCache.set(oldId, cacheSnapshot(get()));
      if (sessionCache.size > SESSION_CACHE_SIZE) {
        const oldest = sessionCache.keys().next().value;
        if (oldest !== undefined) sessionCache.delete(oldest);
      }
    }
    set({ openSessionId: null, events: [], models: null, queue: [] });
  },

  loadOlder: async () => {
    const id = get().openSessionId;
    const events = get().events;
    if (!id || !events.length) return;
    const beforeSeq = events[0].event.seq - 1;
    try {
      const res = unwrap(await api('sessions', 'history', { sessionId: id, beforeSeq, maxMessages: 100 }));
      if (get().openSessionId !== id) return;
      const seen = new Set(events.map((e) => e.event.seq));
      const older = res.events.filter((e) => !seen.has(e.event.seq));
      const merged = [...older, ...events];
      set({ events: merged, hasMore: res.hasMore });
      const cached = sessionCache.get(id);
      if (cached) { cached.events = merged; cached.hasMore = res.hasMore; }
    } catch (err) {
      toast.error('load older failed: ' + errText(err as any));
    }
  },

  sendPrompt: async (text) => {
    const id = get().openSessionId;
    if (!id || !text.trim()) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const res = unwrap(await api('sessions', 'prompt', { sessionId: id, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: tz }));
      if (res.command?.text) toast.info('command: ' + res.command.text);
      setTimeout(() => void get().refresh(), 600);
    } catch (err) {
      toast.error('prompt failed: ' + errText(err as any));
    }
  },

  stop: async () => {
    const id = get().openSessionId;
    if (!id) return;
    try {
      await api('sessions', 'cancel', { sessionId: id });
      setTimeout(() => void get().refresh(), 400);
    } catch (err) {
      toast.error('cancel failed: ' + errText(err as any));
    }
  },

  selectModel: async (provider, model, effort) => {
    const id = get().openSessionId;
    if (!id) return;
    try {
      const res = unwrap(await api('sessions', 'selectModel', { sessionId: id, provider, model, ...(effort ? { reasoningEffort: effort } : {}) }));
      set((s) => (s.models ? { models: { ...s.models, current: res.selected } } : {}));
      toast.success('model → ' + provider + '/' + model);
    } catch (err) {
      toast.error('selectModel failed: ' + errText(err as any));
    }
  },

  createWorkspaceAndSession: async (path) => {
    try {
      const w = unwrap(await api('workspace', 'create', { path }));
      const s = unwrap(await api('sessions', 'create', { workspaceId: w.workspaceId }));
      await get().refresh();
      await get().openSession(s.sessionId);
    } catch (err) {
      toast.error('create failed: ' + errText(err as any));
    }
  },

  createSessionInWorkspace: async (workspaceId) => {
    try {
      const s = unwrap(await api('sessions', 'create', { workspaceId }));
      await get().refresh();
      await get().openSession(s.sessionId);
    } catch (err) {
      toast.error('create failed: ' + errText(err as any));
    }
  },

  renameSession: async (sessionId, title) => {
    try {
      const res = unwrap(await api('sessions', 'rename', { sessionId, title }));
      if (get().openSessionId === sessionId) set({ title: res.title });
      setTimeout(() => void get().refresh(), 400);
    } catch (err) {
      toast.error('rename failed: ' + errText(err as any));
    }
  },

  archiveSession: async (workspaceId, sessionId) => {
    try {
      await api('workspace', 'archiveSession', { workspaceId, sessionId });
      if (get().openSessionId === sessionId) get().closeSession();
      await get().refresh();
    } catch (err) {
      toast.error('archive failed: ' + errText(err as any));
    }
  },

  toggleTheme: () => {
    void (async () => {
      const next = get().theme === 'dark' ? 'light' : 'dark';
      // Optimistic chrome update so the toggle feels instant.
      document.documentElement.classList.toggle('dark', next === 'dark');
      set({ theme: next });
      // Persist to the DSH `ui-theme` setting — the single source of truth. This
      // re-themes the web UI live (applies: live) and emits a host frame that
      // re-syncs the chrome, so both stay consistent.
      try {
        await api('settings', 'update', { ns: 'ui-theme', patch: { preference: next } });
      } catch (err) {
        toast.error('Theme update failed: ' + errText(err as any));
      }
    })();
  },
}));

// Shared-DSH_HOME safety: two dsh servers writing the same artifact can tear a
// concurrent read ("corrupt Zstandard session log"). Retry once after a beat.
async function openHistoryWithRetry(id: string) {
  try {
    return await api('sessions', 'history', { sessionId: id, maxMessages: 100 });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    // Persistent on-disk inconsistency (double-writer scar): retrying is pointless.
    if (/seq gap/i.test(msg)) throw err;
    // Transient torn read (another dsh process writing the shared DSH_HOME): retry once.
    if (!/corrupt|history unavailable|zstandard/i.test(msg)) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return api('sessions', 'history', { sessionId: id, maxMessages: 100 });
  }
}

function historyFailText(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  if (/seq gap/i.test(msg)) {
    return '该会话磁盘日志有 seq 断裂（曾有两个 dsh 进程并发写入同一日志）。Web GUI（内存数据）仍可正常打开；等该会话空闲后可修复磁盘日志。';
  }
  if (/corrupt|zstandard/i.test(msg)) {
    return '读取该会话日志失败（可能被另一个 dsh 进程写入中）。稍后重试，或先在 Web GUI 中关闭该会话。';
  }
  return '打开会话失败: ' + msg.slice(0, 200);
}

function applyHostFrame(
  f: HostFrame,
  set: (partial: Partial<LXState> | ((s: LXState) => Partial<LXState>)) => void,
  get: () => LXState,
): void {
  switch (f.type) {
    case 'host/session-added': {
      set((s) => {
        const rest = s.sessions.filter((x) => x.sessionId !== f.sessionId);
        return {
          sessions: [
            {
              sessionId: f.sessionId,
              updatedAt: Date.now(),
              running: false,
              blank: f.blank,
              parentSessionId: f.parentSessionId,
              origin: f.origin,
              cwd: f.cwd,
              agentPreset: f.agentPreset,
            },
            ...rest,
          ],
        };
      });
      setTimeout(() => void get().refresh(), 300);
      break;
    }
    case 'host/session-removed':
      set((s) => ({ sessions: s.sessions.filter((x) => x.sessionId !== f.sessionId) }));
      break;
    case 'host/session-status':
      set((s) => ({
        sessions: s.sessions.map((x) => (x.sessionId === f.sessionId ? { ...x, running: f.running } : x)),
        ...(s.openSessionId === f.sessionId ? { sessionRunning: f.running } : {}),
      }));
      break;
    case 'host/agent-error':
      toast.error('agent error: ' + f.message);
      break;
    case 'host/workspace-changed':
      set((s) => {
        const rest = s.workspaces.filter((w) => w.workspaceId !== f.workspace.workspaceId);
        return { workspaces: [...rest, f.workspace] };
      });
      break;
    case 'host/workspace-removed':
      set((s) => ({ workspaces: s.workspaces.filter((w) => w.workspaceId !== f.workspaceId) }));
      break;
    case 'host/workspace-order-changed':
      set((s) => {
        const byId = new Map(s.workspaces.map((w) => [w.workspaceId, w]));
        const ordered = f.workspaceIds.map((id) => byId.get(id)).filter(Boolean) as WorkspaceView[];
        const extra = s.workspaces.filter((w) => !f.workspaceIds.includes(w.workspaceId));
        return { workspaces: [...ordered, ...extra] };
      });
      break;
    case 'host/archived-sessions-changed':
      set({ archived: f.archivedSessionIds });
      break;
    case 'host/remote-event':
      // A settings document change — when it's the theme, re-sync the chrome so it
      // stays in step with the web UI (both follow the DSH ui-theme setting).
      if (f.event === 'settings/document-updated' && Array.isArray(f.args) && f.args[0] === 'ui-theme') {
        void syncThemeFromSettings();
      }
      break;
    case 'stream/error':
      toast.error('host stream error: ' + (f.error?.message ?? 'unknown'));
      break;
  }
}

// ---- Theme: single source of truth = the DSH `ui-theme` setting (applies:live) ----
// Both the web UI (its own client-ui-theme plugin) and this chrome follow it. The
// chrome is a separate webContents, so it re-resolves `ui-theme` whenever the setting
// changes (host frame) or the OS color scheme flips (for `system`).
function resolveTheme(pref: string): 'light' | 'dark' {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  // system: follow the OS color scheme.
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
async function readUiThemePreference(): Promise<string> {
  const d = unwrap(await api('settings', 'describe'));
  const ns = (d.namespaces ?? []).find((n: { ns: string }) => n.ns === 'ui-theme');
  return (ns?.value as { preference?: string } | undefined)?.preference ?? 'system';
}
export async function syncThemeFromSettings(): Promise<void> {
  try {
    const resolved = resolveTheme(await readUiThemePreference());
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    useLX.setState({ theme: resolved });
  } catch {
    /* settings not ready yet — stay light */
  }
}
