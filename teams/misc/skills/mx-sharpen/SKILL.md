---
name: mx-sharpen
description: "Miscelaneous floor: makes a task deeper, not bigger, then rewrites the prompt. Inés, before writing a card. Read it by path."
upstream: pstack/skills/sharpen@9e278fe4
disable-model-invocation: true
---

# mx-sharpen

## In our stack (read first; this section wins over the upstream text below)

- The sharpened task becomes the card's claims: one falsifiable claim per line, in the user's words.

Tool words in the upstream text (Task, cloud agents, Slack, AskQuestion, `.cursor/`, model slugs) map as in `~/.omniloy-misc/.claude/skills/mx-mode/adapter.md`.

## Upstream text

I want a deeper version of this task, not a bigger one. Before rewriting it, do four things:

1. Say what a top professional in this field would do here that I'm not asking for.
2. Name the rawest material they would start from instead of what has already been digested for me.
3. Name the specific methods and tools they would use.
4. Say what, other than you or me, would show the result is right.

Then rewrite my prompt to ask for exactly that.

Have the rewritten prompt ask the agent to prototype any choice an experiment can settle and recommend an option based on what it observed. Leave product or preference choices that no experiment can settle for me to make.

---
Adapted from pstack sharpen by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
