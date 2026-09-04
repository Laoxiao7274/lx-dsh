// LX-DSH user todos (userData/todos.json): the user's personal to-do list for
// the sidebar panel. Everything is user-editable state that must survive
// restarts but never leaves this machine (same class of data as settings).
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

/** In-memory copy of the persisted list; loaded lazily, mutated via apply(). */
let cache: LxTodoItem[] | null = null;

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

/** Read the persisted list (best-effort; a corrupt file degrades to empty). */
function loadTodos(): LxTodoItem[] {
  try {
    const raw = readFileSync(todosPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Drop invalid rows; also drop duplicate ids so list keys stay unique.
    const seen = new Set<string>();
    const items: LxTodoItem[] = [];
    for (const row of parsed) {
      const item = cleanItem(row);
      if (item === null || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    return items;
  } catch {
    return [];
  }
}

/** Atomically persist the list (best-effort; failures are logged only). */
function persist(items: LxTodoItem[]): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(todosPath(), JSON.stringify(items, null, 2), 'utf8');
  } catch (err) {
    log('todos write failed: ' + String(err));
  }
}

/** The current list (loads on first use), ordered oldest first. */
export function readTodos(): LxTodoItem[] {
  if (cache === null) cache = loadTodos();
  return cache.map(item => ({ ...item }));
}

/**
 * Apply one mutation to the list and persist it. The mutation receives a
 * private draft; returning the draft's replacement commits it. Every caller
 * gets the post-state back so the renderer never needs a follow-up read.
 * @returns the committed list.
 */
export function mutateTodos(apply: (draft: LxTodoItem[]) => LxTodoItem[]): LxTodoItem[] {
  if (cache === null) cache = loadTodos();
  cache = apply([...cache]);
  persist(cache);
  return cache.map(item => ({ ...item }));
}

/** Mint one new item from trimmed text (empty text is rejected with null). */
export function newTodoItem(text: string): LxTodoItem | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return { id: randomUUID(), text: trimmed, done: false, createdAt: Date.now() };
}
