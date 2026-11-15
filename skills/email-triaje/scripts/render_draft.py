#!/usr/bin/env python3
"""render_draft.py <body.txt>  ->  prints the HTML ready for draft_gmail_message (body_format=html).
Safety net for the owner's email rules. Aborts (exit 1) if:
  - the text contains an em dash or an en dash; use --allow-em-dash only for quoted third-party text
  - the body contains HTML
  - the signature block is missing at the end
The signature comes from ~/.omniloy-biz/signature.json: in this app's emails the links go WITHOUT a vertical
bar between them (appSeparator). The signature is accepted written with or without the bar; it is always
emitted without it.
Input format: one paragraph per line, blank line between paragraphs, no HTML."""
import sys, os, re, subprocess
args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args: sys.exit(__doc__)
text = open(args[0], encoding="utf-8").read()
if "--allow-em-dash" not in sys.argv:
    bad = [n for n, l in enumerate(text.split("\n"), 1) if re.search("[\u2014\u2013]", l)]
    if bad: sys.exit("REWRITE: em dash or en dash on line(s) " + ", ".join(map(str, bad)) + ". Replace it with a comma, a colon, parentheses or a new sentence.")
if re.search(r"<[a-zA-Z/][^>]*>", text): sys.exit("The body must not contain HTML; write plain text.")
r = subprocess.run([os.path.expanduser("~/.local/bin/team-gmail"), "render", args[0], "--strict", "--no-dash-check"], capture_output=True, text=True)
if r.returncode != 0: sys.exit(r.stderr.strip() or "could not render the draft")
print(r.stdout, end="")
