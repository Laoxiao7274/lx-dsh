// LX-DSH user todos (userData/todos.json): the user's personal to-do lists,
// one bucket per workspace (project), for the sidebar panel. Everything is
// user-editable state that must survive restarts but never leaves this
// machine (same class of data as settings). The workspace key is the
// caller-supplied bucket id (the web client passes the harness WorkspaceId;
// '' is the no-workspace default bucket).
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './log.js';

/** One to-do entry as stored on disk. */
export interface LxTodoItem {
  /** Stable identity for list keys and targeted mutations. */
  id: string;
  /** The user's text, stored verbatim (trimmed on input). */
  text: string;
  /** Whether the item is checked off. */
  done: boolean;
  /** Creation time (epoch ms). */
  createdAt: number;
  /** Completion time, present once done. */
  doneAt?: number;
}

/** In-memory copy of the persisted buckets; loaded lazily. */
let cache: Record<string, LxTodoItem[]> | null = null;

function todosPath(): string {
  return join(app.getPath('userData'), 'todos.json');
}

/** Coerce an untrusted parsed value into a clean item, or drop it. */
function cleanItem(value: unknown): LxTodoItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || item.id === '') return null;
  if (typeof item.text !== 'string' || item.text.trim() === '') return null;
  if (typeof item.done !== 'boolean') return null;
  if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) return null;
  return {
    id: item.id,
    text: item.text,
    done: item.done,
    createdAt: item.createdAt,
    ...(item.done && typeof item.doneAt === 'number' ? { doneAt: item.doneAt } : {}),
  };
}

/** Read the persisted buckets (best-effort; a corrupt file degrades to empty). */
function loadTodos(): Record<string, LxTodoItem[]> {
  try {
    const raw = readFileSync(todosPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    // Legacy shape (flat list from the pre-workspace era): adopt it as the
    // default bucket so an upgrading user keeps their entries.
    if (Array.isArray(parsed)) {
      const items = parsed.map(cleanItem).filter((item): item is LxTodoItem => item !== null)
      return items.length > 0 ? { '': items } : {}
    }
    if (typeof parsed !== 'object' || parsed === null) return {}
    const buckets: Record<string, LxTodoItem[]> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      const seen = new Set<string>()
      const items: LxTodoItem[] = []
      for (const row of value) {
        const item = cleanItem(row)
        if (item === null || seen.has(item.id)) continue
        seen.add(item.id)
        items.push(item)
      }
      if (items.length > 0) buckets[key] = items
    }
    return buckets
  } catch {
    return {}
  }
}

/** Atomically persist the buckets (best-effort; failures are logged only). */
function persist(buckets: Record<string, LxTodoItem[]>): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(todosPath(), JSON.stringify(buckets, null, 2), 'utf8');
  } catch (err) {
    log('todos write failed: ' + String(err));
  }
}

/** One bucket's items as a caller-owned copy. */
function snapshot(bucket: LxTodoItem[]): LxTodoItem[] {
  return bucket.map(item => ({ ...item }));
}

/** The current buckets (loads on first use). */
export function readAllTodos(): Record<string, LxTodoItem[]> {
  if (cache === null) cache = loadTodos();
  const out: Record<string, LxTodoItem[]> = {};
  for (const [key, items] of Object.entries(cache)) out[key] = snapshot(items);
  return out;
}

/** One bucket's list (missing bucket = empty). */
export function readTodos(workspaceKey: string): LxTodoItem[] {
  if (cache === null) cache = loadTodos();
  return snapshot(cache[workspaceKey] ?? []);
}

/**
 * Apply one mutation to one bucket and persist it. The mutation receives a
 * private draft; returning the draft's replacement commits it. Every caller
 * gets the bucket's post-state back so the renderer never needs a follow-up
 * read.
 * @returns the committed bucket list.
 */
export function mutateTodos(workspaceKey: string, apply: (draft: LxTodoItem[]) => LxTodoItem[]): LxTodoItem[] {
  if (cache === null) cache = loadTodos();
  const next = apply([...(cache[workspaceKey] ?? [])]);
  if (next.length > 0) cache[workspaceKey] = next;
  else delete cache[workspaceKey];
  persist(cache);
  return snapshot(next);
}

/** Mint one new item from trimmed text (empty text is rejected with null). */
export function newTodoItem(text: string): LxTodoItem | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return { id: randomUUID(), text: trimmed, done: false, createdAt: Date.now() };
}
