#!/usr/bin/env node
// smells: the gardener's lever. Deterministic detectors over a diff or a tree, and the ledger that turns a smell seen
// twice into a Rule card. Node, no dependencies. Part of mstack (mx-gardener).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LINE, DIFF, ALL, FUNC } from './detectors/index.mjs';

const HELP = `smells: find the weeds agents keep planting, and count them.

  smells diff <base>..<head> [--repo DIR] [--card KEY] [--team DIR] [--json] [--only id,id]
        detectors over the lines and files the range adds. --card reads the card's evidence manifest (tiers,
        no-behavior); --team (default $TEAM_DIR or ~/.omniloy-misc) gives the kit registry and gate overrides.
  smells tree <path> [--json] [--only id,id]     the line detectors over every file under <path>
  smells ledger add --file findings.json [--team DIR]   append findings (each: repo, pr, smell, file, line, class, card)
  smells ledger count --smell ID [--repo R] [--team DIR] [--json]
        distinct sightings of a smell; ruleCard is true at 2 (open "Rule: <smell>" then)
  smells list                                    the detector ids

Detectors: ${ALL.join(', ')}.
Exit codes: 0 no findings, 1 findings, 2 usage. Ledger: <team>/garden/ledger.tsv (ts repo pr smell file_line class card).
Example: smells diff origin/main..HEAD --repo ~/.omniloy-misc/work/lanes/MSC-9-1 --card MSC-9 --json`;

function parse(argv) { const o = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[k] = argv[++i]; else o[k] = true; } else o._.push(a); } return o; }
const die = (m, c = 2) => { console.error(m); process.exit(c); };
// exit only after stdout is flushed: on a pipe Node writes asynchronously, and process.exit drops what is buffered (64 KiB)
const finish = (c) => process.stdout.write('', () => process.exit(c));
const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const teamDir = (o) => o.team || process.env.TEAM_DIR || path.join(os.homedir(), '.omniloy-misc');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
function globre(g) { let out = '', i = 0; while (i < g.length) { if (g.startsWith('**/', i)) { out += '(?:.*/)?'; i += 3; } else if (g.startsWith('**', i)) { out += '.*'; i += 2; } else if (g[i] === '*') { out += '[^/]*'; i++; } else if (g[i] === '?') { out += '[^/]'; i++; } else { out += g[i].replace(/[.+^${}()|[\]\\]/g, '\\$&'); i++; } } return new RegExp(`^${out}$`); }
function frontSources(file) { const s = fs.readFileSync(file, 'utf8'); const m = s.match(/^---\n([\s\S]*?)\n---/); if (!m) return []; const l = m[1].match(/^sources:\s*\[(.*)\]\s*$/m); return l ? l[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : []; }
function only(o) { return o.only ? new Set(String(o.only).split(',')) : null; }

function addedLines(repo, range) {
  const out = git(repo, 'diff', '-U0', '--no-color', '--no-ext-diff', range);
  const lines = []; const files = new Set(); let file = null, ln = 0;
  for (const l of out.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4) === '/dev/null' ? null : l.slice(6); if (file) files.add(file); continue; }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/); if (h) { ln = Number(h[1]); continue; }
    if (file && l.startsWith('+') && !l.startsWith('+++')) { lines.push({ file, line: ln, text: l.slice(1) }); ln++; }
  }
  return { lines, files: [...files] };
}
function lineFindings(lines, filter) {
  const f = [];
  for (const L of lines) for (const d of LINE) { if (filter && !filter.has(d.id)) continue; if (d.test(L.text, L.file)) f.push({ smell: d.id, severity: d.severity, file: L.file, line: L.line, text: L.text.trim().slice(0, 160), fix: d.fix }); }
  return f;
}
function context(o, repo, range, lines, files) {
  const td = teamDir(o); const head = range.split('..').pop() || 'HEAD';
  const reg = readJson(path.join(td, 'verify/registry.json'), { repos: {} });
  const repoName = o['repo-name'] || (() => { try { const u = git(repo, 'remote', 'get-url', 'origin').trim(); const m = u.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/); return m ? m[1] : null; } catch { return null; } })();
  const ent = (repoName && reg.repos[repoName]) || null;
  const kit = o.kit || (ent && ent.kit) || null; const formal = ent && ent.formal;
  const mapRes = kit ? fs.readdirSync(path.join(kit, 'references/features')).filter((f) => f.endsWith('.md') && f !== 'README.md').flatMap((f) => frontSources(path.join(kit, 'references/features', f))).map(globre) : [];
  const formalRes = formal ? fs.readdirSync(formal, { recursive: true }).filter((f) => String(f).endsWith('.md') && !String(f).endsWith('SKILL.md')).flatMap((f) => frontSources(path.join(formal, String(f)))).map(globre) : [];
  let card = null;
  if (o.card) { const m = readJson(path.join(td, 'evidence', String(o.card).toUpperCase(), 'manifest.json'), null);
    card = { key: String(o.card).toUpperCase(), tiers: m ? [...new Set(m.claims.flatMap((c) => c.tier.split('+')))] : [], noBehavior: !!(m && m.noBehavior) || o['no-behavior'] === true }; }
  const ovf = path.join(td, 'board/gate-overrides.jsonl');
  const since = o.since || null;
  const overrides = fs.existsSync(ovf) ? fs.readFileSync(ovf, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && (!since || x.at >= since)) : [];
  const newFunctions = [];
  for (const L of lines) for (const re of FUNC) { const m = L.text.match(re); if (m) { newFunctions.push({ name: m[1], file: L.file, line: L.line }); break; } }
  const defs = new Map();
  const definitions = (name) => {
    if (defs.has(name)) return defs.get(name);
    let out = '';
    try { out = git(repo, 'grep', '-n', '-E', `(function[[:space:]]*[*]?[[:space:]]*${name}[[:space:]]*[(]|(const|let|var)[[:space:]]+${name}[[:space:]]*=[[:space:]]*(async[[:space:]]*)?([(][^)]*[)]|[A-Za-z_$][A-Za-z0-9_$]*)[[:space:]]*=>|def[[:space:]]+${name}[[:space:]]*[(])`, head, '--'); } catch {}
    const r = out.split('\n').filter(Boolean).map((l) => { const p = l.split(':'); return { file: p[1], line: Number(p[2]) }; });
    defs.set(name, r); return r;
  };
  return { files, newFunctions, definitions, kit, card, overrides, mapped: (f) => mapRes.some((r) => r.test(f)), formalCovered: (f) => formalRes.some((r) => r.test(f)) };
}
function report(o, findings, extra = {}) {
  if (o.json) console.log(JSON.stringify({ findings, count: findings.length, ...extra }));
  else { for (const f of findings) console.log(`${f.smell}\t${f.file}:${f.line}\t${f.text}\n    instead: ${f.fix}`); console.log(`${findings.length} finding(s)`); }
  finish(findings.length ? 1 : 0);
}
function cmdDiff(o) {
  const range = o._[1]; if (!range || !range.includes('..')) die('usage: smells diff <base>..<head> [--repo DIR] (see --help)');
  const repo = path.resolve(o.repo || '.'); const filter = only(o);
  let a; try { a = addedLines(repo, range); } catch (e) { die(`git diff ${range} failed in ${repo}: ${String(e.stderr || e.message).trim().split('\n')[0]}`); }
  const ctx = context(o, repo, range, a.lines, a.files);
  const findings = lineFindings(a.lines, filter);
  for (const d of DIFF) { if (filter && !filter.has(d.id)) continue; for (const x of d.run(ctx)) findings.push({ smell: d.id, severity: d.severity, fix: d.fix, ...x }); }
  report(o, findings, { range, repo });
}
function cmdTree(o) {
  const root = o._[1]; if (!root) die('usage: smells tree <path>'); const lines = [];
  const walk = (p) => { const st = fs.statSync(p); if (st.isDirectory()) { if (/node_modules|\.git$/.test(p)) return; for (const f of fs.readdirSync(p)) walk(path.join(p, f)); return; }
    if (st.size > 2 << 20) return; fs.readFileSync(p, 'utf8').split('\n').forEach((t, i) => lines.push({ file: path.relative(root, p) || path.basename(p), line: i + 1, text: t })); };
  walk(path.resolve(root)); report(o, lineFindings(lines, only(o)));
}
const COLS = ['ts', 'repo', 'pr', 'smell', 'file_line', 'class', 'card'];
function ledgerPath(o) { return path.join(teamDir(o), 'garden/ledger.tsv'); }
function cmdLedger(o) {
  const lp = ledgerPath(o); const sub = o._[1];
  if (sub === 'add') {
    if (!o.file) die('usage: smells ledger add --file findings.json');
    let rows = readJson(o.file, null); if (!rows) die(`cannot read ${o.file}`); rows = Array.isArray(rows) ? rows : rows.findings || [];
    fs.mkdirSync(path.dirname(lp), { recursive: true }); if (!fs.existsSync(lp)) fs.writeFileSync(lp, COLS.join('\t') + '\n');
    const clean = (v) => String(v ?? '').replace(/[\t\n\r]/g, ' ').replace(/^([=+\-@])/, "'$1");
    const ts = new Date().toISOString().slice(0, 19);
    for (const r of rows) { if (!r.smell || !ALL.includes(r.smell)) die(`unknown smell ${r.smell}; ids: ${ALL.join(', ')}`);
      fs.appendFileSync(lp, [ts, r.repo, r.pr, r.smell, `${r.file || ''}:${r.line ?? 0}`, r.class || 'candidate', r.card].map(clean).join('\t') + '\n'); }
    console.log(o.json ? JSON.stringify({ ok: true, added: rows.length, ledger: lp }) : `${rows.length} row(s) added to ${lp}`); return finish(0);
  }
  if (sub === 'count') {
    if (!o.smell) die('usage: smells ledger count --smell ID [--repo R]');
    const rows = fs.existsSync(lp) ? fs.readFileSync(lp, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [COLS[i], v]))) : [];
    const hit = rows.filter((r) => r.smell === o.smell && (!o.repo || r.repo === o.repo) && r.class !== 'dismiss');
    const distinct = new Set(hit.map((r) => `${r.pr || r.card}|${r.file_line}`)).size;
    const res = { smell: o.smell, repo: o.repo || null, count: distinct, ruleCard: distinct >= 2, cases: hit.slice(-5) };
    if (o.json) console.log(JSON.stringify(res)); else console.log(`${o.smell}${o.repo ? ' in ' + o.repo : ''}: seen ${distinct} time(s)${res.ruleCard ? ' -> open a Rule card' : ''}`);
    return finish(0);
  }
  die('usage: smells ledger add|count (see --help)');
}
const o = parse(process.argv.slice(2));
if (o.help || o._[0] === 'help') { console.log(HELP); finish(0); }
else switch (o._[0]) {
  case 'diff': cmdDiff(o); break;
  case 'tree': cmdTree(o); break;
  case 'ledger': cmdLedger(o); break;
  case 'list': console.log(ALL.join('\n')); break;
  default: console.log(HELP); finish(2);
}
