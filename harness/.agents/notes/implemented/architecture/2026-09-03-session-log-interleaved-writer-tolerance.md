# Agent Note: Session log reads tolerate rows from a second writer's divergent cursor

Status: implemented

English | [中文](2026-09-03-session-log-interleaved-writer-tolerance.zh.md)

## Problem

Ten stored sessions in a shared storage root failed every open with `seq gap in committed region`. The JSONL backend enforces single-writer exclusion **in this process only** (`JsonlBackendTracker.claimWrite`); two backend processes pointed at the same `~/.dsh` sessions root — a packaged LX-DSH instance and a dev instance — each held the same session with its own in-memory cursor, and their appends interleaved on disk in three observed shapes:

1. A foreign cold-open's `session/end-seed` marker landed at the live writer's cursor; the live writer's next row re-covered that seq (`expected N, got N`).
2. A truncate executed by one process removed events another process had already passed (`expected N, got N+k`), characteristically removing exactly the interrupted turn's `turn/end` before the next turn's `step/start`.
3. A 200 ms-delayed live-event buffer drained after a foreign append, landing stale rows mid-stream (up to 27 interleaved rows in one log).

The pre-existing read contract treated every committed-region discontinuity as fatal — the earlier frame-cut salvage for these classes (see [the 2026-08-28 salvage note](2026-08-28-session-log-salvage.md)) was dropped from the tree when the upstream handle-seam refactor rewrote the package — so each collision made the session permanently unopenable.

## Decision

`SessionLogScanner` absorbs writer divergence at row granularity, deterministically, on every read:

- A row whose first seq re-covers already-scanned seqs is dropped as stale — except when the overlapped kept prefix is only `session/end-seed` markers (pure boundary metadata with no content): the markers are dropped and the incoming content row is accepted instead. That is the lossless merge for shape 1.
- A hole whose size exactly equals `interruptedTurnClosers` of the kept prefix — the signature of shape 2 — is bridged with those synthetic closers, but only when the hole's row opens a turn numbered later than the currently open one (the sole content that can legitimately follow a synthetic `turn/end`); otherwise the scan stops at a durable cut and serves the preserved prefix.
- An unparsable row is dropped; the next row's seq decides whether a hole follows.
- A stopped scan reports its hole through `issueError()`; the reader maps it to the write seam's existing repair (`tornTruncateTo` at the hole's frame start plus `recoveredTail`), so the first append truncates and rewrites the artifact durably. `readZstdPrefix` now scans with `scanZstdFramesSalvage`, so a structurally corrupt frame also becomes a cut instead of a whole-artifact refusal.

Row-level tolerance beats the earlier frame-cut approach for shape 1 and 3 because a cut discards whole batches — for the marker collision it would have thrown away 74 000 events to remove one redundant row. The cut remains the fallback for holes, because seq is event identity: a gap cannot be skipped without renumbering history.

The read logs a warning (`read tolerating N stale log row(s)`) naming the session whenever rows were absorbed, so a shared-root deployment is observable instead of healing silently.

## Alternatives considered

**Cross-process write locking.** A lock file or byte-range claim held by write handles would prevent the divergence instead of tolerating it. Deferred: the persistence seam documents in-process exclusion as its contract, and a crash-stale lock introduces a new unopenable failure mode that needs its own recovery story. The tolerance also heals logs already damaged before any lock shipped.

**Healing the artifact on read.** Rewriting the file at read time would clean the disk but makes a read-only handle a mutator, races concurrent readers, and re-appends potentially the whole tail for one redundant row. Reads normalize in memory; the write seam repairs on the next append.

**Bridging every exactly-fitting hole.** Without the later-turn condition, a mid-turn hole followed by same-turn content produces a synthetic `turn/end` that makes the rest of the log surface-invalid. The `turn/start`/`step/start` with a higher turn number is the discriminator observed in every real damaged file.

## Consequences

- Two processes sharing a storage root no longer brick sessions: marker collisions read losslessly, single-`turn/end` holes bridge whole, and other holes degrade to the pre-divergence prefix instead of a refusal.
- Absorbed divergence leaves the foreign bytes on disk; every read re-normalizes them deterministically until a write-open heals the artifact through the truncation seam.
- Unparsable rows no longer poison the rest of the log: a following row that continues the seq sequence is preserved.
- The plain (`compression: 'none'`) encoding gains the same semantics through `scanLog`; `tornTruncateTo` there is the last accepted row's end byte.
- Independent defect found and left open: `SessionStore.rewind` emits `session/truncate`, but **no listener exists in any package** — rewind never truncates the durable log, the write handle's cursor desynchronizes, and the buffered live route then fails `assertContiguous` on every drain until restart. Fixing it needs its own seam decision and is out of scope here.

## Verification

`packages/session/session-persistence-jsonl/tests/jsonl.spec.ts` rewrites the committed-region refusal tests to the salvage contract (absorbed row + preserved prefix + `issueError` instead of throw) and adds scanner-level cases for stale-row drop and marker rewind. `tests/zstd.spec.ts` adds backend-level cases: a foreign marker colliding with the live writer's row (lossless read, no repair, durable heal on next append), a one-event hole bridged by a synthetic `turn/end` (reusing the last real event's timestamp), and an unbridgeable hole salvaged to its prefix with the write-path truncation. All four spec files pass (198 tests); the session domain suites pass (1448 tests, two unrelated flaky projection-cache cases pass in isolation).
