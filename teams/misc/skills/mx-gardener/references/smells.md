# The detectors

Generated from `scripts/smells/detectors/index.mjs` (the code is the source; regenerate this table when it changes).
Line detectors read the lines a diff adds; diff detectors read the files, the card manifest, the kit registry and the
gate overrides. A finding is a candidate for you to classify, never a verdict.

| id | severity | what to do instead |
|---|---|---|
| `suppression` | high | Look up the rule. If it protects correctness, fix the code instead and delete the suppression; keep it only for a faulty, pedantic or style-only rule, with the reason in the PR. |
| `escape-cast` | high | Parse the value at the boundary into a real type (mx-principles type-system-discipline) instead of casting it away. |
| `timer-workaround` | medium | A timer that waits for state to settle hides an ordering bug. Find who owns the state and order the update there (mx-principles fix-root-causes). |
| `justification-comment` | medium | Send it to mx-comment-sicko. A comment that defends code is a confession: make the behaviour obvious in code, or prove the external constraint and keep only that. |
| `defensive-noise` | low | A guard is a fix only when the state it handles is legitimate at this boundary. Trust internal types; validate once at the edge (mx-principles boundary-discipline). |
| `repeat-helper` | medium | A helper with this name already exists. Reuse or move the existing one instead of writing another copy. |
| `tier-mismatch` | high | This diff touches coordination code or code a formal check covers, and the card does not claim V4. Raise the card's verification: line, or explain on the card why V4 does not apply. |
| `map-drift` | medium | A UI file changed that no feature file's sources: covers. Add it to the right feature file (or a new one) so the map stays the verification source. |
| `no-behavior-abuse` | high | A card labeled no-behavior changed source files. Drop the label and verify it, or split the behaviour change into its own card. |
| `gate-override` | high | Every use of the board gate override is listed. Check the owner wrote it on the card, and turn the reason into a check if it repeats. |

What each looks for: suppressions (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `# noqa`, `# type: ignore`, `--no-verify`);
escape casts (`as any`, `as unknown as`, `: any`); timers near state (`setTimeout(..., 0)`, `requestAnimationFrame`, `requestIdleCallback`);
justification comments (workaround, hack, for now, temporary, do not remove, IMPORTANT); defensive noise (empty catch, three or more `?.` in a
row, `except: pass`); repeat helpers (a new function whose name is already defined in the repo); tier mismatch (coordination or
formally covered files without V4 on the card); map drift (a UI file no feature `sources:` covers); no-behavior abuse; gate overrides.
