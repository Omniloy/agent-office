# Workflow templates

Each `.js` here is a Workflow script. Run it with the Workflow tool: `{scriptPath: "<this folder>/<name>.js", args: {...}}`.
Only under __OWNER__'s standing opt-in in your persona file, with one line on the card per run.

The Workflow `agent()` call has no `cwd` option, so every brief names its lane path and tells the worker to run each
command with `cd <lane> && ...` (or `--cwd <lane>` on `team-evidence run`). Make the lanes first with
`team-lanes create ... --json` and pass the paths in `args.lanes`. Never use `isolation: "worktree"` from a team
folder (it is not a git repo). Every worker returns the mx-worker JSON; the script returns one table for the card.
