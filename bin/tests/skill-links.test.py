#!/usr/bin/env python3
"""Every relative Markdown link under teams/misc/skills must resolve to a file that exists."""
import os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BASE = os.path.join(ROOT, "teams", "misc", "skills")
LINK = re.compile(r"\]\(([^)\s]+)\)")
CODE = re.compile(r"```.*?```", re.S)
bad = []
for d, _, files in os.walk(BASE):
    for f in files:
        if not f.endswith(".md"):  # templates (.tmpl) hold placeholders that resolve only after generation
            continue
        p = os.path.join(d, f)
        text = CODE.sub("", open(p, encoding="utf-8").read())
        for m in LINK.finditer(text):
            t = m.group(1).strip("<>")
            if re.match(r"^[a-z][a-z0-9+.-]*:", t) or t.startswith("#") or t.startswith("~") or t.startswith("/") or "<" in t or "{" in t:
                continue
            t = t.split("#", 1)[0]
            if not t:
                continue
            if not os.path.exists(os.path.normpath(os.path.join(d, t))):
                bad.append(f"{os.path.relpath(p, ROOT)}: {m.group(1)}")
for b in bad:
    print("broken link:", b)
print(f"{len(bad)} broken relative link(s)")
sys.exit(1 if bad else 0)
