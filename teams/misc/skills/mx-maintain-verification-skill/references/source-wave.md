# The source wave

One read-only helper per feature file. Through the Workflow template
`~/.omniloy-misc/.claude/skills/mx-swarm/templates/verify-sweep.js` (args: `{"kit": "<kit dir>", "repo": "<checkout at main>", "features": ["a.md", ...]}`)
or, for 5 files or fewer, one message of Agent calls with `subagent_type: "Explore"`, effort low.

Brief for each helper (the coordinator fills the brackets):

```
Read ~/.omniloy-misc/.claude/skills/mx-mode/worker.md before anything else.
Read-only: do not edit files, do not run the app.
Feature file: <kit>/references/features/<name>.md. Source checkout: <repo path> at <sha>.
Explain how this user-facing feature works from source. Return JSON:
{"feature": "<name>", "summary": "...", "entryPoints": ["path:symbol", ...],
 "drift": [{"claim": "<what the map says>", "source": "<path:line that contradicts it>"}] or [],
 "recipe": "<one live-verification recipe using control-<app> commands>"}
```

The coordinator merges overlapping recipes into as few app states as practical, spot-checks cited drift, and sweeps
recent churn (`git log --since=<lastMaintain> --name-only`) for user-facing surfaces no feature file's `sources:`
covers (a concrete source path is required before calling one missing).
