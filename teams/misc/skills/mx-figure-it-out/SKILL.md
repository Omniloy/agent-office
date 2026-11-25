---
name: mx-figure-it-out
description: "Miscelaneous floor: designs an auditable playbook when no narrower one fits: a large migration, an ambitious multi-part change, or unattended work. Read it by path from mx-mode."
upstream: pstack/skills/figure-it-out@9e278fe4
disable-model-invocation: true
---

# mx-figure-it-out

## In our stack (read first; this section wins over the upstream text below)

- Her rule "build the verification harness before the work, with the baseline captured" is **mx-verify-plan**: it
  writes `evidence/<KEY>/claim.md` and runs the baseline on main through `team-evidence run --kind baseline`.
- The plan you design is not approved by a chat reply: the lead's single `APPROVED:` on the card covers it.
- Unattended runs need a checkable predicate written on the card, a wake through a `team-routine` entry or `/loop`,
  and **mx-show-me-your-work**.
- Fan-out uses `team-lanes` lanes (Lane A) or Herdr terminals (Lane B), never cloud VMs.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Figure it out

When the task matches no playbook, design one. The deliverable before any code is the workflow itself: a sequence of phases that scales rigor to the task, runs the scientific method, and leaves a decision trail a human can audit after stepping away.

### Start

Open a todolist whose first item is to read the Principles section of the **mx-mode** skill. Then add the phases below as todos.

### Phase A: Frame

Ground first, then commit. Don't start the run until you can state:

- The definition of done as a falsifiable predicate (the **prove-it-works** principle skill).
- Scope, quantified: rough units and effort, plus the blockers grounding surfaced.
- The rigor level, biased high. One-way doors and high blast radius get more. Reversible low-stakes steps get less. Rigor is gates and artifacts, not "try harder".

Present the framing and tradeoffs before committing to a long run. Reversible work proceeds (the **never-block-on-the-human** principle skill), but a multi-hour run earns one checkpoint.

### Phase B: Design the workflow

Decompose into atomic, independently-landable units. Sequence riskiest-unknown-first. Scaffold and verification come before features (the **foundational-thinking** principle skill).

- Build the verification harness before the work, with the baseline captured from the pre-change state, so the check reads as "old value vs new value".
- For one-way-door design decisions, run the **mx-architect** skill (it runs **mx-arena**). Skip it for mechanical work whose shape is already concrete. A second arena over a settled design is over-engineering (the **laziness-protocol** principle skill).
- Decide what fans out. Parallelize only across seams, and give each worker its own worktree or branch (the **separate-before-serializing-shared-state** principle skill). Don't over-fan. Pick each subagent's reasoning level for the job, per the Subagents section of the **mx-mode** skill.
- Write the designed phase list down. That list is what the human reviews.

Then execute the design. Add its steps to the todolist as concrete items between the Phase C and Phase D entries. Run each under the Phase C loop discipline, and weave the Phase D log through them, a row as each step lands, rather than saving the whole trail for the end.

### Phase C: Run the loop

Each unit is an experiment. State the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, revert it if it didn't. Apply the **sequence-verifiable-units** principle skill, verifying each unit before starting the next instead of batching checks at the end.

- Verify by inspecting the artifact, never a self-report. When something passes too easily, suspect the observation method before the system.
- Pair delegated work with a judge. If a worker games the gate, reset and harden the contract. If the gate itself is wrong, fix the gate in its own change rather than routing around it.
- A verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE. Inconclusive is not a pass. Don't hide a negative.

### Phase D: Keep the audit trail

Log the run via the **mx-show-me-your-work** skill. figure-it-out's work is usually ambitious enough to commit the trail so the reviewer can read it in the PR. The trail plus the diff is what lets the human come back and trust the work.

### Phase E: Verify and hand back

Check the whole against the Phase A predicate on the real product, not just the harness. Encode any recurring correction as a gate, a lint rule, a check, or a script (the **encode-lessons-in-structure** principle skill).

**Reply:** the playbook you designed, the rigor level and why, the decision-trail path, what's verified against the predicate, and what's still open.

---
Adapted from pstack figure-it-out by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
