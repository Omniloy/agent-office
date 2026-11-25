# mstack: our version of pstack

> **mstack is our version of pstack by Lauren Tan (@poteto).** pstack is her skill set and way of working for
> rigorous agent engineering. The ideas are hers: verification is all you need, the per-repo verification skill and
> its Feature Map as materialized memory, "Build the Lever" (give agents CLIs, not markdown), the create and
> maintain verification pair, stop-the-line loops, routines that reproduce user reports, the gardener, and Dr Eggbot
> the bot-maker. We moved, renamed, rewrote and extended her skills to run on our stack: Claude Code and Codex in
> Herdr terminals, the Workflow tool for fan-out, our local board and team-card, and a local artifacts server. We
> added an evidence ladder with Bombadil, TLA+ and Lean, and an evidence gate on the board. Where her text is kept,
> it is hers. Where it changed, the mistakes are ours.
>
> - Watch her talk, "All Code Is Slop (Except Mine)" (AI Engineer): https://www.youtube.com/watch?v=O_zcc6Xl12g
> - Read her article, "The Complete Guide to pstack Pt. 1": https://x.com/poteto/article/2094457600259842065
> - Also by her: "Loops You Can Trust", https://x.com/poteto/status/2069824386283319343 ; the gardener post,
>   https://x.com/poteto/status/2090546476464451907
> - Source: https://github.com/cursor/plugins/tree/main/pstack (MIT, Copyright (c) 2026 Lauren Tan), read at
>   pstack 0.15.48, pstack commit 9e278fe4, repo commit 41e40093.
> - Companion skills from cursor-team-kit (MIT, Copyright (c) 2026 Cursor): control-ui, control-cli, verify-this,
>   deslop.
> - The shape of a verification kit follows https://github.com/poteto/verification-skill-example (referenced, not
>   copied: it has no license).

License notices: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Pins and how to bump: [ports/pstack/UPSTREAM.md](../ports/pstack/UPSTREAM.md).
What we checked against her primary sources: [ports/pstack/DISCREPANCIES.md](../ports/pstack/DISCREPANCIES.md).

The credit lives here, in `ports/pstack/`, in the Miscelaneous floor's PROTOCOL and in every skill footer. It never
goes into product repos, commits, PR bodies or cards: those read as the owner's own work.

## Where it runs

mstack is the skill set of the **Miscelaneous floor** (`teams/misc/`, port 4322, local board `MSC`): Inés (product
lead), Gonzalo (development), Lorena (verification) and Álvaro (infrastructure, and the gardener). The skills are
project skills of the team folder (`~/.omniloy-misc/.claude/skills/mx-*`), so other floors never see them.

## What we kept and what we changed on purpose

| pstack | mstack | Why |
|---|---|---|
| Cloud agents, one VM each | `team-lanes` worktrees passed as `cwd` to Workflow or Agent helpers; Herdr terminals for long CLI runs | agent `isolation: "worktree"` fails from a team folder (not a git repo); cloud VMs take code off the Mac |
| Cursor Automations and routines | `team-routine` plus launchd, nudging people with `hc send` | the office and the board are our control room |
| Slack as the control room | the MSC card, `team-card`, evidence pages on :4340 | cards are the record |
| Gemini or Grok cross-judge | Codex `exec -s read-only` | Codex is our other vendor |
| Model roles in `~/.cursor/rules` | PROTOCOL.md and `mx-mode/adapter.md` | `~/.claude/rules` would load into every floor |
| Screenshot or video as proof | the V0 to V5 ladder, a manifest, `team-evidence check`, the board gate | "show me" becomes something a reviewer reruns and a tool can refuse |
| Shipping and autopilot merge bottom-up | stop at `team-card approval` with the contiguous verified run; the owner merges | release = merge = the owner's |
| Benny on Slack | `mx-triage-issue-reports` + `mx-reproduce-and-fix-issues` on cards labeled `report` and read-only GitHub issues | same stages, our board |
| The gardener (a human role) | Álvaro plus the `smells` lever and a ledger | deterministic and auditable |
| Dr Eggbot on Grok Bot | `mx-bot-maker`: proposals plus a Run button; only the owner adds people or routines | hard-to-undo changes are the owner's |
| 24 principle skills | `mx-principles` with 24 references under her names | fewer skills; citing by name still works |
| `setup-pstack` | `setup/install.py` and setup/SETUP.md | one installer for the office |

Left out: `make-bot-ui`, `setup-pstack`, `setup-benny` (its config is the `reports` block in team.json),
`automate-me`, anything from `x.ai/bot/...`, Cursor custom modes and Bugbot settings.

## Skill map (pstack name → ours)

Names are `mx-` plus her name. Three named after her handle get a neutral name: `poteto-mode` → `mx-mode`,
`poteto-help` → `mx-help`, agent `poteto-agent` → `mx-worker`.

**Loaded with the Skill tool (22):** mx-mode, mx-create-verification-skill, mx-maintain-verification-skill,
mx-verify-plan (ours), mx-verify-this (team-kit), mx-triage-issue-reports (Benny), mx-reproduce-and-fix-issues
(Benny), mx-control-ui (team-kit), mx-control-cli (team-kit), mx-swarm, mx-interrogate, mx-show-me-your-work,
mx-pbt (ours), mx-bombadil (ours), mx-create-formal-verification-skill, mx-maintain-formal-verification-skill,
mx-statechart, mx-gardener (ours), mx-correct, mx-principles, mx-in-your-own-words, mx-unslop.

**Read by path through mx-mode (22, keep `disable-model-invocation`):** mx-help, mx-figure-it-out, mx-tdd,
mx-reflect, mx-bot-maker (ours), mx-architect, mx-arena, mx-blast-radius, mx-benchmark-checklist, mx-how, mx-why,
mx-teach, mx-recall, mx-sharpen, mx-reframe, mx-bro, mx-technical-writing, mx-ketchup, mx-ketchup-video,
mx-no-comments, mx-deslop (team-kit), mx-typescript-best-practices.

**Subagents:** mx-worker, mx-comment-sicko.

**Playbooks inside mx-mode:** investigation, bug-fix, feature, refactoring, prototype, visual-parity, perf-issue,
hillclimb, runtime-forensics, trace-forensics, eval, authoring-a-skill, babysit, shipping, autonomous-run,
autopilot-full, autopilot-stack, multi-phase-plan, session-pickup, pause-safely, worktree-cleanup, opening-a-pr.

## The evidence ladder

| Tier | Required when | Tool | Evidence |
|---|---|---|---|
| V0 | every card | the repo's tsc, lint, test commands | log, exit code |
| V1 | anything a user sees, every repro | the kit's control CLI on Playwright or CDP, video and trace on | `.mp4`, `trace.zip`, screenshots, ARIA snapshot, console and network log, assertion counts |
| V2 | logic with an invariant or an inverse | fast-check, Hypothesis | the property, seed, shrunk counterexample as a named test, a mutation run |
| V3 | stateful UI flows, "it got stuck", Electron, TUIs | Bombadil 0.8.0 | `.trace`, violated property, `--reproduce` command, a mutation run |
| V4 | coordination (two actors, retries, locks, handoffs) | TLA+ (TLC 1.7.4) + mx-statechart | `.tla`, `.cfg`, TLC output, mutation log, conformance log, chart |
| V5 | only when the lead writes V5 on the card | Lean 4 | `lake build` log, empty `sorry/admit/axiom` grep, the theorem statement approved by the owner |

A green TLC run without the mutation and the conformance steps is a sketch, not evidence. A video alone does not
judge: V1 needs assertions too.

## The levers (CLIs, not markdown)

| Lever | What it does |
|---|---|
| `team-evidence` | one evidence folder and manifest per card; `run` wraps every command and records argv, cwd, SHA, patch-id, exit code and files; `check` is the gate rule set; `comment`, `page`, `attach`, `rerun`, `prune`, `df` |
| `team-verify` | the registry of per-repo verification kits; `features-for`, `formal-for`, `ready-check` (the kit rule), and the probes the routines call (`due`, `reports`, `fixes-ready`) |
| `team-lanes` | the only way to make parallel checkouts: worktrees under the team folder with derived ports and profiles, capped, disk-checked |
| `team-routine` | routines with manners: a cheap probe before any nudge, idle check, dedupe, the watchdog's pause switch, self-pause after two failures |
| `team-board` (evidence gate) | with `localBoard.evidenceGate`, moves into Validation, Done and the like run `team-evidence check`; `--override` is the owner's and is logged |
| `smells` | the gardener's detectors over a diff, and the ledger that turns a smell seen twice into a Rule card |
| `mstack-vendor` | keeps the vendored pstack scripts identical to upstream plus our patches |
| the control CLI template | `mx-create-verification-skill/templates/verify-kit/control-app.mjs`: the contract every repo kit's CLI follows |
