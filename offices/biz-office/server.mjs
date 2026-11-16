// Business Office: the business team's copy of the 3D office (clients instead of Jira and
// traceability). A local, read-mostly bridge between Herdr (`hc`) and the 3D office page.
// It binds to 127.0.0.1 only and every /api call needs the per-run token that is
// embedded in the page, so no other site or machine can read screens or send text.
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHub } from './hub.mjs';

const HOME = os.homedir();
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEAM_DIR = process.env.TEAM_DIR || path.join(HOME, '.omniloy-biz');
const PORT = Number(process.env.PORT || 4318);
// Requests and the Claude/Codex accounts are shared with the dev team's folder.
const SHARED_DIR = process.env.SHARED_DIR || path.join(HOME, '.omniloy-team');
const REQUESTS_FILE = process.env.REQUESTS_FILE || path.join(SHARED_DIR, 'requests.json');
const HOST = '127.0.0.1';
const TOKEN = process.env.OFFICE_TOKEN || crypto.randomBytes(18).toString('hex'); // OFFICE_TOKEN: a restart that keeps the pages already open working
const LOCAL_BIN = path.join(HOME, '.local', 'bin');
process.env.PATH = `${LOCAL_BIN}:${process.env.PATH || ''}`;
const bin = (n) => (existsSync(path.join(LOCAL_BIN, n)) ? path.join(LOCAL_BIN, n) : n);
const HC = bin('hc');
const expand = (p) => (p && p.startsWith('~') ? path.join(HOME, p.slice(1)) : p);

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
const EMPTY_TEAM = { name: 'Business Team', lead: '', personas: [], projects: [], missing: true };
async function loadTeam() {
  const f = path.join(TEAM_DIR, 'team.json');
  let st;
  try { st = await fs.stat(f); } catch { return EMPTY_TEAM; } // the team is not set up yet
  if (st.mtimeMs !== teamCache.mtime) {
    try {
      const team = await readJson(f);
      team.personas = team.personas || []; team.projects = team.projects || [];
      if (!team.accounts) { try { team.accounts = (await readJson(path.join(SHARED_DIR, 'team.json'))).accounts || []; } catch { team.accounts = []; } }
      teamCache = { mtime: st.mtimeMs, team };
    } catch { return teamCache.team || EMPTY_TEAM; } // half-written file: keep the last good one
  }
  return teamCache.team;
}
const descCache = new Map();
async function personaDescription(slug) {
  if (descCache.has(slug)) return descCache.get(slug);
  let d = '';
  try {
    const md = await fs.readFile(path.join(HOME, '.claude', 'agents', `${slug}.md`), 'utf8');
    const m = md.match(/^description:\s*(.+)$/m);
    if (m) d = m[1].trim();
  } catch {}
  descCache.set(slug, d);
  return d;
}

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

const transcriptCache = new Map(); // file -> {key, items}
async function parsedTranscript(file, kind, names) {
  const st = await fs.stat(file);
  const key = `${st.size}:${st.mtimeMs}`;
  const hit = transcriptCache.get(file);
  if (hit && hit.key === key) return hit.items;
  const lines = await tail(file);
  const items = kind === 'codex' ? parseCodex(lines, names) : parseClaude(lines, names);
  transcriptCache.set(file, { key, items });
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
        codexMeta.set(f, cwd);
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

// Clients: ~/.omniloy-biz/clients.json, kept by the clients agent.
const STATES = ['lead', 'pilot', 'onboarding', 'active', 'at-risk', 'paused', 'churned'];
let clientsCache = { key: '', data: { updated: '', clients: [], missing: true } };
async function loadClients() {
  const f = path.join(TEAM_DIR, 'clients.json');
  let st;
  try { st = await fs.stat(f); } catch { return { updated: '', clients: [], missing: true }; }
  const key = `${st.size}:${st.mtimeMs}`;
  if (key === clientsCache.key) return clientsCache.data;
  try {
    const d = await readJson(f);
    const list = (Array.isArray(d.clients) ? d.clients : []).map((c, i) => {
      const lc = c.lastContact || {};
      const at = Date.parse(lc.date) || 0;
      return {
        id: String(c.id || c.name || i), name: String(c.name || c.id || 'Unnamed'), state: STATES.includes(c.state) ? c.state : 'lead',
        products: Array.isArray(c.products) ? c.products.map(String) : [],
        integrations: (Array.isArray(c.integrations) ? c.integrations : []).map((x) => ({ name: String(x.name || ''), status: String(x.status || 'planned'), note: String(x.note || '') })),
        owner: String(c.owner || ''), nextStep: String(c.nextStep || ''), waitingOn: String(c.waitingOn || ''),
        health: ['green', 'amber', 'red'].includes(c.health) ? c.health : 'amber',
        people: (Array.isArray(c.people) ? c.people : []).map((p) => ({ name: String(p.name || ''), role: String(p.role || ''), org: String(p.org || ''), note: String(p.note || ''),
          channels: (Array.isArray(p.channels) ? p.channels : []).map((x) => String(x).toLowerCase()) })).filter((p) => p.name),
        lastContact: at ? { ms: at, channel: String(lc.channel || ''), who: String(lc.who || ''), direction: lc.direction === 'in' ? 'in' : 'out', summary: String(lc.summary || '') } : null,
      };
    });
    clientsCache = { key, data: { updated: String(d.updated || ''), fileMs: st.mtimeMs, clients: list } };
  } catch (e) { clientsCache = { key, data: { ...clientsCache.data, error: `clients.json could not be read: ${e.message}` } }; }
  return clientsCache.data;
}

// ---------------------------------------------------------------- state
let state = { ts: 0, agents: [], feed: [], clients: { clients: [] }, hcOk: true };
let stateJson = '';
const clients = new Set();
const lastStatus = new Map();
const statusEvents = [];
const youEvents = [];

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

async function buildAgent(p, team, names) {
  const hn = p.herdrName;
  const g = await run(HC, ['get', hn, '--json']);
  let term = null;
  if (g.ok) { try { term = JSON.parse(g.stdout); } catch {} }
  const status = mapStatus(term);
  const account = (team.accounts || []).find((a) => a.id === p.runtime) || {};
  const agent = {
    slug: p.slug, name: p.name, role: p.role, color: p.color, herdrName: hn, label: p.label,
    runtime: p.runtime, runtimeName: account.name || p.runtime, runtimeKind: account.kind || '',
    description: await personaDescription(p.slug),
    status, online: status !== 'offline',
    statusSince: term ? term.status_ms : 0,
    statusMsg: (term && term.status && term.status.msg) || '',
    address: term ? term.address : '', where: (term && term.labels && term.labels.where) || '',
    turn: term ? term.turn : 0, startedMs: term ? term.created_ms : 0,
    screen: [], activity: [], nowDoing: '', lastSaid: '', nudges: [],
    memory: await loadMemory(p.slug),
    lastActivityMs: 0, lastActivity: '',
  };
  if (agent.memory) agent.lastActivityMs = agent.memory.updatedMs; // offline: the last time they wrote their notes
  if (!agent.online) return agent;

  const [scr, file] = await Promise.all([
    run(HC, ['read', hn]),
    (account.kind === 'codex' ? codexTranscript(account, term) : claudeTranscript(account, term)).catch(() => null),
  ]);
  if (scr.ok) agent.screen = screenLines(scr.stdout);
  let items = [];
  if (file) { try { items = await parsedTranscript(file, account.kind, names); } catch {} }
  items.forEach((it, i) => { it.id = `${p.slug}:${it.ts}:${i}`; });
  agent.activity = items.slice(-60).map(({ id, ts, kind, tool, text }) => ({ id, ts, kind, tool, text: clip(text, kind === 'tool' ? 160 : 1200) }));
  const lastSay = [...items].reverse().find((i) => i.kind === 'say');
  const lastAct = [...items].reverse().find((i) => i.kind !== 'inbox');
  agent.lastSaid = lastSay ? clip(lastSay.text, 600) : '';
  if (lastAct && lastAct.ts) { agent.lastActivityMs = Math.max(agent.lastActivityMs, lastAct.ts); agent.lastActivity = clip(oneLine(lastAct.text), 120); }
  else if (term && term.created_ms) agent.lastActivityMs = Math.max(agent.lastActivityMs, term.created_ms);
  agent.nowDoing = status === 'working'
    ? (agent.statusMsg || (lastAct ? clip(oneLine(lastAct.text), 120) : 'Thinking'))
    : status === 'blocked' ? (agent.statusMsg || 'Needs your answer in the terminal') : '';
  for (const it of items) {
    for (const n of it.nudges || []) agent.nudges.push({ id: `msg:${it.id}:${n.to}`, ts: it.ts, type: 'msg', from: hn, to: n.to, text: clip(n.text, 500) });
  }
  return agent;
}

let refreshing = false, dirty = false;
async function refresh() {
  if (refreshing) { dirty = true; return; }
  refreshing = true;
  try {
    const team = await loadTeam();
    const names = new Set(team.personas.map((p) => p.herdrName));
    const probe = await run(HC, ['ls', '--json']);
    const agents = await Promise.all(team.personas.map((p) => buildAgent(p, team, names)));
    const now = Date.now();
    for (const a of agents) {
      const prev = lastStatus.get(a.slug);
      if (prev && prev !== a.status) statusEvents.push({ id: `st:${a.slug}:${now}`, ts: now, type: 'status', from: a.herdrName, status: a.status, prev });
      lastStatus.set(a.slug, a.status);
    }
    if (statusEvents.length > 120) statusEvents.splice(0, statusEvents.length - 120);
    const feed = [...statusEvents, ...youEvents, ...agents.flatMap((a) => a.nudges)].sort((x, y) => x.ts - y.ts).slice(-150);
    agents.forEach((a) => delete a.nudges);
    const next = {
      agents, feed, clients: await loadClients(), hcOk: probe.ok,
      team: { name: team.name || 'Business Team', lead: team.lead || '', setUp: !team.missing },
      jira: { site: team.jira && team.jira.site }, projects: [],
    };
    const json = JSON.stringify(next);
    if (json !== stateJson) {
      stateJson = json;
      state = { ts: now, ...next };
      const msg = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
      for (const res of clients) res.write(msg);
    }
  } catch (e) {
    console.error('refresh failed:', e.message);
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

// Herdr pushes a line whenever a terminal changes; use it to refresh right away.
let eventsProc = null;
function followEvents() {
  eventsProc = spawn(HC, ['events', '--json'], { stdio: ['ignore', 'pipe', 'ignore'] });
  eventsProc.stdout.on('data', scheduleRefresh);
  eventsProc.on('error', () => {});
  eventsProc.on('exit', () => { eventsProc = null; setTimeout(followEvents, 3000).unref(); });
}
process.on('exit', () => eventsProc && eventsProc.kill());
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));

// ---------------------------------------------------------------- http
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

async function serveFile(res, rootDir, rel, cache) {
  const file = path.normalize(path.join(rootDir, rel));
  if (!file.startsWith(rootDir + path.sep)) return json(res, 403, { error: 'forbidden' });
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': cache });
    createReadStream(file).pipe(res);
  } catch { json(res, 404, { error: 'not found' }); }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 64_000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
// Pending requests for __OWNER__ (written by `team-ask`); the office shows them and can answer.
const TEAM_ASK = bin('team-ask');
const TEAM_DRAFT = bin('team-draft');
// Drafts sent or deleted in Gmail itself drop off the list on their own.
setInterval(() => { run(TEAM_DRAFT, ['sync'], { timeout: 60000 }).catch(() => {}); }, 60000).unref();
const shortName = (n) => { const m = /^(\S+) (\d+) \(temp\)/.exec(String(n)); return m ? `${m[1]} ${m[2]}` : String(n).split(' ')[0]; }; // a temp keeps its number: "Nora 3"
async function loadRequests() {
  let items = [];
  try { items = JSON.parse(await fs.readFile(REQUESTS_FILE, 'utf8')).items || []; } catch { /* none yet */ }
  const team = await loadTeam();
  const mine = new Set(team.personas.map((p) => p.herdrName));
  const lead = team.personas.find((p) => p.herdrName === team.lead);
  const open = items.filter((x) => x.status === 'open' && mine.has(x.from)); // only this team's people
  return {
    site: team.jira && team.jira.site,
    lead: lead ? lead.name.split(' ')[0] : '',
    withLead: lead ? open.filter((x) => x.to === lead.herdrName).length : 0,
    items: open.filter((x) => (x.to || '__OWNER_ID__') === '__OWNER_ID__').map((x) => {
      const p = team.personas.find((q) => q.herdrName === x.from) || {};
      return { id: x.id, kind: x.kind, from: x.from, name: x.ext ? x.from : shortName(p.name || x.from), role: p.role || '', color: p.color || '#888', via: x.via || '',
        title: x.title, body: x.body, ticket: x.ticket, options: x.options || [], created: x.created };
    }),
  };
}
let requestsSig = '';
setInterval(async () => { // a new or answered request changes the picture in the Herdr tab too
  try { const sig = JSON.stringify(await loadRequests()); if (sig !== requestsSig) { requestsSig = sig; } } catch { /* ignore */ }
}, 3000).unref();
const personaByName = async (name) => (await loadTeam()).personas.find((p) => p.herdrName === name);

async function deliver(name, text) {
  const started = Date.now();
  const p = run(HC, ['send', '--json', name, '--', text], { timeout: 120_000 });
  const first = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), 12_000))]);
  if (first && !first.ok) return { name, ok: false, error: clip(oneLine(first.stderr) || 'hc send failed', 240) };
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
const hub = createHub({ port: PORT, stuck: () => state.agents.filter((x) => x.status === 'blocked'), agents: () => state.agents });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const host = String(req.headers.host || '');
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}` && !remoteOk(req, host)) return json(res, 403, { error: 'bad host' });
  const p = url.pathname;
  try {
    if (p === '/' || p === '/index.html') {
      const html = (await fs.readFile(path.join(ROOT, 'public', 'index.html'), 'utf8')).replace('%%OFFICE_TOKEN%%', TOKEN);
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      return res.end(html);
    }
    if (p === '/health') return json(res, 200, { ok: true, app: 'biz-office' });
    if (p.startsWith('/vendor/three/')) {
      const rel = p.slice('/vendor/three/'.length);
      if (!/^(build|examples\/jsm)\//.test(rel)) return json(res, 403, { error: 'forbidden' });
      return serveFile(res, path.join(ROOT, 'node_modules', 'three'), rel, 'max-age=86400');
    }
    if (!p.startsWith('/api/')) return serveFile(res, path.join(ROOT, 'public'), p.slice(1), 'no-store');

    const token = req.headers['x-office-token'] || url.searchParams.get('token');
    if (token !== TOKEN) return json(res, 401, { error: 'bad token' });
    if (await hub.route(req, res, p)) return;

    if (p === '/api/state') return json(res, 200, state);
    if (p === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/screen') {
      const persona = await personaByName(url.searchParams.get('name'));
      if (!persona) return json(res, 404, { error: 'unknown teammate' });
      const lines = Math.min(400, Math.max(0, Number(url.searchParams.get('lines')) || 120));
      const r = await run(HC, ['read', persona.herdrName, '--lines', String(lines)]);
      return json(res, r.ok ? 200 : 502, r.ok ? { text: r.stdout.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') } : { error: r.stderr });
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
    if (req.method === 'POST' && (p === '/api/requests/answer' || p === '/api/requests/read')) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'json only' });
      const body = await readBody(req);
      const id = String(Number(body.id) || ''), text = String(body.text || '').trim();
      if (!id) return json(res, 400, { error: 'id is required' });
      if (p.endsWith('/answer') && (!text || text.length > 4000)) return json(res, 400, { error: 'answer is empty or too long' });
      if (!(await loadRequests()).items.some((x) => String(x.id) === id)) return json(res, 404, { error: 'that request is not open for this team' });
      const r = await run(TEAM_ASK, p.endsWith('/answer') ? ['answer', id, text] : ['read', id], { timeout: 30000 });
      scheduleRefresh();
      return json(res, r.ok ? 200 : 502, r.ok ? { ok: true, result: oneLine(r.stdout) } : { error: clip(oneLine(r.stderr || r.stdout), 240) });
    }
    // Drafts: outgoing messages the team prepared for __OWNER__ (`team-draft`). Nothing is sent from here.
    if (p === '/api/drafts') {
      const r = await run(TEAM_DRAFT, ['json']);
      let d = { drafts: [] }; try { d = JSON.parse(r.stdout); } catch { /* no drafts yet */ }
      const people = {};
      for (const f of [path.join(TEAM_DIR, 'team.json'), path.join(HOME, '.omniloy-team', 'team.json')]) {
        try { for (const x of (await readJson(f)).personas || []) people[x.herdrName] = { name: x.name, color: x.color, role: x.role }; } catch { /* that team is not set up */ }
      }
      return json(res, 200, { drafts: d.drafts, signature: d.signature || null, people });
    }
    if (req.method === 'POST' && ['/api/drafts/edit', '/api/drafts/ask', '/api/drafts/status', '/api/drafts/send'].includes(p)) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'json only' });
      const body = await readBody(req);
      const id = String(Number(body.id) || '');
      if (!id) return json(res, 400, { error: 'id is required' });
      let args;
      if (p.endsWith('/edit')) {
        const text = String(body.body || '').trim();
        if (!text || text.length > 20000) return json(res, 400, { error: 'the message is empty or too long' });
        const tmp = path.join(os.tmpdir(), `biz-draft-${id}-${Date.now()}.txt`);
        await fs.writeFile(tmp, text);
        args = ['edit', id, '--body-file', tmp, ...(typeof body.subject === 'string' ? ['--subject', body.subject.slice(0, 300)] : [])];
      } else if (p.endsWith('/ask')) {
        const text = String(body.text || '').trim();
        if (!text || text.length > 2000) return json(res, 400, { error: 'the question is empty or too long' });
        args = ['ask', id, text];
      } else if (p.endsWith('/send')) {
        args = ['send', id, '--by-owner']; // __OWNER__'s click in the popup; the Gmail draft goes out as it reads there
      } else {
        if (!['sent', 'discarded'].includes(body.status)) return json(res, 400, { error: 'status must be sent or discarded' });
        args = [body.status === 'sent' ? 'sent' : 'discard', id, '--by-owner'];
      }
      const r = await run(TEAM_DRAFT, args, { timeout: 90000 });
      return json(res, r.ok ? 200 : 502, r.ok ? { ok: true } : { error: clip(oneLine(r.stderr || r.stdout), 240) });
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

await refresh();
setInterval(refresh, 2500).unref();
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();
// A second copy must not touch anything (above all the token file the Herdr tab reads).
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(`Port ${PORT} is already serving the office; this copy is exiting.`); process.exit(0); }
  throw e;
});
server.listen(PORT, HOST, async () => {
  await fs.writeFile(path.join(ROOT, '.token'), TOKEN, { mode: 0o600 });
  followEvents();
  console.log(`Business Office → http://${HOST}:${PORT} (team folder ${TEAM_DIR})`);
});
