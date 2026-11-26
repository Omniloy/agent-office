# The cold-start test

A kit is for the next agent, read cold, mid-task. So after you prove it yourself, a fresh reader must be able to use
it with nothing else.

1. Spawn one `mx-worker` (Agent tool, `cwd` = a fresh `team-lanes` lane at the kit branch, effort high) with only:

   ```
   Read ~/.omniloy-misc/.claude/skills/mx-mode/worker.md before anything else.
   Read <lane>/.claude/skills/verify-<app>/SKILL.md and nothing else about this app.
   Drive the feature "<feature>" as its feature file says, through team-evidence run <KEY> --kind self-check --claim 1 --tier V1 --cwd <lane> -- <commands>,
   with video. Clean up. Return the worker JSON; PASS only if every step worked as written.
   ```

2. Any step the worker had to guess, skip or fix is a kit bug: fix the kit, then rerun with a new fresh worker.
3. Record the PASS run id in the kit card's comment. "A generated skill that was never executed is a draft, not a deliverable."
