# The control CLI contract

Every repo kit's `control-<app>.mjs` follows this, so `team-evidence`, `team-verify doctor`, the gardener and a cold
reader can rely on it. The template `templates/verify-kit/control-app.mjs` implements all of it and its test file
proves it; a generated kit changes the `CONFIG` block and adds intent verbs, and keeps the rest.

- **One file**, Node, no dependencies beyond Playwright, which comes from the repo's own install or
  `~/node_modules/playwright`. Never added to the repo as a dependency for this.
- **Commands (minimum):** `doctor` (read-only: instance ours, port owner, local or dev origin, build freshness →
  `STALE BUILD`), `launch` / `cleanup` (kills only what it started, never by process name), `info`, `goto`,
  `snapshot` (ARIA), `screenshot`, `click`, `type` (`--secret-env VAR` for secrets), `press`, `wait-settle`,
  `assert visible|absent|text|attr|count`, `record start|stop` (webm, then ffmpeg mp4 `+faststart`),
  `trace start|stop`, `console`, `network-log`, `probe-selectors`, `eval` (reads state after the user path only),
  `manual <what>`, and `do <intent>` for the app's intent verbs.
- **Isolation:** port and browser profile come from a hash of the `--checkout` path (crc32, the same formula as
  `team-lanes`). Without `--checkout` (or `$VERIFY_CHECKOUT`) the CLI refuses (exit 2). Never the owner's own Chrome
  profile. Inputs matching `secretSelectors` are masked in screenshots and video.
- **Output:** `--json` prints one line `{ok, command, target, result, assertions: {run, failed}, evidence: [paths], warnings, ms}`.
  `team-evidence run` sums `assertions` from these lines. Evidence goes to `$EVIDENCE_OUT` or `--out`.
- **Exit codes:** 0 ok, 1 usage, 2 wrong target or instance, 3 assertion failed, 4 timeout, 5 `MANUAL:` (a path
  the driver cannot reach; reported, not faked).
- **Errors say what to do instead** ("run cleanup first", "rebuild before driving").
- **Tests:** at least one test per command, plus refusal tests (no checkout, double launch), plus "evidence survives
  cleanup". "Keep it well maintained and tested."
