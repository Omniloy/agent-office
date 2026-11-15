// "For you": one button in the top bar and one panel for everything the team has waiting for the
// person. Three tabs: Requests (questions and messages, answered right here), Drafts (messages the
// business team wrote in the person's name, to check before they go out) and Pull requests (which
// are approved, which wait). The button counts what needs an answer or a check and beats while
// there is any; a toast says when something new arrives. The room shows the same on the desks:
// main.js hands the counts to the world.
const TOKEN = window.__TOKEN__;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => { const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const api = async (path, body) => {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-office-token': TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d;
};
const office = () => window.office || {};
const toast = (html, kind, ms) => office().toast && office().toast(html, kind, ms);
const APP = { gmail: 'Gmail', whatsapp: 'WhatsApp', slack: 'Slack' };
const PR_TEXT = { approved: 'Approved', changes: 'Changes requested', failing: 'Checks failing', review: 'Waiting for review', draft: 'Draft' };
const PR_ORDER = ['approved', 'changes', 'failing', 'review', 'draft'];

const style = document.createElement('style');
style.textContent = `
.tools #btn-drafts { display: none !important; } /* the drafts view opens from the For you panel */
.tools button.inbox b { display: none; margin-left: 6px; padding: 0 6px; border-radius: 99px; font-size: 11px; font-weight: 700; background: var(--needs, #fbbf24); color: #201600; }
.tools button.inbox.has b { display: inline-block; }
.tools button.inbox.has { color: var(--text); animation: inbox-beat 1.6s ease-in-out infinite; }
@keyframes inbox-beat { 0%, 100% { box-shadow: inset 0 0 0 1px rgba(251, 191, 36, .35); background: rgba(251, 191, 36, .08); } 50% { box-shadow: inset 0 0 0 1px rgba(251, 191, 36, .9), 0 0 14px rgba(251, 191, 36, .35); background: rgba(251, 191, 36, .2); } }
@media (prefers-reduced-motion: reduce) { .tools button.inbox.has { animation: none; background: rgba(251, 191, 36, .16); } }
#inbox { position: fixed; top: calc(var(--bar, 44px) + 8px); right: 12px; width: min(500px, calc(100vw - 24px)); max-height: calc(100vh - var(--bar, 44px) - 84px); display: none; flex-direction: column; z-index: 12;
  background: var(--panel, #12151f); border: 1px solid var(--line, rgba(255,255,255,.12)); border-radius: var(--r, 10px); box-shadow: var(--shadow, 0 18px 50px rgba(0,0,0,.45)); font-size: 13px; }
#inbox.show { display: flex; }
#inbox header { display: flex; align-items: center; gap: 2px; padding: 8px 8px 0 10px; border-bottom: 1px solid var(--line, rgba(255,255,255,.12)); }
#inbox header .tab { border: 0; background: transparent; color: var(--muted, #a9b3c9); font: inherit; font-size: 13px; padding: 7px 10px 9px; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; white-space: nowrap; }
#inbox header .tab:hover { color: var(--text, #e8ecf5); }
#inbox header .tab.on { color: var(--text, #e8ecf5); border-bottom-color: var(--accent, #7c9cff); font-weight: 600; }
#inbox header .tab b { margin-left: 6px; padding: 0 6px; border-radius: 99px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,.1); color: var(--muted, #a9b3c9); }
#inbox header .tab b.hot { background: var(--needs, #fbbf24); color: #201600; }
#inbox header .tab b.ok { background: rgba(34,197,94,.2); color: #4ade80; }
#inbox header .x { margin-left: auto; border: 0; background: transparent; color: var(--muted, #a9b3c9); font-size: 15px; padding: 4px 8px; cursor: pointer; }
#inbox .list { overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
#inbox .empty { color: var(--dim, #7f8aa3); padding: 26px 14px; text-align: center; line-height: 1.5; }
#inbox .grp { color: var(--dim, #7f8aa3); font-size: 11.5px; font-weight: 600; padding: 6px 2px 0; }
#inbox .it { padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,.045); border-left: 3px solid var(--c, #888); user-select: text; }
#inbox .it .h { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
#inbox .it .h .who { border: 0; background: transparent; padding: 0; color: var(--text, #e8ecf5); font: inherit; font-weight: 650; cursor: pointer; flex: none; }
#inbox .it .h .who:hover { text-decoration: underline; }
#inbox .it .h i { font-style: normal; font-size: 11px; padding: 1px 7px; border-radius: 99px; background: rgba(251,191,36,.16); color: #fbbf24; flex: none; }
#inbox .it.note .h i, #inbox .it.draft .h i { background: rgba(255,255,255,.1); color: var(--muted, #a9b3c9); }
#inbox .it .h time { margin-left: auto; color: var(--dim, #7f8aa3); font-size: 11.5px; flex: none; }
#inbox .it .t { margin-top: 5px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
#inbox .it .m { margin-top: 3px; color: var(--dim, #7f8aa3); font-size: 12px; overflow-wrap: anywhere; }
#inbox .it .b { margin-top: 5px; color: var(--muted, #a9b3c9); line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 170px; overflow: auto; }
#inbox .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
#inbox .acts button, #inbox .acts a { font: inherit; font-size: 12.5px; padding: 5px 11px; border-radius: 7px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.07); color: var(--text, #e8ecf5); cursor: pointer; text-decoration: none; }
#inbox .acts button:hover, #inbox .acts a:hover { background: rgba(255,255,255,.14); }
#inbox .acts .pri { background: var(--accent, #7c9cff); border-color: var(--accent, #7c9cff); color: var(--on-accent, #0b1022); font-weight: 600; }
#inbox .acts input { flex: 1; min-width: 120px; font: inherit; font-size: 12.5px; padding: 5px 9px; border-radius: 7px; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.25); color: var(--text, #e8ecf5); }
#inbox a.prow { display: grid; grid-template-columns: auto 1fr auto; gap: 2px 9px; align-items: baseline; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,.045); color: inherit; text-decoration: none; }
#inbox a.prow:hover { background: rgba(255,255,255,.09); }
#inbox a.prow b { font: 600 12px var(--mono, Menlo, monospace); color: var(--muted, #a9b3c9); }
#inbox a.prow em { font-style: normal; color: var(--dim, #7f8aa3); font-size: 11.5px; }
#inbox a.prow span { grid-column: 1 / -1; font-size: 12.5px; overflow-wrap: anywhere; }
#inbox .st { font-style: normal; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 99px; background: rgba(251,191,36,.16); color: #fbbf24; white-space: nowrap; }
#inbox .st.approved { background: rgba(34,197,94,.18); color: #4ade80; } #inbox .st.changes, #inbox .st.failing { background: rgba(248,113,113,.18); color: #f87171; } #inbox .st.draft { background: rgba(255,255,255,.1); color: var(--muted, #a9b3c9); }
.toast .go { border: 0; background: transparent; color: var(--accent, #7c9cff); font: inherit; font-weight: 600; padding: 0 0 0 4px; cursor: pointer; }
body.embed #inbox { display: none !important; }
`;
document.head.append(style);

const btn = document.createElement('button');
btn.id = 'btn-reqs'; btn.className = 'inbox'; btn.title = 'Questions, drafts and pull requests waiting for you (R)';
btn.innerHTML = 'For you<b></b>';
($('#btn-more') || $('.tools').lastElementChild).before(btn);
const pop = document.createElement('section');
pop.id = 'inbox';
pop.innerHTML = '<header></header><div class="list"></div>';
document.body.append(pop);

let tab = 'requests', items = [], sig = '', itemSeen = null;
let drafts = [], people = {}, draftSeen = null, draftsOn = true, readOnly = false;
const prs = () => { const s = office().state && office().state(); return (s && s.prs) || []; };
const agentOf = (name) => (office().agents ? office().agents() : []).find((x) => x.herdrName === name);
const hasPrs = () => { const s = office().state && office().state(); return !!(s && Array.isArray(s.prs)); };

const show = (on, which) => { if (which) tab = which; pop.classList.toggle('show', on); btn.classList.toggle('on', on); render(true); };
function render(force) {
  const reqs = items.filter((x) => x.kind === 'request').length, notes = items.length - reqs, open = drafts.length;
  const list = prs(), approved = list.filter((x) => x.state === 'approved').length;
  const waiting = items.length + open; // messages count too: a note left for the person is also waiting to be read
  btn.querySelector('b').textContent = waiting || '';
  btn.classList.toggle('has', waiting > 0);
  if (!pop.classList.contains('show')) return;
  const typing = pop.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (typing && !force) return;
  const tabs = [['requests', 'Requests', items.length, reqs ? 'hot' : ''], ['drafts', 'Drafts', open, open ? 'hot' : '']];
  if (hasPrs()) tabs.push(['prs', 'Pull requests', approved ? `${approved} approved` : list.length, approved ? 'ok' : '']);
  pop.querySelector('header').innerHTML = tabs.map(([id, name, n, cls]) => `<button type="button" class="tab ${tab === id ? 'on' : ''}" data-tab="${id}">${name}${n ? `<b class="${cls}">${n}</b>` : ''}</button>`).join('') + '<button type="button" class="x" data-close title="Close (Esc)">✕</button>';
  const body = pop.querySelector('.list');
  if (tab === 'requests') {
    body.innerHTML = items.length ? items.map((x) => `
      <div class="it ${x.kind === 'request' ? 'request' : 'note'}" data-id="${esc(x.id)}" style="--c:${esc(x.color)}">
        <div class="h"><button type="button" class="who" data-who="${esc(x.from)}" title="Go to their desk">${esc(x.name)}</button><i>${x.kind === 'request' ? 'needs your answer' : 'message'}</i><time>${esc(ago(x.created))}</time></div>
        <div class="t">${((window.office || {}).rich || esc)(x.title || '')}</div>${x.body ? `<div class="b">${((window.office || {}).rich || esc)(x.body)}</div>` : ''}
        ${x.kind === 'request'
          ? `${(x.options || []).length ? `<div class="acts">${x.options.map((o, i) => `<button type="button" class="${i ? '' : 'pri'}" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}
             <div class="acts"><input placeholder="Write an answer…"><button type="button" data-send>Send</button></div>`
          : '<div class="acts"><button type="button" data-read>Mark as read</button></div>'}
      </div>`).join('') : `<div class="empty">No questions or messages are waiting for you.${notes ? '' : '<br>When someone on the team needs an answer, it shows up here.'}</div>`;
  } else if (tab === 'drafts') {
    body.innerHTML = open ? drafts.map((x) => {
      const p = people[x.from] || {}, app = APP[x.channel] || x.channel || 'the app';
      return `<div class="it draft" style="--c:${esc(p.color || '#2dd4bf')}">
        <div class="h"><button type="button" class="who" data-who="${esc(x.from)}" title="Go to their desk">${esc((p.name || x.from).split(' ')[0])}</button><i>${esc(app)}</i><time>${esc(ago(x.updated || x.created))}</time></div>
        <div class="t">${esc(x.subject || x.to || 'Draft')}</div>
        <div class="m">To ${esc(x.to || x.chat || x.phone || '—')}${x.why ? ` · ${esc(x.why)}` : ''}</div>
        <div class="b">${esc(x.body || '')}</div>
        <div class="acts">${x.link ? `<a class="pri" href="${esc(x.link)}" target="_blank" rel="noopener">Open in ${esc(app)}</a>` : ''}${readOnly ? '' : '<button type="button" data-full>Edit or ask about it</button>'}</div>
      </div>`;
    }).join('') + (readOnly ? '<div class="grp">To edit a draft or ask its author about it, open the Business office.</div>' : '')
      : `<div class="empty">No drafts are waiting for you.<br>When the business team writes a message in your name, it shows up here to check before it goes out.${readOnly ? '' : '<div class="acts" style="justify-content:center"><button type="button" data-full>See sent and older drafts</button></div>'}</div>`;
  } else {
    const row = (x) => { const a = agentOf(x.owner); return `<a class="prow" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.repo)} #${x.number}</b><em>${a ? esc(a.name.split(' ')[0]) : 'nobody on the team'}${x.ticket ? ` · ${esc(x.ticket)}` : ''}</em><i class="st ${x.state}">${PR_TEXT[x.state] || x.state}</i><span>${esc(x.title)}</span></a>`; };
    const mine = list.filter((x) => x.owner), rest = list.filter((x) => !x.owner);
    const sorted = (l) => [...l].sort((a, b) => PR_ORDER.indexOf(a.state) - PR_ORDER.indexOf(b.state));
    body.innerHTML = list.length
      ? (mine.length ? `<div class="grp">Held by someone on the team · ${mine.length}</div>${sorted(mine).map(row).join('')}` : '')
        + (rest.length ? `<div class="grp">Other open pull requests in the team's repos · ${rest.length}</div>${sorted(rest).map(row).join('')}` : '')
      : '<div class="empty">No open pull requests in this team\'s repos.</div>';
  }
}

// ---------------------------------------------------------------- requests
async function poll() {
  try {
    const d = await api('/api/requests');
    const next = d.items || [], s = JSON.stringify(next);
    if (s === sig) return;
    sig = s; items = next;
    if (itemSeen) for (const x of next) { // say so when a new message arrives (questions are announced by the main page)
      if (itemSeen.has(x.id) || x.kind === 'request') continue;
      toast(`<i class="dot" style="background:${esc(x.color || '#fbbf24')}"></i><b>${esc(x.name || x.from)}</b> left you a message: ${esc(String(x.title || '').slice(0, 90))}<button type="button" class="go" data-go="requests">Open</button>`, '', 14000);
      if (office().chime) office().chime([660, 784]);
    }
    itemSeen = new Set(next.map((x) => x.id));
    render();
  } catch { /* the server is restarting */ }
}
btn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (pop.classList.contains('show')) return show(false);
  show(true, items.length ? 'requests' : drafts.length ? 'drafts' : tab); // open on whatever is waiting
});
pop.addEventListener('click', async (e) => {
  if (e.target.closest('[data-close]')) return show(false);
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; return render(true); }
  if (e.target.closest('[data-full]')) { show(false); const b = $('#btn-drafts'); if (b) b.click(); return; }
  const who = e.target.closest('[data-who]');
  if (who) { const a = agentOf(who.dataset.who); if (a && office().select) { show(false); office().select(a.slug); } return; }
  const card = e.target.closest('.it'), b = e.target.closest('button');
  if (!card || !b || !card.dataset.id) return;
  const id = Number(card.dataset.id);
  const text = b.dataset.answer ?? (b.hasAttribute('data-send') ? card.querySelector('input').value.trim() : null);
  try {
    if (b.hasAttribute('data-read')) await api('/api/requests/read', { id });
    else if (text) await api('/api/requests/answer', { id, text });
    else return;
    if (document.activeElement) document.activeElement.blur();
    sig = ''; await poll(); if (office().refreshAsks) office().refreshAsks();
  } catch (err) { toast(esc(err.message), 'err', 8000); }
});
pop.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') show(false);
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.parentElement.querySelector('[data-send]').click(); }
});
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); pop.classList.contains('show') ? show(false) : show(true); }
  else if (e.key === 'Escape' && pop.classList.contains('show')) show(false);
});
addEventListener('pointerdown', (e) => { if (pop.classList.contains('show') && !e.target.closest('#inbox, #btn-reqs, .toast')) show(false); });
document.addEventListener('click', (e) => { const go = e.target.closest('.toast .go'); if (go) show(true, go.dataset.go === 'drafts' ? 'drafts' : 'requests'); });
poll(); setInterval(poll, 3000);
setInterval(() => { if (pop.classList.contains('show') && tab === 'prs') render(); }, 5000);

// ---------------------------------------------------------------- drafts
async function pollDrafts() {
  if (!draftsOn) return;
  let d;
  try { d = await api('/api/drafts'); } catch (e) { if (/404|not found/i.test(e.message)) draftsOn = false; return; }
  people = d.people || {}; readOnly = !!d.readOnly;
  const open = (d.drafts || []).filter((x) => x.status === 'open'), by = {};
  for (const x of open) by[x.from] = (by[x.from] || 0) + 1;
  const changed = JSON.stringify(open) !== JSON.stringify(drafts);
  drafts = open;
  if (JSON.stringify(by) !== JSON.stringify(window.__officeDrafts || {})) { window.__officeDrafts = by; if (office().applyAsks) office().applyAsks(); }
  if (draftSeen) for (const x of open) {
    if (draftSeen.has(x.id)) continue;
    toast(`<i class="dot" style="background:#2dd4bf"></i><b>${esc(((people[x.from] || {}).name || x.from).split(' ')[0])}</b> has a draft for you to check<button type="button" class="go" data-go="drafts">Open</button>`, '', 12000);
    if (office().chime) office().chime([784, 988]);
  }
  draftSeen = new Set(open.map((x) => x.id));
  if (changed) render();
}
pollDrafts(); setInterval(pollDrafts, 4000);
