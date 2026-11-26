---
name: mx-correct
description: "Miscelaneous floor: turns a mistake that repeats (two cases make a class) into structure: architecture, types, a lint or CI check whose error names the fix, a behaviour test, docs last; each check shown failing on the real past case. Use on Rule cards from the gardener."
upstream: pstack/skills/correct@9e278fe4
---

# mx-correct

## In our stack (read first; this section wins over the upstream text below)

- Input: a `Rule: <smell>` Task card with two past cases from `~/.omniloy-misc/garden/ledger.tsv`.
- Gonzalo implements it in a `team-lanes` lane; the new check is **shown to fail on the real past case**
  (`team-evidence run KEY --kind mutation --expect-fail -- <check on the old commit>`) and to pass on the fix.
- The rule-to-enforcer table lives in the repo's `AGENTS.md` or `CLAUDE.md`. Lessons about the floor's process go to
  PROTOCOL through Inés, never to `~/.claude/rules`.
- Lorena uses it on her own repeated verification mistakes: they become `doctor` checks or refusals in the kit CLI.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Correct

The operator keeps correcting agents in this repo for the same mistakes. Change the repo so the next agent can't make them.

Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design the repo so a change that looks right from one file is right for the whole repo.

### Find the mistake classes

First, read recent commits, reverts, review comments, agent instruction files, and comments that explain workarounds. Group the mistakes into classes. A class counts once it has happened twice.

### Fix each class at the highest level that works

1. **Eliminate it with architecture.** Give each piece of state one owner and each task one supported way. Hide internals so the wrong import fails. Replace hand-synced lists with one source of truth. Delete old ways and dead code an agent would copy.
2. **Enforce it with types so the bad state can't be written.** If bad code still compiles, add a lint or CI check whose error names the file, type, or function to use instead. If the pattern is already common, fail only when a change adds more.
3. **Test the behavior.** Fix or delete any test that still passes when the behavior it checks breaks, or that fails when only the internals change.
4. **Write docs or agent rules last, only for judgment calls.** Nothing fails when an agent skips them.

### Fix and prove

Then fix the most frequent classes now, one commit each. Prove each new check fails on a real past mistake. Run the same command locally and in CI. Exceptions go on the offending line with a reason, an expiry date, and a human's approval.

### Keep the rule table

Last, keep a table in the agent instruction file that pairs each rule with what enforces it. When the operator corrects you, fix the mistake and add the rule. If the rule was already there and nothing enforces it, that's a repeat, so fix it at the highest level in the same change. Drop a rule once its mistake can't happen.

**Reply:** each class with its evidence, the level you picked, and why a higher level didn't work.

---
Adapted from pstack correct by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
