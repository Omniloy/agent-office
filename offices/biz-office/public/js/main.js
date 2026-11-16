// Page logic: live state from the local server, roster, detail panel, messaging.
import { createWorld } from './world.js';

const TOKEN = window.__TOKEN__;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { working: 'Working', idle: 'Idle', blocked: 'Needs you', offline: 'Offline', talking: 'Talking' };
const COLOR = { working: 'var(--working)', idle: 'var(--idle)', blocked: 'var(--needs)', offline: 'var(--offline)', talking: 'var(--talking)' };
const first = (a) => a.name.split(' ')[0];
const initials = (a) => a.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const since = (ms) => {
  if (!ms) return '';
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m` : m < 2880 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d`;
};
const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
// Small, safe subset of Markdown: everything is escaped first.
// Links are pulled out first and put back at the end, so later rules cannot break them.
// Turns into links: [text](url), bare URLs, and Jira keys of the team's projects (SOC-472).
const refOf = (u) => { // a GitHub or Jira address reads as what it is: "PR #412 · repo", "SOC-472"
  let m = /^https?:\/\/github\.com\/[^/\s]+\/([^/\s]+)\/(pull|issues|commit|actions\/runs)\/([0-9a-f]+)/i.exec(u);
  if (m) return m[2] === 'pull' ? `PR #${m[3]} · ${m[1]}` : m[2] === 'issues' ? `Issue #${m[3]} · ${m[1]}` : m[2] === 'commit' ? `Commit ${m[3].slice(0, 7)} · ${m[1]}` : `Run ${m[3]} · ${m[1]}`;
  m = /^https?:\/\/[^/\s]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(u);
  return m ? m[1] : '';
};
// A page on the artifacts server (port 4340) is written by agents as a 127.0.0.1 address: from the phone it must go
// through the same door as this page, and it reads as a button with the page's name, not as a raw address.
const ART_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost):4340(\/[^\s<)]*)?$/;
const artHref = (p) => (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? 'http://127.0.0.1:4340' : `https://${location.hostname}:4340`) + (p || '/');
const artName = (p) => { const seg = String(p || '').split(/[?#]/)[0].split('/').filter(Boolean); const t = (seg[1] || seg[0] || '').replace(/[-_]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : 'Open page'; };
if (!document.getElementById('art-link-css')) { const st = document.createElement('style'); st.id = 'art-link-css'; st.textContent = 'a.artl { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 7px; margin: 2px 0; border-radius: 9px; background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.18); color: inherit; text-decoration: none; font-weight: 600; } a.artl svg { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; stroke-linecap: round; }'; document.head.append(st); }
const ART_ICON = '<svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/></svg>';
function rich(s) {
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  const link = (url, label, cls = '') => {
    const a = ART_URL.exec(url.replace(/&amp;/g, '&'));
    if (a) return hold(`<a class="artl" href="${esc(artHref(a[1]))}" target="_blank" rel="noopener">${ART_ICON}${label && !/^https?:|…$/.test(label) && !/:4340/.test(label) ? label : esc(artName(a[1]))}</a>`);
    return hold(`<a${cls} href="${url}" target="_blank" rel="noopener">${label}</a>`);
  };
  const short = (u) => { const t = u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''); return t.length > 46 ? `${t.slice(0, 44)}…` : t; };
  let h = esc(s)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => link(url, text))
    .replace(/https?:\/\/[^\s<)\]]*[^\s<)\].,;:!?]/g, (url) => (refOf(url) ? link(url, refOf(url), ' class="key"') : link(url, short(url))));
  const keys = state && state.projects ? state.projects.map((p) => p.key).filter(Boolean) : [];
  if (keys.length && state.jira && state.jira.site) {
    h = h.replace(new RegExp(`\\b(?:${keys.join('|')})-\\d+\\b`, 'g'), (k) => link(`${state.jira.site}/browse/${k}`, k, ' class="key"'));
  }
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return h.replace(/\u0000(\d+)\u0000/g, (_m, i) => held[i]);
}
const mdText = (s) => rich(s)
  .replace(/^#{1,3}\s*(.+)$/gm, '<b>$1</b>')
  .replace(/^\s*[-*]\s+/gm, '• ')
  .replace(/\n/g, '<br>');
if (!document.getElementById('md-table-css')) { const st = document.createElement('style'); st.id = 'md-table-css'; st.textContent = '.mdtw { overflow-x: auto; margin: 6px 0; white-space: normal; -webkit-overflow-scrolling: touch; } .mdtw table { border-collapse: collapse; font-size: .92em; line-height: 1.35; } .mdtw th, .mdtw td { border: 1px solid var(--line, rgba(255,255,255,.18)); padding: 4px 8px; text-align: left; vertical-align: top; max-width: 260px; overflow-wrap: normal; word-break: normal; } .mdtw th { background: rgba(255,255,255,.07); font-weight: 600; }'; document.head.append(st); }
function md(s) { // tables become real tables (a text cut short may end in half a row: it is drawn as far as it goes)
  const L = String(s == null ? '' : s).split('\n'), out = []; let buf = [];
  const isRow = (l) => /^\s*\|/.test(l || ''), isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '') && (l || '').includes('-');
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const flush = () => { if (buf.length) { out.push(mdText(buf.join('\n'))); buf = []; } };
  for (let i = 0; i < L.length; i++) {
    if (isRow(L[i]) && isSep(L[i + 1])) {
      flush();
      let h = `<div class="mdtw"><table><tr>${cells(L[i]).map((c) => `<th>${rich(c)}</th>`).join('')}</tr>`;
      for (i += 2; i < L.length && isRow(L[i]); i++) h += `<tr>${cells(L[i]).map((c) => `<td>${rich(c)}</td>`).join('')}</tr>`;
      i--; out.push(`${h}</table></div>`);
    } else buf.push(L[i]);
  }
  flush();
  return out.join('');
}

const STATE_NAME = { lead: 'Lead', pilot: 'Pilot', onboarding: 'Onboarding', active: 'Active', 'at-risk': 'At risk', paused: 'Paused', churned: 'Churned' };
const INTEG = { live: 'Live', 'in-progress': 'In progress', blocked: 'Blocked', planned: 'Planned' };
const daysSince = (c) => (c.lastContact ? Math.max(0, Math.floor((Date.now() - c.lastContact.ms) / 86400000)) : null);
const agoDays = (d) => (d === null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);
let clientFilter = 'all';
let productFilter = 'all'; // combines with the status filter above
const openClients = new Set();
let state = null, selected = null, tab = 'overview', booted = false, termTimer = null, sound = false, lightMode = 'auto';
const seenFeed = new Set();
const talking = new Map();
const openFeed = new Set(); // feed messages the reader expanded
const world = createWorld($('#scene'), $('#labels'), { onSelect: (slug) => select(slug), format: (t) => rich(t) });
const EMBED = new URLSearchParams(location.search).has('embed'); // rendered for the Herdr tab: scene only
if (EMBED) document.body.classList.add('embed');
window.office = { world, ready: false, focus: (slug) => world.focus(slug || null, true), pause: (p) => world.setPaused(!!p) };

async function api(path, body) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-office-token': TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) staleToken(); // the server restarted while this page stayed open (a phone keeps pages for days)
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function staleToken() { try { if (Date.now() - Number(sessionStorage.getItem('office.reloaded') || 0) < 30000) return; sessionStorage.setItem('office.reloaded', String(Date.now())); } catch {} location.reload(); }
const PHONE = document.documentElement.classList.contains('phone');

// ------------------------------------------------------------------ helpers
const agentBy = (key) => state && state.agents.find((a) => a.slug === key || a.herdrName === key);
let asks = { items: [], more: 0, site: '' }; // open questions and messages for the person, see "what the team needs from you"
const asksOf = (a, kind) => asks.items.filter((x) => x.from === a.herdrName && (!kind || x.kind === kind));
const eff = (a) => (asksOf(a, 'request').length ? 'blocked' : a.status); // an open question counts as "needs you"
const shown = (a) => ((talking.get(a.herdrName) || 0) > Date.now() && a.online ? 'talking' : eff(a));

function toast(html, kind = '', ms = 4500) {
  const el = document.createElement('div');
  el.className = `toast glass ${kind}`;
  el.innerHTML = html;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
let audio = null;
function chime(freqs) {
  if (!sound) return;
  audio = audio || new AudioContext();
  freqs.forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.13;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.4);
  });
}

// ------------------------------------------------------------------ render
function renderStats() {
  const c = { working: 0, idle: 0, blocked: 0, offline: 0 };
  state.agents.forEach((a) => c[eff(a)]++);
  const list = (state.clients && state.clients.clients) || [];
  const red = list.filter((x) => x.health === 'red').length;
  const stale = list.filter((x) => !['churned', 'paused'].includes(x.state) && (daysSince(x) === null || daysSince(x) > 14)).length;
  const stat = (k, label) => `<div class="stat"><i class="dot ${k}"></i><b>${c[k]}</b><span>${label}</span></div>`;
  $('#stats').innerHTML = stat('working', 'working') + stat('idle', 'idle')
    + (c.blocked ? `<button class="stat need" id="stat-need" title="Go to who is waiting for you${asks.more ? ` (the team lead is handling ${asks.more} more)` : ''}"><b>${c.blocked}</b><span>${c.blocked === 1 ? 'needs you' : 'need you'}</span></button>` : '') + (c.offline ? stat('offline', 'offline') : '')
    + `<div class="stat"><b>${list.length}</b><span>${list.length === 1 ? 'client' : 'clients'}</span></div>`
    + (red ? `<div class="stat"><i class="dot blocked"></i><b>${red}</b><span>red</span></div>` : '')
    + (stale ? `<div class="stat" title="Clients with no contact in more than two weeks"><b>${stale}</b><span>gone quiet</span></div>` : '');
  const HQ = (state.team && state.team.name) || 'Omniloy Business HQ';
  { const bn = document.querySelector('.brand b'); if (bn && bn.textContent !== HQ) { bn.textContent = HQ; document.querySelector('.brand .logo').textContent = HQ[0]; } }
  const base = HQ, keep = /^\(\d+ to answer\) /.exec(document.title);
  document.title = (keep ? keep[0] : '') + (c.blocked ? `(${c.blocked}) ${base}` : base);
}

function rosterLine(a) {
  const s = shown(a);
  if (s === 'offline') return 'Not running in Herdr';
  if (s === 'talking') return '<em>Talking</em> with a teammate';
  if (s === 'working') return `<em>Working</em> · ${esc(a.nowDoing || 'thinking')}`;
  if (s === 'blocked') return `<em>Needs you</em> · ${esc((asksOf(a, 'request')[0] || {}).title || a.nowDoing)}`;
  const w = a.memory && a.memory.waiting[0];
  return `<em>Idle</em> ${since(a.statusSince)}${w ? ` · waiting on ${esc(w.replace(/\*\*/g, ''))}` : ''}`;
}
function renderRoster() {
  $('#roster').classList.toggle('many', state.agents.length > 7);
  $('#roster').innerHTML = state.agents.map((a, i) => `
    <button class="card glass ${a.slug === selected ? 'sel' : ''}" data-slug="${esc(a.slug)}" style="--c:${esc(a.color)};--s:${COLOR[shown(a)]}">
      <div class="avatar">${esc(initials(a))}</div>
      <div class="who"><b>${esc(a.name)}</b><span>${esc(a.role)}</span>${prBadge(a)}</div>
      <div class="line">${rosterLine(a)}</div>
      <div class="last">${a.lastActivityMs ? `Last activity ${since(a.lastActivityMs) === 'just now' ? 'just now' : `${since(a.lastActivityMs)} ago`}` : 'No activity yet'}</div><kbd>${i + 1}</kbd>
    </button>`).join('');
}

function feedRow(f, fresh) {
  const who = (n) => (n === '__OWNER_ID__' ? 'You' : (agentBy(n) ? first(agentBy(n)) : n));
  const badge = (n) => { const a = agentBy(n); return `<i class="mini" style="--c:${a ? esc(a.color) : 'var(--accent)'}">${a ? esc(initials(a)) : 'You'}</i>`; };
  if (f.type === 'msg' || f.type === 'you') {
    return `<li class="msg ${fresh ? 'new' : ''} ${openFeed.has(f.id) ? 'open' : ''}" data-id="${esc(f.id)}" title="Click to expand">
      <div class="fhead">${badge(f.from)}<b>${esc(who(f.from))}</b><span>→</span>${badge(f.to)}<b>${esc(who(f.to))}</b><time>${hhmm(f.ts)}</time></div>
      <div class="ftext">${md(f.text)}</div></li>`;
  }
  let head = '';
  if (f.type === 'jira') head = `<b>${esc(who(f.from))}</b> ${rich(f.text)}`;
  else {
    const t = f.status === 'working' ? 'started working' : f.status === 'blocked' ? 'needs you' : f.status === 'offline' ? 'went offline'
      : f.prev === 'offline' ? 'came online' : f.prev === 'blocked' ? 'is unblocked' : 'finished, now idle';
    head = `<b>${esc(who(f.from))}</b> ${t}`;
  }
  return `<li class="${fresh ? 'new' : ''}"><span>${head}</span><time>${hhmm(f.ts)}</time></li>`;
}
function renderFeed(freshIds) {
  const items = state.feed.slice(-40).reverse();
  $('#feed-list').innerHTML = items.length ? items.map((f) => feedRow(f, freshIds.has(f.id))).join('')
    : '<div class="empty">Nothing yet. Messages between teammates and status changes show up here.</div>';
}

function overview(a) {
  const s = shown(a), m = a.memory;
  const now = s === 'offline' ? 'Not running in Herdr right now.'
    : s === 'working' ? esc(a.nowDoing || 'Thinking') : s === 'blocked' ? esc(a.nowDoing || 'Waiting for your answer')
    : s === 'talking' ? 'Talking with a teammate' : 'Idle, waiting for something to do';
  const list = (items, empty) => (items && items.length ? `<ul class="plain">${items.map((i) => `<li>${md(i)}</li>`).join('')}</ul>` : `<div class="muted">${empty}</div>`);
  const mine = ((state.clients && state.clients.clients) || []).filter((x) => x.owner && [a.herdrName, a.slug, first(a).toLowerCase(), a.name.toLowerCase()].includes(x.owner.toLowerCase()));
  return `
    <div class="sec"><h3>Right now</h3><div class="now" style="--s:${COLOR[s]}">${now}${a.online ? `<small>${LABEL[s]} for ${since(a.statusSince)} · turn ${a.turn}</small>` : ''}</div></div>
    ${a.lastSaid ? `<div class="sec"><h3>Last update</h3><div class="prose">${md(a.lastSaid)}</div></div>` : ''}
    <div class="sec"><h3>On their plate</h3>${list(m && m.plate, 'Nothing noted.')}</div>
    <div class="sec"><h3>Waiting on</h3>${list(m && m.waiting, 'Nothing noted.')}</div>
    <div class="sec"><h3>Last activity</h3><div class="muted">${a.lastActivityMs ? `${hhmm(a.lastActivityMs)} (${since(a.lastActivityMs)}${since(a.lastActivityMs) === 'just now' ? '' : ' ago'})${a.lastActivity ? ` · ${esc(a.lastActivity)}` : ''}` : 'Nothing recorded yet.'}</div></div>
    ${mine.length ? `<div class="sec"><h3>Their clients</h3><div style="display:flex;flex-direction:column;gap:6px">${mine.map((x) => `<a class="ticket" data-client="${esc(x.id)}"><b>${esc(x.name)}</b><i>${esc(STATE_NAME[x.state])}</i><span>last contact ${agoDays(daysSince(x))}${x.nextStep ? ` · next: ${esc(x.nextStep)}` : ''}</span></a>`).join('')}</div></div>` : ''}
    <div class="sec"><h3>Setup</h3><div class="kv">
      <div><span>Runs on</span><b>${esc(a.runtimeName)}</b></div>
      <div><span>Herdr tab</span><b>${esc(a.where || 'not open')}</b></div>
      <div><span>Shift started</span><b>${a.startedMs ? `${hhmm(a.startedMs)} (${since(a.startedMs)})` : 'not started'}</b></div>
    </div></div>
    ${a.description ? `<div class="sec"><h3>Role</h3><div class="muted">${esc(a.description)}</div></div>` : ''}`;
}
function activity(a) {
  if (!a.activity.length) return `<div class="muted">${a.online ? 'No activity recorded for this shift yet.' : 'Not running, so there is no activity to show.'}</div>`;
  return `<ol class="tl">${[...a.activity].reverse().map((it) => `<li><time>${hhmm(it.ts)}</time><div class="${it.kind}">${
    it.kind === 'tool' ? `→ ${esc(it.text)}` : it.kind === 'inbox' ? `<b>Received</b><br>${esc(it.text.slice(0, 700))}` : md(it.text.slice(0, 900))}</div></li>`).join('')}</ol>`;
}
function notes(a) {
  if (!a.memory) return '<div class="muted">No notes file yet.</div>';
  return `<div class="muted">Their own notes, updated ${since(a.memory.updatedMs)} ago</div><div class="prose">${md(a.memory.raw)}</div>`;
}

function renderPanel(full) {
  const a = selected && agentBy(selected);
  if (!a) return;
  const s = shown(a), panel = $('#panel');
  panel.style.setProperty('--c', a.color);
  $('#phead').innerHTML = `<div class="avatar" style="--c:${esc(a.color)};--s:${COLOR[s]}">${esc(initials(a))}</div>
    <div><h2>${esc(a.name)}</h2><p>${esc(a.role)} · <span class="pill" style="--s:${COLOR[s]}"><i class="dot ${s}"></i>${LABEL[s]}</span></p></div>
    <button class="x" id="close" title="Close (Esc)">✕</button>`;
  $('#close').onclick = () => select(null);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const body = $('#pbody');
  if (tab === 'terminal') {
    if (full || !body.querySelector('pre')) { body.innerHTML = '<pre class="term">Loading…</pre>'; pollScreen(); }
  } else {
    const top = full ? 0 : body.scrollTop;
    body.innerHTML = tab === 'activity' ? activity(a) : tab === 'notes' ? notes(a) : overview(a);
    body.scrollTop = top;
  }
  $('#msg').placeholder = a.online ? `Message ${first(a)}…${PHONE ? '' : '  (Enter to send)'}` : `${first(a)} is not running`;
  $('#msg').disabled = $('#send').disabled = !a.online;
  $('#chips').innerHTML = ['What are you working on?', 'What are you waiting on?', 'Run your sweep and give me a short status']
    .map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')
    + (a.status === 'working' ? '<button type="button" class="danger" id="stop">Interrupt</button>' : '');
}

async function pollScreen() {
  clearTimeout(termTimer);
  const a = selected && agentBy(selected);
  if (!a || tab !== 'terminal') return;
  const pre = $('#pbody pre');
  if (pre) {
    try {
      const { text } = await api(`/api/screen?name=${encodeURIComponent(a.herdrName)}&lines=150`);
      const stick = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30 || pre.textContent === 'Loading…';
      pre.textContent = text.replace(/\n{3,}/g, '\n\n').trimEnd();
      if (stick) pre.scrollTop = pre.scrollHeight;
    } catch (e) { pre.textContent = a.online ? `Could not read the screen: ${e.message}` : 'Not running in Herdr.'; }
  }
  termTimer = setTimeout(pollScreen, 2000);
}

let atPlace = false; // zoomed on a place in the room (a board), not a person

// The person panel: drag its left edge to resize; double-click the edge to go back to the default.
{
  const grip = document.createElement('div');
  grip.id = 'panel-grip'; grip.title = 'Drag to resize · double-click to reset';
  $('#panel').prepend(grip);
  const setW = (w) => { if (w) document.documentElement.style.setProperty('--panel-w', `${w}px`); else document.documentElement.style.removeProperty('--panel-w'); };
  try { const w = Number(localStorage.getItem('office.panelW')); if (w > 300) setW(Math.min(w, innerWidth - 260)); } catch {}
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId); document.body.classList.add('resizing');
    const move = (ev) => setW(Math.round(Math.max(340, Math.min(innerWidth - 260, innerWidth - 12 - ev.clientX))));
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); document.body.classList.remove('resizing');
      try { localStorage.setItem('office.panelW', String(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'), 10) || '')); } catch {}
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { setW(0); try { localStorage.removeItem('office.panelW'); } catch {} });
}

// Pull requests: what each state is called.
const PR_TEXT = { approved: 'Approved', changes: 'Changes requested', failing: 'Checks failing', review: 'Waiting for review', draft: 'Draft' };
const prBadge = (a) => {
  const l = a.prs || []; if (!l.length) return '';
  const ok = l.filter((x) => x.state === 'approved').length, bad = l.some((x) => x.state === 'changes' || x.state === 'failing');
  return `<span class="prn ${ok === l.length ? 'ok' : bad ? 'bad' : ''}" title="${l.length} open pull request${l.length === 1 ? '' : 's'}${ok ? `, ${ok} approved` : ''}">${l.length} PR${l.length === 1 ? '' : 's'}${ok ? ` · ${ok} ✓` : ''}</span>`;
};

// Which traceability matrix the whiteboard shows: the team's own by default, any other on request.
let traceChoice = ''; try { traceChoice = localStorage.getItem('office.trace') || ''; } catch {}
const traceList = () => ((state && Array.isArray(state.trace)) ? state.trace.filter((t) => t.id) : []);
const pickTrace = (list) => { if (!Array.isArray(list)) return list; const c = list.find((t) => t.id === traceChoice); return c ? [c, ...list.filter((t) => t !== c)] : list.filter((t) => t.own); };
const tracePick = document.createElement('div');
tracePick.id = 'trace-pick';
document.body.append(tracePick);
function showTracePick() {
  const list = traceList(), on = atPlace === '@trace' && list.length > 0;
  tracePick.classList.toggle('show', on);
  if (!on) return;
  const cur = pickTrace(list)[0];
  tracePick.innerHTML = `<span>Matrix</span>${list.map((t) => `<button type="button" data-id="${esc(t.id)}" class="${t === cur ? 'on' : ''}">${esc(t.project)}<small>${t.own ? 'this team' : 'other team'}</small></button>`).join('')}${cur && cur.url ? `<a href="${esc(cur.url)}" target="_blank" rel="noopener">Open the sheet</a>` : ''}`;
}
tracePick.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]'); if (!b) return;
  traceChoice = b.dataset.id; try { localStorage.setItem('office.trace', traceChoice); } catch {}
  world.setAgents(state.agents, { jira: state.jira, trace: pickTrace(state.trace) });
  showTracePick();
});
function select(slug) {
  if (slug && slug.startsWith('@client:')) { if (!EMBED) toggleClients(true, slug.slice(8), true); return; } // a card on the wall board
  if (slug && slug[0] === '@') { // a place in the room (the clients board, the whiteboard), not a person
    selected = null;
    $('#panel').classList.remove('open'); document.body.classList.remove('panel-open');
    clearTimeout(termTimer);
    world.focus(slug); atPlace = slug; showTracePick();
    if (state) renderRoster();
    return;
  }
  if (slug && !agentBy(slug)) slug = null;
  if (slug && $('#clients').classList.contains('open')) { $('#clients').classList.remove('open'); document.body.classList.remove('clients-open'); $('#btn-clients').classList.remove('on'); world.setInset(0); }
  const changed = slug !== selected;
  selected = slug || null;
  if (changed && selected && asksOf(agentBy(selected)).length) tab = 'overview';
  $('#panel').classList.toggle('open', !!selected);
  document.body.classList.toggle('panel-open', !!selected);
  if (changed || atPlace) world.focus(selected); // clicking away from the board or whiteboard goes back to the whole office
  atPlace = false; showTracePick();
  clearTimeout(termTimer);
  if (state) { renderRoster(); renderPanel(changed); renderAsks(); }
}

// ------------------------------------------------------------------ clients panel
const HEALTH_RANK = { red: 0, amber: 1, green: 2 };
const closed = (c) => (['churned', 'paused'].includes(c.state) ? 1 : 0); // closed accounts go last
const CHANNEL = { email: 'Email', whatsapp: 'WhatsApp', phone: 'Phone', slack: 'Slack', teams: 'Teams', meeting: 'Meetings' };
// One name per product: list other spellings here so they count and show as one.
const PRODUCT_ALIAS = {}; // e.g. { 'old name': 'Product' }
const productName = (p) => PRODUCT_ALIAS[String(p).trim().toLowerCase()] || String(p).trim();
const productsOf = (c) => [...new Set((c.products || []).map(productName).filter(Boolean))];
function clientCard(c) {
  const d = daysSince(c), lc = c.lastContact, open = openClients.has(c.id);
  const waiting = c.waitingOn === 'us' ? 'Waiting on us' : c.waitingOn === 'client' ? 'Waiting on them' : '';
  const owner = agentBy(c.owner) || state.agents.find((a) => first(a).toLowerCase() === c.owner.toLowerCase());
  return `<li class="cl ${open ? 'open' : ''}" data-id="${esc(c.id)}">
    <div class="chead"><i class="h ${c.health}" title="Health: ${c.health}"></i><b>${esc(c.name)}</b><span class="st ${c.state}">${esc(STATE_NAME[c.state])}</span>
      <time class="${d === null || d > 14 ? 'old' : d > 7 ? 'mid' : ''}">${agoDays(d)}</time></div>
    <div class="csub">${productsOf(c).length ? esc(productsOf(c).join(' · ')) : 'No product noted'}${waiting ? ` · <em class="${c.waitingOn}">${waiting}</em>` : ''}</div>
    <div class="cbody">
      <div class="row"><span>People</span><div class="people">${c.people && c.people.length ? c.people.map((p) => `<div class="person"><b>${esc(p.name)}</b>${p.role || p.org ? `<span>${esc([p.role, p.org].filter(Boolean).join(' · '))}</span>` : '<span>Role not known</span>'}<div class="chs">${p.channels.length ? p.channels.map((x) => `<i class="ch ${esc(x)}">${esc(CHANNEL[x] || x)}</i>`).join('') : '<i class="ch none">Channel not known</i>'}</div>${p.note ? `<small>${rich(p.note)}</small>` : ''}</div>`).join('') : 'Nobody listed yet'}</div></div>
      <div class="row"><span>Last contact</span><div>${lc ? `${new Date(lc.ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(CHANNEL[lc.channel] || lc.channel || 'unknown channel')} · ${lc.direction === 'in' ? 'they wrote' : 'we wrote'}${lc.who ? `<br><span class="dim">With</span> ${esc(lc.who)}` : ''}${lc.summary ? `<br><span class="dim">About</span> ${rich(lc.summary)}` : ''}` : 'No contact recorded'}</div></div>
      <div class="row"><span>Next step</span><div>${c.nextStep ? rich(c.nextStep) : 'None noted'}${waiting ? ` · ${waiting.toLowerCase()}` : ''}</div></div>
      <div class="row"><span>Integrations</span><div>${c.integrations.length ? c.integrations.map((x) => `<div class="integ"><i class="${esc(x.status)}"></i><b>${esc(x.name)}</b> ${esc(INTEG[x.status] || x.status)}${x.note ? `<small>${rich(x.note)}</small>` : ''}</div>`).join('') : 'None noted'}</div></div>
      ${c.owner ? `<div class="row"><span>Owner</span><div>${esc(owner ? owner.name : c.owner)}</div></div>` : ''}
    </div></li>`;
}
function renderClients() {
  const box = $('#clients');
  if (!state || !box.classList.contains('open')) return;
  const data = state.clients || { clients: [] }, all = data.clients || [];
  const states = Object.keys(STATE_NAME).filter((k) => all.some((c) => c.state === k));
  if (clientFilter !== 'all' && clientFilter !== 'stale' && !states.includes(clientFilter)) clientFilter = 'all';
  const isStale = (c) => !['churned', 'paused'].includes(c.state) && (daysSince(c) === null || daysSince(c) > 14);
  const products = [...new Set(all.flatMap(productsOf))].sort((a, b) => a.localeCompare(b));
  const none = all.filter((c) => !productsOf(c).length).length;
  if (productFilter !== 'all' && productFilter !== '(none)' && !products.includes(productFilter)) productFilter = 'all';
  const hasProduct = (c) => productFilter === 'all' || (productFilter === '(none)' ? !productsOf(c).length : productsOf(c).includes(productFilter));
  const scoped = all.filter(hasProduct); // status counts follow the chosen product
  const list = scoped.filter((c) => clientFilter === 'all' || (clientFilter === 'stale' ? isStale(c) : c.state === clientFilter))
    .sort((a, b) => closed(a) - closed(b) || HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || (a.lastContact ? a.lastContact.ms : 0) - (b.lastContact ? b.lastContact.ms : 0));
  const chip = (id, label, n) => `<button data-f="${id}" class="${clientFilter === id ? 'on' : ''}">${label}<b>${n}</b></button>`;
  const pchip = (id, label, n) => `<button data-p="${esc(id)}" class="${productFilter === id ? 'on' : ''}">${esc(label)}<b>${n}</b></button>`;
  const top = $('#clients-list') ? $('#clients-list').scrollTop : 0;
  box.innerHTML = `<div class="clhead"><h2>Clients</h2><small>${data.updated ? `updated ${esc(String(data.updated).replace('T', ' ').slice(0, 16))}` : ''}</small><button class="x" id="clients-close" title="Close (Esc)">✕</button></div>
    <div class="clfilters"><span>Status</span>${chip('all', 'All', scoped.length)}${chip('stale', 'No contact 2+ weeks', scoped.filter(isStale).length)}${states.map((k) => chip(k, STATE_NAME[k], scoped.filter((c) => c.state === k).length)).join('')}</div>
    <div class="clfilters"><span>Product</span>${pchip('all', 'All', all.length)}${products.map((p) => pchip(p, p, all.filter((c) => productsOf(c).includes(p)).length)).join('')}${none ? pchip('(none)', 'None noted', none) : ''}</div>
    <ol id="clients-list">${list.length ? list.map(clientCard).join('')
      : `<div class="empty">${data.error ? esc(data.error) : all.length ? 'No clients match this filter.' : 'No clients listed yet. The clients agent keeps this list in clients.json.'}</div>`}</ol>`;
  $('#clients-list').scrollTop = top;
}
function toggleClients(on, focusId, only) {
  const box = $('#clients'), open = on ?? !box.classList.contains('open');
  if (open && selected) select(null);
  box.classList.toggle('open', open); document.body.classList.toggle('clients-open', open);
  $('#btn-clients').classList.toggle('on', open);
  world.setInset(open ? 444 : 0, open && innerWidth > 1100 ? 250 : 0); // keep the scene clear of the clients panel and the roster
  if (open && focusId) { if (only) openClients.clear(); openClients.add(focusId); clientFilter = 'all'; productFilter = 'all'; }
  renderClients();
  if (open && focusId) { const el = box.querySelector(`.cl[data-id="${CSS.escape(focusId)}"]`); if (el) el.scrollIntoView({ block: 'center' }); }
}
$('#clients').addEventListener('click', (e) => {
  if (e.target.closest('#clients-close')) return toggleClients(false);
  const f = e.target.closest('[data-f]');
  if (f) { clientFilter = f.dataset.f; return renderClients(); }
  const pf = e.target.closest('[data-p]');
  if (pf) { productFilter = pf.dataset.p; return renderClients(); }
  if (e.target.closest('a')) return;
  const li = e.target.closest('.cl');
  if (li) { const id = li.dataset.id; if (openClients.has(id)) openClients.delete(id); else openClients.add(id); li.classList.toggle('open'); }
});
$('#pbody').addEventListener('click', (e) => { const c = e.target.closest('[data-client]'); if (c) toggleClients(true, c.dataset.client); });

// ------------------------------------------------------------------ what the team needs from you
// Open questions and messages (written by `team-ask`). They show on the person: a raised hand in the
// room, "Needs you" in the list, and the question with its answers at the top of their panel.
const asksBox = document.createElement('div');
asksBox.id = 'asks';
$('#pbody').before(asksBox);
const recapBox = document.createElement('button');
recapBox.id = 'recap'; recapBox.type = 'button'; recapBox.title = 'Dismiss';
document.body.appendChild(recapBox);
recapBox.onclick = () => recapBox.classList.remove('show');

function renderAsks() {
  const a = selected && agentBy(selected), list = a ? asksOf(a) : [];
  asksBox.classList.toggle('show', list.length > 0);
  asksBox.innerHTML = list.map((x) => `<div class="ask ${x.kind === 'request' ? 'request' : 'note'}" data-id="${esc(x.id)}">
    <div class="ahead"><b>${x.kind === 'request' ? 'Needs your answer' : 'Message for you'}</b><span>${esc(since(new Date(x.created).getTime()))}</span>
      ${x.ticket && asks.site ? `<a class="key" href="${esc(asks.site)}/browse/${esc(x.ticket)}" target="_blank" rel="noopener">${esc(x.ticket)}</a>` : ''}</div>
    <div class="atitle">${rich(x.title || '')}</div>${x.body ? `<div class="abody">${md(x.body)}</div>` : ''}
    ${x.kind === 'request'
      ? `${x.options.length ? `<div class="acts">${x.options.map((o, i) => `<button type="button" class="${i ? '' : 'pri'}" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}
         <div class="acts"><input placeholder="Write an answer…"><button type="button" data-send>Send</button></div>`
      : '<div class="acts"><button type="button" data-read>Mark as read</button></div>'}
  </div>`).join('');
}
function applyAsks() {
  const map = {};
  for (const x of asks.items) { const m = map[x.from] = map[x.from] || { req: 0, note: 0 }; if (x.kind === 'request') m.req++; else m.note++; }
  for (const [k, n] of Object.entries(window.__officeDrafts || {})) (map[k] = map[k] || { req: 0, note: 0 }).draft = n; // see inbox.js
  world.setNeeds(map);
  if (!state) return;
  renderStats(); renderRoster(); renderPanel(false);
  if (!asksBox.contains(document.activeElement)) renderAsks();
}
let asksSig = '', asksSeen = null;
async function pollAsks() {
  try {
    const d = await api('/api/requests'), sig = JSON.stringify(d);
    if (sig === asksSig) return;
    asksSig = sig;
    asks = { items: d.items || [], more: d.withLucia ?? d.withLead ?? 0, site: d.site || '' };
    const ids = new Set(asks.items.map((x) => x.id));
    if (asksSeen) for (const x of asks.items) {
      if (asksSeen.has(x.id) || x.kind !== 'request') continue;
      toast(`<i class="dot blocked"></i><b>${esc(x.name)}</b> has a question for you<button type="button" class="go" data-go="requests">Open</button>`, '', 12000); chime([880, 660]);
    }
    asksSeen = ids;
    applyAsks();
  } catch { /* server restarting */ }
}
asksBox.addEventListener('click', async (e) => {
  const card = e.target.closest('.ask'), b = e.target.closest('button');
  if (!card || !b) return;
  const id = Number(card.dataset.id);
  const text = b.dataset.answer ?? (b.hasAttribute('data-send') ? card.querySelector('input').value.trim() : null);
  try {
    if (b.hasAttribute('data-read')) await api('/api/requests/read', { id });
    else if (text) await api('/api/requests/answer', { id, text });
    else return;
    if (document.activeElement) document.activeElement.blur();
    asksSig = ''; pollAsks();
  } catch (err) { toast(esc(err.message), 'err', 8000); }
});
asksBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.parentElement.querySelector('[data-send]').click(); }
});
pollAsks(); setInterval(pollAsks, 3000);
// The count in the top bar jumps to the next person who is waiting.
$('#stats').addEventListener('click', (e) => {
  if (!e.target.closest('#stat-need') || !state) return;
  const waiting = state.agents.filter((a) => eff(a) === 'blocked');
  if (!waiting.length) return;
  const i = waiting.findIndex((a) => a.slug === selected);
  select(waiting[(i + 1) % waiting.length].slug);
});

// One line about what happened while the office was out of sight. Says nothing when nothing happened.
function recap(sinceMs) {
  if (!state || !sinceMs) return;
  const ev = state.feed.filter((f) => f.ts > sinceMs), parts = [];
  const names = (list) => { const n = [...new Set(list)].map((h) => (agentBy(h) ? first(agentBy(h)) : h)); return n.length > 2 ? `${n.slice(0, 2).join(', ')} and ${n.length - 2} more` : n.join(' and '); };
  const waiting = asks.items.filter((x) => x.kind === 'request').map((x) => x.from);
  if (waiting.length) parts.push(`<b>${esc(names(waiting))}</b> ${new Set(waiting).size === 1 ? 'is' : 'are'} waiting for your answer`);
  const done = ev.filter((f) => f.type === 'status' && f.status === 'idle' && f.prev === 'working').map((f) => f.from);
  if (done.length) parts.push(`${esc(names(done))} finished a turn`);
  const msgs = ev.filter((f) => f.type === 'msg').length;
  if (msgs) parts.push(`${msgs} ${msgs === 1 ? 'message' : 'messages'} between teammates`);
  const cards = new Set(ev.filter((f) => f.type === 'jira').map((f) => f.key)).size;
  if (cards) parts.push(`${cards} Jira ${cards === 1 ? 'card' : 'cards'} commented`);
  if (!parts.length) return;
  const m = Math.max(1, Math.round((Date.now() - sinceMs) / 60000));
  recapBox.innerHTML = `<span>While you were away (${m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`})</span>${parts.join('<i>·</i>')}`;
  recapBox.classList.add('show');
  clearTimeout(recap.timer);
  recap.timer = setTimeout(() => recapBox.classList.remove('show'), 12000);
}
let awaySince = 0;
function away(isAway) {
  if (isAway) { awaySince = awaySince || Date.now(); return; }
  if (awaySince && Date.now() - awaySince > 60000) recap(awaySince);
  awaySince = 0;
}
document.addEventListener('visibilitychange', () => away(document.hidden));
window.office.pause = (p) => { world.setPaused(!!p); away(!!p); };
Object.assign(window.office, { rich, md, selected: () => selected, api, toast, chime, select, applyAsks, state: () => state, agents: () => (state ? state.agents : []), refreshAsks: () => { asksSig = ''; pollAsks(); } }); // for inbox.js
window.office.recap = (sinceMs) => setTimeout(() => recap(sinceMs), 2500); // after a fresh page: let the first state and questions arrive

// ------------------------------------------------------------------ state stream
function onState(s) {
  const before = new Map((state ? state.agents : []).flatMap((a) => (a.tickets || []).map((t) => [`${a.slug}:${t.key}`, t.status])));
  state = s;
  if (booted) for (const a of s.agents) for (const t of a.tickets || []) {
    const was = before.get(`${a.slug}:${t.key}`);
    if (was && was !== t.status) world.pinCard(a.herdrName, `${t.key} → ${t.status}`);
  }
  world.setAgents(s.agents, { clients: s.clients });
  const fresh = new Set();
  for (const f of s.feed) {
    if (seenFeed.has(f.id)) continue;
    seenFeed.add(f.id);
    if (!booted || Date.now() - f.ts > 45000) continue;
    fresh.add(f.id);
    const from = agentBy(f.from), to = agentBy(f.to);
    if (f.type === 'msg' && from && to) {
      world.converse(f.from, f.to, f.text);
      const until = Date.now() + 14000;
      talking.set(f.from, until); talking.set(f.to, until);
      setTimeout(() => state && (renderRoster(), renderPanel(false)), 14100);
    } else if (f.type === 'you' && to) world.planeTo(to.slug, f.text);
    else if (f.type === 'jira' && from) world.pinCard(f.from, f.key || '');
    else if (f.type === 'status' && from) {
      if (f.status === 'blocked') { toast(`<i class="dot blocked"></i><b>${esc(first(from))}</b> needs you`, 'err', 9000); chime([880, 660]); }
      else if (f.status === 'idle' && f.prev === 'working') { toast(`<i class="dot idle"></i><b>${esc(first(from))}</b> finished`); chime([660, 880]); }
    }
  }
  booted = true;
  window.office.ready = true;
  $('#banner').classList.toggle('show', !s.hcOk);
  if (!s.hcOk) $('#banner').textContent = 'Herdr is not answering, so statuses may be stale. Is the Herdr app running?';
  if (!s.team.setUp) { $('#banner').classList.add('show'); $('#banner').textContent = 'The business team is not set up yet (no team.json in its folder).'; }
  renderStats(); renderRoster(); renderFeed(fresh); renderPanel(false); renderClients();
}
let stream = null;
document.addEventListener('visibilitychange', () => { if (!document.hidden && stream && stream.readyState === EventSource.CLOSED) connect(); }); // a phone drops the stream when it sleeps
function connect() {
  const es = stream = new EventSource(`/api/stream?token=${TOKEN}`);
  es.addEventListener('state', (e) => { $('#live').classList.add('on'); onState(JSON.parse(e.data)); });
  es.onerror = () => {
    $('#live').classList.remove('on');
    if (es.readyState === EventSource.CLOSED) { fetch('/api/state', { headers: { 'x-office-token': TOKEN } }).then((r) => { if (r.status === 401) staleToken(); }).catch(() => {}); $('#banner').classList.add('show'); $('#banner').textContent = 'Lost the local server. Start it again and reload this page.'; }
  };
}
connect();
setInterval(() => {
  $('#clock').textContent = new Date().toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}, 1000);
setInterval(() => { if (state) { renderRoster(); renderStats(); } }, 20000);
setInterval(() => { if (state) world.setAgents(state.agents, { clients: state.clients }); }, 3600000); // day counts on the boards

// ------------------------------------------------------------------ messaging
async function sendMessage(targets, text) {
  try {
    const { results } = await api('/api/send', { to: targets, text });
    for (const r of results) {
      const a = agentBy(r.name), n = a ? first(a) : r.name;
      if (!r.ok) toast(`Could not reach <b>${esc(n)}</b>: ${esc(r.error)}`, 'err', 8000);
      else toast(r.queued ? `Queued for <b>${esc(n)}</b>. It lands when their prompt is free.` : `Sent to <b>${esc(n)}</b>`);
    }
    return results.some((r) => r.ok);
  } catch (e) { toast(esc(e.message), 'err', 8000); return false; }
}
const msg = $('#msg');
async function submitPanel() {
  const a = selected && agentBy(selected), text = msg.value.trim();
  if (!a || !text) return;
  $('#send').disabled = true;
  if (await sendMessage([a.herdrName], text)) { msg.value = ''; msg.style.height = ''; }
  $('#send').disabled = false;
  if (!PHONE) msg.focus();
}
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); submitPanel(); });
msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !PHONE) { e.preventDefault(); submitPanel(); } }); /* on a phone Enter is a new line */
msg.addEventListener('input', () => { msg.style.height = ''; msg.style.height = `${Math.min(140, msg.scrollHeight + 2)}px`; });
$('#chips').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const a = selected && agentBy(selected);
  if (b.id === 'stop') {
    if (b.dataset.sure) {
      try { await api('/api/interrupt', { to: a.herdrName }); toast(`Interrupted <b>${esc(first(a))}</b>`); } catch (err) { toast(esc(err.message), 'err'); }
    } else { b.dataset.sure = '1'; b.textContent = 'Click again to stop their current turn'; }
    return;
  }
  msg.value = b.dataset.q; msg.focus();
});
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; renderPanel(true); } });
$('#roster').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) select(c.dataset.slug === selected ? null : c.dataset.slug); });

// command bar: "@pablo …", "@irene @elena …", "@all …"
const cmd = $('#cmd-input'), hint = $('#hint');
function parseCommand(raw) {
  const targets = new Set();
  const text = raw.replace(/(^|\s)@([\p{L}\w-]+)/gu, (m0, sp, name) => {
    const n = plain(name);
    if (['all', 'team', 'everyone', 'todos'].includes(n)) { state.agents.forEach((a) => targets.add(a.herdrName)); return sp; }
    const a = state.agents.find((x) => x.herdrName === n || plain(first(x)) === n);
    if (!a) return m0;
    targets.add(a.herdrName);
    return sp;
  }).trim();
  if (!targets.size && selected) targets.add(agentBy(selected).herdrName);
  return { targets: [...targets], text };
}
function showHint(t) { hint.textContent = t; hint.classList.toggle('show', !!t); }
cmd.addEventListener('input', () => {
  if (!state) return;
  const { targets } = parseCommand(cmd.value);
  showHint(cmd.value.trim() ? (targets.length ? `To: ${targets.map((t) => first(agentBy(t))).join(', ')}` : `Start with ${state.agents.map((a) => `@${a.herdrName}`).join(' ')} or @all`) : '');
});
$('#cmd').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state) return;
  const { targets, text } = parseCommand(cmd.value);
  if (!text) return;
  if (!targets.length) return showHint(`Who is it for? Start with ${state.agents.map((a) => `@${a.herdrName}`).join(' ')} or @all`);
  if (await sendMessage(targets, text)) { cmd.value = ''; showHint(''); }
});

// top bar + keyboard
$('#btn-home').onclick = () => { world.focus(null); select(null); };
$('#btn-board').onclick = () => select('@board');
$('#btn-trace').onclick = () => select('@trace');
$('#btn-clients').onclick = () => toggleClients();
$('#feed-list').addEventListener('click', (e) => {
  if (e.target.closest('a')) return; // links just open
  const li = e.target.closest('li.msg');
  if (!li) return;
  const id = li.dataset.id;
  if (openFeed.has(id)) openFeed.delete(id); else openFeed.add(id);
  li.classList.toggle('open');
});
$('#btn-feed').onclick = (e) => { e.currentTarget.classList.toggle('on'); $('#feed').classList.toggle('hidden'); };
// A new browser tab. From the Herdr terminal view this opens the real browser (office-tty hands new windows to it).
$('#btn-more').onclick = (e) => { e.stopPropagation(); $('#more').classList.toggle('open'); };
addEventListener('click', (e) => { if (!e.target.closest('#btn-light, #btn-sound, #btn-feed')) $('#more').classList.remove('open'); });
if (innerWidth <= 1100) { $('#btn-feed').classList.remove('on'); $('#feed').classList.add('hidden'); } // narrow views start with the feed tucked away
$('#btn-open').onclick = () => { window.open(`${location.origin}/`, '_blank', 'noopener'); };
$('#btn-sound').onclick = (e) => { sound = !sound; e.currentTarget.textContent = `Sound: ${sound ? 'on' : 'off'}`; e.currentTarget.classList.toggle('on', sound); chime([660, 880]); };
$('#btn-light').onclick = (e) => {
  lightMode = { auto: 'day', day: 'night', night: 'auto' }[lightMode];
  e.currentTarget.textContent = `Light: ${lightMode}`;
  world.setLight(lightMode);
};
addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else if ($('#clients').classList.contains('open')) toggleClients(false); else select(null); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || !state) return;
  if (e.key === '/') { e.preventDefault(); cmd.focus(); }
  else if (e.key === '0') { world.focus(null); select(null); }
  else if (e.key === 'b' || e.key === 'B') select('@board');
  else if (e.key === 'l' || e.key === 'L') select('@trace');
  else if (e.key === 'c' || e.key === 'C') toggleClients();
  else if (/^[1-9]$/.test(e.key)) { const a = state.agents[Number(e.key) - 1]; if (a) select(a.slug); }
});
