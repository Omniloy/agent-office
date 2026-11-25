---
name: mx-architect
description: "Miscelaneous floor: sketches types, signatures and module structure before code and stays in the loop. Gonzalo, on changes that cross a boundary. Read it by path."
upstream: pstack/skills/architect@9e278fe4
disable-model-invocation: true
---

# mx-architect

## In our stack (read first; this section wins over the upstream text below)

- Trace, sketch two shapes, pick the one with one owner per state. The sketch is the plan note Inés's `APPROVED:` covers.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### Architect

Before writing code, trace every system the change touches, then sketch two different shapes for it (types, signatures, module boundaries) and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least. Redesign instead of patching if workarounds repeat.

For a large or contested design, run the **mx-arena** skill instead of sketching alone.

---
Adapted from pstack architect by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
