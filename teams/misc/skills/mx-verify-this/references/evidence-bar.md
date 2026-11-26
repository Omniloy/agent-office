# The evidence bar

- Drive the real user path. Not internal setters, not test-only endpoints, not `eval` that triggers a handler.
- A video plus assertions for anything a user sees. A video alone does not judge; assertions alone do not show.
- Side effects count (DOM after reload, network calls, files, rows); pixels alone do not.
- A mock counts only behind a production boundary that already isolates the external system.
- A path the driver cannot reach gets its name, its blocker and the closest real path (`team-evidence skip`).
- A stale build is not evidence: `doctor` first, and again after any surprising drive.
- Evidence survives cleanup, at `~/.omniloy-misc/evidence/<KEY>/`.
- Inconclusive is not a pass. A gap is not a pass.
- Only the verifier's verdict counts; the author's runs are self-check.
- Run it again on main after the merge (`team-evidence rerun KEY --ref main`).
- Before publishing a page, look at the video frames for secrets (tokens, passwords, customer data).
