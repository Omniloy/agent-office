#!/usr/bin/env node
// control-<<app>>: drive <<App name>> the way a user does, and leave evidence behind.
// Generated from the mstack verify-kit template (mx-create-verification-skill). Contract: references/cli-contract.md.
// Run `node control-<<app>>.mjs --help`. Exit codes: 0 ok, 1 usage, 2 wrong target or instance, 3 assertion failed,
// 4 timeout, 5 MANUAL (a path this driver cannot reach; reported, never faked).
//
// How it works: `launch` starts the app (if CONFIG.launch is set) and a small driver process that owns one Chromium
// (Playwright). Every other command talks to that driver over 127.0.0.1, so page state survives between commands.
// Ports and the browser profile come from a hash of the checkout path, so two checkouts never share an instance.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// ---- fill these in for the app (env vars override them, which is how the kit's own tests drive a fixture app)
const CONFIG = {
  app: process.env.VERIFY_APP || '<<app>>',
  launch: process.env.VERIFY_LAUNCH || null,          // e.g. 'pnpm dev --port {port}' ({port} is the derived port); null = attach to url
  url: process.env.VERIFY_URL || 'http://127.0.0.1:{port}/', // the page to open after launch
  readyText: process.env.VERIFY_READY || null,         // a log line that means "usable" (else: url answers 200 and appMarker is visible)
  appMarker: process.env.VERIFY_MARKER || 'body',      // a positive marker of the right page, e.g. '[data-app=office]'
  devOrigins: (process.env.VERIFY_DEV_ORIGINS || '').split(',').filter(Boolean), // non-local origins allowed (dev only, never production)
  sources: (process.env.VERIFY_SOURCES || 'src').split(',').filter(Boolean),    // for STALE BUILD: newest source mtime ...
  build: process.env.VERIFY_BUILD || null,             // ... must be older than this build output (file or folder); null = no build step
  secretSelectors: (process.env.VERIFY_SECRETS || 'input[type=password]').split(','),
  intents: {                                           // intent verbs: name -> steps run in order (each step is a command line)
    // 'open-board': [['click', 'role=button[name="Board"]'], ['wait-settle']],
  },
};

const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const HOME = os.homedir();
const EXIT = { ok: 0, usage: 1, target: 2, assert: 3, timeout: 4, manual: 5 };

function crc32(s) { let c, crc = 0xffffffff; for (const b of Buffer.from(s)) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); if (v !== undefined) o[k] = v; else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[k] = argv[++i]; else o[k] = true; }
    else o._.push(a);
  }
  return o;
}
function playwright() {
  for (const p of [path.join(process.cwd(), 'node_modules/playwright'), path.join(HOME, 'node_modules/playwright')]) {
    try { return require(p); } catch {}
  }
  try { return require('playwright'); } catch {}
  return null;
}
function ident(checkout) {
  const h = crc32(path.resolve(checkout));
  const port = Number(process.env.VERIFY_PORT || 41000 + (h % 2000));
  const dir = path.join(os.tmpdir(), `verify-${CONFIG.app}-${h.toString(16)}`);
  return { port, driverPort: 43000 + (h % 2000), dir, state: path.join(dir, 'state.json'), profile: process.env.VERIFY_PROFILE || path.join(dir, 'profile') };
}
const fill = (s, id) => s && s.replaceAll('{port}', String(id.port));
function outDir(o) { const d = o.out || process.env.EVIDENCE_OUT || path.join(process.cwd(), 'verify-out'); fs.mkdirSync(d, { recursive: true }); return d; }
function readState(id) { try { return JSON.parse(fs.readFileSync(id.state, 'utf8')); } catch { return null; } }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function isLocal(u) { try { const h = new URL(u).hostname; return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h); } catch { return false; } }
function newestMtime(p) {
  let best = 0; const walk = (q) => { let st; try { st = fs.statSync(q); } catch { return; }
    if (st.isDirectory()) { if (/node_modules|\.git$/.test(q)) return; for (const f of fs.readdirSync(q)) walk(path.join(q, f)); } else best = Math.max(best, st.mtimeMs); };
  walk(p); return best;
}
function ask(id, body, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const st = readState(id);
    if (!st) return resolve({ ok: false, code: EXIT.target, error: `no instance for this checkout: run launch --checkout ${id.checkout} first` });
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: st.driverPort, path: '/cmd', method: 'POST', headers: { 'content-type': 'application/json', 'x-token': st.token } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false, code: EXIT.target, error: 'driver answered garbage' }); } });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, code: EXIT.timeout, error: `driver did not answer in ${timeoutMs} ms` }); });
    req.on('error', () => resolve({ ok: false, code: EXIT.target, error: 'the driver is not running (state file is stale): run cleanup, then launch' }));
    req.end(data);
  });
}

// ---------------------------------------------------------------- the driver (a detached process started by launch)
async function driver(o) {
  const id = ident(o.checkout); const pw = playwright();
  const token = Math.random().toString(36).slice(2);
  const logs = { console: [], network: [] };
  const browser = await pw.chromium.launch({ headless: o.headed ? false : true });
  let recordDir = null, context, page, tracing = false;
  async function open(video) {
    const url = page ? page.url() : fill(CONFIG.url, id);
    if (context) await context.close();
    context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(video ? { recordVideo: { dir: video, size: { width: 1280, height: 800 } } } : {}) });
    page = await context.newPage();
    page.on('console', (m) => logs.console.push({ type: m.type(), text: m.text(), at: Date.now() }));
    page.on('pageerror', (e) => logs.console.push({ type: 'pageerror', text: String(e), at: Date.now() }));
    page.on('response', (r) => logs.network.push({ status: r.status(), method: r.request().method(), url: r.url(), at: Date.now() }));
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await mask();
  }
  async function mask() { await page.addStyleTag({ content: CONFIG.secretSelectors.map((s) => `${s}{-webkit-text-security:disc!important;filter:blur(4px)!important}`).join('\n') }).catch(() => {}); }
  const loc = (sel) => page.locator(sel).first();
  const handlers = {
    async info() { return { url: page.url(), title: await page.title(), recording: !!recordDir, tracing }; },
    async goto({ args }) { await page.goto(args[0], { waitUntil: 'domcontentloaded' }); await mask(); return { url: page.url() }; },
    async snapshot() { return { aria: await page.locator('body').ariaSnapshot() }; },
    async screenshot({ args, out }) { const f = path.join(out, `${args[0] || 'screen'}-${Date.now()}.png`); await page.screenshot({ path: f, fullPage: true }); return { file: f, evidence: [f] }; },
    async click({ args }) { await loc(args[0]).click({ timeout: 10000 }); return {}; },
    async type({ args, secret }) { await loc(args[0]).fill(args[1] ?? '', { timeout: 10000 }); return secret ? { typed: '***' } : { typed: args[1] }; },
    async press({ args }) { await page.keyboard.press(args[0]); return {}; },
    async 'wait-settle'({ args }) { await page.waitForLoadState('networkidle', { timeout: Number(args[0] || 10000) }).catch(() => {}); await page.waitForTimeout(150); return {}; },
    async assert({ args }) {
      const [kind, sel, want, extra] = args; const l = page.locator(sel);
      let got, pass;
      if (kind === 'visible') { got = await l.first().isVisible().catch(() => false); pass = got === true; }
      else if (kind === 'absent') { got = await l.count(); pass = got === 0 || !(await l.first().isVisible()); }
      else if (kind === 'text') { got = (await l.first().textContent({ timeout: 5000 }).catch(() => null)) ?? null; pass = got !== null && got.trim().includes(String(want)); }
      else if (kind === 'attr') { got = await l.first().getAttribute(want, { timeout: 5000 }).catch(() => null); pass = got === extra; }
      else if (kind === 'count') { got = await l.count(); pass = got === Number(want); }
      else return { usage: 'assert visible|absent|text|attr|count <selector> [want] [value]' };
      return { kind, selector: sel, want: kind === 'attr' ? `${want}=${extra}` : want, got, assertions: { run: 1, failed: pass ? 0 : 1 } };
    },
    async record({ args, out }) {
      if (args[0] === 'start') { recordDir = fs.mkdtempSync(path.join(id.dir, 'video-')); await open(recordDir); return { recording: true }; }
      if (args[0] === 'stop') {
        if (!recordDir) return { usage: 'record stop without record start' };
        const v = page.video(); await context.close(); context = null; const webm = path.join(out, `${args[1] || 'journey'}-${Date.now()}.webm`);
        await v.saveAs(webm); const ev = [webm]; let mp4 = null;
        try { mp4 = webm.replace(/\.webm$/, '.mp4'); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', mp4]); ev.push(mp4); } catch { mp4 = null; }
        const last = recordDir; recordDir = null; page = null; await open(null); fs.rmSync(last, { recursive: true, force: true });
        return { webm, mp4, evidence: ev, warnings: mp4 ? [] : ['ffmpeg missing or failed: only webm kept'] };
      }
      return { usage: 'record start|stop [name]' };
    },
    async trace({ args, out }) {
      if (args[0] === 'start') { await context.tracing.start({ screenshots: true, snapshots: true }); tracing = true; return { tracing }; }
      if (args[0] === 'stop') { const f = path.join(out, `${args[1] || 'trace'}-${Date.now()}.zip`); await context.tracing.stop({ path: f }); tracing = false; return { file: f, evidence: [f], view: `npx playwright show-trace ${f}` }; }
      return { usage: 'trace start|stop [name]' };
    },
    async console({ out }) { const f = path.join(out, `console-${Date.now()}.json`); fs.writeFileSync(f, JSON.stringify(logs.console, null, 1)); return { errors: logs.console.filter((x) => x.type === 'error' || x.type === 'pageerror').length, entries: logs.console.length, evidence: [f] }; },
    async 'network-log'({ out }) { const f = path.join(out, `network-${Date.now()}.json`); fs.writeFileSync(f, JSON.stringify(logs.network, null, 1)); return { failed: logs.network.filter((x) => x.status >= 400).length, entries: logs.network.length, evidence: [f] }; },
    async 'probe-selectors'({ args }) {
      const sels = args.length ? args : [CONFIG.appMarker];
      const res = []; for (const s of sels) res.push({ selector: s, count: await page.locator(s).count() });
      const missing = res.filter((r) => r.count === 0).length;
      return { selectors: res, assertions: { run: res.length, failed: missing } };
    },
    async eval({ args }) { return { value: await page.evaluate(args[0]) }; },
  };
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => {
      if (req.headers['x-token'] !== token) { res.writeHead(403); return res.end('{}'); }
      const msg = JSON.parse(b || '{}'); let out;
      try {
        if (msg.cmd === 'shutdown') { out = { ok: true }; res.end(JSON.stringify(out)); await browser.close().catch(() => {}); process.exit(0); }
        const h = handlers[msg.cmd]; if (!h) throw new Error(`unknown command ${msg.cmd}`);
        out = { ok: true, ...(await h(msg)) };
      } catch (e) { out = { ok: false, code: /Timeout/.test(String(e)) ? EXIT.timeout : EXIT.target, error: String(e.message || e).split('\n')[0] }; }
      res.end(JSON.stringify(out));
    });
  });
  srv.listen(id.driverPort, '127.0.0.1', async () => {
    await open(null);
    const st = readState(id) || {}; fs.writeFileSync(id.state, JSON.stringify({ ...st, driverPid: process.pid, driverPort: id.driverPort, token }));
  });
}

// ---------------------------------------------------------------- commands run in the caller's process
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return false; }
function get(url) { return new Promise((r) => { const q = http.get(url, (res) => { res.resume(); r(res.statusCode); }); q.on('error', () => r(0)); q.setTimeout(2000, () => { q.destroy(); r(0); }); }); }

async function launch(o, id) {
  const st = readState(id);
  if (st && ((st.appPid && alive(st.appPid)) || (st.driverPid && alive(st.driverPid)))) return { code: EXIT.target, error: `an instance for this checkout is already running (pid ${st.appPid || st.driverPid}): run cleanup first, or use it as is` };
  if (!playwright()) return { code: EXIT.target, error: 'playwright not found: use the repo\'s own or ~/node_modules/playwright (never add it as a dependency for this)' };
  fs.mkdirSync(id.dir, { recursive: true }); fs.mkdirSync(id.profile, { recursive: true });
  const url = fill(CONFIG.url, id);
  if (!isLocal(url) && !CONFIG.devOrigins.some((d) => url.startsWith(d))) return { code: EXIT.target, error: `refused: ${url} is not a local or listed dev origin (never production)` };
  const state = { checkout: path.resolve(o.checkout), url, port: id.port, started: new Date().toISOString() };
  if (CONFIG.launch) {
    const logf = path.join(id.dir, 'app.log'); const fd = fs.openSync(logf, 'w');
    const p = spawn('/bin/sh', ['-c', fill(CONFIG.launch, id)], { cwd: o.checkout, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, PORT: String(id.port) } });
    p.unref(); state.appPid = p.pid; state.appLog = logf;
  }
  fs.writeFileSync(id.state, JSON.stringify(state));
  const ready = await waitFor(async () => (CONFIG.readyText && state.appLog ? fs.readFileSync(state.appLog, 'utf8').includes(CONFIG.readyText) : true) && (await get(url)) === 200, Number(o.timeout || 60000));
  if (!ready) return { code: EXIT.timeout, error: `the app did not become ready at ${url}; see ${state.appLog || 'the app'} (run cleanup)` };
  const d = spawn(process.execPath, [SELF, '__driver', '--checkout', o.checkout, ...(o.headed ? ['--headed'] : [])], { detached: true, stdio: 'ignore', env: process.env });
  d.unref();
  const up = await waitFor(async () => { const s = readState(id); return !!(s && s.token); }, 30000);
  if (!up) return { code: EXIT.timeout, error: 'the driver did not start (is Chromium installed for this Playwright? `npx playwright install chromium`)' };
  const m = await ask(id, { cmd: 'probe-selectors', args: [CONFIG.appMarker] });
  if (!m.ok || m.assertions.failed) return { code: EXIT.target, error: `the page at ${url} has no app marker ${CONFIG.appMarker}: wrong app on this port?`, result: m };
  return { result: { url, port: id.port, appPid: state.appPid || null, driverPid: readState(id).driverPid } };
}
async function doctor(o, id) {
  const st = readState(id); const checks = []; const add = (name, ok, detail) => checks.push({ name, ok, detail });
  add('instance for this checkout', !!st, st ? id.state : 'none: launch first');
  if (st) {
    if (st.appPid) add('app process we started is alive', alive(st.appPid), `pid ${st.appPid}`);
    add('driver alive', !!(st.driverPid && alive(st.driverPid)), `pid ${st.driverPid}`);
    add('origin is local or dev', isLocal(st.url) || CONFIG.devOrigins.some((d) => st.url.startsWith(d)), st.url);
    add('url answers 200', (await get(st.url)) === 200, st.url);
    if (st.appPid) { let owner = ''; try { owner = execFileSync('lsof', ['-nP', `-iTCP:${st.port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim(); } catch {}
      const ours = owner.split('\n').filter(Boolean).some((p) => { try { return execFileSync('ps', ['-o', 'pgid=', '-p', p], { encoding: 'utf8' }).trim() === String(st.appPid); } catch { return false; } });
      add('port owned by the app we started', ours || owner === '', owner ? `pids ${owner.replace(/\n/g, ',')}` : 'nobody listens'); }
  }
  if (CONFIG.build) { const src = Math.max(...CONFIG.sources.map((s) => newestMtime(path.join(o.checkout, s)))); const out = newestMtime(path.join(o.checkout, CONFIG.build));
    add('build is fresh', out >= src, out >= src ? 'ok' : 'STALE BUILD: rebuild before driving (a stale build is not evidence)'); }
  const bad = checks.filter((c) => !c.ok);
  return { code: bad.length ? EXIT.target : EXIT.ok, result: { checks }, error: bad.length ? bad.map((b) => `${b.name}: ${b.detail}`).join('; ') : undefined };
}
async function cleanup(o, id) {
  const st = readState(id); const killed = [];
  if (st) {
    if (st.driverPid && alive(st.driverPid)) { await ask(id, { cmd: 'shutdown' }, 5000); await waitFor(async () => !alive(st.driverPid), 5000); if (alive(st.driverPid)) process.kill(st.driverPid, 'SIGTERM'); killed.push(st.driverPid); }
    if (st.appPid && alive(st.appPid)) { try { process.kill(-st.appPid, 'SIGTERM'); } catch { try { process.kill(st.appPid, 'SIGTERM'); } catch {} } killed.push(st.appPid); }
  }
  fs.rmSync(id.dir, { recursive: true, force: true }); // only our scratch: evidence lives in --out / $EVIDENCE_OUT and survives
  return { result: { killed, removed: id.dir } };
}

const HELP = `control-${CONFIG.app}: drive ${CONFIG.app} like a user and leave evidence.

  control-${CONFIG.app} <command> --checkout <dir> [--json] [--out <dir>]

  launch [--headed]            start the app (if configured) and the driver for this checkout
  doctor                       read-only: instance, port owner, local origin, build freshness (STALE BUILD)
  info | cleanup               show the instance | stop what launch started (never by name); evidence survives
  goto <url>                   navigate
  snapshot                     ARIA snapshot of the page
  screenshot [name]            full-page png into --out / $EVIDENCE_OUT
  click <selector>             type <selector> <text> [--secret]  (or --secret-env VAR: the value never reaches argv or the evidence)   press <key>   wait-settle [ms]
  assert visible|absent <sel>  assert text <sel> <substring>   assert attr <sel> <name> <value>   assert count <sel> <n>
  record start | record stop [name]   video (webm, plus mp4 +faststart when ffmpeg is there); start before the journey
  trace start | trace stop [name]     Playwright trace zip (npx playwright show-trace <zip>)
  console | network-log        write the logs captured so far; counts of errors and 4xx/5xx
  probe-selectors [sel...]     cheap drift check: each selector (default: the app marker) must match
  eval <js>                    read state after the user path; never trigger a handler as proof
  do <intent>                  run an intent verb: ${Object.keys(CONFIG.intents).join(', ') || '(none defined yet)'}
  manual <what>                report a path this driver cannot reach (exit 5)

Selectors are Playwright selectors (role=button[name="Save"], text=Done, css). Ports and profile come from a hash of
--checkout; attaching without --checkout is refused. Selectors from another repo are never valid here.
--json prints {ok, command, target, result, assertions: {run, failed}, evidence: [paths], warnings, ms}.
Exit: 0 ok, 1 usage, 2 wrong target or instance, 3 assertion failed, 4 timeout, 5 MANUAL.
Example: control-${CONFIG.app} launch --checkout ~/.omniloy-misc/work/lanes/MSC-3-1 --json`;

async function run(o) {
  const cmd = o._[0];
  if (o.help || cmd === 'help') return { code: EXIT.ok, text: HELP };
  if (!cmd) return { code: EXIT.usage, text: HELP };
  if (cmd === '__driver') { await driver(o); return null; }
  if (cmd === 'manual') return { code: EXIT.manual, error: `MANUAL: ${o._.slice(1).join(' ') || 'this path'} cannot be driven by control-${CONFIG.app}; name the blocker and the closest real path (team-evidence skip)` };
  o.checkout = o.checkout || process.env.VERIFY_CHECKOUT;
  if (!o.checkout) return { code: EXIT.target, error: 'refused: --checkout <dir> is required (attaching to an instance you did not start is not allowed)' };
  if (!fs.existsSync(o.checkout)) return { code: EXIT.usage, error: `no such checkout: ${o.checkout}` };
  const id = ident(o.checkout); id.checkout = o.checkout;
  if (cmd === 'launch') return launch(o, id);
  if (cmd === 'doctor') return doctor(o, id);
  if (cmd === 'cleanup') return cleanup(o, id);
  if (cmd === 'do') {
    const steps = CONFIG.intents[o._[1]]; if (!steps) return { code: EXIT.usage, error: `no intent ${o._[1]}; defined: ${Object.keys(CONFIG.intents).join(', ') || 'none'}` };
    const all = { run: 0, failed: 0 }, ev = [];
    for (const s of steps) { const r = await run({ ...o, _: s }); if (r.assertions) { all.run += r.assertions.run; all.failed += r.assertions.failed; } ev.push(...(r.evidence || [])); if (r.code) return { ...r, assertions: all, evidence: ev }; }
    return { result: { intent: o._[1], steps: steps.length }, assertions: all, evidence: ev, code: all.failed ? EXIT.assert : EXIT.ok };
  }
  const known = ['info', 'goto', 'snapshot', 'screenshot', 'click', 'type', 'press', 'wait-settle', 'assert', 'record', 'trace', 'console', 'network-log', 'probe-selectors', 'eval'];
  if (!known.includes(cmd)) return { code: EXIT.usage, error: `unknown command ${cmd}; see --help` };
  const args = o._.slice(1);
  if (cmd === 'type' && o['secret-env']) { if (process.env[o['secret-env']] === undefined) return { code: EXIT.usage, error: `env var ${o['secret-env']} is not set` }; args[1] = process.env[o['secret-env']]; o.secret = true; }
  const r = await ask(id, { cmd, args, out: outDir(o), secret: !!o.secret }, Number(o.timeout || 60000));
  if (!r.ok) return { code: r.code || EXIT.target, error: r.error };
  if (r.usage) return { code: EXIT.usage, error: r.usage };
  const { ok, evidence, assertions, warnings, ...result } = r;
  return { result, evidence: evidence || [], assertions, warnings, code: assertions && assertions.failed ? EXIT.assert : EXIT.ok };
}

const t0 = Date.now(); const o = parse(process.argv.slice(2));
const r = await run(o);
if (r) {
  if (r.text) { console.log(r.text); process.exit(r.code); }
  const shown = o.secret && o._[0] === 'type' ? [o._[0], o._[1], '***'] : o._;
  const body = { ok: !r.code, command: shown.join(' '), target: o.checkout || null, result: r.result ?? null, assertions: r.assertions || { run: 0, failed: 0 }, evidence: r.evidence || [], warnings: r.warnings || [], ms: Date.now() - t0, ...(r.error ? { error: r.error } : {}) };
  if (o.json) console.log(JSON.stringify(body));
  else { if (r.error) console.error(r.error); else console.log(JSON.stringify(body.result, null, 1)); if (body.assertions.run) console.log(`assertions: ${body.assertions.run - body.assertions.failed}/${body.assertions.run} passed`); }
  process.exit(r.code || 0);
}
