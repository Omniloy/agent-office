// Pending requests: what the team needs from __OWNER__ (written by `team-ask`, read from
// ~/.omniloy-team/requests.json by the server). Shows a card in the office; answering here
// or in Herdr's Requests panel is the same thing. Self-contained: main.js doesn't know it.
const TOKEN = window.__TOKEN__;
const EMBED = new URLSearchParams(location.search).has('embed');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => { const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'now' : m < 60 ? `${Math.round(m)}m` : `${Math.round(m / 60)}h`; };
const api = async (path, body) => {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-office-token': TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d;
};

const style = document.createElement('style');
style.textContent = `
#requests { position: fixed; right: 14px; top: 74px; width: 340px; max-height: 62vh; overflow: auto; z-index: 5; padding: 10px 12px 12px; display: none;
  border-radius: 16px; background: rgba(18,22,34,.82); border: 1px solid rgba(251,113,133,.45); backdrop-filter: blur(14px); color: #e8ecf5; font-size: 12.5px; }
#requests.show { display: block; }
body.panel-open #requests { right: auto; left: 14px; top: 74px; }
body.embed #requests { top: 14px; width: 300px; }
#requests h3 { margin: 0 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #fb7185; font-weight: 600; }
#requests h3.msg { color: #a3aec4; margin-top: 10px; }
#requests .rq { padding: 8px 0; border-top: 1px solid rgba(255,255,255,.08); }
#requests .rq:first-of-type { border-top: 0; }
#requests .who { display: flex; gap: 6px; align-items: center; color: #a3aec4; font-size: 11.5px; }
#requests .who i { width: 8px; height: 8px; border-radius: 50%; }
#requests .who b { color: #e8ecf5; }
#requests .who a { margin-left: auto; color: #9db4ff; text-decoration: none; }
#requests .t { margin: 4px 0 2px; font-size: 13.5px; line-height: 1.35; }
#requests .b { color: #a3aec4; line-height: 1.4; }
#requests .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
#requests .acts button[data-answer] { max-width: 100%; white-space: normal; text-align: left; line-height: 1.3; overflow-wrap: anywhere; }
#requests button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.07); color: #e8ecf5; cursor: pointer; }
#requests button.pri { background: #e8ecf5; color: #121622; border-color: #e8ecf5; }
#requests input { flex: 1; min-width: 0; font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.25); color: #e8ecf5; }
#requests .more { color: #7c879c; margin-top: 8px; font-size: 11.5px; }
`;
document.head.appendChild(style);
const box = document.createElement('section'); box.id = 'requests'; document.body.appendChild(box);

let sig = '', site = '';
function render(d) {
  const reqs = d.items.filter((x) => x.kind === 'request'), notes = d.items.filter((x) => x.kind === 'note');
  const n = reqs.length;
  if (!/^\(\d+ to answer\)/.test(document.title) || n) document.title = (n ? `(${n} to answer) ` : '') + document.title.replace(/^\(\d+ to answer\) /, '');
  box.classList.toggle('show', d.items.length > 0);
  const card = (x) => `<div class="rq" data-id="${x.id}">
    <div class="who"><i style="background:${esc(x.color)}"></i><b>${esc(x.name)}</b><span>${esc(x.role)}${x.via ? ' · via Lucía' : ''} · ${ago(x.created)}</span>
      ${x.ticket && site ? `<a href="${esc(site)}/browse/${esc(x.ticket)}" target="_blank" rel="noopener">${esc(x.ticket)}</a>` : ''}</div>
    <div class="t">${((window.office || {}).rich || esc)(x.title || '')}</div>${x.body ? `<div class="b">${((window.office || {}).md || (window.office || {}).rich || esc)(x.body)}</div>` : ''}
    ${EMBED ? '' : x.kind === 'request'
      ? `<div class="acts">${x.options.map((o, i) => (window.termRun && window.termRun.option(esc(o))) || `<button class="${i ? '' : 'pri'}" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div>
         <div class="acts"><input placeholder="Write an answer…"><button data-send>Send</button></div>`
      : `<div class="acts"><button data-read>Mark as read</button></div>`}
  </div>`;
  box.innerHTML = (reqs.length ? `<h3>Needs your answer · ${reqs.length}</h3>${reqs.map(card).join('')}` : '')
    + (notes.length ? `<h3 class="msg">Messages for you · ${notes.length}</h3>${notes.map(card).join('')}` : '')
    + (d.withLucia ? `<div class="more">Lucía is handling ${d.withLucia} more from the team</div>` : '');
}
async function poll() {
  try {
    const d = await api('/api/requests'); site = d.site || '';
    const s = JSON.stringify(d); if (s !== sig && !box.contains(document.activeElement)) { sig = s; render(d); }
  } catch { /* server restarting */ }
}
box.addEventListener('click', async (e) => {
  const rq = e.target.closest('.rq'); if (!rq) return;
  const id = Number(rq.dataset.id), b = e.target.closest('button'); if (!b) return;
  const text = b.dataset.answer ?? (b.hasAttribute('data-send') ? rq.querySelector('input').value.trim() : null);
  try {
    if (b.hasAttribute('data-read')) await api('/api/requests/read', { id });
    else if (text) await api('/api/requests/answer', { id, text }); else return;
    sig = ''; document.activeElement.blur(); poll();
  } catch (err) { b.textContent = err.message; }
});
box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.parentElement.querySelector('[data-send]').click(); } e.stopPropagation(); });
poll(); setInterval(poll, 3000);
