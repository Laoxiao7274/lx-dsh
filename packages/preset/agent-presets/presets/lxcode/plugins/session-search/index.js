/**
 * @lxcode/session-search — Cross-session memory search tool for LxCode.
 *
 * Registers a `session_search` tool that lets the agent full-text search
 * across ALL session histories (not just the current one) via the host
 * `ctx.sessionQuery` service (backed by SQLite FTS5). This closes the "memory
 * silo" gap: when the agent encounters a problem it solved in a previous
 * session, it can search for that prior context instead of starting fresh.
 *
 * Three actions:
 *   - search:   Full-text search across all sessions, returns matching sessions
 *               ranked by relevance with snippets.
 *   - list:     List recent sessions (newest-first) with titles and metadata.
 *   - read:     Read one session's surface (current model-visible messages) to
 *               recover the full context of a past conversation.
 *
 * Loaded as a LOOSE preset row (scoped to LxCode). It CONSUMES the host `tools`
 * service and PUBLISHES nothing, so it needs no isolate realm. It uses only
 * ctx services, so it resolves from any location by absolute file path — no
 * global node_modules install required.
 *
 * The `search`, `list`, and `read` actions require `ctx.sessionQuery` to be
 * mounted with search enabled (openAt != 'never'); the host profile must
 * override the default `openAt: never` to `first-search` or `startup` with a
 * durable path. `search_checkpoints` reads the project's .lxcode/ files
 * directly and works without the service.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NAME = 'lxcode-session-search';
const INJECT = ['tools'];

const TOOL_NAME = 'session_search';
const TOOL_DESCRIPTION =
  'Search across ALL session histories and project memory (not just the current conversation) to find prior work, decisions, code, or solutions from past sessions. This is your long-term memory: when you encounter something you may have solved before, search for it here. Use "search" for full-text search across session histories, "search_checkpoints" to search checkpoint summaries and their raw source messages, "list" to browse recent sessions, or "read" to recover a specific session\'s full context.';

// Max results to return per action, to bound output size.
const MAX_SEARCH_HITS = 10;
const MAX_LIST_SESSIONS = 20;
const MAX_READ_EVENTS = 50;
const MAX_CHECKPOINT_HITS = 10;
const MAX_SNIPPET_CHARS = 300;

/**
 * Format a session search hit into a compact result entry.
 * Only extracts leaf fields — never serializes the live session/query objects.
 */
function formatSearchHit(hit) {
  if (!hit || typeof hit !== 'object') return null;
  const header = hit.header || {};
  const bestMatch = hit.bestMatch || {};
  return {
    sessionId: header.id || 'unknown',
    title: header.title || '(untitled)',
    cwd: header.cwd || '',
    createdAt: header.createdAt,
    live: hit.live,
    persisted: hit.persisted,
    matchSnippet: bestMatch.snippet || '',
    matchType: bestMatch.type || '',
    matchSeq: bestMatch.seq,
  };
}

/**
 * Format a session record (from list) into a compact entry.
 */
function formatSessionRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const header = record.header || {};
  return {
    sessionId: header.id || 'unknown',
    title: header.title || '(untitled)',
    cwd: header.cwd || '',
    createdAt: header.createdAt,
    live: record.live,
    persisted: record.persisted,
  };
}

/**
 * Extract text content from a surface event for the read action.
 * Only pulls the minimal text needed — never serializes live objects.
 */
function extractEventText(event) {
  if (!event || typeof event !== 'object') return '';
  const data = event.data;
  if (!data) return '';
  // user/message and assistant/message carry content blocks
  if (Array.isArray(data.content)) {
    return data.content
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text || '')
      .join('\n')
      .slice(0, 1000); // cap per-event text
  }
  // tool/call and tool/result have structured data
  if (event.type === 'tool/call' && data.name) {
    return `[tool call: ${data.name}]`;
  }
  if (event.type === 'tool/result' && data.message) {
    const content = data.message.content;
    if (Array.isArray(content)) {
      return content
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text || '')
        .join('\n')
        .slice(0, 500);
    }
  }
  return '';
}

/**
 * Extract a snippet around the first match of `needle` (case-insensitive)
 * in `haystack`. Returns a bounded excerpt with match context.
 */
function snippetAround(haystack, needle, maxChars) {
  if (!haystack || !needle) return '';
  const lower = haystack.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx === -1) return haystack.slice(0, maxChars);
  const half = Math.floor((maxChars - needle.length) / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(haystack.length, start + maxChars);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < haystack.length ? '…' : '';
  return prefix + haystack.slice(start, end).trim() + suffix;
}

/**
 * Search .lxcode/ checkpoint and raw files for a text query.
 * Scans checkpoint.md, checkpoints/*.md, and raw/*.md.
 * Returns { file, type, snippet }[] sorted by modification time (newest first).
 */
function searchCheckpointFiles(cwd, query, maxHits) {
  const stateDir = join(cwd, '.lxcode');
  if (!existsSync(stateDir)) return [];
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return [];

  const candidates = [];
  // Collect all candidate files: current checkpoint, archives, raw sources
  const checkpointFile = join(stateDir, 'checkpoint.md');
  if (existsSync(checkpointFile)) {
    candidates.push({ path: checkpointFile, type: 'checkpoint' });
  }
  const archiveDir = join(stateDir, 'checkpoints');
  if (existsSync(archiveDir)) {
    for (const f of readdirSync(archiveDir)) {
      if (f.endsWith('.md')) candidates.push({ path: join(archiveDir, f), type: 'checkpoint-archive' });
    }
  }
  const rawDir = join(stateDir, 'raw');
  if (existsSync(rawDir)) {
    for (const f of readdirSync(rawDir)) {
      if (f.endsWith('.md')) candidates.push({ path: join(rawDir, f), type: 'raw-source' });
    }
  }

  // Sort newest-first by mtime
  candidates.sort((a, b) => {
    try {
      return statSync(b.path).mtimeMs - statSync(a.path).mtimeMs;
    } catch {
      return 0;
    }
  });

  const hits = [];
  for (const c of candidates) {
    if (hits.length >= maxHits) break;
    let text;
    try {
      text = readFileSync(c.path, 'utf8');
    } catch {
      continue;
    }
    if (text.toLowerCase().includes(needle)) {
      hits.push({
        file: c.path,
        type: c.type,
        snippet: snippetAround(text, query, MAX_SNIPPET_CHARS),
      });
    }
  }
  return hits;
}

function apply(ctx) {
  const tools = ctx.get('tools');
  if (!tools || typeof tools.register !== 'function') return;

  ctx.effect(() =>
    tools.register({
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['search', 'search_checkpoints', 'list', 'read'],
            description:
              'search: full-text search across all session histories. search_checkpoints: search checkpoint summaries and raw source messages in .lxcode/. list: browse recent sessions. read: recover one session\'s full message history.',
          },
          query: {
            type: 'string',
            description:
              'Search query (for "search" and "search_checkpoints" actions). For "search": natural language matched by FTS5. For "search_checkpoints": substring matched against checkpoint.md and raw source files. Required for search/search_checkpoints; ignored otherwise.',
          },
          sessionId: {
            type: 'string',
            description:
              'Session ID to read (for "read" action). Obtain it from a prior "search" or "list" result. Required for "read"; ignored otherwise.',
          },
          limit: {
            type: 'number',
            description:
              'Maximum results to return (for "search" and "list"). Defaults to 10 for search, 20 for list.',
          },
        },
        required: ['action'],
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sessionId: { type: 'string' },
                  title: { type: 'string' },
                  cwd: { type: 'string' },
                  createdAt: { type: 'string' },
                  matchSnippet: { type: 'string' },
                  matchType: { type: 'string' },
                  live: { type: 'boolean' },
                  persisted: { type: 'boolean' },
                },
              },
            },
            content: { type: 'string' },
            error: { type: 'string' },
            total: { type: 'number' },
          },
        },
        render: (args, value) => {
          if (value && value.error) {
            return [{ type: 'text', text: `Error: ${value.error}` }];
          }
          if (value && value.content) {
            return [{ type: 'text', text: value.content }];
          }
          if (value && Array.isArray(value.results)) {
            // Checkpoint search results have { file, type, snippet }
            if (value.results[0] && value.results[0].file) {
              const lines = value.results.map((r, i) => {
                const parts = [`${i + 1}. [${r.type}] ${r.file}`];
                if (r.snippet) parts.push(`   ${r.snippet}`);
                return parts.join('\n');
              });
              return [{ type: 'text', text: `${value.results.length} checkpoint match(es):\n\n${lines.join('\n\n')}` }];
            }
            // Session search results have { sessionId, title, ... }
            const lines = value.results.map((r, i) => {
              const parts = [`${i + 1}. [${r.sessionId}] ${r.title || '(untitled)'}`];
              if (r.cwd) parts.push(`   cwd: ${r.cwd}`);
              if (r.createdAt) parts.push(`   created: ${r.createdAt}`);
              if (r.matchSnippet) parts.push(`   match: ${r.matchSnippet}`);
              if (r.live) parts.push('   (live)');
              else if (r.persisted) parts.push('   (persisted)');
              return parts.join('\n');
            });
            const header = value.total != null
              ? `${value.total} result(s):\n\n`
              : `${value.results.length} result(s):\n\n`;
            return [{ type: 'text', text: header + lines.join('\n\n') }];
          }
          return [{ type: 'text', text: 'No results.' }];
        },
      },
      async execute(args, exec) {
        const { action, query, sessionId, limit: rawLimit } = args || {};
        const signal = exec && exec.signal;

        // search_checkpoints reads only the project's .lxcode/ files, so it
        // runs without the sessionQuery service — every other action needs it.
        if (action === 'search_checkpoints') {
          if (!query || !query.trim()) {
            return { error: 'query is required for "search_checkpoints" action.' };
          }
          const limit = Math.min(Math.max(1, rawLimit || MAX_CHECKPOINT_HITS), 50);
          const agent = exec && exec.agent;
          const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd;
          if (!cwd) {
            return { error: 'No working directory available for checkpoint search.' };
          }
          const hits = searchCheckpointFiles(cwd, query.trim(), limit);
          return { results: hits, total: hits.length };
        }

        // Get sessionQuery service — it's optional (search may be disabled).
        let sessionQuery;
        try {
          sessionQuery = ctx.get('sessionQuery');
        } catch {
          return { error: 'sessionQuery service is not available.' };
        }
        if (!sessionQuery) {
          return { error: 'sessionQuery service is not mounted. Ensure session-query-sqlite is enabled with openAt != "never".' };
        }

        try {
          if (action === 'search') {
            if (!query || !query.trim()) {
              return { error: 'query is required for "search" action.' };
            }
            const limit = Math.min(Math.max(1, rawLimit || MAX_SEARCH_HITS), 100);
            const request = {
              query: query.trim(),
              limit,
            };
            // Filter to the current project's cwd if available, so cross-session
            // search stays scoped to this project rather than mixing projects.
            const agent = exec && exec.agent;
            const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd;
            if (cwd) {
              request.sessionFilters = [{ kind: 'cwd', values: [cwd] }];
            }
            const page = await sessionQuery.searchSessions(request, signal ? { signal } : undefined);
            const results = (page.items || []).map(formatSearchHit).filter(Boolean);
            return { results, total: results.length };
          }

          if (action === 'list') {
            const limit = Math.min(Math.max(1, rawLimit || MAX_LIST_SESSIONS), 100);
            const records = await sessionQuery.listSessions(signal);
            // Filter to current project cwd if available
            const agent = exec && exec.agent;
            const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd;
            const filtered = cwd
              ? records.filter((r) => r && r.header && r.header.cwd === cwd)
              : records;
            const sorted = filtered
              .sort((a, b) => (b.header.createdAt || 0) - (a.header.createdAt || 0))
              .slice(0, limit);
            const results = sorted.map(formatSessionRecord).filter(Boolean);
            return { results, total: results.length };
          }

          if (action === 'read') {
            if (!sessionId || !sessionId.trim()) {
              return { error: 'sessionId is required for "read" action.' };
            }
            // Read the session surface (current model-visible messages)
            const snapshot = await sessionQuery.readSurface(sessionId.trim(), signal);
            const events = (snapshot.events || []).slice(-MAX_READ_EVENTS);
            const session = snapshot.session || {};
            // Extract text from each event, keeping output bounded
            const lines = [];
            lines.push(`Session: ${session.id || sessionId}`);
            lines.push(`Title: ${session.title || '(untitled)'}`);
            lines.push(`cwd: ${session.cwd || ''}`);
            lines.push(`Events: ${events.length} (showing last ${MAX_READ_EVENTS})`);
            lines.push('');
            for (const event of events) {
              const text = extractEventText(event);
              if (text) {
                const role = event.type === 'assistant/message' ? 'assistant' :
                             event.type === 'user/message' ? 'user' :
                             event.type === 'tool/call' ? 'tool-call' :
                             event.type === 'tool/result' ? 'tool-result' : event.type;
                lines.push(`[${role}] ${text}`);
              }
            }
            return { content: lines.join('\n') };
          }

          return { error: `Unknown action: ${action}. Use "search", "list", or "read".` };
        } catch (error) {
          // sessionQuery errors are typed — extract the code if available
          const code = error && error.code;
          const msg = error && error.message ? error.message : String(error);
          if (code === 'SESSION_QUERY_SEARCH_DISABLED') {
            return {
              error: 'Session search is disabled. Set openAt to "first-search" or "startup" in the session-query-sqlite config.',
            };
          }
          if (code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
            return { error: `Session not found: ${sessionId}` };
          }
          return { error: `Session query failed: ${msg}` };
        }
      },
    }),
    'lxcode-session-search.tool()'
  );
}

export { NAME as name, INJECT as inject, apply };
