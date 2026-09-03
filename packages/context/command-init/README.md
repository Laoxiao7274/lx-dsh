# @deepseek-ai/dsh-command-init

English | [中文](README.zh.md)

Human-facing `/init` control over project instructions. The plugin registers one global command through [`ctx.commands`](../../interaction/commands/README.md) that steers the receiving agent to analyze the current project and draft — or, when one exists, improve — its `AGENTS.md`, which the [agent-instructions loader](../agent-instructions/README.md) then injects into every session opened in the project.

## Command contract

| Input | Result |
|---|---|
| `/init` (no `AGENTS.md`) | Steers a read-only analysis then a full draft following the standard six-part structure; success text: `Analyzing the project to draft AGENTS.md — a draft will be presented for your confirmation.` |
| `/init` (existing `AGENTS.md`) | Steers a gap check against the same structure and a full replacement draft that keeps still-valid content; success text: `Analyzing the project to improve AGENTS.md — a draft will be presented for your confirmation.` |
| `/init <focus points>` | Appends `用户补充关注点：<input>` (user focus points) to the steer text. |
| no session cwd | `No working directory available for /init.` — nothing is steered. |

The handler only steers one user message through `agent.steer`; it writes no file. The analysis, the draft, and the eventual `AGENTS.md` write ride on the agent's ordinary disciplines — read-only exploration, plan-first, and user confirmation before writing. Every resolved invocation records the executor-owned log-only pair `command/run` / `command/done`; neither event joins model history, while the steered prompt becomes ordinary session input.

## Composition

The producer injects `commands` only:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-init
  name: '@deepseek-ai/dsh-command-init'
```

The LX-DSH Web bundle mounts it on the host plane, so every composed preset discovers `/init`; other deployments opt in per composition.

## Model Experience

### Human `/init` control

#### What the model sees

The slash input and direct result never enter a model request. The steered analysis prompt enters as one ordinary user message; the drafted `AGENTS.md` text is presented in conversation for confirmation before any write.

#### Token effect

The command lifecycle adds no model tokens. The steer starts one analysis turn whose size follows the project; the confirmed `AGENTS.md` then rides the agent-instructions loader's byte budget.

#### KV Cache effect

Command bookkeeping does not affect the cache. The steered prompt extends the conversation exactly like a typed user message of the same content.

## Known Limitations and Deferred Work

- **Steer-only** — the command never writes `AGENTS.md` itself; the write path stays with the agent's plan-first discipline, so a declined draft leaves the project untouched.
- **Session cwd required** — a session without a working directory gets a direct error; there is no fallback directory.
