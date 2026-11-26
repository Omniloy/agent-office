#!/usr/bin/env python3
"""Tests for team-verify (T5), in a temporary TEAM_DIR with the repo's team-board and a fake team-card.
Run: python3 bin/tests/team-verify.test.py"""
import os, sys, json, subprocess, tempfile, unittest, shutil
BIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = tempfile.mkdtemp(prefix="tv-test-"); TEAM = f"{T}/team"; FAKE = f"{T}/fake"; os.makedirs(TEAM); os.makedirs(FAKE)
for n in ("team-card", "team-names"): open(f"{FAKE}/{n}", "w").write(f"#!/bin/sh\necho \"{n} $@\" >> \"{T}/calls.log\"\n"); os.chmod(f"{FAKE}/{n}", 0o755)
json.dump({"name": "t", "localBoard": {"prefix": "MSC", "name": "t"}, "projects": [{"id": "m", "repos": ["Omniloy/x"]}],
           "verification": {"registry": "verify/registry.json", "kitAfterProbeCards": 3, "maintainEvery": "24h"},
           "reports": {"budgetsMin": {"objectionWindow": 0}}}, open(f"{TEAM}/team.json", "w"))
ENV = {**os.environ, "TEAM_DIR": TEAM, "PATH": f"{FAKE}:{BIN}:{os.environ['PATH']}"}
def tv(*a): return subprocess.run([sys.executable, f"{BIN}/team-verify", *a], env=ENV, capture_output=True, text=True)
def tb(*a): return subprocess.run([sys.executable, f"{BIN}/team-board", *a], env=ENV, capture_output=True, text=True)
REPO = f"{T}/x"; os.makedirs(f"{REPO}/src/board"); os.makedirs(f"{REPO}/src/api")
def g(*a): return subprocess.run(["git", "-C", REPO, *a], capture_output=True, text=True, env={**ENV, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})
g("init", "-q", "-b", "main"); open(f"{REPO}/src/board/col.ts", "w").write("1"); open(f"{REPO}/README.md", "w").write("r"); g("add", "."); g("commit", "-qm", "a")
g("checkout", "-qb", "feat"); open(f"{REPO}/src/board/col.ts", "w").write("2"); open(f"{REPO}/src/api/cards.ts", "w").write("c"); open(f"{REPO}/docs.md", "w").write("d"); g("add", "."); g("commit", "-qm", "b")
KIT = f"{T}/kit"; os.makedirs(f"{KIT}/references/features")
open(f"{KIT}/SKILL.md", "w").write("---\nname: verify-x\ndescription: x\n---\n# verify-x\n")
open(f"{KIT}/control-x.mjs", "w").write("console.log('{}')\n")
open(f"{KIT}/control-x.test.mjs", "w").write("import {test} from 'node:test'; test('ok', () => {});\n")
open(f"{KIT}/references/features/README.md", "w").write("# map\n")
def feat(name, sources): open(f"{KIT}/references/features/{name}", "w").write(f"---\ncli: control-x\nsources: [{sources}]\nlast-verified: abc\n---\n# {name}\n## Sub-features\n## How to get to it (user POV)\n## Driving it with control-x\n## Gotchas\n")
feat("board.md", "src/board/**"); feat("cards.md", "src/api/cards.*")

class T5(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = tv("add", "Omniloy/x", "--kit", KIT, "--checkout", REPO); assert r.returncode == 0, r.stderr
    def test_help(self): self.assertEqual(tv("--help").returncode, 0)
    def test_add_validates(self):
        bad = f"{T}/badkit"; os.makedirs(bad, exist_ok=True); open(f"{bad}/SKILL.md", "w").write("---\nname: nope\n---\n")
        r = tv("add", "Omniloy/y", "--kit", bad); self.assertEqual(r.returncode, 1); self.assertIn("verify-<app>", r.stderr)
        self.assertTrue(os.path.islink(f"{TEAM}/.claude/skills/verify-x"))
    def test_features_for_maps_globs(self):
        r = tv("features-for", "Omniloy/x", "main..feat", "--json"); j = json.loads(r.stdout)
        self.assertEqual(sorted(j["features"]), ["board.md", "cards.md"]); self.assertEqual(j["unmapped"], ["docs.md"])
    def test_doctor_runs_the_kit_tests(self):
        r = tv("doctor", "Omniloy/x"); self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(json.load(open(f"{TEAM}/verify/registry.json"))["repos"]["Omniloy/x"]["health"], "ok")
        with open(f"{TEAM}/verify/registry.json") as f: d = json.load(f)
        d["repos"]["Omniloy/x"]["health"] = "failed"; json.dump(d, open(f"{TEAM}/verify/registry.json", "w"))  # back to unhealthy for the kit-rule tests
    def test_ready_check_and_probe_cards(self):
        f = tb("create", "MSC", "Feature", "First feature", "x", "repo-x").stdout.strip()
        r = tv("ready-check", f); self.assertEqual(r.returncode, 1); self.assertIn("healthy kit", r.stderr)
        keys = [tb("create", "MSC", "Bug", f"bug {i}", "x", "repo-x").stdout.strip() for i in range(4)]
        for k in keys[:3]:
            self.assertEqual(tv("ready-check", k).returncode, 0)
            r = tv("probe-used", "Omniloy/x", "--card", k); self.assertEqual(r.returncode, 0, r.stderr)
        reg = json.load(open(f"{TEAM}/verify/registry.json"))["repos"]["Omniloy/x"]
        self.assertEqual(reg["probeCards"], 3)
        kit_cards = [l for l in tb("search", 'summary ~ "Verification kit for"').stdout.splitlines() if l]
        self.assertEqual(len(kit_cards), 1, kit_cards)   # opened once, reused twice
        self.assertEqual(reg["kitCard"], kit_cards[0].split("\t")[0])
        r = tv("ready-check", keys[3]); self.assertEqual(r.returncode, 1); self.assertIn("probe-verified", r.stderr)
        tv("probe-used", "Omniloy/x", "--card", keys[0])   # the same card again does not count twice
        self.assertEqual(json.load(open(f"{TEAM}/verify/registry.json"))["repos"]["Omniloy/x"]["probeCards"], 3)
    def test_sync_and_due(self):
        self.assertEqual(json.loads(tv("due", "--json", "--no-fetch").stdout)["items"][0]["repo"], "Omniloy/x")  # never maintained
        sha = g("rev-parse", "main").stdout.strip()
        self.assertEqual(tv("sync", "Omniloy/x", "--sha", sha, "--outcome", "clean", "--no-board").returncode, 0)
        self.assertEqual(json.loads(tv("due", "--json", "--no-fetch").stdout)["items"], [])
    def test_reports_and_fixes_ready(self):
        k = tb("create", "MSC", "Bug", "Board stuck", "x", "report").stdout.strip()
        env_nogh = dict(ENV); open(f"{FAKE}/gh", "w").write("#!/bin/sh\necho '[]'\n"); os.chmod(f"{FAKE}/gh", 0o755)
        j = json.loads(tv("reports", "--json").stdout); self.assertIn(k, [i.get("key") for i in j["items"]])
        tb("label", k, "+triaged"); j = json.loads(tv("reports", "--json").stdout); self.assertNotIn(k, [i.get("key") for i in j["items"]])
        tb("comment", k, "CONFIRMED: stuck twice, video in evidence")
        self.assertIn(k, [i["key"] for i in json.loads(tv("fixes-ready", "--json").stdout)["items"]])
        tb("comment", k, "REJECT: not a bug")
        self.assertNotIn(k, [i["key"] for i in json.loads(tv("fixes-ready", "--json").stdout)["items"]])
    def test_status(self): self.assertIn("Omniloy/x", tv("status").stdout)

if __name__ == "__main__":
    try: unittest.main(verbosity=1)
    finally: shutil.rmtree(T, ignore_errors=True)
