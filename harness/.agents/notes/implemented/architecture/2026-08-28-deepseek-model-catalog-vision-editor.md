# Agent Note: The DeepSeek model catalog editor declares vision and reads as cards

Status: implemented

English | [中文](2026-08-28-deepseek-model-catalog-vision-editor.zh.md)

## Problem

The direct DeepSeek adapter's schema lets every catalog model declare its request modalities (`inputModalities: ('text' | 'image')[]`, default `['text']`), but the settings editor exposed none of it: a model's vision support was invisible and uneditable through the UI, and the catalog rows themselves read as bare bordered boxes with permanently boxed inputs — functional, but visually noisier than every other settings card.

## Decision

Each row carries a vision chip — an eye-glyph pill with `aria-pressed` semantics — and the capacity panel carries the same declaration as a labeled `role="switch"`. Toggling on writes `inputModalities: ['text', 'image']` (merging beside any existing entries); toggling off removes `image` and clears the field entirely when only the text default remains, so an unmodified row stays a clean inherit instead of accumulating an explicit `['text']`. The field is a `Record<string, unknown>` draft member like `contextWindow`: hidden or future fields survive the edit because the editor replaces the array wholesale and only touches keys it owns.

The catalog reads as a ledger instead of a stack of boxes: ONE outlined container whose rows are separated by hairlines (no per-row border), the model id set in the mono face, borderless in-row fields that ring on hover/focus, and the capacity disclosure as a flush inset block. The editor card itself flattened: the formerly collapsed 自定义设置 drawer is gone — connection fields (key, base URL, protocol) and the model catalog are two zones of one card separated by a hairline, and the catalog is always visible. Rows enter with a short gsap slide-fade (staggered on first paint, single row on append), the disclosure slides open, the vision chip pops, the editor card rises when it opens, and the provider list staggers in on mount — every effect wrapped in `gsap.context()` (the ui-primitives Modal precedent) and gated by the shared `motionAllowed()` reading, so `prefers-reduced-motion` and the test lane see structure only. The editor bundles gsap privately (`dependencies`), the sanctioned route for a dynamic row whose animation library is not in the module table.

## Alternatives considered

**A free-text modalities field.** Exposing the raw array for direct editing would round-trip every field value with zero bespoke toggle logic, but modalities are a two-state fact in practice (does this model take images or not) — a free-text field invites typos the schema then rejects at save time, and says nothing about which of the two states is active at a glance. The chip/switch pair states the same fact with one click.

**Restyle without the vision chip.** The catalog restyle is orthogonal to the modality field; shipping only the ledger layout would have left the underlying gap (no UI path to declare vision) intact, which was the user-visible defect that started the change.

## Consequences

- Users declare vision per model from the settings UI on both editor families; the adapters' schema validation remains the single authority at save time.
- The two families write different fields with different semantics, so the chip is a shared component over family-owned toggles: DeepSeek rows write `inputModalities` (off clears the field — the adapter default is always text-only), while pi-ai rows write `input`, where an explicit list replaces the installed catalog's declaration — off writes a deterministic `['text']` instead of clearing, which would re-arm whatever the catalog records.
- Rows enter with a short gsap slide-fade (staggered on first paint, single row on append), the capacity disclosure slides open, and the vision chip pops on toggle — both editors own the same motion pattern, gated by the shared `motionAllowed()` reading.
- A row whose modality list holds unexpected values is left untouched by the toggle except for adding or removing `image` from the list; the schema still rejects anything invalid at apply.

## Verification

`components.client.spec.tsx` covers the toggle: the chip starts pressed exactly when the draft declares image input, toggling off clears the field to the adapter default, and toggling on merges `image` beside existing entries. The package's component, provider-form, and styles suites pass; `test:gui` covers the assembled lanes.
