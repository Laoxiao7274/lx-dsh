// Wire types mirrored from @deepseek-ai/dsh-host-apiproxy schemas (validated host-side;
// these are the client-side shapes the renderer folds on).

export interface RpcError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError };
export interface RpcResponse<T> {
  rpcId: string;
  result: RpcResult<T>;
}

export interface HostDescribe {
  version: string;
  cwd: string;
  provider?: string;
  model?: string;
  attachedSessions: number;
  canOpenPath: boolean;
}

export interface SessionSummary {
  sessionId: string;
  updatedAt: number;
  running: boolean;
  blank: boolean;
  parentSessionId?: string;
  origin?: 'subagent';
  cwd?: string;
  agentPreset?: string;
  projections?: { asOfSeq: number; values: Record<string, unknown> };
}

export interface WorkspaceView {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelSelection {
  provider: string;
  model: string;
  reasoningEffort?: string;
}
export interface ModelCatalogModel {
  id: string;
  name: string;
  description?: string;
  reasoning?: { efforts: { id: string; name: string; description?: string }[]; defaultEffort?: string };
}
export interface ModelProviderGroup {
  id: string;
  name: string;
  models: ModelCatalogModel[];
}
export interface ModelsValue {
  current: ModelSelection;
  routable: boolean;
  groups: ModelProviderGroup[];
  failures: { id: string; name: string; message: string }[];
}

export interface SessionEvent {
  type: string;
  seq: number;
  time: number;
  data: any;
  sourceEventSeqs?: number[];
  surfaceOp?: unknown;
  ignorable?: boolean;
}
export interface ToolEventView {
  for: 'call' | 'result';
  view: Record<string, any> & { card: string };
}
export interface HistoryEntry {
  event: SessionEvent;
  view?: ToolEventView;
}
export interface HistoryValue {
  events: HistoryEntry[];
  hasMore: boolean;
  projections?: { asOfSeq: number; values: Record<string, unknown> };
}
export interface QueueItem {
  id: string;
  placement: 'queued' | 'steering' | 'context';
  message: { id: string; role: string; content: any[]; source: any };
}
export interface PromptContentPart {
  type: 'text';
  text: string;
}
export interface PromptValue {
  accepted: true;
  command?: { kind: 'success'; text?: string };
}

export type MuxFrame =
  | { type: 'session/event'; sessionId: string; event: SessionEvent; view?: ToolEventView }
  | { type: 'session/subscribed'; sessionId: string; lastSeq: number }
  | { type: 'approval/requested'; sessionId: string; approvalId: string; toolName: string; callId?: string; reason?: string }
  | { type: 'approval/resolved'; sessionId: string; approvalId: string; outcome: string }
  | { type: 'question/requested'; sessionId: string; questions: any[] }
  | { type: 'question/resolved'; sessionId: string; questionRpcId: string; outcome: string }
  | { type: 'session/queue'; sessionId: string; items: QueueItem[] }
  | { type: 'session/jobs'; sessionId: string; jobs: any[] }
  | { type: 'session/projection'; sessionId: string; key: string; value: unknown; seq: number }
  | { type: 'stream/error'; error: RpcError };

export type HostFrame =
  | { type: 'host/session-added'; sessionId: string; blank: boolean; parentSessionId?: string; origin?: 'subagent'; cwd?: string; agentPreset?: string }
  | { type: 'host/session-removed'; sessionId: string }
  | { type: 'host/session-status'; sessionId: string; running: boolean }
  | { type: 'host/agent-error'; sessionId: string; message: string }
  | { type: 'host/workspace-changed'; workspace: WorkspaceView }
  | { type: 'host/workspace-removed'; workspaceId: string }
  | { type: 'host/workspace-order-changed'; workspaceIds: string[] }
  | { type: 'host/archived-sessions-changed'; archivedSessionIds: string[] }
  | { type: 'host/remote-event'; event: string; args: unknown[] }
  | { type: 'stream/error'; error: RpcError };

export interface BackendEvent {
  state: 'idle' | 'starting' | 'handshaking' | 'running' | 'failed' | 'stopping';
  baseUrl?: string;
  pid?: number;
  dshVersion?: string;
  error?: string;
  detail?: string;
  /** Set when the web UI is served by a remote backend this shell connected to. */
  remoteUrl?: string;
}
export interface BackendLogLine {
  stream: 'stdout' | 'stderr';
  line: string;
}
export interface FrameMsgEvent {
  stream: 'mux' | 'host';
  frame: { rpcId: string; payload: MuxFrame | HostFrame };
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  source: 'third-party' | 'self';
  official: boolean;
  readme?: string;
}
