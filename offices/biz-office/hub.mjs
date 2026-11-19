// What waits for __OWNER__ across every office, and the notifications that reach his phone.
// The same file sits in both office apps (edit it in team-office, copy it to the other two).
//
//   attention   open questions and messages addressed to him (the shared team-ask store), drafts waiting for his
//               check, and people stuck on a question in their terminal. Each office writes its stuck people to
//               ~/.omniloy-team/push/local-<port>.json so the other offices can show them too.
//   push        standard Web Push, no library: the phone subscribes from the installed home-screen app, the
//               subscription is kept in ~/.omniloy-team/push/subs.json, and a new item is sent once (whichever
//               office sees it first claims it). The text is encrypted for the phone; Apple/Google only relay it.
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPeers } from './peers.mjs';

const APP = path.dirname(fileURLToPath(import.meta.url)); // this office app's folder
const HOME = os.homedir(), SHARED = path.join(HOME, '.omniloy-team'), PUSH = path.join(SHARED, 'push');
const DEFAULT_OFFICES = [
  { name: 'Dev', port: 4317, dir: '.omniloy-team' },
  { name: 'Business', port: 4318, dir: '.omniloy-biz' },
];
// A computer with other floors says so in ~/.omniloy-team/floors.json: [{ "name", "port", "dir" }]
export const OFFICES = (() => { try { const l = JSON.parse(readFileSync(path.join(SHARED, 'floors.json'), 'utf8')); return Array.isArray(l) && l.length ? l : DEFAULT_OFFICES; } catch { return DEFAULT_OFFICES; } })();
const readJson = async (f, dflt) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return dflt; } };
const writeJson = async (f, v) => { await fs.mkdir(path.dirname(f), { recursive: true, mode: 0o700 }); const t = `${f}.${process.pid}.tmp`; await fs.writeFile(t, JSON.stringify(v), { mode: 0o600 }); await fs.rename(t, f); };
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const b64u = (b) => Buffer.from(b).toString('base64url');

// ---------------------------------------------------------------- who works where
const shortName = (n) => { const m = /^(\S+) (\d+) \(temp\)/.exec(String(n)); return m ? `${m[1]} ${m[2]}` : String(n).split(' ')[0]; }; // a temp keeps its number: "Nora 3"
let people = { at: 0, by: {} };
async function whoIsWho() {
  if (Date.now() - people.at < 30_000) return people.by;
  const by = {};
  for (const o of OFFICES) {
    const team = await readJson(path.join(HOME, o.dir, 'team.json'), null), temps = await readJson(path.join(HOME, o.dir, 'temps.json'), []);
    for (const p of [...((team && team.personas) || []), ...(Array.isArray(temps) ? temps : [])]) if (p && p.herdrName && !by[p.herdrName]) by[p.herdrName] = { port: o.port, name: shortName(p.name || p.herdrName), color: p.color || '#888' };
  }
  people = { at: Date.now(), by };
  return by;
}

// The answer to a spoken message. Claude Code keeps a log of each session: find the message there and return the
// text written after it. Anything else (Codex) falls back to what is on the terminal screen.
const replyAt = new Map(); // `${name}:${message}` -> { file, pos } once the message has been found in a log
const hcOut = (args) => new Promise((resolve) => execFile(path.join(HOME, '.local', 'bin', 'hc'), args, { timeout: 15_000, maxBuffer: 8e6 }, (err, out) => resolve(err ? '' : String(out))));
async function readFrom(file, pos) {
  const fh = await fs.open(file, 'r');
  try { const { size } = await fh.stat(), buf = Buffer.alloc(Math.max(0, size - pos)); await fh.read(buf, 0, buf.length, pos); return buf; } finally { await fh.close(); }
}
async function voiceReply(name, since, key) {
  let t = {}; try { t = JSON.parse(await hcOut(['get', name, '--json'])); } catch { /* not running */ }
  const working = !!(t.status && t.status.state === 'working'), id = `${name}:${key}`;
  let at = replyAt.get(id);
  if (!at && key && t.cwd) {
    const needle = JSON.stringify(key).slice(1, -1), slug = t.cwd.replace(/[^A-Za-z0-9]/g, '-');
    for (const root of ['.claude', '.claude-personal']) {
      const dir = path.join(HOME, root, 'projects', slug);
      for (const f of (await fs.readdir(dir).catch(() => [])).filter((x) => x.endsWith('.jsonl'))) {
        const file = path.join(dir, f), st = await fs.stat(file).catch(() => null);
        if (!st || st.mtimeMs < since) continue;
        const from = Math.max(0, st.size - 3_000_000), buf = await readFrom(file, from).catch(() => Buffer.alloc(0));
        for (let a = 0, b; (b = buf.indexOf(10, a)) >= 0; a = b + 1) {
          const line = buf.toString('utf8', a, b);
          if (!line.includes(needle)) continue;
          let o; try { o = JSON.parse(line); } catch { continue; }
          if ((o.type === 'user' || o.type === 'attachment') && Date.parse(o.timestamp) >= since) at = { file, pos: from + b + 1 };
        }
      }
    }
    if (at) { replyAt.set(id, at); if (replyAt.size > 60) replyAt.delete(replyAt.keys().next().value); }
  }
  if (at) {
    const parts = []; let ended = false, steps = 0;
    for (const line of (await readFrom(at.file, at.pos).catch(() => Buffer.alloc(0))).toString('utf8').split('\n')) {
      if (!line) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.isSidechain) continue;
      const c = o.message && o.message.content;
      if (o.type === 'user' && typeof c === 'string') break; // the next message: this answer is over
      if (o.type !== 'assistant' || !Array.isArray(c)) continue;
      for (const b of c) { if (b.type === 'text' && b.text.trim()) parts.push(b.text.trim()); else if (b.type === 'tool_use') steps++; }
      ended = o.message.stop_reason === 'end_turn';
    }
    return { found: true, working: working || !ended, done: ended && !!parts.length, text: parts.join('\n\n'), tail: parts.length ? parts[parts.length - 1].length : 0, steps };
  }
  // no log with the message: read the screen from the message down to the input box
  const lines = (await hcOut(['read', name, '--lines', '200'])).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  const head = key.slice(0, 18); let i = -1;
  if (head) lines.forEach((l, n) => { if (l.includes(head)) i = n; });
  if (i < 0) return { found: false, working, done: false, text: '', steps: 0 };
  while (i < lines.length && lines[i]) i++; // past the rest of the message
  let z = lines.length; for (let n = i; n < lines.length; n++) if (/^[─━]{20,}/.test(lines[n])) { z = n; break; }
  const text = lines.slice(i, z).join('\n').trim();
  return { found: true, working, done: !working && !!text, text, steps: 0, screen: true };
}

// A chat with one person: their Claude Code session log read as a conversation (what was said to them, what they
// wrote back). The page asks again with the position it got, and receives only what is new.
async function sessionLog(t) {
  for (const pid of [t.foreground && t.foreground.pid, t.pid].filter(Boolean)) for (const root of ['.claude', '.claude-personal']) {
    const s = await readJson(path.join(HOME, root, 'sessions', `${pid}.json`), null);
    if (!s || !s.sessionId || !s.cwd) continue;
    const file = path.join(HOME, root, 'projects', s.cwd.replace(/[^A-Za-z0-9]/g, '-'), `${s.sessionId}.jsonl`);
    if (await fs.stat(file).catch(() => null)) return file;
  }
  return '';
}
// The helpers someone has running: the sub-agents and workflow agents of their Claude Code session. Each one keeps
// its own log next to the session's (subagents/agent-<id>.jsonl, subagents/workflows/<run>/agent-<id>.jsonl).
const logAt = new Map(); // herdrName -> { file, at }
async function logOf(name) {
  const hit = logAt.get(name);
  if (hit && Date.now() - hit.at < 20_000) return hit.file;
  let t = {}; try { t = JSON.parse(await hcOut(['get', name, '--json'])); } catch { /* not running */ }
  const file = t.state === 'live' ? await sessionLog(t) : '';
  logAt.set(name, { file, at: Date.now() });
  return file;
}
const endedAt = new Map(); // log -> { key, done }
async function endedLog(file, st) { // no "finished" mark: it is over when its last word is a closed answer
  const key = `${st.size}:${st.mtimeMs}`, hit = endedAt.get(file);
  if (hit && hit.key === key) return hit.done;
  const lines = (await readFrom(file, Math.max(0, st.size - 200_000)).catch(() => Buffer.alloc(0))).toString('utf8').split('\n');
  let done = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    let o; try { o = JSON.parse(lines[i]); } catch { continue; }
    if (o.type !== 'assistant' && o.type !== 'user') continue;
    done = o.type === 'assistant' && !!o.message && o.message.stop_reason === 'end_turn'; break;
  }
  endedAt.set(file, { key, done }); if (endedAt.size > 400) endedAt.delete(endedAt.keys().next().value);
  return done;
}
async function workersOf(file) {
  if (!file) return [];
  const root = path.join(file.replace(/\.jsonl$/, ''), 'subagents'), dirs = [[root, '']];
  for (const d of await fs.readdir(path.join(root, 'workflows')).catch(() => [])) dirs.push([path.join(root, 'workflows', d), d]);
  const out = [], now = Date.now();
  for (const [dir, flow] of dirs) for (const n of await fs.readdir(dir).catch(() => [])) {
    const m = /^agent-([A-Za-z0-9]+)\.jsonl$/.exec(n); if (!m) continue;
    const f = path.join(dir, n), st = await fs.stat(f).catch(() => null);
    if (!st || now - st.mtimeMs > 6 * 3600e3) continue;
    const meta = (await readJson(path.join(dir, `agent-${m[1]}.meta.json`), {})) || {}, idle = now - st.mtimeMs;
    const done = meta.finished === true || idle > 45 * 60e3 || (idle > 6000 && await endedLog(f, st));
    if (done && idle > 10 * 60e3) continue; // finished a while ago: no longer news
    out.push({ id: m[1], kind: flow ? 'workflow' : 'agent', label: String(meta.description || meta.agentType || 'helper').slice(0, 90), type: String(meta.workflowPhase || meta.agentType || ''), done, started: st.birthtimeMs || st.ctimeMs, ended: done ? st.mtimeMs : 0, file: f });
  }
  return out.sort((a, b) => a.started - b.started).slice(-30);
}
const publicWorkers = (list) => list.map(({ file: _file, ...w }) => w);
const doingOf = (x) => { // what a tool call is about, in a few words
  const i = x.input || {}, hint = i.description || (i.file_path && path.basename(String(i.file_path))) || i.pattern || i.query || i.url || i.skill || '';
  return `${String(x.name || '').replace(/^mcp__/, '').replace(/__/g, ' · ')}${hint ? `: ${String(hint).replace(/\s+/g, ' ').slice(0, 90)}` : ''}`;
};
async function chatLog(name, pos, known, worker) {
  let t = {}; try { t = JSON.parse(await hcOut(['get', name, '--json'])); } catch { /* not running */ }
  const live = t.state === 'live', working = !!(t.status && t.status.state === 'working'), blocked = !!(t.status && ['blocked', 'error'].includes(t.status.state));
  const main = live ? await sessionLog(t) : '', helpers = await workersOf(main), side = worker ? helpers.find((x) => x.id === worker) : null, workers = publicWorkers(helpers);
  if (worker && !side) return { file: '', pos: 0, messages: [], live, working: false, blocked: false, workers, gone: true }; // that helper is no longer listed
  const file = side ? side.file : main;
  if (!file) { // not Claude Code (or not running): the screen is all there is
    const screen = live ? (await hcOut(['read', name, '--lines', '80'])).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[ \t]+$/gm, '').trim() : '';
    return { file: '', pos: 0, messages: [], live, working, blocked, screen, workers };
  }
  const id = path.basename(file), first = id !== known || !pos;
  const size = (await fs.stat(file)).size, from = first ? Math.max(0, size - 700_000) : Math.min(pos, size);
  const buf = await readFrom(file, from).catch(() => Buffer.alloc(0)), end = buf.lastIndexOf(10) + 1; // whole lines only
  let a = first && from ? buf.indexOf(10) + 1 : 0;
  const who = await whoIsWho(), out = [];
  let now; // the tool they are using at this moment, when this read saw one
  for (let b; a < end && (b = buf.indexOf(10, a)) >= 0; a = b + 1) {
    let o; try { o = JSON.parse(buf.toString('utf8', a, b)); } catch { continue; }
    if ((!side && o.isSidechain) || o.isMeta || o.isCompactSummary) continue;
    let c = o.message && o.message.content; const ts = Date.parse(o.timestamp) || 0;
    const queued = o.type === 'attachment' && o.attachment && o.attachment.type === 'queued_command' ? o.attachment.prompt : null; // a message written while they were busy joins the turn as an attachment, not as a message
    if (queued != null) c = queued;
    if (o.type === 'user' || queued != null) {
      let text = typeof c === 'string' ? c : Array.isArray(c) && !c.some((x) => x.type === 'tool_result') ? c.filter((x) => x.type === 'text').map((x) => x.text).join('\n') : '';
      text = text.trim(); if (!text) continue;
      let from = '';
      const m = /^<hc from="([^"]*)">([\s\S]*?)(<\/hc>)?\s*$/.exec(text);
      if (m) { from = m[1].split(' ').pop(); text = m[2].trim(); } else if (text.startsWith('<')) continue; // reminders, commands, notifications
      const mate = from && who[from] && from !== name ? who[from] : null;
      const spoken = text.startsWith('(spoken by __OWNER__, transcribed)'); if (spoken) text = text.slice(32).trim();
      if (side) out.push({ role: 'peer', from: 'Brief', color: '#9aa4bd', text: clipLong(text), ts }); // what a helper was asked to do
      else out.push(mate ? { role: 'peer', from: mate.name, color: mate.color, text: clipLong(text), ts } : { role: 'you', text: clipLong(text), ts, spoken });
    } else if (o.type === 'assistant' && Array.isArray(c)) {
      for (const x of c) { if (x.type === 'text' && x.text.trim()) { out.push({ role: 'them', text: clipLong(x.text.trim()), ts }); now = ''; } else if (x.type === 'tool_use') { out.push({ role: 'step', text: String(x.name || ''), ts }); now = doingOf(x); } }
    }
  }
  return { file: id, pos: from + end, reset: first, messages: first ? out.slice(-60) : out, live, working: side ? !side.done : working, blocked: side ? false : blocked, workers, ...(now !== undefined ? { now } : {}) };
}
const clipLong = (s) => (s.length > 12000 ? `${s.slice(0, 12000)}\n…` : s);

export function createHub({ port, stuck, agents }) {
  const officeOf = (p) => OFFICES.find((o) => o.port === p) || OFFICES[0];

  // ---------------------------------------------------------------- attention
  const since = new Map(); // herdrName -> when they got stuck (so the same wait keeps one id)
  async function writeLocal() {
    let list = []; try { list = (stuck ? stuck() : []) || []; } catch { list = []; }
    for (const k of [...since.keys()]) if (!list.some((a) => a.herdrName === k)) since.delete(k);
    for (const a of list) if (!since.has(a.herdrName)) since.set(a.herdrName, Date.now());
    const items = list.filter((a) => Date.now() - since.get(a.herdrName) > 15_000).map((a) => { // a short stop is not a wait
      const t = since.get(a.herdrName);
      return { id: `b${port}-${a.herdrName}-${t}`, port, kind: 'stuck', who: shortName(a.name || a.herdrName), from: a.herdrName, color: a.color || '#f87171', title: clip(a.nowDoing || a.statusMsg || 'Needs your answer in the terminal', 140), created: new Date(t).toISOString() };
    });
    let all = []; try { all = (agents ? agents() : []) || []; } catch { all = []; }
    await writeJson(path.join(PUSH, `local-${port}.json`), { ts: Date.now(), items, people: all.length, working: all.filter((a) => a.status === 'working').length }); // the head count is what the building view shows
  }
  async function attention() {
    const who = await whoIsWho(), items = [];
    const reqs = await readJson(path.join(SHARED, 'requests.json'), { items: [] });
    for (const x of reqs.items || []) {
      if (x.status !== 'open' || (x.to || '__OWNER_ID__') !== '__OWNER_ID__') continue;
      const p = who[x.from] || { port: 4317, name: x.from, color: '#888' };
      items.push({ id: `r${x.id}`, port: p.port, kind: x.kind === 'request' ? 'request' : 'note', who: p.name, from: x.from, color: p.color, title: clip(x.title || x.body, 140), created: x.created });
    }
    const drafts = await readJson(path.join(HOME, '.omniloy-biz', 'drafts.json'), { drafts: [] });
    for (const x of (Array.isArray(drafts) ? drafts : drafts.drafts) || []) {
      if (x.status !== 'open') continue;
      const p = who[x.from] || { name: x.from, color: '#2dd4bf' };
      items.push({ id: `d${x.id}`, port: 4318, kind: 'draft', who: p.name, from: x.from, color: '#2dd4bf', title: clip(x.subject || x.client || x.to || 'A draft', 140), created: x.created });
    }
    for (const o of OFFICES) {
      const d = await readJson(path.join(PUSH, `local-${o.port}.json`), null);
      if (d && Date.now() - d.ts < 30_000) items.push(...(d.items || []));
    }
    items.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
    return items.map((x) => ({ ...x, office: officeOf(x.port).name }));
  }

  // ---------------------------------------------------------------- web push (RFC 8291 + VAPID)
  let vapid = null;
  async function keys() {
    if (vapid) return vapid;
    const f = path.join(PUSH, 'vapid.json');
    let v = await readJson(f, null);
    if (!v || !v.jwk) {
      const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      v = { jwk: privateKey.export({ format: 'jwk' }), subject: 'mailto:office-push@example.org' };
      try { await fs.mkdir(PUSH, { recursive: true, mode: 0o700 }); await fs.writeFile(f, JSON.stringify(v), { mode: 0o600, flag: 'wx' }); } catch { v = (await readJson(f, null)) || v; } // another office wrote it first
    }
    vapid = { key: crypto.createPrivateKey({ key: v.jwk, format: 'jwk' }), pub: b64u(Buffer.concat([Buffer.from([4]), Buffer.from(v.jwk.x, 'base64url'), Buffer.from(v.jwk.y, 'base64url')])), subject: v.subject || 'mailto:office-push@example.org' };
    return vapid;
  }
  function encrypt(sub, text) {
    const ua = Buffer.from(sub.keys.p256dh, 'base64url'), auth = Buffer.from(sub.keys.auth, 'base64url');
    const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
    const as = ecdh.getPublicKey(), shared = ecdh.computeSecret(ua), salt = crypto.randomBytes(16);
    const hkdf = (ikm, s, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
    const ikm = hkdf(shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32);
    const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
    const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
    const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = as.length;
    return Buffer.concat([head, as, body]);
  }
  async function sendOne(sub, payload) {
    const v = await keys(), aud = new URL(sub.endpoint).origin;
    const unsigned = `${b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.subject }))}`;
    const jwt = `${unsigned}.${b64u(crypto.sign('sha256', Buffer.from(unsigned), { key: v.key, dsaEncoding: 'ieee-p1363' }))}`;
    const r = await fetch(sub.endpoint, {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `vapid t=${jwt}, k=${v.pub}`, 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high' },
      body: encrypt(sub, JSON.stringify(payload)),
    });
    return r.status;
  }
  const SUBS = path.join(PUSH, 'subs.json');
  async function sendAll(payload, only) {
    const subs = await readJson(SUBS, []), out = [], gone = new Set();
    for (const s of subs) {
      if (only && s.endpoint !== only) continue;
      let status = 0; try { status = await sendOne(s, payload); } catch { status = 0; }
      out.push(status);
      if (status === 404 || status === 410) gone.add(s.endpoint); // the phone dropped this subscription
    }
    if (gone.size) await writeJson(SUBS, (await readJson(SUBS, [])).filter((s) => !gone.has(s.endpoint)));
    return out;
  }
  const LABEL = { request: 'needs your answer', note: 'left you a message', draft: 'has a draft for you to check', stuck: 'is waiting for you' };
  let known = null;
  async function watch() {
    try {
      await writeLocal();
      const items = await attention();
      if (!known) { known = new Set(items.map((x) => x.id)); return; } // only what arrives from now on
      for (const x of items) {
        if (known.has(x.id)) continue;
        known.add(x.id);
        if (x.kind === 'stuck' && x.port !== port) continue; // the office they sit in announces it
        try { await fs.mkdir(path.join(PUSH, 'sent'), { recursive: true, mode: 0o700 }); await fs.writeFile(path.join(PUSH, 'sent', x.id.replace(/[^\w.-]/g, '_')), '', { flag: 'wx' }); } catch { continue; } // another office already sent it
        await sendAll({ title: `${x.who} ${LABEL[x.kind] || 'needs you'}`, body: `${x.office} · ${x.title}`, port: x.port, hash: x.kind === 'stuck' ? `p=${x.from}` : 'foryou', tag: x.id });
      }
      if (known.size > 4000) known = new Set(items.map((x) => x.id));
    } catch { /* try again next round */ }
  }
  setInterval(watch, 5000).unref(); watch();
  setInterval(async () => { // forget old claims
    try { const d = path.join(PUSH, 'sent'); for (const f of await fs.readdir(d)) { const st = await fs.stat(path.join(d, f)); if (Date.now() - st.mtimeMs > 7 * 864e5) await fs.unlink(path.join(d, f)); } } catch { /* nothing to clean */ }
  }, 6 * 3600e3).unref();

  // ---------------------------------------------------------------- routes (the caller has already checked the office token)
  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req, max = 16_000) => new Promise((resolve, reject) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > max) { reject(new Error('too large')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } }); req.on('error', reject); });
  const peers = createPeers({ port, agents, OFFICES, APP, chatLog }); // other buildings: guest listener and connections
  async function route(req, res, p) {
    if (p === '/api/buildings' || p === '/api/visits' || p.startsWith('/api/peers/')) return peers.route(req, res, p);
    if (p === '/api/attention') {
      const items = await attention();
      const offices = [];
      for (const o of OFFICES) { // how many people each floor has and how many are working, as each office last reported it
        const d = await readJson(path.join(PUSH, `local-${o.port}.json`), null), fresh = d && Date.now() - d.ts < 30_000 && d.people != null;
        let people = fresh ? d.people : null;
        if (people == null) { const t = await readJson(path.join(HOME, o.dir, 'team.json'), null), tm = await readJson(path.join(HOME, o.dir, 'temps.json'), []); people = t ? (t.personas || []).length + (Array.isArray(tm) ? tm.length : 0) : 0; }
        offices.push({ name: o.name, port: o.port, count: items.filter((x) => x.port === o.port).length, people, working: fresh ? d.working : null });
      }
      json(res, 200, { here: port, items, offices });
      return true;
    }
    if (p === '/api/people' || p.startsWith('/api/people/')) { // who is on every team and what they are told: `team-person` does the work
      const cmd = p === '/api/people' ? 'json' : p.slice('/api/people/'.length);
      if (!['json', 'save', 'add', 'start', 'protocol', 'ask-remove'].includes(cmd) || (cmd !== 'json' && req.method !== 'POST')) { json(res, 404, { error: 'not found' }); return true; }
      const body = cmd === 'json' ? '' : JSON.stringify(await readBody(req, 400_000));
      const out = await new Promise((resolve) => {
        const c = execFile(path.join(HOME, '.local', 'bin', 'team-person'), [cmd], { timeout: 120_000, maxBuffer: 8e6 }, (err, stdout) => resolve(stdout || JSON.stringify({ error: err ? String(err.message).slice(0, 200) : 'no answer' })));
        c.stdin.end(body);
      });
      let d; try { d = JSON.parse(out); } catch { d = { error: 'bad answer from team-person' }; }
      json(res, d.error ? 400 : 200, d);
      return true;
    }
    if (p === '/api/upload' || p === '/api/upload/file') { // pictures attached to a message: kept on this computer so the agent can open them by path
      const root = path.join(SHARED, 'uploads'), TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
      if (p === '/api/upload/file') {
        const rel = String(new URL(req.url, 'http://x').searchParams.get('p') || ''), m = /^\d{4}-\d\d-\d\d\/[a-z0-9-]+\.(jpg|png|webp|gif)$/.exec(rel);
        const buf = m ? await fs.readFile(path.join(root, rel)).catch(() => null) : null;
        if (!buf) { json(res, 404, { error: 'not found' }); return true; }
        res.writeHead(200, { 'content-type': TYPES[m[1]], 'cache-control': 'private, max-age=86400' }); res.end(buf);
        return true;
      }
      if (req.method !== 'POST') { json(res, 405, { error: 'post' }); return true; }
      const ext = Object.keys(TYPES).find((k) => TYPES[k] === String(req.headers['content-type'] || '').split(';')[0].trim());
      if (!ext) { json(res, 415, { error: 'Only JPEG, PNG, WebP or GIF images.' }); return true; }
      const buf = await new Promise((resolve) => { const parts = []; let n = 0; req.on('data', (c) => { n += c.length; if (n > 12e6) { resolve(null); req.destroy(); } else parts.push(c); }); req.on('end', () => resolve(Buffer.concat(parts))); req.on('error', () => resolve(null)); });
      if (!buf || !buf.length) { json(res, 413, { error: 'The image is too large (12 MB at most).' }); return true; }
      const now = new Date(), day = now.toLocaleDateString('sv'), name = `${now.toLocaleTimeString('sv').replace(/:/g, '')}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
      await fs.mkdir(path.join(root, day), { recursive: true });
      await fs.writeFile(path.join(root, day, name), buf);
      for (const d of await fs.readdir(root).catch(() => [])) { // two weeks is long enough for a picture sent in a message
        if (/^\d{4}-\d\d-\d\d$/.test(d) && now - new Date(d) > 15 * 864e5) await fs.rm(path.join(root, d), { recursive: true, force: true }).catch(() => {});
      }
      json(res, 200, { path: path.join(root, day, name), rel: `${day}/${name}` });
      return true;
    }
    if (p === '/api/artifacts' || p === '/api/artifacts/delete') { // pages people published with `team-artifact` (served by ~/.omniloy-office/artifacts on port 4340)
      const root = path.join(HOME, '.omniloy-team', 'artifacts'), ok = (x) => /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(String(x || ''));
      if (p === '/api/artifacts') {
        const items = [];
        for (const owner of await fs.readdir(root).catch(() => [])) {
          if (!ok(owner)) continue;
          for (const slug of await fs.readdir(path.join(root, owner)).catch(() => [])) {
            const m = ok(slug) ? await readJson(path.join(root, owner, slug, 'meta.json'), null) : null;
            if (m) items.push({ owner, slug, title: m.title || slug, kind: m.kind || 'html', updated: m.updated || m.created || '' });
          }
        }
        items.sort((x, y) => (x.updated < y.updated ? 1 : -1));
        json(res, 200, { port: 4340, items, host: ((await readJson(path.join(HOME, '.omniloy-team', 'remote.json'), null)) || {}).host || '' }); // host: the computer's Tailscale name, for links that work on the owner's other devices
      } else if (req.method !== 'POST') json(res, 405, { error: 'post' });
      else {
        const b = await readBody(req).catch(() => ({}));
        if (!ok(b.owner) || !ok(b.slug)) { json(res, 400, { error: 'which one?' }); return true; }
        const done = await new Promise((resolve) => execFile(path.join(HOME, '.local', 'bin', 'team-artifact'), ['rm', `${b.owner}/${b.slug}`], { timeout: 20_000 }, (err) => resolve(!err)));
        json(res, done ? 200 : 404, done ? { ok: true } : { error: 'not found' });
      }
      return true;
    }
    if (p === '/api/workers') { // the helpers each person on this floor has running: the room draws them as tiny copies of the person
      const byName = {};
      await Promise.all(((agents ? agents() : []) || []).filter((a) => a.herdrName && a.status !== 'offline').map(async (a) => { const list = publicWorkers(await workersOf(await logOf(a.herdrName))); if (list.length) byName[a.herdrName] = list; }));
      json(res, 200, { byName }); return true;
    }
    if (p === '/api/chat' || p.startsWith('/api/chat/')) { // a chat with one person: someone on this floor (?name=), or the superadmin above the building (no name), the same from every floor
      const q = new URL(req.url, 'http://x').searchParams;
      let body = {};
      if (req.method === 'POST') { let raw = ''; for await (const c of req) { raw += c; if (raw.length > 20000) break; } try { body = JSON.parse(raw) || {}; } catch { /* not json */ } }
      const name = String(q.get('name') || body.name || '');
      let me = null, admin = false;
      if (name) me = (agents ? agents() : []).find((x) => x.herdrName === name) || null;
      else { const team = await readJson(path.join(HOME, '.omniloy-admin', 'team.json'), { personas: [] }); me = team.personas.find((x) => x.herdrName === team.lead) || team.personas[0]; admin = true; }
      if (!me) { json(res, 404, { error: name ? 'nobody with that name on this floor' : 'there is no superadmin' }); return true; }
      const person = { herdrName: me.herdrName, name: String(me.name || me.herdrName).split(' ')[0], role: me.role || '', color: me.color || '#fbbf24', admin };
      const hcDo = (args) => new Promise((resolve) => execFile(path.join(HOME, '.local', 'bin', 'hc'), args, { timeout: 60_000 }, (err) => resolve(!err)));
      if (p === '/api/chat') {
        json(res, 200, { ...(await chatLog(me.herdrName, Number(q.get('pos')) || 0, q.get('file') || '', String(q.get('worker') || '').replace(/[^A-Za-z0-9]/g, ''))), person });
      } else if (p === '/api/chat/status') {
        let t = {}; try { t = JSON.parse(await hcOut(['get', me.herdrName, '--json'])); } catch { /* not running */ }
        json(res, 200, { person, live: t.state === 'live', working: !!(t.status && t.status.state === 'working') });
      } else if (req.method !== 'POST') json(res, 405, { error: 'post' });
      else if (p === '/api/chat/send') {
        const text = String(body.text || '').trim();
        if (!text || text.length > 6000) json(res, 400, { error: 'message is empty or too long' });
        else { const ok = await hcDo(['send', '--json', me.herdrName, '--', text]); json(res, ok ? 200 : 502, ok ? { ok: true } : { error: `${person.name} is not running in Herdr` }); }
      } else if (p === '/api/chat/stop') { const ok = await hcDo(['interrupt', me.herdrName, '--json']); json(res, ok ? 200 : 502, ok ? { ok: true } : { error: 'could not stop' }); }
      else json(res, 404, { error: 'not found' });
      return true;
    }
    if (p === '/api/voice' || p.startsWith('/api/voice/')) { // speaking to the lead: the transcription runs on this machine (voice/office-stt.py)
      const cfgFile = path.join(SHARED, 'voice', 'stt.json'), cfg = await readJson(cfgFile, null);
      const o = officeOf(port), team = await readJson(path.join(HOME, o.dir, 'team.json'), { personas: [] });
      const lp = team.personas.find((x) => x.herdrName === team.lead) || team.personas[0] || null; // the lead, else the first person on the floor
      const lead = lp ? { herdrName: lp.herdrName, name: String(lp.name).split(' ')[0] } : null;
      if (p === '/api/voice') {
        let ready = false, info = {};
        if (cfg && cfg.url) { try { const r = await fetch(`${cfg.url}/health`, { signal: AbortSignal.timeout(2500) }); info = await r.json(); ready = !!info.ok; } catch { /* not running */ } }
        json(res, 200, { configured: !!(cfg && cfg.url), ready, engine: info.engine || (cfg && cfg.engine) || '', model: info.model || (cfg && cfg.model) || '', keywords: (cfg && cfg.keywords) || [], lead });
        return true;
      }
      if (p === '/api/voice/reply') { // what the lead has answered to what was just spoken
        const q = new URL(req.url, 'http://x').searchParams, name = q.get('name') || '';
        if (!lead || name !== lead.herdrName) { json(res, 404, { error: 'unknown teammate' }); return true; }
        json(res, 200, await voiceReply(name, Date.now() - (Number(q.get('age')) || 0) - 5000, String(q.get('q') || '').slice(0, 80)));
        return true;
      }
      if (req.method !== 'POST') { json(res, 405, { error: 'post' }); return true; }
      if (p === '/api/voice/transcribe') {
        if (!cfg || !cfg.url) { json(res, 409, { error: 'no transcription service on this computer' }); return true; }
        const chunks = []; let n = 0;
        for await (const c of req) { n += c.length; if (n > 12_000_000) { json(res, 413, { error: 'that recording is too long' }); return true; } chunks.push(c); }
        try {
          const q = new URLSearchParams({ context: (cfg.keywords || []).join(', '), language: cfg.language || '' });
          const r = await fetch(`${cfg.url}/transcribe?${q}`, { method: 'POST', body: Buffer.concat(chunks), headers: { 'content-type': 'audio/wav' }, signal: AbortSignal.timeout(180_000) });
          json(res, r.ok ? 200 : 502, await r.json());
        } catch { json(res, 502, { error: 'the transcription service did not answer' }); }
        return true;
      }
      const b = await readBody(req, 60_000);
      if (p === '/api/voice/keywords') {
        if (!cfg) { json(res, 409, { error: 'no transcription service on this computer' }); return true; }
        const words = [...new Set((Array.isArray(b.keywords) ? b.keywords : []).map((w) => String(w).replace(/\s+/g, ' ').trim()).filter((w) => w && w.length <= 60))].slice(0, 200);
        await writeJson(cfgFile, { ...cfg, keywords: words });
        json(res, 200, { ok: true, keywords: words });
        return true;
      }
      if (p === '/api/voice/setup') { // nobody has set it up here: the lead of this floor gets the instructions
        if (!lead) { json(res, 409, { error: 'nobody on this floor to ask' }); return true; }
        const doc = path.join(APP, 'voice', 'SETUP.md');
        const msg = `__OWNER__ wants to talk to the office by voice from his phone, and this computer has no working transcription service${cfg ? ' (it is configured but not answering)' : ' yet'}. Please set it up following ${doc}: it says which engine fits this machine (macOS, Linux or Windows; strong or weak), how to install it, keep it running and test it. The server script is in the same folder. Ask __OWNER__ with team-ask only for what only he can do (accepting a model's conditions, logging in for a token). Tell him when the Speak button works.`;
        const ok = await new Promise((resolve) => execFile(path.join(HOME, '.local', 'bin', 'hc'), ['send', '--json', lead.herdrName, '--', msg], { timeout: 60_000 }, (err) => resolve(!err)));
        json(res, ok ? 200 : 502, ok ? { ok: true, lead } : { error: `the message did not reach ${lead.name}` });
        return true;
      }
      json(res, 404, { error: 'not found' });
      return true;
    }
    if (!p.startsWith('/api/push/')) return false;
    if (p === '/api/push/key') { json(res, 200, { key: (await keys()).pub }); return true; }
    if (req.method !== 'POST') { json(res, 405, { error: 'post' }); return true; }
    const b = await readBody(req);
    if (p === '/api/push/subscribe') {
      const s = b.sub || {};
      if (!/^https:\/\//.test(String(s.endpoint || '')) || !s.keys || !s.keys.p256dh || !s.keys.auth) { json(res, 400, { error: 'bad subscription' }); return true; }
      const subs = (await readJson(SUBS, [])).filter((x) => x.endpoint !== s.endpoint);
      subs.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, port, added: new Date().toISOString() });
      await writeJson(SUBS, subs.slice(-20));
      const sent = await sendAll({ title: 'Notifications are on', body: 'You will hear from every office here.', port, hash: '', tag: 'hello' }, s.endpoint);
      json(res, 200, { ok: true, status: sent[0] || 0 });
      return true;
    }
    if (p === '/api/push/unsubscribe') { await writeJson(SUBS, (await readJson(SUBS, [])).filter((x) => x.endpoint !== b.endpoint)); json(res, 200, { ok: true }); return true; }
    if (p === '/api/push/test') { json(res, 200, { status: await sendAll({ title: 'Test from the office', body: 'This is how a notification looks.', port, hash: '', tag: 'test' }, b.endpoint || null) }); return true; }
    json(res, 404, { error: 'not found' });
    return true;
  }
  return { attention, route, encrypt };
}
