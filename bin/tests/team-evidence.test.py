#!/usr/bin/env python3
"""Tests for team-evidence (T4). Scratch git repo, temporary TEAM_DIR, a fake artifacts server and a fake team-artifact.
Run: python3 bin/tests/team-evidence.test.py"""
import os, sys, json, subprocess, tempfile, unittest, threading, http.server, shutil
BIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); TE = f"{BIN}/team-evidence"
T = tempfile.mkdtemp(prefix="te-test-"); TEAM = f"{T}/team"; REPO = f"{T}/repo"; FAKEBIN = f"{T}/bin"
os.makedirs(TEAM); os.makedirs(FAKEBIN)
json.dump({"name": "t", "verification": {"evidenceDir": "evidence", "diskAlarmGiB": 0}}, open(f"{TEAM}/team.json", "w"))
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self): self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass
srv = http.server.HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
ART = f"http://127.0.0.1:{srv.server_port}"
open(f"{FAKEBIN}/team-artifact", "w").write(f"#!/bin/sh\necho 'published: {ART}/lorena/x-evidence/'\n"); os.chmod(f"{FAKEBIN}/team-artifact", 0o755)
open(f"{FAKEBIN}/team-board", "w").write("#!/bin/sh\necho \"board $@\" >> \"$TEAM_DIR/board-calls.log\"\n"); os.chmod(f"{FAKEBIN}/team-board", 0o755)
ENV = {**os.environ, "TEAM_DIR": TEAM, "TEAM_ARTIFACTS_URL": ART, "PATH": f"{FAKEBIN}:{os.environ['PATH']}", "TEAM_REQUESTS": f"{T}/requests.json",
       "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
def sh(*a, cwd=None): return subprocess.run(a, cwd=cwd or REPO, env=ENV, capture_output=True, text=True)
def te(*a, cwd=None): return subprocess.run([sys.executable, TE, *a], cwd=cwd or REPO, env=ENV, capture_output=True, text=True)
os.makedirs(REPO); sh("git", "init", "-q", "-b", "main"); open(f"{REPO}/a.txt", "w").write("1\n"); sh("git", "add", "."); sh("git", "commit", "-qm", "base")
sh("git", "checkout", "-qb", "feat"); open(f"{REPO}/a.txt", "w").write("2\n"); sh("git", "commit", "-qam", "change")
HEAD = sh("git", "rev-parse", "HEAD").stdout.strip()
GOOD = [sys.executable, "-c", "import os,json;open(os.environ['EVIDENCE_OUT']+'/v.mp4','w').write('x');print(json.dumps({'ok':True,'assertions':{'run':3,'failed':0}}))"]
NOVID = [sys.executable, "-c", "import json;print(json.dumps({'assertions':{'run':2,'failed':0}}))"]
VIDONLY = [sys.executable, "-c", "import os;open(os.environ['EVIDENCE_OUT']+'/v.mp4','w').write('x')"]
FAIL = [sys.executable, "-c", "import sys;sys.exit(1)"]
n = [0]
def card(tier="V1", new=False, author="gonzalo"):
    n[0] += 1; k = f"MSC-{n[0]}"; c = f"{T}/claim-{k}.md"
    open(c, "w").write(f"| id | claim | tier | features |\n|---|---|---|---|\n| 1 | the count updates | {tier} | board.md |\n")
    args = ["init", k, "--repo", "Omniloy/x", "--author", author, "--claims", c] + (["--new-feature", "no old behaviour"] if new else [])
    r = te(*args); assert r.returncode == 0, r.stderr; return k
def problems(k): r = te("check", k, "--json"); return r.returncode, json.loads(r.stdout)["problems"]
def rules(k): return sorted({p["rule"] for p in problems(k)[1]})
def complete_v1(k, base=True):
    if base: te("run", k, "--kind", "baseline", "--claim", "1", "--tier", "V1", "--", *NOVID)
    te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--", *GOOD)
    te("verdict", k, "VERIFIED", "--by", "lorena", "--head", HEAD, "--note", "ok")
    te("page", k, "--from", "lorena")

class T4(unittest.TestCase):
    def test_help(self):
        r = te("--help"); self.assertEqual(r.returncode, 0); self.assertIn("team-evidence run", r.stdout)
    def test_run_records_and_passes_exit_through(self):
        k = card()
        r = te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--", *GOOD); self.assertEqual(r.returncode, 0, r.stderr)
        r2 = te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--", sys.executable, "-c", "import sys;sys.exit(7)"); self.assertEqual(r2.returncode, 7)
        m = json.loads(te("show", k, "--json").stdout); run = m["runs"][0]
        self.assertEqual(run["sha"], HEAD); self.assertEqual(run["exit"], 0); self.assertEqual(run["assertions"], 3); self.assertTrue(run["patchId"])
        self.assertEqual(run["argv"], GOOD); self.assertEqual(os.path.realpath(run["cwd"]), os.path.realpath(REPO)); self.assertTrue(any(f.endswith("v.mp4") for f in run["files"]))
        self.assertEqual(m["runs"][1]["exit"], 7)
    def test_ref_mismatch_refused(self):
        k = card(); r = te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--ref", "main", "--", "true"); self.assertEqual(r.returncode, 1); self.assertIn("checkout", r.stderr)
    def test_complete_fixture_passes(self):
        k = card(); complete_v1(k); code, P = problems(k); self.assertEqual(code, 0, P)
        self.assertIn("VERIFIED: ", te("comment", k).stdout)
    def test_no_baseline_fails(self):
        k = card(); complete_v1(k, base=False); self.assertIn(3, rules(k))
    def test_new_feature_needs_no_baseline(self):
        k = card(new=True); complete_v1(k, base=False); self.assertEqual(problems(k)[0], 0)
    def test_video_without_assertions_fails(self):
        k = card(); te("run", k, "--kind", "baseline", "--claim", "1", "--tier", "V1", "--", *NOVID)
        te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--", *VIDONLY)
        te("verdict", k, "VERIFIED", "--by", "lorena", "--head", HEAD); te("page", k, "--from", "lorena")
        P = problems(k)[1]; self.assertTrue(any(p["rule"] == 4 and "assertion" in p["missing"] for p in P), P)
    def test_v2_without_mutation_fails_then_passes(self):
        k = card("V1+V2"); complete_v1(k); self.assertIn(5, rules(k))
        te("run", k, "--kind", "mutation", "--claim", "1", "--tier", "V2", "--expect-fail", "--", *FAIL); self.assertEqual(problems(k)[0], 0)
    def test_mutation_that_passed_does_not_count(self):
        k = card("V1+V2"); complete_v1(k); te("run", k, "--kind", "mutation", "--claim", "1", "--tier", "V2", "--expect-fail", "--", "true"); self.assertIn(5, rules(k))
    def test_v4_without_conformance_fails(self):
        k = card("V1+V4"); complete_v1(k); te("run", k, "--kind", "mutation", "--claim", "1", "--tier", "V4", "--expect-fail", "--", *FAIL)
        self.assertIn(7, rules(k)); te("run", k, "--kind", "conformance", "--claim", "1", "--tier", "V4", "--", "true"); self.assertEqual(problems(k)[0], 0)
    def test_verifier_is_author_fails(self):
        k = card(author="lorena"); complete_v1(k); self.assertIn(10, rules(k))
    def test_self_check_only_fails(self):
        k = card(); te("run", k, "--kind", "baseline", "--claim", "1", "--tier", "V1", "--", *NOVID)
        te("run", k, "--kind", "self-check", "--claim", "1", "--tier", "V1", "--", *GOOD)
        te("verdict", k, "VERIFIED", "--by", "lorena", "--head", HEAD); te("page", k, "--from", "lorena"); self.assertIn(2, rules(k))
    def test_no_page_fails(self):
        k = card(); te("run", k, "--kind", "baseline", "--claim", "1", "--tier", "V1", "--", *NOVID)
        te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--", *GOOD); te("verdict", k, "VERIFIED", "--by", "lorena", "--head", HEAD)
        self.assertEqual(rules(k), [11])
    def test_skip_only_is_inconclusive(self):
        k = card(new=True); te("skip", k, "--claim", "1", "--path", "native drop", "--blocked-by", "no OS driver", "--closest", "upload button")
        te("verdict", k, "VERIFIED", "--by", "lorena", "--head", HEAD); te("page", k, "--from", "lorena"); self.assertIn(9, rules(k))
    def test_rebase_same_patch_id_passes_changed_fails(self):
        global REPO
        old = REPO; REPO = f"{T}/repo-rebase"; sh("git", "clone", "-q", "-b", "feat", old, REPO, cwd=T); sh("git", "branch", "-q", "main", "origin/main")
        try: self._rebase()
        finally: REPO = old
    def _rebase(self):
        k = card(); complete_v1(k)
        # rebase onto a new main commit: same patch, new sha
        sh("git", "checkout", "-q", "main"); open(f"{REPO}/b.txt", "w").write("b\n"); sh("git", "add", "."); sh("git", "commit", "-qm", "other")
        sh("git", "checkout", "-q", "feat"); sh("git", "rebase", "-q", "main"); new = sh("git", "rev-parse", "HEAD").stdout.strip()
        self.assertNotEqual(new, HEAD)
        te("run", k, "--kind", "self-check", "--claim", "1", "--tier", "V0", "--", "true")  # records the new head's patch-id
        te("verdict", k, "VERIFIED", "--by", "lorena", "--head", new); self.assertEqual(problems(k)[0], 0, problems(k)[1])
        open(f"{REPO}/a.txt", "w").write("3\n"); sh("git", "commit", "-qam", "more"); new2 = sh("git", "rev-parse", "HEAD").stdout.strip()
        te("run", k, "--kind", "self-check", "--claim", "1", "--tier", "V0", "--", "true")
        te("verdict", k, "VERIFIED", "--by", "lorena", "--head", new2); self.assertIn(2, rules(k))
    def test_verified_needs_a_head(self):
        k = card(); te("run", k, "--kind", "baseline", "--claim", "1", "--tier", "V1", "--", *NOVID)
        te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--", *GOOD)
        r = te("verdict", k, "VERIFIED", "--by", "lorena", "--note", "ok"); self.assertEqual(r.returncode, 1); self.assertIn("--head", r.stderr)
        self.assertIn(2, rules(k))
    def test_treatment_at_another_sha_fails(self):
        k = card(); te("run", k, "--kind", "baseline", "--claim", "1", "--tier", "V1", "--", *NOVID)
        te("run", k, "--kind", "treatment", "--claim", "1", "--tier", "V1", "--", *GOOD)
        other = sh("git", "rev-parse", "main").stdout.strip(); self.assertNotEqual(other, HEAD)
        te("verdict", k, "VERIFIED", "--by", "lorena", "--head", other); te("page", k, "--from", "lorena"); self.assertIn(2, rules(k))
    def test_run_syncs_a_changed_claim_file(self):
        k = card(); open(f"{TEAM}/evidence/{k}/claim.md", "a").write("| 2 | the badge shows | V1 | board.md |\n")
        r = te("run", k, "--kind", "baseline", "--claim", "2", "--tier", "V1", "--", *NOVID); self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual([c["id"] for c in json.loads(te("show", k, "--json").stdout)["claims"]], [1, 2])
        self.assertFalse(any(p["rule"] == 1 for p in problems(k)[1]))
    def test_claims_validation(self):
        n[0] += 1; k = f"MSC-{n[0]}"; c = f"{T}/bad.md"; open(c, "w").write("| 1 | x | V9 | a.md |\n")
        te("init", k, "--repo", "Omniloy/x", "--author", "g"); shutil.copy(c, f"{TEAM}/evidence/{k}/claim.md")
        self.assertEqual(te("claims", k).returncode, 2)
    def test_attach_and_prune_dry_run(self):
        k = card(); complete_v1(k)
        self.assertIn("would attach", te("attach", k, "--dry-run").stdout)
        r = te("attach", k); self.assertEqual(r.returncode, 0, r.stderr); self.assertIn("attach", open(f"{TEAM}/board-calls.log").read())
        self.assertEqual(te("prune", "--older", "14d", "--dry-run").returncode, 0)
        self.assertEqual(te("df").returncode, 0)
    def test_rerun_dry_run(self):
        k = card(); complete_v1(k); r = te("rerun", k, "--ref", "main", "--cwd", REPO, "--dry-run"); self.assertEqual(r.returncode, 0, r.stderr); self.assertIn("main-recheck", r.stdout)

if __name__ == "__main__":
    try: unittest.main(verbosity=1)
    finally: shutil.rmtree(T, ignore_errors=True)
