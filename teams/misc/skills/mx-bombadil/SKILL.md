---
name: mx-bombadil
description: "Miscelaneous floor: V3 property-based UI exploration with Bombadil 0.8.0 (Antithesis) against a local or dev origin only: a spec from the Feature Map's journeys with the default properties plus the card's claims, shrunk counterexamples kept as --reproduce regressions in the kit. Use on V3 claims, 'it got stuck' reports, Electron apps and TUIs."
upstream: none
---

# mx-bombadil

Bombadil explores a web or terminal UI with random and systematic action sequences and checks temporal properties
on every state. Lauren Tan named it in her talk as a tool that caught UI bugs; this skill is ours, built from
Bombadil's own manual (MIT).

## Safety first

- **Only local or dev origins with throwaway data.** Bombadil clicks everything, including delete. The kit's
  `doctor` must say the origin is local or dev before any run; never production, never a shared environment.
- Traces embed screenshots: they stay in `~/.omniloy-misc/evidence/` and on :4340, never in a PR or a public place.
- Version pinned in `<kit>/bombadil/VERSION` (`0.8.0`); the binary is `~/.local/bin/bombadil` (`bombadil --version`).

## Steps

1. **Spec.** Start from `<kit>/bombadil/spec.ts` (made from the template in
   `mx-create-verification-skill/templates/verify-kit/bombadil/spec.ts.tmpl`). It re-exports the defaults
   (uncaught exceptions, unhandled rejections, console errors, HTTP 4xx/5xx) and adds one property per card claim,
   named after the claim. Patterns: [`references/spec-patterns.md`](references/spec-patterns.md).
2. **Launch** the app through the kit CLI in a lane (`control-<app> launch --checkout <lane> --json`), then doctor.
3. **Explore** through the lever:
   `team-evidence run KEY --kind treatment --claim N --tier V3 --cwd <lane> -- bombadil browser test <origin> --specification <kit>/bombadil/spec.ts --time-limit 5m --exit-on-violation --headless --output-path "$EVIDENCE_OUT/run.trace"`.
   Exit 0 means OK or the time limit was reached, 1 an error, 2 a property was violated. Runs longer than 30 minutes
   go to Lane B (`hc run --bg ...`), several seeds in parallel through `mx-swarm/templates/seed-fuzz.js`.
   Electron or a running Chrome: `bombadil browser test-external --remote-debugger http://127.0.0.1:<port> <origin>`.
   Terminal UIs: `bombadil terminal test --specification spec.ts --output-path "$EVIDENCE_OUT/t.trace" <command>`.
4. **Read the result** with `bombadil trace "$EVIDENCE_OUT/run.trace" --json` (and `--screenshots <dir>`); the
   evidence page shows the property and frames.
5. **Counterexample → regression.** Shrink it (`bombadil browser shrink --headless --trace <trace> <origin> --output-path <kit>/bombadil/regressions/<name>.trace`;
   shrinking is experimental, keep the original if it fails), and record the replay command
   `bombadil browser test --reproduce=<kit>/bombadil/regressions/<name>.trace <origin>` in the kit's
   `bombadil/regressions/README.md`. Every later V3 card replays every regression trace
   (`team-evidence check` requires it).
6. **Mutation.** Revert the fix in a scratch lane and show the property fails there (`--kind mutation --expect-fail`).

## Gotchas

- Pre-1.0 and fast-moving: check flags against `bombadil --help` of the pinned version.
- Nondeterminism (timers, network, randomness) breaks reproduction and shrinking: seed or stub them in the app's
  verify mode.
- Keep exploration on the origin (the default).

---
Our own skill, in the spirit of pstack by Lauren Tan.
