# claim.md template

`team-evidence claims KEY --sync` parses this file into the manifest. Keep the table shape: one row per claim, the id a number, the tier one of
V0 to V5 (several joined with `+`), the feature files comma-separated.

```
# KEY: <card summary>

repo: OWNER/NAME
author: <herdrName of who writes the code>
new-feature: no            # or: yes, because <there is no old behaviour>

| id | claim (falsifiable, user words) | tier | features |
|---|---|---|---|
| 1 | after dropping a card in Done the column count updates without reload | V1 | board-columns.md |
| 2 | two people holding the same card is impossible | V4 | card-hold.md |

## Commands
- claim 1 baseline: node <kit>/control-office.mjs drop-card --card MSC-9 --to Done --json && node <kit>/control-office.mjs assert text '[data-col=Done] .count' 4 --json
- claim 1 treatment: same, on the PR head
- claim 2 treatment: TLA2TOOLS=... statechart CardHold.tla --out $EVIDENCE_OUT/statechart

## NOT VERIFIED when
- claim 1: the count stays at 3 until a reload, or any assertion fails
- claim 2: TLC finds a state with two holders, or the mutation run does not fail
```
