---
name: mx-deslop
description: "Miscelaneous floor: cleans code slop in the branch diff: extra comments, abnormal defensive checks, any casts, deep nesting. Gonzalo, before commit. Read it by path."
upstream: cursor-team-kit/skills/deslop@41e40093
disable-model-invocation: true
---

# mx-deslop

## In our stack (read first; this section wins over the upstream text below)

- mx-deslop cleans code, mx-unslop cleans prose, mx-no-comments sends comments to a reviewer that did not write them.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Remove AI code slop

Check the diff against main and remove AI-generated slop introduced in the branch.

### Focus Areas

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

### Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- Keep the final summary concise (1-3 sentences).

---
Adapted from cursor-team-kit deslop (MIT, Copyright (c) 2026 Cursor). See THIRD_PARTY_NOTICES.md in Omniloy/agent-office.
