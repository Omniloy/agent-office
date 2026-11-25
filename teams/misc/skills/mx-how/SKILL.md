---
name: mx-how
description: "Miscelaneous floor: how does X work: code walkthroughs, placement and ownership questions. Read it by path."
upstream: pstack/skills/how@9e278fe4
disable-model-invocation: true
---

# mx-how

## In our stack (read first; this section wins over the upstream text below)

- Unchanged apart from the adapter. Fan-out readers are `Explore` helpers, effort low.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

### How

Explore the codebase to answer "how does X work?" questions.

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

### 1. Explain

Spawn one Task subagent with `subagent_type: generalPurpose` and `readonly: true` that explores and explains in one pass. Give it the user's question and this brief:

> You are writing an architectural explanation for a senior engineer. Explore the codebase and write an explanation that a senior engineer unfamiliar with this area could read and walk away with a solid mental model. They should understand the architecture well enough to start working in it confidently. You have read-only access to the codebase.

### 2. Present

Present the subagent's output. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

---
Adapted from pstack how by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
