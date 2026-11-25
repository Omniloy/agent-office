---
name: mx-verify-plan
description: "Miscelaneous floor: before development starts on a behaviour card, write evidence/<KEY>/claim.md (falsifiable claims, a tier each, feature files, baseline and treatment commands, what counts as NOT VERIFIED) and run the baseline on main through team-evidence. Use at Discovery on every card that changes behaviour."
upstream: none
---

# mx-verify-plan

Owner: Lorena. Her figure-it-out rule, made into a step: "build the verification harness before the work, with the
baseline captured". This is not a plan to approve on its own: the lead's single `APPROVED:` on the card covers it
together with Gonzalo's plan note.

## Steps

1. Read the card (`team-board get KEY`). Its claims are Inés's, in the user's words, and its `verification:` line is
   the floor tier (`V1`, `V1+V4`…). You may raise a tier, never lower it. If nobody can state an invariant for logic
   the card claims, the card is unclear: comment why and ask Inés to move it back to Discovery.
2. `team-evidence init KEY --repo OWNER/NAME --author <who will write the code> [--new-feature]`
   (`--new-feature` when there is no old behaviour to baseline; say why in claim.md).
3. Find the feature files the change touches: `team-verify features-for OWNER/NAME main..<branch or main>` (before
   the branch exists, name them from the map by hand).
4. Write `~/.omniloy-misc/evidence/<KEY>/claim.md` from [`references/claim-template.md`](references/claim-template.md):
   one claim per line, each falsifiable, with its tier, its feature files, the exact baseline and treatment commands
   (kit CLI calls with `--json`), and what result means `NOT VERIFIED`. Then `team-evidence claims KEY --sync` must exit 0 (it writes the claims into the manifest; `team-evidence run`
   also syncs a changed claim.md and refuses one that does not parse).
5. Run the baseline on main for every claim:
   `team-evidence run KEY --kind baseline --claim N --tier <tier> --cwd <lane at main> -- <baseline command>`.
   For a bug the baseline is expected to show the bug: add `--expect-fail` when the command exits nonzero on it.
6. Comment on the card: the claim table and the baseline results, one line each. No names.

For a one-claim Bug or Task card the whole claim file is three lines.

## Choosing the tier

Pick the lowest tier that can catch the kind of bug the diff could introduce (the ladder is in PROTOCOL.md):
V0 always; V1 anything a user sees; V2 logic with an invariant or an inverse; V3 stateful UI flows and "it got
stuck"; V4 coordination and "sometimes"; V5 only when Inés wrote it. "When something passes too easily, suspect the
observation method before the system."

---
Our own skill, in the spirit of pstack by Lauren Tan.
