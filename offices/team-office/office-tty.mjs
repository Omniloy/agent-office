#!/usr/bin/env node
// Office in a terminal: runs the real 3D office page in a headless browser and streams it
// into this terminal with the Kitty graphics protocol, passing mouse and keyboard through.
// Made for a Herdr tab (Herdr panels cannot embed a web page, but its terminals draw images).
//   node office-tty.mjs            Ctrl+C quits.
//   OFFICE_DPR=1.5  sharper picture, fewer frames per second (default 1)
//   OFFICE_FPS=30   frame rate cap
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = `http://127.0.0.1:${Number(process.env.PORT) || 4317}`;
const DPR = Math.min(2, Math.max(0.5, Number(process.env.OFFICE_DPR) || 1));
const FPS = Math.min(60, Math.max(1, Number(process.env.OFFICE_FPS) || 30));
const SCREEN_SCALE = Number(process.env.OFFICE_SCREEN_SCALE) || 2; // terminal pixels per page pixel (Retina = 2)
const LOG = process.env.OFFICE_LOG || path.join(ROOT, process.env.PORT && process.env.PORT !== '4317' ? `tty-${process.env.PORT}.log` : 'tty.log');
const log = (...a) => { try { fs.appendFileSync(LOG, `${new Date().toISOString().slice(11, 19)} ${a.join(' ')}\n`); } catch {} };
const out = (s) => process.stdout.write(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!process.stdin.isTTY || !process.stdout.isTTY) { console.error('office-tty needs a terminal.'); process.exit(1); }

// ------------------------------------------------------------------ terminal
let acks = 0, lastAck = Date.now();
const waiters = [];
function onReply(kind, m) { for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].kind === kind) { waiters.splice(i, 1)[0].resolve(m); } }
const reply = (kind, ms) => new Promise((resolve) => { const w = { kind, resolve }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, ms); });

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  out('\x1b_Ga=d,d=A\x1b\\\x1b[?1003l\x1b[?1006l\x1b[?2004l\x1b[?25h\x1b[?1049l');
  try { process.stdin.setRawMode(false); } catch {}
}
let browser = null;
async function quit(code = 0) { restore(); if (browser) await browser.close().catch(() => {}); process.exit(code); }
process.on('exit', restore);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => quit(0));

process.stdin.setRawMode(true);
process.stdin.resume();
out('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H  Opening the office…');

async function pixelSize() {
  out('\x1b[14t');
  const m = await reply('size', 700);
  const cols = process.stdout.columns, rows = process.stdout.rows;
  return m ? { cols, rows, pw: Number(m[2]), ph: Number(m[1]) } : { cols, rows, pw: cols * 16, ph: rows * 34 };
}

// ------------------------------------------------------------------ server + browser
async function ensureServer() {
  const up = () => fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (await up()) return;
  spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) { await sleep(250); if (await up()) return; }
  throw new Error('the office server did not start');
}
function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = ['playwright-core'];
  try { tries.push(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@playwright', 'cli', 'node_modules', 'playwright-core')); } catch {}
  for (const t of tries) { try { return req(t); } catch {} }
  throw new Error('playwright-core is not installed');
}

let page = null, cdp = null, term = null, view = { w: 0, h: 0 };
let latest = null, frames = 0, sent = 0, ackMs = 0, bytes = 0, timeouts = 0;

async function applySize() {
  term = await pixelSize();
  view = { w: Math.max(480, Math.round(term.pw / SCREEN_SCALE)), h: Math.max(320, Math.round(term.ph / SCREEN_SCALE)) };
  if (page) await page.setViewportSize({ width: view.w, height: view.h });
  log(`terminal ${term.cols}x${term.rows} cells, ${term.pw}x${term.ph}px; page ${view.w}x${view.h} at ${DPR}x`);
}

// ------------------------------------------------------------------ frames out
let imageId = 1;
async function sendLoop() {
  const gap = 1000 / FPS;
  for (;;) {
    const t = Date.now();
    const frame = latest;
    if (frame) {
      latest = null;
      const id = imageId === 1 ? 2 : 1, old = imageId;
      let s = '\x1b[?2026h\x1b[H';
      for (let o = 0; o < frame.length; o += 4096) {
        const more = o + 4096 < frame.length ? 1 : 0;
        s += `\x1b_G${o === 0 ? `a=T,f=100,t=d,i=${id},q=0,C=1,c=${term.cols},r=${term.rows},` : ''}m=${more};${frame.slice(o, o + 4096)}\x1b\\`;
      }
      s += `\x1b_Ga=d,d=I,i=${old},q=2\x1b\\\x1b[?2026l`;
      const ok = reply('gfx', 400), t0 = Date.now();
      if (!process.stdout.write(s)) await new Promise((r) => process.stdout.once('drain', r));
      if (!(await ok)) timeouts++; // the terminal has taken this frame: natural back-pressure
      ackMs += Date.now() - t0; bytes += frame.length;
      imageId = id; sent++;
    }
    await sleep(Math.max(1, gap - (Date.now() - t)));
  }
}
setInterval(() => {
  log(`last 5s: browser ${frames} frames, sent ${sent}, acknowledged ${acks}, no-ack ${timeouts}, avg ${sent ? Math.round(ackMs / sent) : 0}ms per frame, ${sent ? Math.round(bytes / sent / 1024) : 0}KB each`);
  frames = sent = acks = ackMs = bytes = timeouts = 0;
}, 5000).unref();

// ------------------------------------------------------------------ input in
const queue = [];
let pumping = false, pendingMove = null, buttons = 0;
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length || pendingMove) {
    const job = queue.shift() || (() => { const m = pendingMove; pendingMove = null; return () => page.mouse.move(m.x, m.y); })();
    try { await job(); } catch (e) { log('input error', e.message); }
  }
  pumping = false;
}
const act = (fn) => { queue.push(fn); pump(); };
const toPage = (cx, cy) => ({ x: ((cx - 0.5) / term.cols) * view.w, y: ((cy - 0.5) / term.rows) * view.h });
const KEYS = { '\r': 'Enter', '\n': 'Enter', '\x7f': 'Backspace', '\b': 'Backspace', '\t': 'Tab', '\x1b': 'Escape',
  '\x1b[A': 'ArrowUp', '\x1b[B': 'ArrowDown', '\x1b[C': 'ArrowRight', '\x1b[D': 'ArrowLeft', '\x1b[3~': 'Delete', '\x1b[H': 'Home', '\x1b[F': 'End' };

// Scrolling zooms. A touchpad sends a burst of small steps, plus sideways steps (buttons 66/67) and the odd
// step in the opposite direction; those two used to be read as zoom and made it jump back and forth.
// Steps are added up and sent as one wheel move per pass through the queue.
let wheelSum = 0, wheelAt = null, wheelDir = 0, wheelTime = 0, wheelQueued = false;
function onWheel(b, p) {
  if (b & 2) return; // sideways
  const dir = b & 1 ? 1 : -1, now = Date.now();
  if (dir !== wheelDir && now - wheelTime < 120) return; // a stray reverse step inside a gesture
  wheelDir = dir; wheelTime = now; wheelSum += dir * 50; wheelAt = p;
  if (wheelQueued) return;
  wheelQueued = true;
  act(async () => {
    const dy = Math.max(-600, Math.min(600, wheelSum)), at = wheelAt;
    wheelSum = 0; wheelQueued = false;
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, dy);
  });
}

let inbuf = '';
function onInput(chunk) {
  inbuf += chunk.toString('utf8');
  for (;;) {
    if (!inbuf) return;
    let m;
    if ((m = /^\x1b_G([^\x1b]*)\x1b\\/.exec(inbuf))) { acks++; lastAck = Date.now(); onReply('gfx', m); }
    else if ((m = /^\x1b\[4;(\d+);(\d+)t/.exec(inbuf))) onReply('size', m);
    else if ((m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(inbuf))) {
      if (page) {
        const b = Number(m[1]), p = toPage(Number(m[2]), Number(m[3])), down = m[4] === 'M';
        if (b & 64) onWheel(b, p);
        else if (b & 32) { pendingMove = p; pump(); }
        else {
          const button = ['left', 'middle', 'right'][b & 3] || 'left';
          act(async () => { await page.mouse.move(p.x, p.y); if (down) await page.mouse.down({ button }); else await page.mouse.up({ button }); });
          buttons = down ? 1 : 0;
        }
      }
    }
    else if ((m = /^\x1b\[200~([\s\S]*?)\x1b\[201~/.exec(inbuf))) { const text = m[1]; if (page) act(() => page.keyboard.insertText(text)); }
    else if (inbuf.startsWith('\x1b[200~') || /^\x1b(_G[^\x1b]*|\[[<\d;]*)?$/.test(inbuf) && inbuf.length > 1) return; // incomplete sequence: wait for more
    else if ((m = /^\x1b\[[\d;]*[A-Za-z~]/.exec(inbuf))) { const k = KEYS[m[0]]; if (k && page) act(() => page.keyboard.press(k)); }
    else if (inbuf[0] === '\x03') { quit(0); return; }
    else {
      const ch = Array.from(inbuf)[0];
      m = [ch];
      if (page) {
        if (KEYS[ch]) act(() => page.keyboard.press(KEYS[ch]));
        else if (ch >= ' ') act(() => page.keyboard.type(ch));
      }
    }
    inbuf = inbuf.slice(m[0].length);
  }
}
process.stdin.on('data', onInput);

// ------------------------------------------------------------------ browser page
let context = null, casting = false;
const startCast = async () => { if (!casting) { casting = true; await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 }); } };
const stopCast = async () => { if (casting) { casting = false; latest = null; await cdp.send('Page.stopScreencast').catch(() => {}); } };

async function openPage() {
  await ensureServer(); // the server may have stopped while the tab was hidden
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ headless: true, args: [...(process.platform === 'darwin' ? ['--use-angle=metal'] : []), '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  context = await browser.newContext({ viewport: { width: view.w, height: view.h }, deviceScaleFactor: DPR });
  page = await context.newPage();
  // Links that would open a new window (Jira cards) open in the real browser instead.
  context.on('page', async (p) => { if (p === page) return; const url = p.url() !== 'about:blank' ? p.url() : await p.waitForURL(/^https?:/, { timeout: 4000 }).then(() => p.url()).catch(() => ''); await p.close().catch(() => {}); if (/^https?:\/\//.test(url)) spawn('open', [url], { stdio: 'ignore', detached: true }).unref(); });
  await page.goto(`${BASE}/?tty=1`);
  await page.waitForFunction('window.office && window.office.ready', null, { timeout: 20000 });
  cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => { frames++; if (casting) latest = f.data; cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await startCast();
}
async function closePage() {
  const b = browser;
  casting = false; latest = null; browser = page = cdp = context = null;
  if (b) await b.close().catch(() => {});
}

// ------------------------------------------------------------------ pause when the tab is not on screen
// Herdr says which tab is showing; ours is the one this terminal is labelled with. While it is
// hidden nothing is drawn or sent, and after two minutes the hidden browser is closed too.
const HIDDEN_CLOSE_MS = Number(process.env.OFFICE_HIDDEN_CLOSE_MS) || 120000;
const tool = (n) => { const p = path.join(os.homedir(), '.local', 'bin', n); return fs.existsSync(p) ? p : n; };
const sh = (cmd, args) => new Promise((r) => execFile(cmd, args, { timeout: 4000 }, (e, o) => r(e ? null : o)));
let shown = true, hiddenSince = 0;
async function setShown(on) {
  shown = on;
  if (on) {
    if (!browser) {
      out('\x1b[2J\x1b[H  Opening the office…'); await applySize(); await openPage(); out('\x1b[2J');
      if (hiddenSince) await page.evaluate((t) => window.office.recap && window.office.recap(t), hiddenSince).catch(() => {});
    }
    else { await page.evaluate(() => window.office.pause(false)); await startCast(); }
    log('tab on screen: live');
  } else {
    hiddenSince = Date.now();
    await stopCast();
    await page.evaluate(() => window.office.pause(true)).catch(() => {});
    log('tab hidden: paused');
  }
}
async function watchTab() {
  let myTab = process.env.OFFICE_TAB || null;
  if (!myTab) { try { myTab = JSON.parse(await sh(tool('hc'), ['get', process.env.HC_TERMINAL_ID || process.env.OFFICE_NAME || 'office', '--json'])).labels['herdr.tab']; } catch {} }
  if (!myTab) { log('not in a Herdr tab: always live'); return; }
  log(`pausing whenever Herdr tab ${myTab} is not on screen`);
  for (;;) {
    await sleep(1500);
    let tab;
    try { tab = JSON.parse(await sh(process.env.OFFICE_HERDR_APP || tool('herdr-app'), ['status'])).tab; } catch { continue; } // Herdr not answering: leave as is
    try {
      if ((tab === myTab) !== shown) await setShown(tab === myTab);
      else if (!shown && browser && Date.now() - hiddenSince > HIDDEN_CLOSE_MS) { await closePage(); log('hidden for a while: browser closed'); }
    } catch (e) { log('pause/resume error', e.message); await closePage(); shown = false; hiddenSince = 0; }
  }
}

// ------------------------------------------------------------------ go
try {
  fs.writeFileSync(LOG, '');
  await ensureServer();
  await applySize();
  await openPage();
  out('\x1b[2J\x1b[?1003h\x1b[?1006h\x1b[?2004h');
  let resizing = null;
  process.stdout.on('resize', () => { clearTimeout(resizing); resizing = setTimeout(async () => { if (!browser) return; const was = casting; await stopCast(); await applySize(); out('\x1b[2J'); if (was) await startCast(); }, 150); });
  sendLoop();
  watchTab();
} catch (e) {
  restore();
  console.error(`Could not open the office: ${e.message}`);
  await quit(1);
}
