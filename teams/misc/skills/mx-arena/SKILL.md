---
name: mx-arena
description: "Miscelaneous floor: N candidates attempt the same task, pick a base and graft the best of the rest. Design bakeoffs. Read it by path."
upstream: pstack/skills/arena@9e278fe4
disable-model-invocation: true
---

# mx-arena

## In our stack (read first; this section wins over the upstream text below)

- Candidates: opus high, opus xhigh, and one Codex candidate (`codex exec -s workspace-write -C <its own lane>`), each
  in its own `team-lanes` lane (`--slug <KEY>-arena --role arena`). Template: `~/.omniloy-misc/.claude/skills/mx-swarm/templates/arena.js`.
- Hidden rubric. Cross-judge: Codex read-only. When Codex is also a candidate, the judge is a fresh Codex read-only
  session that does not know which candidate is whose.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Arena

Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

### Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners from the `arena runners` line in `~/.cursor/rules/pstack-models.mdc`, by default `claude-fable-5-2-high`, `claude-opus-5-5-high-fast`, and `gemini-4-neon-xhigh`. An `auto` or `inherit-parent` entry is the parent model, so omit `model` and spawn `generalPurpose`. If the Task tool rejects a slug, use the nearest valid slug of the same family or drop the seat, keep at least two runners, and say so. Families go by prefix, and the longest match wins: `claude-fable-*`, `claude-*`, and `gemini-*`, after dropping a leading `cursor-`. Any other slug's family is its text before the first hyphen. Spawn more for multiple design directions, and repeat one model when the work is generation-bound, not judgment-sensitive. Pick each subagent's reasoning level per the Subagents section of the **mx-mode** skill.
4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.

### Phase B: Fan out

Spawn all N subagents in one message with `run_in_background: true`, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.

If a candidate produces no output, proceed with N-1 and note the dropout.

### Phase C: Cross-judge

After all Phase B candidates complete, spawn one readonly judge from the `arena cross-judge pool` line in `~/.cursor/rules/pstack-models.mdc`, by default `claude-opus-5-5-high-fast`, `gemini-4-neon-xhigh`. The judge is never from the parent's vendor, and Fable counts as Claude for that check, so use the first entry from another vendor. An `auto` or `inherit-parent` entry is the parent model. If you do not know the parent's model, use the first real slug and say that the vendor check did not run. If the Task tool rejects a slug, use the nearest valid slug of the same family, then the next such entry, or skip the judge, and say so. While you read in Phase D, the judge scores each candidate, by path label, on each rubric criterion and recommends a base.

### Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

### Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

### Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

### Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict or that Phase C skipped the judge, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.

---
Adapted from pstack arena by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
