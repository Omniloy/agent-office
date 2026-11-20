// Team Office: a local, read-mostly bridge between Herdr (`hc`) and the 3D office page.
// It binds to 127.0.0.1 only and every /api call needs the per-run token that is
// embedded in the page, so no other site or machine can read screens or send text.
import http from 'node:http';
import { createTerm } from './term.mjs';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createHub, OFFICES } from './hub.mjs';
import { menuInstance, parseMenu, terminalId, maskSecrets } from './menu.mjs';

const HOME = os.homedir();
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEAM_DIR = process.env.TEAM_DIR || path.join(HOME, '.omniloy-team');
const PORT = Number(process.env.PORT || 4317);
const HOST = '127.0.0.1';
const TOKEN = process.env.OFFICE_TOKEN || crypto.randomBytes(18).toString('hex'); // OFFICE_TOKEN: a restart that keeps the pages already open working
const LOCAL_BIN = path.join(HOME, '.local', 'bin');
process.env.PATH = `${LOCAL_BIN}:${process.env.PATH || ''}`;
const bin = (n) => (existsSync(path.join(LOCAL_BIN, n)) ? path.join(LOCAL_BIN, n) : n);
const HC = bin('hc');
const TEAM_JIRA = bin('team-jira');
const expand = (p) => (p && p.startsWith('~') ? path.join(HOME, p.slice(1)) : p);

// The office is named after the Herdr space its tabs live in (the one holding a tab with this
// team's prefix); the team's own name when Herdr can't say.
let spaceCache = { at: 0, name: '' };
async function spaceName(team) {
  const fallback = team.space || team.name || 'Omniloy HQ';
  if (Date.now() - spaceCache.at < 60_000) return spaceCache.name || fallback;
  spaceCache.at = Date.now();
  try {
    let r = await run('herdr-app', ['ls']);
    if (!r.ok) r = await run(path.join(HOME, '.local', 'bin', 'herdr-app'), ['ls']);
    const spaces = JSON.parse(r.stdout).spaces || [], pre = team.tabPrefix || '';
    const sp = pre && spaces.find((x) => (x.tabs || []).some((t) => String(t.id).startsWith(pre)));
    spaceCache.name = (sp && sp.name) || '';
  } catch { /* keep the last name */ }
  return spaceCache.name || fallback;
}
function run(cmd, args, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024, cwd: HOME }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: (stderr || (err && err.message) || '').trim() });
    });
  });
}
const readJson = async (f) => JSON.parse(await fs.readFile(f, 'utf8'));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- team + personas
let teamCache = { mtime: 0, team: null };
async function loadTeam() {
  const f = path.join(TEAM_DIR, 'team.json');
  const st = await fs.stat(f);
  // temps hired with `team-temp` sit in temps.json and join the office as extra people
  const tf = path.join(TEAM_DIR, 'temps.json');
  let tm = 0; try { tm = (await fs.stat(tf)).mtimeMs; } catch {}
  const stamp = `${st.mtimeMs}:${tm}`;
  if (stamp !== teamCache.mtime) {
    const team = await readJson(f);
    let temps = []; if (tm) { try { temps = await readJson(tf); } catch {} }
    team.personas = [...team.personas, ...(Array.isArray(temps) ? temps : [])];
    teamCache = { mtime: stamp, team };
  }
  return teamCache.team;
}
const descCache = new Map(); // slug -> { key, d }: an edited description shows without a restart
async function personaDescription(slug) {
  const f = path.join(HOME, '.claude', 'agents', `${slug}.md`);
  const st = await fs.stat(f).catch(() => null), key = st ? `${st.size}:${st.mtimeMs}` : '';
  const hit = descCache.get(slug);
  if (hit && hit.key === key) return hit.d;
  let d = '';
  try {
    const md = await fs.readFile(f, 'utf8');
    const m = md.match(/^description:\s*(.+)$/m);
    if (m) d = m[1].trim();
  } catch {}
  descCache.set(slug, { key, d });
  return d;
}
// A cache that only grows (one entry per file ever seen) keeps its newest entries only.
const capMap = (m, n) => { while (m.size > n) m.delete(m.keys().next().value); };

// ---------------------------------------------------------------- transcripts
async function tail(file, maxBytes = 3_000_000) {
  const st = await fs.stat(file);
  const start = Math.max(0, st.size - maxBytes);
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(st.size - start);
    await fh.read(buf, 0, buf.length, start);
    let s = buf.toString('utf8');
    if (start > 0) s = s.slice(s.indexOf('\n') + 1);
    return s.split('\n');
  } finally {
    await fh.close();
  }
}

const base = (p) => (p ? path.basename(String(p)) : '');
function describeTool(name, input = {}) {
  const n = name || '';
  if (n === 'Read') return `Reading ${base(input.file_path)}`;
  if (n === 'Edit' || n === 'NotebookEdit') return `Editing ${base(input.file_path || input.notebook_path)}`;
  if (n === 'Write') return `Writing ${base(input.file_path)}`;
  if (n === 'Bash') return oneLine(input.description) || `Running ${clip(oneLine(input.command), 80)}`;
  if (n === 'Grep' || n === 'Glob') return `Searching for ${clip(oneLine(input.pattern), 50)}`;
  if (n === 'WebSearch') return `Searching the web: ${clip(oneLine(input.query), 60)}`;
  if (n === 'WebFetch') return `Reading ${clip(oneLine(input.url), 60)}`;
  if (n === 'Agent' || n === 'Task') return `Delegating: ${clip(oneLine(input.description), 60)}`;
  if (n === 'ToolSearch') return 'Looking for the right tool';
  if (n === 'Skill') return `Using the ${input.skill} skill`;
  if (/atlassian/i.test(n)) {
    const op = n.split('__').pop();
    const key = input.issueIdOrKey || input.issueKey || '';
    if (/searchJira/i.test(op)) return 'Searching Jira';
    if (/addComment/i.test(op)) return `Commenting on ${key}`;
    if (/getJiraIssue$/i.test(op)) return `Reading ${key}`;
    if (/createJiraIssue/i.test(op)) return `Creating a Jira card: ${clip(oneLine(input.summary), 50)}`;
    if (/transition/i.test(op)) return `Moving ${key}`;
    if (/editJiraIssue/i.test(op)) return `Updating ${key}`;
    return `Jira: ${op}`;
  }
  if (/claude-in-chrome|Claude_Browser/i.test(n)) return `Browser: ${n.split('__').pop().replace(/_/g, ' ')}`;
  if (n.startsWith('mcp__')) return n.split('__').slice(1).join(' · ').replace(/_/g, ' ');
  return n;
}

// Finds `hc send <name> "<text>"` nudges inside a shell command.
function findNudges(cmd, names) {
  const out = [];
  const re = /\bhc\s+send\s+(?:--[\w-]+(?:\s+\d+)?\s+)*["']?([a-zA-Z][\w-]*)["']?\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(cmd))) {
    const to = m[1].toLowerCase();
    if (!names.has(to)) continue;
    out.push({ to, text: (m[2] ?? m[3] ?? m[4] ?? '').replace(/\\(["\\$`])/g, '$1') });
  }
  return out;
}
function findJiraComment(cmd) {
  const m = /\bteam-jira\s+comment\s+([A-Z][A-Z0-9]+-\d+)/.exec(cmd);
  return m ? m[1] : null;
}
const NOISE = /^\s*(<system-reminder|<command-|<local-command|<environment_context|<task-notification|Caveat:|\[Request interrupted)/;
const cleanInbox = (t) => String(t).replace(/<\/?hc[^>]*>/g, '').trim();

function parseClaude(lines, names) {
  const items = [];
  for (const line of lines) {
    if (line.length > 400_000 || !(line.includes('"type":"assistant"') || line.includes('"type":"user"'))) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.isSidechain || d.isMeta) continue;
    const ts = Date.parse(d.timestamp) || 0;
    const content = d.message && d.message.content;
    if (d.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'text' && b.text.trim()) items.push({ ts, kind: 'say', text: b.text.trim() });
        else if (b.type === 'tool_use') {
          const it = { ts, kind: 'tool', tool: b.name, text: describeTool(b.name, b.input) };
          const cmd = b.name === 'Bash' ? String((b.input && b.input.command) || '') : '';
          if (cmd) { it.nudges = findNudges(cmd, names); it.jiraKey = findJiraComment(cmd); }
          if (/addCommentToJiraIssue/.test(b.name)) it.jiraKey = b.input && (b.input.issueIdOrKey || b.input.issueKey);
          items.push(it);
        }
      }
    } else if (d.type === 'user') {
      const texts = typeof content === 'string' ? [content]
        : Array.isArray(content) ? content.filter((b) => b.type === 'text').map((b) => b.text) : [];
      for (const t of texts) if (t && !NOISE.test(t) && cleanInbox(t)) items.push({ ts, kind: 'inbox', text: cleanInbox(t) });
    }
  }
  return items;
}

function parseCodex(lines, names) {
  const items = [];
  for (const line of lines) {
    if (line.length > 400_000 || !line.includes('"response_item"')) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const p = d.payload || {};
    const ts = Date.parse(d.timestamp) || 0;
    if (p.type === 'message' && Array.isArray(p.content)) {
      for (const b of p.content) {
        const t = (b.text || '').trim();
        if (!t) continue;
        if (p.role === 'assistant' && b.type === 'output_text') items.push({ ts, kind: 'say', text: t });
        else if (p.role === 'user' && b.type === 'input_text' && !NOISE.test(t) && !t.startsWith('<')) items.push({ ts, kind: 'inbox', text: cleanInbox(t) });
      }
    } else if (p.type === 'custom_tool_call' || p.type === 'function_call' || p.type === 'local_shell_call') {
      const src = String(p.input || p.arguments || '');
      const cmds = [...src.matchAll(/cmd"?:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => {
        try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
      });
      if (!cmds.length) { items.push({ ts, kind: 'tool', tool: p.name || 'tool', text: p.name || 'Using a tool' }); continue; }
      for (const cmd of cmds) {
        items.push({ ts, kind: 'tool', tool: 'shell', text: `Running ${clip(oneLine(cmd), 80)}`, nudges: findNudges(cmd, names), jiraKey: findJiraComment(cmd) });
      }
    }
  }
  return items;
}

const transcriptCache = new Map(); // file -> {key, pos, items, nk}
// A session log only grows: after the first read, only the new whole lines are parsed (not the 3 MB tail again).
async function parsedTranscript(file, kind, names) {
  const st = await fs.stat(file);
  const key = `${st.size}:${st.mtimeMs}`, nk = [...names].join(',');
  const hit = transcriptCache.get(file);
  if (hit && hit.key === key && hit.nk === nk) return hit.items;
  const again = hit && hit.nk === nk && st.size >= hit.pos && st.size - hit.pos < 3_000_000;
  const start = again ? hit.pos : Math.max(0, st.size - 3_000_000);
  const fh = await fs.open(file, 'r');
  let buf;
  try { buf = Buffer.alloc(st.size - start); await fh.read(buf, 0, buf.length, start); } finally { await fh.close(); }
  const end = buf.lastIndexOf(10) + 1; // whole lines only: a half-written line is read next time
  let text = buf.toString('utf8', 0, end);
  if (!again && start > 0) text = text.slice(text.indexOf('\n') + 1); // the first line of a tail is cut
  const fresh = text ? (kind === 'codex' ? parseCodex : parseClaude)(text.split('\n'), names) : [];
  const items = again ? (fresh.length ? hit.items.concat(fresh).slice(-4000) : hit.items) : fresh;
  transcriptCache.delete(file); transcriptCache.set(file, { key, pos: start + end, items, nk });
  capMap(transcriptCache, 200);
  return items;
}

async function claudeTranscript(account, term) {
  const dir = expand(account.configDir || '~/.claude');
  const pid = (term.foreground && term.foreground.pid) || term.pid;
  let sess = null;
  try { sess = await readJson(path.join(dir, 'sessions', `${pid}.json`)); } catch {}
  if (!sess) return null;
  const file = path.join(dir, 'projects', String(sess.cwd).replace(/[^a-zA-Z0-9]/g, '-'), `${sess.sessionId}.jsonl`);
  return existsSync(file) ? file : null;
}

const codexMeta = new Map(); // file -> cwd
async function codexTranscript(account, term) {
  const rootDir = path.join(expand(account.home || '~/.codex'), 'sessions');
  let best = null;
  for (let back = 0; back < 3; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const dir = path.join(rootDir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    let names = [];
    try { names = await fs.readdir(dir); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue;
      const f = path.join(dir, n);
      const st = await fs.stat(f);
      if (st.mtimeMs < (term.created_ms || 0) - 60_000) continue;
      if (!codexMeta.has(f)) {
        let cwd = '';
        try {
          const fh = await fs.open(f, 'r');
          const buf = Buffer.alloc(4096);
          const { bytesRead } = await fh.read(buf, 0, 4096, 0);
          await fh.close();
          const m = /"cwd"\s*:\s*"([^"]*)"/.exec(buf.toString('utf8', 0, bytesRead));
          if (m) cwd = m[1];
        } catch {}
        codexMeta.set(f, cwd); capMap(codexMeta, 500);
      }
      if (codexMeta.get(f) === term.cwd && (!best || st.mtimeMs > best.m)) best = { f, m: st.mtimeMs };
    }
  }
  return best && best.f;
}

// ---------------------------------------------------------------- memory, jira, trace
function parseMemory(raw) {
  const section = (title) => {
    const m = new RegExp(`^##\\s*${title}\\s*$([\\s\\S]*?)(?=^##\\s)`, 'mi').exec(raw + '\n## ');
    if (m) return m[1].split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
    const inline = new RegExp(`${title}:\\*{0,2}\\s*(.+?)(?=\\s+Waiting on:|$)`, 'mi').exec(raw);
    return inline ? [inline[1].replace(/\*\*/g, '').trim()] : [];
  };
  return { plate: section('On my plate'), waiting: section('Waiting on') };
}
async function loadMemory(slug) {
  const f = path.join(TEAM_DIR, 'memory', `${slug}.md`);
  try {
    const [raw, st] = await Promise.all([fs.readFile(f, 'utf8'), fs.stat(f)]);
    return { raw, updatedMs: st.mtimeMs, ...parseMemory(raw) };
  } catch { return null; }
}

let jira = { updatedMs: 0, error: null, byLabel: {} };
async function refreshJira(team) {
  // who holds each card is in ~/.omniloy-team/cards.json (team-card); Jira only gives status and title
  let cards = {}; try { cards = await readJson(path.join(HOME, '.omniloy-team', 'cards.json')); } catch {}
  const mine = new Set(team.personas.map((p) => p.herdrName));
  const held = Object.entries(cards).filter(([k, c]) => mine.has(c.owner) && /^[A-Z][A-Z0-9]+-\d+$/.test(k));
  const labels = [...mine];
  if (!held.length) { jira = { updatedMs: Date.now(), error: null, byLabel: Object.fromEntries(labels.map((l) => [l, []])) }; return; }
  const jql = `key in (${held.map(([k]) => k).slice(0, 90).join(', ')}) ORDER BY updated DESC`;
  const r = await run(TEAM_JIRA, ['search', jql, '100'], { timeout: 25000 });
  if (!r.ok) { jira = { ...jira, error: clip(oneLine(r.stderr) || 'Jira search failed', 200), updatedMs: Date.now() }; return; }
  const byLabel = Object.fromEntries(labels.map((l) => [l, []]));
  for (const line of r.stdout.split('\n')) {
    const [key, status, type, labs, ...rest] = line.split('\t');
    if (!key || !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) continue;
    const t = { key, status, type, summary: rest.join(' '), url: `${team.jira.site}/browse/${key}` };
    const c = cards[key]; if (c && c.waiting) t.status = `${t.status} · waiting`;
    if (c && byLabel[c.owner]) byLabel[c.owner].push(t);
  }
  jira = { updatedMs: Date.now(), error: null, byLabel };
}

function traceBucket(status) {
  const s = String(status || '').toUpperCase();
  if (s.startsWith('VERIFICADO')) return 'verified';
  if (s.startsWith('IMPLEMENTADO')) return 'built';
  if (s.startsWith('EN DESARROLLO')) return 'doing';
  if (s.startsWith('POR DESARROLLAR')) return 'todo';
  return 'other';
}
// Every traceability matrix on this machine: the team's own first (`own`), then the ones other
// teams keep (~/.omniloy-*/trace/<project>.json), so the whiteboard can show any of them.
async function loadTrace(team) {
  const out = [], seen = new Set(), mine = new Set(team.projects.filter((p) => p.trace).map((p) => p.id));
  let dirs = [];
  try { dirs = (await fs.readdir(HOME)).filter((d) => /^\.omniloy-/.test(d)).map((d) => path.join(HOME, d)); } catch {}
  dirs = [TEAM_DIR, ...dirs.filter((d) => d !== TEAM_DIR)];
  const names = new Map(), urls = new Map();
  for (const d of dirs) {
    try { for (const p of (await readJson(path.join(d, 'team.json'))).projects || []) { if (!names.has(p.id)) names.set(p.id, p.name); if (p.trace && p.trace.url && !urls.has(p.id)) urls.set(p.id, p.trace.url); } } catch {}
  }
  for (const dir of dirs) {
    let files = [];
    try { files = (await fs.readdir(path.join(dir, 'trace'))).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      const id = f.slice(0, -5);
      if (seen.has(id)) continue;
      try {
        const d = await readJson(path.join(dir, 'trace', f));
        const rows = (d.rows || []).filter((r) => r.tab === 'active');
        const counts = { todo: 0, doing: 0, built: 0, verified: 0, other: 0 };
        for (const r of rows) counts[traceBucket(r.status)]++;
        seen.add(id);
        out.push({ id, project: names.get(id) || d.project || id, own: mine.has(id), total: rows.length, counts, noVerif: rows.filter((r) => !(r.verif || []).length).length, built: d.built, url: urls.get(id) || '' });
      } catch {}
    }
  }
  return out.sort((a, b) => Number(b.own) - Number(a.own));
}

// Open pull requests in the team's repos, refreshed in the background. Each one is handed to the
// person who holds its Jira card (the key in the branch or title), is named in it, or whose label it has.
let prs = { at: 0, busy: false, list: [], merged: [], error: null };
let ghMe = ''; // the GitHub account `gh` is signed in as: the person, for "pull requests I review"
function ciState(roll) {
  const c = (roll || []).map((x) => String(x.conclusion || x.state || x.status || '').toUpperCase());
  if (c.some((x) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(x))) return 'failing';
  if (c.some((x) => ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING'].includes(x))) return 'running';
  return c.length ? 'passing' : '';
}
async function refreshPrs(team, force) { // true when it read GitHub (only then is there something new to show)
  if (prs.busy || (!force && Date.now() - prs.at < 180_000)) return false;
  prs.busy = true;
  try {
    const repos = [...new Set(team.projects.flatMap((p) => p.repos || []))], errors = [];
    if (!ghMe) { const r = await run('gh', ['api', 'user', '-q', '.login'], { timeout: 20000 }); if (r.ok) ghMe = r.stdout.trim(); }
    const me = ghMe;
    const projOf = (repo) => team.projects.filter((p) => (p.repos || []).includes(repo)).map((p) => p.name);
    const keys = new Set(team.projects.map((p) => p.jiraProject).filter(Boolean));
    // merged today (local day): so a pull request that closed is seen as closed, not just gone
    const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mergedP = Promise.all(repos.map(async (repo) => {
      const r = await run('gh', ['pr', 'list', '-R', repo, '--state', 'merged', '--search', `merged:>=${today}`, '--limit', '30', '--json', 'number,title,url,headRefName,mergedAt'], { timeout: 45000 });
      if (!r.ok) return [];
      try {
        return JSON.parse(r.stdout || '[]').map((x) => { const ticket = (`${x.headRefName} ${x.title}`.match(/[A-Z][A-Z0-9]+-\d+/) || [])[0] || '';
          return { repo: repo.split('/').pop(), projects: projOf(repo), number: x.number, title: x.title, url: x.url, ticket, mergedAt: x.mergedAt, team: keys.has(ticket.split('-')[0]) }; });
      } catch { return []; }
    }));
    const lists = await Promise.all(repos.map(async (repo) => {
      const r = await run('gh', ['pr', 'list', '-R', repo, '--state', 'open', '--limit', '40', '--json', 'number,title,author,isDraft,reviewDecision,url,labels,headRefName,statusCheckRollup,updatedAt,reviewRequests,latestReviews'], { timeout: 45000 });
      if (!r.ok) { errors.push(`${repo}: ${r.stderr.split('\n')[0]}`); return []; }
      try {
        return JSON.parse(r.stdout || '[]').map((x) => ({
          repo: repo.split('/').pop(), projects: projOf(repo), number: x.number, title: x.title, url: x.url, draft: !!x.isDraft, review: x.reviewDecision || ((x.latestReviews || []).some((r) => r.state === 'CHANGES_REQUESTED') ? 'CHANGES_REQUESTED' : (x.latestReviews || []).some((r) => r.state === 'APPROVED') ? 'APPROVED' : ''), // GitHub gives no decision when the repo does not require reviews: read each reviewer's last review
          ci: ciState(x.statusCheckRollup), labels: (x.labels || []).map((l) => l.name), branch: x.headRefName || '', updated: x.updatedAt,
          mine: !!me && (x.author || {}).login !== me && ((x.reviewRequests || []).some((r) => r.login === me) || (x.latestReviews || []).some((r) => (r.author || {}).login === me)), // asked to review it, or already did
        }));
      } catch { return []; }
    }));
    prs.list = lists.flat().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    prs.merged = (await mergedP).flat().sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)));
    prs.error = errors.length ? errors.slice(0, 2).join(' · ') : null;
  } finally { prs.busy = false; prs.at = Date.now(); }
  return true;
}
// changes | draft | failing | approved | review. A draft is not ready even when someone already approved it, so the
// draft state wins over CI and reviews (both stay readable in `ci` and `review`).
const prState = (x) => (x.review === 'CHANGES_REQUESTED' ? 'changes' : x.draft ? 'draft' : x.ci === 'failing' ? 'failing' : x.review === 'APPROVED' ? 'approved' : 'review');
let cardOwners = {}; // who holds each Jira card, kept by `team-card`
async function assignPrs(agents) {
  try { cardOwners = await readJson(path.join(HOME, '.omniloy-team', 'cards.json')); } catch { /* keep the last list */ }
  const all = prs.list.map((x) => {
    const key = (`${x.branch} ${x.title}`.match(/[A-Z][A-Z0-9]+-\d+/) || [])[0] || '';
    const holder = key && cardOwners[key] && cardOwners[key].owner;
    const a = agents.find((g) => holder && g.herdrName === holder)
      || agents.find((g) => key && (g.tickets || []).some((t) => t.key === key))
      || agents.find((g) => g.label && x.labels.includes(g.label))
      || agents.find((g) => !g.temp && g.name && x.title.includes(g.name.split(' ')[0]));
    return { repo: x.repo, projects: x.projects || [], number: x.number, title: x.title, url: x.url, state: prState(x), ci: x.ci, draft: x.draft, review: x.review, ticket: key, updated: x.updated, owner: a ? a.herdrName : '', mine: !!x.mine };
  });
  for (const g of agents) g.prs = all.filter((x) => x.owner === g.herdrName);
  return all;
}

// ---------------------------------------------------------------- state
let state = { ts: 0, agents: [], feed: [], trace: [], hcOk: true };
let stateJson = '';
const clients = new Set();
const lastStatus = new Map();
const statusEvents = [];
const youEvents = [];
let jiraAt = 0, cardsMtime = 0;

function mapStatus(t) {
  if (!t || t.state !== 'live') return 'offline';
  const s = t.status && t.status.state;
  if (s === 'working') return 'working';
  if (s === 'blocked' || s === 'error') return 'blocked';
  return 'idle';
}
function screenLines(text) {
  const lines = String(text).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.filter((l, i, a) => l || a[i - 1]).slice(-18).map((l) => l.slice(0, 110));
}

async function buildAgent(p, team, names, shared) {
  const hn = p.herdrName;
  const g = await run(HC, ['get', hn, '--json']);
  let term = null;
  if (g.ok) { try { term = JSON.parse(g.stdout); } catch {} }
  const status = mapStatus(term);
  const account = (team.accounts || []).find((a) => a.id === p.runtime) || {};
  const agent = {
    slug: p.slug, name: p.name, role: p.role, color: p.color, herdrName: hn, label: p.label,
    runtime: p.runtime, runtimeName: account.name || p.runtime, runtimeKind: account.kind || '',
    description: p.temp ? `Temp copy of ${p.of}, hired by ${p.hiredBy} for ${p.ticket}: ${p.task}${p.state === 'done' ? ' (says it is finished, waiting to be released)' : ''}` : await personaDescription(p.slug),
    temp: !!p.temp, of: p.of || '', lookSlug: p.agentSlug || p.slug,
    status, online: status !== 'offline',
    statusSince: term ? term.status_ms : 0,
    statusMsg: (term && term.status && term.status.msg) || '',
    address: term ? term.address : '', where: (term && term.labels && term.labels.where) || '',
    turn: term ? term.turn : 0, startedMs: term ? term.created_ms : 0,
    screen: [], activity: [], nowDoing: '', lastSaid: '', nudges: [], menu: null,
    memory: await withPlate(await loadMemory(p.slug), hn, shared),
    tickets: p.temp ? [Object.values(jira.byLabel).flat().find((t) => t.key === p.ticket) || { key: p.ticket, status: p.state === 'done' ? 'finished' : 'temp', type: '', summary: p.task, url: `${team.jira.site}/browse/${p.ticket}` }] : (jira.byLabel[p.herdrName] || []),
  };
  if (!agent.online) return agent;

  const [scr, file] = await Promise.all([
    run(HC, ['read', hn, '--lines', '40']),
    (account.kind === 'codex' ? codexTranscript(account, term) : claudeTranscript(account, term)).catch(() => null),
  ]);
  if (scr.ok) {
    agent.screen = screenLines(scr.stdout);
    const parsed = status === 'blocked' ? parseMenu(scr.stdout) : null;
    agent.menu = parsed ? menuInstance(term, parsed) : null;
  }
  let items = [];
  if (file) { try { items = await parsedTranscript(file, account.kind, names); } catch {} }
  // An id must not depend on where the item sits in the part of the file that was read: that part slides as the
  // file grows, and the page would take a message it has already shown for a new one and play it again.
  { const nth = new Map(); for (const it of items) { const n = nth.get(it.ts) || 0; nth.set(it.ts, n + 1); it.id = `${p.slug}:${it.ts}:${n}`; } }
  agent.activity = items.slice(-60).map(({ id, ts, kind, tool, text }) => ({ id, ts, kind, tool, text: clip(text, kind === 'tool' ? 160 : 1200) }));
  const lastSay = [...items].reverse().find((i) => i.kind === 'say');
  const lastAct = [...items].reverse().find((i) => i.kind !== 'inbox');
  agent.lastSaid = lastSay ? clip(lastSay.text, 600) : '';
  if (agent.menu && !agent.menu.said) agent.menu.said = saidOf(agent); // the agent's last words next to its question (For you, the phone, the Dev floor)
  agent.nowDoing = status === 'working'
    ? (agent.statusMsg || (lastAct ? clip(oneLine(lastAct.text), 120) : 'Thinking'))
    : status === 'blocked' ? (agent.statusMsg || 'Needs your answer in the terminal') : '';
  for (const it of items) {
    for (const n of it.nudges || []) agent.nudges.push({ id: `msg:${it.id}:${n.to}`, ts: it.ts, type: 'msg', from: hn, to: n.to, text: clip(n.text, 500) });
    if (it.jiraKey) agent.nudges.push({ id: `jira:${it.id}`, ts: it.ts, type: 'jira', from: hn, key: it.jiraKey, text: `commented on ${it.jiraKey}` });
  }
  return agent;
}

async function watchdogState(team) {
  let c = {}, w = {};
  try { c = await readJson(path.join(HOME, '.omniloy-team', 'watch-config.json')); } catch {}
  try { w = await readJson(path.join(HOME, '.omniloy-team', 'watch.json')); } catch {}
  // running: it checked recently (every `interval` s, 60 by default); error: it runs but cannot see the terminals
  const every = Math.max(60, Number((w.config || {}).interval) || 60) * 1000;
  return { on: !(c.paused || []).includes(team.name), running: !!w.checkedAt && Date.now() - w.checkedAt < Math.max(5 * 60_000, 3 * every), checkedAt: w.checkedAt || 0, error: w.error || '' };
}
// ---------------------------------------------------------------- card details (the wall board)
// Everything here is local files plus, on demand, one Jira read. Nothing asks a model: no tokens are spent.
const SHARED = path.join(HOME, '.omniloy-team');
const readJsonOr = async (f, d) => { try { return await readJson(f); } catch { return d; } };

// ---------------------------------------------------------------- theme
// The look of the rooms (public/js/themes), one setting for the whole building: { mode: 'fixed' | 'daily', theme }.
// It lives with the other building-wide settings in ~/.omniloy-team, so every floor reads the same file on each
// refresh and every open page follows within a few seconds. OFFICE_THEME_FILE points elsewhere (tests).
// 'daily' picks by the Europe/Madrid date, cycling every theme in order (Oficina first, then the registry's order).
// The themes are the page's own registry (public/js/themes/index.js: THEMES, and the file each name is imported
// from; a theme's id is its file name), so the server and the picker always know the same ones and a helper file in
// that folder is never taken for a theme.
const THEME_FILE = process.env.OFFICE_THEME_FILE || path.join(SHARED, 'office-theme.json');
let themeList = { at: 0, ids: ['oficina'] };
function themeRegistry(src) {
  const files = {}, list = /export\s+const\s+THEMES\s*=\s*\[([^\]]*)\]/.exec(src);
  for (const m of src.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]\.\/([a-z][a-z0-9-]*)\.js['"]/gm)) files[m[1]] = m[2];
  return list ? list[1].split(',').map((x) => files[x.trim()]).filter(Boolean) : [];
}
async function themeIds() {
  if (Date.now() - themeList.at < 60_000) return themeList.ids;
  let ids = [];
  try { ids = themeRegistry(await fs.readFile(path.join(ROOT, 'public', 'js', 'themes', 'index.js'), 'utf8')); } catch { /* none */ }
  ids = ['oficina', ...ids.filter((x) => x !== 'oficina')];
  themeList = { at: Date.now(), ids };
  return ids;
}
const madridDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
async function themeSetting() {
  const ids = await themeIds(), s = await readJsonOr(THEME_FILE, {}), day = madridDay();
  const mode = s && s.mode === 'daily' ? 'daily' : 'fixed', theme = s && ids.includes(s.theme) ? s.theme : 'oficina';
  let effective = theme;
  if (mode === 'daily') { const [y, m, d] = day.split('-').map(Number); effective = ids[Math.floor(Date.UTC(y, m - 1, d) / 864e5) % ids.length]; }
  return { mode, theme, effective, day };
}
async function saveTheme(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'a JSON object is expected' };
  const ids = await themeIds(), mode = body.mode === 'daily' ? 'daily' : body.mode === 'fixed' ? 'fixed' : '';
  if (!mode) return { error: 'mode is fixed or daily' };
  if (body.theme != null && typeof body.theme !== 'string') return { error: 'theme is a name' };
  const old = await themeSetting(), theme = body.theme == null || body.theme === '' ? old.theme : body.theme;
  if (!ids.includes(theme)) return { error: 'unknown theme' };
  const tmp = `${THEME_FILE}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(THEME_FILE), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify({ mode, theme, at: new Date().toISOString() }, null, 1));
  await fs.rename(tmp, THEME_FILE);
  return themeSetting();
}
// "On their plate" and "Waiting on" come from who holds which card (team-card) and from open requests,
// not from the memory file: its sections are free text and rarely match.
async function withPlate(memory, hn, shared) {
  const { cards, reqs } = shared || await plateFiles();
  const mine = Object.entries(cards).filter(([, c]) => c.owner === hn);
  const short = (t) => { t = String(t || '').replace(/\s*\[was shared by[^\]]*\]/, ''); return t.length > 90 ? `${t.slice(0, 88)}…` : t; };
  const plate = mine.filter(([, c]) => !c.waiting).map(([k, c]) => `**${k}** ${short(c.title)}`);
  const waiting = mine.filter(([, c]) => c.waiting).map(([k, c]) => `**${k}** ${short(c.waiting.on)}`);
  const held = new Set(mine.map(([k]) => k));
  for (const x of reqs.items || []) if (x.status === 'open' && x.kind === 'request' && x.from === hn && !held.has(x.ticket)) waiting.push(`**#${x.id}** ${x.to === '__OWNER_ID__' || !x.to ? 'you' : x.to}: ${short(x.title)}`);
  return { ...(memory || { raw: '', updatedMs: 0 }), plate, waiting };
}
const plateFiles = async () => { const [cards, reqs] = await Promise.all([readJsonOr(path.join(SHARED, 'cards.json'), {}), readJsonOr(path.join(SHARED, 'requests.json'), {})]); return { cards, reqs }; };
let doneCache = { at: 0, today: [], week: [] };
async function doneCards(team) {
  if (Date.now() - doneCache.at < 300_000) return doneCache;
  const projects = [...new Set((team.projects || []).map((p) => p.jiraProject).filter(Boolean))];
  if (!projects.length) return doneCache;
  const q = async (since) => {
    const r = await run(TEAM_JIRA, ['search', `project in (${projects.join(', ')}) AND ((statusCategory = Done AND statusCategoryChangedDate >= ${since}) OR (status = Validation AND status CHANGED TO Validation AFTER ${since})) ORDER BY updated DESC`, '2000'], { timeout: 90000, maxBuffer: 16e6 });
    if (!r.ok) return null;
    return r.stdout.split('\n').map((l) => l.split('\t')).filter((x) => /^[A-Z][A-Z0-9]+-\d+$/.test(x[0] || '')).map(([key, status, type, , ...rest]) => ({ key, status, type, title: rest.join(' ') }));
  };
  const [today, week] = await Promise.all([q('startOfDay()'), q('-7d')]);
  if (today && week) doneCache = { at: Date.now(), today, week };
  return doneCache;
}
// cards whose holder finished and only the person's approval or merge is missing (team-card approval)
async function approvalCards(team) {
  const mine = new Set(team.personas.map((p) => p.herdrName));
  const cards = await readJsonOr(path.join(SHARED, 'cards.json'), {});
  return Object.entries(cards).filter(([, c]) => mine.has(c.owner) && c.waiting && c.waiting.kind === 'approval')
    .map(([key, c]) => ({ key, owner: c.owner, on: c.waiting.on, since: c.waiting.since, title: c.title || '' })).sort((a, b) => String(a.since).localeCompare(String(b.since)));
}
async function cardList(team) {
  const mine = new Set(team.personas.map((p) => p.herdrName));
  const [cards, watch, done] = await Promise.all([readJsonOr(path.join(SHARED, 'cards.json'), {}), readJsonOr(path.join(SHARED, 'watch.json'), {}), doneCards(team)]);
  const known = new Map(Object.values(jira.byLabel || {}).flat().map((t) => [t.key, t]));
  const caught = new Set(Object.entries(watch.agents || {}).flatMap(([, a]) => (a.stall && a.stall.cards) || []));
  const open = Object.entries(cards).filter(([, c]) => mine.has(c.owner)).map(([key, c]) => ({
    key, title: (known.get(key) || {}).summary || c.title || '', status: ((known.get(key) || {}).status || '').replace(/ · waiting$/, ''),
    owner: c.owner, since: c.since, waiting: c.waiting ? c.waiting.on : '', waitingSince: c.waiting ? c.waiting.since : '', approval: !!(c.waiting && c.waiting.kind === 'approval'), caught: caught.has(key),
  })).sort((a, b) => String(b.since).localeCompare(String(a.since)));
  return { open, doneToday: done.today, doneWeek: done.week, doneAt: done.at };
}
const detailCache = new Map(); // key -> {at, jira}
async function cardDetail(key, team) {
  const [cards, reqs, watch] = await Promise.all([readJsonOr(path.join(SHARED, 'cards.json'), {}), readJsonOr(path.join(SHARED, 'requests.json'), {}), readJsonOr(path.join(SHARED, 'watch.json'), {})]);
  let log = [];
  try { log = (await tail(path.join(SHARED, 'cards-log.jsonl'), 2_000_000)).filter((l) => l.includes(`"${key}"`)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.key === key); } catch {}
  let j = detailCache.get(key);
  if (!j || Date.now() - j.at > 60_000) {
    const r = await run(TEAM_JIRA, ['get', key], { timeout: 25000 });
    let info = { error: r.ok ? '' : clip(oneLine(r.stderr) || 'Jira read failed', 200) };
    if (r.ok) {
      const out = r.stdout, head = out.split('\n')[0] || '', m = /^(\S+) \[([^\]]*)\] (.*)$/.exec(head) || [];
      const parts = out.split(/^--- (\d{4}-\d\d-\d\dT\d\d:\d\d) ---$/m);
      const top = parts[0], comments = [];
      for (let i = 1; i < parts.length; i += 2) comments.push({ at: parts[i], text: (parts[i + 1] || '').trim().slice(0, 3000) });
      info = { type: m[2] || '', title: m[3] || '', status: (/^Status: (.*?)  Labels:/m.exec(top) || [])[1] || '', description: (top.split('--- Description ---')[1] || '').trim().slice(0, 6000),
        links: top.split('\n').filter((l) => /^(Parent|Link):/.test(l)), comments: comments.slice(-5).reverse(), commentCount: comments.length };
    }
    j = { at: Date.now(), info }; detailCache.set(key, j);
  }
  return {
    key, url: `${team.jira.site}/browse/${key}`, card: cards[key] || null, log: log.slice(-40),
    requests: (reqs.items || []).filter((x) => x.ticket === key).slice(-8).map((x) => ({ id: x.id, kind: x.kind, from: x.from, to: x.to || '__OWNER_ID__', title: x.title, status: x.status, answer: x.answer, created: x.created })),
    prs: prs.list.filter((x) => `${x.branch} ${x.title}`.includes(key)).map((x) => ({ repo: x.repo, number: x.number, title: x.title, url: x.url, state: prState(x) })),
    caught: (watch.events || []).filter((e) => (e.cards || []).includes(key)).slice(-5).map((e) => ({ ts: e.ts, agent: e.agent, idleMin: e.idleMin })),
    jira: j.info,
  };
}
// Tokens per card, estimated from the transcripts already on disk: each turn's usage is shared between the
// cards that turn mentions. Claude agents only (Codex keeps its usage in another format).
const tokCache = new Map(); // file -> {key, turns}
let KEY_RE = null;
async function keyRe() {
  if (KEY_RE) return KEY_RE;
  const pre = new Set();
  for (const d of ['.omniloy-team']) for (const p of ((await readJsonOr(path.join(HOME, d, 'team.json'), {})).projects || [])) if (p.jiraProject) pre.add(p.jiraProject);
  KEY_RE = new RegExp(`\\b(?:${[...pre].join('|') || 'NOKEY'})-\\d+\\b`, 'g');
  return KEY_RE;
}
async function tokenTurns(file) {
  const st = await fs.stat(file), ck = `${st.size}:${st.mtimeMs}`, hit = tokCache.get(file);
  if (hit && hit.key === ck) return hit.turns;
  const re = await keyRe(), turns = [], seen = new Set();
  let cur = { keys: new Set(), io: 0, cr: 0 };
  const rl = (await import('node:readline')).createInterface({ input: (await import('node:fs')).createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const isUser = line.includes('"type":"user"'), isAsst = line.includes('"type":"assistant"');
    if (!isUser && !isAsst) continue;
    if (isUser && !line.includes('"tool_result"') && line.includes('"role":"user"')) { if (cur.io || cur.cr) turns.push({ keys: [...cur.keys], io: cur.io, cr: cur.cr }); cur = { keys: new Set(), io: 0, cr: 0 }; }
    for (const m of line.match(re) || []) cur.keys.add(m);
    if (isAsst) {
      const id = (/"id":"(msg_[^"]+)"/.exec(line) || [])[1];
      if (id && seen.has(id)) continue; if (id) seen.add(id);
      const n = (k) => Number((new RegExp(`"${k}":(\\d+)`).exec(line) || [])[1] || 0);
      cur.io += n('input_tokens') + n('output_tokens') + n('cache_creation_input_tokens'); cur.cr += n('cache_read_input_tokens');
    }
  }
  if (cur.io || cur.cr) turns.push({ keys: [...cur.keys], io: cur.io, cr: cur.cr });
  tokCache.set(file, { key: ck, turns }); capMap(tokCache, 300);
  return turns;
}
async function cardTokens(key) {
  const folder = TEAM_DIR.replace(/[^a-zA-Z0-9]/g, '-'), files = [];
  for (const root of ['.claude', '.claude-personal']) {
    const dir = path.join(HOME, root, 'projects', folder);
    try { for (const n of await fs.readdir(dir)) { if (!n.endsWith('.jsonl')) continue; const f = path.join(dir, n), st = await fs.stat(f); if (Date.now() - st.mtimeMs < 21 * 864e5) files.push(f); } } catch {}
  }
  let io = 0, cr = 0, turns = 0;
  for (const f of files) { try { for (const t of await tokenTurns(f)) if (t.keys.includes(key)) { io += t.io / t.keys.length; cr += t.cr / t.keys.length; turns++; } } catch {} }
  return { key, tokens: Math.round(io), cacheRead: Math.round(cr), turns, files: files.length };
}

// The superadmin (Zeus, ~/.omniloy-admin) sits on no floor. The Dev floor watches him too (one `hc get` per round), so
// a question he waits on in his terminal reaches For you and the phone, and can be answered from there.
const ADMIN_DIR = path.join(HOME, '.omniloy-admin');
async function adminPersona() {
  const t = await readJsonOr(path.join(ADMIN_DIR, 'team.json'), null), list = (t && t.personas) || [];
  return list.find((x) => x.herdrName === t.lead) || list[0] || null;
}
let admin = null; // { herdrName, name, status, menu, address, ... } or null
async function refreshAdmin() {
  if (process.env.TEAM_DIR) return;
  const p = await adminPersona();
  if (!p || !p.herdrName) { admin = null; return; }
  const g = await run(HC, ['get', p.herdrName, '--json']);
  let t = null; if (g.ok) { try { t = JSON.parse(g.stdout); } catch {} }
  const status = mapStatus(t);
  const a = { slug: p.slug || p.herdrName, herdrName: p.herdrName, name: p.name || p.herdrName, role: p.role || 'Superadmin', color: p.color || '#fbbf24', admin: true,
    status, statusSince: t ? t.status_ms : 0, statusMsg: (t && t.status && t.status.msg) || '', address: t ? t.address : '', turn: t ? t.turn : 0, menu: null, lastSaid: '' };
  if (status === 'blocked') {
    const r = await run(HC, ['read', p.herdrName, '--lines', '40']);
    const parsed = r.ok ? parseMenu(r.stdout) : null;
    a.menu = parsed ? menuInstance(t, parsed) : null;
    if (a.menu && !a.menu.said) a.menu.said = saidOf(a);
  }
  admin = a;
}

let refreshing = false, dirty = false;
let lastRefreshError = '';
async function refresh() {
  if (refreshing) { dirty = true; return; }
  refreshing = true;
  try {
    let team;
    try { team = await loadTeam(); if (!Array.isArray(team.personas)) throw new Error('it has no "personas" list'); } catch (e) { // the room would be empty with no word why: say it on the page
      const teamError = `This floor's team.json (${TEAM_DIR.replace(HOME, '~')}/team.json) cannot be read: ${clip(oneLine(e.message), 160)}. Fix it and the room fills in by itself.`;
      if (state.teamError !== teamError) { state = { ...state, ts: Date.now(), teamError }; stateJson = ''; const msg = `event: state\ndata: ${JSON.stringify(state)}\n\n`; for (const res of clients) res.write(msg); }
      throw e;
    }
    const names = new Set(team.personas.map((p) => p.herdrName));
    // only a real GitHub read schedules another round: scheduling one after every refresh made the floor refresh
    // ~4 times a second forever (hc ls + hc get/read per person each time)
    refreshPrs(team).then((read) => { if (read) scheduleRefresh(); }).catch(() => {});
    // a card taken, passed or created (cards.json changed) is looked up at once, not on the next 90 s round: until then it
    // shows only its short local title and no status
    const cm = (await fs.stat(path.join(HOME, '.omniloy-team', 'cards.json')).catch(() => null))?.mtimeMs || 0;
    if (Date.now() - jiraAt > 90_000 || (cm !== cardsMtime && Date.now() - jiraAt > 3000)) { jiraAt = Date.now(); cardsMtime = cm; refreshJira(team).then(scheduleRefresh).catch(() => {}); }
    const probe = await run(HC, ['ls', '--json']);
    const plates = await plateFiles();
    const agents = await Promise.all(team.personas.map((p) => buildAgent(p, team, names, plates)));
    await refreshAdmin().catch(() => {});
    floorAddrs = new Set([...agents, ...(admin ? [admin] : [])].map((a) => a.address).filter(Boolean));
    const now = Date.now();
    for (const a of agents) {
      const prev = lastStatus.get(a.slug);
      if (prev && prev !== a.status) statusEvents.push({ id: `st:${a.slug}:${now}`, ts: now, type: 'status', from: a.herdrName, status: a.status, prev });
      lastStatus.set(a.slug, a.status);
    }
    if (statusEvents.length > 120) statusEvents.splice(0, statusEvents.length - 120);
    // the watchdog (team-watch) caught someone stopped while it was their move: the room shows a lightning bolt
    let zaps = [];
    try { zaps = ((await readJson(path.join(HOME, '.omniloy-team', 'watch.json'))).events || []).filter((e) => names.has(e.agent))
      .map((e) => ({ id: e.id, ts: e.ts, type: 'zap', from: e.agent, to: e.to, text: e.text ? clip(e.text, 160) : `stopped ${e.idleMin} min holding ${[...(e.cards || []), ...(e.requests || [])].slice(0, 4).join(', ')}` })); } catch {}
    const feed = [...statusEvents, ...youEvents, ...zaps, ...agents.flatMap((a) => a.nudges)].sort((x, y) => x.ts - y.ts).slice(-150);
    agents.forEach((a) => delete a.nudges);
    const next = {
      agents, feed, approvals: await approvalCards(team), watchdog: await watchdogState(team), trace: await loadTrace(team), hcOk: probe.ok,
      prs: await assignPrs(agents), prsError: prs.error, prsAt: prs.at, prsMerged: prs.merged,
      team: { name: await spaceName(team) }, theme: await themeSetting(),
      jira: { site: team.jira && team.jira.site, error: jira.error, updatedMs: jira.updatedMs },
      projects: team.projects.map((p) => ({ id: p.id, name: p.name, key: p.jiraProject })),
    };
    lastRefreshError = '';
    const json = JSON.stringify(next);
    if (json !== stateJson) {
      stateJson = json;
      state = { ts: now, ...next };
      const msg = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
      for (const res of clients) res.write(msg);
    }
  } catch (e) {
    if (e.message !== lastRefreshError) console.error('refresh failed:', e.message); // once per new reason, not every 2.5 s
    lastRefreshError = e.message;
  } finally {
    refreshing = false;
    if (dirty) { dirty = false; scheduleRefresh(); }
  }
}
let timer = null;
function scheduleRefresh() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; refresh(); }, 150);
}

// Herdr pushes a line whenever a terminal changes; use it to refresh right away, but only for this floor's own
// terminals (every floor hears every terminal) and not for a title change (a spinner in the tab title, many a second).
// Anything else (a terminal not seen yet) waits for the 2.5 s round.
let eventsProc = null, floorAddrs = new Set();
function concerns(line) {
  let d; try { d = JSON.parse(line); } catch { return false; }
  const ev = d && d.params;
  return !!(ev && ev.terminal && ev.type !== 'title' && floorAddrs.has(ev.terminal));
}
function followEvents() {
  eventsProc = spawn(HC, ['events', '--json'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let pend = '';
  eventsProc.stdout.on('data', (c) => {
    const lines = (pend + c).split('\n'); pend = lines.pop();
    if (pend.length > 1_000_000) pend = ''; // a line that never ends is not an event
    if (lines.some(concerns)) scheduleRefresh();
  });
  eventsProc.on('error', () => {});
  eventsProc.on('exit', () => { eventsProc = null; setTimeout(followEvents, 3000).unref(); });
}
process.on('exit', () => eventsProc && eventsProc.kill());
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));

// ---------------------------------------------------------------- http
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

// Backups and leftovers next to the real files (x.js.bak-20261119, x.orig, x~, .DS_Store) are never served.
const HIDDEN = /(^|\/)\.|\.bak|\.orig$|\.rej$|\.tmp$|~$/i;
async function serveFile(res, rootDir, rel, cache) {
  const file = path.normalize(path.join(rootDir, rel));
  if (!file.startsWith(rootDir + path.sep)) return json(res, 403, { error: 'forbidden' });
  if (HIDDEN.test(path.relative(rootDir, file))) return json(res, 404, { error: 'not found' });
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': cache });
    createReadStream(file).pipe(res);
  } catch { json(res, 404, { error: 'not found' }); }
}
// A body over 64 KB (or not JSON) is a 400 once it has arrived, not a closed connection; past 1 MB the connection is cut.
// The floors of this building for the page (building view, phone "Switch office", #go= links): the hub's list
// (floors.json, else the defaults), with each floor's head count. The page has no ports of its own.
async function floorList() {
  return Promise.all(OFFICES.map(async (o) => { const t = await readJsonOr(path.join(HOME, o.dir, 'team.json'), null); return { name: o.name, port: o.port, people: t && Array.isArray(t.personas) ? t.personas.length : 0 }; }));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '', n = 0, big = false;
    req.on('data', (c) => { n += c.length; if (big) { if (n > 1e6) req.destroy(); return; } s += c; if (s.length > 64_000) { big = true; s = ''; } });
    req.on('end', () => {
      if (big) return reject(Object.assign(new Error('the body is too large'), { status: 400 }));
      try { resolve(JSON.parse(s || '{}')); } catch { reject(Object.assign(new Error('the body is not JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
// Pending requests for __OWNER__ (written by `team-ask`); the office shows them and can answer.
let roster = { at: 0, by: {} };
async function everyone() { // the people of every floor (and the superadmin), read again every 30 s at most
  if (Date.now() - roster.at < 30_000) return roster.by;
  const by = {};
  for (const o of OFFICES) for (const f of ['team.json', 'temps.json']) {
    try { const d = JSON.parse(await fs.readFile(path.join(HOME, o.dir, f), 'utf8')); for (const q of (Array.isArray(d) ? d : d.personas) || []) if (q && q.herdrName && !by[q.herdrName]) by[q.herdrName] = q; } catch { /* no such file on that floor */ }
  }
  const z = await adminPersona(); if (z && z.herdrName && !by[z.herdrName]) by[z.herdrName] = z;
  roster = { at: Date.now(), by };
  return by;
}
const TEAM_ASK = bin('team-ask');
// Free text passed to a tool as an argument: the tools read anything that starts with "--" as an option, so an answer
// like "--no, wait" would be refused. A zero-width space in front keeps it text and is invisible.
const argText = (t) => (/^-/.test(t) ? `\u200b${t}` : t);
const shortName = (n) => { const m = /^(\S+) (\d+) \(temp\)/.exec(String(n)); return m ? `${m[1]} ${m[2]}` : String(n).split(' ')[0]; }; // a temp keeps its number: "Nora 3"
async function loadRequests() {
  let items = [];
  // every team shares one requests store (team-ask); another team's office shows only its own people's
  try { items = JSON.parse(await fs.readFile(path.join(HOME, '.omniloy-team', 'requests.json'), 'utf8')).items || []; } catch { /* none yet */ }
  const team = await loadTeam();
  if (process.env.TEAM_DIR) { const mine = new Set(team.personas.map((p) => p.herdrName)); items = items.filter((x) => mine.has(x.from)); }
  const open = items.filter((x) => x.status === 'open');
  const elsewhere = process.env.TEAM_DIR ? {} : await everyone(); // people of the other floors (this floor lists everyone's requests)
  const menus = state.agents.filter((a) => a.status === 'blocked' && a.menu).map((a) => menuItem(a, a.menu, { said: saidOf(a), created: a.statusSince }));
  if (admin && admin.status === 'blocked' && admin.menu) menus.unshift(menuItem(admin, admin.menu, { said: saidOf(admin), created: admin.statusSince }));
  // The Dev floor lists every floor's requests, so it lists every floor's terminal menus too (each floor writes its
  // own to push/local-<port>.json, see hub.mjs); answering them works from here (hc reaches every terminal).
  if (!process.env.TEAM_DIR) for (const o of OFFICES) {
    if (o.port === PORT) continue;
    let d = null; try { d = JSON.parse(await fs.readFile(path.join(HOME, '.omniloy-team', 'push', `local-${o.port}.json`), 'utf8')); } catch { /* that floor is not running */ }
    if (!d || Date.now() - d.ts > 30_000) continue;
    for (const x of d.items || []) if (x.menu && x.menu.id && !menus.some((m) => m.from === x.from)) menus.push(menuItem({ herdrName: x.from, name: x.name || x.who, role: x.role, color: x.color }, x.menu, { said: x.menu.said, created: x.created, floor: o.name }));
  }
  const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD here, like team-ask's times
  const mineDone = (x) => x.status !== 'open' && (x.to || '__OWNER_ID__') === '__OWNER_ID__' && String(x.answeredAt || '').slice(0, 10) === today;
  const person = (x) => team.personas.find((q) => q.herdrName === x.from) || elsewhere[x.from] || {};
  return {
    site: team.jira && team.jira.site,
    withLucia: open.filter((x) => x.to === (team.lead || 'lucia')).length,
    // a question waiting in a terminal blocks its agent: those go first
    items: menus.concat(open.filter((x) => (x.to || '__OWNER_ID__') === '__OWNER_ID__').map((x) => {
      const p = person(x);
      return { id: x.id, kind: x.kind, from: x.from, name: x.ext ? x.from : shortName(p.name || x.from), role: p.role || '', color: p.color || '#888', via: x.via || '',
        title: x.title, body: x.body, ticket: x.ticket, options: x.options || [], created: x.created };
    })),
    // answered today (requests and terminal menus, team-ask menu-log): For you shows them folded under "Respondidas hoy"
    answered: items.filter(mineDone).reverse().slice(0, 30).map((x) => {
      const p = person(x);
      return { id: x.id, kind: x.kind, menu: !!x.menu, from: x.from, name: x.ext ? x.from : shortName(p.name || x.from), color: p.color || '#888', status: x.status,
        title: x.title, body: x.menu ? x.body : '', answer: x.answer || '', answeredAt: x.answeredAt, answeredVia: x.answeredVia || '' };
    }),
  };
}
// One terminal menu as an item of For you: what it asks (a readable title, the question as written, the context
// box: tool, command, file, diff), the agent's last words, and the options.
const saidOf = (a) => {
  if (a.statusMsg && a.statusMsg !== (a.menu && a.menu.question)) return clip(oneLine(maskSecrets(a.statusMsg)), 300);
  if (a.menu && a.menu.said) return clip(oneLine(maskSecrets(a.menu.said)), 300); // what is on the screen above the question
  const t = String(a.lastSaid || '').trim().split(/\n\s*\n/).pop();
  return t ? clip(oneLine(maskSecrets(t)), 300) : '';
};
function menuItem(p, m, { said = '', created = 0, floor = '' } = {}) {
  return { id: `menu:${p.herdrName}`, kind: 'request', from: p.herdrName, name: shortName(p.name || p.herdrName), role: p.role || '', color: p.color || '#888',
    title: m.title || m.question, question: m.question, context: m.context || [], said, body: '', options: m.options, menuId: m.id, terminalId: m.terminalId,
    notifyId: `menu:${p.herdrName}:${m.id}`, created: new Date(created || Date.now()).toISOString(), menu: true, floor };
}
const personaByName = async (name) => (await loadTeam()).personas.find((p) => p.herdrName === name);

const freeMenu = (label) => /type something|tell (Claude|Codex)|chat about this/i.test(label);
async function anyPersona(name) { // someone on this floor, or on another one (the Dev floor answers every floor's menus)
  const mine = await personaByName(name); if (mine) return mine;
  for (const o of OFFICES) for (const f of ['team.json', 'temps.json']) {
    try { const d = JSON.parse(await fs.readFile(path.join(HOME, o.dir, f), 'utf8')); const q = ((Array.isArray(d) ? d : d.personas) || []).find((x) => x && x.herdrName === name); if (q) return q; } catch { /* no such file on that floor */ }
  }
  const z = await adminPersona(); // the superadmin's own menus are answered from the office too
  return z && z.herdrName === name ? z : null;
}
async function liveMenu(name) {
  if (!(await anyPersona(name))) return { ok: false, menu: null };
  const g = await run(HC, ['get', name, '--json']);
  let t = null; try { t = JSON.parse(g.stdout); } catch {}
  if (!g.ok || !t) return { ok: false, menu: null };
  if (!t.status || !['blocked', 'error'].includes(t.status.state)) return { ok: true, menu: null }; // not waiting on anything
  const r = await run(HC, ['read', name, '--lines', '40']);
  const parsed = r.ok ? parseMenu(r.stdout) : null;
  return r.ok ? { ok: true, menu: parsed ? menuInstance(t, parsed) : null, terminalId: terminalId(t) } : { ok: false, menu: null };
}
const menuAnswers = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Answer a terminal menu: press its digit once (never twice), then watch the screen for up to ~4 s. The menu gone,
// or another one in its place (Claude often asks the next permission right away), is a success; only the same menu
// still there is not. Each answer is logged in requests.json (team-ask menu-log) so it stays in the history.
async function answerMenu(body) {
  const id = String(body.id || ''), name = id.slice('menu:'.length);
  if (menuAnswers.has(name)) return { code: 409, body: { error: 'Another answer to this person is already on its way.' } };
  const lock = Symbol(name); menuAnswers.set(name, lock);
  try {
    const live = await liveMenu(name), menu = live.menu;
    if (!live.ok || !menu || menu.id !== String(body.menuId || '') || live.terminalId !== String(body.terminalId || '')) return { code: 409, body: { error: 'That question is no longer on the screen (already answered, or it changed).', stale: true } };
    const label = String(body.text || '').trim(), m = /^(?:([1-9])\.\s)/.exec(label), digit = m && m[1];
    if (!digit || !menu.options.includes(label)) return { code: 400, body: { error: 'That option is no longer on screen.' } };
    const key = await run(HC, ['keys', name, digit], { timeout: 30000 });
    if (!key.ok) return { code: 502, body: { error: clip(oneLine(key.stderr || key.stdout), 240) || 'Could not press that option.' } };
    const started = Date.now();
    let after = null, goneAt = 0;
    while (Date.now() - started < 4000) {
      await sleep(300);
      const r = await liveMenu(name);
      if (!r.ok) continue;
      after = r;
      if (r.menu && r.menu.id !== menu.id) break; // the next question
      if (!r.menu) { if (!goneAt) goneAt = Date.now(); else if (Date.now() - goneAt > 1200) break; } // gone; a follow-up comes within a second
      else goneAt = 0;
    }
    if (!after) return { code: 502, body: { error: `Pressed ${digit}, but the screen could not be read afterwards; check it on Live screen.`, pressed: true } };
    if (after.menu && after.menu.id === menu.id) return { code: 409, body: { error: `Pressed ${digit}, but the same question is still on the screen; check it on Live screen.`, pressed: true } };
    const next = after.menu || null;
    const message = String(body.message || '').trim(), sent = !!message && freeMenu(label) && !next;
    if (sent) {
      // look once more right before typing with --force: if a new question came up meanwhile, the text would answer it
      const now = await liveMenu(name);
      if (!now.ok || now.menu) return { code: 409, body: { error: `Pressed ${digit}, but ${now.ok ? 'a new question is on the screen' : 'the screen could not be read'}: your text was not sent. Check it on Live screen.`, pressed: true } };
      const r = await run(HC, ['send', '--json', '--force', name, '--', message], { timeout: 120000 }); // --force: after the free option they sit in its text box, which hc counts as blocked
      if (!r.ok) return { code: 502, body: { error: clip(oneLine(r.stderr || r.stdout), 240) || 'The follow-up text was not sent.', pressed: true } };
    }
    // the picture changes now, not at the next refresh: a poll right after this must not bring the old card back
    const a = state.agents.find((x) => x.herdrName === name);
    if (a) { a.menu = next; if (!next && a.status === 'blocked') { a.status = 'working'; a.nowDoing = 'Working'; } }
    const p = (await anyPersona(name)) || { herdrName: name };
    const created = a && a.statusSince ? new Date(a.statusSince - new Date(a.statusSince).getTimezoneOffset() * 60000).toISOString().slice(0, 19) : ''; // local time, like team-ask
    const via = ['office', 'phone', 'chat'].includes(body.via) ? body.via : 'office';
    const log = await run(TEAM_ASK, ['menu-log', '--from', name, '--title', clip(menu.title || menu.question, 200), '--answer', label, '--body', clip((menu.context || []).join('\n'), 1500),
      '--via', via, '--menu-id', menu.id, ...(created ? ['--created', created] : [])], { timeout: 15000 });
    scheduleRefresh();
    return { code: 200, body: { ok: true, gone: !next, sent, logged: log.ok, answered: { from: name, title: menu.title || menu.question, answer: label },
      next: next ? menuItem({ ...p, herdrName: name }, next, { said: a ? saidOf(a) : '', created: Date.now() }) : null } };
  } finally {
    if (menuAnswers.get(name) === lock) menuAnswers.delete(name);
  }
}

// Why a message did not reach someone, in words the owner can act on: "not running" only when that is the case.
function notSent(name, stderr) {
  const a = state.agents.find((x) => x.herdrName === name) || (admin && admin.herdrName === name ? admin : null);
  const who = a ? shortName(a.name || name) : name;
  if (a && a.status === 'offline') return `${who} is not running in Herdr`;
  if (a && a.status === 'blocked') return `${who} is waiting on a question in the terminal${a.menu ? ` ("${clip(oneLine(a.menu.title || a.menu.question), 80)}")` : ''}: answer it first (For you or Live screen), then send again`;
  return clip(oneLine(stderr) || `could not send to ${who}`, 240);
}
async function deliver(name, text) {
  const started = Date.now();
  const p = run(HC, ['send', '--json', name, '--', text], { timeout: 120_000 });
  const first = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), 12_000))]);
  if (!first) { // still typing after 12 s: the page hears "queued" now, so a late failure must not lose the text
    p.then((late) => { if (!late.ok) run(bin('team-deliver'), [name, text, '--source', 'office'], { timeout: 30_000 }).catch(() => {}); }).catch(() => {});
  }
  if (first && !first.ok) {
    const a = state.agents.find((x) => x.herdrName === name);
    if (a && a.status === 'blocked') { // on a menu: kept in the outbox and typed in once it is answered (team-deliver), like a request answer
      const q = await run(bin('team-deliver'), [name, text, '--source', 'office'], { timeout: 30_000 });
      if (q.ok && /^(queued|delivered)/.test(q.stdout.trim())) return { name, ok: true, queued: q.stdout.trim().startsWith('queued'), held: true };
    }
    return { name, ok: false, error: notSent(name, first.stderr) };
  }
  youEvents.push({ id: `you:${name}:${started}`, ts: started, type: 'you', from: '__OWNER_ID__', to: name, text: clip(text, 500) });
  if (youEvents.length > 80) youEvents.shift();
  scheduleRefresh();
  return { name, ok: true, queued: !first };
}

// The phone: the server still listens on this machine only. `tailscale serve` forwards
// https://<this mac's Tailscale name>:<PORT> to it and says which Tailscale account is asking; only the name and
// the accounts listed in ~/.omniloy-team/remote.json get in. Delete that file (and restart) to close the door.
let REMOTE = null;
try { REMOTE = JSON.parse(await fs.readFile(path.join(os.homedir(), '.omniloy-team', 'remote.json'), 'utf8')); } catch { /* no phone access */ }
function remoteOk(req, host) {
  if (!REMOTE || !REMOTE.host || !Array.isArray(REMOTE.logins)) return false;
  if (host.split(':')[0].toLowerCase() !== String(REMOTE.host).toLowerCase()) return false;
  const who = String(req.headers['tailscale-user-login'] || '').toLowerCase();
  return !!who && REMOTE.logins.some((l) => String(l).toLowerCase() === who);
}

// What waits for __OWNER__ in every office, and the phone notifications (hub.mjs).
const hub = createHub({ port: PORT, stuck: () => [...state.agents.filter((x) => x.status === 'blocked'), ...(admin && admin.status === 'blocked' && admin.menu ? [admin] : [])], agents: () => state.agents, theme: themeSetting });

const term = createTerm({ teamDir: TEAM_DIR, owner: '__OWNER__' }); // the room's terminal (term.mjs): the owner's page only

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const host = String(req.headers.host || '');
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}` && !remoteOk(req, host)) return json(res, 403, { error: 'bad host' });
  const p = url.pathname;
  try {
    if (p === '/' || p === '/index.html') {
      const html = (await fs.readFile(path.join(ROOT, 'public', 'index.html'), 'utf8')).replace('%%OFFICE_TOKEN%%', TOKEN).replace('%%OFFICE_THEME%%', (await themeSetting()).effective)
        .replace('</head>', `<script>window.__FLOORS__ = ${JSON.stringify(await floorList()).replace(/</g, '\\u003c')};</script></head>`);
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      return res.end(html);
    }
    if (p === '/health') return json(res, 200, { ok: true, app: 'team-office' });
    if (p.startsWith('/vendor/three/')) {
      const rel = p.slice('/vendor/three/'.length);
      if (!/^(build|examples\/jsm)\//.test(rel)) return json(res, 403, { error: 'forbidden' });
      return serveFile(res, path.join(ROOT, 'node_modules', 'three'), rel, 'max-age=86400');
    }
    if (!p.startsWith('/api/')) return serveFile(res, path.join(ROOT, 'public'), p.slice(1), 'no-store');

    const token = req.headers['x-office-token'] || url.searchParams.get('token');
    if (token !== TOKEN) return json(res, 401, { error: 'bad token' });
    if (await hub.route(req, res, p)) return;
    if (await term.route(req, res, p, url)) return;

    if (p === '/api/state') return json(res, 200, state);
    if (p === '/api/theme') { // the building's theme: anyone with this page reads it, the owner (this token) changes it
      if (req.method !== 'POST') return json(res, 200, await themeSetting());
      if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'json only' });
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'the body is not JSON, or too large' }); }
      const r = await saveTheme(body);
      if (r.error) return json(res, 400, r);
      scheduleRefresh();
      return json(res, 200, r);
    }
    if (p === '/api/stream') { // the whole state on each change (~100 KB): compressed when the browser takes gzip (~10x less on a phone)
      const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', ...(gz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}) });
      const z = gz ? zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH }) : null; // every event leaves at once
      if (z) { z.pipe(res); z.on('error', () => {}); }
      const c = { write: (s) => (z ? z.write(s) : res.write(s)) };
      c.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
      clients.add(c);
      req.on('close', () => { clients.delete(c); if (z) z.end(); });
      return;
    }
    if (p === '/api/screen') {
      const persona = await personaByName(url.searchParams.get('name'));
      if (!persona) return json(res, 404, { error: 'unknown teammate' });
      const lines = Math.min(400, Math.max(0, Number(url.searchParams.get('lines')) || 120));
      const r = await run(HC, ['read', persona.herdrName, '--lines', String(lines)]);
      return json(res, r.ok ? 200 : 502, r.ok ? { text: r.stdout.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') } : { error: r.stderr });
    }
    if (req.method === 'POST' && p === '/api/prs/refresh') { // asked from the Pull requests tab: read GitHub now
      await refreshPrs(await loadTeam(), true); scheduleRefresh();
      return json(res, 200, { ok: true, at: prs.at, error: prs.error });
    }
    if (req.method === 'GET' && p === '/api/cards') return json(res, 200, await cardList(await loadTeam()));
    if (req.method === 'GET' && (p === '/api/card' || p === '/api/card-tokens')) {
      const key = String(url.searchParams.get('key') || '');
      if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) return json(res, 400, { error: 'bad card key' });
      return json(res, 200, p === '/api/card' ? await cardDetail(key, await loadTeam()) : await cardTokens(key));
    }
    if (req.method === 'POST' && p === '/api/watchdog') { // switch the watchdog off or on for this office's team only
      const body = await readBody(req), team = await loadTeam();
      const f = path.join(HOME, '.omniloy-team', 'watch-config.json');
      let c = {}; try { c = await readJson(f); } catch {}
      const paused = new Set(c.paused || []);
      if (body.on) paused.delete(team.name); else paused.add(team.name);
      c.paused = [...paused];
      const tmp = `${f}.${process.pid}.tmp`; // written whole, then renamed: team-watch never reads half a file (that read as "nobody paused")
      await fs.writeFile(tmp, JSON.stringify(c, null, 1)); await fs.rename(tmp, f);
      scheduleRefresh();
      return json(res, 200, { ok: true, on: !!body.on });
    }
    if (req.method === 'POST' && (p === '/api/send' || p === '/api/interrupt')) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'json only' });
      const body = await readBody(req);
      const team = await loadTeam();
      const all = team.personas.map((x) => x.herdrName);
      const targets = [...new Set(Array.isArray(body.to) ? body.to : [body.to])].flatMap((t) => (t === 'all' ? all : [t]));
      if (!targets.length || targets.some((t) => !all.includes(t))) return json(res, 400, { error: 'unknown teammate' });
      if (p === '/api/interrupt') {
        const r = await run(HC, ['interrupt', targets[0], '--json'], { timeout: 20000 });
        scheduleRefresh();
        return json(res, r.ok ? 200 : 502, r.ok ? { ok: true } : { error: clip(oneLine(r.stderr), 240) });
      }
      const text = String(body.text || '').trim();
      if (!text || text.length > 6000) return json(res, 400, { error: 'message is empty or too long' });
      const online = new Set(state.agents.filter((a) => a.online).map((a) => a.herdrName));
      const results = await Promise.all(targets.map((t) => (online.has(t) ? deliver(t, text) : { name: t, ok: false, error: 'not running in Herdr' })));
      return json(res, 200, { results });
    }
    if (p === '/api/requests') return json(res, 200, await loadRequests());
    if (p === '/api/drafts') { // read only: what the business team has drafted in the person's name
      const r = await run(bin('team-draft'), ['json']);
      let d = { drafts: [] }; try { d = JSON.parse(r.stdout); } catch { /* no drafts yet */ }
      const people = {};
      for (const f of [path.join(HOME, '.omniloy-biz', 'team.json'), path.join(TEAM_DIR, 'team.json')]) {
        try { for (const x of (await readJson(f)).personas || []) people[x.herdrName] = { name: x.name, color: x.color, role: x.role }; } catch { /* that team is not set up */ }
      }
      return json(res, 200, { drafts: d.drafts || [], people, readOnly: true });
    }
    if (req.method === 'POST' && (p === '/api/requests/answer' || p === '/api/requests/read')) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'json only' });
      const body = await readBody(req);
      if (p.endsWith('/answer') && String(body.id || '').startsWith('menu:')) {
        const answer = await answerMenu(body);
        return json(res, answer.code, answer.body);
      }
      const id = String(Number(body.id) || ''), text = String(body.text || '').trim(), answering = p.endsWith('/answer');
      if (!id) return json(res, 400, { error: 'id is required' });
      if (answering && (!text || text.length > 4000)) return json(res, 400, { error: 'answer is empty or too long' });
      const stored = async () => ((await readJsonOr(path.join(SHARED, 'requests.json'), {})).items || []).find((x) => String(x.id) === id);
      if (answering) { // answered twice (phone and desktop, or a retry) would tell the agent twice and overwrite the first answer
        const x = await stored();
        if (!x) return json(res, 404, { error: `There is no request #${id} (it may have been archived).` });
        if (x.status !== 'open') return json(res, 409, { error: `#${id} is already ${x.status}${x.answeredBy ? ` by ${x.answeredBy}` : ''}${x.answeredAt ? ` (${String(x.answeredAt).slice(11, 16)})` : ''}.`, closed: true, status: x.status });
      }
      const r = await run(TEAM_ASK, answering ? ['answer', id, argText(text)] : ['read', id], { timeout: 30000 });
      scheduleRefresh();
      if (!r.ok && answering) { // team-ask saves first and then delivers: a slow or refused delivery still left the answer saved
        const x = await stored();
        if (x && x.status === 'answered') return json(res, 200, { ok: true, result: `answered and saved; telling ${x.from} took too long (busy, or waiting on a question), so they may not have it yet: they see it with team-ask`, delivered: false });
      }
      return json(res, r.ok ? 200 : 502, r.ok ? { ok: true, result: oneLine(r.stdout) } : { error: clip(oneLine(r.stderr || r.stdout), 240) });
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
});

await refresh();
setInterval(refresh, 2500).unref();
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();
// A second copy must not touch anything (above all its floor's token file).
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(`Port ${PORT} is already serving the office; this copy is exiting.`); process.exit(0); }
  throw e;
});
server.listen(PORT, HOST, async () => {
  await fs.writeFile(path.join(ROOT, `.token-${PORT}`), TOKEN, { mode: 0o600 }); // one per floor: they all run from this folder
  followEvents();
  console.log(`Team Office → http://${HOST}:${PORT}`);
});
