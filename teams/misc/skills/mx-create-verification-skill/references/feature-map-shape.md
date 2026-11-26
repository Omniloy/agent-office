# Feature map shape

Her shape, kept exactly: a `README.md` index and one file per user-facing feature with four H2 sections, in this
order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-<app>`, `Gotchas`.

We add front matter so tools can use the map:

```
---
cli: control-<app>
sources: [src/board/**, src/api/cards.*]
last-verified: <sha>
---
```

- `sources` are globs relative to the repo root. `team-verify features-for <repo> <base>..<head>` maps a diff's
  files to feature files through them, and the gardener's `map-drift` smell fires when a UI file changes that no
  feature's `sources` covers.
- `last-verified` is the main SHA of the last live pass that drove this feature (mx-maintain-verification-skill
  updates it).
- If seed data lacks a precondition a journey needs, the journey reports a failure and the reason goes in `Gotchas`.
  Never weaken the journey to make it pass.

`references/feature-map-example/` holds her own example (MIT, names mapped) for the shape of the prose.
