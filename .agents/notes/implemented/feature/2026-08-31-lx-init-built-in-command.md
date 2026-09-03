# Agent Note: /init becomes a built-in host command

Status: implemented

English | [中文](2026-08-31-lx-init-built-in-command.zh.md)

## Problem

`/init` shipped as a loose preset row pointing at `~/.dsh/plugins/lxcode-init/index.js`, so the command existed only on machines carrying that file and the preset line. Every other human command in the deployment (compact, goal, export) is a first-class package in the harness tree.

## Decision

**Promote the command to the harness package `@deepseek-ai/dsh-command-init`, mounted on the host plane of the web bundle.**

- The package sits in `packages/context/command-init` beside `agent-instructions` (the loader that consumes the drafted file) and follows the `command-compact` template: `name`/`inject = ['commands']` exports, an `apply` that registers through `ctx.effect`, and the invariant companion.
- The handler keeps the steer-only contract: resolve `agent.session.header.cwd`, check for an existing `AGENTS.md`, and steer one user message (draft vs. improvement prompt, optional user focus points appended). No file is ever written by the command; the write rides the agent's plan-first discipline.
- The web bundle's `cordis.patch.yml` inserts `command-init` into the host rows, so every composed preset — not only the LxCode preset — discovers `/init`; `web-app/package.json` and `tsconfig.host.json` carry the matching registration surfaces.
- The user-side loose row is retired: the LxCode preset no longer references `~/.dsh/plugins/lxcode-init` (the registry throws on a duplicate command name, so both rows could never coexist).

## Alternatives considered

**Register the command from `dsh-agent-instructions` itself.** The loader package owns AGENTS.md read semantics, so hosting the writer-side prompt there is cohesive, and a `ctx.inject(['commands'])` child would stay inert without a registry. Rejected: `dsh-commands` would become a peer dependency of a context package that every composition mounts, including providerless/ACP trees that have no command plane; a dedicated command package composes the same registration surface with zero cost to those trees and follows the `command-compact` precedent.

**Keep the user-side preset row.** Zero harness-tree changes, but the command would keep existing only on machines carrying `~/.dsh/plugins/lxcode-init/index.js` — every fresh install would lack `/init`, and the registry's duplicate-name guard would prevent the built-in and loose rows from ever coexisting during migration.

## Consequences

`/init` works in any LX-DSH install (dev and packaged) without user-directory setup, and other presets composing the web bundle get it too. The behavior is unchanged from the loose plugin: same prompts, same result texts, same confirmation-before-write flow. Tests pin the registration surface (Loader-safe exports, dispose), the four handler branches, the command lifecycle pair, and a real-Loader composition that discovers and executes the command end to end.
