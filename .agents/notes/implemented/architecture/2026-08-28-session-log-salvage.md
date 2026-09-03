# Agent Note: Session log salvage-on-read turns a killed-mid-write log into a repaired one

Status: implemented

English | [中文](2026-08-28-session-log-salvage.zh.md)

## Problem

A session that was running when the desktop shell (or the machine) died could fail to open forever. The concatenated-Zstandard log format needed to recover the common case: a torn final frame is an uncommitted crash fragment whose own append never resolved, while every complete record before it is real emitted history.

## Decision

The read serves the committed prefix and repairs the tail through the write seam. `readZstdPrefix` decodes every structurally complete frame; a torn final frame is partially decoded (`decompressZstdPrefix`), and the complete JSONL records already flushed into it are recovered into the logical log as `recoveredTail`. The write handle's first mutation truncates the torn bytes (`truncateTornTail`) and durably rewrites the recovered records ahead of its own batch, so the artifact heals on the next append rather than on every read. The plain encoding treats an unterminated final line the same way (`committedBytes` as the truncation point). Frames after a cut are dropped even when they would decode: events keep their seq as identity, so re-accepting a suffix past a gap would either violate committed-region contiguity or require renumbering history.

The scanner's suffix decode takes a `seqBase` (the start frame's first seq from the frame index) so the contiguity check tracks the suffix rather than the whole log — without it, any suffix beginning mid-log threw or silently returned empty. `scanZstdFramesSalvage` (a salvage-mode twin of `scanZstdFrames` that stops at the first bad frame instead of throwing) lets the prefix read map structural corruption to the same truncation seam; `scanZstdFrames` itself still rejects for metadata-only readers, which must not silently widen what they accept.

A later refinement extends row-level tolerance to divergence from a second writer sharing the storage root — stale interleaved rows, foreign end-seed markers, and single-turn-end holes — covered in [the 2026-09-03 interleaved-writer tolerance note](2026-09-03-session-log-interleaved-writer-tolerance.md).

## Alternatives considered

**Keep refusing at read time and add an offline repair tool.** A `dsh repair <session>` command could run the same salvage with user consent and a backup copy. Rejected: the refusal itself is the defect — the events before the cut point are intact and the user's next action is always "open this session", not "run a tool"; making recovery ride the ordinary open removes the failure mode without inventing a second code path that must itself be discovered.

**Re-accept the decodable suffix after a gap.** Keeps more events when only one batch is damaged mid-log. Rejected: seq is the event identity; re-accepting a suffix past a gap breaks committed-region contiguity or forces renumbering history, and both alternatives are worse than losing the damaged batch.

## Consequences

- A killed-mid-turn session always opens: worst case it loses the events of the damaged tail and shows the turn as interrupted. No user-facing repair tool is needed.
- Reads never rewrite the artifact; repair is durable and one-shot through the write handle.
- Mid-log salvage never renumbers or reorders events.
- The plain (non-zstd) encoding shares the same semantics; zstd is the shipping default.

## Verification

`packages/session/session-persistence-jsonl/tests/zstd.spec.ts` covers recovery of complete records from a torn final frame, the durable rewrite on the next append, and its retry-on-failure; `tests/jsonl.spec.ts` covers the plain-encoding truncation and the scanner's `seqBase` suffix contiguity. The shared persistence contracts run for both encodings.
