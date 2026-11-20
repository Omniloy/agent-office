// The room's terminal: a real shell on this computer (or an ssh session to another of the owner's machines),
// shown in the office page. Only the owner's page reaches it: these routes sit behind the office token, and the
// guest listener for other buildings never serves them. Nothing runs by itself: a command an agent marks in a
// message is only text until the owner presses Run.
//   GET  /api/term/info                      -> { host, user, cwd, machines, sessions }
//   GET  /api/term/stream?id=local|<machine> -> server-sent events: init (what is on screen), out, exit
//   POST /api/term/input  { id, data }       keys typed in the page
//   POST /api/term/run    { id, cmd, from }  a command pressed in a message; when it finishes, its author is sent what it printed
//   POST /api/term/resize { id, cols, rows } · POST /api/term/kill { id }
//   GET  /api/term/last?id=                  -> { cmd, text, done } what the last pressed command printed, as plain text
// What the terminals print is also kept as plain text in ~/.omniloy-team/terminal.log (this user only), so the
// agent who asked for a command can read the result with `team-term tail`.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, 'pty-bridge.py');
const HOME = os.homedir();
const HC = path.join(HOME, '.local', 'bin', 'hc'), DELIVER = path.join(HOME, '.local', 'bin', 'team-deliver');
const LOG = path.join(HOME, '.omniloy-team', 'terminal.log');
const KEEP = 300_000; // bytes of screen kept for a page that opens later
const NAME = /^[a-z0-9][a-z0-9._-]{0,62}$/i;

export const clean = (s) => s
  .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '').replace(/\x1b[()][0-9A-Za-z]/g, '').replace(/\x1b[@-Z\\-_=>]/g, '')
  .replace(/\r+\n/g, '\n').replace(/[^\n\x08]\x08/g, '').replace(/[^\n\x08]\x08/g, '').split('\n').map((l) => l.slice(l.lastIndexOf('\r') + 1)).join('\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

// What a command printed, without the line that echoes it and without the prompt that follows.
const PROMPT = /[#$%>❯»] ?$/;
export function printed(since, cmd = '') {
  const L = clean(since).split('\n'), head = cmd.split('\n')[0].slice(0, 24);
  const at = head ? L.slice(0, 8).findIndex((l) => l.includes(head)) : -1; // the line that echoes the command (a new shell prints a few lines before it)
  L.splice(0, at >= 0 ? at + 1 : 1);
  while (L.length && !L[L.length - 1].trim()) L.pop();
  if (L.length && PROMPT.test(L[L.length - 1]) && L[L.length - 1].length < 200) L.pop();
  return L.join('\n').trim();
}

export function createTerm({ teamDir, owner = 'the owner' }) {
  const sessions = new Map();
  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', (d) => { n += d.length; if (n > 200_000) { reject(new Error('too long')); req.destroy(); } else parts.push(d); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
  const sh = (cmd, args, timeout = 8000) => new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 4e6 }, (err, stdout) => resolve(err ? '' : String(stdout))));

  let machines = { at: 0, list: [] };
  async function otherMachines() { // the owner's other computers, as Herdr knows them (they are also ssh names)
    if (Date.now() - machines.at < 60000) return machines.list;
    let list = [];
    try { list = (JSON.parse(await sh(HC, ['ls', '--json'])).machines || []).map((m) => String(m.name || '')).filter((n) => NAME.test(n) && n !== 'local'); } catch { /* no Herdr here */ }
    machines = { at: Date.now(), list };
    return list;
  }
  const validId = async (id) => id === 'local' || (NAME.test(id) && (await otherMachines()).includes(id));

  function logText(text) {
    try {
      fs.mkdirSync(path.dirname(LOG), { recursive: true });
      fs.appendFileSync(LOG, text, { mode: 0o600 });
      if (fs.statSync(LOG).size > 1_500_000) { const all = fs.readFileSync(LOG, 'utf8'); fs.writeFileSync(LOG, all.slice(-400_000), { mode: 0o600 }); }
    } catch { /* the log is a convenience */ }
  }
  function start(id) {
    const argv = id === 'local' ? [process.env.SHELL || '/bin/bash', '-l'] : ['ssh', '-t', '-o', 'ConnectTimeout=10', id];
    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    delete env.OFFICE_TOKEN; delete env.PORT;
    if (!env.LANG) env.LANG = 'en_US.UTF-8';
    const child = spawn('python3', [BRIDGE, ...argv], { cwd: teamDir, env, stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] });
    const s = { id, child, chunks: [], size: 0, clients: new Set(), alive: true, since: '', cmd: '', pend: '', started: Date.now(), idle: id === 'local', lastOut: Date.now(), run: 0, done: true };
    const emit = (event, data) => { for (const res of s.clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    const flush = (all) => { // whole lines only, so an escape code cut in two never reaches the log
      const cut = all ? s.pend.length : s.pend.lastIndexOf('\n') + 1;
      if (cut > 0) { logText(clean(s.pend.slice(0, cut))); s.pend = s.pend.slice(cut); }
    };
    const onData = (d) => {
      s.chunks.push(d); s.size += d.length;
      while (s.size > KEEP && s.chunks.length > 1) s.size -= s.chunks.shift().length;
      const t = d.toString('utf8'); s.lastOut = Date.now();
      s.since = (s.since + t).slice(-60_000); s.pend += t; flush(s.pend.length > 8000);
      emit('out', d.toString('base64'));
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.stdin.on('error', () => {}); child.stdio[3].on('error', () => {}); child.stdio[4].on('error', () => {});
    child.stdio[4].on('data', (d) => { const w = String(d).trim().split('\n').pop(); if (w === 'idle' || w === 'busy') s.idle = w === 'idle'; }); // the bridge says when the shell is back at its prompt
    child.on('error', (e) => onData(Buffer.from(`\r\n[the terminal could not start: ${e.message}]\r\n`)));
    child.on('exit', () => { s.alive = false; flush(true); emit('exit', {}); });
    sessions.set(id, s);
    logText(`\n### ${new Date().toISOString().slice(0, 19).replace('T', ' ')} terminal opened (${id === 'local' ? os.hostname() : id})\n`);
    return s;
  }
  // A pressed command has finished when the shell is waiting at its prompt again. A local shell tells us exactly
  // (pty-bridge.py); over ssh we go by a quiet screen that ends in a prompt. Its author is then sent what it printed.
  function watch(s, cmd, person, where) {
    const mine = ++s.run, typed = Date.now(); let warned = false; s.done = false;
    // typed in now, or queued by team-deliver while the agent is on a question in its terminal (never answers it)
    const tell = (text) => { if (person) execFile(DELIVER, [person.herdrName, text, '--source', 'term'], { timeout: 180000 }, () => {}); };
    const short = cmd.length > 300 ? `${cmd.slice(0, 300)}…` : cmd;
    const tick = () => {
      if (s.run !== mine) return; // another command was pressed after this one
      const age = Date.now() - typed, quiet = Date.now() - s.lastOut;
      const back = !s.alive || (s.id === 'local' ? s.idle && age > 1200 && quiet > 500 : age > 2500 && quiet > 2500 && PROMPT.test(clean(s.since).trimEnd().split('\n').pop() || ''));
      if (back) {
        s.done = true;
        const out = printed(s.since, cmd), secs = Math.round(age / 1000);
        logText(`\n### ${new Date().toISOString().slice(0, 19).replace('T', ' ')} finished after ${secs}s${s.alive ? '' : ' (the terminal ended)'}\n`);
        return tell(`${owner} ran the command you marked, in the office terminal on ${where}, and it has finished (${secs}s): ${short}\n\nIt printed${out.length > 3500 ? ' (the last part; all of it: `team-term last`)' : ''}:\n${out ? out.slice(-3500) : '(nothing)'}\n\nDo not ask for the output to be pasted.`);
      }
      if (!warned && age > 5 * 60000) { warned = true; tell(`${owner} ran the command you marked, in the office terminal on ${where}, ${Math.round(age / 60000)} minutes ago and it is still running (it may be waiting for input from ${owner}): ${short}\nYou will be told when it finishes. \`team-term last\` shows what it has printed so far.`); }
      if (age < 2 * 3600000) setTimeout(tick, 500).unref();
    };
    setTimeout(tick, 800).unref();
  }
  const live = (id) => { const s = sessions.get(id); return s && s.alive ? s : start(id); };
  async function personas() { // everyone on this computer's teams, to know who can be told
    const out = [];
    try {
      for (const d of fs.readdirSync(HOME)) {
        if (!d.startsWith('.omniloy-')) continue;
        try { for (const p of JSON.parse(fs.readFileSync(path.join(HOME, d, 'team.json'), 'utf8')).personas || []) out.push(p); } catch { /* not a team folder */ }
      }
    } catch { /* nothing to read */ }
    return out;
  }
  function stop() { for (const s of sessions.values()) { try { s.child.stdin.end(); s.child.kill('SIGTERM'); } catch { /* gone */ } } }
  process.on('exit', stop);

  async function route(req, res, p, url) {
    if (!p.startsWith('/api/term/')) return false;
    try {
      if (p === '/api/term/info') {
        return json(res, 200, { host: os.hostname().replace(/\.local$/, ''), user: os.userInfo().username, cwd: teamDir.replace(HOME, '~'), machines: await otherMachines(),
          sessions: Object.fromEntries([...sessions].map(([id, s]) => [id, { alive: s.alive }])) }), true;
      }
      if (req.method === 'GET') {
        const id = String(url.searchParams.get('id') || 'local');
        if (!(await validId(id))) return json(res, 400, { error: 'unknown machine' }), true;
        if (p === '/api/term/last') { const s = sessions.get(id); return json(res, 200, { cmd: s ? s.cmd : '', text: s ? printed(s.since, s.cmd).slice(-8000) : '', done: s ? s.done : true }), true; }
        if (p === '/api/term/stream') {
          const s = live(id);
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
          res.write(`event: init\ndata: ${JSON.stringify(Buffer.concat(s.chunks).toString('base64'))}\n\n`);
          s.clients.add(res);
          const ping = setInterval(() => res.write(': ping\n\n'), 20000);
          req.on('close', () => { clearInterval(ping); s.clients.delete(res); });
          return true;
        }
        return json(res, 404, { error: 'not found' }), true;
      }
      if (req.method !== 'POST' || !String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'json only' }), true;
      const body = await readBody(req), id = String(body.id || 'local');
      if (!(await validId(id))) return json(res, 400, { error: 'unknown machine' }), true;
      if (p === '/api/term/kill') { const s = sessions.get(id); if (s && s.alive) { s.child.stdin.end(); setTimeout(() => { try { s.child.kill('SIGKILL'); } catch { /* gone */ } }, 1500); } return json(res, 200, { ok: true }), true; }
      if (p === '/api/term/resize') {
        const cols = Math.min(400, Math.max(20, Number(body.cols) || 100)), rows = Math.min(200, Math.max(5, Number(body.rows) || 30));
        const s = sessions.get(id); if (s && s.alive) s.child.stdio[3].write(`${cols} ${rows}\n`);
        return json(res, 200, { ok: true }), true;
      }
      if (p === '/api/term/input') {
        const data = String(body.data ?? ''); if (!data || data.length > 100_000) return json(res, 400, { error: 'nothing to type' }), true;
        live(id).child.stdin.write(data);
        return json(res, 200, { ok: true }), true;
      }
      if (p === '/api/term/run') {
        const cmd = String(body.cmd || '').replace(/\r/g, '').trim();
        if (!cmd || cmd.length > 8000) return json(res, 400, { error: 'the command is empty or too long' }), true;
        const fresh = !(sessions.get(id) && sessions.get(id).alive), s = live(id);
        const who = String(body.from || ''), person = who ? (await personas()).find((x) => x.herdrName === who || x.slug === who) : null;
        const where = id === 'local' ? os.hostname().replace(/\.local$/, '') : id;
        logText(`\n### ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${owner} ran on ${where}${person ? ` (marked by ${person.herdrName})` : ''}: ${cmd}\n`);
        s.done = false;
        setTimeout(() => { s.since = ''; s.cmd = cmd; if (s.alive) s.child.stdin.write(`${cmd.replace(/\n/g, '\r')}\r`); watch(s, cmd, person, where); }, fresh ? (id === 'local' ? 700 : 2500) : 0); // a new shell needs a moment before it listens
        return json(res, 200, { ok: true, told: person ? person.name : '' }), true;
      }
      return json(res, 404, { error: 'not found' }), true;
    } catch (e) { return json(res, 500, { error: e.message }), true; }
  }
  return { route, stop };
}
