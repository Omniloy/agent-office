// Other buildings. Every floor opens a second, guest listener on its port + 1000 (127.0.0.1 only). It is what another
// building reaches through an ssh tunnel (peer-link.mjs on the computer that started the link):
//   - the same office page in guest mode: watch the room, write only to the floor's lead (it becomes a request);
//   - the small API two buildings use to greet, connect, pause, and pass messages and answers (/peer/*).
// Who is on the other end is said by the tunnel's door (x-peer-id, x-peer-key), checked against peers.json.
// All decisions and stored state live in the `team-peer` tool; this file carries things in and out, and refuses what
// a building may not do: a key only knows who is asking; anything that acts here (a message, an answer, reading the
// requests or chats) also needs the connection to be on, and an answer must fit something that was sent to it.
// The listener takes only Host 127.0.0.1/localhost (no DNS rebinding), JSON bodies, and no foreign page's Origin.
// The same file runs in both office apps.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

const HOME = os.homedir(), SHARED = path.join(HOME, '.omniloy-team'), BIN = path.join(HOME, '.local', 'bin');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const LOOK = { 4317: { floor: 0xead7b4, wall: 0xf3efe6, line: 0x5b6ee1 },
  4318: { floor: 0x3f8f88, wall: 0xe9f1ee, line: 0xfb923c } }; // a floor on another port sets its own in team.json "look"
const readJson = async (f, dflt) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return dflt; } };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
// Free text passed to team-ask as an argument: it reads "--…" as an option. A zero-width space keeps it text.
const argText = (t) => (/^-/.test(t) ? `\u200b${t}` : t);
const HIDDEN = /(^|\/)\.|\.bak|\.orig$|\.rej$|\.tmp$|~$/i; // backups and leftovers are never served
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;
const localOrigin = (o) => { try { return LOCAL_HOST.test(new URL(o).host); } catch { return false; } };
// visits.json is also written by team-peer under an flock on visits.json.lock: the same lock, taken by python
const VISIT_PY = `import fcntl, json, os, sys, time
f = sys.argv[1]; add = json.load(sys.stdin)
with open(f + ".lock", "w") as l:
    fcntl.flock(l, fcntl.LOCK_EX); now = int(time.time() * 1000)
    try: items = json.load(open(f))
    except Exception: items = []
    items = [x for x in items if x.get("until", 0) > now - 60000] + add
    tmp = f + ".tmp-" + str(os.getpid())
    with open(tmp, "w") as o: json.dump(items, o, indent=1)
    os.replace(tmp, f)`;
// A body over the limit reads as empty (so the answer is a 400, not a closed connection); past 1 MB the connection is cut
const readBody = (req, max = 60_000) => new Promise((resolve) => { let s = '', n = 0, big = false; req.on('data', (c) => { n += c.length; if (big) { if (n > 1e6) { resolve({}); req.destroy(); } return; } s += c; if (s.length > max) { big = true; s = ''; } }); req.on('end', () => { try { resolve(big ? {} : JSON.parse(s || '{}')); } catch { resolve({}); } }); req.on('error', () => resolve({})); });
const tool = (name, args, input) => new Promise((resolve) => {
  const c = execFile(path.join(BIN, name), args, { timeout: 30_000, maxBuffer: 4e6, env: { ...process.env, PATH: `${BIN}:${process.env.PATH || ''}` } }, (err, stdout, stderr) => {
    let d = null; try { d = JSON.parse(String(stdout).trim().split('\n').pop()); } catch { /* plain text */ }
    resolve({ ok: !err, out: String(stdout).trim(), err: String(stderr).trim(), json: d });
  });
  if (input !== undefined) c.stdin.end(typeof input === 'string' ? input : JSON.stringify(input)); else c.stdin.end();
});

export function createPeers({ port, agents, OFFICES, APP, chatLog, theme }) {
  const mine = OFFICES.find((o) => o.port === port) || OFFICES[0];
  const peersFile = () => readJson(path.join(SHARED, 'peers.json'), { peers: {} });
  const seenFile = () => readJson(path.join(SHARED, 'peers-seen.json'), {});

  // ---- this building's card, as another building sees it
  async function floorCard(o) {
    const t = await readJson(path.join(HOME, o.dir, 'team.json'), null); if (!t) return null;
    const live = await readJson(path.join(SHARED, 'push', `local-${o.port}.json`), null), fresh = live && Date.now() - live.ts < 30_000 && live.people != null;
    const lead = (t.personas || []).find((p) => p.herdrName === t.lead) || (t.personas || [])[0] || {};
    return { port: o.port, name: o.name, team: t.name || o.name, people: fresh ? live.people : (t.personas || []).length, working: fresh ? live.working : 0,
      lead: { name: lead.name || '', herdrName: lead.herdrName || '', color: lead.color || '#888', role: lead.role || '' },
      colors: { ...(LOOK[o.port] || LOOK[4317]), ...(t.look || {}) }, desks: Math.max(1, Math.min(8, (t.personas || []).length)) };
  }
  async function card() {
    const me = (await peersFile()).me || {};
    return { id: me.id, name: me.name, owner: me.owner, floors: (await Promise.all(OFFICES.map(floorCard))).filter(Boolean) };
  }
  // the name card other computers read over ssh to know there is a building here (peer-link.mjs): `team-peer me`
  // writes building.json, always from the floors list, so a test floor started from a checkout cannot replace it
  tool('team-peer', ['me']);

  // ---- what the owner's own pages ask (main listener, office token already checked)
  const cache = new Map(); // peer id -> { at, info }
  async function peerInfo(id, floors) {
    const c = cache.get(id); if (c && Date.now() - c.at < 8000) return c.info;
    let info = null;
    for (const f of floors) {
      try { const r = await fetch(`http://127.0.0.1:${f.local}/peer/info`, { signal: AbortSignal.timeout(2500) }); if (r.ok) { info = await r.json(); break; } } catch { /* next floor */ }
    }
    cache.set(id, { at: Date.now(), info }); return info;
  }
  async function buildings() {
    const d = await peersFile(), seen = await seenFile(), out = [];
    for (const p of Object.values(d.peers || {})) {
      const known = (seen[p.id] || {}).floors || [], info = known.length ? await peerInfo(p.id, known) : null;
      const floors = known.map((k) => { const live = info && (info.floors || []).find((x) => x.port === k.port); return { ...k, ...(live || {}), local: undefined, door: k.door || k.local }; });
      out.push({ id: p.id, name: (info && info.name) || p.name, owner: (info && info.owner) || p.owner || '', machine: p.machine || '', online: !!info, status: p.status || 'none', pausedBy: p.pausedBy || '', ask: !!p.ask, chats: !!p.chats,
        floors, myFloors: OFFICES.map((o) => ({ port: o.port, name: o.name, on: ((p.my || {})[o.port] || {}).on !== false, share: !!((p.my || {})[o.port] || {}).share })) });
    }
    return { me: d.me || {}, buildings: out };
  }
  async function visits() {
    const now = Date.now(), all = (await readJson(path.join(SHARED, 'visits.json'), [])).filter((v) => v.floor === port && v.until > now);
    return { out: all.filter((v) => v.kind === 'out'), in: all.filter((v) => v.kind === 'in') };
  }
  async function route(req, res, p) {
    if (p === '/api/buildings') { json(res, 200, await buildings()); return true; }
    if (p === '/api/visits') { json(res, 200, await visits()); return true; }
    if (p.startsWith('/api/peers/') && req.method === 'POST') {
      const verb = p.slice('/api/peers/'.length), b = await readBody(req), id = String(b.id || '');
      if (!/^[0-9a-f]{6,16}$/.test(id)) { json(res, 400, { error: 'which building?' }); return true; }
      let r;
      if (['request', 'accept', 'decline', 'disconnect'].includes(verb)) r = await tool('team-peer', [verb, id]);
      else if (verb === 'pause') r = await tool('team-peer', [b.paused === false ? 'resume' : 'pause', id]);
      else if (verb === 'floor') r = await tool('team-peer', ['floor', id, String(Number(b.port) || 0), ...(b.on === undefined ? [] : [b.on ? 'on' : 'off']), ...(b.share === undefined ? [] : [b.share ? 'share' : 'noshare'])]);
      else if (verb === 'ask' || verb === 'chats') r = await tool('team-peer', [verb, id, b.on ? 'on' : 'off']);
      else { json(res, 404, { error: 'not found' }); return true; }
      cache.clear();
      json(res, r.ok ? 200 : 400, r.ok ? { ok: true, note: r.out } : { error: r.err || r.out || 'it did not work' });
      return true;
    }
    return false;
  }

  // ---- someone writes to a person on another floor of this building: they teleport there (travel.js draws it)
  let roster = { at: 0, by: new Map() };
  async function whoIsWhere() {
    if (Date.now() - roster.at < 60_000) return roster.by;
    const by = new Map();
    for (const o of OFFICES) {
      const t = await readJson(path.join(HOME, o.dir, 'team.json'), null), tm = await readJson(path.join(HOME, o.dir, 'temps.json'), []);
      for (const x of [...((t && t.personas) || []), ...(Array.isArray(tm) ? tm : [])]) by.set(x.herdrName, { floor: o, name: x.name || x.herdrName, color: x.color || '#888' });
    }
    roster = { at: Date.now(), by }; return by;
  }
  const told = new Set();
  const SEND = /\bhc\s+send\s+(?:--[\w-]+(?:\s+\d+)?\s+)*["']?([a-z][\w-]*)["']?\s+["']?(.*)$/, PASS = /\bteam-card\s+pass\s+\S+\s+([a-z][\w-]*)\b(.*)$/;
  async function crossFloor() {
    let list = []; try { list = agents() || []; } catch { return; }
    const now = Date.now(), add = [];
    for (const a of list) for (const it of (a.activity || []).slice(-12)) {
      const ts = Number(it.ts) || 0, key = `${a.herdrName}:${ts}`;
      if (it.kind !== 'tool' || now - ts > 20_000 || told.has(key)) continue;
      const m = SEND.exec(String(it.text || '')) || PASS.exec(String(it.text || '')); if (!m) continue;
      told.add(key);
      const by = await whoIsWhere(), to = by.get(m[1]);
      if (!to || to.floor.port === port || m[1] === a.herdrName) continue; // same room: they walk, as always
      const first = (n) => String(n).split(' ')[0], text = String(m[2] || '').replace(/["'\\]+/g, '').trim().slice(0, 140);
      add.push({ kind: 'out', floor: port, who: a.herdrName, label: `On the ${to.floor.name} floor · with ${first(to.name)}`, text, until: now + 13000 },
        { kind: 'in', floor: to.floor.port, name: first(a.name), color: a.color || '#888', from: `${mine.name} floor`, to: m[1], text, until: now + 12000 });
    }
    if (told.size > 500) told.clear();
    if (!add.length) return;
    const items = add.map((v) => ({ id: Math.random().toString(16).slice(2, 12), ts: now, ...v }));
    await new Promise((resolve) => { const c = execFile('python3', ['-c', VISIT_PY, path.join(SHARED, 'visits.json')], { timeout: 10_000 }, () => resolve()); c.stdin.end(JSON.stringify(items)); });
  }
  setInterval(() => crossFloor().catch(() => {}), 3000).unref();

  // ---- the guest listener
  const themeNow = async () => { try { return theme ? await theme() : undefined; } catch { return undefined; } }; // the room's look: visitors see it too, and cannot change it
  // what a visitor never gets: screens, words, work, and the internals (terminal address, machine, runtime, turns)
  const QUIET = { screen: [], activity: [], nowDoing: '', lastSaid: '', memory: null, tickets: [], prs: [], description: '', statusMsg: '', menu: null,
    address: '', where: '', turn: 0, startedMs: 0, runtime: '', runtimeName: '', runtimeKind: '' };
  const guestState = async () => {
    const t = await readJson(path.join(HOME, mine.dir, 'team.json'), {});
    let list = []; try { list = agents() || []; } catch { /* starting */ }
    return { ts: Date.now(), agents: list.map((a) => ({ ...a, ...QUIET })), feed: [], approvals: [], watchdog: {}, trace: [], hcOk: true, prs: [], prsError: null, prsAt: 0, prsMerged: [], team: { name: t.name || mine.name }, jira: {}, projects: [], theme: await themeNow() };
  };
  async function who(req) { // which building is on the other end of the tunnel
    const id = String(req.headers['x-peer-id'] || ''), key = String(req.headers['x-peer-key'] || '');
    const p = ((await peersFile()).peers || {})[id];
    return p && p.key && p.key === key ? p : null;
  }
  const on = (peer) => !!(peer && peer.status === 'on'); // both owners agreed and nobody paused it
  // This floor's open questions a building may see and answer: only while connected and while this owner shares them
  async function sharedRequests(peer) {
    if (!on(peer) || !((peer.my || {})[port] || {}).share) return null;
    const list = agents() || [], names = new Set(list.map((a) => a.herdrName)), all = (await readJson(path.join(SHARED, 'requests.json'), { items: [] })).items || [];
    return all.filter((x) => x.status === 'open' && names.has(x.from) && (x.to || '__OWNER_ID__') !== x.from && !names.has(x.to)).map((x) => {
      const a = list.find((y) => y.herdrName === x.from) || {}, m = /^(\S+) (\d+) \(temp\)/.exec(a.name || '');
      return { ...x, name: m ? `${m[1]} ${m[2]}` : (a.name || x.from).split(' ')[0], color: a.color || '#888' };
    });
  }
  // An answer from a building must fit what went there: a request of ours to the owner (team-ask forwards those only to
  // the "home" building, team-peer forward) that is still open, or a message from one of our people on a floor
  // that is switched on for that building.
  async function answerFits(peer, b) {
    const ref = (b && b.ref) || {}, d = await peersFile();
    if (ref.local) {
      if (d.home !== peer.id || (d.sent || {})[String(Number(ref.local))] !== peer.id) return 'that request was not sent to your building'; // team-peer forward records where each one went
      const x = ((await readJson(path.join(SHARED, 'requests.json'), { items: [] })).items || []).find((y) => String(y.id) === String(Number(ref.local)));
      if (!x || x.ext || x.status !== 'open' || (x.to || '__OWNER_ID__') !== '__OWNER_ID__') return 'there is no open request with that number for your building';
      return '';
    }
    if (ref.agent) {
      const w = (await whoIsWhere()).get(String(ref.agent));
      if (!w) return 'nobody here by that name';
      if (((peer.my || {})[w.floor.port] || {}).on === false) return 'that floor is not taking messages from your building';
    }
    return '';
  }
  async function serve(res, root, rel) {
    const f = path.normalize(path.join(root, rel));
    if (!f.startsWith(root + path.sep)) return json(res, 403, { error: 'forbidden' });
    if (HIDDEN.test(path.relative(root, f))) return json(res, 404, { error: 'not found' });
    try { const buf = await fs.readFile(f); res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(buf); }
    catch { json(res, 404, { error: 'not found' }); }
  }
  const guest = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://guest'), p = url.pathname;
    try {
      // only this computer's own addresses (the tunnels arrive as 127.0.0.1): a web page renamed to 127.0.0.1 is not let in
      if (!LOCAL_HOST.test(String(req.headers.host || ''))) return json(res, 403, { error: 'bad host' });
      const origin = req.headers.origin;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'json only' }); // a browser cannot send JSON across sites without asking first
        if (origin && !localOrigin(origin) && !(await who(req))) return json(res, 403, { error: 'not from a page of this building' });
      }
      // -- building to building
      if (p === '/peer/info') return json(res, 200, await card());
      if (p === '/peer/hello' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.from || !/^[0-9a-f]{6,16}$/.test(String(b.from.id || '')) || !b.key) return json(res, 400, { error: 'bad hello' });
        // a hello may introduce a building, never take over one already met: its key changes only while nothing was agreed
        const known = ((await peersFile()).peers || {})[String(b.from.id)];
        if (known && known.key && known.key !== String(b.key) && ((known.status || 'none') !== 'none' || known.met)) return json(res, 409, { error: 'this building is already known with another key' }); // met: it was connected once (team-peer forget clears it)
        const r = await tool('team-peer', ['incoming', 'hello'], b);
        return json(res, r.ok ? 200 : 409, r.ok ? { ...(r.json || {}), card: await card() } : (r.json || { error: r.err || r.out }));
      }
      if (p.startsWith('/peer/') && req.method === 'POST') {
        const peer = await who(req); if (!peer) return json(res, 401, { error: 'unknown building' });
        const kind = p.slice('/peer/'.length);
        if (!['state', 'message', 'answer'].includes(kind)) return json(res, 404, { error: 'not found' });
        const b = await readBody(req);
        // state is how two buildings agree to connect; anything else needs the connection on
        if (kind !== 'state' && !on(peer)) return json(res, 403, { error: 'the buildings are not connected' });
        if (kind === 'answer') { const why = await answerFits(peer, b); if (why) return json(res, 403, { error: why }); }
        if (kind === 'answer' && typeof b.text === 'string') b.text = argText(b.text.trim());
        const r = await tool('team-peer', ['incoming', kind], { ...b, peer: peer.id });
        return json(res, r.ok ? 200 : 400, r.json || (r.ok ? { ok: true } : { error: r.err || r.out || 'refused' }));
      }
      // -- the page, for a person looking in from another building
      if (p === '/' || p === '/index.html') {
        const peer = await who(req), c = await floorCard(mine), me = (await peersFile()).me || {};
        const info = { building: me.name || '', owner: me.owner || '', floor: mine.name, lead: c ? c.lead : {}, viewer: peer ? { id: peer.id, name: peer.name, user: String(req.headers['x-peer-user'] || peer.owner || '') } : null,
          share: !!(peer && ((peer.my || {})[port] || {}).share), chats: !!(peer && peer.chats && peer.status === 'on'), back: String(req.headers['x-peer-back'] || '') };
        const html = (await fs.readFile(path.join(APP, 'public', 'index.html'), 'utf8')).replace('%%OFFICE_TOKEN%%', 'guest').replace('%%OFFICE_THEME%%', ((await themeNow()) || {}).effective || '')
          .replace('</head>', `<script>window.__GUEST__ = ${JSON.stringify(info).replace(/</g, '\\u003c')}; window.__FLOORS__ = [];</script><script type="module" src="/js/guest.js"></script></head>`);
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(html);
      }
      if (p === '/health') return json(res, 200, { ok: true, guest: true });
      if (p.startsWith('/vendor/three/')) { const rel = p.slice('/vendor/three/'.length); if (!/^(build|examples\/jsm)\//.test(rel)) return json(res, 403, { error: 'forbidden' }); return serve(res, path.join(APP, 'node_modules', 'three'), rel); }
      if (!p.startsWith('/api/')) return serve(res, path.join(APP, 'public'), p.slice(1));
      const peer = await who(req); // the door says which building is looking; nobody else gets the room
      if (!peer && p !== '/api/theme') return json(res, 401, { error: 'This building does not know who you are.' });
      if (p === '/api/state') return json(res, 200, await guestState());
      if (p === '/api/stream') { // sent again only when it changed
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        let last = '', n = 0;
        const send = async () => {
          const s = await guestState(), body = JSON.stringify({ ...s, ts: 0 });
          if (body !== last || ++n % 8 === 0) { last = body; n = 0; res.write(`event: state\ndata: ${JSON.stringify(s)}\n\n`); } // ~20 s keeps the connection alive
        };
        await send(); const t = setInterval(() => send().catch(() => {}), 2500); req.on('close', () => clearInterval(t)); return;
      }
      if (p === '/api/visits') { const v = await visits(), bare = (l) => l.map(({ text: _t, ...x }) => x); return json(res, 200, { out: bare(v.out), in: bare(v.in) }); } // who comes and goes, never what they said
      if (p === '/api/theme' && req.method === 'GET') return json(res, 200, (await themeNow()) || {});
      if (p === '/api/guest/message' && req.method === 'POST') { // a person from another building writes to this floor's lead
        const b = await readBody(req);
        if (!on(peer)) return json(res, 403, { error: 'Your buildings are not connected (or the connection is paused): you can look, but not write. The owners connect them from the city view.' });
        const r = await tool('team-peer', ['incoming', 'message'], { peer: peer.id, floor: port, text: String(b.text || '').slice(0, 4000), name: String(req.headers['x-peer-user'] || peer.owner || 'Someone'), building: peer.name, color: '#fbbf24' });
        return json(res, r.ok ? 200 : 400, r.json || { error: r.err || r.out || 'not delivered' });
      }
      if (p === '/api/requests') { // this floor's open questions, only while connected and while its owner shares them with that building
        const list = await sharedRequests(peer);
        return json(res, 200, { items: list || [], withLead: 0, site: '' });
      }
      if (p === '/api/requests/answer' && req.method === 'POST') {
        const list = await sharedRequests(peer);
        if (!list) return json(res, 403, { error: 'This floor does not share its requests with your building (or you are not connected).' });
        const b = await readBody(req), text = String(b.text || '').trim(); if (!text || !Number(b.id)) return json(res, 400, { error: 'empty answer' });
        if (!list.some((x) => Number(x.id) === Number(b.id))) return json(res, 403, { error: 'That request is not one this floor shares with you (or it is already closed).' }); // only what you can see
        const r = await tool('team-ask', ['answer', String(Number(b.id)), argText(`${text} (answered by ${String(req.headers['x-peer-user'] || peer.owner || 'someone')} from ${peer.name})`)]);
        return json(res, r.ok ? 200 : 400, r.ok ? { ok: true } : { error: r.err || r.out });
      }
      if (p === '/api/chat' || p === '/api/chat/status') { // reading a person's chat: only for a connected building this owner switched it on for (team-peer chats)
        const name = url.searchParams.get('name') || '', a = name && (agents() || []).find((x) => x.herdrName === name);
        if (req.method !== 'GET' || !on(peer) || !peer.chats || !a || !chatLog) return json(res, 404, { error: 'not for visitors' });
        const person = { herdrName: a.herdrName, name: String(a.name || a.herdrName).split(' ')[0], role: a.role || '', color: a.color || '#888' };
        if (p === '/api/chat/status') return json(res, 200, { person, live: a.status !== 'offline', working: a.status === 'working' });
        // a visitor never sees a terminal: no menu, and no raw screen (all there is of a Codex agent's chat)
        return json(res, 200, { ...(await chatLog(a.herdrName, Number(url.searchParams.get('pos')) || 0, url.searchParams.get('file') || '')), menu: null, screen: '', blocked: false, person });
      }
      if (p.startsWith('/api/chat/')) return json(res, 404, { error: 'not for visitors' });
      if (req.method === 'GET') return json(res, 200, p === '/api/attention' ? { here: port, items: [], offices: [] } : p === '/api/artifacts' ? { port: 0, items: [] } : p === '/api/voice' ? { ready: false } : {});
      return json(res, 403, { error: 'Visitors can only look, and write to the lead of this floor.' });
    } catch (e) { try { json(res, 500, { error: String(e.message || e).slice(0, 200) }); } catch { /* already answered */ } }
  });
  guest.on('error', (e) => console.error(`guest listener on ${port + 1000}: ${e.message}`));
  guest.listen(port + 1000, '127.0.0.1');
  return { route, card };
}
