// Drafts: what the team has prepared in __OWNER__'s name (`team-draft`, ~/.omniloy-biz/drafts.json), served by EVERY
// floor so the draft view opens from "For you" anywhere, not only on the Business floor. Shared file: the same in the
// three office apps (edit it in team-office, copy it to the other two). hub.mjs calls draftsRoute() after the office
// token has been checked. Mail content (threads, attachments) is read live from Gmail and kept a few minutes in
// memory, never on disk. Nothing is sent from here unless __OWNER__ presses Send (`team-draft send --by-owner`).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

const HOME = os.homedir(), BIN = path.join(HOME, '.local', 'bin');
const TEAM_DRAFT = path.join(BIN, 'team-draft'), TEAM_GMAIL = path.join(BIN, 'team-gmail');
const run = (cmd, args, { timeout = 30000, binary = false } = {}) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, maxBuffer: 40 * 1024 * 1024, cwd: HOME, encoding: binary ? 'buffer' : 'utf8' }, (err, stdout, stderr) =>
    resolve({ ok: !err, stdout, stderr: String(stderr || (err && err.message) || '') }));
});
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req, max = 64_000) => new Promise((resolve, reject) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > max) { reject(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { reject(new Error('bad json')); } });
});
const cache = new Map(); // key -> { at, d }   threads, calendar checks, attachment lists and bytes
const remember = (k, d) => { cache.set(k, { at: Date.now(), d }); let bytes = 0; for (const [key, v] of [...cache].reverse()) { bytes += Buffer.isBuffer(v.d) ? v.d.length : 0; if (cache.size > 60 || bytes > 80e6) cache.delete(key); } };
const fresh = (k, ms) => { const h = cache.get(k); return h && Date.now() - h.at < ms ? h.d : null; };

async function people() { // every floor's people, so a draft shows its author's name and colour anywhere
  const out = {};
  for (const d of await fs.readdir(HOME).catch(() => [])) {
    if (!d.startsWith('.omniloy-')) continue;
    try { for (const x of JSON.parse(await fs.readFile(path.join(HOME, d, 'team.json'), 'utf8')).personas || []) out[x.herdrName] = { name: x.name, color: x.color, role: x.role }; } catch { /* not a team folder */ }
  }
  return out;
}
async function draftById(id) {
  const r = await run(TEAM_DRAFT, ['json']); let d = {}; try { d = JSON.parse(r.stdout); } catch { /* none */ }
  return (d.drafts || []).find((x) => String(x.id) === String(id)) || null;
}
// Which files are safe to show inside the page; everything else is downloaded, never rendered on this origin.
const SHOWN = /^(image\/(png|jpe?g|gif|webp|bmp|heic|heif)|application\/pdf|text\/plain|video\/(mp4|webm|quicktime)|audio\/\w+)$/i;

export async function draftsRoute(req, res, p) {
  if (!p.startsWith('/api/drafts')) return false;
  const url = new URL(req.url, 'http://x'), q = (k) => url.searchParams.get(k) || '';
  try {
    if (p === '/api/drafts') {
      const r = await run(TEAM_DRAFT, ['json']);
      let d = { drafts: [] }; try { d = JSON.parse(r.stdout); } catch { /* no drafts yet */ }
      json(res, 200, { drafts: d.drafts || [], signature: d.signature || null, people: await people() }); return true;
    }
    if (p === '/api/drafts/thread') { // the mail a draft answers, with each message's attachments
      const id = String(Number(q('id')) || ''); if (!id) { json(res, 400, { error: 'id is required' }); return true; }
      const hit = fresh('th' + id, 120000); if (hit) { json(res, 200, hit); return true; }
      const r = await run(TEAM_DRAFT, ['thread', id], { timeout: 60000 });
      if (!r.ok) { json(res, 502, { error: clip(oneLine(r.stderr || r.stdout), 240) }); return true; }
      let d = { messages: [] }; try { d = JSON.parse(r.stdout); } catch { /* nothing readable */ }
      remember('th' + id, d); json(res, 200, d); return true;
    }
    if (p === '/api/drafts/files') { // what the Gmail draft itself carries attached
      const id = String(Number(q('id')) || ''); if (!id) { json(res, 400, { error: 'id is required' }); return true; }
      const hit = !url.searchParams.has('fresh') && fresh('fl' + id, 60000); if (hit) { json(res, 200, hit); return true; }
      const x = await draftById(id);
      if (!x || x.channel !== 'gmail' || !x.draftId) { json(res, 200, { files: [] }); return true; }
      const r = await run(TEAM_GMAIL, ['files', x.draftId], { timeout: 60000 });
      if (!r.ok) { json(res, 502, { error: clip(oneLine(r.stderr || r.stdout), 240) }); return true; }
      let d = { files: [] }; try { d = JSON.parse(r.stdout); } catch { /* nothing readable */ }
      remember('fl' + id, d); json(res, 200, d); return true;
    }
    if (p === '/api/drafts/file') { // one attachment's bytes: pictures and PDFs open in the page, the rest downloads
      const msg = q('msg'), part = q('part'), name = q('name').replace(/[\r\n"\\]/g, '').slice(0, 200) || 'attachment', mime = q('mime');
      if (!/^[0-9a-zA-Z_-]{6,40}$/.test(msg) || !/^[0-9.]{1,20}$/.test(part)) { json(res, 400, { error: 'bad attachment' }); return true; }
      const k = `f${msg}:${part}`; let bytes = fresh(k, 600000);
      if (!bytes) {
        const r = await run(TEAM_GMAIL, ['file', msg, part], { timeout: 90000, binary: true });
        if (!r.ok) { json(res, 502, { error: clip(oneLine(r.stderr), 240) }); return true; }
        bytes = r.stdout; remember(k, bytes);
      }
      const show = SHOWN.test(mime) && !url.searchParams.has('download');
      res.writeHead(200, {
        'content-type': show ? mime : 'application/octet-stream', 'content-length': bytes.length, 'cache-control': 'private, max-age=600',
        'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
        'content-disposition': `${show ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      });
      res.end(bytes); return true;
    }
    if (p === '/api/drafts/event') { // a calendar draft: what else is in the calendar at that time
      const id = String(Number(q('id')) || ''); if (!id) { json(res, 400, { error: 'id is required' }); return true; }
      const hit = !url.searchParams.has('fresh') && fresh('ev' + id, 60000); if (hit) { json(res, 200, hit); return true; }
      const r = await run(TEAM_DRAFT, ['event', id], { timeout: 60000 });
      if (!r.ok) { json(res, 502, { error: clip(oneLine(r.stderr || r.stdout), 240) }); return true; }
      let d = { conflicts: [] }; try { d = JSON.parse(r.stdout); } catch { /* nothing readable */ }
      remember('ev' + id, d); json(res, 200, d); return true;
    }
    if (req.method === 'POST' && ['/api/drafts/edit', '/api/drafts/ask', '/api/drafts/status', '/api/drafts/send'].includes(p)) {
      if (!String(req.headers['content-type'] || '').includes('application/json')) { json(res, 415, { error: 'json only' }); return true; }
      const body = await readBody(req);
      const id = String(Number(body.id) || ''); if (!id) { json(res, 400, { error: 'id is required' }); return true; }
      let args;
      if (p.endsWith('/edit') && body.event && typeof body.event === 'object') { // a calendar draft: the fields of the event
        const e = {}; for (const k of ['title', 'start', 'end', 'location', 'description', 'response']) if (typeof body.event[k] === 'string') e[k] = body.event[k].slice(0, k === 'description' ? 8000 : 300);
        if (typeof body.event.guests === 'string') e.guests = body.event.guests.slice(0, 4000);
        if (typeof body.event.meet === 'boolean') e.meet = body.event.meet;
        const tmp = path.join(os.tmpdir(), `biz-event-${id}-${Date.now()}.json`);
        await fs.writeFile(tmp, JSON.stringify(e)); cache.delete('ev' + id);
        args = ['edit', id, '--event-file', tmp];
      } else if (p.endsWith('/edit')) {
        const text = String(body.body || '').trim();
        if (!text || text.length > 20000) { json(res, 400, { error: 'the message is empty or too long' }); return true; }
        const tmp = path.join(os.tmpdir(), `biz-draft-${id}-${Date.now()}.txt`);
        await fs.writeFile(tmp, text);
        args = ['edit', id, '--body-file', tmp, ...(typeof body.subject === 'string' ? ['--subject', body.subject.slice(0, 300)] : [])];
      } else if (p.endsWith('/ask')) {
        const text = String(body.text || '').trim();
        if (!text || text.length > 2000) { json(res, 400, { error: 'the question is empty or too long' }); return true; }
        args = ['ask', id, text];
      } else if (p.endsWith('/send')) {
        args = ['send', id, '--by-owner']; // __OWNER__'s click in the popup; the Gmail draft goes out as it reads there
      } else {
        if (!['sent', 'discarded'].includes(body.status)) { json(res, 400, { error: 'status must be sent or discarded' }); return true; }
        args = [body.status === 'sent' ? 'sent' : 'discard', id, '--by-owner'];
      }
      const r = await run(TEAM_DRAFT, args, { timeout: 90000 });
      cache.delete('fl' + id);
      json(res, r.ok ? 200 : 502, r.ok ? { ok: true } : { error: clip(oneLine(r.stderr || r.stdout), 240) }); return true;
    }
    json(res, 404, { error: 'not found' }); return true;
  } catch (e) { json(res, 500, { error: e.message }); return true; }
}
