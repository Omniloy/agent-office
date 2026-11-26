#!/usr/bin/env python3
"""install.py into a scratch HOME: the Miscelaneous floor's scripts keep their executable bit, misc gets no jira
block, and a persona assigned to an absent runtime falls back. Run: python3 bin/tests/install-misc.test.py"""
import os, sys, json, tempfile, importlib.util, unittest, shutil, atexit
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
H = tempfile.mkdtemp(prefix="install-test-"); os.environ["HOME"] = H; atexit.register(shutil.rmtree, H, True)
spec = importlib.util.spec_from_file_location("install", f"{ROOT}/setup/install.py"); ins = importlib.util.module_from_spec(spec); spec.loader.exec_module(ins)
assert ins.HOME == H, "install.py must read HOME at import"
CFG = {"owner": {"name": "Owner", "id": "owner"}, "runtimes": ["claude"], "floors": ["misc"], "jira": {"site": "https://x.atlassian.net", "email": "a@b"},
       "assign": {"kenji": "codex"}}
class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = ins.Run(CFG, False); cls.r = r
        try: r.teams()
        except Exception as e: raise AssertionError(f"teams() failed: {e!r}")
    def test_scripts_stay_executable(self):
        d = f"{H}/.omniloy-misc/.claude/skills"
        for s in ("mx-statechart/scripts/statechart", "mx-show-me-your-work/scripts/log.sh", "mx-mode/scripts/watch-pr/watch-pr", "mx-mode/scripts/worktree-audit.sh"):
            self.assertTrue(os.access(f"{d}/{s}", os.X_OK), s)
        self.assertFalse(os.access(f"{d}/mx-help/SKILL.md", os.X_OK))
    def test_misc_has_no_jira_block(self):
        t = json.load(open(f"{H}/.omniloy-misc/team.json")); self.assertNotIn("jira", t); self.assertIn("localBoard", t)
    def test_absent_runtime_falls_back(self):
        for f in ("dev", "biz", "admin"):
            t = json.load(open(f"{H}/.omniloy-{'team' if f == 'dev' else f}/team.json"))
            for p in t["personas"]: self.assertIn(p["runtime"], ("claude", "claude-personal"), (f, p["herdrName"], p["runtime"]))
if __name__ == "__main__": unittest.main()
