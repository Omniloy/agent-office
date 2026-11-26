#!/bin/bash
# T10b: the repo's team-office on a floor with a local board and no `jira` block (Miscelaneous), with a temp whose
# ticket is not on any board. Fake HOME and TEAM_DIR; fake team-board and team-jira; nothing live is touched.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; T="$(mktemp -d)"; trap 'kill $SRV 2>/dev/null; rm -rf "$T"' EXIT
pass=0; fail=0; ok() { echo "ok   $1"; pass=$((pass+1)); }; no() { echo "FAIL $1"; fail=$((fail+1)); }
export HOME="$T/home"; mkdir -p "$HOME/.omniloy-team" "$HOME/.local/bin" "$T/bin"
D="$HOME/.omniloy-misc"; mkdir -p "$D"
python3 - "$ROOT/teams/misc/team.json" "$D" <<'PY'
import json, sys
t = json.loads(open(sys.argv[1]).read().replace("__OWNER_ID__", "owner").replace("__OWNER__", "Owner")); t.pop("jira", None)
json.dump(t, open(f"{sys.argv[2]}/team.json", "w"))
p = t["personas"][1]
json.dump([{"slug": p["slug"] + "-temp2", "agentSlug": p["slug"], "herdrName": p["herdrName"] + "2", "name": "Temp 2 (temp)", "role": "temp", "label": None,
            "color": p.get("color", "#888"), "runtime": p["runtime"], "temp": True, "of": p["herdrName"], "ticket": "ABC-9", "task": "x", "hiredBy": t.get("lead"),
            "hiredAt": "2026-11-25T10:00:00", "state": "working"}], open(f"{sys.argv[2]}/temps.json", "w"))
json.dump({"MSC-1": {"owner": t["personas"][0]["herdrName"]}, "OTH-2": {"owner": t["personas"][0]["herdrName"]}}, open(f"{sys.argv[2]}/../.omniloy-team/cards.json", "w"))
PY
printf '#!/bin/sh\n[ "$1" = search ] && printf "MSC-1\\tIn Progress\\tTask\\t\\tCount updates\\n"; [ "$1" = get ] && echo "MSC-1 [In Progress] Count updates"; exit 0\n' > "$HOME/.local/bin/team-board"
printf '#!/bin/sh\n[ "$1" = search ] && printf "OTH-2\\tTo Do\\tTask\\t\\tElsewhere\\n"; exit 0\n' > "$HOME/.local/bin/team-jira"
chmod +x "$HOME/.local/bin/team-board" "$HOME/.local/bin/team-jira"
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
cp -R "$ROOT/offices/team-office" "$T/app"; rm -f "$T/app/.token"   # a copy: the server writes .token next to itself
(cd "$T/app" && PATH="$HOME/.local/bin:$PATH" TEAM_DIR="$D" PORT="$PORT" OFFICE_TOKEN=t0k node server.mjs > "$T/log" 2>&1) & SRV=$!
for i in $(seq 100); do curl -s "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 0.1; done
sleep 3
S=$(curl -s -H "x-office-token: t0k" "http://127.0.0.1:$PORT/api/state")
echo "$S" | python3 -c '
import json, sys; s = json.load(sys.stdin)
tm = [a for a in s["agents"] if a.get("temp")]; assert tm and tm[0]["tickets"][0]["key"] == "ABC-9" and tm[0]["tickets"][0]["url"] == "", tm
assert any(p.get("local") and p["key"] == "MSC" for p in s["projects"]), s["projects"]
held = [t for a in s["agents"] for t in a.get("tickets", []) if t["key"] == "MSC-1"]; assert held and held[0]["url"] == "", held
' 2>"$T/err" && ok "/api/state builds: temp with an off-board ticket, local MSC card, no jira block" || { no "/api/state: $(tail -3 "$T/err") $(tail -5 "$T/log")"; }
C=$(curl -s -H "x-office-token: t0k" "http://127.0.0.1:$PORT/api/card?key=MSC-1")
echo "$C" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("local") and d.get("url")=="", d' 2>/dev/null && ok "card detail of a local card: no Jira link" || no "card detail: $C"
grep -q "TypeError" "$T/log" && no "TypeError in the server log: $(grep -m1 TypeError "$T/log")" || ok "no TypeError in the log"
echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
