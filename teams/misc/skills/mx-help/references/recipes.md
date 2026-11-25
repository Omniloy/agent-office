# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works.

## Understand

- `/mx-mode read <thread>. restate the underlying issue in your own words, in plain english.`
- `mx-in-your-own-words <long or messy ask>`
- `mx-sharpen <the prompt you're about to send>`
- `/mx-mode investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use mx-how to understand <subsystem>. then use mx-why to find out why it broke recently.`
- `mx-recall my work on <topic> from last week, then read <issue>.`
- `mx-teach me why you implemented it this way and not <other way>. what did you trade off?`
- `/mx-mode take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/mx-mode <symptom>. repro first, then fix and verify.`
- Bug in an app: `/mx-mode repro this with /verify-<app>. if it repros on main, fix it and show me a video as proof.`
- Bug with a cheap test: `/mx-mode repro <bug> first. if there's a cheap test path, mx-tdd it. then fix and rerun.`
- Feature: `/mx-mode add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/mx-mode move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/mx-mode <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/mx-mode prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/mx-mode we need <feature>. mx-architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/mx-mode write a tutorial for how i would use <new package> first. then mx-teach me why it beats the current one.`
- `ask mx-arena for a second opinion on this thread and our approach.`
- `/mx-mode turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/mx-mode plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `mx-interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the Dropped list too.
- `mx-create-formal-verification-skill prove <property> holds in <module>, even when <steps> interleave or retry.` After merges or refactors in that code: `mx-maintain-formal-verification-skill`.
- `mx-swarm check every package under <dir> against its check script. one worker per package. one report.`
- `/mx-mode open the pr. small ordered commits, evidence in the description.`
- `/mx-mode babysit this pr. get it green.` For status only: `/mx-mode check on pr <number>. anything outstanding?`
- `/mx-mode land the stack.`

## Away and back

- `/mx-mode im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. /loop until done. if you're truly stuck after a few hours, stop and write up why.`
- `mx-show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `mx-ketchup` catches you up on this chat since your last message and lists every call that waits on you.
- `/mx-mode full autopilot on this queue. each item is independent.`
- `/mx-mode autopilot these changes, but don't merge. i'll land them.`
- `mx-reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
- `mx-bro` restates the last reply in plain words.

---
Adapted from pstack poteto-help/references/recipes.md by Lauren Tan (MIT). See THIRD_PARTY_NOTICES.md and docs/mstack.md in Omniloy/agent-office.
