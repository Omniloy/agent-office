#!/bin/bash
# T7: team-lanes on a scratch repo, in a temporary TEAM_DIR.   bash bin/tests/team-lanes.test.sh
set -u
BIN="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0; ok() { echo "ok   $1"; pass=$((pass+1)); }; no() { echo "FAIL $1"; fail=$((fail+1)); }
export TEAM_DIR="$T/team"; mkdir -p "$TEAM_DIR/evidence/MSC-7"; echo keep > "$TEAM_DIR/evidence/MSC-7/manifest.json"
echo '{"name":"t","verification":{"maxLanes":4,"laneCap":8,"diskAlarmGiB":1}}' > "$TEAM_DIR/team.json"
R="$T/src"; mkdir -p "$R"; git -C "$R" init -q -b main; echo 1 > "$R/a"; git -C "$R" add .; git -C "$R" -c user.name=t -c user.email=t@t commit -qm a
L="$BIN/team-lanes"
"$L" --help | grep -q "team-lanes create" && ok "help" || no "help"
"$L" create --repo Omniloy/x --base main --slug MSC-7 -n 2 --dry-run | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d["dryRun"] and len(d["lanes"])==2' && ok "dry-run lists 2 lanes" || no "dry-run"
[ ! -e "$TEAM_DIR/work/lanes/MSC-7-1" ] && ok "dry-run creates nothing" || no "dry-run created a lane"
OUT=$("$L" create --repo Omniloy/x --base main --slug MSC-7 -n 2 --source "$R" --json)
echo "$OUT" | python3 -c '
import json,sys; d=json.load(sys.stdin); l=d["lanes"]
assert d["ok"] and len(l)==2, d
assert l[0]["port"]!=l[1]["port"] and l[0]["profileDir"]!=l[1]["profileDir"]
assert all(41000<=x["port"]<43000 for x in l)' && ok "create N=2: JSON, distinct ports and profiles" || no "create N=2: $OUT"
[ "$(git -C "$TEAM_DIR/work/lanes/MSC-7-1" rev-parse HEAD)" = "$(git -C "$R" rev-parse main)" ] && ok "lane is at the base commit" || no "lane at base"
"$L" create --repo Omniloy/x --base main --slug MSC-8 -n 9 --source "$R" >/dev/null 2>&1; [ $? = 1 ] && ok "N=9 refused" || no "N=9 not refused"
"$L" create --repo Omniloy/x --base main --slug MSC-8 -n 5 --source "$R" >/dev/null 2>&1; [ $? = 1 ] && ok "N=5 refused without --force-n" || no "N=5 without --force-n"
"$L" create --repo Omniloy/x --base main --slug MSC-8 -n 7 --force-n --source "$R" >/dev/null 2>&1; [ $? = 1 ] && ok "2 alive + 7 refused by laneCap 8" || no "laneCap"
mkdir -p "$HOME/Omniloy"; TEAM_DIR="$HOME/Omniloy/.lanes-test-should-not-exist" "$L" create --repo Omniloy/x --base main --slug X -n 1 --dry-run >/dev/null 2>&1; [ $? = 1 ] && ok "a path under ~/Omniloy is refused" || no "~/Omniloy not refused"
[ ! -e "$HOME/Omniloy/.lanes-test-should-not-exist" ] && ok "nothing written under ~/Omniloy" || { no "wrote under ~/Omniloy"; rm -rf "$HOME/Omniloy/.lanes-test-should-not-exist"; }
mkdir -p "$TEAM_DIR/work/lanes/handmade"; "$L" remove --slug handmade >/dev/null 2>&1; [ $? = 1 ] && [ -d "$TEAM_DIR/work/lanes/handmade" ] && ok "remove refuses lanes it did not create" || no "remove handmade"
"$L" remove --slug MSC-7 >/dev/null; [ ! -e "$TEAM_DIR/work/lanes/MSC-7-1" ] && [ ! -e "$TEAM_DIR/work/lanes/MSC-7-2" ] && ok "remove deletes its lanes" || no "remove"
[ -f "$TEAM_DIR/evidence/MSC-7/manifest.json" ] && ok "evidence survives" || no "evidence gone"
[ -z "$(git -C "$TEAM_DIR/work/x" worktree list | sed 1d)" ] && ok "worktrees pruned" || no "worktrees left"
echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
