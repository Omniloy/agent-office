---
name: mx-interrogate
description: "Miscelaneous floor: adversaries try to break a change or a kit; only findings proven by a run survive. Use for risky cards (auth, data, concurrency, migrations), every new control CLI, 'challenge this', 'tear this apart'."
upstream: pstack/skills/interrogate@9e278fe4
---

# mx-interrogate

## In our stack (read first; this section wins over the upstream text below)

- Pool: Claude helpers (`mx-worker`, effort high) in `team-lanes` lanes plus **one Codex read-only seat**
  (`codex exec -s read-only -C <lane> "<brief>"`, stdout added with `team-evidence add`). The uncommitted change is
  copied into each lane (`git diff | git -C <lane> apply`).
- A finding survives only with the command, its output and the output the intent requires, run through
  `team-evidence run`. It reports, never fixes.
- Never spent on an abstract plan (her rule).

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Interrogate

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

### Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent with the **mx-in-your-own-words** skill, from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

### Fan out

Run Phase A steps 3 and 4 and Phase B of the **mx-arena** skill, with four changes. Read the `interrogate reviewers` line in place of `arena runners`. Copy the scope's uncommitted changes into each worktree. Spawn each adversary as `generalPurpose`. In place of the arena task and rationale, give each adversary the scope, the intent, and this brief:

> Break this change. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

### Verify

Verify each finding per arena Phase F by rerunning its command. Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Skip arena Phases C, D, and E. Adversaries find different failures, so the verdict keeps every verified finding, not one adversary's list.

### Output

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the adversaries that found it. Say "no verified findings" when none survive.
- **Dropped**: for each adversary, the count of dropped findings and why.

---
Adapted from pstack interrogate by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
