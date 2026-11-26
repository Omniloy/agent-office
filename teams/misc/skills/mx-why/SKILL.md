---
name: mx-why
description: "Miscelaneous floor: why does X work this way: design rationale, regressions, postmortems, with citations. Read it by path."
upstream: pstack/skills/why@9e278fe4
disable-model-invocation: true
---

# mx-why

## In our stack (read first; this section wins over the upstream text below)

- Shared-record seats: `team-board search`, `team-card` history, `gh`, the card's evidence folder, `memory/*.md`.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Why

Answer from the record, not the code: read the commits and PR discussions that introduced the target and each later change, and other sources if the trail is thin. Cite what the authors wrote, mark your own inferences as inferences, and say what the record does not answer.

---
Adapted from pstack why by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
