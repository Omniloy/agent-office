---
name: mx-swarm
description: "Miscelaneous floor: fans out N parallel workers in team-lanes lanes (one per feature file, seed, perf sample or platform), drains them and returns one table. Use for 'swarm this', full sweeps, races and parallel coverage."
upstream: pstack/skills/swarm@9e278fe4
---

# mx-swarm

## In our stack (read first; this section wins over the upstream text below)

- **Lanes, not cloud agents.** `team-lanes create --repo OWNER/NAME --base <ref> --slug <KEY>-swarm --role swarm -n N --json` gives each
  worker its `path`, `port` and `profileDir`. N defaults to at most 4 (`verification.maxLanes`), never above 8.
  See `references/lanes.md` for Lanes A, B and C.
- **Spawn.** N ≤ 5: one message of Agent calls, `subagent_type: "mx-worker"`, `run_in_background: true`,
  `cwd: <lane path>`, `model: "opus"`, effort high (verification and swarm workers). N > 5, or a repeated pass: a
  Workflow script from `templates/` (`verify-sweep.js`, `perf-sample.js`, `seed-fuzz.js`, `adversaries.js`,
  `arena.js`), only under __OWNER__'s Workflow opt-in in your persona file, with one line on the card.
- **Each worker returns** the `mx-worker` JSON (`PASS` / `ISSUES` / `BLOCKED`, sha, method, findings, artifacts with
  its manifest path). A missing or malformed result is respawned once, then recorded as a gap
  (`team-evidence skip`).
- **One table** at the end, as a card comment by you. Then `team-lanes remove --slug <KEY>-swarm`; evidence survives.
- Long CLI runs (Bombadil explorations, big TLC models, perf over 30 minutes) go to Lane B (Herdr terminals), not to
  model workers.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Swarm

### Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

### Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Pick the worker model from the `swarm workers` line in `~/.cursor/rules/pstack-models.mdc`. If the rule or that line is missing, use `claude-opus-5-5-high-fast`. For `auto` or `inherit-parent`, omit `model` so the workers run on the parent model. If the Task tool rejects a slug, use the default and say so. If it rejects the default, use the closest valid slug of the same family from its error message. For a model race, name each arm's model up front. Pick each subagent's reasoning level for the job, per the Subagents section of the **mx-mode** skill.
4. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

### Phase B: Fan out

Spawn all N workers in one message with `subagent_type: generalPurpose`, `environment: "cloud"`, `run_in_background: true`, and the step 3 model, left unset for `auto` or `inherit-parent`. Use `environment: "local"` only when the worker needs access to something on the user's computer.

When a worker must start from a non-default pushed branch, pass `cloud_base_branch`.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

### Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

### Phase D: Report

Return one consolidated in-chat report with a result table, issue one-liners, gaps or dropouts, and the race rule when used.

---
Adapted from pstack swarm by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
