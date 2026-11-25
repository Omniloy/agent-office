# Third-party notices

This repo contains material adapted from the projects below. Their notices are kept here in full, as their
licenses require. The credit for the ideas is in [docs/mstack.md](docs/mstack.md).

## pstack, by Lauren Tan

Source: https://github.com/cursor/plugins/tree/main/pstack (pstack 0.15.48). Byte-for-byte copy of its license:
[ports/pstack/LICENSE](ports/pstack/LICENSE).

Derived files in `teams/misc/`: mx-mode (with worker.md and the 22 playbooks), mx-help, mx-figure-it-out, mx-create-verification-skill, mx-maintain-verification-skill, mx-triage-issue-reports, mx-reproduce-and-fix-issues, mx-swarm, mx-interrogate, mx-show-me-your-work, mx-tdd, mx-create-formal-verification-skill, mx-maintain-formal-verification-skill, mx-statechart, mx-correct, mx-reflect, mx-architect, mx-arena, mx-blast-radius, mx-benchmark-checklist, mx-how, mx-why, mx-teach, mx-recall, mx-in-your-own-words, mx-sharpen, mx-reframe, mx-bro, mx-unslop, mx-technical-writing, mx-ketchup, mx-ketchup-video, mx-no-comments, mx-typescript-best-practices, mx-principles (her 24 principle-* skills), and the subagents mx-worker and mx-comment-sicko. Vendored as-is: mx-statechart/scripts/**, mx-mode/scripts/watch-pr/**, mx-mode/scripts/worktree-audit.sh, mx-show-me-your-work/scripts/log.sh (each folder carries LICENSE-pstack).

```
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## cursor-team-kit, by Cursor

Source: https://github.com/cursor/plugins/tree/main/cursor-team-kit. Byte-for-byte copy of its license:
[ports/pstack/LICENSE-cursor-team-kit](ports/pstack/LICENSE-cursor-team-kit).

Derived files in `teams/misc/skills/`: mx-control-ui, mx-control-cli, mx-verify-this (with pstack's shipping verifier and principle-prove-it-works), mx-deslop.

```
MIT License

Copyright (c) 2026 Cursor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Referenced, not copied

- https://github.com/poteto/verification-skill-example has no license. We follow its shape only (a feature map
  with four H2 sections per feature, a control CLI next to the skill). No text or code was copied;
  `teams/misc/skills/mx-create-verification-skill/templates/verify-kit/` is written from scratch.
- `cursor/plugins` has no top-level license, so nothing outside the `pstack/` and `cursor-team-kit/` folders is used
  (nothing from `third_party/`).

## Tools installed by the user, not vendored

Bombadil (MIT, Antithesis), the TLA+ tools `tla2tools.jar` (MIT), Playwright (Apache-2.0), fast-check (MIT),
Hypothesis (MPL-2.0) and Lean 4 (Apache-2.0) are downloaded by `setup/verify-tools.sh` or per repo; none is in this
repo. The statechart compiler's dependency `commander` (MIT) is installed on demand by its bootstrap, and
`pele@1.9.0` is fetched at render time.
