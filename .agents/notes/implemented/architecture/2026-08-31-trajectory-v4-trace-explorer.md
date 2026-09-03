# Agent Note: Trajectory v4 research-aligned trace explorer

Status: implemented

English | [中文](2026-08-31-trajectory-v4-trace-explorer.zh.md)

Extends the [Trajectory inspection ledger](../feature/2026-07-27-trajectory-inspection-ledger.md) with its fourth visual language; the ledger mechanisms there stay authoritative.

## Problem

The trajectory page went through three prototype rounds, each rejected as ugly, unclear, or off-style, so the shipped visual language did not satisfy its own users. A survey of comparable products (`opendesign/research-trace-ui.md`, screenshots archived locally) established six convergent rules across Langfuse, LangSmith, Copilot coding agent, Claude Code web, and Codex cloud:

1. The step tree is the star; a waterfall is a secondary minimap.
2. Event type is a small outlined icon plus name, never a colored row ground or a large node.
3. Duration is the only emphasized number: plain, amber at >= 20 s, red at >= 60 s.
4. Durations sit right after the name in a small muted tail; the right edge stays quiet.
5. The inspector keeps `chips + underline tabs + outlined Input/Output cards`.
6. The surface is near-monochrome with one accent for selection and links.

The approved v4 prototype (`opendesign/prototype-trajectory.html`) implements these rules; this change lands it in the package.

## Decision

- Row model heights: content 26 to 38, collapsed summary 22 to 28 (`trajectory-virtual-rows.ts`), turn head 34 to 44, step 22 to 26 (`trajectory-structure-rows.ts`). CSS mirrors each height.
- New pure module `trajectory-row-metrics.ts`: one inline metric tail per record (tool/subtool duration; assistant duration plus output tokens; user input tokens; compacted duration). `running` returns the localized running label for the CSS shimmer; `error` keeps the localized failure word. `formatHeadDuration` moved to `trajectory-record.ts` for reuse.
- Ledger rows: the visible kind micro-label is removed (the outlined 18 px icon square, its tooltip, and the row aria-label keep type identification); a 1 px tree rail plus elbow connects rows under each turn head; the metric tail renders right-aligned with slow/xslow tones.
- Turn heads render a `T{n}` square chip, a 13 px/500 title, and a metrics chip; step rows are monospace captions with the `#n` request chip and a dotted rule.
- Timeline demoted to a 44 px minimap: thinner round-capped spans, per-kind heights, violet tool tint (local `--trajectory-violet-tint`, the ContextMeter local-tint precedent), 10 px turn labels.
- Selection wash is a neutral 5 % mix; running rows shimmer via background-clip text; failed rows show the red failure word at the tail.

## Testing

- `virtual-rows.client.spec.ts` height literals 38/28 and explicit 44.
- `table.client.spec.tsx` tail-reachability scroll uses 99 999 so the taller virtual rows still expose the final collapsed row.
- New `row-metrics.client.spec.ts` covers every tail assembly and tone branch (per-file coverage gate).
- Type-level redundant guards (`'head' in record && ...`, `own !== undefined`) were rewritten to the equivalent single check the type system proves; behavior is unchanged and covered by the suite.

## Alternatives considered

**v1 cockpit** — a dashboard-like layout of metric cards above the ledger. Rejected as visually noisy: it pushed the step tree below the fold and duplicated numbers the rows themselves could carry.

**v2 house-DNA lanes** — color-grounded horizontal lanes per event kind. Rejected as unclear: color carried both type and state, and the six-rule survey confirmed comparable products never use row ground for type.

**v3 shape-coded rows** — glyph-coded rows with a large type badge. Rejected as off-style: the badge's weight contradicted the small-icon-plus-name convention and the near-monochrome surface.

## Consequences

The v4 rules are now the shipped visual language; the ledger's data mechanisms (virtualization, selection, search) are unchanged beneath them. Known observation (not introduced here): React warns about duplicate `step-row%000%00Step%201%001` keys when a null-turn section repeats a `Step 1` group; the key suffix scheme in `decorateLedgerRows` predates this change and needs its own fix.
