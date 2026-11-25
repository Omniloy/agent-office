# TLA+ on this floor

- One jar: `tla2tools.jar` 1.7.4 at `~/.local/share/tla/tla2tools-1.7.4.jar`, sha256
  `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` (installed by `setup/verify-tools.sh`). The
  same jar serves `mx-statechart`. `JAVA=/usr/bin/java`.
- Parse: `java -cp "$TLA2TOOLS" tla2sany.SANY Spec.tla`.
- Check: `java -XX:+UseParallelGC -cp "$TLA2TOOLS" tlc2.TLC -workers auto -deadlock -config Spec.cfg Spec.tla`.
  Green looks like "Model checking completed. No error has been found. N states generated"; a break prints
  "Invariant X is violated" and the numbered behaviour.
- Or through mx-statechart, which runs TLC and draws the chart (exit 0 / 1 / 2).

## Writing a model

1. The protocol in prose first: actors, shared state, actions, and each invariant as an English sentence ("at most
   one holder per card", "every held card is eventually passed or done").
2. `Spec.tla`: VARIABLES, Init, one action per step, Next, `Spec == Init /\ [][Next]_vars /\ WF_vars(...)`. Every
   action names the function in the code it models (a comment with the file and symbol).
3. `Spec.cfg` with small constants (2 or 3 people, 2 cards).
4. SANY, then TLC, through `team-evidence run KEY --kind treatment --claim N --tier V4 -- <command>`.
5. **Mutation:** (a) Mutate the code: make a scratch change in the real code the action names (remove the guard,
   reorder the step) in a scratch copy of the lane. Rerun the generated verify skill, its conformance replay
   included, and record it with `team-evidence run KEY --kind mutation --claim N --tier V4 --expect-fail --cwd <scratch copy> -- <command>`.
   It must fail. Then drop the change and show the check is back where it started. (a) is the step that turns a
   sketch into evidence. (b) Optionally also mutate the model (delete the guard conjunct of the action) as a vacuity
   check; on its own it shows only that the invariant is not vacuous.
6. **Conformance:** see `conformance.md`.

"A green TLC run without the mutation and the conformance steps is a sketch, not evidence."
