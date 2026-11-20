// Local pages published by the office agents: HTML sites and MDX / Markdown documents.
//   Store   ~/.omniloy-team/artifacts/<owner>/<slug>/   index.html | index.mdx | index.md, any other files, meta.json
//   Create  `team-artifact new …` (see the local-artifact skill). Delete: from the office chat, or `team-artifact rm`.
//   URL     http://127.0.0.1:4340/<owner>/<slug>/      (the phone: the same path on the Mac's Tailscale name)
// It listens on this machine only. `tailscale serve` forwards the Tailscale name to it; only the accounts listed in
// ~/.omniloy-team/remote.json get in from there, the same door as the offices.
// Pages are written by agents and often hold health data, so:
//   - every answer carries a Content-Security-Policy: a page runs its own inline code but cannot load anything from
//     the internet nor send anything there (connect-src 'self', no external scripts, images or forms);
//   - and it is sandboxed (CSP `sandbox` without allow-same-origin): each page runs in an origin of its own, so its
//     scripts cannot read the index, the list or any other page here (they are all on this one origin), nor storage
//     or cookies. A page still loads its own files with <script src>, <img>, <link> (no fetch of them: no CORS here);
//   - .md is rendered as plain Markdown (nothing runs); .mdx, which is a program, is rendered in a separate Node
//     process that may read only this app and the document's folder, with no environment and a 10 s limit (render-mdx.mjs).
import http from 'node:http';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import remarkGfm from 'remark-gfm';

const PORT = Number(process.env.PORT) || 4340, HOME = os.homedir();
const ROOT = path.join(HOME, '.omniloy-team', 'artifacts');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', md: 'text/plain; charset=utf-8', mdx: 'text/plain; charset=utf-8', woff2: 'font/woff2', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };
const SAFE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;
const APP = path.dirname(fileURLToPath(import.meta.url));
// the renderer reads this app and its libraries (node_modules may be a link to another folder)
const READ = [...new Set([APP, (() => { try { return realpathSync(path.join(APP, 'node_modules')); } catch { return APP; } })()])].map((d) => `--allow-fs-read=${d}${path.sep}`);
const CSP = ["default-src 'self' data: blob:", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "media-src 'self' data: blob:", "connect-src 'self'", "form-action 'none'", "frame-src 'self'", "base-uri 'self'", "object-src 'none'",
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'].join('; ');

async function remoteOk(req, host) {
  let r; try { r = JSON.parse(await fs.readFile(path.join(HOME, '.omniloy-team', 'remote.json'), 'utf8')); } catch { return false; }
  if (!r || !r.host || !Array.isArray(r.logins) || host.split(':')[0].toLowerCase() !== String(r.host).toLowerCase()) return false;
  const who = String(req.headers['tailscale-user-login'] || '').toLowerCase();
  return !!who && r.logins.some((l) => String(l).toLowerCase() === who);
}
const readJson = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
async function list() {
  const out = [];
  for (const owner of await fs.readdir(ROOT).catch(() => [])) {
    if (owner.startsWith('.') || !SAFE.test(owner)) continue;
    for (const slug of await fs.readdir(path.join(ROOT, owner)).catch(() => [])) {
      if (!SAFE.test(slug)) continue;
      const m = await readJson(path.join(ROOT, owner, slug, 'meta.json'), null); if (!m) continue;
      out.push({ owner, slug, title: m.title || slug, kind: m.kind || 'html', created: m.created || '', updated: m.updated || m.created || '' });
    }
  }
  return out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
}
const SHELL = (title, body, extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>
:root { --bg: #fbfbfa; --fg: #1c1d22; --muted: #6b7080; --line: #e3e4ea; --accent: #4f5bd5; --code: #f1f2f6; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1118; --fg: #e8eaf2; --muted: #98a0b5; --line: #272b3a; --accent: #8e9bff; --code: #1a1e2b; } }
* { box-sizing: border-box; } html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif; }
main { max-width: 780px; margin: 0 auto; padding: 28px 18px 80px; }
h1 { font-size: 1.9em; line-height: 1.2; margin: .2em 0 .6em; letter-spacing: -.01em; } h2 { font-size: 1.35em; margin: 1.7em 0 .5em; } h3 { font-size: 1.1em; margin: 1.4em 0 .4em; }
a { color: var(--accent); } img, video { max-width: 100%; height: auto; border-radius: 8px; }
code { font: .88em ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code); padding: 2px 5px; border-radius: 5px; }
pre { background: var(--code); padding: 14px 16px; border-radius: 10px; overflow-x: auto; line-height: 1.45; } pre code { background: none; padding: 0; }
.tw, main > table { display: block; overflow-x: auto; } table { border-collapse: collapse; margin: 1em 0; font-size: .93em; }
th, td { border: 1px solid var(--line); padding: 7px 11px; text-align: left; vertical-align: top; } th { background: var(--code); }
blockquote { margin: 1em 0; padding: 2px 16px; border-left: 3px solid var(--line); color: var(--muted); } hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
.by { color: var(--muted); font-size: .85em; margin-bottom: 1.6em; } .by a { color: inherit; }
.err { background: #fde8e8; color: #7a1616; padding: 14px 16px; border-radius: 10px; white-space: pre-wrap; font: 14px/1.45 ui-monospace, Menlo, monospace; }
ul.idx { list-style: none; padding: 0; } ul.idx li { padding: 12px 0; border-bottom: 1px solid var(--line); } ul.idx a { font-weight: 600; text-decoration: none; } ul.idx small { display: block; color: var(--muted); }
${extra}</style></head><body><main>${body}</main></body></html>`;

// .mdx in its own process (see the top of this file); the same document is rendered once per change
const mdxCache = new Map(); // file -> { key, out }
function renderMdx(file) {
  return new Promise((resolve) => {
    const args = ['--permission', ...READ, `--allow-fs-read=${path.dirname(file)}${path.sep}`, path.join(APP, 'render-mdx.mjs'), file];
    execFile(process.execPath, args, { cwd: APP, env: {}, timeout: 10_000, maxBuffer: 8e6, killSignal: 'SIGKILL' }, (err, stdout) => {
      let d = null; try { d = JSON.parse(String(stdout)); } catch { /* killed or crashed */ }
      resolve(d || { error: err && err.killed ? 'it took longer than 10 seconds' : 'it stopped before finishing' });
    });
  });
}
async function mdx(file, meta, owner) {
  const src = await fs.readFile(file, 'utf8');
  const by = `<div class="by"><a href="/">Artifacts</a> · ${esc(owner)} · ${esc(String(meta.updated || meta.created || '').replace('T', ' ').slice(0, 16))}</div>`;
  let html = '', error = '';
  if (file.endsWith('.mdx')) {
    const st = await fs.stat(file), key = `${st.size}:${st.mtimeMs}`, hit = mdxCache.get(file);
    const out = hit && hit.key === key ? hit.out : await renderMdx(file);
    mdxCache.delete(file); mdxCache.set(file, { key, out }); while (mdxCache.size > 100) mdxCache.delete(mdxCache.keys().next().value);
    html = out.html || ''; error = out.html == null ? out.error || 'unknown error' : '';
  } else {
    try { // plain Markdown: no code, no JSX, nothing runs
      const mod = await evaluate(src, { ...runtime, remarkPlugins: [remarkGfm], format: 'md' });
      html = renderToStaticMarkup(runtime.jsx(mod.default, {}));
    } catch (e) { error = e.message; }
  }
  if (!error) return SHELL(meta.title || 'Artifact', by + html);
  // a document that does not compile is still readable: say why, then show the source
  return SHELL(meta.title || 'Artifact', `${by}<div class="err">This document could not be rendered: ${esc(error)}</div><pre>${esc(src)}</pre>`);
}

const server = http.createServer(async (req, res) => {
  const send = (code, type, body, head = {}) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP, ...head }); res.end(body); };
  try {
    const host = String(req.headers.host || ''), local = /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host);
    if (!local && !(await remoteOk(req, host))) return send(403, 'text/plain', 'not allowed');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'read only: publish with team-artifact');
    const url = new URL(req.url, 'http://x'); let p;
    try { p = decodeURIComponent(url.pathname); } catch { return send(400, 'text/plain', 'bad path'); }
    if (p === '/api/list') return send(200, 'application/json', JSON.stringify({ items: await list() }));
    if (p === '/') {
      const items = await list();
      return send(200, TYPES.html, SHELL('Artifacts', `<h1>Artifacts</h1><ul class="idx">${items.map((x) => `<li><a href="/${esc(x.owner)}/${esc(x.slug)}/">${esc(x.title)}</a><small>${esc(x.owner)} · ${esc(x.kind)} · ${esc(x.updated.replace('T', ' ').slice(0, 16))}</small></li>`).join('') || '<li>Nothing published yet.</li>'}</ul>`));
    }
    const parts = p.split('/').filter(Boolean);
    if (parts.length < 2 || !SAFE.test(parts[0]) || !SAFE.test(parts[1]) || parts.some((x) => x === '..' || x.startsWith('.'))) return send(404, 'text/plain', 'not found');
    const dir = path.join(ROOT, parts[0], parts[1]);
    if (!(await inside(dir, ROOT))) return send(404, 'text/plain', 'not found');
    const meta = (await inside(path.join(dir, 'meta.json'), dir)) ? await readJson(path.join(dir, 'meta.json'), null) : null;
    if (!meta) return send(404, TYPES.html, SHELL('Not found', '<h1>Not found</h1><p>This artifact does not exist (it may have been deleted). <a href="/">See all</a></p>'));
    if (parts.length === 2) {
      if (!p.endsWith('/')) return send(302, 'text/plain', '', { location: `${p}/` }); // so relative links inside the page work
      for (const n of ['index.html', 'index.mdx', 'index.md']) {
        const f = path.join(dir, n);
        if (!(await fs.stat(f).catch(() => null))) continue;
        if (!(await inside(f, dir))) return send(404, 'text/plain', 'not found'); // a link that leads out of the page's folder
        return send(200, TYPES.html, n === 'index.html' ? await fs.readFile(f) : await mdx(f, meta, parts[0]));
      }
      return send(404, 'text/plain', 'this artifact has no index.html, index.mdx or index.md');
    }
    const f = path.join(dir, ...parts.slice(2));
    if (!f.startsWith(dir + path.sep) || path.basename(f) === 'meta.json') return send(404, 'text/plain', 'not found');
    const st = await fs.stat(f).catch(() => null);
    if (!st || !st.isFile() || !(await inside(f, dir))) return send(404, 'text/plain', 'not found');
    if (/\.mdx?$/.test(f) && !url.searchParams.has('raw')) return send(200, TYPES.html, await mdx(f, meta, parts[0])); // further pages of the same document
    send(200, TYPES[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream', await fs.readFile(f));
  } catch (e) { send(500, 'text/plain', `error: ${e.message}`); }
});
// A symbolic link inside a published folder must not serve a file from elsewhere: compare the real paths.
async function inside(f, dir) {
  try { const [rf, rd] = await Promise.all([fs.realpath(f), fs.realpath(dir)]); return rf.startsWith(rd + path.sep); } catch { return false; }
}
server.listen(PORT, '127.0.0.1', () => console.log(`artifacts on http://127.0.0.1:${PORT}/ serving ${ROOT}`));
