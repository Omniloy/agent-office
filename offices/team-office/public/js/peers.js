// Connections: the other buildings (other machines that run an office) and what this one shares with each.
//   list      every building with its machine and status, and the buttons that fit: Connect, Accept, Decline,
//             Pause or Resume, Disconnect (press twice)
//   floors    under a connected or paused building, one row per floor of THIS building with two switches:
//             whether its agents may talk with that building, and whether its requests are shared with it
// The server side is /api/buildings and /api/peers/* (see hub.mjs). The same file runs in both office apps.
if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const office = () => window.office || {};
  const PHONE = document.documentElement.classList.contains('phone');
  const WORD = { none: 'not connected', out: 'request sent', in: 'wants to connect', on: 'connected', paused: 'paused', off: 'offline' };

  const css = document.createElement('style');
  css.textContent = `
#peers { position: fixed; inset: 0; z-index: 30; display: none; background: rgba(5, 7, 14, .6); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); font-family: var(--sans, system-ui, sans-serif); color: var(--text, #e8eaf2); }
#peers.on { display: flex; align-items: center; justify-content: center; }
#peers .pp { width: min(600px, 100vw); max-height: min(88vh, 860px); min-height: 280px; display: flex; flex-direction: column; background: var(--panel, #141824); border: 1px solid var(--line, rgba(255,255,255,.1)); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
html.phone #peers .pp { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; border: 0; padding-top: env(safe-area-inset-top, 0px); }
#peers header { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 18px; border-bottom: 1px solid var(--line, rgba(255,255,255,.1)); }
#peers header h3 { flex: 1; margin: 0; font-size: 16px; font-weight: 600; }
#peers header h3 small { font-weight: 400; opacity: .6; margin-left: 8px; font-size: 13px; }
#peers header button { width: 40px; height: 40px; border: 0; border-radius: 12px; background: transparent; color: inherit; font-size: 20px; cursor: pointer; }
#peers header button:hover { background: rgba(255, 255, 255, .08); }
#peers .body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 0 0 calc(14px + env(safe-area-inset-bottom, 0px)); }
#peers .bd { padding: 14px 18px 14px; border-top: 1px solid var(--line, rgba(255,255,255,.07)); transition: background .6s ease; }
#peers .bd:first-child { border-top: 0; }
#peers .bd.flash { background: rgba(142, 162, 255, .12); }
#peers .hd { display: grid; grid-template-columns: 10px 1fr auto; gap: 2px 12px; align-items: center; }
#peers .hd i { width: 10px; height: 10px; border-radius: 50%; grid-row: 1 / 3; background: #6b7280; }
#peers .hd i.on { background: #34d399; box-shadow: 0 0 0 3px rgba(52, 211, 153, .2); }
#peers .hd i.paused, #peers .hd i.in { background: #fbbf24; }
#peers .hd i.out { background: #7dd3fc; }
#peers .hd b { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#peers .hd span { grid-column: 2; font-size: 13px; color: var(--muted, #8d97b0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#peers .hd em { grid-column: 3; grid-row: 1 / 3; font-style: normal; font-weight: 600; font-size: 11.5px; padding: 3px 9px; border-radius: 99px; background: rgba(255, 255, 255, .1); color: var(--muted, #aab3c9); white-space: nowrap; }
#peers .hd em.on { background: rgba(52, 211, 153, .16); color: #6ee7b7; }
#peers .hd em.in { background: #fbbf24; color: #201600; }
#peers .hd em.out { background: rgba(125, 211, 252, .16); color: #93d8fb; }
#peers .hd em.paused { background: rgba(251, 191, 36, .16); color: #fcd34d; }
#peers .btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0 22px; }
#peers .btns button { min-height: 40px; padding: 0 15px; border-radius: 11px; border: 1px solid var(--line, rgba(255,255,255,.16)); background: transparent; color: inherit; font: 500 14px var(--sans, system-ui, sans-serif); cursor: pointer; }
#peers .btns button:hover:not(:disabled) { background: rgba(255, 255, 255, .06); }
#peers .btns button.pri { background: var(--accent, #6c7cff); border-color: transparent; color: var(--on-accent, #fff); font-weight: 600; }
#peers .btns button.warn { color: #fca5a5; border-color: rgba(248, 113, 113, .4); }
#peers .btns button.warn.sure { background: rgba(248, 113, 113, .18); border-color: #f87171; color: #fecaca; }
#peers .btns button:disabled { opacity: .5; cursor: default; }
#peers .msg { margin: 8px 0 0 22px; font-size: 13px; line-height: 1.4; color: var(--muted, #aab3c9); }
#peers .msg:empty { display: none; }
#peers .msg.err { color: #fca5a5; }
#peers .fls { margin: 12px 0 0 22px; border: 1px solid var(--line, rgba(255,255,255,.1)); border-radius: 12px; overflow: hidden; }
#peers .fls > p { margin: 0; padding: 9px 12px; font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, #8d97b0); background: rgba(255, 255, 255, .03); }
#peers .fr { display: grid; grid-template-columns: minmax(70px, 1fr) auto auto; gap: 6px 16px; align-items: center; padding: 8px 12px; border-top: 1px solid var(--line, rgba(255,255,255,.07)); }
#peers .fr b { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#peers .sw { display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: 13px; color: var(--muted, #aab3c9); cursor: pointer; -webkit-tap-highlight-color: transparent; }
#peers .sw input { position: absolute; opacity: 0; pointer-events: none; }
#peers .sw u { flex: none; position: relative; width: 38px; height: 22px; border-radius: 99px; background: rgba(255, 255, 255, .16); transition: background .15s ease; }
#peers .sw u::after { content: ''; position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
#peers .sw input:checked + u { background: var(--accent, #6c7cff); }
#peers .sw input:checked + u::after { transform: translateX(16px); }
#peers .sw input:focus-visible + u { outline: 2px solid var(--accent, #8ea2ff); outline-offset: 2px; }
#peers .sw input:checked ~ span { color: var(--text, #e8eaf2); }
#peers .empty { padding: 48px 28px; text-align: center; line-height: 1.5; color: var(--muted, #8d97b0); }
#btn-peers.has::after, #row-peers.has b::after { content: ''; display: inline-block; width: 7px; height: 7px; margin-left: 6px; border-radius: 50%; background: #fbbf24; vertical-align: 1px; }
#row-peers b { font-weight: inherit; }
@media (max-width: 520px) { #peers .fr { grid-template-columns: 1fr; gap: 0; padding: 10px 12px; } #peers .fr b { margin-bottom: 2px; } #peers .sw { min-height: 40px; justify-content: space-between; flex-direction: row-reverse; } }
body.embed #peers { display: none !important; }`;
  document.head.append(css);

  const el = document.createElement('div');
  el.id = 'peers';
  el.innerHTML = '<div class="pp"><header><h3>Connections</h3><button type="button" class="x" title="Close">✕</button></header><div class="body"></div></div>';
  document.body.append(el);
  const body = $('.body', el), title = $('h3', el);

  let data = null, timer = 0, busy = false, sure = null, sureTimer = 0, openedAt = 0;
  const notes = new Map(); // building id -> [text, is it an error]
  const api = (p, b) => office().api(p, b);
  const stateOf = (b) => (b.online ? b.status || 'none' : 'off');
  const changed = () => dispatchEvent(new Event('office-peers')); // the building view repaints its chips

  async function load() { const d = await api('/api/buildings'); data = { me: d.me || {}, buildings: Array.isArray(d.buildings) ? d.buildings : [] }; mark(); }
  async function open(id) {
    if (!el.classList.contains('on')) openedAt = performance.now();
    el.classList.add('on'); sure = null; notes.clear();
    if (!data) body.innerHTML = '<div class="empty">Looking for other buildings…</div>'; else render();
    try { await load(); render(); } catch (e) { if (!data) body.innerHTML = `<div class="empty">Could not read the buildings: ${esc(e.message)}</div>`; }
    clearInterval(timer); timer = setInterval(async () => { if (busy) return; try { await load(); if (!busy) render(); } catch { /* next time */ } }, 10000);
    if (id != null) { const sec = [...body.querySelectorAll('.bd')].find((x) => x.dataset.id === String(id)); if (sec) { sec.scrollIntoView({ block: 'nearest' }); sec.classList.add('flash'); setTimeout(() => sec.classList.remove('flash'), 1200); } }
  }
  function close() { el.classList.remove('on'); clearInterval(timer); }

  const sw = (b, f, k, label) => `<label class="sw"><input type="checkbox" data-port="${esc(f.port)}" data-k="${k}" ${f[k] ? 'checked' : ''}><u></u><span>${label}</span></label>`;
  function card(b) {
    const st = stateOf(b), s = b.status || 'none', off = !b.online, linked = s === 'on' || s === 'paused', n = notes.get(String(b.id));
    const btns = s === 'on' ? '<button type="button" data-do="pause">Pause</button>'
      : s === 'paused' ? '<button type="button" class="pri" data-do="resume">Resume</button>'
      : s === 'in' ? '<button type="button" class="pri" data-do="accept">Accept</button><button type="button" data-do="decline">Decline</button>'
      : s === 'out' ? '<button type="button" disabled>Request sent</button>'
      : `<button type="button" class="pri" data-do="request" ${off ? 'disabled' : ''}>Connect</button>`;
    const isSure = sure === String(b.id);
    const hint = n ? n[0] : isSure ? 'Their agents and yours stop talking, and shared requests go away. Press again to disconnect.'
      : s === 'in' ? 'They ask to connect their agents with yours.' : s === 'out' ? 'Waiting for them to accept.' : s === 'paused' ? 'Nothing is exchanged until you resume.' : off && !linked ? 'This building is offline right now.' : '';
    const floors = linked && (b.myFloors || []).length ? `<div class="fls"><p>Your floors with this building</p>${b.myFloors.map((f) => `<div class="fr"><b>${esc(f.name || f.port)}</b>${sw(b, f, 'on', 'Agents can talk')}${sw(b, f, 'share', 'Share this floor\'s requests')}</div>`).join('')}</div>` : '';
    return `<section class="bd" data-id="${esc(b.id)}">
      <div class="hd"><i class="${st}"></i><b>${esc(b.name || 'Building')}</b><span>${esc([b.owner, b.machine].filter(Boolean).join(' · '))}</span><em class="${st}">${WORD[st] || WORD.none}</em></div>
      <div class="btns">${btns}${linked ? `<button type="button" class="warn ${isSure ? 'sure' : ''}" data-do="disconnect">${isSure ? 'Press again to disconnect' : 'Disconnect'}</button>` : ''}</div>
      <div class="msg ${n && n[1] ? 'err' : ''}">${esc(hint)}</div>${floors}
    </section>`;
  }
  function render() {
    if (!data) return;
    const n = data.buildings.length, top = body.scrollTop;
    title.innerHTML = `Connections${n ? `<small>${n} building${n === 1 ? '' : 's'}</small>` : ''}`;
    body.innerHTML = n ? data.buildings.map(card).join('') : '<div class="empty">No other buildings found. Add a machine in Herdr that runs an office and it shows up here.</div>';
    body.scrollTop = top;
  }
  const find = (id) => data && data.buildings.find((b) => String(b.id) === String(id));
  async function run(id, what) {
    const b = find(id); if (!b || busy) return;
    if (what === 'disconnect' && sure !== String(id)) { // asks once more, here, before it cuts the link
      sure = String(id); notes.delete(sure); clearTimeout(sureTimer); sureTimer = setTimeout(() => { if (sure === String(id)) { sure = null; if (!busy) render(); } }, 6000);
      return render();
    }
    sure = null; busy = true; notes.delete(String(id));
    body.querySelectorAll('.bd').forEach((x) => { if (x.dataset.id === String(id)) x.querySelectorAll('.btns button').forEach((y) => { y.disabled = true; }); });
    try {
      const r = what === 'pause' || what === 'resume' ? await api('/api/peers/pause', { id: b.id, paused: what === 'pause' }) : await api(`/api/peers/${what}`, { id: b.id });
      if (r && r.error) throw new Error(r.error);
      b.status = { request: 'out', accept: 'on', decline: 'none', pause: 'paused', resume: 'on', disconnect: 'none' }[what]; // shown at once; the next read confirms it
      changed();
      try { await load(); } catch { /* the next read brings it */ }
    } catch (e) { notes.set(String(id), [e.message || 'That did not work.', true]); }
    busy = false; render();
  }
  async function flip(input) {
    const sec = input.closest('.bd'), b = sec && find(sec.dataset.id); if (!b) return;
    const f = (b.myFloors || []).find((x) => String(x.port) === input.dataset.port), k = input.dataset.k, v = input.checked; if (!f) return;
    f[k] = v; notes.delete(String(b.id)); busy = true; // the switch moves at once; a failure moves it back
    try { const r = await api('/api/peers/floor', { id: b.id, port: f.port, [k]: v }); if (r && r.error) throw new Error(r.error); changed(); }
    catch (e) { f[k] = !v; notes.set(String(b.id), [e.message || 'That did not work.', true]); busy = false; return render(); }
    busy = false;
  }

  el.addEventListener('click', (e) => { if (performance.now() - openedAt < 400) { e.preventDefault(); e.stopPropagation(); } }, true); // the tap that opened this must not also press what appears under the finger
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t === el || t.closest('.x')) return close();
    const btn = t.closest('[data-do]'); if (btn && !btn.disabled) return run(btn.closest('.bd').dataset.id, btn.dataset.do);
  });
  el.addEventListener('change', (e) => { if (e.target.matches('.sw input')) flip(e.target); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('on')) { e.stopPropagation(); close(); } }, true);

  // ---------------------------------------------------------------- the way in: More on the phone, the top bar elsewhere
  let entry = null;
  function mark() { if (entry) entry.classList.toggle('has', !!data && data.buildings.some((b) => b.online && b.status === 'in')); } // someone asks to connect
  if (PHONE) {
    const wait = (n = 0) => { const menu = $('#sheet-more .pmenu'); if (!menu) { if (n < 40) setTimeout(() => wait(n + 1), 300); return; }
      entry = document.createElement('button'); entry.type = 'button'; entry.id = 'row-peers'; entry.innerHTML = '<b>Connections</b><small>›</small>'; entry.onclick = () => open();
      const sw2 = [...menu.children].find((x) => /Switch office/.test(x.textContent)); menu.insertBefore(entry, sw2 || null); mark(); };
    wait();
  } else {
    const tools = $('.tools');
    if (tools) { entry = document.createElement('button'); entry.type = 'button'; entry.id = 'btn-peers'; entry.textContent = 'Connections'; entry.title = 'Other buildings: connect agents and choose what each floor shares'; entry.onclick = () => open(); tools.insertBefore(entry, $('#btn-more', tools) || null); }
  }
  // a quiet look now and then, so a request to connect shows as a dot on the way in
  const peek = async (n = 0) => { if (!office().api) { if (n < 40) setTimeout(() => peek(n + 1), 300); return; } if (!el.classList.contains('on') && !document.hidden) { try { await load(); } catch { /* an office without connections */ } } };
  peek(); setInterval(peek, 60000);
  if (window.office) window.office.peers = { open };
}
