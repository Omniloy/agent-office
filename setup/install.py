#!/usr/bin/env python3
"""Install or update the agent office on this Mac from this repo.

  python3 setup/install.py --config office.config.json            install / update
  python3 setup/install.py --config office.config.json --dry-run  say what would happen, change nothing
  python3 setup/install.py --check                                only check what is installed and working

It copies the apps, tools, Herdr panels, skills and role instructions to their places, filling in the owner's
name. It never overwrites a team folder that already exists (people, protocols, memory, requests): those are yours.
It does not install Herdr, Node, Claude Code, Codex or Tailscale, and it never starts agents: setup/SETUP.md
tells the installing agent how to do those with the user's go-ahead.
"""
import sys, os, json, re, shutil, subprocess, argparse, datetime, filecmp, glob

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.expanduser("~")
APPS = f"{HOME}/.omniloy-office"
BIN = f"{HOME}/.local/bin"
HERDR = f"{HOME}/.config/herdr-app"
LA = f"{HOME}/Library/LaunchAgents"
TEAMS = {"dev": f"{HOME}/.omniloy-team", "biz": f"{HOME}/.omniloy-biz", "admin": f"{HOME}/.omniloy-admin"}
RESERVED = {"lucia", "daniel", "marta", "kenji", "irene", "pablo", "elena", "zeus", "all", "team", "owner"}
STAMP = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

def which(cmd, extra=()):
    p = shutil.which(cmd)
    if p: return p
    for c in extra:
        for g in sorted(glob.glob(os.path.expanduser(c)), reverse=True):
            if os.path.exists(g): return g
    return ""
def node(): return which("node", ["/opt/homebrew/bin/node", "/usr/local/bin/node", "~/.nvm/versions/node/*/bin/node"])
def npm(): return which("npm", ["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "~/.nvm/versions/node/*/bin/npm"])
def tailscale(): return which("tailscale", ["/Applications/Tailscale.app/Contents/MacOS/Tailscale"])
def herdr_app(): return which("herdr-app", ["~/Applications/Herdr.app/Contents/MacOS/Herdr", "/Applications/Herdr.app/Contents/MacOS/Herdr"])
def herdr_core(): return which("hc", ["~/.local/share/herdr-core/current/Contents/MacOS/herdr-core"]) or which("herdr-core")

class Run:
    def __init__(self, cfg, dry):
        self.cfg, self.dry, self.done, self.warn = cfg, dry, [], []
        o = cfg["owner"]
        self.tokens = {"__OWNER_ID__": o["id"], "__OWNER__": o["name"], "__LANGUAGE__": cfg.get("language") or "English"}
    def say(self, s): self.done.append(s); print(("would: " if self.dry else "ok: ") + s)
    def render(self, text):
        for k, v in self.tokens.items(): text = text.replace(k, v)
        return text
    def carry_section(self, src, dst, head, what="the section on commands for the owner's terminal"):
        """One section of a protocol that is otherwise kept follows the repo: how to hand the owner a command must match
        what the apps and tools do now, or every agent keeps describing commands in prose. The previous file is kept as a .bak."""
        if not (os.path.exists(src) and os.path.exists(dst)): return
        def cut(t):
            i = t.find("\n" + head)
            if i < 0: return None
            j = t.find("\n## ", i + 1); return (i + 1, len(t) if j < 0 else j + 1)
        new = self.render(open(src, encoding="utf-8").read()); old = open(dst, encoding="utf-8").read()
        a, b = cut(new), cut(old)
        if not a: return
        sec = new[a[0]:a[1]].rstrip("\n") + "\n"
        out = old[:b[0]] + sec + ("\n" if b[1] < len(old) else "") + old[b[1]:] if b else old.rstrip("\n") + "\n\n" + sec
        if out == old: return
        if not self.dry:
            shutil.copy2(dst, f"{dst}.bak-{STAMP}"); open(dst, "w", encoding="utf-8").write(out)
        self.say(f"{dst}: {what} was brought up to date (the file as it was: {os.path.basename(dst)}.bak-{STAMP})")
    def put(self, src, dst, mode=None, keep_existing=False, backup=False):
        """Copy one file, filling in the placeholders when it is text. Returns True when dst changed."""
        raw = open(src, "rb").read()
        try: data = self.render(raw.decode("utf-8")).encode("utf-8")
        except UnicodeDecodeError: data = raw
        if os.path.exists(dst):
            if open(dst, "rb").read() == data: return False
            if keep_existing:
                if not self.dry: open(dst + ".new", "wb").write(data)
                self.warn.append(f"{dst} already exists and differs from the repo; yours was kept and the repo's version is next to it as {os.path.basename(dst)}.new")
                return False
            if backup and not self.dry: shutil.copy2(dst, f"{dst}.bak-{STAMP}")
        if not self.dry:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, "wb").write(data)
            if mode: os.chmod(dst, mode)
        return True
    def tree(self, src, dst, **kw):
        n = 0
        for root, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
            for f in files:
                if f in (".DS_Store",) or f.endswith(".log"): continue
                s = os.path.join(root, f); n += self.put(s, os.path.join(dst, os.path.relpath(s, src)), **kw)
        return n

    # ---- steps
    def apps(self):
        for name, src in (("team-office", "offices/team-office"), ("biz-office", "offices/biz-office"), ("artifacts", "services/artifacts")):
            n = self.tree(f"{REPO}/{src}", f"{APPS}/{name}")
            self.say(f"{name}: {n} file(s) written to {APPS}/{name}")
            if not os.path.isdir(f"{APPS}/{name}/node_modules"):
                if not npm(): self.warn.append(f"npm was not found: run `npm install --omit=dev` in {APPS}/{name} after installing Node"); continue
                if not self.dry:
                    r = subprocess.run([npm(), "install", "--omit=dev", "--no-audit", "--no-fund"], cwd=f"{APPS}/{name}", capture_output=True, text=True, env={**os.environ, "PATH": os.path.dirname(npm()) + ":" + os.environ.get("PATH", "")})
                    if r.returncode: self.warn.append(f"npm install failed in {APPS}/{name}: {r.stderr.strip()[-300:]}"); continue
                self.say(f"{name}: dependencies installed")
    def tools(self):
        n = self.tree(f"{REPO}/bin", BIN, mode=0o755, backup=True)
        self.say(f"tools: {n} file(s) written to {BIN}")
        for link, target in (("hc", herdr_core()), ("herdr-app", herdr_app())):
            dst = f"{BIN}/{link}"
            if target and not os.path.lexists(dst) and os.path.abspath(target) != dst:
                if not self.dry: os.symlink(target, dst)
                self.say(f"{link} linked to {target}")
        if BIN not in os.environ.get("PATH", "").split(":"): self.warn.append(f"{BIN} is not on PATH: add `export PATH=\"$HOME/.local/bin:$PATH\"` to ~/.zshrc (agents need the team-* tools)")
    def teams(self):
        c = self.cfg; have = c.get("runtimes") or ["claude"]
        for kind, d in TEAMS.items():
            src = f"{REPO}/teams/{kind}"
            if not self.dry: os.makedirs(f"{d}/memory", exist_ok=True)
            if not os.path.exists(f"{d}/team.json"):
                t = json.loads(self.render(open(f"{src}/team.json").read()))
                t["owner"] = c["owner"]
                if c.get("jira") and c["jira"].get("site"): t["jira"] = {"keychainService": "herdr-jira", **c["jira"]}
                if kind == "dev" and c.get("projects"): t["projects"] = c["projects"]
                if kind == "biz": t["gmailAccount"] = c.get("gmailAccount") or ""
                if kind == "biz" and c.get("mailRound"): t["mailRound"] = c["mailRound"]
                for p in t["personas"]:
                    want = (c.get("assign") or {}).get(p["herdrName"]) or ("claude" if "claude" in have else have[0])
                    p["runtime"] = want if want in have else have[0]
                if not self.dry: json.dump(t, open(f"{d}/team.json", "w"), indent=2, ensure_ascii=False)
                self.say(f"{d}/team.json created ({', '.join(p['herdrName'] + ':' + p['runtime'] for p in t['personas'])})")
            else: self.say(f"{d}/team.json exists: kept as it is")
            for f in ("PROTOCOL.md", "HANDBOOK.md"):
                if os.path.exists(f"{src}/{f}") and self.put(f"{src}/{f}", f"{d}/{f}", keep_existing=True): self.say(f"{d}/{f} written")
            self.carry_section(f"{src}/PROTOCOL.md", f"{d}/PROTOCOL.md", "## Names outside the office", "the rule that nothing outside the office names the team")
            self.carry_section(f"{src}/PROTOCOL.md", f"{d}/PROTOCOL.md", "## Commands for ")
            for p in json.load(open(f"{src}/team.json"))["personas"]:
                m = f"{d}/memory/{p['slug']}.md"
                if not os.path.exists(m) and not self.dry: open(m, "w").write(f"# {p['name']}: memory\n\nNotes that must survive between sessions. Newest first.\n")
        shared = TEAMS["dev"]
        for f, body in (("requests.json", {"next": 1, "items": []}),):
            if not os.path.exists(f"{shared}/{f}") and not self.dry: json.dump(body, open(f"{shared}/{f}", "w"))
        sig = f"{TEAMS['biz']}/signature.json"
        if not os.path.exists(sig):
            s = c.get("signature") or {}
            body = {"_about": "The owner's email signature as the business team writes it. In emails prepared from this app the links are joined by appSeparator; the signature the owner types uses ownSeparator, so app emails are recognisable at a glance.",
                    "name": s.get("name") or c["owner"].get("fullName") or c["owner"]["name"], "title": s.get("title") or "", "links": s.get("links") or [], "appSeparator": "  ", "ownSeparator": " | "}
            if not self.dry: json.dump(body, open(sig, "w"), indent=2, ensure_ascii=False)
            self.say(f"{sig} created (edit name, title and links)")
        ts = c.get("tailscale") or {}
        if ts.get("host") and ts.get("logins"):
            if not self.dry: json.dump({"host": ts["host"], "logins": ts["logins"]}, open(f"{shared}/remote.json", "w"), indent=2)
            self.say(f"{shared}/remote.json written: the phone door is open for {len(ts['logins'])} Tailscale login(s)")
    def people(self):
        n = 0
        for kind in TEAMS:
            for f in glob.glob(f"{REPO}/teams/{kind}/agents/*.md"): n += self.put(f, f"{HOME}/.claude/agents/{os.path.basename(f)}", backup=True)
        self.say(f"role instructions: {n} file(s) written to ~/.claude/agents (Codex people are sent the same text)")
    def skills(self):
        have = self.cfg.get("runtimes") or ["claude"]
        dests = [f"{HOME}/.claude/skills"] + ([f"{HOME}/.codex/skills", f"{HOME}/.agents/skills"] if "codex" in have else [])
        for d in dests:
            n = self.tree(f"{REPO}/skills", d, backup=True)
            self.say(f"skills: {n} file(s) written to {d}")
    def herdr(self):
        if not os.path.isdir(HERDR): self.warn.append("Herdr has not been opened yet on this Mac (no ~/.config/herdr-app): open it once, then run the installer again to add the panels"); return
        n = self.tree(f"{REPO}/herdr/mods", f"{HERDR}/mods", backup=True) + self.tree(f"{REPO}/herdr/layouts", f"{HERDR}/layouts", backup=True)
        self.say(f"Herdr panels and layout: {n} file(s) written")
    def services(self):
        nd = node()
        if not nd: self.warn.append("node was not found: the artifacts server and the offices cannot start until Node is installed"); return
        path = f"{os.path.dirname(nd)}:{BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"  # /usr/sbin: office-restart uses lsof
        def plist(label, args, cwd, log, keep):
            a = "".join(f"<string>{x}</string>" for x in args)
            return (f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n'
                    f'<key>Label</key><string>{label}</string>\n<key>ProgramArguments</key><array>{a}</array>\n<key>WorkingDirectory</key><string>{cwd}</string>\n'
                    f'<key>RunAtLoad</key><true/>{"<key>KeepAlive</key><true/>" if keep else ""}\n<key>StandardOutPath</key><string>{log}</string><key>StandardErrorPath</key><string>{log}</string>\n'
                    f'<key>EnvironmentVariables</key><dict><key>PATH</key><string>{path}</string></dict>\n</dict></plist>\n')
        jobs = [("com.omniloy.artifacts", [nd, f"{APPS}/artifacts/server.mjs"], f"{APPS}/artifacts", f"{TEAMS['dev']}/artifacts/.server.log", True),
                # after a reboot: floors, watchdog, and the people who were running, each back in their own conversation
                ("com.omniloy.office-up", ["/usr/bin/python3", f"{BIN}/office-up", "--wait", "600"], HOME, f"{TEAMS['dev']}/logs/office-up.log", False),
                # the watchdog: catches people stopped while it is their move (the lightning bolt). Started at login and again
                # by launchd if it dies; a second copy (office-up, office-restart) only stands by, so it never runs twice
                ("com.omniloy.watchdog", ["/usr/bin/python3", f"{BIN}/team-watch", "run"], TEAMS["dev"], f"{TEAMS['dev']}/logs/watchdog.log", True),
                # other buildings: one link per computer to the offices on Herdr's other machines (idle when there are none)
                ("com.omniloy.peer-link", [nd, f"{APPS}/team-office/peer-link.mjs"], f"{APPS}/team-office", f"{TEAMS['dev']}/logs/peer-link.log", True)]
        if self.cfg.get("mailRound"): jobs.append(("com.omniloy.mail-round", ["/usr/bin/python3", f"{BIN}/team-mail-round"], HOME, f"{TEAMS['biz']}/mail-round.log", False))
        if not self.dry and os.path.exists(f"{LA}/com.omniloy.offices.plist"):  # replaced by com.omniloy.office-up
            subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/com.omniloy.offices"], capture_output=True); os.remove(f"{LA}/com.omniloy.offices.plist")
        for label, args, cwd, log, keep in jobs:
            f = f"{LA}/{label}.plist"; body = plist(label, args, cwd, log, keep)
            if label == "com.omniloy.mail-round": body = body.replace("<key>RunAtLoad</key><true/>", "<key>RunAtLoad</key><true/><key>StartInterval</key><integer>600</integer>")
            if not self.dry:
                os.makedirs(LA, exist_ok=True); os.makedirs(os.path.dirname(log), exist_ok=True)
                open(f, "w").write(body)
                uid = os.getuid()
                subprocess.run(["launchctl", "bootout", f"gui/{uid}/{label}"], capture_output=True)
                r = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", f], capture_output=True, text=True)
                if r.returncode: self.warn.append(f"{label} could not be loaded: {r.stderr.strip()[:200]}")
            self.say(f"{label} installed (starts at login{', kept alive' if keep else ''})")
    def names(self):
        """Nothing that leaves the office names the team: the check runs before every outgoing write in Claude Code."""
        if "claude" not in (self.cfg.get("runtimes") or ["claude"]): self.warn.append("Codex has no check before each write: there the rule on team names rests on the protocol and on team-jira and team-draft"); return
        if self.dry: self.say("team-names install: the check on team names would be turned on in Claude Code"); return
        r = subprocess.run(["/usr/bin/python3", f"{BIN}/team-names", "install"], capture_output=True, text=True)
        if r.returncode: self.warn.append(f"the check on team names could not be turned on: {r.stderr.strip()[:200]}; run `team-names install` yourself")
        else: self.say("the check on team names is on: " + "; ".join(r.stdout.strip().splitlines()))
    def record(self):
        if self.dry: return
        os.makedirs(APPS, exist_ok=True)
        json.dump({**self.cfg, "repo": REPO, "installed": datetime.datetime.now().isoformat(timespec="seconds")}, open(f"{APPS}/install.json", "w"), indent=2, ensure_ascii=False)

def check():
    """What is installed and whether it answers. Prints one line per item; exit code 1 when something needed is missing."""
    import urllib.request
    bad = 0
    def line(ok, name, detail=""):
        nonlocal bad; print(f"{'ok ' if ok else 'NO '} {name}{': ' + detail if detail else ''}"); bad += 0 if ok else 1
    def opt(ok, name, detail=""): print(f"{'ok ' if ok else '-- '} {name}{': ' + detail if detail else ''}")
    line(sys.platform == "darwin", "macOS", "" if sys.platform == "darwin" else "this system is built for macOS (launchd, Keychain)")
    line(bool(node()), "node", node() or "install Node 20 or newer")
    line(bool(herdr_app()), "Herdr app", herdr_app() or "curl -fsSL https://releases.herdr.dev/app/install.sh | sh")
    line(bool(herdr_core()), "herdr-core (hc)", herdr_core() or "installed by Herdr on first start")
    cl, cx = which("claude"), which("codex")
    line(bool(cl or cx), "an agent CLI", ", ".join(x for x in (cl and "claude", cx and "codex") if x) or "install Claude Code or Codex")
    for name in ("team-office", "biz-office", "artifacts"): line(os.path.exists(f"{APPS}/{name}/server.mjs") and os.path.isdir(f"{APPS}/{name}/node_modules"), f"app {name}")
    for t in ("team-ask", "team-card", "team-person", "team-peer", "omniloy-team", "office-restart", "office-up", "team-watch", "team-artifact", "team-memory", "team-names"): line(os.access(f"{BIN}/{t}", os.X_OK), f"tool {t}")
    for kind, d in TEAMS.items(): line(os.path.exists(f"{d}/team.json"), f"team folder {d}")
    line(os.path.isdir(f"{HERDR}/mods/team-requests"), "Herdr panels")
    try: on = subprocess.run(["/usr/bin/python3", f"{BIN}/team-names", "status"], capture_output=True, text=True).stdout
    except Exception: on = ""
    line(bool(on.strip()) and "OFF" not in on, "check on team names (nothing outside the office names the team)", "" if on.strip() and "OFF" not in on else "team-names install")
    def up(port, path="/health"):
        try: return urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=4).status == 200
        except Exception: return False
    line(up(4317), "Dev floor answers on 4317", "" if up(4317) else "office-restart all")
    for port, name in ((4319, "CRM"), (4320, "Web"), (4321, "Lab")): opt(up(port), f"{name} floor answers on {port}")  # Business (4318) is retired
    line(up(4340, "/"), "artifacts server answers on 4340")
    try: w = subprocess.run(["/usr/bin/python3", f"{BIN}/team-watch", "alive"], capture_output=True, text=True, timeout=20)
    except Exception: w = None
    line(bool(w and w.returncode == 0), "watchdog running (team-watch)", (w.stdout.strip() if w and w.returncode == 0 else "team-watch start") + ("" if os.path.exists(f"{LA}/com.omniloy.watchdog.plist") else "; its login job is not installed: run the installer"))
    opt(up(4330, "/health") or up(4330, "/"), "voice transcriber on 4330 (optional)")
    opt(bool(tailscale()), "Tailscale (optional, for the phone)", tailscale())
    opt(os.path.exists(f"{LA}/com.omniloy.mail-round.plist"), "email rounds scheduled (optional)")
    opt(os.path.exists(f"{LA}/com.omniloy.peer-link.plist"), "link to other buildings installed (optional, see setup/SETUP.md step 11)")
    opt(up(5317), "Dev floor's guest listener answers on 5317 (what another building reaches)")
    opt(os.path.exists(f"{TEAMS['dev']}/remote.json"), "phone door remote.json (optional)")
    try:
        t = json.load(open(f"{TEAMS['dev']}/team.json")); j = t.get("jira") or {}
        opt(bool(j.get("site")), "Jira configured (optional)", j.get("site", ""))
        if j.get("site"):
            r = subprocess.run(["security", "find-generic-password", "-s", j.get("keychainService", "herdr-jira"), "-a", j.get("email", "")], capture_output=True)
            line(r.returncode == 0, "Jira token in the Keychain", "" if r.returncode == 0 else "see setup/SETUP.md, step Jira")
    except Exception: pass
    return 1 if bad else 0

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config"); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-services", action="store_true", help="do not install the background services (for tests)")
    a = ap.parse_args()
    if a.check: sys.exit(check())
    if not a.config: ap.error("--config is required (see setup/office.config.example.json)")
    cfg = json.load(open(a.config))
    o = cfg.get("owner") or {}
    if not o.get("name") or not re.fullmatch(r"[a-z][a-z0-9]{1,15}", o.get("id") or ""): sys.exit('config: owner must be {"name": "Ana", "id": "ana"} (id: lowercase letters and digits, 2 to 16)')
    if o["id"] in RESERVED: sys.exit(f'config: owner id "{o["id"]}" is the name of someone on the team; pick another (for example add a surname initial)')
    bad = [r for r in cfg.get("runtimes") or [] if r not in ("claude", "codex")]
    if bad or not cfg.get("runtimes"): sys.exit('config: runtimes must list what is installed: ["claude"], ["codex"] or ["claude", "codex"]')
    r = Run(cfg, a.dry_run)
    r.apps(); r.tools(); r.teams(); r.people(); r.skills(); r.herdr(); r.names()
    if not a.no_services: r.services()
    r.record()
    for w in r.warn: print("NOTE: " + w)
    print("\nNext: python3 setup/install.py --check   (then continue with setup/SETUP.md)")

if __name__ == "__main__": main()
