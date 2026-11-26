---
name: mx-gardener
description: "Miscelaneous floor: Álvaro's gardener round over new PRs and merges on the floor's repos: the smells lever, PR state from watch-pr, mx-comment-sicko on justification comments, a ledger, and a Rule card when a smell is seen twice. Use on the garden nudge (daily 18:00 and after merges)."
upstream: none
---

# mx-gardener

Her post: every team needs a gardener, someone who watches what agents keep getting wrong and pulls each weed so it
cannot grow back. Here the round is deterministic: a CLI finds the smells, a ledger counts them, and a smell seen
twice becomes a rule. Owner: Álvaro.

The lever: `~/.omniloy-misc/.claude/skills/mx-gardener/scripts/smells/smells.mjs` (Node, no dependencies; run
`node smells.mjs --help`). Below, `smells` means `node ~/.omniloy-misc/.claude/skills/mx-gardener/scripts/smells/smells.mjs`.

## The round

1. **What is new.** For each repo in team.json `projects[0].repos`: `gh pr list --repo R --state all --json number,headRefName,baseRefName,mergedAt,updatedAt --limit 30`,
   keep what changed since the newest ledger row for that repo (`tail` of `~/.omniloy-misc/garden/ledger.tsv`).
   PR state for open ones: `~/.omniloy-misc/.claude/skills/mx-mode/scripts/watch-pr/watch-pr --status-only` (see its `--help`).
2. **Smells.** In a `team-lanes` lane (or `work/<repo>` at main, read-only): `smells diff <base>..<head> --repo <checkout> --json --team ~/.omniloy-misc`.
   Exit 0 none, 1 findings, 2 usage.
3. **Comments.** Every `justification-comment` hit goes to the read-only subagent `mx-comment-sicko` with the file and
   line; its `MUST KILL` flags join the findings.
4. **Classify** each finding: `fix`, `dismiss` or `ask`. Security, auth, billing, data, migration and concurrency are
   always `ask`. Give each a Confidence `candidate`, `recurring` or `strong` (see
   [`references/bot-triage.md`](references/bot-triage.md)).
5. **Report on the card.** One comment per card with the findings table (`team-board comment KEY "..."`). For an
   open PR, the `fix` items go to Gonzalo with `team-card pass` or a note. **No GitHub comments**: PR comments stay
   inside Gonzalo's `review-pr` loop.
6. **Ledger.** `smells ledger add --file findings.json --team ~/.omniloy-misc` (columns `ts repo pr smell file_line class card`).
7. **Rule cards.** `smells ledger count --smell <id> --repo <R> --json --team ~/.omniloy-misc`; when `count` reaches 2
   (`ruleCard: true`), open `team-board create MSC Task "Rule: <smell> in <repo>" "<the two past cases, the proposed enforcer in the inverse trust pyramid order: architecture, types, lint or CI check, behaviour test, docs>" rule`.
   Inés sets the priority; Gonzalo closes it with **mx-correct**, showing the rule fails on a ledger case.
8. **Weekly page** (Mondays): smells over time, rules added, rules that fired, gate overrides
   (`board/gate-overrides.jsonl`), published on :4340 with `team-artifact`.

## Never

Merge, revert, push, comment on GitHub, or write as anyone but __OWNER__'s own notes on a card. The detectors and
their "what to do instead" messages are in [`references/smells.md`](references/smells.md).

---
Our own skill, in the spirit of pstack by Lauren Tan (her gardener post of 2026-08-20; triage mechanics from pstack's poteto-mode/references/bugbot-triage.md).
