# Upstream pins for mstack

mstack (the skills of the Miscelaneous floor, `teams/misc/skills/mx-*`) is our version of
[pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (@poteto). This file records which
upstream text we read, so a later bump is a reviewable list and not a guess.

| Source | Pin | License |
|---|---|---|
| `cursor/plugins` repo | commit `41e400932eca14f289e7db717a70455256b6d388` (2026-11-24) | none at the top level: we take only from folders with their own LICENSE |
| `cursor/plugins/pstack` | version `0.15.48` (`plugin.json`), newest pstack commit `9e278fe4` (2026-11-24) | MIT, Copyright (c) 2026 Lauren Tan (`LICENSE` here, byte for byte) |
| `cursor/plugins/cursor-team-kit` | same repo commit | MIT, Copyright (c) 2026 Cursor (`LICENSE-cursor-team-kit` here, byte for byte) |
| `poteto/verification-skill-example` | read for its shape only | no license: nothing copied |

The local clone used to build mstack was a shallow clone at `41e40093`; the pstack commit id `9e278fe4` comes from
the GitHub history of the `pstack/` folder at that date.

## What is vendored (copied as-is) and what is adapted

- **Vendored** (scripts, byte for byte, listed in `vendored.tsv` with their sha256): the statechart compiler
  (`mx-statechart/scripts/**`), `watch-pr` and its bootstrap (`mx-mode/scripts/watch-pr/**`, `bootstrap.ts`,
  `package.json`, `bun.lock`), `worktree-audit.sh` and `show-me-your-work/scripts/log.sh`. A `LICENSE-pstack` copy
  sits next to each vendored folder. `bin/mstack-vendor check` proves they still match upstream plus `patches/`.
- **Adapted** (prose): every `mx-*` SKILL.md carries `upstream: <path>@<pin>` in its front matter, an
  "In our stack" section that wins over the upstream text below it, her text with skill names mapped to ours, and a
  footer with the credit. Her rule text, quotes, verdict words and principle names stay word for word.
- **Ours** (`upstream: none`): `mx-verify-plan`, `mx-pbt`, `mx-bombadil`, `mx-gardener`, `mx-bot-maker` and the
  levers in `bin/` (`team-evidence`, `team-verify`, `team-lanes`, `team-routine`, the evidence gate in `team-board`).

## How to bump

1. Clone `cursor/plugins` at the new commit somewhere outside this repo.
2. `bin/mstack-vendor upstream-diff --upstream <clone> 41e40093 <newsha>` lists the upstream skills that changed
   and the `mx-*` skills to review (needs a full, not shallow, clone).
3. Review each listed skill by hand; update its text and its `upstream:` pin.
4. `bin/mstack-vendor sync --upstream <clone>` copies the vendored scripts again and applies `patches/*.patch`.
5. `bin/mstack-vendor check` must exit 0. Update the pins in this file.
