// Drafts: every outgoing message the team has prepared in __OWNER__'s name (written by `team-draft`,
// stored in ~/.omniloy-biz/drafts.json). A popup to read, edit, open in the real app, and ask the
// author about a draft. Nothing is sent from here: sending happens in Gmail or WhatsApp.
// Self-contained: main.js doesn't know it.
const TOKEN = window.__TOKEN__;
const EMBED = new URLSearchParams(location.search).has('embed');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => { const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const api = async (path, body) => {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-office-token': TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d;
};
const APP = { gmail: 'Gmail', whatsapp: 'WhatsApp', slack: 'Slack' };

const style = document.createElement('style');
style.textContent = `
#btn-drafts b { margin-left: 6px; padding: 0 6px; border-radius: 99px; background: #2dd4bf; color: #06231f; font-size: 11px; }
#drafts-veil { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center; background: rgba(6, 12, 14, .55); backdrop-filter: blur(3px); }
#drafts-veil.show { display: flex; }
#drafts { width: min(1080px, calc(100vw - 40px)); height: min(720px, calc(100vh - 60px)); display: grid; grid-template-columns: 330px 1fr; grid-template-rows: auto 1fr;
  border-radius: 18px; background: rgba(16, 24, 28, .96); border: 1px solid rgba(255,255,255,.14); color: #e8f0ee; font-size: 13px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.5); }
#drafts header { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,.1); }
#drafts header h2 { margin: 0; font-size: 17px; } #drafts header small { color: #8fa3a0; flex: 1; }
#drafts button { font: inherit; font-size: 12.5px; padding: 6px 12px; border-radius: 9px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.07); color: #e8f0ee; cursor: pointer; }
#drafts button:hover { background: rgba(255,255,255,.13); } #drafts button:disabled { opacity: .45; cursor: default; }
#drafts .pri { background: #2dd4bf; color: #06231f; border-color: #2dd4bf; font-weight: 600; text-decoration: none; padding: 6px 12px; border-radius: 9px; font-size: 12.5px; }
#drafts .x { border: 0; width: 30px; height: 30px; padding: 0; }
#dr-list { overflow: auto; border-right: 1px solid rgba(255,255,255,.1); padding: 8px; display: flex; flex-direction: column; gap: 6px; }
#dr-list .f { display: flex; gap: 5px; padding: 2px 2px 6px; flex-wrap: wrap; }
#dr-list .f button { padding: 3px 10px; border-radius: 99px; font-size: 12px; color: #a9bbb8; background: transparent; } #dr-list .f button.on { color: #e8f0ee; border-color: #2dd4bf; background: rgba(255,255,255,.07); }
.dr { text-align: left; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.05); cursor: pointer; border: 1px solid transparent; }
.dr:hover { background: rgba(255,255,255,.09); } .dr.on { border-color: #2dd4bf; background: rgba(45,212,191,.09); }
.dr .l1 { display: flex; align-items: center; gap: 7px; } .dr .l1 b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13.5px; } .dr .l1 time { color: #8fa3a0; font-size: 11.5px; }
.dr .l2 { color: #a9bbb8; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dr .l3 { color: #8fa3a0; margin-top: 4px; font-size: 11.5px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .dr .l3 i.dot { width: 8px; height: 8px; border-radius: 50%; }
.chn { font-style: normal; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; padding: 1px 7px; border-radius: 99px; text-transform: uppercase; }
.chn.gmail { background: rgba(125,211,252,.16); color: #7dd3fc; } .chn.whatsapp { background: rgba(74,222,128,.16); color: #4ade80; } .chn.slack { background: rgba(196,181,253,.16); color: #c4b5fd; }
.tag { font-size: 11px; padding: 1px 7px; border-radius: 99px; background: rgba(251,191,36,.16); color: #fbbf24; } .tag.q { background: rgba(196,181,253,.16); color: #c4b5fd; }
#dr-detail { overflow: auto; padding: 16px 20px 18px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
#dr-detail .empty, #dr-list .empty { color: #8fa3a0; padding: 30px 10px; text-align: center; line-height: 1.5; }
#dr-detail .meta { display: grid; grid-template-columns: 70px 1fr; gap: 4px 10px; } #dr-detail .meta span { color: #8fa3a0; font-size: 12px; padding-top: 1px; }
#dr-detail .why { color: #a9bbb8; line-height: 1.45; }
#dr-detail input, #dr-detail textarea { font: inherit; width: 100%; box-sizing: border-box; color: #e8f0ee; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.16); border-radius: 10px; padding: 8px 10px; }
#dr-detail [hidden] { display: none !important; }
#dr-detail textarea { flex: 1; min-height: 220px; resize: vertical; line-height: 1.5; font-size: 13.5px; }
#dr-detail input:focus, #dr-detail textarea:focus { outline: 2px solid rgba(45,212,191,.6); outline-offset: 0; }
#dr-preview { flex: 1; min-height: 160px; overflow: auto; background: #fff; color: #1f2328; border-radius: 10px; padding: 14px 16px; font: 13.5px/1.5 Arial, Helvetica, sans-serif; }
#dr-preview p { margin: 0 0 12px; } #dr-preview a { color: #1155cc; }
#drafts a.lnk { color: #e8f0ee; text-decoration: none; font-size: 12.5px; padding: 6px 12px; border-radius: 9px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.07); }
#dr-detail .acts input { flex: 1; width: auto; min-width: 0; }
#dr-detail .acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } #dr-detail .acts .sp { flex: 1; }
#dr-detail .warn { color: #fbbf24; font-size: 12px; line-height: 1.4; } #dr-detail .ok { color: #5eead4; font-size: 12px; }
#dr-detail h4 { margin: 8px 0 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #8fa3a0; font-weight: 600; }
.talk { display: flex; flex-direction: column; gap: 6px; } .talk div { padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.05); line-height: 1.45; white-space: pre-wrap; }
.talk div.me { background: rgba(45,212,191,.1); } .talk b { font-size: 11.5px; color: #8fa3a0; font-weight: 600; margin-right: 6px; }
#dr-thread { border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: rgba(255,255,255,.035); flex: none; }
#dr-thread .th { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 8px 12px; text-align: left; color: #a9bbb8; border-radius: 10px; }
#dr-thread .th b { color: #e8f0ee; font-weight: 600; } #dr-thread .th i { font-style: normal; display: inline-block; width: 10px; transition: transform .12s; } #dr-thread.open .th i { transform: rotate(90deg); }
#dr-thread .th span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#dr-thread .last { padding: 0 12px 10px 30px; color: #c5d2d0; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
#dr-thread .msgs { max-height: min(42vh, 380px); overflow: auto; border-top: 1px solid rgba(255,255,255,.1); overscroll-behavior: contain; }
#dr-thread .m { border-bottom: 1px solid rgba(255,255,255,.07); } #dr-thread .m:last-child { border-bottom: 0; }
#dr-thread .m .mh { display: flex; gap: 8px; align-items: baseline; padding: 8px 12px; cursor: pointer; } #dr-thread .m .mh:hover { background: rgba(255,255,255,.05); }
#dr-thread .m .mh b { font-weight: 600; white-space: nowrap; } #dr-thread .m.mine .mh b { color: #5eead4; }
#dr-thread .m .mh span { flex: 1; min-width: 0; color: #8fa3a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #dr-thread .m .mh time { color: #8fa3a0; font-size: 11.5px; white-space: nowrap; }
#dr-thread .m .mb { display: none; padding: 0 12px 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; color: #dbe5e3; } #dr-thread .m.on .mb { display: block; } #dr-thread .m.on .mh span { visibility: hidden; }
#dr-thread .m .mt { color: #8fa3a0; font-size: 11.5px; margin-bottom: 6px; white-space: normal; } #dr-thread .note { padding: 8px 12px; color: #8fa3a0; }
@media (max-width: 760px) { #drafts { grid-template-columns: 1fr; grid-template-rows: auto 200px 1fr; } #dr-list { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.1); } }
`;
document.head.appendChild(style);

const btn = document.createElement('button'); btn.id = 'btn-drafts'; btn.title = 'Messages the team has drafted for you to send (D)'; btn.textContent = 'Drafts';
const tools = document.querySelector('.tools'); if (tools && !EMBED) tools.insertBefore(btn, document.querySelector('#btn-more'));
const veil = document.createElement('div'); veil.id = 'drafts-veil';
veil.innerHTML = `<section id="drafts" role="dialog" aria-label="Drafts"><header><h2>Drafts</h2><small id="dr-sub"></small><button class="x" id="dr-close" title="Close (Esc)">✕</button></header><div id="dr-list"></div><div id="dr-detail"></div></section>`;
document.body.appendChild(veil);
const $ = (s) => veil.querySelector(s);

let signature = null, drafts = [], people = {}, cur = null, filter = 'all', sig = '', dirty = false, flash = '';
const who = (slug) => people[slug] || { name: slug, color: '#8fa3a0' };
const firstName = (slug) => who(slug).name.split(' ')[0];

function renderList() {
  const n = drafts.length;
  btn.innerHTML = `Drafts${n ? `<b>${n}</b>` : ''}`;
  $('#dr-sub').textContent = n ? `${n} waiting for you · email goes out only when you press Send` : 'Nothing waiting';
  const chans = [...new Set(drafts.map((x) => x.channel))];
  const list = drafts.filter((x) => filter === 'all' || x.channel === filter);
  $('#dr-list').innerHTML = (chans.length > 1 ? `<div class="f"><button data-f="all" class="${filter === 'all' ? 'on' : ''}">All ${n}</button>${chans.map((c) => `<button data-f="${c}" class="${filter === c ? 'on' : ''}">${APP[c] || c} ${drafts.filter((x) => x.channel === c).length}</button>`).join('')}</div>` : '')
    + (list.length ? list.map((x) => {
      const q = (x.talk || []).some((t) => t.who !== '__OWNER_ID__') && (x.talk || []).at(-1).who !== '__OWNER_ID__';
      return `<div class="dr ${cur === x.id ? 'on' : ''}" data-id="${x.id}">
        <div class="l1"><i class="chn ${esc(x.channel)}">${esc(APP[x.channel] || x.channel)}</i><b>${esc(x.to)}</b><time>${ago(x.created)}</time></div>
        <div class="l2">${esc(x.subject || x.body.split('\n').find((l) => l.trim()) || '')}</div>
        <div class="l3"><i class="dot" style="background:${esc(who(x.from).color)}"></i>${esc(firstName(x.from))}${x.client ? ` · ${esc(x.client)}` : ''}${x.edited ? '<span class="tag">edited by you</span>' : ''}${q ? '<span class="tag q">reply for you</span>' : ''}</div></div>`;
    }).join('') : `<div class="empty">No drafts waiting.<br>When someone on the team prepares a message for you, it appears here.</div>`);
}
// The message as the recipient will see it: paragraphs, links, then the signature.
function preview(text) {
  const lines = text.replace(/\s+$/, '').split('\n'), squash = (s) => s.replace(/[\s|]+/g, ' ').trim(), sig = signature;
  let body = text, sigHtml = '';
  if (sig && lines.length >= 3) {
    const want = [sig.name, sig.title, sig.links.map((l) => `${l.label}: ${l.url}`).join(' ')].map(squash);
    if (lines.slice(-3).map(squash).every((l, i) => l === want[i])) {
      body = lines.slice(0, -3).join('\n');
      sigHtml = `<p><b>${esc(sig.name)}</b><br>${esc(sig.title)}<br>${sig.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(esc(sig.appSeparator))}</p>`;
    }
  }
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>')}</p>`).join('') + sigHtml;
}
// The mail this draft answers, read live from Gmail when the draft is picked. Closed, it shows who wrote last and
// the start of what they said; open, the whole thread in a box that scrolls on its own, the last message unfolded.
const threads = new Map(); let thOpen = false; const msgOpen = new Set();
const short = (addr) => (String(addr || '').split('<')[0].replace(/"/g, '').trim() || String(addr || '').replace(/[<>]/g, '')).split(',')[0];
const when = (iso) => { const t = new Date(iso); return isNaN(t) ? '' : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
function threadHtml(x) {
  const t = threads.get(x.id);
  if (!t || t.state === 'loading') return '<div class="note">Loading the thread…</div>';
  if (t.state === 'err') return `<div class="note">The thread could not be read: ${esc(t.error)} <button id="dr-th-retry">Try again</button></div>`;
  const ms = t.messages, n = ms.length;
  if (!n) return '<div class="note">Nothing earlier in this thread: this message starts it.</div>';
  const last = ms[n - 1];
  const head = `<button class="th" id="dr-th-toggle" aria-expanded="${thOpen}"><i>▸</i><b>Thread · ${n} ${n === 1 ? 'message' : 'messages'}</b><span>${thOpen ? '' : `last from ${esc(last.mine ? 'you' : short(last.from))}, ${esc(when(last.date))}`}</span></button>`;
  if (!thOpen) return head + `<div class="last" id="dr-th-last" title="Show the whole thread">${esc(last.text.slice(0, 600))}</div>`;
  return head + `<div class="msgs">${ms.map((m, i) => {
    const on = msgOpen.has(m.id) || (i === n - 1 && !msgOpen.has('-' + m.id));
    return `<div class="m ${m.mine ? 'mine' : ''} ${on ? 'on' : ''}" data-m="${esc(m.id)}"><div class="mh"><b>${esc(m.mine ? 'You' : short(m.from))}</b><span>${esc(m.text.replace(/\s+/g, ' ').slice(0, 160))}</span><time>${esc(when(m.date))}</time></div>
      <div class="mb"><div class="mt">to ${esc(m.to)}${m.cc ? ` · cc ${esc(m.cc)}` : ''}${m.attachments.length ? ` · attached: ${esc(m.attachments.join(', '))}` : ''}</div>${esc(m.text) || '<i>(no text)</i>'}</div></div>`;
  }).join('')}</div>`;
}
function paintThread() {
  const x = drafts.find((d) => d.id === cur), el = $('#dr-thread'); if (!x || !el) return;
  el.classList.toggle('open', thOpen); el.innerHTML = threadHtml(x);
  const box = el.querySelector('.msgs'); if (box) box.scrollTop = box.scrollHeight;
}
async function loadThread(x, again) {
  if (threads.has(x.id) && !again) return;
  threads.set(x.id, { state: 'loading' });
  try { const d = await api(`/api/drafts/thread?id=${x.id}`); threads.set(x.id, { state: 'ok', messages: d.messages || [] }); }
  catch (e) { threads.set(x.id, { state: 'err', error: e.message }); }
  if (cur === x.id) paintThread();
}
let editing = false;
function renderDetail() {
  const x = drafts.find((d) => d.id === cur), box = $('#dr-detail');
  if (!x) { box.innerHTML = `<div class="empty">${drafts.length ? 'Pick a draft on the left.' : ''}</div>`; return; }
  const app = APP[x.channel] || x.channel, author = firstName(x.from);
  const stale = !x.synced, canSend = x.channel === 'gmail' && Boolean(x.draftId);
  const openHint = x.channel === 'whatsapp' ? (x.phone ? 'Opens the chat with this text already typed. You press send there.' : `Opens WhatsApp. Find the chat${x.chat ? ` “${esc(x.chat)}”` : ''}; ${author} may have typed the text there already, or use Copy text.`)
    : x.thread ? 'Opens the thread in Gmail with the draft at the bottom. You press send there.' : 'Opens your Gmail drafts. You press send there.';
  box.innerHTML = `
    <div class="meta"><span>To</span><div>${esc(x.to)}</div>${x.cc ? `<span>Cc</span><div>${esc(x.cc)}</div>` : ''}
      <span>From</span><div>${esc(who(x.from).name)} · ${ago(x.created)}${x.client ? ` · client ${esc(x.client)}` : ''}</div>
      ${x.why ? `<span>Why</span><div class="why">${esc(x.why)}</div>` : ''}</div>
    ${x.channel === 'gmail' ? `<input id="dr-subject" value="${esc(x.subject)}" placeholder="Subject" aria-label="Subject" ${editing ? '' : 'hidden'}>${editing ? '' : `<div class="meta"><span>Subject</span><div>${esc(x.subject)}</div></div>`}` : ''}
    ${x.channel === 'gmail' && x.thread ? `<div id="dr-thread" class="${thOpen ? 'open' : ''}">${threadHtml(x)}</div>` : ''}
    <div id="dr-preview" ${editing ? 'hidden' : ''}>${preview(x.body)}</div>
    <textarea id="dr-body" aria-label="Message text" spellcheck="true" ${editing ? '' : 'hidden'}>${esc(x.body)}</textarea>
    ${stale ? `<div class="warn">${x.syncError ? `Gmail was not updated: ${esc(x.syncError)}` : `${app} still has the earlier text. Copy text gives you your version now.`}</div>` : ''}
    ${flash ? `<div class="ok">${esc(flash)}</div>` : ''}
    <div class="acts">
      ${canSend ? `<button class="pri" id="dr-send" title="Sends this email now from your Gmail, exactly as shown">Send</button>` : ''}
      <button id="dr-edit">${editing ? 'Preview' : 'Edit'}</button>
      <button id="dr-save" disabled ${editing ? '' : 'hidden'}>Save changes</button>
      ${x.link ? `<a class="${canSend ? 'lnk' : 'pri'}" id="dr-open" href="${esc(x.link)}" target="_blank" rel="noopener" title="${esc(openHint)}">Open in ${esc(app)}</a>` : ''}
      <button id="dr-copy">Copy text</button><span class="sp"></span>
      <button id="dr-sent" title="You sent it. Removes it from this list and tells ${esc(author)}.">Mark as sent</button>
      <button id="dr-discard" title="You will not send it. Removes it from this list and tells ${esc(author)}.">Discard</button>
    </div>
    <h4>Ask ${esc(author)} about this draft</h4>
    ${(x.talk || []).length ? `<div class="talk">${x.talk.map((t) => `<div class="${t.who === '__OWNER_ID__' ? 'me' : ''}"><b>${t.who === '__OWNER_ID__' ? 'You' : esc(firstName(t.who))}</b>${esc(t.text)}</div>`).join('')}</div>` : ''}
    <div class="acts"><input id="dr-q" placeholder="Why this tone? Can you make it shorter? Who else is on the thread?" aria-label="Question about this draft"><button id="dr-ask">Ask</button></div>`;
  dirty = false; flash = '';
  if (x.channel === 'gmail' && x.thread) { loadThread(x); const mb = box.querySelector('#dr-thread .msgs'); if (mb) mb.scrollTop = mb.scrollHeight; }
}
function render() { renderList(); renderDetail(); }

async function poll(force) {
  try {
    const d = await api('/api/drafts'); people = d.people || {}; signature = d.signature || signature;
    const s = JSON.stringify(d.drafts);
    drafts = d.drafts;
    if (cur !== null && !drafts.some((x) => x.id === cur)) cur = null;
    if (s === sig && !force) return; sig = s;
    renderList();
    if (!dirty && !['dr-q', 'dr-body', 'dr-subject'].includes(document.activeElement && document.activeElement.id)) renderDetail();
  } catch { /* server restarting */ }
}
function open(on) {
  const show = on ?? !veil.classList.contains('show');
  veil.classList.toggle('show', show); btn.classList.toggle('on', show);
  if (show) { if (cur === null && drafts.length) cur = drafts[0].id; render(); }
}
btn.onclick = () => open();
veil.addEventListener('mousedown', (e) => { if (e.target === veil) open(false); });
veil.addEventListener('input', (e) => { if (e.target.id === 'dr-body' || e.target.id === 'dr-subject') { dirty = true; const s = $('#dr-save'); if (s) s.disabled = false; } });
veil.addEventListener('click', async (e) => {
  if (e.target.closest('#dr-close')) return open(false);
  const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; return renderList(); }
  const row = e.target.closest('.dr'); if (row) { cur = Number(row.dataset.id); editing = false; thOpen = false; return render(); }
  if (e.target.closest('#dr-th-toggle, #dr-th-last')) { thOpen = !thOpen; return paintThread(); }
  if (e.target.closest('#dr-th-retry')) { const y = drafts.find((d) => d.id === cur); if (y) { loadThread(y, true); paintThread(); } return; }
  const mh = e.target.closest('#dr-thread .mh'); if (mh) { const m = mh.parentElement, id = m.dataset.m, on = !m.classList.contains('on'); m.classList.toggle('on', on); msgOpen.delete(on ? '-' + id : id); msgOpen.add(on ? id : '-' + id); return; }
  const b = e.target.closest('button, a.pri'); if (!b || cur === null) return;
  const x = drafts.find((d) => d.id === cur); if (!x) return;
  const body = $('#dr-body').value, subject = $('#dr-subject') ? $('#dr-subject').value : undefined;
  try {
    if (b.id === 'dr-edit') { if (dirty) return; editing = !editing; renderDetail(); }
    else if (b.id === 'dr-send') {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = `Yes, send to ${x.to.split('<')[0].trim().split(' ')[0] || 'them'} now`; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = 'Send'; } }, 5000); return; }
      b.disabled = true; b.textContent = 'Sending…';
      if (dirty) await api('/api/drafts/edit', { id: cur, body, subject });
      await api('/api/drafts/send', { id: cur }); cur = null; dirty = false; editing = false; await poll(true); if (drafts.length) cur = drafts[0].id; flash = 'Sent.'; render();
    }
    else if (b.id === 'dr-save') { await api('/api/drafts/edit', { id: cur, body, subject }); flash = x.channel === 'gmail' ? 'Saved. The Gmail draft now says this.' : 'Saved.'; dirty = false; editing = false; await poll(true); renderDetail(); }
    else if (b.id === 'dr-open') { if (dirty) { e.preventDefault(); await api('/api/drafts/edit', { id: cur, body, subject }); dirty = false; await poll(true); const y = drafts.find((d) => d.id === cur); renderDetail(); if (y && y.link) window.open(y.link, '_blank', 'noopener'); } }
    else if (b.id === 'dr-copy') { try { await navigator.clipboard.writeText(body); b.textContent = 'Copied'; } catch { $('#dr-body').select(); b.textContent = 'Selected, press ⌘C'; } setTimeout(() => { b.textContent = 'Copy text'; }, 1600); }
    else if (b.id === 'dr-sent' || b.id === 'dr-discard') {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = b.id === 'dr-sent' ? 'Yes, I sent it' : 'Yes, discard it'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = b.id === 'dr-sent' ? 'Mark as sent' : 'Discard'; } }, 4000); return; }
      await api('/api/drafts/status', { id: cur, status: b.id === 'dr-sent' ? 'sent' : 'discarded' }); cur = null; dirty = false; await poll(true); if (drafts.length) cur = drafts[0].id; render();
    } else if (b.id === 'dr-ask') { const q = $('#dr-q').value.trim(); if (!q) return; await api('/api/drafts/ask', { id: cur, text: q }); document.activeElement.blur(); await poll(true); renderDetail(); }
  } catch (err) { flash = ''; b.textContent = err.message; }
});
veil.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.target.blur(); else open(false); }
  else if (e.key === 'Enter' && e.target.id === 'dr-q') { e.preventDefault(); $('#dr-ask').click(); }
  e.stopPropagation();
});
addEventListener('keydown', (e) => {
  if (EMBED || e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) return;
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); open(); }
  else if (e.key === 'Escape' && veil.classList.contains('show')) { e.stopImmediatePropagation(); open(false); }
}, true);
if (location.hash === '#drafts') open(true);
poll(); setInterval(poll, 4000);
