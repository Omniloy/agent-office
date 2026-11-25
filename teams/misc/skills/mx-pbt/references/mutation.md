# Mutation runs

A check that cannot fail proves nothing. For each property, model or Bombadil spec, make one small wrong version of
the code and show the check fails on it.

| Kind of check | Smallest useful mutant |
|---|---|
| invariant over a reducer | drop one branch of the reducer, or return the old state |
| inverse (`parse(print(x))`) | drop escaping of one special character |
| oracle (fast vs reference) | off-by-one in a loop bound |
| guard on shared state | remove the guard (`if (holder) return`) |
| TLA+ invariant | delete the guard conjunct of the action that protects it |
| Bombadil property | reintroduce the bug the card fixed (revert the fix commit in a scratch lane) |

How to run it without touching the PR: copy the lane (`cp -c -R <lane> <lane>-mut` on APFS is a cheap clone), apply
the mutant there, and run the same command with `team-evidence run ... --kind mutation --expect-fail --cwd <lane>-mut`.
Delete the mutant folder afterwards; the run record and its output stay in the evidence folder.
