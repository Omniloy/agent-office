// Drafts: every outgoing message the team has prepared in __OWNER__'s name (written by `team-draft`,
// stored in ~/.omniloy-biz/drafts.json). A popup to read, edit, send, and ask the author about a draft, with the
// thread it answers and the files attached. Shared file: the same on every floor (edit it in team-office, copy it to
// the other two apps); the routes are in drafts-api.mjs. Self-contained: main.js doesn't know it.
const TOKEN = window.__TOKEN__;
const EMBED = new URLSearchParams(location.search).has('embed');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (iso) => { const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const api = async (path, body) => {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-office-token': TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d;
};
const APP = { gmail: 'Gmail', whatsapp: 'WhatsApp', slack: 'Slack', calendar: 'Calendar' };

const style = document.createElement('style');
style.textContent = `
#btn-drafts b { margin-left: 6px; padding: 0 6px; border-radius: 99px; background: #2dd4bf; color: #06231f; font-size: 11px; }
#drafts-veil { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center; background: rgba(6, 12, 14, .55); backdrop-filter: blur(3px); }
#drafts-veil.show { display: flex; }
#drafts { width: min(1500px, calc(100vw - 32px)); height: calc(100vh - 40px); display: grid; grid-template-columns: 300px 1fr; grid-template-rows: auto 1fr;
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
#drafts .dr { text-align: left; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.05); cursor: pointer; border: 1px solid transparent; }
#drafts .dr:hover { background: rgba(255,255,255,.09); } #drafts .dr.on { border-color: #2dd4bf; background: rgba(45,212,191,.09); }
#drafts .dr .l1 { display: flex; align-items: center; gap: 7px; } #drafts .dr .l1 b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13.5px; } #drafts .dr .l1 time { color: #8fa3a0; font-size: 11.5px; }
#drafts .dr .l2 { color: #a9bbb8; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#drafts .dr .l3 { color: #8fa3a0; margin-top: 4px; font-size: 11.5px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } #drafts .dr .l3 i.dot { width: 8px; height: 8px; border-radius: 50%; }
#drafts .chn { font-style: normal; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; padding: 1px 7px; border-radius: 99px; text-transform: uppercase; }
#drafts .chn.gmail { background: rgba(125,211,252,.16); color: #7dd3fc; } #drafts .chn.whatsapp { background: rgba(74,222,128,.16); color: #4ade80; } #drafts .chn.slack { background: rgba(196,181,253,.16); color: #c4b5fd; } #drafts .chn.calendar { background: rgba(251,146,60,.16); color: #fdba74; }
#dr-detail .evt { font-size: 17px; font-weight: 600; line-height: 1.3; } #dr-detail .evw { font-size: 14px; }
#dr-detail .guests { display: flex; flex-wrap: wrap; gap: 5px; } #dr-detail .guests i { font-style: normal; font-size: 12px; padding: 2px 9px; border-radius: 99px; background: rgba(255,255,255,.08); overflow-wrap: anywhere; }
#dr-detail .guests i.accepted { background: rgba(74,222,128,.16); color: #86efac; } #dr-detail .guests i.declined { background: rgba(248,113,113,.14); color: #fca5a5; text-decoration: line-through; } #dr-detail .guests i.tentative { background: rgba(251,191,36,.14); color: #fcd34d; }
#dr-cal-live { border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: rgba(255,255,255,.035); padding: 9px 12px; line-height: 1.5; flex: none; }
#dr-cal-live .note { color: #8fa3a0; } #dr-cal-live .free { color: #5eead4; } #dr-cal-live .clash b { color: #fbbf24; font-weight: 600; display: block; margin-bottom: 2px; }
#dr-cal-live .clash div { display: flex; gap: 10px; } #dr-cal-live .clash time { color: #8fa3a0; white-space: nowrap; min-width: 92px; } #dr-cal-live .clash em { color: #8fa3a0; font-style: normal; }
#dr-detail .desc { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: rgba(0,0,0,.22); color: #dbe5e3; }
#dr-detail .hint { color: #8fa3a0; font-size: 12px; line-height: 1.4; }
#drafts .evform { display: flex; flex-direction: column; gap: 9px; } #drafts .evform label { display: flex; flex-direction: column; gap: 4px; color: #8fa3a0; font-size: 12px; min-width: 0; }
#drafts .evform .row { display: flex; gap: 9px; flex-wrap: wrap; } #drafts .evform .row label { flex: 1; min-width: 110px; }
#drafts .evform label.chk { flex-direction: row; align-items: center; gap: 8px; color: #e8f0ee; font-size: 13px; } #dr-detail .evform label.chk input { width: auto; flex: none; margin: 0; }
#dr-detail .evform textarea { flex: none; min-height: 0; resize: vertical; } #drafts .evform input[type=date], #drafts .evform input[type=time] { color-scheme: dark; }
#drafts .tag { font-size: 11px; padding: 1px 7px; border-radius: 99px; background: rgba(251,191,36,.16); color: #fbbf24; } #drafts .tag.q { background: rgba(196,181,253,.16); color: #c4b5fd; }
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
#drafts .talk { display: flex; flex-direction: column; gap: 6px; } #drafts .talk div { padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.05); line-height: 1.45; white-space: pre-wrap; }
#drafts .talk div.me { background: rgba(45,212,191,.1); } #drafts .talk b { font-size: 11.5px; color: #8fa3a0; font-weight: 600; margin-right: 6px; }
/* a Gmail draft with a thread: the reply and the thread side by side; on a narrow screen, two tabs */
#dr-detail.split { padding: 0; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: 1fr; gap: 0; }
#dr-detail.split .pane { overflow: auto; padding: 16px 20px 18px; display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
#dr-detail.split .pane.th { border-left: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.14); padding-top: 0; }
#dr-detail .seg { display: none; }
@media (max-width: 1180px) {
  #dr-detail.split { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  #dr-detail .seg { display: flex; gap: 4px; padding: 10px 16px 0; }
  #dr-detail .seg button { flex: 1; border-radius: 9px; } #dr-detail .seg button.on { border-color: #2dd4bf; background: rgba(45,212,191,.14); font-weight: 600; }
  #dr-detail.split.v-reply .pane.th, #dr-detail.split.v-thread .pane.rp { display: none; }
  #dr-detail.split .pane.th { border-left: 0; }
}
#drafts .thh { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 14px 0 10px; background: rgb(17, 25, 29); border-bottom: 1px solid rgba(255,255,255,.08); }
#drafts .thh h3 { margin: 0; font-size: 14px; } #drafts .thh small { color: #8fa3a0; flex: 1; min-width: 120px; }
#drafts .thh button, #drafts .thh a.lnk { font-size: 12px !important; padding: 4px 10px !important; }
#drafts .msgs { display: flex; flex-direction: column; gap: 8px; }
#drafts .mc { border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(255,255,255,.035); scroll-margin-top: 64px; }
#drafts .mc.mine { border-color: rgba(45,212,191,.28); background: rgba(45,212,191,.05); }
#drafts .mc .mh { display: flex; gap: 10px; align-items: center; padding: 9px 12px; cursor: pointer; border-radius: 12px; }
#drafts .mc .mh:hover { background: rgba(255,255,255,.04); }
#drafts .mc .av { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; color: #06231f; flex: none; }
#drafts .mc .who { min-width: 0; flex: 1; } #drafts .mc .who b { font-weight: 600; } #drafts .mc.mine .who b { color: #5eead4; }
#drafts .mc .who span { display: block; color: #8fa3a0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#drafts .mc.on .who span.snip { display: none; } #drafts .mc:not(.on) .who span.to { display: none; }
#drafts .mc time { color: #8fa3a0; font-size: 11.5px; white-space: nowrap; } #drafts .mc .clip { color: #8fa3a0; font-size: 11.5px; white-space: nowrap; }
#drafts .mc .mb { display: none; padding: 2px 14px 14px 50px; } #drafts .mc.on .mb { display: block; }
#drafts .mc .tx { line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; color: #dbe5e3; font-size: 13.5px; }
#drafts .mc details.legal { margin-top: 8px; color: #8fa3a0; font-size: 12px; } #drafts .mc details.legal summary { cursor: pointer; } #drafts .mc details.legal div { white-space: pre-wrap; margin-top: 6px; line-height: 1.45; }
#drafts .files { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
#drafts .files .fi { display: flex; flex-direction: column; width: 150px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.25); color: #e8f0ee; text-decoration: none; cursor: pointer; }
#drafts .files .fi .pv { height: 100px; display: grid; place-items: center; background: rgba(255,255,255,.04); overflow: hidden; font-size: 26px; }
#drafts .files .fi .pv img { width: 100%; height: 100%; object-fit: cover; }
#drafts .files .fi .nm { padding: 5px 8px 6px; font-size: 11.5px; line-height: 1.3; } #drafts .files .fi .nm b { display: block; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } #drafts .files .fi .nm span { color: #8fa3a0; }
#drafts .files .fi:hover { border-color: #2dd4bf; }
#drafts .files .more { align-self: center; color: #8fa3a0; font-size: 12px; }
#drafts details.quoted { margin-top: 10px; border-left: 3px solid rgba(255,255,255,.18); padding-left: 10px; } #drafts details.quoted summary { cursor: pointer; color: #8fa3a0; font-size: 12.5px; } #drafts details.quoted .tx { color: #b8c7c4; margin-top: 6px; }
#dr-files h4 { margin: 0; }
#dr-files .note, #dr-thread .note { color: #8fa3a0; padding: 8px 0; }
#dr-inline-thread { border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 0 12px 12px; max-height: 50vh; overflow: auto; flex: none; }
#dr-lb { position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px; background: rgba(0,0,0,.85); padding: 20px; }
#dr-lb.show { display: flex; } #dr-lb img { max-width: 100%; max-height: calc(100vh - 110px); border-radius: 8px; background: #fff; }
#dr-lb .bar { display: flex; gap: 10px; align-items: center; color: #e8f0ee; } #dr-lb .bar a, #dr-lb .bar button { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 9px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.1); color: #fff; text-decoration: none; cursor: pointer; }
@media (max-width: 760px) { #drafts { width: 100vw; height: 100dvh; border-radius: 0; grid-template-columns: 1fr; grid-template-rows: auto 150px 1fr; } #dr-list { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.1); } #drafts .mc .mb { padding-left: 14px; } #drafts .mc { scroll-margin-top: 110px; } #drafts .files .fi { width: calc(50% - 4px); } }
`;
document.head.appendChild(style);

const btn = document.createElement('button'); btn.id = 'btn-drafts'; btn.title = 'Messages the team has drafted for you to send (D)'; btn.textContent = 'Drafts';
const tools = document.querySelector('.tools'); if (tools && !EMBED) tools.insertBefore(btn, document.querySelector('#btn-more'));
const veil = document.createElement('div'); veil.id = 'drafts-veil';
veil.innerHTML = `<section id="drafts" role="dialog" aria-label="Drafts"><header><h2>Drafts</h2><small id="dr-sub"></small><button class="x" id="dr-close" title="Close (Esc)">✕</button></header><div id="dr-list"></div><div id="dr-detail"></div></section>
  <div id="dr-lb" role="dialog" aria-label="Picture"><img alt=""><div class="bar"><span></span><a target="_blank" rel="noopener">Open in a new tab</a><button type="button">Close (Esc)</button></div></div>`;
document.body.appendChild(veil);
const $ = (s) => veil.querySelector(s);

let signature = null, drafts = [], people = {}, cur = null, filter = 'all', sig = '', dirty = false, flash = '';
const who = (slug) => people[slug] || { name: slug, color: '#8fa3a0' };
const firstName = (slug) => who(slug).name.split(' ')[0];

function renderList() {
  const n = drafts.length;
  btn.innerHTML = `Drafts${n ? `<b>${n}</b>` : ''}`;
  $('#dr-sub').textContent = n ? `${n} waiting for you · nothing goes out until you press the button` : 'Nothing waiting';
  const chans = [...new Set(drafts.map((x) => x.channel))];
  const list = drafts.filter((x) => filter === 'all' || x.channel === filter);
  $('#dr-list').innerHTML = (chans.length > 1 ? `<div class="f"><button data-f="all" class="${filter === 'all' ? 'on' : ''}">All ${n}</button>${chans.map((c) => `<button data-f="${c}" class="${filter === c ? 'on' : ''}">${APP[c] || c} ${drafts.filter((x) => x.channel === c).length}</button>`).join('')}</div>` : '')
    + (list.length ? list.map((x) => {
      const q = (x.talk || []).some((t) => t.who !== '__OWNER_ID__') && (x.talk || []).at(-1).who !== '__OWNER_ID__';
      return `<div class="dr ${cur === x.id ? 'on' : ''}" data-id="${x.id}">
        <div class="l1"><i class="chn ${esc(x.channel)}">${esc(x.channel === 'calendar' ? (x.kind === 'rsvp' ? 'Invitation' : 'Event') : APP[x.channel] || x.channel)}</i><b>${esc(x.channel === 'calendar' ? (x.kind === 'rsvp' ? `from ${x.organizer || 'the organiser'}` : x.guests.length ? `${x.guests.length} ${x.guests.length === 1 ? 'guest' : 'guests'}: ${x.guests.map((g) => g.split('@')[0]).join(', ')}` : 'No guests') : x.to)}</b><time>${ago(x.created)}</time></div>
        <div class="l2">${esc(x.channel === 'calendar' ? `${x.kind === 'rsvp' ? `${RESP[x.response] || 'Answer'}: ` : ''}${x.title} · ${whenTxt(x, true)}` : x.subject || x.body.split('\n').find((l) => l.trim()) || '')}</div>
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
// The mail this draft answers, read live from Gmail when the draft is picked: one card per message, oldest first, the
// last one open. Legal notices fold away; a file already sent earlier in the thread (a logo quoted again) shows once.
const threads = new Map(); let view = 'reply'; const msgOpen = new Set();
const short = (addr) => (String(addr || '').split('<')[0].replace(/"/g, '').trim() || String(addr || '').replace(/[<>]/g, '')).split(',')[0];
const mailOf = (addr) => (/<([^>]+)>/.exec(String(addr || '')) || [0, String(addr || '')])[1];
const when = (iso) => { const t = new Date(iso); return isNaN(t) ? '' : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
const size = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n || 0} B`);
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 60% 70%)`; };
const fileUrl = (msg, f, dl) => `/api/drafts/file?msg=${encodeURIComponent(msg)}&part=${encodeURIComponent(f.part)}&mime=${encodeURIComponent(f.mime)}&name=${encodeURIComponent(f.name)}&token=${encodeURIComponent(TOKEN)}${dl ? '&download=1' : ''}`;
const ICON = (m) => (/pdf/.test(m) ? '📄' : /sheet|excel|csv/.test(m) ? '📊' : /presentation|powerpoint/.test(m) ? '📽️' : /word|document/.test(m) ? '📝' : /zip|compressed/.test(m) ? '🗜️' : /video/.test(m) ? '🎞️' : /audio/.test(m) ? '🎧' : '📎');
function filesHtml(msg, files) {
  return `<div class="files">${files.map((f) => {
    const img = /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(f.mime), opens = img || /pdf|^text\/plain|^video|^audio/.test(f.mime);
    return `<a class="fi" href="${fileUrl(msg, f, !opens)}" ${img ? `data-img="${esc(fileUrl(msg, f))}" data-name="${esc(f.name)}"` : 'target="_blank" rel="noopener"'} title="${esc(f.name)}${opens ? '' : ' (downloads)'}">
      <div class="pv">${img ? `<img loading="lazy" alt="" src="${fileUrl(msg, f)}">` : ICON(f.mime)}</div><div class="nm"><b>${esc(f.name)}</b><span>${size(f.size)}</span></div></a>`;
  }).join('')}</div>`;
}
const LEGAL = /confidencial|confidential|destinatari|intended recipient|privileged|protecci[oó]n de datos|data protection|RGPD|GDPR|LOPD|prohibida|prohibited|aviso legal|legal notice|disclaimer|this (e-?mail|message) (and any|is)|este (mensaje|correo)|aquest missatge|el seu contingut/i;
function textHtml(t) {
  const clean = String(t || '').replace(/\[cid:[^\]\n]+\]/g, '').replace(/<(?:https?:|mailto:|tel:|\+)[^>\s]+>/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'); // Outlook's picture slots and link tails
  const ps = clean.split(/\n\s*\n/), keep = [], legal = [];
  ps.forEach((p, i) => ((i > 0 && p.length > 140 && LEGAL.test(p)) ? legal : keep).push(p));
  return `<div class="tx">${esc(keep.join('\n\n').trim()) || '<i>(no text)</i>'}</div>${legal.length ? `<details class="legal"><summary>Legal notice (${legal.length})</summary><div>${esc(legal.join('\n\n'))}</div></details>` : ''}`;
}
function msgsHtml(ms) {
  const n = ms.length, seen = new Set();
  return `<div class="msgs">${ms.map((m, i) => {
    const all = m.attachments || [], fresh = all.filter((f) => typeof f === 'object' && !seen.has(`${f.name}|${f.size}`)), again = all.length - fresh.length;
    for (const f of all) if (typeof f === 'object') seen.add(`${f.name}|${f.size}`);
    const on = msgOpen.has(m.id) || (i === n - 1 && !msgOpen.has('-' + m.id)), name = m.mine ? 'You' : short(m.from);
    return `<div class="mc ${m.mine ? 'mine' : ''} ${on ? 'on' : ''}" data-m="${esc(m.id)}">
      <div class="mh"><i class="av" style="background:${m.mine ? '#2dd4bf' : hue(mailOf(m.from))}">${esc((name[0] || '?').toUpperCase())}</i>
        <div class="who"><b>${esc(name)}</b><span class="snip">${esc(m.text.replace(/\s+/g, ' ').slice(0, 180))}</span><span class="to">${esc(m.mine ? '' : mailOf(m.from) + ' · ')}to ${esc(m.to)}${m.cc ? ` · cc ${esc(m.cc)}` : ''}</span></div>
        ${fresh.length ? `<span class="clip">📎 ${fresh.length}</span>` : ''}<time>${esc(when(m.date))}</time></div>
      <div class="mb">${textHtml(m.text)}${m.quoted ? `<details class="quoted"><summary>Earlier mail quoted here (not in this thread in your inbox)</summary>${textHtml(m.quoted)}</details>` : ''}${fresh.length ? filesHtml(m.id, fresh) : ''}${again ? `<div class="files"><span class="more">${again} ${again === 1 ? 'file' : 'files'} already sent earlier in the thread</span></div>` : ''}</div></div>`;
  }).join('')}</div>`;
}
function threadHtml(x) {
  const t = threads.get(x.id), link = x.link ? `<a class="lnk" href="${esc(x.link)}" target="_blank" rel="noopener" title="Opens this thread in Gmail">Open in Gmail ↗</a>` : '';
  let body, n = 0, people = 0;
  if (!t || t.state === 'loading') body = '<div class="note">Loading the thread from Gmail…</div>';
  else if (t.state === 'err') body = `<div class="note">The thread could not be read: ${esc(t.error)} <button id="dr-th-retry">Try again</button></div>`;
  else if (!(n = t.messages.length)) body = '<div class="note">Nothing earlier in this thread: this message starts it.</div>';
  else { people = new Set(t.messages.map((m) => mailOf(m.from).toLowerCase())).size; body = msgsHtml(t.messages); }
  return `<div class="thh"><h3>Thread</h3><small>${n ? `${n} ${n === 1 ? 'message' : 'messages'} · ${people} ${people === 1 ? 'person' : 'people'}` : ''}</small>${n > 1 ? '<button id="dr-th-all">Open all</button><button id="dr-th-none">Close all</button>' : ''}${link}</div>${body}`;
}
function paintThread(toEnd) {
  const x = drafts.find((d) => d.id === cur), el = $('#dr-thread'); if (!x || !el) return;
  el.innerHTML = threadHtml(x);
  const t = threads.get(x.id), sb = $('#dr-v-thread'); if (sb) sb.textContent = `Thread${t && t.messages && t.messages.length ? ` · ${t.messages.length}` : ''}`;
  if (toEnd) { const last = el.querySelector('.mc:last-child'); if (last) last.scrollIntoView({ block: 'start' }); }
}
// What the Gmail draft carries attached (read from Gmail, so it is what will really go out).
const dfiles = new Map();
function draftFilesHtml(x) {
  const t = dfiles.get(x.id);
  if (!t || t.state === 'loading') return '<div class="note">Checking the attachments…</div>';
  if (t.state === 'err') return `<div class="note">The attachments could not be read: ${esc(t.error)}</div>`;
  if (!t.files.length) return '';
  return `<h4>Attached · ${t.files.length}</h4>${filesHtml(t.messageId, t.files)}`;
}
async function loadFiles(x, again) {
  if (x.channel !== 'gmail' || !x.draftId || (dfiles.has(x.id) && !again)) return;
  dfiles.set(x.id, { state: 'loading' });
  try { const d = await api(`/api/drafts/files?id=${x.id}${again ? '&fresh=1' : ''}`); dfiles.set(x.id, { state: 'ok', files: d.files || [], messageId: d.messageId }); }
  catch (e) { dfiles.set(x.id, { state: 'err', error: e.message }); }
  const el = $('#dr-files'); if (cur === x.id && el) el.innerHTML = draftFilesHtml(x);
}
async function loadThread(x, again) {
  if (threads.has(x.id) && !again) return;
  threads.set(x.id, { state: 'loading' });
  try { const d = await api(`/api/drafts/thread?id=${x.id}`); threads.set(x.id, { state: 'ok', messages: d.messages || [] }); }
  catch (e) { threads.set(x.id, { state: 'err', error: e.message }); }
  if (cur === x.id) paintThread(true);
}
// ---- calendar drafts: an event to create (Google emails the guests) or an answer to an invitation. Nothing happens until he presses the button.
const RESP = { accepted: 'Accept', tentative: 'Maybe', declined: 'Decline' }, SAID = { accepted: 'accepted', tentative: 'maybe', declined: 'declined', needsAction: 'not answered' };
const pad = (n) => String(n).padStart(2, '0');
const dOf = (v) => new Date(v.length === 10 ? v + 'T00:00' : v);
const dayTxt = (v) => dOf(v).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const hm = (v) => v.slice(11, 16);
function whenTxt(x, brief) {
  if (!x.start) return '';
  if (x.start.length === 10) return x.end && x.end !== x.start ? `${dayTxt(x.start)} to ${dayTxt(x.end)}, all day` : `${dayTxt(x.start)}, all day`;
  const mins = Math.round((dOf(x.end) - dOf(x.start)) / 60000), dur = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
  const tz = x.tz && x.tz !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · ${x.tz} time` : '';
  const same = x.start.slice(0, 10) === x.end.slice(0, 10);
  return brief ? `${dayTxt(x.start)} ${hm(x.start)}` : `${dayTxt(x.start)} · ${hm(x.start)} to ${same ? hm(x.end) : `${dayTxt(x.end)} ${hm(x.end)}`} · ${dur}${tz}`;
}
const live = new Map(); // draft id -> what the calendar says now, read when the draft is picked
const liveKey = (x) => `${x.start}|${x.end}`;
function liveHtml(x) {
  const t = live.get(x.id);
  if (!t || t.state === 'loading') return '<div class="note">Checking your calendar…</div>';
  if (t.state === 'err') return `<div class="note">Your calendar could not be read: ${esc(t.error)} <button id="dr-ev-retry">Try again</button></div>`;
  if (t.event && !t.event.exists) return '<div class="clash"><b>This invitation is no longer in your calendar: it was cancelled or deleted.</b></div>';
  const c = t.conflicts || [];
  let h = c.length ? `<div class="clash"><b>${x.kind === 'rsvp' ? 'Also in your calendar at that time' : 'You already have something at that time'}</b>${c.map((e) => `<div><time>${e.allDay ? 'all day' : `${hm(e.start)} to ${hm(e.end)}`}</time><span>${esc(e.title)}${e.myResponse === 'needsAction' ? ' <em>(not answered)</em>' : e.myResponse === 'tentative' ? ' <em>(maybe)</em>' : ''}</span></div>`).join('')}</div>`
    : '<div class="free">Nothing else in your calendar at that time.</div>';
  if (t.event && t.event.myResponse && t.event.myResponse !== 'needsAction') h += `<div class="note">You already answered this one: ${esc(SAID[t.event.myResponse] || t.event.myResponse)}.</div>`;
  return h;
}
function guestsHtml(x) {
  const t = live.get(x.id), att = t && t.event && t.event.exists ? t.event.attendees.filter((g) => !g.self) : null;
  if (att) return att.length ? att.map((g) => `<i class="${esc(g.response)}" title="${esc(g.email)}${g.response && g.response !== 'needsAction' ? `: ${esc(SAID[g.response] || g.response)}` : ''}">${esc(g.name || g.email)}</i>`).join('') : 'Only you';
  return x.guests.length ? x.guests.map((g) => `<i>${esc(g)}</i>`).join('') : '';
}
function paintLive() {
  const x = drafts.find((d) => d.id === cur); if (!x || x.channel !== 'calendar') return;
  const el = $('#dr-cal-live'); if (el) el.innerHTML = liveHtml(x);
  const g = $('#dr-guests'); if (g && x.kind === 'rsvp') g.innerHTML = guestsHtml(x);
}
async function loadLive(x, again) {
  const k = liveKey(x), t = live.get(x.id);
  if (t && t.k === k && !again) return;
  live.set(x.id, { state: 'loading', k });
  try { const d = await api(`/api/drafts/event?id=${x.id}${again ? '&fresh=1' : ''}`); live.set(x.id, { state: 'ok', k, conflicts: d.conflicts || [], event: d.event || null }); }
  catch (e) { live.set(x.id, { state: 'err', k, error: e.message }); }
  if (cur === x.id) paintLive();
}
function eventForm(x) {
  const v = (id) => ($(id) ? $(id).value.trim() : ''), day = v('#ev-day');
  const e = { title: v('#ev-title'), guests: v('#ev-guests'), location: v('#ev-loc'), meet: $('#ev-meet').checked, description: v('#ev-desc') };
  if (x.start.length === 10) { e.start = day; e.end = v('#ev-last') || day; }
  else {
    const a = v('#ev-from'), b = v('#ev-to'); let last = day;
    if (b <= a) { const d = new Date(day + 'T12:00'); d.setDate(d.getDate() + 1); last = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; } // ends after midnight
    e.start = `${day}T${a}`; e.end = `${last}T${b}`;
  }
  return e;
}
function renderEvent(x, box) {
  const author = firstName(x.from), rsvp = x.kind === 'rsvp', n = x.guests.length, whole = x.start.length === 10;
  const where = [x.location, rsvp ? (x.meet ? 'Google Meet' : '') : (x.meet ? 'a Google Meet link is added when it is created' : '')].filter(Boolean).join(' · ');
  const view = `
    <div class="meta"><span>${rsvp ? 'Invitation' : 'Event'}</span><div class="evt">${esc(x.title)}</div>
      <span>When</span><div class="evw">${esc(whenTxt(x))}</div>
      ${where ? `<span>Where</span><div>${esc(where)}</div>` : ''}
      ${rsvp ? `<span>Organiser</span><div>${esc(x.organizer || '')}</div>` : ''}
      <span>Guests</span><div class="guests" id="dr-guests">${guestsHtml(x) || 'Nobody. It only goes into your calendar and no email is sent.'}</div>
      <span>From</span><div>${esc(who(x.from).name)} · ${ago(x.created)}${x.client ? ` · client ${esc(x.client)}` : ''}${x.edited ? ' · edited by you' : ''}</div>
      ${x.why ? `<span>Why</span><div class="why">${esc(x.why)}</div>` : ''}</div>
    <div id="dr-cal-live">${liveHtml(x)}</div>
    ${x.thread ? `<div id="dr-inline-thread"><div id="dr-thread">${threadHtml(x)}</div></div>` : ''}
    ${!rsvp && x.body ? `<div class="desc">${esc(x.body)}</div>` : ''}`;
  const form = `<div class="evform">
      <label>Title<input id="ev-title" value="${esc(x.title)}"></label>
      <div class="row"><label>${whole ? 'First day' : 'Day'}<input type="date" id="ev-day" value="${esc(x.start.slice(0, 10))}"></label>
        ${whole ? `<label>Last day<input type="date" id="ev-last" value="${esc(x.end.slice(0, 10))}"></label>` : `<label>From<input type="time" id="ev-from" value="${esc(hm(x.start))}"></label><label>To<input type="time" id="ev-to" value="${esc(hm(x.end))}"></label>`}</div>
      <label>Guests: their email addresses, separated by commas. Leave empty to invite nobody.<textarea id="ev-guests" rows="3" spellcheck="false">${esc(x.guests.join(', '))}</textarea></label>
      <label>Where<input id="ev-loc" value="${esc(x.location || '')}" placeholder="Room, address or link"></label>
      <label class="chk"><input type="checkbox" id="ev-meet" ${x.meet ? 'checked' : ''}> Add a Google Meet link</label>
      <label>Description the guests will read<textarea id="ev-desc" rows="4">${esc(x.body || '')}</textarea></label></div>`;
  const edit = editing && !rsvp;
  box.innerHTML = `${edit ? form : view}
    ${flash ? `<div class="ok">${esc(flash)}</div>` : ''}
    <div class="acts">
      ${rsvp ? Object.keys(RESP).map((r) => `<button class="${r === x.response ? 'pri' : ''}" data-resp="${r}" title="${r === x.response ? `${esc(author)} proposes this answer. ` : ''}The organiser is told by Google.">${RESP[r]}</button>`).join('')
        : `<button class="pri" id="dr-send" ${edit ? 'hidden' : ''} title="${n ? `Creates the event in your calendar and Google emails the invitation to ${n === 1 ? 'the guest' : `the ${n} guests`} from your account` : 'Creates the event in your calendar. No email is sent.'}">${n ? `Create and invite ${n}` : 'Create event'}</button>
           <button id="dr-edit">${edit ? 'Back' : 'Edit'}</button><button id="dr-save" disabled ${edit ? '' : 'hidden'}>Save changes</button>`}
      ${x.link ? `<a class="lnk" href="${esc(x.link)}" target="_blank" rel="noopener" title="${rsvp ? 'Opens the invitation in Google Calendar' : 'Opens a new event in Google Calendar filled in with this. You save it there.'}">Open in Calendar</a>` : ''}
      <span class="sp"></span>
      <button id="dr-sent" title="You already did it yourself. Removes it from this list and tells ${esc(author)}.">Already done</button>
      <button id="dr-discard" title="You will not do it. Removes it from this list and tells ${esc(author)}.">Discard</button>
    </div>
    <div class="hint">${edit ? 'Save your changes first; then you can create it.' : rsvp ? `Nothing is answered until you press a button. ${esc(author)} proposes: ${esc((RESP[x.response] || '').toLowerCase())}.` : n ? `Nothing is created or sent until you press the button. Then Google emails the invitation to ${n === 1 ? 'the guest' : `the ${n} guests`} from your account.` : 'Nothing is created until you press the button. Nobody is invited, so no email goes out.'}</div>
    <h4>Ask ${esc(author)} about this</h4>
    ${(x.talk || []).length ? `<div class="talk">${x.talk.map((t) => `<div class="${t.who === '__OWNER_ID__' ? 'me' : ''}"><b>${t.who === '__OWNER_ID__' ? 'You' : esc(firstName(t.who))}</b>${esc(t.text)}</div>`).join('')}</div>` : ''}
    <div class="acts"><input id="dr-q" placeholder="Is this the right time? Who is missing from the guests?" aria-label="Question about this draft"><button id="dr-ask">Ask</button></div>`;
  dirty = false; flash = '';
  loadLive(x); if (x.thread) loadThread(x);
}
let editing = false;
function renderDetail() {
  const x = drafts.find((d) => d.id === cur), box = $('#dr-detail');
  box.className = '';
  if (!x) { box.innerHTML = `<div class="empty">${drafts.length ? 'Pick a draft on the left.' : ''}</div>`; return; }
  if (x.channel === 'calendar') return renderEvent(x, box);
  const app = APP[x.channel] || x.channel, author = firstName(x.from);
  const stale = !x.synced, canSend = x.channel === 'gmail' && Boolean(x.draftId);
  const openHint = x.channel === 'whatsapp' ? (x.phone ? 'Opens the chat with this text already typed. You press send there.' : `Opens WhatsApp. Find the chat${x.chat ? ` “${esc(x.chat)}”` : ''}; ${author} may have typed the text there already, or use Copy text.`)
    : x.thread ? 'Opens the thread in Gmail with the draft at the bottom. You press send there.' : 'Opens your Gmail drafts. You press send there.';
  const split = x.channel === 'gmail' && x.thread;
  const reply = `
    <div class="meta"><span>To</span><div>${esc(x.to)}</div>${x.cc ? `<span>Cc</span><div>${esc(x.cc)}</div>` : ''}
      <span>From</span><div>${esc(who(x.from).name)} · ${ago(x.created)}${x.client ? ` · client ${esc(x.client)}` : ''}</div>
      ${x.why ? `<span>Why</span><div class="why">${esc(x.why)}</div>` : ''}
      ${x.channel === 'gmail' && !editing ? `<span>Subject</span><div>${esc(x.subject)}</div>` : ''}</div>
    ${x.channel === 'gmail' ? `<input id="dr-subject" value="${esc(x.subject)}" placeholder="Subject" aria-label="Subject" ${editing ? '' : 'hidden'}>` : ''}
    <div id="dr-preview" ${editing ? 'hidden' : ''}>${preview(x.body)}</div>
    <textarea id="dr-body" aria-label="Message text" spellcheck="true" ${editing ? '' : 'hidden'}>${esc(x.body)}</textarea>
    ${x.channel === 'gmail' && x.draftId ? `<div id="dr-files">${draftFilesHtml(x)}</div>` : ''}
    ${stale ? `<div class="warn">${x.syncError ? `Gmail was not updated: ${esc(x.syncError)}` : `${app} still has the earlier text. Copy text gives you your version now.`}</div>` : ''}
    ${flash ? `<div class="ok">${esc(flash)}</div>` : ''}
    <div class="acts">
      ${canSend ? `<button class="pri" id="dr-send" title="Sends this email now from your Gmail, exactly as shown, with its attachments">Send</button>` : ''}
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
  const t = threads.get(x.id), n = t && t.messages ? t.messages.length : 0;
  box.className = split ? `split v-${view}` : '';
  box.innerHTML = split
    ? `<div class="seg"><button id="dr-v-reply" class="${view === 'reply' ? 'on' : ''}">Your reply</button><button id="dr-v-thread" class="${view === 'thread' ? 'on' : ''}">Thread${n ? ` · ${n}` : ''}</button></div>
       <div class="pane rp">${reply}</div><div class="pane th" id="dr-thread">${threadHtml(x)}</div>`
    : reply;
  dirty = false; flash = '';
  if (split) { loadThread(x); const last = box.querySelector('#dr-thread .mc:last-child'); if (last) last.scrollIntoView({ block: 'start' }); }
  loadFiles(x);
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
    if (!dirty && !(veil.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))) renderDetail();
  } catch { /* server restarting */ }
}
function open(on) {
  const show = on ?? !veil.classList.contains('show');
  veil.classList.toggle('show', show); btn.classList.toggle('on', show);
  if (show) { if (cur === null && drafts.length) cur = drafts[0].id; render(); }
}
btn.onclick = () => open();
veil.addEventListener('mousedown', (e) => { if (e.target === veil) open(false); });
veil.addEventListener('input', (e) => { if (e.target.id === 'dr-body' || e.target.id === 'dr-subject' || e.target.closest('.evform')) { dirty = true; const s = $('#dr-save'); if (s) s.disabled = false; } });
veil.addEventListener('click', async (e) => {
  if (e.target.closest('#dr-close')) return open(false);
  const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; return renderList(); }
  const row = e.target.closest('.dr'); if (row) { cur = Number(row.dataset.id); editing = false; view = 'reply'; msgOpen.clear(); return render(); }
  const img = e.target.closest('[data-img]'); if (img) { e.preventDefault(); const lb = $('#dr-lb'); lb.querySelector('img').src = img.dataset.img; lb.querySelector('a').href = img.dataset.img; lb.querySelector('span').textContent = img.dataset.name; lb.classList.add('show'); return; }
  if (e.target.closest('#dr-lb')) { if (!e.target.closest('a')) $('#dr-lb').classList.remove('show'); return; }
  if (e.target.closest('.fi')) return; // a file: the link opens or downloads it
  if (e.target.closest('#dr-v-reply, #dr-v-thread')) { view = e.target.closest('#dr-v-thread') ? 'thread' : 'reply'; const box = $('#dr-detail'); box.classList.toggle('v-reply', view === 'reply'); box.classList.toggle('v-thread', view === 'thread'); box.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x.id === `dr-v-${view}`)); if (view === 'thread') { const last = box.querySelector('#dr-thread .mc:last-child'); if (last) last.scrollIntoView({ block: 'start' }); } return; }
  if (e.target.closest('#dr-th-all, #dr-th-none')) { const on = !!e.target.closest('#dr-th-all'); $('#dr-detail').querySelectorAll('#dr-thread .mc').forEach((m) => { m.classList.toggle('on', on); msgOpen.delete(on ? '-' + m.dataset.m : m.dataset.m); msgOpen.add(on ? m.dataset.m : '-' + m.dataset.m); }); return; }
  if (e.target.closest('#dr-th-retry')) { const y = drafts.find((d) => d.id === cur); if (y) { loadThread(y, true); paintThread(); } return; }
  if (e.target.closest('#dr-ev-retry')) { const y = drafts.find((d) => d.id === cur); if (y) { loadLive(y, true); paintLive(); } return; }
  if (e.target.closest('details.legal')) return;
  const mh = e.target.closest('#dr-thread .mh'); if (mh) { const m = mh.parentElement, id = m.dataset.m, on = !m.classList.contains('on'); m.classList.toggle('on', on); msgOpen.delete(on ? '-' + id : id); msgOpen.add(on ? id : '-' + id); return; }
  const b = e.target.closest('button, a.pri, a#dr-open'); if (!b || cur === null || b.closest('.thh')) return;
  const x = drafts.find((d) => d.id === cur); if (!x) return;
  const body = $('#dr-body') ? $('#dr-body').value : '', subject = $('#dr-subject') ? $('#dr-subject').value : undefined;
  try {
    if (x.channel === 'calendar' && (b.id === 'dr-send' || b.id === 'dr-save' || b.dataset.resp)) {
      const n = x.guests.length, r = b.dataset.resp;
      if (b.id === 'dr-save') { await api('/api/drafts/edit', { id: cur, event: eventForm(x) }); flash = 'Saved.'; dirty = false; editing = false; await poll(true); return renderDetail(); }
      if (b.dataset.sure !== '1') {
        const was = b.textContent; b.dataset.sure = '1';
        b.textContent = r ? `Yes, ${RESP[r].toLowerCase()}` : n ? `Yes, create it and email ${n} ${n === 1 ? 'guest' : 'guests'}` : 'Yes, create it';
        setTimeout(() => { if (b.isConnected && b.dataset.sure === '1') { b.dataset.sure = ''; b.textContent = was; } }, 5000); return;
      }
      b.disabled = true; b.textContent = r ? 'Answering…' : 'Creating…';
      if (r && r !== x.response) await api('/api/drafts/edit', { id: cur, event: { response: r } });
      await api('/api/drafts/send', { id: cur }); cur = null; dirty = false; editing = false; await poll(true); if (drafts.length) cur = drafts[0].id;
      flash = `“${x.title}”: ` + (r ? `you answered ${RESP[r].toLowerCase()} and the organiser has been told.` : n ? `created, and the ${n === 1 ? 'invitation is' : `${n} invitations are`} out.` : 'created. It is in your calendar.'); return render();
    }
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
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = b.id === 'dr-sent' ? (x.channel === 'calendar' ? 'Yes, I did it myself' : 'Yes, I sent it') : 'Yes, discard it'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = b.id === 'dr-sent' ? (x.channel === 'calendar' ? 'Already done' : 'Mark as sent') : 'Discard'; } }, 4000); return; }
      await api('/api/drafts/status', { id: cur, status: b.id === 'dr-sent' ? 'sent' : 'discarded' }); cur = null; dirty = false; await poll(true); if (drafts.length) cur = drafts[0].id; render();
    } else if (b.id === 'dr-ask') { const q = $('#dr-q').value.trim(); if (!q) return; await api('/api/drafts/ask', { id: cur, text: q }); document.activeElement.blur(); await poll(true); renderDetail(); }
  } catch (err) { flash = ''; b.textContent = err.message; b.disabled = false; b.dataset.sure = ''; }
});
veil.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if ($('#dr-lb').classList.contains('show')) $('#dr-lb').classList.remove('show'); else if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.target.blur(); else open(false); }
  else if (e.key === 'Enter' && e.target.id === 'dr-q') { e.preventDefault(); $('#dr-ask').click(); }
  e.stopPropagation();
});
addEventListener('keydown', (e) => {
  if (EMBED || e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) return;
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); open(); }
  else if (e.key === 'Escape' && veil.classList.contains('show')) { e.stopImmediatePropagation(); if ($('#dr-lb').classList.contains('show')) $('#dr-lb').classList.remove('show'); else open(false); }
}, true);
window.__openDraft = (id) => { if (drafts.some((x) => x.id === id)) { cur = id; editing = false; view = 'reply'; msgOpen.clear(); } open(true); }; // the For you panel opens a draft straight here
if (location.hash === '#drafts') open(true);
poll(); setInterval(poll, 4000);
