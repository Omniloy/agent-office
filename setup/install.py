#!/usr/bin/env python3
"""Install or update the agent office on this computer (macOS or Linux) from this repo.

  python3 setup/install.py --config office.config.json            install / update
  python3 setup/install.py --config office.config.json --dry-run  say what would happen, change nothing
  python3 setup/install.py --check                                only check what is installed and working
  ... --force              also replace live files that were edited by hand since the last install (see below)
  ... --protocol-sections  apply the protocol sections that follow the repo without asking (you approved them)
  ... --keep PATH          leave this live file as it is even with --force (repeatable; e.g. a role file with a live-only rule)
  ... --only-services      install or update only the background services (LaunchAgents): a separate step, run
                           only with the owner's yes. A normal run never touches them.
  ... --login-resume       with --only-services: also com.omniloy.office-up (replaces com.omniloy.offices), which at
                           login restarts the people who were running: paid sessions, so only with the owner's yes
  ... --skills-home DIR    write each skill once to DIR/<name> (a skills repo you keep) and link it into the runtimes'
                           skills folders, instead of copying it into each; a name already taken there is left alone
  ... --no-services        accepted for older instructions; a normal run already leaves the services alone

It copies the apps, tools, Herdr panels, skills and role instructions to their places, filling in the owner's
name. It never overwrites a team folder that already exists (people, protocols, memory, requests): those are yours.
It does not install Herdr, Node, Claude Code, Codex or Tailscale, and it never starts agents: setup/SETUP.md
tells the installing agent how to do those with the user's go-ahead.

Safe updates:
- It looks before it writes: every destination is checked first, and when a live file was edited by hand (below)
  the run stops before changing anything at all, so an update never leaves half a new install behind.
- Every file it replaces is copied first to ~/.omniloy-office/backups/<date>/ (same path under the home folder).
  That includes the generated ones: remote.json and the LaunchAgents.
- It never writes through a symbolic link: a destination inside a linked folder (a skill linked to another repo) or
  that is itself a link is left alone and listed.
- It remembers what it wrote (~/.omniloy-office/installed.json). A live file that differs both from the repo and
  from what the last install wrote was edited by hand: it is NOT replaced, the run ends with a list and a diff for
  each, and only --force replaces them (after the backup). On the first update with this check every file that
  differs counts as edited: read the diffs, bring wanted edits into the repo, then use --force.
- npm dependencies are installed again when an app's package.json or package-lock.json changed.
- A LaunchAgent is reloaded only when its file changed. office-up (RunAtLoad: it can restart agents, which are paid
  sessions) is written but never started by the installer: it runs at the next login.
- The retired Business floor (biz-office, ~/.omniloy-biz) is not installed or touched.
- The protocol sections that follow the repo are shown as a diff and applied only with a yes (or --protocol-sections).
"""
import sys, os, json, re, shutil, subprocess, argparse, datetime, filecmp, glob, hashlib, difflib, shlex, stat

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.expanduser("~")
APPS = f"{HOME}/.omniloy-office"
BIN = f"{HOME}/.local/bin"
HERDR = f"{HOME}/.config/herdr-app"
LA = f"{HOME}/Library/LaunchAgents"
TEAMS = {"dev": f"{HOME}/.omniloy-team", "admin": f"{HOME}/.omniloy-admin"}   # Business (~/.omniloy-biz) is retired
SU = f"{HOME}/.config/systemd/user"
LINUX = sys.platform.startswith("linux")
BIZ = f"{HOME}/.omniloy-biz"
RESERVED = {"lucia", "daniel", "marta", "kenji", "irene", "pablo", "elena", "zeus", "val", "iker", "nora", "teo", "bruno", "lia",
            "ines", "mateo", "kai", "olga", "all", "team", "owner"}
STAMP = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
BACKUPS = f"{APPS}/backups/{STAMP}"
MANIFEST = f"{APPS}/installed.json"
sys.dont_write_bytecode = True; sys.path.insert(0, f"{REPO}/bin")
import teamlib   # the floors list, as the tools read it
def sha(b): return hashlib.sha256(b).hexdigest()
# The protocol sections that follow the repo (applied only with the owner's yes, see carry_sections)
SECTIONS = [("## Names outside the office", "the rule that nothing outside the office names the team"),
            ("## Commands for ", "the section on commands for the owner's terminal")]
# A new memory file: the two sections the protocol and team-memory ask for, never a dated log
MEMORY = ("# {name}: memory\n\n## Open now\n(one line per thing in progress: its state and who you are waiting on; remove it when it closes)\n\n"
          "## How things work here\n(reusable lessons only, at most about 25 short bullets; edit lines in place instead of appending)\n")

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

def fresh(dst, data, mode):
    """A new temporary file next to dst, created exclusively (never an existing file or link), holding data."""
    import tempfile
    fd, tmp = tempfile.mkstemp(prefix=f".{os.path.basename(dst)}.", suffix=".installing", dir=os.path.dirname(dst))
    try:
        with os.fdopen(fd, "wb") as f: f.write(data)
        os.chmod(tmp, mode); return tmp
    except BaseException:
        try: os.remove(tmp)
        except OSError: pass
        raise
class Run:
    def __init__(self, cfg, dry, force=False, sections=False, keep=(), quiet=False, resume=False, skills_home=None):
        self.cfg, self.dry, self.done, self.warn = cfg, dry, [], []
        self.skills_home = os.path.abspath(os.path.expanduser(skills_home)) if skills_home else None   # --skills-home
        self.resume = resume   # --login-resume: com.omniloy.office-up replaces com.omniloy.offices (it resumes people at login)
        self.force, self.sections, self.quiet = force, sections, quiet
        self.keep = {os.path.abspath(os.path.expanduser(k)) for k in keep}
        self.drift, self.wrote, self.changed, self.backed, self.linked, self.kept = [], {}, set(), 0, [], []
        try: self.manifest = json.load(open(MANIFEST)).get("files", {})
        except Exception: self.manifest = {}
        o = cfg["owner"]
        self.tokens = {"__OWNER_ID__": o["id"], "__OWNER__": o["name"], "__LANGUAGE__": cfg.get("language") or "English"}
    def say(self, s):
        self.done.append(s)
        if not self.quiet: print(("would: " if self.dry else "ok: ") + s)
    def render(self, text):
        for k, v in self.tokens.items(): text = text.replace(k, v)
        return text
    def carry_sections(self, src, dst, heads):
        """Some sections of a protocol that is otherwise kept follow the repo (how to hand the owner a command, the rule
        on names outside the office): they must match what the apps and tools do now. They change the agents' rules,
        so the change is shown as a diff and applied only with a yes (asked here when someone is at the keyboard, or
        --protocol-sections). Without it nothing changes and the proposal is left next to the file as .proposed."""
        if not (os.path.exists(src) and os.path.exists(dst)): return
        def cut(t, head):
            i = t.find("\n" + head)
            if i < 0: return None
            j = t.find("\n## ", i + 1); return (i + 1, len(t) if j < 0 else j + 1)
        new = self.render(open(src, encoding="utf-8").read()); old = out = open(dst, encoding="utf-8").read(); whats = []
        for head, what in heads:
            a, b = cut(new, head), cut(out, head)
            if not a: continue
            sec = new[a[0]:a[1]].rstrip("\n") + "\n"
            nxt = out[:b[0]] + sec + ("\n" if b[1] < len(out) else "") + out[b[1]:] if b else out.rstrip("\n") + "\n\n" + sec
            if nxt != out: whats.append(what); out = nxt
        if out == old: return
        what = " and ".join(whats)
        if self.dry:   # looking first: the .proposed it would leave must not replace one edited by hand
            self.side_write(f"{dst}.proposed", out.encode("utf-8"))
            self.say(f"{dst}: {what} differs from the repo; it would be shown as a diff and applied only with a yes"); return
        diff = "".join(difflib.unified_diff(old.splitlines(True), out.splitlines(True), f"{dst} (now)", f"{dst} (proposed)", n=2))
        ok = self.sections
        if not ok and sys.stdin.isatty():
            print(f"\n{dst}: {what} differs from the repo. The change:\n{diff}")
            ok = input("Apply it? [y/N] ").strip().lower() in ("y", "yes", "s", "si", "sí")
        if self.link_in(dst):
            if (dst, self.link_in(dst)) not in self.linked: self.linked.append((dst, self.link_in(dst)))
            return
        if not ok:
            if not self.side_write(f"{dst}.proposed", out.encode("utf-8")): return
            self.warn.append(f"{dst}: {what} differs from the repo and was NOT changed. The proposal is {os.path.basename(dst)}.proposed: "
                             f"show the user `diff {dst} {dst}.proposed`, and with their yes copy it over (or rerun with --protocol-sections)")
            return
        if not self.side_write(dst, out.encode("utf-8"), check=False): return
        self.say(f"{dst}: {what} brought up to date with your yes (the file as it was is in {BACKUPS})")
    def side_write(self, dst, data, check=True):
        """Write a file next to the user's own (a .proposed or .new proposal, or a protocol change approved with a
        yes): never through a symbolic link, the file it replaces backed up first, written atomically. A proposal
        that was edited since the install wrote it counts as edited by hand, like any installed file: the run stops
        before writing anything unless --force (check=False: the user's own file, changed only with their yes).
        Returns False when it was left alone."""
        ln = self.link_in(dst)
        if ln:
            if (dst, ln) not in self.linked: self.linked.append((dst, ln))
            return False
        if os.path.exists(dst):
            cur = open(dst, "rb").read()
            if cur == data:
                if check: self.wrote[dst] = sha(data)
                return True
            if os.path.abspath(dst) in self.keep: self.kept.append(dst); return False
            if check and sha(cur) != self.manifest.get(dst) and not self.force:
                self.drift.append((dst, cur, data)); return False
            if self.dry: return True
            self.backup(dst)
        if self.dry: return True
        mode = os.stat(dst).st_mode & 0o777 if os.path.exists(dst) else 0o644
        os.replace(fresh(dst, data, mode), dst)
        if check: self.wrote[dst] = sha(data)
        return True
    def backup(self, dst):
        """A copy of a file about to be replaced, under ~/.omniloy-office/backups/<date>/ (never next to it: a .bak in an
        app's public/ folder would be served, and one in ~/.local/bin is on the PATH)."""
        if self.dry or not os.path.exists(dst): return
        rel = os.path.relpath(dst, HOME) if dst.startswith(HOME + "/") else dst.lstrip("/")
        os.makedirs(os.path.dirname(f"{BACKUPS}/{rel}"), exist_ok=True); shutil.copy2(dst, f"{BACKUPS}/{rel}"); self.backed += 1
    def put(self, src, dst, mode=None, keep_existing=False, **_):
        """Copy one file, filling in the placeholders when it is text. Returns True when dst changed."""
        raw = open(src, "rb").read()
        try: data = self.render(raw.decode("utf-8")).encode("utf-8")
        except UnicodeDecodeError: data = raw
        return self.put_data(data, dst, mode, keep_existing)
    def link_in(self, dst):
        """The first symbolic link on the way from the home folder to dst (dst included), or ''."""
        p = os.path.abspath(dst)
        rel = os.path.relpath(p, HOME) if p.startswith(HOME + "/") else None
        if rel is None: return p if os.path.islink(p) else ""
        cur = HOME
        for part in rel.split(os.sep):
            cur = os.path.join(cur, part)
            if os.path.islink(cur): return cur
        return ""
    def put_data(self, data, dst, mode=None, keep_existing=False):
        """Write bytes to dst. A live file that was edited since the last install (it matches neither the repo nor what
        was installed) is left alone and reported, unless --force; one named with --keep, or reached through a
        symbolic link, is never written. Returns True when dst changed."""
        ln = self.link_in(dst)
        if ln:   # e.g. ~/.claude/skills/<name> linked to another repo: writing would change that repo's file
            if (dst, ln) not in self.linked: self.linked.append((dst, ln))
            return False
        if os.path.exists(dst):
            cur = open(dst, "rb").read()
            if cur == data:
                self.wrote[dst] = sha(data)
                if mode and not self.dry and (os.stat(dst).st_mode & 0o777) != mode: os.chmod(dst, mode)
                return False
            if keep_existing:
                self.side_write(dst + ".new", data)
                self.warn.append(f"{dst} already exists and differs from the repo; yours was kept and the repo's version is next to it as {os.path.basename(dst)}.new")
                return False
            if os.path.abspath(dst) in self.keep:
                self.kept.append(dst); return False
            if sha(cur) != self.manifest.get(dst) and not self.force:
                self.drift.append((dst, cur, data)); return False
            self.backup(dst)
        if not self.dry:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            os.replace(fresh(dst, data, mode or (os.stat(dst).st_mode & 0o777 if os.path.exists(dst) else 0o644)), dst)
        self.wrote[dst] = sha(data); self.changed.add(dst)
        return True
    def report_drift(self):
        """The live files that were edited by hand: listed, with a diff each, and left as they are."""
        if not self.drift: return 0
        out = f"{BACKUPS}/drift"
        print(f"\n{len(self.drift)} live file(s) were edited since the last install and differ from the repo. They were NOT replaced:")
        for dst, cur, data in self.drift:
            rel = os.path.relpath(dst, HOME) if dst.startswith(HOME + "/") else dst.lstrip("/")
            try:
                d = "".join(difflib.unified_diff(cur.decode().splitlines(True), data.decode().splitlines(True), f"{dst} (live)", f"{dst} (repo)", n=2))
                adds = sum(1 for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")); dels = sum(1 for l in d.splitlines() if l.startswith("-") and not l.startswith("---"))
            except UnicodeDecodeError: d, adds, dels = "(binary)\n", 0, 0
            if not self.dry:
                os.makedirs(os.path.dirname(f"{out}/{rel}"), exist_ok=True); open(f"{out}/{rel}.diff", "w").write(d)
            print(f"  {dst}  (repo: +{adds} -{dels} lines)")
        print(("Diffs (live -> repo) are in " + out if not self.dry else "Run without --dry-run to get a diff of each") +
              ". Bring the live edits you want to keep into the repo, then run again; or rerun with --force to replace them (each is backed up first).")
        return 1
    def report_links(self):
        for dst, ln in self.linked:
            print(f"NOTE: {dst} was not written: {ln} is a link to {os.path.realpath(ln)} (the installer never writes through a link; update it there yourself if you want the repo's version)")
        for dst in self.kept: print(f"NOTE: {dst} was kept as it is (--keep)")
    def tree(self, src, dst, **kw):
        n = 0
        for root, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "__pycache__")]
            for f in files:
                if f in (".DS_Store",) or f.endswith((".log", ".pyc")) or ".bak" in f or f.startswith(".token"): continue   # .token*: a floor's page token, never copied
                s = os.path.join(root, f); n += self.put(s, os.path.join(dst, os.path.relpath(s, src)), **kw)
        return n

    # ---- steps
    def apps(self):
        for name, src in (("team-office", "offices/team-office"), ("artifacts", "services/artifacts")):   # biz-office: Business is retired
            n = self.tree(f"{REPO}/{src}", f"{APPS}/{name}")
            self.say(f"{name}: {n} file(s) written to {APPS}/{name}")
            deps = {f"{APPS}/{name}/package.json", f"{APPS}/{name}/package-lock.json"} & self.changed   # B38: new or changed dependencies
            if not os.path.isdir(f"{APPS}/{name}/node_modules") or deps:
                if not npm(): self.warn.append(f"npm was not found: run `npm install --omit=dev` in {APPS}/{name} after installing Node"); continue
                if not self.dry and not self.quiet:
                    r = subprocess.run([npm(), "install", "--omit=dev", "--no-audit", "--no-fund"], cwd=f"{APPS}/{name}", capture_output=True, text=True, env={**os.environ, "PATH": os.path.dirname(npm()) + ":" + os.environ.get("PATH", "")})
                    if r.returncode: self.warn.append(f"npm install failed in {APPS}/{name}: {r.stderr.strip()[-300:]}"); continue
                self.say(f"{name}: dependencies installed")
    def tools(self):
        n = self.tree(f"{REPO}/bin", BIN, mode=0o755)
        self.say(f"tools: {n} file(s) written to {BIN}")
        for link, target in (("hc", herdr_core()), ("herdr-app", herdr_app())):
            dst = f"{BIN}/{link}"
            if target and not os.path.lexists(dst) and os.path.abspath(target) != dst:
                if not self.dry: os.symlink(target, dst)
                self.say(f"{link} linked to {target}")
        if BIN not in os.environ.get("PATH", "").split(":"): self.warn.append(f"{BIN} is not on PATH: add `export PATH=\"$HOME/.local/bin:$PATH\"` to your shell startup file (~/.zshrc or ~/.bashrc) (agents need the team-* tools)")
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
                for p in t["personas"]:
                    want = (c.get("assign") or {}).get(p["herdrName"]) or ("claude" if "claude" in have else have[0])
                    p["runtime"] = want if want in have else have[0]
                if not self.dry: json.dump(t, open(f"{d}/team.json", "w"), indent=2, ensure_ascii=False)
                self.say(f"{d}/team.json created ({', '.join(p['herdrName'] + ':' + p['runtime'] for p in t['personas'])})")
            else: self.say(f"{d}/team.json exists: kept as it is")
            for f in ("PROTOCOL.md", "HANDBOOK.md"):
                if os.path.exists(f"{src}/{f}") and self.put(f"{src}/{f}", f"{d}/{f}", keep_existing=True): self.say(f"{d}/{f} written")
            self.carry_sections(f"{src}/PROTOCOL.md", f"{d}/PROTOCOL.md", SECTIONS)
            for p in json.load(open(f"{src}/team.json"))["personas"]:
                m = f"{d}/memory/{p['slug']}.md"
                if not os.path.exists(m) and not self.dry: open(m, "w").write(MEMORY.format(name=p["name"]))
        for f in teamlib.floors():   # the other floors' protocols (CRM, Web, Lab...) get the same sections, with the same yes
            if f["path"] not in TEAMS.values(): self.carry_sections(f"{REPO}/teams/dev/PROTOCOL.md", f"{f['path']}/PROTOCOL.md", SECTIONS)
        shared = TEAMS["dev"]
        for f, body in (("requests.json", {"next": 1, "items": []}),):
            if not os.path.exists(f"{shared}/{f}") and not self.dry: json.dump(body, open(f"{shared}/{f}", "w"))
        sig = f"{BIZ}/signature.json"   # only where the retired Business floor's folder still exists (its mail tools read it)
        if os.path.isdir(BIZ) and not os.path.exists(sig):
            s = c.get("signature") or {}
            body = {"_about": "The owner's email signature as the business team writes it. In emails prepared from this app the links are joined by appSeparator; the signature the owner types uses ownSeparator, so app emails are recognisable at a glance.",
                    "name": s.get("name") or c["owner"].get("fullName") or c["owner"]["name"], "title": s.get("title") or "", "links": s.get("links") or [], "appSeparator": "  ", "ownSeparator": " | "}
            if not self.dry: json.dump(body, open(sig, "w"), indent=2, ensure_ascii=False)
            self.say(f"{sig} created (edit name, title and links)")
        ts = c.get("tailscale") or {}
        if ts.get("host") and ts.get("logins"):
            body = (json.dumps({"host": ts["host"], "logins": ts["logins"]}, indent=2)).encode()
            if self.put_data(body, f"{shared}/remote.json", 0o600): self.say(f"{shared}/remote.json written: the phone door is open for {len(ts['logins'])} Tailscale login(s)")
    def people(self):
        n = 0
        for kind in TEAMS:
            for f in glob.glob(f"{REPO}/teams/{kind}/agents/*.md"): n += self.put(f, f"{HOME}/.claude/agents/{os.path.basename(f)}")
        self.say(f"role instructions: {n} file(s) written to ~/.claude/agents (Codex people are sent the same text)")
    def skills(self):
        have = self.cfg.get("runtimes") or ["claude"]
        if self.skills_home: return self.linked_skills(have)
        dests = [f"{HOME}/.claude/skills"] + ([f"{HOME}/.codex/skills", f"{HOME}/.agents/skills"] if "codex" in have else [])
        for d in dests:
            n = self.tree(f"{REPO}/skills", d)
            self.say(f"skills: {n} file(s) written to {d}")
    def linked_skills(self, have):
        """--skills-home DIR: each skill is written once, to DIR/<name> (e.g. a skills repo the owner keeps), and the
        runtimes' skills folders get a link to it. A skill whose name is already taken there by something else (another
        link, a folder of the owner's) is left alone entirely: neither written nor linked."""
        home = self.skills_home
        dests = [f"{HOME}/.claude/skills"] + [d for d in (f"{HOME}/.agents/skills", f"{HOME}/.codex/skills") if "codex" in have and os.path.isdir(d)]
        n, made = 0, 0
        for name in sorted(os.listdir(f"{REPO}/skills")):
            src = f"{REPO}/skills/{name}"
            if not os.path.isdir(src): continue
            taken = [f"{d}/{name}" for d in dests if os.path.lexists(f"{d}/{name}") and os.path.realpath(f"{d}/{name}") != os.path.realpath(f"{home}/{name}")]
            if taken: self.say(f"skills: {name} left alone ({taken[0]} is not a link to {home}/{name})"); continue
            n += self.tree(src, f"{home}/{name}")
            for d in dests:
                if os.path.lexists(f"{d}/{name}"): continue
                made += 1
                if not self.dry: os.makedirs(d, exist_ok=True); os.symlink(f"{home}/{name}", f"{d}/{name}")
        self.say(f"skills: {n} file(s) written to {home}" + (f", {made} new link(s) in {', '.join(dests)}" if made else f", linked from {', '.join(dests)}"))
    def herdr(self):
        if not os.path.isdir(HERDR): self.warn.append("Herdr has not been opened yet on this computer (no ~/.config/herdr-app): open it once, then run the installer again to add the panels"); return
        n = self.tree(f"{REPO}/herdr/mods", f"{HERDR}/mods") + self.tree(f"{REPO}/herdr/layouts", f"{HERDR}/layouts")
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
                # other buildings: one link per computer to the offices on Herdr's other machines (idle when there are none)
                ("com.omniloy.peer-link", [nd, f"{APPS}/team-office/peer-link.mjs"], f"{APPS}/team-office", f"{TEAMS['dev']}/logs/peer-link.log", True),
                # the watchdog (team-watch run): nudges, the outbox of messages held for busy people, the memory check.
                # Started at login and again by launchd if it dies; a second copy (office-up, office-restart, an old
                # "watchdog" terminal) only stands by on its lock, so it never runs twice.
                ("com.omniloy.watchdog", ["/usr/bin/python3", f"{BIN}/team-watch", "run"], TEAMS["dev"], f"{TEAMS['dev']}/logs/watchdog.log", True)]
        # the retired Business floor's email rounds: no new job (an existing one is left as it is)
        if not self.resume:   # office-up restarts paid sessions at login: only with --login-resume (the owner's own yes)
            jobs = [j for j in jobs if j[0] != "com.omniloy.office-up"]
            if os.path.exists(f"{LA}/com.omniloy.office-up.plist"):
                self.warn.append(f"{LA}/com.omniloy.office-up.plist is installed from before: at login it restarts the people who were running "
                                 f"(paid sessions). Left as it is; to stop it: launchctl bootout gui/{os.getuid()}/com.omniloy.office-up and delete the file")
            self.say("com.omniloy.office-up not set up (it resumes people at login: --login-resume, with the owner's yes); "
                     + ("com.omniloy.offices still starts the floors at login" if os.path.exists(f"{LA}/com.omniloy.offices.plist") else "nothing starts the floors at login"))
        if LINUX: return self.systemd(jobs, path)
        old = f"{LA}/com.omniloy.offices.plist"   # replaced by com.omniloy.office-up: backed up, then unloaded
        if self.resume and os.path.exists(old):
            if not self.dry:
                self.backup(old)
                subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/com.omniloy.offices"], capture_output=True); os.remove(old)
            self.say(f"com.omniloy.offices removed (replaced by com.omniloy.office-up; the file is in {BACKUPS})")
        uid = os.getuid()
        def loaded(label): return subprocess.run(["launchctl", "print", f"gui/{uid}/{label}"], capture_output=True).returncode == 0
        for label, args, cwd, log, keep in jobs:
            f = f"{LA}/{label}.plist"
            if not self.dry: os.makedirs(LA, exist_ok=True); os.makedirs(os.path.dirname(log), exist_ok=True)
            changed = self.put_data(plist(label, args, cwd, log, keep).encode(), f, 0o644)
            if f in [d for d, _, _ in self.drift] or (not changed and not os.path.exists(f)): continue   # left as it is (reported)
            if label == "com.omniloy.office-up":   # RunAtLoad and it may restart agents: never started from here
                self.say(f"{label} {'written' if changed else 'unchanged'}: it runs at the next login (start it now only with the owner's yes: launchctl bootstrap gui/{uid} {f})")
                continue
            if not changed and loaded(label): self.say(f"{label} unchanged and running"); continue
            if not self.dry:
                subprocess.run(["launchctl", "bootout", f"gui/{uid}/{label}"], capture_output=True)
                r = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", f], capture_output=True, text=True)
                if r.returncode: self.warn.append(f"{label} could not be loaded: {r.stderr.strip()[:200]}")
            self.say(f"{label} {'installed' if changed else 'loaded'} (starts at login{', kept alive' if keep else ''})")
    def systemd(self, jobs, path):
        for label, args, cwd, log, keep in jobs:
            unit = "omniloy-" + label.rsplit(".", 1)[1]; f = f"{SU}/{unit}.service"; up = unit == "omniloy-office-up"
            run = "Restart=always\n" if keep else "Type=oneshot\n" + ("RemainAfterExit=yes\n" if up else "")
            body = (f"[Unit]\nDescription={unit}\n\n[Service]\n{run}ExecStart={' '.join(shlex.quote(x) for x in args)}\nWorkingDirectory={cwd}\nEnvironment=PATH={path}\n"
                    f"StandardOutput=append:{log}\nStandardError=append:{log}\n" + ("\n[Install]\nWantedBy=default.target\n" if keep or up else ""))
            if not self.dry: os.makedirs(SU, exist_ok=True); os.makedirs(os.path.dirname(log), exist_ok=True)
            changed = self.put_data(body.encode(), f, 0o644)
            if f in [d for d, _, _ in self.drift] or (not changed and not os.path.exists(f)): continue   # left as it is (reported)
            def sc(*a): return subprocess.run(["systemctl", "--user", *a], capture_output=True, text=True)
            if up:   # it may restart agents: enabled so it runs at the next login, never started from here
                self.say(f"{unit} {'written' if changed else 'unchanged'}: it runs at the next login (start it now only with the owner's yes: systemctl --user start {unit}.service)")
                if not self.dry and changed:
                    sc("daemon-reload"); r = sc("enable", f"{unit}.service")
                    if r.returncode: self.warn.append(f"{unit} could not be enabled: {r.stderr.strip()[:200]}")
                continue
            if not changed and not self.dry and sc("is-active", f"{unit}.service").returncode == 0: self.say(f"{unit} unchanged and running"); continue
            if not self.dry:
                sc("daemon-reload"); r = sc("enable", "--now", f"{unit}.service")
                if r.returncode: self.warn.append(f"{unit} could not be loaded: {r.stderr.strip()[:200]}")
            self.say(f"{unit} {'installed' if changed else 'loaded'} (starts at login{', kept alive' if keep else ''})")
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
        # what this install wrote (or found already equal): the next one replaces only files still like this
        files = {**self.manifest, **self.wrote}
        tmp = f"{MANIFEST}.tmp"; json.dump({"updated": STAMP, "repo": REPO, "files": files}, open(tmp, "w"), indent=1); os.replace(tmp, MANIFEST)
        if self.backed: self.say(f"{self.backed} replaced file(s) backed up in {BACKUPS}")

def check():
    """What is installed and whether it answers. Prints one line per item; exit code 1 when something needed is missing."""
    import urllib.request
    bad = 0
    def line(ok, name, detail=""):
        nonlocal bad; print(f"{'ok ' if ok else 'NO '} {name}{': ' + detail if detail else ''}"); bad += 0 if ok else 1
    def opt(ok, name, detail=""): print(f"{'ok ' if ok else '-- '} {name}{': ' + detail if detail else ''}")
    line(sys.platform in ("darwin", "linux"), "macOS or Linux", "" if sys.platform in ("darwin", "linux") else "this system is built for macOS (launchd, Keychain) or Linux (systemd, token file)")
    line(bool(node()), "node", node() or "install Node 20 or newer")
    line(bool(herdr_app()), "Herdr app", herdr_app() or "curl -fsSL https://releases.herdr.dev/app/install.sh | sh")
    line(bool(herdr_core()), "herdr-core (hc)", herdr_core() or "installed by Herdr on first start")
    line(bool(shutil.which("lsof")), "lsof (office-restart finds the ports' owners)", "" if shutil.which("lsof") else "sudo pacman -S lsof" if LINUX else "built into macOS")
    cl, cx = which("claude"), which("codex")
    line(bool(cl or cx), "an agent CLI", ", ".join(x for x in (cl and "claude", cx and "codex") if x) or "install Claude Code or Codex")
    for name in ("team-office", "artifacts"): line(os.path.exists(f"{APPS}/{name}/server.mjs") and os.path.isdir(f"{APPS}/{name}/node_modules"), f"app {name}")
    for t in ("team-ask", "team-card", "team-person", "team-peer", "team-deliver", "team-watch", "omniloy-team", "office-restart", "office-up", "team-artifact", "team-memory", "team-names"): line(os.access(f"{BIN}/{t}", os.X_OK), f"tool {t}")
    line(os.path.exists(f"{BIN}/teamlib.py"), "tool library teamlib.py (the team-* tools import it)")
    for kind, d in TEAMS.items(): line(os.path.exists(f"{d}/team.json"), f"team folder {d}")
    line(os.path.isdir(f"{HERDR}/mods/team-requests"), "Herdr panels")
    try: on = subprocess.run(["/usr/bin/python3", f"{BIN}/team-names", "status"], capture_output=True, text=True).stdout
    except Exception: on = ""
    line(bool(on.strip()) and "OFF" not in on, "check on team names (nothing outside the office names the team)", "" if on.strip() and "OFF" not in on else "team-names install")
    def up(port, path="/health"):
        try: return urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=4).status == 200
        except Exception: return False
    fl = teamlib.floors()   # floors.json, else Dev, CRM, Web, Lab (Business is retired)
    for i, f in enumerate(fl):
        has = os.path.exists(f"{f['path']}/team.json")
        (line if i == 0 else opt)(up(f["port"]), f"{f['name']} floor answers on {f['port']}", "" if up(f["port"]) else ("office-restart all" if has else f"no team folder {f['path']}"))
    line(up(4340, "/"), "artifacts server answers on 4340")
    # the watchdog: its lock (team-watch alive) says whether `team-watch run` is running; watch.json whether it checked lately
    try: w = subprocess.run(["/usr/bin/python3", f"{BIN}/team-watch", "alive"], capture_output=True, text=True, timeout=20)
    except Exception: w = None
    try: ago = __import__("time").time() - json.load(open(f"{TEAMS['dev']}/watch.json")).get("checkedAt", 0) / 1000
    except Exception: ago = 1e9
    alive = bool(w and w.returncode == 0)
    line(alive and ago < 300, "watchdog runs (team-watch: nudges, held messages, memory check)",
         "" if alive and ago < 300 else (f"{w.stdout.strip()}, but its last check was {int(ago // 60)} min ago (log: ~/.omniloy-team/logs/watchdog.log)" if alive else "team-watch start")
         + ("" if os.path.exists(f"{SU}/omniloy-watchdog.service" if LINUX else f"{LA}/com.omniloy.watchdog.plist") else "; its login job is not installed: run the installer with --only-services"))
    opt(up(4330, "/health") or up(4330, "/"), "voice transcriber on 4330 (optional)")
    opt(bool(tailscale()), "Tailscale (optional, for the phone)", tailscale())
    if not LINUX: opt(os.path.exists(f"{LA}/com.omniloy.mail-round.plist"), "email rounds scheduled (optional)")
    opt(os.path.exists(f"{SU}/omniloy-peer-link.service" if LINUX else f"{LA}/com.omniloy.peer-link.plist"), "link to other buildings installed (optional, see setup/SETUP.md step 11)")
    g = (fl[0]["port"] if fl else 4317) + 1000
    opt(up(g), f"{fl[0]['name'] if fl else 'Dev'} floor's guest listener answers on {g} (what another building reaches)")
    opt(os.path.exists(f"{TEAMS['dev']}/remote.json"), "phone door remote.json (optional)")
    try:
        t = json.load(open(f"{TEAMS['dev']}/team.json")); j = t.get("jira") or {}
        opt(bool(j.get("site")), "Jira configured (optional)", j.get("site", ""))
        if j.get("site"):
            if LINUX:
                tf = f"{TEAMS['dev']}/jira-token"; ok = os.path.isfile(tf) and stat.S_IMODE(os.stat(tf).st_mode) == 0o600
                line(ok, "Jira token file (mode 0600)", "" if ok else f"install -m 600 /dev/null {tf}, then put the token in it")
            else:
                r = subprocess.run(["security", "find-generic-password", "-s", j.get("keychainService", "herdr-jira"), "-a", j.get("email", "")], capture_output=True)
                line(r.returncode == 0, "Jira token in the Keychain", "" if r.returncode == 0 else "see setup/SETUP.md, step Jira")
    except Exception: pass
    return 1 if bad else 0

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config"); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-services", action="store_true", help="kept for older instructions: a normal run never touches the background services")
    ap.add_argument("--only-services", action="store_true", help="install or update only the background services (LaunchAgents), with the owner's yes")
    ap.add_argument("--login-resume", action="store_true", help="with --only-services: also com.omniloy.office-up, which at login restarts the people who were running (paid sessions), in place of com.omniloy.offices")
    ap.add_argument("--force", action="store_true", help="also replace live files edited since the last install (backed up first)")
    ap.add_argument("--keep", action="append", default=[], metavar="PATH", help="never replace this live file, even with --force (repeatable)")
    ap.add_argument("--protocol-sections", action="store_true", help="apply the protocol sections that follow the repo without asking")
    ap.add_argument("--skills-home", metavar="DIR", help="write skills once to DIR/<name> and link them into the runtimes' skills folders")
    a = ap.parse_args()
    if a.check: sys.exit(check())
    if not a.config: ap.error("--config is required (see setup/office.config.example.json)")
    if a.no_services and a.only_services: ap.error("--no-services and --only-services exclude each other")
    cfg = json.load(open(a.config))
    o = cfg.get("owner") or {}
    if not o.get("name") or not re.fullmatch(r"[a-z][a-z0-9]{1,15}", o.get("id") or ""): sys.exit('config: owner must be {"name": "Ana", "id": "ana"} (id: lowercase letters and digits, 2 to 16)')
    if o["id"] in RESERVED: sys.exit(f'config: owner id "{o["id"]}" is the name of someone on the team; pick another (for example add a surname initial)')
    bad = [r for r in cfg.get("runtimes") or [] if r not in ("claude", "codex")]
    if bad or not cfg.get("runtimes"): sys.exit('config: runtimes must list what is installed: ["claude"], ["codex"] or ["claude", "codex"]')
    def steps(r):
        if a.only_services: r.services()   # the background services only ever change in their own step, with the owner's yes
        else: r.apps(); r.tools(); r.teams(); r.people(); r.skills(); r.herdr(); r.names()
    # 1. look: every destination is compared first, nothing is written
    if a.login_resume and not a.only_services: ap.error("--login-resume goes with --only-services")
    look = Run(cfg, True, force=a.force, sections=a.protocol_sections, keep=a.keep, quiet=True, resume=a.login_resume, skills_home=a.skills_home)
    steps(look)
    if look.drift and not a.force:
        look.dry = a.dry_run; look.report_drift(); look.report_links()
        print("\nNothing was changed: the install stops before writing anything while live files differ like this.")
        sys.exit(1)
    # 2. do it (or say it, with --dry-run)
    r = Run(cfg, a.dry_run, force=a.force, sections=a.protocol_sections, keep=a.keep, resume=a.login_resume, skills_home=a.skills_home)
    steps(r)
    r.record()
    for w in r.warn: print("NOTE: " + w)
    r.report_links()
    drift = r.report_drift()
    if not a.only_services:
        print("\nThe background services (LaunchAgents: floors at login, watchdog, artifacts, phone link) were not touched."
              "\nThey are a separate step, only with the owner's yes: the same command with --only-services.")
    guide = "setup/SETUP-linux.md" if LINUX else "setup/SETUP.md"
    print(f"\nNext: python3 setup/install.py --check   (then continue with {guide})")
    sys.exit(drift)

if __name__ == "__main__": main()
