// The room's terminal: a real shell on this computer, or an ssh session to another of the owner's machines, in a
// popup. Agents mark commands in their messages (`$ command`, `machine$ command`, or a ```run block) and each one
// shows as a button: pressing it opens the terminal with the command ready, and Run types it there. Nothing runs
// by itself. Afterwards what it printed can go back to whoever asked. Self-contained; server side is term.mjs.
// Not loaded for visitors from other buildings.
const TOKEN = window.__TOKEN__;
if (!window.__GUEST__ && TOKEN && TOKEN !== 'guest' && !new URLSearchParams(location.search).has('embed')) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = async (path, body) => {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-office-token': TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d;
  };
  const office = () => window.office || {};
  const NAME = /^[a-z0-9][a-z0-9._-]{0,62}$/i;

  // ---- commands inside messages (main.js and chat.js call these while they draw a message; the text is already escaped)
  // What a command looks like when nobody marked it: the page still makes it a Run button.
  const CMD = /^(?:sudo\s+)?(?:az|gcloud|aws|kubectl|helm|terraform|argocd|docker|git|gh|npm|npx|pnpm|yarn|node|python3?|pip3?|uv|brew|ssh|scp|curl|wget|open|cd|ls|cat|tail|head|grep|chmod|mkdir|export|source|launchctl|systemctl|journalctl|defaults|security|psql|tailscale|hc|make|bash|zsh|claude|codex|office-restart|team-[a-z]+|\.\/[\w.-]+|~\/[\w.\/-]+)\s+\S/;
  window.termRun = {
    looks: (c) => CMD.test(String(c).trim()),
    // an answer option that carries a command ("A: Create $ python3 x.py"): its label and a Run button, not a plain answer button
    option: (o) => { const m = /^(.*?)\s*`?((?:[a-z0-9][a-z0-9._-]*)?)\$ ([^`]+)`?\s*$/i.exec(String(o)); const c = m && m[3].trim();
      return c && (m[2] || /^[a-z.~\/]/i.test(c)) && c.length > 2 ? `<div class="runo"><b>${m[1].replace(/[:\s]+$/, '')}</b>${window.termRun.chip(c, m[2])}</div>` : ''; },
    shell: (info) => /^(sh|bash|zsh|shell|console|terminal)$/i.test(String(info).trim()),
    chip: (c, on) => `<span class="runc" role="button" tabindex="0" data-run="${c}" data-on="${NAME.test(on || '') ? on : ''}" title="Opens the terminal with this command ready to run${on ? ` on ${on}` : ''}"><i>▶</i>${NAME.test(on || '') ? `<em>${on}$</em>` : ''}<code>${c}</code></span>`,
    block: (c, on) => `<div class="runb" data-run="${c}" data-on="${NAME.test(on || '') ? on : ''}"><pre>${c}</pre><button type="button" title="Opens the terminal with this ready to run">▶ Run${NAME.test(on || '') ? ` on ${on}` : ''}</button></div>`,
  };

  const style = document.createElement('style');
  style.textContent = `
.runo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; flex-basis: 100%; } .runo b { font-weight: 600; }
.runc { display: inline-flex; align-items: baseline; gap: 6px; max-width: 100%; padding: 1px 8px 1px 6px; margin: 1px 0; border-radius: 7px; background: rgba(45,212,191,.12); border: 1px solid rgba(45,212,191,.45); cursor: pointer; vertical-align: baseline; white-space: normal; }
.runc:hover, .runc:focus-visible { background: rgba(45,212,191,.22); outline: none; } .runc i { font-style: normal; font-size: .8em; color: #2dd4bf; flex: none; }
.runc em { font-style: normal; font-size: .82em; color: #fbbf24; flex: none; } .runc code { background: transparent !important; border: 0 !important; padding: 0 !important; overflow-wrap: anywhere; white-space: pre-wrap; }
.runb { margin: 6px 0; border-radius: 9px; border: 1px solid rgba(45,212,191,.45); background: rgba(0,0,0,.28); overflow: hidden; white-space: normal; }
.runb pre { margin: 0 !important; padding: 8px 10px !important; background: transparent !important; border: 0 !important; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .92em; }
.runb button { display: block; width: 100%; font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 10px; border: 0; border-top: 1px solid rgba(45,212,191,.3); background: rgba(45,212,191,.14); color: #5eead4; cursor: pointer; text-align: left; }
.runb button:hover { background: rgba(45,212,191,.26); }
pre.mdpre { margin: 6px 0; padding: 8px 10px; border-radius: 8px; background: rgba(0,0,0,.28); white-space: pre-wrap; overflow-wrap: anywhere; font-size: .92em; } pre.mdpre a, #chat pre a { color: inherit; text-decoration: underline; }
#term-veil { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; background: rgba(6, 12, 14, .55); backdrop-filter: blur(3px); }
#term-veil.show { display: flex; }
#term { width: min(1040px, calc(100vw - 40px)); height: min(700px, calc(100vh - 60px)); display: flex; flex-direction: column; border-radius: 16px; background: #0b1014; border: 1px solid rgba(255,255,255,.16); color: #e8f0ee; font-size: 13px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.55); }
#term header { display: flex; align-items: center; gap: 8px; padding: 10px 12px 10px 16px; border-bottom: 1px solid rgba(255,255,255,.1); flex: none; }
#term header h2 { margin: 0; font-size: 15px; } #term header small { color: #8fa3a0; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#term button { font: inherit; font-size: 12.5px; padding: 6px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.07); color: #e8f0ee; cursor: pointer; }
#term button:hover { background: rgba(255,255,255,.14); } #term button:disabled { opacity: .5; cursor: default; }
#term .pri { background: #2dd4bf; color: #06231f; border-color: #2dd4bf; font-weight: 600; }
#term .tabs { display: flex; gap: 4px; } #term .tabs button { padding: 4px 10px; border-radius: 99px; color: #a9bbb8; background: transparent; } #term .tabs button.on { color: #e8f0ee; border-color: #2dd4bf; background: rgba(255,255,255,.07); }
#term-ask { flex: none; padding: 8px 16px; background: rgba(251,191,36,.1); border-bottom: 1px solid rgba(251,191,36,.3); color: #fcd34d; line-height: 1.4; }
#term-ask b { color: #fde68a; } #term-ask .tell { display: flex; gap: 6px; align-items: center; margin-top: 6px; color: #e8f0ee; cursor: pointer; } #term [hidden] { display: none !important; }
#term-x { flex: 1; min-height: 0; padding: 8px 4px 4px 10px; overflow: hidden; } #term-x .pane { width: 100%; height: 100%; } #term-x .pane[hidden] { display: none; }
#term .keys { flex: none; display: flex; gap: 6px; padding: 6px 12px 0; overflow-x: auto; } #term .keys button { padding: 4px 10px; font-size: 12px; color: #a9bbb8; white-space: nowrap; }
#term-line { flex: none; display: flex; gap: 8px; padding: 8px 12px 10px; align-items: flex-end; }
#term-line textarea { flex: 1; min-width: 0; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #e8f0ee; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.18); border-radius: 9px; padding: 8px 10px; resize: none; max-height: 132px; }
#term-line textarea:focus { outline: 2px solid rgba(45,212,191,.6); outline-offset: 0; }
#term-share { flex: none; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 0 12px 10px; color: #8fa3a0; }
html.phone #term { width: 100vw; height: 100dvh; border-radius: 0; border: 0; padding-bottom: env(safe-area-inset-bottom); padding-top: env(safe-area-inset-top); }
html.phone #term-line textarea { font-size: 16px; } html.phone #term header { flex-wrap: wrap; } html.phone #term header small { display: none; } html.phone #term header h2 { flex: 1; } html.phone #term .tabs { order: 5; flex-basis: 100%; overflow-x: auto; }
`;
  document.head.appendChild(style);

  const veil = document.createElement('div'); veil.id = 'term-veil';
  veil.innerHTML = `<section id="term" role="dialog" aria-label="Terminal"><header><h2>Terminal</h2><div class="tabs" id="term-tabs"></div><small id="term-sub"></small><button id="term-restart" title="Ends this terminal and starts a clean one">Restart</button><button id="term-close" title="Close. The terminal keeps running. (Esc twice)">✕</button></header>
    <div id="term-ask" hidden></div><div id="term-x"></div>
    <div class="keys"><button data-k="\x03" title="Stop what is running">Ctrl+C</button><button data-k="\t">Tab</button><button data-k="\x1b[A">↑</button><button data-k="\x1b[B">↓</button><button data-k="\x1b">Esc</button><button data-k="\x04" title="End of input">Ctrl+D</button><button data-k="y\r">y ⏎</button><button data-k="\r">⏎</button><button id="term-copy" title="Copies what the last command printed">Copy output</button></div>
    <form id="term-line"><textarea rows="1" id="term-in" placeholder="Type a command, then Run" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Command"></textarea><button class="pri" id="term-run">Run</button></form>
    <div id="term-share" hidden></div></section>`;
  document.body.appendChild(veil);
  const $ = (s) => veil.querySelector(s);
  const btn = document.createElement('button'); btn.id = 'btn-term'; btn.title = 'A terminal on this computer, inside the office'; btn.textContent = 'Terminal';
  const tools = document.querySelector('.tools'); if (tools) tools.insertBefore(btn, document.querySelector('#btn-more'));

  let info = null, cur = 'local', ctx = null, libs = null;
  const panes = new Map(); // id -> { term, fit, es, el, sent }
  const where = (id) => (id === 'local' ? (info ? info.host : 'this computer') : id);
  const load = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error(`could not load ${src}`)); document.head.appendChild(s); });
  function ready() {
    if (!libs) libs = (async () => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/vendor/xterm/xterm.css'; document.head.appendChild(l);
      await load('/vendor/xterm/xterm.js'); await load('/vendor/xterm/addon-fit.js'); await load('/vendor/xterm/addon-web-links.js');
      info = await api('/api/term/info');
    })().catch((e) => { libs = null; throw e; });
    return libs;
  }
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  function pane(id) {
    if (panes.has(id)) return panes.get(id);
    const el = document.createElement('div'); el.className = 'pane'; $('#term-x').appendChild(el);
    const term = new window.Terminal({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: document.documentElement.classList.contains('phone') ? 12 : 13, cursorBlink: true, scrollback: 5000, allowProposedApi: true,
      theme: { background: '#0b1014', foreground: '#dbe5e3', cursor: '#2dd4bf', selectionBackground: 'rgba(45,212,191,.35)' } });
    const fit = new window.FitAddon.FitAddon(); term.loadAddon(fit);
    term.loadAddon(new window.WebLinksAddon.WebLinksAddon((e, uri) => { window.open(uri, '_blank', 'noopener'); })); // a link printed in the terminal opens on a click
    term.open(el);
    const p = { id, term, fit, el, es: null, queue: Promise.resolve(), size: '' };
    term.onData((data) => { p.queue = p.queue.then(() => api('/api/term/input', { id, data })).catch(() => {}); });
    const connect = () => {
      p.es = new EventSource(`/api/term/stream?id=${encodeURIComponent(id)}&token=${encodeURIComponent(TOKEN)}`);
      p.es.addEventListener('init', (e) => { term.reset(); term.write(bytes(JSON.parse(e.data))); p.size = ''; resize(p); });
      p.es.addEventListener('out', (e) => term.write(bytes(JSON.parse(e.data))));
      p.es.addEventListener('exit', () => { term.write('\r\n\x1b[33m[this terminal ended: press Restart, or run something, to start a new one]\x1b[0m\r\n'); p.es.close(); p.es = null; });
    };
    p.connect = connect; connect();
    panes.set(id, p); return p;
  }
  function resize(p) {
    if (!veil.classList.contains('show') || p.el.hidden) return;
    try { p.fit.fit(); } catch { return; }
    const size = `${p.term.cols}x${p.term.rows}`;
    if (size !== p.size) { p.size = size; api('/api/term/resize', { id: p.id, cols: p.term.cols, rows: p.term.rows }).catch(() => {}); }
  }
  function paint() {
    const ids = ['local', ...((info && info.machines) || [])];
    $('#term-tabs').innerHTML = ids.length > 1 ? ids.map((id) => `<button type="button" data-tab="${esc(id)}" class="${id === cur ? 'on' : ''}">${esc(id === 'local' ? 'This computer' : id)}</button>`).join('') : '';
    $('#term-sub').textContent = info ? (cur === 'local' ? `${info.user}@${info.host} · ${info.cwd}` : `ssh ${cur}, from ${info.host}`) : '';
    for (const [id, p] of panes) p.el.hidden = id !== cur;
    const ask = $('#term-ask');
    ask.hidden = !ctx;
    if (ctx) ask.innerHTML = `${ctx.name ? `<b>${esc(ctx.name)}</b> marked this command.` : 'This command comes from a message.'} It runs on <b>${esc(where(cur))}</b>${cur === 'local' && info ? ` as ${esc(info.user)}` : ''} when you press Run. Read it first; you can change it.${ctx.from ? `<label class="tell"><input type="checkbox" id="term-tell" checked> When it finishes, send ${esc(ctx.name || 'them')} what it prints (tokens and passwords masked)</label>` : ''}`;
    const p = panes.get(cur); if (p) requestAnimationFrame(() => resize(p));
  }
  function grow() { const t = $('#term-in'); t.style.height = 'auto'; t.style.height = `${Math.min(132, t.scrollHeight + 2)}px`; }
  async function show(on, opts = {}) {
    veil.classList.toggle('show', on); btn.classList.toggle('on', on);
    if (!on) return;
    $('#term-sub').textContent = 'Opening…';
    try { await ready(); } catch (e) { $('#term-sub').textContent = e.message; return; }
    if (opts.on && opts.on !== 'local' && !(info.machines || []).includes(opts.on)) { ctx = null; cur = 'local'; pane(cur); paint(); $('#term-ask').hidden = false; $('#term-ask').textContent = `That command is marked for a machine called “${opts.on}”, which this computer does not know. Nothing was loaded.`; return; }
    if (opts.cmd) { cur = opts.on || 'local'; ctx = opts.ctx || {}; $('#term-in').value = opts.cmd; $('#term-share').hidden = true; }
    const p = pane(cur); if (!p.es) p.connect();
    paint(); grow();
    if (opts.cmd) $('#term-run').focus(); else if (!document.documentElement.classList.contains('touch')) p.term.focus();
  }
  async function runLine() {
    const cmd = $('#term-in').value.trim(), b = $('#term-run'); if (!cmd) return;
    const mine = ctx; b.disabled = true;
    try {
      const p = pane(cur); if (!p.es) p.connect();
      const tell = $('#term-tell'); // the owner decides, before Run, whether the output goes back to whoever marked it
      await api('/api/term/run', { id: cur, cmd, from: mine ? mine.from || '' : '', share: tell ? tell.checked : true });
      $('#term-in').value = ''; grow(); ctx = null; $('#term-ask').hidden = true;
      const sh = $('#term-share');
      if (mine && (mine.reqId || mine.from)) {
        sh.hidden = false; sh.dataset.id = cur; sh.dataset.req = mine.reqId || ''; sh.dataset.from = mine.from || ''; sh.dataset.name = mine.name || '';
        sh.innerHTML = `<button id="term-send">${mine.reqId ? 'Answer' : 'Send'} ${esc(mine.name || 'them')} what it printed</button><span>when it has finished. ${mine.reqId ? 'It closes their request.' : ''}</span>`;
      } else sh.hidden = true;
      if (!document.documentElement.classList.contains('touch')) p.term.focus();
    } catch (e) { $('#term-ask').hidden = false; $('#term-ask').textContent = e.message; }
    b.disabled = false;
  }

  btn.onclick = () => show(!veil.classList.contains('show'));
  $('#term-line').addEventListener('submit', (e) => { e.preventDefault(); runLine(); });
  $('#term-in').addEventListener('input', grow);
  $('#term-in').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); runLine(); } });
  veil.addEventListener('mousedown', (e) => { if (e.target === veil) show(false); });
  veil.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'term-close') return show(false);
    if (b.dataset.tab) { cur = b.dataset.tab; ctx = null; $('#term-share').hidden = true; const p = pane(cur); if (!p.es) p.connect(); return paint(); }
    if (b.dataset.k) { e.preventDefault(); const p = pane(cur); p.queue = p.queue.then(() => api('/api/term/input', { id: cur, data: b.dataset.k })).catch(() => {}); return; }
    try {
      if (b.id === 'term-restart') {
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Yes, end it'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Restart'; }, 4000); return; }
        b.dataset.sure = ''; b.textContent = 'Restart';
        await api('/api/term/kill', { id: cur }); const p = pane(cur); if (p.es) { p.es.close(); p.es = null; }
        setTimeout(() => { p.connect(); }, 1800);
      } else if (b.id === 'term-copy') {
        const d = await api(`/api/term/last?id=${encodeURIComponent(cur)}`);
        try { await navigator.clipboard.writeText(d.text || ''); b.textContent = 'Copied'; } catch { b.textContent = 'Could not copy'; }
        setTimeout(() => { b.textContent = 'Copy output'; }, 1600);
      } else if (b.id === 'term-send') {
        const sh = $('#term-share'), d = await api(`/api/term/last?id=${encodeURIComponent(sh.dataset.id)}`);
        const out = (d.text || '').trim(), lines = out ? out.split('\n').length : 0;
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = d.done === false ? `It is still running. Send the ${lines} lines so far?` : lines ? `Yes, send these ${lines} lines to ${sh.dataset.name || 'them'}` : 'It printed nothing. Send anyway?'; setTimeout(() => { if (b.isConnected && b.dataset.sure === '1') { b.dataset.sure = ''; b.textContent = `${sh.dataset.req ? 'Answer' : 'Send'} ${sh.dataset.name || 'them'} what it printed`; } }, 6000); return; }
        b.disabled = true;
        const text = `I ran it on ${where(sh.dataset.id)}: ${d.cmd}\n\nIt printed:\n${out.length > 3300 ? `(the last part)\n${out.slice(-3300)}` : out || '(nothing)'}`;
        if (sh.dataset.req) await api('/api/requests/answer', { id: Number(sh.dataset.req), text });
        else await api('/api/send', { to: sh.dataset.from, text });
        sh.innerHTML = `<span>Sent to ${esc(sh.dataset.name || 'them')}.</span>`;
      }
    } catch (err) { b.disabled = false; b.textContent = err.message; }
  });
  veil.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && e.target.id === 'term-in') { e.preventDefault(); show(false); } });
  addEventListener('resize', () => { const p = panes.get(cur); if (p) resize(p); });

  // A command in a message: open the terminal with it ready. The second press, on Run, is what runs it.
  function pick(e) {
    const el = e.target.closest('.runc[data-run], .runb[data-run] button'); if (!el) return;
    const box = el.closest('[data-run]'), cmd = box.dataset.run.trim(); if (!cmd) return;
    e.preventDefault(); e.stopPropagation();
    let c = {};
    const it = box.closest('.it[data-id]');
    if (it) { const w = it.querySelector('[data-who]'); c = { reqId: it.classList.contains('request') ? it.dataset.id : '', from: w ? w.dataset.who : '', name: w ? w.textContent.trim().split(' ')[0] : '' }; }
    else if (box.closest('#chat')) { const slug = office().selected && office().selected(), a = (office().agents ? office().agents() : []).find((x) => x.slug === slug); if (a) c = { from: a.herdrName, name: a.name.split(' ')[0] }; }
    show(true, { cmd, on: box.dataset.on || '', ctx: c });
  }
  document.addEventListener('click', pick, true);
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('runc')) pick(e); }, true);
  window.officeTerm = { open: (o) => show(true, o || {}) };
}
