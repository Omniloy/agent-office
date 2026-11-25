# adapter.md: pstack words → our stack

Every mx- skill that spawns, asks, publishes or names a path follows this table. Where an upstream passage in a
skill says the left column, do the right column. When a Cursor-only step has no honest equivalent, the skill says
`Skipped in our stack: <step>. <reason>.` (her adapter's `Skipped in Claude Code: <step>. <reason>.` convention).

This table starts from pstack's own Claude Code adapter, `pstack/docs/harness/claude-code.md`
(https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md, MIT, Lauren Tan): `Task`→`Agent`,
`generalPurpose`→`general-purpose`, `readonly`→`Explore` plus "do not edit files" plus a `git status` check, `resume`→a
fresh agent with the prior report, and the transcripts path are hers. Rows marked **(ours)** differ from hers on
purpose, with the reason in the row.

| Upstream | Ours |
|---|---|
| `Task` tool | `Agent` tool |
| `subagent_type: generalPurpose` | `general-purpose`; the default helper is `mx-worker` |
| `poteto-agent` | (ours) `mx-worker` (`~/.omniloy-misc/.claude/agents/mx-worker.md`) |
| `readonly: true` | `subagent_type: "Explore"`, "do not edit files" in the brief, and the coordinator checks `git status` afterwards |
| `environment: "cloud"` | (ours; hers is `isolation: "worktree"`) `cwd: <path from team-lanes create>`, because the team folder the personas run from is not a git repo, so a worktree isolation fails there |
| `cloud_base_branch: <b>` | (ours; hers: tell the worker to check out `<b>`) `team-lanes create --base <b> --slug <KEY>-<role> --role <role>`, so the lane is made at `origin/<b>`; one slug per role (`-dev`, `-verify`, `-swarm`, `-arena`) |
| `run_in_background: true` | kept (hers: omit; Claude Code subagents run in the background by default) |
| `resume` | a fresh helper, with the prior report given as a file pointer |
| `AskQuestion` | (ours; hers is `AskUserQuestion`, because a persona session has no human at the keyboard) in a persona session: `team-ask request --from <you> "<question>" --options "A\|B"` (to the lead), or `--to __OWNER_ID__` for his decisions, one per decision, with a Run button for any command that is his. `AskUserQuestion` only in skills __OWNER__ runs himself |
| model slugs (`claude-opus-5-5-xhigh-fast`…) | `model: "opus"` plus an explicit effort per role (table below) |
| a Gemini (or other non-Claude) panel seat | (ours; hers omits `model` and runs on the session model) a Codex seat, so the panel keeps a second vendor: `codex exec -s read-only --skip-git-repo-check -C <dir> "<brief>" < /dev/null`, stdout captured with `team-evidence add` |
| `~/.cursor/rules/pstack-models.mdc`, `/setup-pstack` | (ours; hers is `~/.claude/rules/pstack-models.md`) PROTOCOL.md section "Runtimes and model roles" and the table below. Never `~/.claude/rules` (it would load into every floor) |
| `.cursor/skills/verify-<app>/` | `<repo>/.claude/skills/verify-<app>/`, registered with `team-verify add`, Read by the path `team-verify status` gives |
| `~/.cursor/projects/*/agent-transcripts/` | (hers, with our config dir) `~/.claude-personal/projects/<slug>/*.jsonl` (+ `subagents/`), this floor's sessions only |
| Cursor Automations / routines | a `team-routine` entry (only __OWNER__ adds one, with a Run button) |
| `/loop` | Claude Code `/loop` inside a session, only for same-session waits |
| Slack posts, `SendSlackMessage`, a source thread | a card comment by the coordinator (`team-board comment KEY "..."`) |
| a tracker adapter (Linear, GitHub Issues) | the local board `team-board` (prefix MSC); GitHub issues are read-only (`gh issue list/view`) |
| `origin pr …` | `gh` only |
| merge steps (`shipping`, `autopilot-*`) | stop: `team-card approval KEY --as <you> "<contiguous verified run, bottom-up> + evidence page"`; the card goes to Validation; __OWNER__ merges |
| tmux | Herdr (`hc run --bg --keep --no-parent --name misc-run-<key>-<n> --cwd <lane> -- env TEAM_DIR=$HOME/.omniloy-misc <cmd>`, `hc send`, `hc read`) or the Python PTY recipe in mx-control-cli |
| `/tmp/verify-this/<slug>/` | `~/.omniloy-misc/evidence/<KEY>/` (made by `team-evidence init`) |
| `/tmp/<resume note>` | `~/.omniloy-misc/handovers/<slug>-resume.md` |
| a PR opened ready for review | Gonzalo's fix PRs from a report open as **draft** and are marked ready (`gh pr ready`) after two passing self-checks; other PRs open ready |
| "the user" / "the operator" | __OWNER__ for decisions and merges; the lead (Inés) for scope, priority and `APPROVED:` |

## Model roles

| Role | Model | Effort |
|---|---|---|
| personas (coordinators) | `claude-opus-5-5` | session default |
| feature, refactoring, bug-fix workers | opus | high |
| perf-issue, hillclimb | opus | xhigh |
| swarm and every verification worker | opus | high |
| judgment and prose helpers | opus | medium |
| source readers (maintain), transcript readers (recall), routine probes that need a model | opus | low |
| arena candidates | opus high, opus xhigh, one Codex (`codex exec -s workspace-write -C <its lane>`) | |
| judges, the show-me-your-work reviewer, one adversary seat | Codex `exec -s read-only` | |
| cap | never above xhigh. Fable only when __OWNER__ names it | |

## Irreversible: always pause, one request to __OWNER__ each

Merge (even when the account allows `gh pr merge`), deploy, any change to a shared or production environment,
force-push to a shared branch, deleting a branch, a card, memory or evidence that is not yours to prune, customer
data, anything sent in __OWNER__'s name, adding a person, a routine or a launchd job, changing agent permissions,
`team-board --override` without his written word on the card, publishing anywhere but the local server on :4340.

## Fan-out lanes

- **Lane A**: an `mx-worker` (Agent or Workflow) with `cwd` = a lane from `team-lanes create`, which also gives the
  lane's port and browser profile. At most `verification.maxLanes` (4) lanes, hard cap 8.
- **Lane B**: `hc run --bg --keep --no-parent --name misc-run-<key>-<n> --cwd <lane> --label team.persona=<slug> -- env TEAM_DIR=$HOME/.omniloy-misc <CLI>`
  for long Bombadil explorations, big TLC models and perf samples. No tokens. Wait with `hc read` or Monitor, never
  with sleep.
- **Lane C**: `claudebox` (another Herdr machine), only when __OWNER__ wrote his go on the card.

Only the coordinator spawns (nesting is not relied on). Helpers get file pointers, never pasted context.
