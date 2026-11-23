// Keeps this computer linked to the buildings found on Herdr's other machines (run once per computer, not per floor).
// For every connected machine that has an office (it has ~/.omniloy-team/building.json) it holds one ssh connection that
//   - brings each of their floors' guest listeners to a local port (6000 + slot*100 + n), and
//   - takes each of our floors' guest listeners to a port over there, so they can see and answer us too;
// then it greets them (/peer/hello) and opens one "door" per foreign floor (7000 + slot*100 + n): the address a browser
// uses to visit that floor. The door lets in this computer and the Tailscale logins of remote.json, like the offices,
// and tells the other side which building is looking. Everything stays on 127.0.0.1 and inside ssh.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';

const HOME = os.homedir(), SHARED = path.join(HOME, '.omniloy-team'), BIN = path.join(HOME, '.local', 'bin');
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);
const readJson = async (f, dflt) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return dflt; } };
const run = (cmd, args, opt = {}) => new Promise((resolve) => { const c = execFile(cmd, args, { timeout: 20_000, maxBuffer: 4e6, ...opt }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout), err: String(stderr) })); if (opt.input !== undefined) c.stdin.end(opt.input); });
const TS = ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/bin/tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale'];

const links = new Map();  // machine name -> { proc, id }
const doors = new Map();  // door port -> { target port }
const waits = new Map();  // machine name -> { fails, next }: a link that keeps failing is retried less and less often
let remote = null, me = null, slots = {};
const failed = (name, why) => {
  const w = waits.get(name) || { fails: 0, next: 0 }; w.fails++;
  const ms = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(6, w.fails - 1)); // 30 s, 1 min, 2 min … 30 min
  w.next = Date.now() + ms; waits.set(name, w);
  log(`${name}: ${why}; next try in ${Math.round(ms / 1000)} s`);
};

// Tailscale Serve (the phone door) connects from this computer too and passes the client's Host header on, so a
// request is "from this computer" only with a local Host AND none of the headers a proxy adds; anything proxied must
// pass the remote.json login check.
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'via', 'tailscale-user-login', 'tailscale-user-name', 'tailscale-user-profile-pic', 'tailscale-headers-info', 'tailscale-app-capabilities'];
const proxied = (req) => PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
function door(port) {
  if (doors.has(port)) return;
  doors.set(port, {});
  http.createServer(async (req, res) => {
    const d = doors.get(port), host = String(req.headers.host || '').toLowerCase();
    const local = (host === `127.0.0.1:${port}` || host === `localhost:${port}`) && !proxied(req);
    const login = String(req.headers['tailscale-user-login'] || '').toLowerCase();
    const far = remote && remote.host && host.split(':')[0] === String(remote.host).toLowerCase() && login && (remote.logins || []).some((l) => String(l).toLowerCase() === login);
    if (!local && !far) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"bad host"}'); }
    if (!d.target) { res.writeHead(502, { 'content-type': 'text/plain' }); return res.end('That building is not reachable right now.'); }
    const peers = (await readJson(path.join(SHARED, 'peers.json'), {})).peers || {};
    const home = ((await readJson(path.join(SHARED, 'building.json'), {})).floors || [])[0]; // "back to mine": this building's ground floor, same host
    const headers = { ...req.headers, host: `127.0.0.1:${d.target}`, 'x-peer-id': me.id, 'x-peer-key': (peers[d.id] || {}).key || '', 'x-peer-user': me.owner || '', 'x-peer-back': home ? String(home.port) : '' };
    delete headers['tailscale-user-login']; delete headers['tailscale-user-name'];
    // the owner leaves a message with that floor's lead: its answer may come back here, and team-peer takes an answer
    // only against such a record, so it is written before the message goes out and taken back if it did not arrive
    const asks = req.method === 'POST' && String(req.url).split('?')[0] === '/api/guest/message' && d.id;
    if (asks && !(await run(path.join(BIN, 'team-peer'), ['asked', d.id])).ok) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"error":"could not note the message here; try again"}'); }
    const up = http.request({ host: '127.0.0.1', port: d.target, method: req.method, path: req.url, headers }, (r) => {
      // taken back only when that floor refused it for good (4xx); a 5xx or a broken link may have saved it there
      if (asks && r.statusCode >= 400 && r.statusCode < 500 && ![408, 429].includes(r.statusCode)) run(path.join(BIN, 'team-peer'), ['asked', d.id, '--undo']);
      res.writeHead(r.statusCode || 502, r.headers); r.pipe(res);
    });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' }); res.end('That building is not reachable right now.'); });
    req.pipe(up);
  }).listen(port, '127.0.0.1').on('error', (e) => log(`door ${port}: ${e.message}`));
}
async function serveDoor(port) { // the phone comes in through Tailscale, like for the offices
  if (!remote) return;
  for (const t of TS) { try { await fs.access(t); const r = await run(t, ['serve', '--bg', `--https=${port}`, `http://127.0.0.1:${port}`]); if (!r.ok) log(`tailscale serve ${port}: ${r.err.trim().split('\n')[0]}`); return; } catch { /* next */ } }
}

async function link(m) {
  const r = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', m.target, 'cat ~/.omniloy-team/building.json 2>/dev/null']);
  let b = null; try { b = JSON.parse(r.out); } catch { /* no office there */ }
  if (!b || !b.id || !(b.floors || []).length || b.id === me.id) return;
  const slot = slots[m.name] || (slots[m.name] = Math.max(0, ...Object.values(slots).filter(Number.isFinite)) + 1);
  const mine = (await readJson(path.join(SHARED, 'building.json'), {})).floors || [];
  // Our floors' ports over there: a block of 10 picked from our id. Another building (or a stale link of ours) may hold
  // that block on their side; then ssh says "remote port forwarding failed" and the next try moves to the next block.
  const rb = slots.remote || (slots.remote = {}), block = rb[m.name] ?? (rb[m.name] = parseInt(me.id.slice(0, 2), 16) % 30);
  const T = (j) => 6000 + slot * 100 + j, D = (j) => 7000 + slot * 100 + j, R = (k) => 6900 + block * 10 + k;
  const args = ['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3', '-o', 'ConnectTimeout=10'];
  b.floors.forEach((f, j) => args.push('-L', `127.0.0.1:${T(j)}:127.0.0.1:${f.port + 1000}`));
  mine.forEach((f, k) => args.push('-R', `127.0.0.1:${R(k)}:127.0.0.1:${f.port + 1000}`));
  const proc = spawn('ssh', [...args, m.target], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errText = ''; proc.stderr.on('data', (c) => { errText = (errText + c).slice(-400); });
  links.set(m.name, { proc, id: b.id });
  proc.on('exit', (code) => {
    const why = errText.trim().split('\n').pop() || '';
    log(`link to ${m.name} ended (${code}) ${why}`); links.delete(m.name); for (const [, d] of doors) if (d.id === b.id) d.target = 0;
    if (/remote port forwarding failed/i.test(errText)) { // that block is taken over there: the next try uses the next one
      slots.remote = { ...(slots.remote || {}), [m.name]: (block + 1) % 30 };
      fs.writeFile(path.join(SHARED, 'peer-slots.json'), JSON.stringify(slots)).catch(() => {});
    }
    failed(m.name, 'the link ended');
  });
  await new Promise((ok) => setTimeout(ok, 3000));
  if (!links.has(m.name)) return;
  try { await greet(m, b, mine, proc, T, D, R); } catch (e) { log(`${m.name}: ${e.message}`); proc.kill(); } // never a link without doors
}
async function greet(m, b, mine, proc, T, D, R) {
  const known = ((await readJson(path.join(SHARED, 'peers.json'), {})).peers || {})[b.id] || {}, key = known.key || crypto.randomBytes(16).toString('hex');
  let card = null, myCard = [];
  try { myCard = (await (await fetch(`http://127.0.0.1:${mine[0].port + 1000}/peer/info`, { signal: AbortSignal.timeout(4000) })).json()).floors || []; } catch { /* our floors are starting */ }
  try {
    const res = await fetch(`http://127.0.0.1:${T(0)}/peer/hello`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ from: me, key, machine: os.hostname().split('.')[0], floors: mine.map((f, k) => ({ ...(myCard.find((x) => x.port === f.port) || {}), port: f.port, name: f.name, local: R(k) })) }) });
    const d = await res.json(); if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`); card = d.card || {};
  } catch (e) { log(`${m.name}: the building did not greet back (${e.message})`); proc.kill(); return; }
  const floors = (card.floors || b.floors).map((f) => { const j = b.floors.findIndex((x) => x.port === f.port); return j < 0 ? null : { ...f, local: T(j), door: D(j) }; }).filter(Boolean);
  await run(path.join(BIN, 'team-peer'), ['incoming', 'hello'], { input: JSON.stringify({ from: { id: card.id || b.id, name: card.name || b.name, owner: card.owner || b.owner || '' }, key, machine: m.name, floors }) });
  for (const f of floors) { door(f.door); Object.assign(doors.get(f.door), { target: f.local, id: b.id }); await serveDoor(f.door); }
  waits.delete(m.name);
  log(`linked to ${m.name}: ${card.name || b.name}, ${floors.length} floor(s), doors ${floors.map((f) => f.door).join(', ')}`);
}

async function round() {
  remote = await readJson(path.join(SHARED, 'remote.json'), null);
  await run(path.join(BIN, 'team-peer'), ['me']);
  me = (await readJson(path.join(SHARED, 'peers.json'), {})).me;
  slots = await readJson(path.join(SHARED, 'peer-slots.json'), {});
  const r = await run(path.join(BIN, 'hc'), ['machine', 'ls', '--json']);
  let machines = []; try { machines = JSON.parse(r.out).machines || []; } catch { /* Herdr is closed */ }
  for (const m of machines) {
    if (m.state !== 'connected' || m.temporary || links.has(m.name)) continue;
    if ((waits.get(m.name) || {}).next > Date.now()) continue; // backing off after failures
    try { await link(m); } catch (e) { failed(m.name, e.message); }
  }
  await fs.writeFile(path.join(SHARED, 'peer-slots.json'), JSON.stringify(slots)).catch(() => {});
}
process.on('SIGTERM', () => { for (const l of links.values()) l.proc.kill(); process.exit(0); });
process.on('SIGINT', () => { for (const l of links.values()) l.proc.kill(); process.exit(0); });
await round(); setInterval(round, 30_000);
