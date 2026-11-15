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
let remote = null, me = null, slots = {};

function door(port) {
  if (doors.has(port)) return;
  doors.set(port, {});
  http.createServer(async (req, res) => {
    const d = doors.get(port), host = String(req.headers.host || '').toLowerCase();
    const local = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
    const login = String(req.headers['tailscale-user-login'] || '').toLowerCase();
    const far = remote && remote.host && host.split(':')[0] === String(remote.host).toLowerCase() && login && (remote.logins || []).some((l) => String(l).toLowerCase() === login);
    if (!local && !far) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"bad host"}'); }
    if (!d.target) { res.writeHead(502, { 'content-type': 'text/plain' }); return res.end('That building is not reachable right now.'); }
    const peers = (await readJson(path.join(SHARED, 'peers.json'), {})).peers || {};
    const headers = { ...req.headers, host: `127.0.0.1:${d.target}`, 'x-peer-id': me.id, 'x-peer-key': (peers[d.id] || {}).key || '', 'x-peer-user': me.owner || '', 'x-peer-back': d.back || '' };
    delete headers['tailscale-user-login']; delete headers['tailscale-user-name'];
    const up = http.request({ host: '127.0.0.1', port: d.target, method: req.method, path: req.url, headers }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
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
  const slot = slots[m.name] || (slots[m.name] = Math.max(0, ...Object.values(slots)) + 1);
  const mine = (await readJson(path.join(SHARED, 'building.json'), {})).floors || [];
  const T = (j) => 6000 + slot * 100 + j, D = (j) => 7000 + slot * 100 + j, R = (k) => 6900 + (parseInt(me.id.slice(0, 2), 16) % 30) * 10 + k;
  const args = ['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3', '-o', 'ConnectTimeout=10'];
  b.floors.forEach((f, j) => args.push('-L', `127.0.0.1:${T(j)}:127.0.0.1:${f.port + 1000}`));
  mine.forEach((f, k) => args.push('-R', `127.0.0.1:${R(k)}:127.0.0.1:${f.port + 1000}`));
  const proc = spawn('ssh', [...args, m.target], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errText = ''; proc.stderr.on('data', (c) => { errText = (errText + c).slice(-400); });
  links.set(m.name, { proc, id: b.id });
  proc.on('exit', (code) => { log(`link to ${m.name} ended (${code}) ${errText.trim().split('\n').pop() || ''}`); links.delete(m.name); for (const [p, d] of doors) if (d.id === b.id) d.target = 0; });
  await new Promise((ok) => setTimeout(ok, 3000));
  if (!links.has(m.name)) return;
  const known = ((await readJson(path.join(SHARED, 'peers.json'), {})).peers || {})[b.id] || {}, key = known.key || crypto.randomBytes(16).toString('hex');
  let card = null, myCard = [];
  try { myCard = (await (await fetch(`http://127.0.0.1:${mine[0].port + 1000}/peer/info`, { signal: AbortSignal.timeout(4000) })).json()).floors || []; } catch { /* our floors are starting */ }
  try {
    const res = await fetch(`http://127.0.0.1:${T(0)}/peer/hello`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ from: me, key, machine: os.hostname().split('.')[0], floors: mine.map((f, k) => ({ ...(myCard.find((x) => x.port === f.port) || {}), port: f.port, name: f.name, local: R(k) })) }) });
    const d = await res.json(); if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`); card = d.card;
  } catch (e) { log(`${m.name}: the building did not greet back (${e.message})`); proc.kill(); return; }
  const floors = (card.floors || b.floors).map((f) => { const j = b.floors.findIndex((x) => x.port === f.port); return { ...f, local: T(j), door: D(j) }; });
  await run(path.join(BIN, 'team-peer'), ['incoming', 'hello'], { input: JSON.stringify({ from: { id: card.id || b.id, name: card.name || b.name, owner: card.owner || b.owner || '' }, key, machine: m.name, floors }) });
  for (const f of floors) { door(f.door); Object.assign(doors.get(f.door), { target: f.local, id: b.id }); await serveDoor(f.door); }
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
    try { await link(m); } catch (e) { log(`${m.name}: ${e.message}`); }
  }
  await fs.writeFile(path.join(SHARED, 'peer-slots.json'), JSON.stringify(slots)).catch(() => {});
}
process.on('SIGTERM', () => { for (const l of links.values()) l.proc.kill(); process.exit(0); });
process.on('SIGINT', () => { for (const l of links.values()) l.proc.kill(); process.exit(0); });
await round(); setInterval(round, 30_000);
