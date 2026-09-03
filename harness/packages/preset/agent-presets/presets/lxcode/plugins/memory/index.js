/**
 * @lxcode/memory — MiMo-style persistent checkpoint + project memory for LxCode.
 *
 * Three layers mirroring MiMo-Code's persistent memory architecture:
 *
 *   1. CHECKPOINT DISK PERSISTENCE — on each `compaction/summary` session event,
 *      write the structured checkpoint text to <project>/.lxcode/checkpoint.md
 *      so it outlives the session and the in-context summary. ALSO proactively
 *      writes on turn boundaries (every N turns) and on agent idle/disposed,
 *      so short sessions that never trigger compaction still persist state.
 *
 *   2. MEMORY RE-INJECTION — a scoped system-prompt section that, at every prompt
 *      assembly, injects the last checkpoint plus any hand-maintained
 *      <project>/.lxcode/MEMORY.md. A fresh/resumed session in the same project
 *      "wakes up" with prior state — MiMo's seamless-rebuild semantics.
 *
 *   3. MEMORY UPDATE TOOL — a model-facing tool that lets the agent update
 *      MEMORY.md through a structured interface, so project knowledge is
 *      maintained mechanically rather than relying on ad-hoc file writes.
 *
 * Additionally:
 *   - Checkpoints are structured (11 fields) when generated proactively via LLM,
 *     matching MiMo-Code's checkpoint-writer subagent pattern.
 *   - Versioned checkpoints: old checkpoints archived with timestamp, not silently
 *     overwritten.
 *   - Atomic writes (temp + rename) for crash safety.
 *   - Concurrency guard per project directory.
 *
 * Loaded as a LOOSE preset row (scoped to LxCode). It CONSUMES the host
 * `systemPrompt`, `llm`, and `tools` services and PUBLISHES no service, so it
 * needs no isolate realm (same shape as the `persona` row). It uses only `node:`
 * builtins and ctx services, so it resolves from any location by absolute file
 * path — no global node_modules install required.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const NAME = 'lxcode-memory';
const INJECT = ['systemPrompt'];

const STATE_DIR = '.lxcode';
const CHECKPOINT_FILE = 'checkpoint.md';
const CHECKPOINT_ARCHIVE_DIR = 'checkpoints'; // historical checkpoints
const MEMORY_FILE = 'MEMORY.md';
const SECTION_NAME = 'lxcode:project-memory';
const SECTION_ORDER = 50; // after persona (0), before tool guidance (100+)
const MAX_FILE_CHARS = 20000; // cap each injected file to bound prompt growth
const MAX_WRITE_CHARS = 40000; // cap MEMORY.md on write; looser than injection
const MAX_ARCHIVED = 10; // keep at most N historical checkpoints

// Proactive checkpoint trigger: write every N completed turns
const CHECKPOINT_TURN_INTERVAL = 5;
// Proactive checkpoint: max conversation messages to send to the writer LLM
const CHECKPOINT_MAX_MESSAGES = 40;

// Directory for checkpoint source-message snapshots (raw conversation text that
// the checkpoint summary was generated from, so search can find the original).
const CHECKPOINT_RAW_DIR = 'raw';
// Max total chars of raw source messages to persist per checkpoint.
const MAX_RAW_CHARS = 30000;

const TOOL_NAME = 'update_memory';
const TOOL_DESCRIPTION =
  'Update the project memory file (.lxcode/MEMORY.md) with durable project knowledge — architecture decisions, conventions, key file locations, recurring patterns, and lessons learned. This memory persists across sessions and is re-injected into every new conversation, so keep it concise, accurate, and high-signal. Use "append" to add a new section, "replace" to overwrite the entire file, or "read" to view the current content.';

/** Build the checkpoint file path for a project cwd. */
const checkpointPath = (cwd) => join(cwd, STATE_DIR, CHECKPOINT_FILE);
const memoryPath = (cwd) => join(cwd, STATE_DIR, MEMORY_FILE);
const archiveDirPath = (cwd) => join(cwd, STATE_DIR, CHECKPOINT_ARCHIVE_DIR);
const rawDirPath = (cwd) => join(cwd, STATE_DIR, CHECKPOINT_RAW_DIR);

/** Read a file trimmed and size-capped; '' when absent or unreadable. */
function readCapped(path) {
  let text;
  try {
    if (!existsSync(path)) return '';
    text = readFileSync(path, 'utf8');
  } catch {
    return '';
  }
  text = text.trim();
  if (!text) return '';
  if (text.length > MAX_FILE_CHARS) {
    text = text.slice(0, MAX_FILE_CHARS) + '\n…(truncated)';
  }
  return text;
}

/**
 * Prompt sections are variable templates: the assembly validates every
 * `{{...}}` group as a variable reference, so foreign prose carrying docker/go
 * templates, mustache, or C++ brace-init throws and blocks EVERY prompt
 * assembly in the project, and a coincidentally valid name (e.g. `{{cwd}}`)
 * silently substitutes the variable's value. Break runs of two or more `{`
 * with spaces — the model reads through them; single braces (JSON) stay put,
 * and `}` runs are left alone because the scanner only anchors on `{{`.
 * @param {string} text - raw MEMORY.md/checkpoint.md content.
 * @returns {string} content safe to embed in a prompt section.
 */
const escapeTemplateRefs = (text) => text.replace(/\{{2,}/g, (run) => run.split('').join(' '));

/**
 * Atomic write: write to a temp file in the same directory, then rename.
 * rename is atomic on the same filesystem (POSIX and Windows NTFS).
 */
function atomicWrite(file, content) {
  const dir = join(file, '..');
  const tmp = file + '.tmp.' + process.pid;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, file);
    return true;
  } catch {
    // Best-effort cleanup of the temp file on failure
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* swallow */
    }
    return false;
  }
}

/**
 * Archive the current checkpoint before overwriting, keeping at most
 * MAX_ARCHIVED historical copies. Best-effort — never blocks the new write.
 */
function archiveOldCheckpoint(cwd, logger) {
  const cur = checkpointPath(cwd);
  if (!existsSync(cur)) return;
  try {
    const dir = archiveDirPath(cwd);
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = join(dir, `checkpoint-${stamp}.md`);
    // Copy current to archive
    const content = readFileSync(cur, 'utf8');
    writeFileSync(dest, content, 'utf8');
    // Prune oldest beyond MAX_ARCHIVED
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('checkpoint-') && f.endsWith('.md'))
      .sort(); // ISO stamps sort chronologically
    while (files.length > MAX_ARCHIVED) {
      const oldest = files.shift();
      try {
        unlinkSync(join(dir, oldest));
      } catch {
        /* swallow */
      }
    }
  } catch (error) {
    if (logger && logger.warn) logger.warn(`lxcode-memory: failed to archive old checkpoint: ${error.message}`);
  }
}

/**
 * Persist a checkpoint to the project dir. Archives the previous one first.
 * Never throws.
 */
function persistCheckpoint(cwd, summary, logger) {
  const file = checkpointPath(cwd);
  const header = `<!-- LxCode checkpoint @ ${new Date().toISOString()} -->\n`;
  const body = typeof summary === 'string' ? summary.trim() : '';
  if (!body) return false;
  archiveOldCheckpoint(cwd, logger);
  const ok = atomicWrite(file, `${header}\n${body}\n`);
  if (ok) {
    if (logger && logger.info) logger.info(`lxcode-memory: checkpoint written to ${file}`);
  } else {
    if (logger && logger.warn) logger.warn(`lxcode-memory: failed to write checkpoint to ${file}`);
  }
  return ok;
}

/**
 * Persist the raw source messages that a proactive checkpoint was generated from.
 * Stored as a timestamped markdown file under .lxcode/raw/, so session_search
 * can find the original conversation text behind a structured checkpoint summary.
 * Prunes old raw snapshots beyond MAX_ARCHIVED. Never throws.
 */
function persistRawMessages(cwd, messages, logger) {
  if (!messages || messages.length === 0) return;
  try {
    const dir = rawDirPath(cwd);
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `raw-${stamp}.md`);
    const header = `<!-- LxCode raw source @ ${stamp} — original messages behind a proactive checkpoint -->\n`;
    const body = messages
      .map((m) => {
        const role = m.role || 'user';
        return `### [${role}]\n${m.content || ''}`;
      })
      .join('\n\n');
    const capped = body.length > MAX_RAW_CHARS ? body.slice(0, MAX_RAW_CHARS) + '\n…(truncated)' : body;
    atomicWrite(file, `${header}\n${capped}\n`);
    // Prune oldest beyond MAX_ARCHIVED
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('raw-') && f.endsWith('.md'))
      .sort();
    while (files.length > MAX_ARCHIVED) {
      const oldest = files.shift();
      try {
        unlinkSync(join(dir, oldest));
      } catch {
        /* swallow */
      }
    }
  } catch (error) {
    if (logger && logger.warn) logger.warn(`lxcode-memory: failed to persist raw messages: ${error.message}`);
  }
}

/**
 * Collect recent conversation messages from the session surface for a
 * proactive checkpoint. Returns { role, content }[] suitable for an LLM call.
 */
function collectRecentMessages(session, maxMessages) {
  const messages = session.deriveMessages();
  if (!messages || messages.length === 0) return [];
  const recent = messages.slice(-maxMessages);
  return recent
    .map((msg) => {
      const role = msg.role || (msg.tool_call_id ? 'tool' : 'user');
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter((b) => b && (b.type === 'text' || b.type === 'tool-result' || b.type === 'tool-call'))
          .map((b) => {
            if (b.type === 'text') return b.text || '';
            if (b.type === 'tool-result')
              return `[tool result: ${
                typeof b.content === 'string' ? b.content.slice(0, 500) : JSON.stringify(b.content).slice(0, 500)
              }]`;
            if (b.type === 'tool-call')
              return `[tool call: ${b.name}(${
                typeof b.input === 'string' ? b.input.slice(0, 200) : JSON.stringify(b.input).slice(0, 200)
              })]`;
            return '';
          })
          .join('\n');
      }
      return { role, content: content.slice(0, 2000) }; // cap per-message length
    })
    .filter((m) => m.content.length > 0);
}

/**
 * The structured checkpoint instruction, mirroring MiMo-Code's 11-field format.
 * Sent to the LLM to generate a structured state snapshot.
 */
const CHECKPOINT_INSTRUCTION = `You are a checkpoint writer. Analyze the conversation so far and produce a structured checkpoint capturing the current state of work. This checkpoint will be used to resume the session if the context window is reset or a new session is opened in the same project.

Output a markdown document with EXACTLY these sections (omit a section only if truly nothing applies, but keep the heading):

## Current Intent
What the user is trying to accomplish right now.

## Next Action
The immediate next step to take.

## Working Constraints
Any constraints, requirements, or user preferences discovered.

## Task Tree
Hierarchical breakdown of sub-tasks and their completion status (use T1, T1.1, etc.).

## Current Work
What was being done in the most recent steps.

## Involved Files
Key files read, modified, or created — with one-line context for each.

## Cross-Task Discoveries
Architecture insights, patterns, gotchas, or non-obvious facts learned.

## Errors and Fixes
Errors encountered and how they were resolved.

## Runtime State
Environment facts: working directory, platform, active background jobs, git branch if relevant.

## Design Decisions
Key decisions made and their rationale.

## Notes
Anything else worth remembering for resumption.

Be concise and factual. Do not restate the full conversation — extract only the durable state.`;

/**
 * Collect text output from an LLM stream without depending on dsh-llm's
 * BlockAssembler. Processes StreamChunk directly: accumulates text-delta
 * chunks and captures text blocks from block-end events.
 * @param {AsyncIterable} stream - the llm.stream() async iterable.
 * @returns {Promise<{text: string, finishKind: string}>} collected text and finish reason.
 */
async function collectStreamText(stream) {
  const blocks = new Map(); // index -> accumulated text
  let finishKind = 'unknown';
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue;
    switch (chunk.type) {
      case 'text-delta': {
        const idx = chunk.index;
        blocks.set(idx, (blocks.get(idx) || '') + (chunk.text || ''));
        break;
      }
      case 'block-end': {
        if (chunk.block && chunk.block.type === 'text') {
          // block-end carries the fully assembled block — prefer it
          const idx = chunk.index;
          if (chunk.block.text) {
            blocks.set(idx, chunk.block.text);
          }
        }
        break;
      }
      case 'finish': {
        finishKind = chunk.reason ? chunk.reason.kind || 'unknown' : 'unknown';
        break;
      }
      default:
        // ignore reasoning-delta, tool-call-delta, usage, block-start
        break;
    }
  }
  // Assemble final text from all text blocks in index order
  const sorted = [...blocks.entries()].sort((a, b) => a[0] - b[0]);
  const finishedText = sorted.map(([, text]) => text).join('\n').trim();
  return { text: finishedText, finishKind };
}

/**
 * Track per-cwd write locks to serialize concurrent checkpoint writes
 * within the same process. Cross-process concurrency is mitigated by
 * atomic writes (temp + rename), which last-writer-wins safely.
 */
const writeLocks = new Map();

/** Run a function with a per-cwd write lock (in-process serialization). */
async function withWriteLock(cwd, fn) {
  const key = cwd;
  while (writeLocks.has(key)) {
    await writeLocks.get(key);
  }
  const promise = (async () => fn())();
  writeLocks.set(key, promise);
  try {
    return await promise;
  } finally {
    writeLocks.delete(key);
  }
}

/**
 * Generate a structured checkpoint from collected messages and persist it.
 * Mirrors MiMo-Code's checkpoint-writer subagent pattern.
 * Does NOT depend on @deepseek-ai/dsh-llm — parses StreamChunk directly.
 * @param {Context} ctx - Cordis context with llm service.
 * @param {{provider:string, model:string}} target - model route.
 * @param {Array} messages - collected conversation messages.
 * @param {string} sessionId - session id for routing.
 * @param {string} cwd - project working directory.
 * @param {AbortSignal} signal - optional cancellation.
 * @returns {Promise<string|null>} the checkpoint text, or null on failure.
 */
async function generateCheckpointFromMessages(ctx, target, messages, sessionId, cwd, signal) {
  const llm = ctx.get('llm');
  if (!llm || typeof llm.stream !== 'function') {
    if (ctx.logger && ctx.logger.warn)
      ctx.logger.warn('lxcode-memory: llm service unavailable, cannot generate proactive checkpoint');
    return null;
  }
  if (!messages || messages.length === 0) return null;
  try {
    const options = {
      provider: target.provider,
      model: target.model,
      system:
        'You are a checkpoint writer subagent. You read conversation history and produce a structured state checkpoint file. You do not interact with the user — you only output the checkpoint document.',
      messages: [...messages, { role: 'user', content: CHECKPOINT_INSTRUCTION }],
      maxTokens: 4096,
      sessionId,
      purpose: 'compaction',
      ...(signal ? { signal } : {}),
    };
    const stream = llm.stream(options);
    const { text, finishKind } = await collectStreamText(stream);
    if (finishKind === 'error' || finishKind === 'aborted') {
      if (ctx.logger && ctx.logger.warn)
        ctx.logger.warn(`lxcode-memory: proactive checkpoint failed (finish: ${finishKind})`);
      return null;
    }
    if (!text) return null;
    await withWriteLock(cwd, () => {
      persistCheckpoint(cwd, text, ctx.logger);
      // Also persist the raw source messages so search can find the original
      // conversation text behind this structured checkpoint summary.
      persistRawMessages(cwd, messages, ctx.logger);
    });
    return text;
  } catch (error) {
    if (ctx.logger && ctx.logger.warn)
      ctx.logger.warn(`lxcode-memory: proactive checkpoint error: ${error.message || error}`);
    return null;
  }
}

function apply(ctx) {
  // Track turn count for interval-based proactive checkpointing.
  let turnCount = 0;
  let lastCheckpointTurn = 0;
  // Prevent overlapping proactive checkpoint generation.
  let proactiveInFlight = false;

  // (1a) Persist the structured checkpoint on compaction/summary.
  //     Scoped to this preset's sessions: a non-LxCode session's compaction event
  //     never reaches this listener (Cordis scope-filtered dispatch).
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'compaction/summary') return;
    const cwd = session && session.header && session.header.cwd;
    if (!cwd) return;
    const summary = ((event.data && event.data.summary) || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    if (!summary.trim()) return;
    withWriteLock(cwd, () => persistCheckpoint(cwd, summary, ctx.logger));
  });

  // (1b) Proactive checkpoint on turn/end: every N turns, generate a structured
  //     checkpoint via LLM and persist it. This covers the "short session"
  //     gap — sessions that never trigger compaction still persist state.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return;
    const cwd = session && session.header && session.header.cwd;
    if (!cwd) return;
    turnCount += 1;
    if (turnCount - lastCheckpointTurn < CHECKPOINT_TURN_INTERVAL) return;
    if (proactiveInFlight) return;
    // Only checkpoint if there was meaningful activity (completed or max-tokens)
    const reason = event.data && event.data.reason;
    if (!reason || typeof reason !== 'object') return;
    const kind = reason.kind;
    if (kind !== 'completed' && kind !== 'max-tokens') return;
    lastCheckpointTurn = turnCount;
    proactiveInFlight = true;
    // Fire-and-forget: the turn is already ending, we generate asynchronously.
    const messages = collectRecentMessages(session, CHECKPOINT_MAX_MESSAGES);
    if (messages.length === 0) {
      proactiveInFlight = false;
      return;
    }
    const sessionId = session.id;
    // Derive model route from the session's last logged request header.
    const header = session.requestHeader && session.requestHeader();
    const target = header && header.config
      ? { provider: header.config.provider, model: header.config.model }
      : null;
    if (!target) {
      proactiveInFlight = false;
      return;
    }
    generateCheckpointFromMessages(ctx, target, messages, sessionId, cwd).finally(() => {
      proactiveInFlight = false;
    });
  });

  // (1c) Persist checkpoint on agent disposal — the "session end" hook.
  //     This is the most important trigger for short sessions: even if no
  //     compaction or interval fired, disposing the agent writes a final state.
  //     Best-effort: the ctx fiber may be tearing down, so every access is guarded.
  ctx.on('agent/disposed', (payload) => {
    try {
      const agent = payload && payload.agent;
      if (!agent) return;
      const session = agent.session;
      const cwd = session && session.header && session.header.cwd;
      if (!cwd) return;
      const messages = collectRecentMessages(session, CHECKPOINT_MAX_MESSAGES);
      if (messages.length === 0) return;
      const target =
        agent.options && agent.options.provider && agent.options.model
          ? { provider: agent.options.provider, model: agent.options.model }
          : null;
      if (!target) return;
      const sessionId = session.id;
      // On dispose, generate best-effort (don't block the disposal long).
      // ctx.get('llm') may throw if the fiber is already gone — guard it.
      let llm;
      try {
        llm = ctx.get('llm');
      } catch {
        return; // fiber disposed, llm unreachable — nothing we can do
      }
      if (!llm) return;
      generateCheckpointFromMessages(ctx, target, messages, sessionId, cwd).catch(() => {});
    } catch {
      // Swallow — disposal path must never throw.
    }
  });

  // (2) Inject the last checkpoint + MEMORY.md at every prompt assembly.
  //     Empty when no state files exist, so sessions without prior state see nothing.
  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: (context) => {
        const agent = context && context.agent;
        const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd;
        if (!cwd) return '';
        // File prose is foreign text; escapeTemplateRefs keeps it from being
        // parsed as (or colliding with) prompt variable references.
        const memory = escapeTemplateRefs(readCapped(memoryPath(cwd)));
        const checkpoint = escapeTemplateRefs(readCapped(checkpointPath(cwd)));
        const parts = [
          '## LxCode Persistent Memory',
          'You have a persistent memory system. Use it actively — it is what makes you effective across long tasks and new sessions:',
          '',
          '1. **AGENTS.md** (project-level, human-visible, version-controlled): When you discover a convention, build command, architecture rule, or gotcha that ANYONE working in this project should know — write it to the project\'s `AGENTS.md` using `edit`/`write`. This is shared knowledge that travels with the code. If you find yourself explaining the same thing to the user twice, it belongs in AGENTS.md.',
          '2. **MEMORY.md** (agent-private, cross-session): Your own working notes that don\'t belong in the project repo — session-specific decisions, "why I did X this way", temporary gotchas, cross-task observations. Persist with the `update_memory` tool. Keep it concise and high-signal.',
          '3. **checkpoint.md** (auto-generated resume state): A structured snapshot of your current work — intent, task tree, involved files, decisions, errors. Written automatically on compaction, every few turns, and on session close. You do not manage this; it is your safety net.',
          '4. **session_search** (cross-session search): Before tackling a problem, consider whether you have solved something similar before. Use `session_search` with action `search` to full-text search all past session histories, or action `search_checkpoints` to search checkpoint summaries and their raw source messages. Recover a past session\'s full context with `read`.',
          '',
          'Simple rule: if it\'s a project convention that a teammate should follow, put it in AGENTS.md. If it\'s your own working context that doesn\'t belong in the repo, put it in MEMORY.md. When in doubt, prefer AGENTS.md — shared knowledge outlives private notes.',
          '',
          'These four layers complement each other: AGENTS.md is shared and durable, MEMORY.md is your private notebook, checkpoint.md is automatic continuity, and session_search is your retroactive recall. A new session in this project wakes up with the last three already loaded — treat them as established background and continue from them without restating.',
        ];
        if (memory) {
          parts.push(
            '### Project memory (MEMORY.md) — durable project knowledge you should maintain and update as you learn'
          );
          parts.push(memory);
        }
        if (checkpoint) {
          parts.push(
            '### Last checkpoint (checkpoint.md) — auto-generated resume state from the previous context window'
          );
          parts.push(checkpoint);
        }
        return parts.join('\n\n');
      },
    }),
    'lxcode-memory.section()'
  );

  // (3) Register the memory-update tool so the agent can maintain MEMORY.md
  //     through a structured interface rather than ad-hoc file writes.
  const tools = ctx.get('tools');
  if (tools && typeof tools.register === 'function') {
    ctx.effect(() =>
      tools.register({
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['append', 'replace', 'read'],
              description:
                'append: add a new section to the end of MEMORY.md. replace: overwrite the entire file. read: return the current content.',
            },
            content: {
              type: 'string',
              description:
                'The markdown content to append or replace. Required for append/replace; ignored for read. Use markdown headings (##) to structure sections.',
            },
            section: {
              type: 'string',
              description:
                'Optional: for append, a heading to prepend to the content. Ignored for replace/read.',
            },
          },
          required: ['action'],
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              error: { type: 'string' },
            },
          },
          render: (args, value) => [
            {
              type: 'text',
              text: value && value.error ? value.error : value && value.content ? value.content : 'Done.',
            },
          ],
        },
        async execute(args, exec) {
          const { action, content, section } = args || {};
          const agent = exec && exec.agent;
          const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd;
          if (!cwd) return { error: 'No working directory available.' };
          const file = memoryPath(cwd);
          if (action === 'read') {
            const text = readCapped(file);
            if (!text) return { content: 'MEMORY.md is empty or does not exist.' };
            return { content: text };
          }
          if (action !== 'append' && action !== 'replace') {
            return { error: `Unknown action: ${action}` };
          }
          if (!content || !content.trim()) {
            return { error: 'content is required for append/replace.' };
          }
          let body;
          if (action === 'replace') {
            body = content.trim();
          } else {
            // append
            const existing = readCapped(file);
            const parts = [];
            if (existing) parts.push(existing);
            if (section) parts.push(`\n## ${section}\n`);
            parts.push(content.trim());
            body = parts.join('\n');
          }
          // Cap total size (write cap is looser than the injection cap)
          if (body.length > MAX_WRITE_CHARS) {
            body = body.slice(0, MAX_WRITE_CHARS) + '\n…(truncated by update_memory)';
          }
          const ok = atomicWrite(file, body + '\n');
          if (!ok) return { error: 'Failed to write MEMORY.md.' };
          return {
            content: `MEMORY.md ${action === 'replace' ? 'replaced' : 'updated'} successfully (${body.length} chars).`,
          };
        },
      }),
      'lxcode-memory.tool()'
    );
  }
}

export { NAME as name, INJECT as inject, apply };
