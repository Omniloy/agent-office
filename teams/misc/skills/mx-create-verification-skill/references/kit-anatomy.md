# Kit anatomy

```
<repo>/.claude/skills/verify-<app>/
  SKILL.md                      from templates/verify-kit/SKILL.md.tmpl: Launch / Doctor / Drive / Evidence / Cleanup / Helpers
  control-<app>.mjs             the control CLI (required), from templates/verify-kit/control-app.mjs
  control-<app>.test.mjs        one test per command; `node --test` is the kit's V0 step
  multi-surface-journeys.md     journeys that cross surfaces (when there are any)
  references/features/
    README.md                   the index: feature, file, sources, last verified
    <feature>.md                3 to 6 to start; her four H2 sections + front matter (feature-map-shape.md)
  bombadil/
    spec.ts                     V3 properties (mx-bombadil), when the app has stateful UI
    VERSION                     0.8.0
    regressions/                shrunk counterexamples (.trace) + README.md with each --reproduce command
<repo>/.claude/skills/verify-<app>-formal/   optional, made by mx-create-formal-verification-skill
```

After `team-verify add`, the registry (`~/.omniloy-misc/verify/registry.json`) holds the absolute kit path, and
`~/.omniloy-misc/.claude/skills/verify-<app>` is a symlink to it, because people run from the team folder and do not
discover repo skills on their own. Read the kit by the registry path.

The kit is our own text in the product repo, delivered by PR: no pstack passages, no names, no credit lines.
