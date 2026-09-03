# Agent Note: dsh-git puts the system git behind one JSON-safe service for the client panel

Status: implemented

English | [中文](2026-08-28-dsh-git-service.zh.md)

## Problem

The LX-DSH client is gaining an IDE-style right dock (project file tree, git changes with staging and commit, highlighted diff — design prototype at `opendesign/prototype-git-panel.html`). The host side had no git capability: the agent touches repositories only through its shell tools, which the browser cannot call, and a UI panel needs JSON-safe projections with discriminated failures (not-a-repo, missing path, empty index), not CLI exit codes.

## Decision

New capability package `@deepseek-ai/dsh-git`: `GitService` runs the system git through `simple-git` (spawning the user's installed binary, so projections match terminal output) over one workspace directory per call — `status`, `diff`, `log`, `stage`, `unstage`, `discard`, `commit`, `listDir`, `readFile`. Every failure throws with a discriminated `GitError` payload on `error.git` (`not-a-repo` / `no-such-path` / `nothing-to-commit` / `git-failed`) that the transport serializes; the panel renders the three meaningful states (not-a-repo notice, clean tree, missing path).

Three implementation facts settled empirically:

- `simple-git`'s default `status()` carries no commit hash — HEAD comes from `revparse('HEAD')` (null on an unborn branch), and the letter-partitioned changes come from `state.files` (`index`/`working_dir` letters, `?` = untracked), not the convenience string arrays.
- Path containment uses `path.relative` (a prefix string compare fails on Windows backslashes), and the workspace root itself is a legal input (an empty relative result is not an escape).
- `readFile` normalizes CRLF to LF: Windows checkout writes platform endings under `core.autocrlf`, and the inline code view renders normalized text without touching workspace bytes.

The service is model-invisible (no session events, no durable state, no tokens) and transport-free on purpose: the Connection RPC channel with its payload schemas and authority policy lands with the client panel wiring, so this change ships only the domain logic plus its behavior tests.

## Alternatives considered

**isomorphic-git (pure JS, no system git).** No dependency on the user's installed git and identical behavior across machines, but its status/porcelain semantics drift from the terminal's git — the panel would show diffs the user's own CLI contradicts — and it reimplements object databases and filters at meaningful weight for zero JSON-safety gain, since the service boundary already converts everything to typed projections.

**Shell out to `git` CLI directly with `--porcelain` parsing.** Removes the simple-git dependency, but re-owns argv quoting, Windows path quoting, exit-code taxonomy, and streaming capture that simple-git already handles; the empirical traps (status letters, revparse on unborn branches) would remain anyway, now hand-parsed.

## Consequences

- The panel's data layer is testable without any transport: tests drive a real temporary repository through the system git.
- Simple-git's porcelain shapes are contained in one file; the wire types (`src/wire.ts`) are what a transport serializes, so swapping or adding a channel cannot leak parser details.
- Discard on untracked paths removes files from disk (checkout refuses them); the panel must confirm before calling it.

## Verification

`packages/git/git/tests/git-service.host.spec.ts` drives a real temporary repository: clean-tree status, staged/unstaged/untracked partitioning, stage-commit-log with author and subject assertions, empty-index and empty-message refusals, unified diff content, discard of tracked edits and untracked files, tree status annotations with directory-first ordering, guarded file reads (missing path, ENOENT classification), and `not-a-repo` classification for a plain directory.
