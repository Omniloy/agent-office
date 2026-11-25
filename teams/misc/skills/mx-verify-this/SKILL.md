---
name: mx-verify-this
description: "Miscelaneous floor: the verdict on a card: runs the claim file's treatment commands on the PR head in a lane through the kit CLI on the real user path, checks side effects, compares with the baseline, records VERIFIED / NOT VERIFIED / INCONCLUSIVE and gates it with team-evidence check. Use when a card is passed to verification."
upstream: cursor-team-kit/skills/verify-this@41e40093
---

# mx-verify-this

## In our stack (read first; this section wins over the upstream text below)

Owner: Lorena. Never on code you wrote. Input: `evidence/<KEY>/claim.md` from **mx-verify-plan**, the PR(s), and
the repo's kit (`team-verify status`).

1. `team-lanes create --repo OWNER/NAME --base <PR head sha> --slug <KEY>-verify --role verify -n 1 --json`; `team-verify doctor <repo>`
   (a stale build is not evidence: doctor first).
2. For each claim, run its treatment command through the kit CLI:
   `team-evidence run KEY --kind treatment --claim N --tier <tier> --cwd <lane> -- node <kit>/control-<app>.mjs ... --json`
   with video and trace on. Drive the real user path; check side effects (DOM, network, files, a reload round trip),
   not pixels alone. "Mocks only where a production boundary already isolates the external system."
3. Tier steps: V2 a mutation run (`--kind mutation --expect-fail`), V3 Bombadil (**mx-bombadil**) plus replay of
   every regression trace, V4 mutation and conformance (**mx-create-formal-verification-skill**), V5 as that skill
   says. Long runs go to Lane B.
4. Every path you cannot reach: `team-evidence skip KEY --claim N --path "..." --blocked-by "..." --closest "..."`.
   "A gap does not count as a pass." "Inconclusive is not a pass."
5. `team-evidence verdict KEY VERIFIED|NOT_VERIFIED|INCONCLUSIVE --by lorena --head <PR head sha> [--pr URL=PASS|PASS+NOTES|FAIL ...] --note "..."`
   (`gh pr view <url> --json headRefOid`). VERIFIED is refused without a head, and the gate counts only treatment runs at that SHA or one with the same patch-id.
6. Check every video's frames for secrets before publishing, then `team-evidence page KEY --from lorena`,
   `team-evidence check KEY`, `team-board comment KEY "$(team-evidence comment KEY)"`, `team-evidence attach KEY`.
7. `VERIFIED` → `team-card approval KEY --as lorena "<PR links bottom-up> + evidence page"`. `NOT VERIFIED` → a
   linked Bug card with the failing run, passed to Gonzalo. `INCONCLUSIVE` → the reason and the next check on the card.
8. `team-lanes remove --slug KEY-verify` (only your lane; evidence survives).

The artifact layout below becomes `~/.omniloy-misc/evidence/<KEY>/` as `team-evidence` makes it. Also apply
mx-principles `prove-it-works`.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Verify This

Verification is not a recap. It proves or disproves a specific claim with repeatable evidence.

### When To Use

- The user asks "verify this", "prove it works", "did this fix it", or "show me the evidence".
- A bug fix needs a before/after repro.
- A UI, CLI, API, performance, or memory claim needs measurement.
- A test passes but the user-visible behavior still needs confirmation.

Do not use this for vague claims like "the code is cleaner". Ask for a measurable claim first.

### Workflow

1. Restate the claim in falsifiable form: condition, metric, and threshold.
2. Pick the smallest local surface that can disprove it.
3. Capture a baseline from the old state: merge base, parent commit, failing branch, or current broken repro.
4. Capture treatment from the changed state with the same command, data, warmup, and environment.
5. Compare raw artifacts: numbers, screenshots, terminal transcripts, HTTP responses, profiles, heap snapshots, or test output.
6. Return exactly one verdict: `VERIFIED`, `NOT VERIFIED`, or `INCONCLUSIVE`.

### Local Surfaces

- Code behavior: focused unit/integration tests or a minimal repro script.
- CLI/TUI behavior: `mx-control-cli`, terminal transcript, or demo recording.
- UI behavior: `mx-control-ui`, screenshots, accessibility snapshots, or browser traces.
- API behavior: local HTTP/RPC request and response diff.
- Performance: same-machine baseline/treatment timings or CPU profiles.
- Memory: heap snapshots before and after the suspected operation.

### Artifact Layout

When safe to write artifacts:

```text
/tmp/verify-this/<claim-slug>/
├── claim.md
├── timeline.md
├── baseline/
├── treatment/
├── diff/
└── verdict.md
```

If artifacts may contain sensitive code, prompts, screenshots, HTTP bodies, or heap data, keep only the minimal inline evidence unless the user agrees to disk storage.

### Verdict Rules

- `VERIFIED`: baseline and treatment differ in the predicted direction, by the claimed threshold, with no obvious confound.
- `NOT VERIFIED`: the behavior is unchanged, moves the wrong way, or misses the threshold.
- `INCONCLUSIVE`: no valid baseline, noisy signal, failed measurement, or an environment difference invalidates the comparison.

### Output

Use this shape:

```text
VERIFIED | NOT VERIFIED | INCONCLUSIVE
Claim: <falsifiable claim>

Evidence:
<metric/artifact>: baseline=<...>, treatment=<...>, delta=<...>, threshold=<...>

Reasoning:
<one tight paragraph naming the evidence and any confounds>
```

Do not soften a negative result. A clear `NOT VERIFIED` is useful.

---
Adapted from cursor-team-kit verify-this (MIT, Copyright (c) 2026 Cursor). See THIRD_PARTY_NOTICES.md in Omniloy/agent-office.
