"""teamlib: what the team-* tools share. Not a command: the tools next to it import it.

  floors()            the floors of this building: ~/.omniloy-team/floors.json, else Dev, CRM, Web and Lab
  people()            everyone on those floors (and their temps), with their team, lead and floor
  load(path, dflt)    a JSON store: dflt when the file does not exist yet; when it exists but cannot be read the
                      tool stops and writes nothing (a half-written or broken store is never replaced by an empty one)
  save(path, data)    atomic write (a reader sees the old file or the new one, never half of it)
  Locked(path)        one writer at a time (flock on <path>.lock)
  deliver(name, text) type a message into someone's terminal now, or keep it in the outbox until they can take it
  flush()             try the outbox again (the watchdog does this every few seconds)
  overdue()           queued messages that have waited KEEP_DAYS, each reported once (the watchdog tells the owner)
"""
import os, sys, json, fcntl, time, subprocess, datetime, re
sys.dont_write_bytecode = True
HOME = os.path.expanduser("~"); BIN = f"{HOME}/.local/bin"; HC = f"{BIN}/hc"
SHARED = f"{HOME}/.omniloy-team"; ADMIN = f"{HOME}/.omniloy-admin"; OUTBOX = f"{SHARED}/outbox"
# The floors that exist when floors.json does not say otherwise (same list as hub.mjs DEFAULT_OFFICES).
# Business (4318, ~/.omniloy-biz) is retired: it is not a floor, so its people are nobody here.
DEFAULT_FLOORS = [{"name": "Dev", "port": 4317, "dir": ".omniloy-team"}, {"name": "CRM", "port": 4319, "dir": ".omniloy-crm"},
                  {"name": "Web", "port": 4320, "dir": ".omniloy-web"}, {"name": "Lab", "port": 4321, "dir": ".omniloy-lab"}]
KEEP_DAYS = 2   # a message nobody could take for this long is reported to the owner once (it is never dropped)

def now(): return datetime.datetime.now().isoformat(timespec="seconds")
def short(p): return str(p).replace(HOME, "~")

class Unreadable(Exception): pass
def read(path, dflt):
    """dflt if the file does not exist; Unreadable if it exists but is not valid JSON."""
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except FileNotFoundError: return dflt
    except Exception as e: raise Unreadable(f"{short(path)} cannot be read ({type(e).__name__})")
def load(path, dflt):
    try: return read(path, dflt)
    except Unreadable as e: sys.exit(f"{e}; nothing was changed. Fix or restore it, then try again.")
def save(path, data, indent=1):
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(data, f, indent=indent, ensure_ascii=False)
    os.replace(tmp, path)
class Locked:
    """with Locked(path): ...  (a .lock file next to it; the same lock the tool used before for that store)"""
    def __init__(self, path, wait=True): self.path, self.wait = path, wait
    def __enter__(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self.f = open(self.path + ".lock", "w")
        try: fcntl.flock(self.f, fcntl.LOCK_EX | (0 if self.wait else fcntl.LOCK_NB))
        except BlockingIOError: self.f.close(); raise
        return self
    def __exit__(self, *_):
        try: fcntl.flock(self.f, fcntl.LOCK_UN)
        finally: self.f.close()

def floors():
    """[{name, port, dir, path}] of this building."""
    try: lst = read(f"{SHARED}/floors.json", None)
    except Unreadable as e: print(f"{e}; using the default floors", file=sys.stderr); lst = None
    if not isinstance(lst, list) or not lst: lst = DEFAULT_FLOORS
    out = []
    for f in lst:
        if not isinstance(f, dict) or not f.get("dir") or not f.get("port"): continue
        d = f["dir"] if os.path.isabs(f["dir"]) else f"{HOME}/{f['dir']}"
        out.append({**f, "port": int(f["port"]), "path": d})
    return out
def team_dirs(admin=False):
    """The folder of every floor's team (and the admin's, when asked), in floor order."""
    return [f["path"] for f in floors()] + ([ADMIN] if admin else [])
def teams(admin=False):
    """[(folder, team.json, floor or None)] for the floors whose team.json exists."""
    fl = {f["path"]: f for f in floors()}; out = []
    for d in team_dirs(admin):
        t = read_quiet(f"{d}/team.json")
        if t and isinstance(t.get("personas"), list): out.append((d, t, fl.get(d)))
    return out
def read_quiet(path, dflt=None):
    try: return read(path, dflt)
    except Unreadable as e: print(f"{e}; skipped", file=sys.stderr); return dflt
def temps_of(d):
    x = read_quiet(f"{d}/temps.json", [])
    return x if isinstance(x, list) else []
def people(admin=False, temps=True):
    """{herdrName: persona + {team, lead, dir, port, tabPrefix, temp}} for everyone on the floors."""
    out = {}
    for d, t, f in teams(admin):
        for p in list(t["personas"]) + (temps_of(d) if temps else []):
            n = p.get("herdrName")
            if n and n not in out:
                out[n] = {**p, "team": t.get("name", ""), "lead": t.get("lead", ""), "dir": d, "port": f["port"] if f else None,
                          "tabPrefix": t.get("tabPrefix", "team-")}
    return out

# ---------------------------------------------------------------- conversations
def cfgdir(cmd):
    """Where this runtime keeps its conversations: CLAUDE_CONFIG_DIR, also when set by a wrapper script."""
    p = cmd if os.path.isabs(cmd) else (subprocess.run(["/usr/bin/which", cmd], capture_output=True, text=True).stdout.strip() or cmd)
    try:
        m = re.search(r'CLAUDE_CONFIG_DIR="?([^"\n]+)"?', open(p, errors="ignore").read(4000))
        if m: return os.path.expandvars(m.group(1).replace("$HOME", HOME))
    except Exception: pass
    return os.environ.get("CLAUDE_CONFIG_DIR") or f"{HOME}/.claude"
def last_session(cmd, cwd, slug, before=None):
    """(mtime, session id) of the newest Claude conversation of persona `slug` started in `cwd`, or (0, None)."""
    import glob
    before = before or time.time() + 60
    d = f"{cfgdir(cmd)}/projects/" + re.sub(r"[^A-Za-z0-9]", "-", cwd)
    best = (0, None)
    for f in glob.glob(f"{d}/*.jsonl"):
        m = os.path.getmtime(f)
        if m >= before or m <= best[0]: continue
        try:
            with open(f, errors="ignore") as h: head = "".join(h.readline() for _ in range(8))
        except Exception: continue
        if f'"agentSetting":"{slug}"' in head or f'"agentSetting":"{slug}-' in head: best = (m, os.path.basename(f)[:-6])
    return best
def session_file(cmd, cwd, sid):
    return f"{cfgdir(cmd)}/projects/" + re.sub(r"[^A-Za-z0-9]", "-", cwd) + f"/{sid}.jsonl"

# ---------------------------------------------------------------- delivery
# `hc send` without --force refuses a program that is blocked on a menu (typing would answer the menu), and fails when
# the person is not running. Either way the message is kept in ~/.omniloy-team/outbox/<name>.jsonl and typed in, in
# order, as soon as the person can take it (each new message and the watchdog try again). Never --force.
def _q(name): return f"{OUTBOX}/{re.sub(r'[^A-Za-z0-9._-]', '_', name)}.jsonl"
def _read_q(path):
    out = []
    try:
        for l in open(path, encoding="utf-8"):
            try: out.append(json.loads(l))
            except Exception: pass
    except FileNotFoundError: pass
    return out
def _write_q(path, items):
    if not items:
        try: os.remove(path)
        except FileNotFoundError: pass
        return
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for x in items: f.write(json.dumps(x, ensure_ascii=False) + "\n")
    os.chmod(tmp, 0o600); os.replace(tmp, path)
WHY = {"blocked": "busy with a question in their terminal", "not_found": "not running", "finished": "not running",
       "unavailable": "not reachable right now"}
def send_now(name, text, timeout=150):
    """One `hc send`. Returns (True, '') or (False, reason)."""
    try: r = subprocess.run([HC, "send", "--json", name, "--", text], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired: return False, "not reachable right now"
    except Exception as e: return False, f"hc failed ({type(e).__name__})"
    if r.returncode == 0: return True, ""
    kind = ""
    for s in (r.stdout, r.stderr):
        try: kind = json.loads(s.strip().splitlines()[-1]).get("error", {}).get("kind", ""); break
        except Exception: pass
    why = WHY.get(kind) or (r.stderr or r.stdout).strip()[:120] or f"hc exit {r.returncode}"
    try:   # what failed and why (never the text): outbox/send.log
        os.makedirs(OUTBOX, exist_ok=True)
        with open(f"{OUTBOX}/send.log", "a") as f: f.write(json.dumps({"at": now(), "to": name, "rc": r.returncode, "kind": kind or why[:80]}) + "\n")
    except Exception: pass
    return False, why
def _drain(name, items):
    """Send queued items in order until they cannot go. Several waiting ones go as one paste (each `hc send` waits a few
    seconds of quiet, and one message reads better than six). Returns (left, why)."""
    keep = list(items); why = ""
    while keep:
        n, size = 0, 0
        while n < len(keep) and n < 6 and (n == 0 or size + len(keep[n]["text"]) < 8000): size += len(keep[n]["text"]); n += 1
        group = keep[:n]
        text = group[0]["text"] if n == 1 else f"{n} messages that waited while you were busy:\n\n" + "\n\n".join(f"{i + 1}. ({x.get('at', '')[11:16]}) {x['text']}" for i, x in enumerate(group))
        ok, why = send_now(name, text)
        if not ok: break
        keep = keep[n:]
    return keep, why
def deliver(name, text, source=""):
    """Type `text` into <name>'s terminal, or queue it. Returns 'delivered' or 'queued: <why>'."""
    os.makedirs(OUTBOX, mode=0o700, exist_ok=True)
    q = _q(name); me = {"ts": time.time(), "at": now(), "to": name, "text": text, "source": source}
    with Locked(q):
        left, why = _drain(name, _read_q(q) + [me])
        _write_q(q, left)
    return "delivered" if not any(x["ts"] == me["ts"] and x["text"] == text for x in left) else f"queued: {why}"
def said(result, name):
    """A short sentence for a tool's output."""
    if result == "delivered": return f"{name} was told"
    why = result.split(": ", 1)[-1]
    return f"{name} is {why}: the message is queued and will be typed in as soon as they can take it"
def pending():
    """{name: number of queued messages}"""
    out = {}
    try: files = os.listdir(OUTBOX)
    except FileNotFoundError: return out
    for f in files:
        if f.endswith(".jsonl") and f != "dropped.jsonl":
            n = len(_read_q(f"{OUTBOX}/{f}"))
            if n: out[f[:-6]] = n
    return out
def overdue():
    """{name: (count, oldest 'at')} of queued messages older than KEEP_DAYS not reported yet; marks them reported.
    They stay queued: an answer is delivered late rather than lost."""
    out = {}; cut = time.time() - KEEP_DAYS * 86400
    for name in pending():
        q = _q(name)
        try:
            with Locked(q, wait=False):
                items = _read_q(q); old = [x for x in items if x.get("ts", 0) < cut and not x.get("reported")]
                if not old: continue
                for x in old: x["reported"] = now()
                _write_q(q, items); out[name] = (len(old), old[0].get("at", ""))
        except BlockingIOError: continue
    return out
def flush(terms=None):
    """Try every queued message. Skips people who are blocked or not running (one `hc ls` for all), and any
    queue another process is sending right now. Returns {name: 'delivered n' | why}."""
    want = pending(); done = {}
    if not want: return done
    if terms is None:
        try: terms = {t.get("name"): t for t in json.loads(subprocess.run([HC, "ls", "--json"], capture_output=True, text=True, timeout=20).stdout)["terminals"] if t.get("name")}
        except Exception: return {n: "hc ls failed" for n in want}
    for name in want:
        t = terms.get(name)
        if not t or t.get("state") != "live" or t.get("status") == "blocked": continue
        q = _q(name)
        try:
            with Locked(q, wait=False):
                items = _read_q(q); left, why = _drain(name, items); _write_q(q, left)
                done[name] = f"delivered {len(items) - len(left)}" + (f", {len(left)} left ({why})" if left else "")
        except BlockingIOError: continue
    return done
