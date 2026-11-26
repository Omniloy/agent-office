#!/usr/bin/env python3
"""Tests for team-routine (T8) with a fake hc and fake probes; nothing touches the live machine.
Run: python3 bin/tests/team-routine.test.py"""
import os, sys, json, subprocess, tempfile, unittest, shutil
BIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class T8(unittest.TestCase):
    def setUp(self):
        self.T = T = tempfile.mkdtemp(prefix="tr-test-"); self.td = f"{T}/.omniloy-misc"; os.makedirs(self.td)
        json.dump({"name": "Miscelaneous Team", "lead": "ines"}, open(f"{self.td}/team.json", "w"))
        open(f"{T}/hc", "w").write(f"""#!/bin/sh
if [ "$1" = ls ]; then echo '{{"terminals":[{{"name":"lorena","state":"live","status":"'$(cat {T}/status)'"}},{{"name":"ines","state":"live","status":"idle"}}]}}'; exit 0; fi
if [ "$1" = send ]; then echo "$2|$3" >> {T}/sent.log; exit 0; fi
""" ); os.chmod(f"{T}/hc", 0o755); open(f"{T}/status", "w").write("idle")
        open(f"{T}/probe", "w").write(f"#!/bin/sh\n[ -f {T}/probe-fail ] && exit 9\ncat {T}/items.json\n"); os.chmod(f"{T}/probe", 0o755)
        self.items([])
        json.dump({"paused": []}, open(f"{T}/watch.json", "w"))
        self.env = {**os.environ, "HC_BIN": f"{T}/hc", "TEAM_ROUTINE_GLOB": f"{T}/.omniloy-*/routines.json", "TEAM_WATCH_CONFIG": f"{T}/watch.json", "TEAM_ROUTINE_NOW": "2026-11-25T10:00:00"}
        self.routines([{"id": "verify-due", "to": "lorena", "schedule": {"every": "30m", "between": ["08:00", "22:00"]}, "probe": [f"{T}/probe"],
                        "prompt": "Maintain: {items}", "dedupe": "verify-due:{item}:{date}"}])
    def tearDown(self): shutil.rmtree(self.T, ignore_errors=True)
    def items(self, xs): json.dump({"items": xs}, open(f"{self.T}/items.json", "w"))
    def routines(self, rs): json.dump({"routines": rs}, open(f"{self.td}/routines.json", "w"))
    def tr(self, *a, at=None):
        env = dict(self.env); env["TEAM_ROUTINE_NOW"] = at or env["TEAM_ROUTINE_NOW"]
        return subprocess.run([sys.executable, f"{BIN}/team-routine", *a], env=env, capture_output=True, text=True)
    def sent(self):
        try: return open(f"{self.T}/sent.log").read().splitlines()
        except FileNotFoundError: return []
    def test_help(self): self.assertEqual(self.tr("--help").returncode, 0)
    def test_empty_probe_no_send(self):
        r = self.tr("tick"); self.assertIn("no-work", r.stdout); self.assertEqual(self.sent(), [])
    def test_items_idle_one_send_then_dedupe(self):
        self.items([{"repo": "Omniloy/x"}])
        self.tr("tick"); self.assertEqual(len(self.sent()), 1); self.assertIn("lorena|[routine verify-due]", self.sent()[0]); self.assertIn("Omniloy/x", self.sent()[0])
        r = self.tr("tick", at="2026-11-25T10:40:00"); self.assertIn("no-work", r.stdout); self.assertEqual(len(self.sent()), 1)
    def test_busy_retries_then_gives_up(self):
        self.items([{"repo": "Omniloy/x"}]); open(f"{self.T}/status", "w").write("working")
        self.assertIn("busy", self.tr("tick").stdout); self.assertEqual(self.sent(), [])
        self.assertIn("busy", self.tr("tick", at="2026-11-25T10:05:00").stdout)
        self.assertIn("skipped-busy", self.tr("tick", at="2026-11-25T12:10:00").stdout); self.assertEqual(self.sent(), [])
        open(f"{self.T}/status", "w").write("idle")
        self.assertIn("sent", self.tr("tick", at="2026-11-25T12:45:00").stdout)
    def test_paused_team_skips(self):
        self.items([{"repo": "Omniloy/x"}]); json.dump({"paused": ["Miscelaneous Team"]}, open(f"{self.T}/watch.json", "w"))
        self.tr("tick"); self.assertEqual(self.sent(), [])
        self.assertIn("team-paused", self.tr("run", "verify-due").stdout)
    def test_two_failures_self_pause_and_tell_lead(self):
        open(f"{self.T}/probe-fail", "w").write("x")
        self.assertEqual(self.tr("tick").returncode, 2); self.assertEqual(self.sent(), [])
        self.tr("tick", at="2026-11-25T10:31:00")
        s = self.sent(); self.assertEqual(len(s), 1); self.assertTrue(s[0].startswith("ines|Routine verify-due paused itself"))
        os.remove(f"{self.T}/probe-fail"); self.items([{"repo": "y"}])
        self.assertIn("paused", self.tr("tick", at="2026-11-25T11:10:00").stdout); self.assertEqual(len(self.sent()), 1)
        self.tr("resume", "verify-due"); self.assertIn("sent", self.tr("tick", at="2026-11-25T11:50:00").stdout)
    def test_schedule_window_and_daily(self):
        self.items([{"repo": "x"}])
        self.assertNotIn("sent", self.tr("tick", at="2026-11-25T23:00:00").stdout)   # outside 08:00-22:00
        self.routines([{"id": "d", "to": "lorena", "schedule": {"daily": "07:30"}, "probe": [f"{self.T}/probe"], "prompt": "{items}"}])
        self.assertEqual(self.tr("tick", at="2026-11-25T07:00:00").stdout.strip(), "")
        self.assertIn("sent", self.tr("tick", at="2026-11-25T07:31:00").stdout)
        self.items([{"repo": "z"}]); self.assertEqual(self.tr("tick", at="2026-11-25T09:00:00").stdout.strip(), "")  # once a day
    def test_dry_run_changes_nothing(self):
        self.items([{"repo": "x"}]); self.tr("tick", "--dry-run")
        self.assertFalse(os.path.exists(f"{self.td}/routines/state.json")); self.assertFalse(os.path.exists(f"{self.td}/routines/log.jsonl")); self.assertEqual(self.sent(), [])
    def test_command_only_and_dry_run(self):
        self.routines([{"id": "evidence-retention", "to": None, "schedule": {"daily": "03:00"}, "run": ["true"]}])
        self.assertIn("would run", self.tr("tick", "--dry-run", at="2026-11-25T03:05:00").stdout)
        self.assertIn("ran exit 0", self.tr("tick", at="2026-11-25T03:05:00").stdout); self.assertEqual(self.sent(), [])
    def test_add_validates(self):
        e = f"{self.T}/e.json"; json.dump({"to": "lorena", "schedule": {"daily": "7:30"}}, open(e, "w"))
        r = subprocess.run([sys.executable, f"{BIN}/team-routine", "add", "x-y", "--file", e], env={**self.env, "TEAM_DIR": self.td}, capture_output=True, text=True)
        self.assertEqual(r.returncode, 1); self.assertIn("HH:MM", r.stderr); self.assertIn("probe", r.stderr)
        json.dump({"to": "lorena", "schedule": {"daily": "07:30"}, "probe": ["true"], "prompt": "{items}"}, open(e, "w"))
        r = subprocess.run([sys.executable, f"{BIN}/team-routine", "add", "x-y", "--file", e], env={**self.env, "TEAM_DIR": self.td}, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr); self.assertIn("x-y", self.tr("ls").stdout)

if __name__ == "__main__": unittest.main(verbosity=1)
