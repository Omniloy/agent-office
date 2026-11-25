# Lanes

| Lane | What | When | How |
|---|---|---|---|
| A | an `mx-worker` (Agent call or Workflow agent) whose `cwd` is a worktree from `team-lanes` | model work in parallel: verification sweeps, adversaries, arena candidates, perf hypotheses | `team-lanes create --repo OWNER/NAME --base <ref> --slug <KEY> -n N --json` → pass each `path` as `cwd`, each `port`/`profileDir` in the brief |
| B | a Herdr terminal running a plain CLI, no model | long Bombadil explorations, big TLC models, perf samples, anything over 30 minutes | `hc run --bg --keep --no-parent --name misc-run-<key>-<n> --cwd <lane> --label team.persona=<your slug> -- team-evidence run KEY ... -- <cmd>`; wait with `hc read misc-run-<key>-<n>` or Monitor, never sleep; `hc kill` when done |
| C | `claudebox`, another Herdr machine | only when __OWNER__ wrote his go on the card | after Álvaro's inventory card; code and data leave the Mac |

Rules: at most `verification.maxLanes` (4) lanes at a time, hard cap 8 (`--force-n` above 4). `team-lanes` refuses
under 20 GiB free disk and any path under `~/Omniloy/`. Only the coordinator spawns. Clean up with
`team-lanes remove --slug KEY`; evidence survives.

Agent calls take the lane as `cwd`. Workflow `agent()` calls have no `cwd` option: the templates put the lane path in
the brief and the worker runs `cd <lane> && ...` or `team-evidence run --cwd <lane>`. Workflow agents (Lane A through a template) can only be started under __OWNER__'s standing opt-in in the persona
file, with one line on the card per run.
