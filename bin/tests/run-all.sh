#!/bin/bash
# Runs every mstack lever test (T1, T3 to T9). Nothing here touches the live boards, team folders or ~/.local/bin.
cd "$(dirname "$0")/../.." || exit 1
S=teams/misc/skills; rc=0
step() { echo "== $1"; shift; "$@" || { echo "FAILED: $*"; rc=1; }; }
step "T1 vendored scripts" bin/mstack-vendor check
step "T1 license byte for byte" cmp ports/pstack/LICENSE "$S/mx-statechart/LICENSE-pstack"
step "T1 every skill has upstream: and a footer" bash -c 'for f in '"$S"'/*/SKILL.md; do grep -q "^upstream:" "$f" && tail -3 "$f" | grep -qE "Adapted from|Our own skill" || { echo "missing in $f"; exit 1; }; done'
step "T3 log.sh neutralizes formulas" bash -c 'f=$(mktemp); '"$S"'/mx-show-me-your-work/scripts/log.sh "$f" p "=1+1" w e r && grep -q "'"'"'=1+1" "$f"'
step "T4 team-evidence" python3 bin/tests/team-evidence.test.py
step "T5 team-verify" python3 bin/tests/team-verify.test.py
step "T6 team-board gate" bash bin/tests/team-board-gate.test.sh
step "T7 team-lanes" bash bin/tests/team-lanes.test.sh
step "T8 team-routine" python3 bin/tests/team-routine.test.py
step "T9 smells" node --test "$S/mx-gardener/scripts/smells/smells.test.mjs"
step "verify-kit template" node --test "$S/mx-create-verification-skill/templates/verify-kit/control-app.test.mjs"
exit $rc
