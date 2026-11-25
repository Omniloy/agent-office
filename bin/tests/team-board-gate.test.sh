#!/bin/bash
# T6: the evidence gate in team-board. Runs in temporary TEAM_DIRs only (never the live boards).
#   bash bin/tests/team-board-gate.test.sh [path to the old team-board for the no-flag comparison]
set -u
BIN="$(cd "$(dirname "$0")/.." && pwd)"; OLD="${1:-$HOME/.local/bin/team-board}"
T="$(mktemp -d)"; trap 'kill $SRV 2>/dev/null; rm -rf "$T"' EXIT
pass=0; fail=0
ok() { echo "ok   $1"; pass=$((pass+1)); }
no() { echo "FAIL $1"; fail=$((fail+1)); }
expect() { local want="$1" got="$2" what="$3"; [ "$want" = "$got" ] && ok "$what" || no "$what (exit $got, want $want)"; }

# a fake artifacts server and a fake team-artifact, so rule 11 can pass
mkdir -p "$T/www/lorena/msc-1-evidence" "$T/fake"; echo ok > "$T/www/lorena/msc-1-evidence/index.html"
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$T/www" >/dev/null 2>&1 & SRV=$!
printf '#!/bin/sh\necho "http://127.0.0.1:%s/lorena/msc-1-evidence/"\n' "$PORT" > "$T/fake/team-artifact"; chmod +x "$T/fake/team-artifact"
printf '#!/bin/sh\nexit 0\n' > "$T/fake/team-names"; chmod +x "$T/fake/team-names"
export PATH="$T/fake:$BIN:$PATH" TEAM_ARTIFACTS_URL="http://127.0.0.1:$PORT" TEAM_EVIDENCE_BIN="$BIN/team-evidence" TEAM_VERIFY_BIN="$BIN/team-verify"
for i in $(seq 50); do curl -s "http://127.0.0.1:$PORT/" >/dev/null && break; sleep 0.1; done

# ---- MSC board with the flag on
export TEAM_DIR="$T/misc"; mkdir -p "$TEAM_DIR"
echo '{"name":"t","localBoard":{"prefix":"MSC","name":"t","evidenceGate":true},"verification":{"evidenceDir":"evidence","diskAlarmGiB":0,"kitAfterProbeCards":3},"projects":[{"id":"m","repos":["Omniloy/x"]}]}' > "$TEAM_DIR/team.json"
K=$(team-board create MSC Task "Count updates" "claims" "repo-x")
team-board move "$K" "In Progress" >/dev/null; expect 0 $? "an ungated move passes ($K In Progress)"
team-board move "$K" Done >/dev/null 2>"$T/err"; expect 3 $? "move $K Done is refused while there is no evidence"
grep -q "team-evidence init" "$T/err" && ok "the refusal says what to do" || no "the refusal says what to do: $(cat "$T/err")"
R="$T/repo"; mkdir -p "$R"; git -C "$R" init -q -b main; echo 1 > "$R/a"; git -C "$R" add .; git -C "$R" -c user.name=t -c user.email=t@t commit -qm a
printf '| id | claim | tier | features |\n|---|---|---|---|\n| 1 | count updates | V1 | board.md |\n' > "$T/claim.md"
team-evidence init "$K" --repo Omniloy/x --author gonzalo --claims "$T/claim.md" >/dev/null
team-evidence run "$K" --kind baseline --claim 1 --tier V1 --cwd "$R" -- python3 -c 'print("{\"assertions\":{\"run\":1,\"failed\":1}}")' >/dev/null 2>&1
team-board move "$K" Done >/dev/null 2>&1; expect 3 $? "still refused with only a baseline"
team-evidence run "$K" --kind treatment --claim 1 --tier V1 --cwd "$R" -- python3 -c 'import os,json;open(os.environ["EVIDENCE_OUT"]+"/v.mp4","w").write("x");print(json.dumps({"assertions":{"run":2,"failed":0}}))' >/dev/null 2>&1
team-evidence verdict "$K" VERIFIED --by lorena --head "$(git -C "$R" rev-parse HEAD)" --no-label >/dev/null
team-evidence page "$K" --from lorena >/dev/null
team-board move "$K" Done >/dev/null 2>"$T/err"; expect 0 $? "move $K Done passes once the evidence is complete ($(head -c 200 "$T/err"))"
K2=$(team-board create MSC Bug "Other" "x")
team-board move "$K2" Rejected >/dev/null; expect 0 $? "Rejected is never gated"
K3=$(team-board create MSC Bug "Third" "x")
team-board move "$K3" Done --override "hotfix verified by hand on the call" >/dev/null; expect 0 $? "--override moves anyway"
team-board get "$K3" | grep -q "GATE OVERRIDE: hotfix" && ok "--override writes the comment" || no "--override writes the comment"
grep -q "\"$K3\"" "$TEAM_DIR/board/gate-overrides.jsonl" && ok "--override writes the jsonl line" || no "--override writes the jsonl line"
F=$(team-board create MSC Feature "A feature" "x" "repo-x")
team-board move "$F" "Ready for development" >/dev/null 2>"$T/err"; expect 3 $? "the kit rule refuses a Feature card without a healthy kit"
N=$(team-board create MSC Feature "No behaviour" "x" "repo-x,no-behavior")
team-board move "$N" "Ready for development" >/dev/null; expect 0 $? "a no-behavior Feature card is not blocked by the kit rule"

# ---- OlivIA board copy without the flag: same behaviour as the old team-board
if [ -f "$HOME/.omniloy-olivia/board/board.json" ] && [ -x "$OLD" ]; then
  for side in old new; do
    mkdir -p "$T/olb-$side/board"; cp "$HOME/.omniloy-olivia/team.json" "$T/olb-$side/"; cp "$HOME/.omniloy-olivia/board/board.json" "$T/olb-$side/board/"
  done
  seq_run() { local tb="$1" dir="$2"; export TEAM_DIR="$dir"
    K=$($tb create OLB Task "gate test card" "desc" "x")
    $tb move "$K" "In Progress"; $tb move "$K" Done; $tb move "$K" Nope; $tb label "$K" +y -x; $tb comment "$K" "a note"
    $tb get "$K" | grep -v -- '^--- 20'; $tb search 'status = Done AND type = Task' 100 | cut -f1-3; $tb board dev | head -40; $tb transitions "$K"
    for c in $(python3 -c "import json;print(' '.join(k for k,v in json.load(open('$dir/board/board.json'))['cards'].items() if v['status']!='Done')[:400])"); do $tb move "$c" Done 2>&1 | head -1; done
  }
  seq_run "$OLD" "$T/olb-old" > "$T/old.out" 2>&1; seq_run "$BIN/team-board" "$T/olb-new" > "$T/new.out" 2>&1
  norm() { python3 -c "import json,sys;d=json.load(open(sys.argv[1]))
for c in d['cards'].values():
  [c.pop(k,None) for k in ('updated','statusChanged','created')]
  [x.pop('at',None) for x in c['comments']]
print(json.dumps(d,sort_keys=True))" "$1"; }
  if diff -q "$T/old.out" "$T/new.out" >/dev/null && [ "$(norm "$T/olb-old/board/board.json")" = "$(norm "$T/olb-new/board/board.json")" ]; then ok "OlivIA copy, flag absent: same output and same board as the old team-board"
  else no "OlivIA copy, flag absent: differs"; diff "$T/old.out" "$T/new.out" | head -20; fi
else echo "skip OlivIA comparison (no ~/.omniloy-olivia board or no old team-board at $OLD)"; fi
# ---- two local boards on one machine (OlivIA and Miscelaneous): a cwd outside both works only with TEAM_DIR
FH="$T/home"; for n in olivia misc; do mkdir -p "$FH/.omniloy-$n"; P=$(echo "$n" | tr a-z A-Z | cut -c1-3); echo "{\"name\":\"$n\",\"localBoard\":{\"prefix\":\"$P\",\"name\":\"$n\"}}" > "$FH/.omniloy-$n/team.json"; done
(cd /tmp && env -u TEAM_DIR HOME="$FH" "$BIN/team-board" info >/dev/null 2>&1); [ $? != 0 ] && ok "two boards, no TEAM_DIR, cwd /tmp: refused (the case omniloy-team now prevents)" || no "two boards without TEAM_DIR were not refused"
(cd /tmp && HOME="$FH" TEAM_DIR="$FH/.omniloy-misc" "$BIN/team-board" info 2>&1 | grep -q MIS) && ok "two boards, TEAM_DIR set, cwd /tmp: the right board" || no "TEAM_DIR did not pick the board"
grep -q '"env",f"TEAM_DIR={TEAM}"' "$BIN/omniloy-team" && ok "omniloy-team exports TEAM_DIR to every person it starts" || no "omniloy-team does not set TEAM_DIR"
echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
