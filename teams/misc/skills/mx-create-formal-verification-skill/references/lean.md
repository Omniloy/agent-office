# Lean 4 (V5 only)

Only when Inés wrote V5 on the card. Only for small, pure, stable kernels (a permission evaluator, a scheduler, money
rounding, a merge function) written or mirrored in Lean. The proof covers the Lean model; a V2 differential test
(mx-pbt, the same cases against the real code) ties the two.

- Install on demand (watch the disk): `curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y --default-toolchain none`.
  No Mathlib unless the proof needs it (it adds about 5 GB).
- Evidence: `team-evidence run KEY --kind treatment --claim N --tier V5 -- lake build` exits 0;
  `team-evidence run KEY --kind treatment --claim N --tier V5 --expect-fail -- grep -RnE "sorry|admit|axiom" <lean dir>` (grep exits 1 when nothing is found);
  the theorem statement in plain English sent to __OWNER__ with one `team-ask request` and recorded with
  `team-evidence add KEY --run <rid> statement.md` plus the request id in claim.md. The dangerous failure is proving
  the wrong theorem, which is why he approves the statement.
