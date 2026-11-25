---
name: mx-pbt
description: "Miscelaneous floor: V2 property-based tests with fast-check (TS/JS) or Hypothesis (Python, in a venv) for logic with an invariant or an inverse (parsers, reducers, merges, money), with a required mutation run and every shrunk counterexample kept as a named example test. Use on V2 claims."
upstream: none
---

# mx-pbt

Lorena's run is the verdict. Gonzalo may add properties for his own logic as `self-check`.

## Steps

1. **State the property in words** on the claim line: an invariant (`count(cards) never changes on a move`), an
   inverse (`parse(print(x)) == x`), an oracle (`fast == slow reference`) or a metamorphic relation. If nobody can
   state one, the claim is unclear: back to Discovery.
2. **Write it next to the repo's tests**, testing behaviour through the public function (mx-principles
   `test-behavior-not-implementation`):
   - TS/JS: `fast-check` as a dev dependency only if the repo already accepts test deps; `fc.assert(fc.property(...), { seed, numRuns: 500 })`.
     For stateful code use `fc.commands` with a model that mirrors the real actions.
   - Python: `python3 -m venv .venv-verify && .venv-verify/bin/pip install hypothesis` in the lane, never the system Python.
3. **Run it** through the lever and print the seed:
   `team-evidence run KEY --kind treatment --claim N --tier V2 --cwd <lane> -- <test command>`.
4. **Mutation run (required before a green counts).** Break the code under test the smallest way that should violate
   the property (flip a comparison, drop a guard, off-by-one; see [`references/mutation.md`](references/mutation.md)) in
   a scratch copy of the lane, and run the same property:
   `team-evidence run KEY --kind mutation --claim N --tier V2 --expect-fail --cwd <mutant> -- <same command>`.
   If the mutant passes, the property is too weak: strengthen it and repeat. `team-evidence check` refuses V2 without
   a failed mutation run.
5. **Keep counterexamples.** Every shrunk counterexample becomes a named example test (`it("drops the last card when ... (seed 1234)")`)
   in the same PR, so it reruns forever without the seed.

## Gotchas

- A property that restates the implementation proves nothing. Prefer an inverse or an oracle.
- Flaky generators (time, randomness, network) make seeds meaningless: inject them.
- Keep `numRuns` high enough that a mutation fails reliably; record the number in claim.md.

---
Our own skill, in the spirit of pstack by Lauren Tan.
