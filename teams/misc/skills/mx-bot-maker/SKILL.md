---
name: mx-bot-maker
description: "Miscelaneous floor: proposes the smallest thing that takes over a repeated chore, in the order CLI lever > skill > routine > subagent > persona, as a proposal folder and a page with a Run button. It never applies anything: only the owner adds people or routines. Read it by path when a chore has been done by hand twice."
upstream: none
disable-model-invocation: true
---

# mx-bot-maker

**A reconstruction.** Her Dr Eggbot ships with pstack as a bot on Grok Bot and is not in any repo; her article says
it can make an engineer bot that runs `/create-verification-skill` and sets up a daily `/maintain-verification-skill`
routine. This skill rebuilds that described behaviour for our office, with one change on purpose: it **proposes**,
and __OWNER__ applies. Owner: Álvaro drafts, Inés files the request.

## Order of escalation (stop at the first that does the job)

1. **A CLI lever** (a `bin/` tool or a kit command) when the chore is deterministic.
2. **A skill** in `teams/misc/skills/` when it needs judgment but follows a recipe.
3. **A routine** (`team-routine` entry) when it must happen on a schedule or after an event.
4. **A subagent** in `~/.omniloy-misc/.claude/agents/` when a person keeps briefing the same helper.
5. **A persona**, last, when the work needs its own desk, memory and holder rights.

The default proposal for a new repo is a routine, not a person: run `mx-create-verification-skill` once (the kit
card) and `mx-maintain-verification-skill` daily (`verify-due`).

## Steps

1. Show the chore happened twice: card keys, ledger rows or transcript lines.
2. Pick the lowest rung that works and say why the rungs below fail.
3. Write `~/.omniloy-misc/proposals/<slug>/` from `templates/`:
   - always `proposal.md` (from `proposal.md.tmpl`);
   - a routine: `entry.json` (from `entry.json.tmpl`, checked with `team-routine add <id> --file entry.json --dry-run`);
   - a persona: `persona.md` (from `persona.md.tmpl`) and `persona.json` (the team.json persona object);
   - a launchd job: the plist.
4. Publish a proposal page on :4340 (`team-artifact new <slug>-proposal --from alvaro ...`, see the local-artifact
   skill) with the Run button for the one command __OWNER__ would run (`team-routine add <id> --file <path>` or
   `team-person add ...`).
5. Hand it to Inés; she sends one `team-ask request --to __OWNER_ID__` with the page and the Run button.

## Never

Apply a proposal, add a person, a routine, a launchd job or a permission, or install anything from `x.ai/bot/...`.

---
Our own skill, in the spirit of pstack by Lauren Tan (rebuilt from her description of Dr Eggbot).
