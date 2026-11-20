// Page logic: live state from the local server, roster, detail panel, messaging.
import { createWorld } from './world.js';
import { THEMES, themeById, isTheme, DEFAULT_THEME } from './themes/index.js';

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
  return m < 1 ? 'just now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
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
  let h = esc(s).replace(/`([a-z0-9][a-z0-9._-]*)?\$ ([^`\n]+)`/gi, (m, on, c) => (window.termRun ? hold(window.termRun.chip(c, on || '')) : m)) // `$ command`: a button that opens the terminal with it
    .replace(/`([^`\n]+)`/g, (m, c) => (window.termRun && window.termRun.looks(c) ? hold(window.termRun.chip(c.trim(), '')) : m)) // a command nobody marked is a button too
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => link(url, text))
    .replace(/https?:\/\/[^\s<)\]]*[^\s<)\].,;:!?]/g, (url) => (refOf(url) ? link(url, refOf(url), ' class="key"') : link(url, short(url))));
  h = h.replace(/(^|[\s(¿¡])((?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|ai|es|eu|cloud)(?:\/[^\s<)\]]*[^\s<)\].,;:!?])?)(?=$|[\s),.;:!?])/gim, (_m, pre, dom) => pre + link(`https://${dom}`, dom)); // "portal.azure.com" written without https:// is a link too
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
function md(s) { // ``` blocks first: a ```run block is a command for the terminal, any other one is shown as written
  const parts = String(s == null ? '' : s).split('```');
  if (parts.length < 2) return mdBody(s);
  return parts.map((part, i) => {
    if (!(i % 2)) return mdBody(part);
    const m = /^([^\n]*)\n([\s\S]*)$/.exec(part) || [0, '', part], info = m[1].trim(), body = (/^[\w .-]*$/.test(info) ? m[2] : part).replace(/\n+$/, '');
    if (window.termRun && (/^run\b/i.test(info) || window.termRun.shell(info))) return window.termRun.block(esc(body), /^run\b/i.test(info) ? info.replace(/^run\s*(?:on\s+)?/i, '').trim() : ''); // a ```bash block is for the terminal too
    return `<pre class="mdpre">${esc(body).replace(/https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<)])*(?!&quot;|&#39;|&lt;|&gt;)[^\s<).,;:!?]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)}</pre>`;
  }).join('');
}
function mdBody(s) { // tables become real tables (a text cut short may end in half a row: it is drawn as far as it goes)
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

let state = null, selected = null, tab = 'overview', booted = false, termTimer = null, sound = (() => { try { return localStorage.getItem('office.sound') === '1'; } catch { return false; } })(), lightMode = 'auto';
const seenFeed = new Set();
const talking = new Map();
const openFeed = new Set(); // feed messages the reader expanded
// The look of the room, one for the whole building (GET/POST /api/theme). The page arrives with it (no flash);
// when the setting or the day's theme changes, the state says so and the page reloads with the new one.
const THEME_ID = (() => { const v = window.__THEME__; if (isTheme(v)) return v; try { const x = sessionStorage.getItem('office.theme'); if (isTheme(x)) return x; } catch {} return DEFAULT_THEME; })();
const theme = themeById(THEME_ID);
// Role title in this theme; the shared files use it when it is there (chat.js, people.js). The Business floor
// (port 4318, its own office app) is not themed: its people keep their real roles wherever this page lists them.
window.officeRole = (r, team) => (team && String(team.port) === '4318' ? r : theme.title(r));
const world = createWorld($('#scene'), $('#labels'), { onSelect: (slug) => select(slug), format: (t) => rich(t), onBoard: (id) => boardClick(id), theme });
const EMBED = new URLSearchParams(location.search).has('embed'); // rendered for the Herdr tab: scene only
if (EMBED) document.body.classList.add('embed');
window.office = { world, ready: false, theme: THEME_ID, focus: (slug) => world.focus(slug || null, true), pause: (p) => world.setPaused(!!p) };

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
let audio = null, apprAt = '';
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

// The watchdog zap: a rising hum while the cloud gathers (2.4 s), then three cracks with thunder.
function zapSound() {
  if (!sound) return;
  audio = audio || new AudioContext(); if (audio.state === 'suspended') audio.resume();
  const t0 = audio.currentTime + 0.05, W = 2.4, out = audio.destination;
  const hum = audio.createOscillator(), hg = audio.createGain(), lfo = audio.createOscillator(), lg = audio.createGain();
  hum.type = 'sawtooth'; hum.frequency.setValueAtTime(55, t0); hum.frequency.exponentialRampToValueAtTime(330, t0 + W);
  lfo.frequency.setValueAtTime(5, t0); lfo.frequency.linearRampToValueAtTime(22, t0 + W); lg.gain.value = 0.05; lfo.connect(lg).connect(hg.gain);
  hg.gain.setValueAtTime(0.0001, t0); hg.gain.exponentialRampToValueAtTime(0.11, t0 + W); hg.gain.exponentialRampToValueAtTime(0.0001, t0 + W + 0.08);
  hum.connect(hg).connect(out); hum.start(t0); lfo.start(t0); hum.stop(t0 + W + 0.1); lfo.stop(t0 + W + 0.1);
  const noise = audio.createBuffer(1, audio.sampleRate * 1.6, audio.sampleRate), d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  [[0, 0.3, 1.5], [0.62, 0.17, 0.5], [1.18, 0.22, 0.9]].forEach(([at, vol, len]) => {
    const t = t0 + W + at, n = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    n.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(140, t + len);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + len);
    const o = audio.createOscillator(), og = audio.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.22);
    og.gain.setValueAtTime(vol * 0.35, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.26);
  });
}
function zapFlash() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;background:radial-gradient(circle at 50% 45%,rgba(255,244,190,.55),rgba(255,214,90,.18) 55%,transparent 80%);opacity:0';
  document.body.append(el);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return el.remove();
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 0.1, offset: 0.26 }, { opacity: 0.6, offset: 0.4 }, { opacity: 0.05, offset: 0.62 }, { opacity: 0.8, offset: 0.75 }, { opacity: 0 }], { duration: 1600 }).onfinish = () => el.remove();
}
function runZap(name, text) {
  const a = agentBy(name); if (!a) return;
  world.zap(name, text); zapSound(); setTimeout(zapFlash, 2400);
  toast(`⚡ Watchdog caught <b>${esc(first(a))}</b>: ${esc(text || '')}`, 'err', 14000);
}

// ------------------------------------------------------------------ render
function renderStats() {
  const c = { working: 0, idle: 0, blocked: 0, offline: 0 };
  state.agents.forEach((a) => c[eff(a)]++);
  const cards = state.agents.reduce((n, a) => n + a.tickets.length, 0);
  const stat = (k, label) => `<div class="stat"><i class="dot ${k}"></i><b>${c[k]}</b><span>${label}</span></div>`;
  $('#stats').innerHTML = stat('working', 'working') + stat('idle', 'idle')
    + (c.blocked ? `<button class="stat need" id="stat-need" title="Go to who is waiting for you${asks.more ? ` (the team lead is handling ${asks.more} more)` : ''}"><b>${c.blocked}</b><span>${c.blocked === 1 ? 'needs you' : 'need you'}</span></button>` : '') + (c.offline ? stat('offline', 'offline') : '')
    + ((state.approvals || []).length ? `<button class="stat need appr" id="stat-appr" title="Finished by the team, only your approval or merge is missing: ${esc(state.approvals.map((x) => x.key).join(', '))}"><b>${state.approvals.length}</b><span>${state.approvals.length === 1 ? 'awaits' : 'await'} your approval</span></button>` : '')
    + `<div class="stat"><b>${cards}</b><span>open ${cards === 1 ? 'card' : 'cards'}</span></div>`;
  const HQ = (state.team && state.team.name) || 'Omniloy HQ';
  { const bn = document.querySelector('.brand b'); if (bn && bn.textContent !== HQ) { bn.textContent = HQ; document.querySelector('.brand .logo').textContent = HQ[0]; } }
  { const ci = $('#cmd-input'); if (ci && state.agents[0] && !ci.dataset.named) { ci.dataset.named = 1; ci.placeholder = theme.texts.composer.replace('{name}', state.agents[0].herdrName); } }
  { const rn = $('#room-name'), t = theme.texts.room || ''; if (rn && rn.textContent !== t) { rn.textContent = t; rn.hidden = !t; } }
  document.title = c.blocked ? `(${c.blocked}) ${HQ}` : HQ;
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
      <div class="who"><b>${esc(a.name)}</b><span>${esc(theme.title(a.role))}</span>${prBadge(a)}</div>
      <div class="line">${rosterLine(a)}</div><kbd>${i + 1}</kbd>
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
  if (f.type === 'zap') head = `⚡ <b>${esc(who(f.from))}</b> caught: ${esc(f.text)}`;
  else if (f.type === 'jira') head = `<b>${esc(who(f.from))}</b> ${rich(f.text)}`;
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
    : '<div class="empty">Nothing yet. Messages between teammates, Jira comments and status changes show up here.</div>';
}

function overview(a) {
  const s = shown(a), m = a.memory;
  const now = s === 'offline' ? 'Not running in Herdr right now.'
    : s === 'working' ? esc(a.nowDoing || 'Thinking') : s === 'blocked' ? esc(a.nowDoing || 'Waiting for your answer')
    : s === 'talking' ? 'Talking with a teammate' : 'Idle, waiting for something to do';
  const list = (items, empty) => (items && items.length ? `<ul class="plain">${items.map((i) => `<li>${md(i)}</li>`).join('')}</ul>` : `<div class="muted">${empty}</div>`);
  const tickets = a.tickets.length
    ? a.tickets.map((t) => `<a class="ticket" href="${esc(t.url)}" target="_blank" rel="noopener"><b>${esc(t.key)}</b><i>${esc(t.status)}</i><span>${esc(t.summary)}</span></a>`).join('')
    : `<div class="muted">${state.jira.error ? `Jira could not be read: ${esc(state.jira.error)}` : `No open cards carry <code>${esc(a.label)}</code>.`}</div>`;
  return `
    <div class="sec"><h3>Right now</h3><div class="now" style="--s:${COLOR[s]}">${now}${a.online ? `<small>${LABEL[s]} for ${since(a.statusSince)} · turn ${a.turn}</small>` : ''}</div></div>
    ${a.lastSaid ? `<div class="sec"><h3>Last update</h3><div class="prose">${md(a.lastSaid)}</div></div>` : ''}
    <div class="sec"><h3>On their plate</h3>${list(m && m.plate, 'No cards to move right now.')}</div>
    <div class="sec"><h3>Waiting on</h3>${list(m && m.waiting, 'Not waiting on anyone.')}</div>
    <div class="sec"><h3>Open Jira cards</h3><div style="display:flex;flex-direction:column;gap:6px">${tickets}</div></div>
    ${(a.prs || []).length ? `<div class="sec"><h3>Pull requests</h3><div style="display:flex;flex-direction:column;gap:6px">${a.prs.map((x) => `<a class="pr" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.repo)} #${x.number}</b><i class="prs ${x.state}">${PR_TEXT[x.state] || x.state}</i><span>${esc(x.title)}</span></a>`).join('')}</div></div>` : ''}
    <div class="sec"><h3>Setup</h3><div class="kv">
      <div><span>Runs on</span><b>${esc(a.runtimeName)}</b></div>
      <div><span>Herdr tab</span><b>${esc(a.where || 'not open')}</b></div>
      <div><span>Shift started</span><b>${a.startedMs ? `${hhmm(a.startedMs)} (${since(a.startedMs)})` : 'not started'}</b></div>
      <div><span>Jira label</span><b>${esc(a.label)}</b></div>
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
    <div><h2>${esc(a.name)}</h2><p>${esc(theme.title(a.role))} · <span class="pill" style="--s:${COLOR[s]}"><i class="dot ${s}"></i>${LABEL[s]}</span></p></div>
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
// ------------------------------------------------------------------ the wall board's cards
// The filters and the cards are on the wall itself (world.setBoard draws them and reports clicks). The side
// panel only opens for one card. Local state plus one Jira read per card opened; no model is asked: no tokens.
const cardsEl = $('#cards');
let cardsData = null, cardsFilter = 'open', cardOpen = null, cardsTimer = 0;
const dayTime = (s) => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return String(s); const same = d.toDateString() === new Date().toDateString(); return same ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const agoOf = (s) => { const m = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000)); return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
const cardState = (c) => { const a = agentBy(c.owner); return c.caught ? 'caught' : c.approval ? 'approval' : c.waiting ? 'waiting' : a && shown(a) === 'working' ? 'working' : 'idle'; };
const personName = (n) => (n === '__OWNER_ID__' ? 'you' : agentBy(n) ? first(agentBy(n)) : n);
function boardSets(d) { // the filters of the board and what each card is doing; the wall and the phone list both use it
  const open = d.open, st = Object.fromEntries(open.map((c) => [c.key, cardState(c)]));
  const sets = { open: ['Open', open], working: ['Working now', open.filter((c) => st[c.key] === 'working')], approval: ['Your approval', open.filter((c) => c.approval)], waiting: ['Waiting', open.filter((c) => c.waiting && !c.approval)],
    idle: ['Stopped', open.filter((c) => ['idle', 'caught'].includes(st[c.key]))], today: ['Done today', d.doneToday], week: ['Done this week', d.doneWeek] };
  return { sets, st };
}
function paintBoard() {
  if (!cardsData) return world.setBoard(null);
  const d = cardsData, { sets, st } = boardSets(d);
  if (!sets[cardsFilter]) cardsFilter = 'open';
  const flat = ['today', 'week'].includes(cardsFilter) ? sets[cardsFilter][1] : null;
  world.setBoard({ chips: Object.entries(sets).map(([id, [label, l]]) => ({ id, label, n: l.length, on: id === cardsFilter })),
    show: cardsFilter === 'open' || flat ? null : new Set(sets[cardsFilter][1].map((c) => c.key)), tone: st, flat, selected: cardOpen });
}
async function loadCards() { try { cardsData = await api('/api/cards'); paintBoard(); } catch { /* keep the last picture */ } }
function showCards() {
  const on = atPlace === '@board';
  clearInterval(cardsTimer);
  if (!on) return closeCard();
  loadCards(); cardsTimer = setInterval(loadCards, 30000);
}
function closeCard() { cardOpen = null; cardsEl.classList.remove('show'); document.body.classList.remove('card-open'); paintBoard(); }
function boardClick(id) {
  if (atPlace !== '@board') select('@board');
  const [kind, v] = id.split(/:(.*)/);
  if (kind === 'filter') { cardsFilter = v; paintBoard(); } else if (kind === 'card') openCard(v);
}
async function openCard(key) {
  cardOpen = key; paintBoard();
  cardsEl.classList.add('show'); document.body.classList.add('card-open');
  cardsEl.innerHTML = `<header><div class="hd"><b class="key">${esc(key)}</b><span class="sp"></span><button type="button" class="x" title="Close (Esc)">✕</button></div></header><div class="body"><div class="dim">Loading…</div></div>`;
  let d; try { d = await api(`/api/card?key=${encodeURIComponent(key)}`); } catch (err) { if (cardOpen === key) cardsEl.querySelector('.body').textContent = err.message; return; }
  if (cardOpen !== key) return;
  const c = d.card, j = d.jira || {}, a = c && agentBy(c.owner), lastPass = [...d.log].reverse().find((x) => x.ev === 'pass');
  const caught = cardsData && (cardsData.open.find((x) => x.key === key) || {}).caught;
  const state = !c ? ['done', 'Closed'] : caught ? ['caught', '⚡ Stopped'] : c.waiting && c.waiting.kind === 'approval' ? ['approval', 'Your approval'] : c.waiting ? ['waiting', 'Waiting'] : a && shown(a) === 'working' ? ['working', 'Working'] : ['idle', 'Stopped'];
  const line = !c ? '' : c.waiting && c.waiting.kind === 'approval' ? `Finished on the team's side. Waiting for your approval or merge: ${c.waiting.on}` : c.waiting ? `Waiting for ${c.waiting.on}` : state[0] === 'working' ? (a.nowDoing || '') : `${personName(c.owner)} has to move it`;
  const openReqs = d.requests.filter((x) => x.status === 'open');
  const PR_ICON = { approved: '✓', changes: '✗', failing: '✗', review: '…', draft: '○' };
  const EV = { take: (x) => `${personName(x.by)} took it`, pass: (x) => `${personName(x.by)} → ${personName(x.to)}: ${x.msg || ''}`, wait: (x) => `Waiting: ${x.on || ''}`, approval: (x) => `Waiting for your approval: ${x.on || ''}`, resume: () => 'Active again', done: (x) => `Closed${x.by ? ` by ${personName(x.by)}` : ''}` };
  cardsEl.innerHTML = `<header><div class="hd"><b class="key">${esc(key)}</b><i class="pill">${esc(j.status || '')}</i><span class="sp"></span><a href="${esc(d.url)}" target="_blank" rel="noopener">Jira ↗</a><button type="button" class="x" title="Close (Esc)">✕</button></div>
    <div class="title">${esc(j.title || (c && c.title) || '')}</div></header>
    <div class="body">
    <div class="tiles"><div><small>Who</small><b>${c ? esc(personName(c.owner)) : '—'}</b></div><div class="s-${state[0]}"><small>Now</small><b>${state[1]}</b></div><div><small>${c && c.waiting ? 'Waiting' : 'Held'}</small><b>${c ? agoOf(c.waiting ? c.waiting.since : c.since) : '—'}</b></div></div>
    ${line ? `<div class="line">${esc(line)}</div>` : ''}
    <div class="chips2">${openReqs.map((x) => `<span class="c warn" title="${esc(x.title)}">? #${x.id} → ${esc(personName(x.to))}</span>`).join('')}${d.prs.map((x) => `<a class="c ${['changes', 'failing'].includes(x.state) ? 'bad' : x.state === 'approved' ? 'ok' : ''}" href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(PR_TEXT[x.state] || x.state)}: ${esc(x.title)}">${PR_ICON[x.state] || ''} ${esc(x.repo)} #${x.number}</a>`).join('')}<span class="c" id="card-tok" title="Estimate from the turns that mention this card in the last 3 weeks (Claude teammates only). A turn about several cards is split between them. Cache reads not included.">tokens…</span></div>
    ${lastPass ? `<div class="pass"><small>${esc(personName(lastPass.by))} → ${esc(personName(lastPass.to))} · ${dayTime(lastPass.ts)}</small>${esc(lastPass.msg || '')}</div>` : ''}
    ${j.error ? `<div class="dim">Jira: ${esc(j.error)}</div>` : ''}
    ${d.log.length ? `<details><summary>History <small>${d.log.length}</small></summary>${[...d.log].reverse().slice(0, 20).map((x) => `<p><time>${dayTime(x.ts)}</time>${esc((EV[x.ev] || (() => x.ev))(x))}</p>`).join('')}</details>` : ''}
    ${j.comments && j.comments.length ? `<details><summary>Comments <small>${j.commentCount}</small></summary>${j.comments.map((x) => `<p><time>${dayTime(x.at)}</time>${esc(x.text)}</p>`).join('')}</details>` : ''}
    ${j.description ? `<details><summary>Description</summary><p>${esc(j.description)}</p></details>` : ''}
    ${d.caught.length ? `<details><summary>Watchdog <small>${d.caught.length}</small></summary>${d.caught.map((x) => `<p><time>${dayTime(x.ts)}</time>${esc(personName(x.agent))} stopped ${x.idleMin} min</p>`).join('')}</details>` : ''}
    </div>`;
  try {
    const t = await api(`/api/card-tokens?key=${encodeURIComponent(key)}`), el = $('#card-tok');
    const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
    if (el && cardOpen === key) el.textContent = t.turns ? `≈ ${fmt(t.tokens)} tokens · ${t.turns} turns` : 'no tokens counted';
  } catch { const el = $('#card-tok'); if (el) el.textContent = 'tokens ?'; }
}
cardsEl.addEventListener('click', (e) => { if (e.target.closest('.x')) closeCard(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && cardOpen) closeCard(); });

function select(slug) {
  if (slug && slug[0] === '@') { // a place in the room (the wall board, the whiteboard), not a person
    selected = null;
    $('#panel').classList.remove('open'); document.body.classList.remove('panel-open');
    clearTimeout(termTimer);
    world.focus(slug); atPlace = slug; showTracePick(); showCards();
    if (state) renderRoster();
    return;
  }
  if (slug && !agentBy(slug)) slug = null;
  const changed = slug !== selected;
  selected = slug || null;
  if (changed && selected && asksOf(agentBy(selected)).length) tab = 'overview';
  $('#panel').classList.toggle('open', !!selected);
  document.body.classList.toggle('panel-open', !!selected);
  if (changed || atPlace) world.focus(selected); // clicking away from the board or whiteboard goes back to the whole office
  atPlace = false; showTracePick(); showCards();
  clearTimeout(termTimer);
  if (state) { renderRoster(); renderPanel(changed); renderAsks(); }
}

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

// ------------------------------------------------------------------ terminal menus (a Claude/Codex question waiting in a terminal)
// What the agent asks is shown as written, in monospace and escaped, never through rich(): a command here must not
// become a Run button. After an answer the menu id is hidden for 10 s, so a poll that started earlier cannot bring
// the old card back; a different menu that comes right after is a new card, marked "new".
const menuHide = new Map(), menuFresh = new Map(), menuQuiet = new Set(), menuBusy = new Set(); // quiet: a box you just ticked is the same question, not a new one
const menuHidden = (id) => { const t = menuHide.get(id); if (t > Date.now()) return true; if (t) menuHide.delete(id); return false; };
const menuIsNew = (id) => (menuFresh.get(id) || 0) > Date.now();
// The follow-up question appears where the answered one was: for its first 1.5 s on screen it takes no tap, so a
// second tap meant for the old card does not approve the next command.
const ARM_MS = 1500, menuSeen = new Map();
const menuArming = (id) => {
  if (!id) return 0;
  if (!menuSeen.has(id)) { if (!menuIsNew(id)) return 0; menuSeen.set(id, Date.now()); if (menuSeen.size > 300) menuSeen.delete(menuSeen.keys().next().value); }
  return Math.max(0, ARM_MS - (Date.now() - menuSeen.get(id)));
};
const FREE = /type something|tell (Claude|Codex)|what to do differently|chat about this/i; // the option that takes your own words
const BOX = /^(\d\.\s+)(\[[ xX✓✔]\]|[☐☑◻◼□▣])\s*/; // a multiple choice question: each number ticks one box, Enter confirms
const isMulti = (x) => (x.options || []).some((o) => BOX.test(o));
// An option that gives away more than this one question (always allow, don't ask again, auto mode, bypass) takes a
// second tap: the first one only says what it does.
const WIDE = /always allow|don't ask again|do not ask again|auto mode|bypass|dangerously/i;
function sure(b, label) {
  if (!WIDE.test(label) || b.dataset.sure === '1') return true;
  const was = b.innerHTML; b.dataset.sure = '1'; b.classList.add('sure'); b.textContent = `¿Seguro? «${label}» vale también para lo que venga. Toca otra vez`;
  setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.classList.remove('sure'); b.innerHTML = was; } }, 5000);
  return false;
}
const ticked = (o) => { const b = BOX.exec(o); return !!b && !/\[ \]|[☐◻□]/.test(b[2]); };
function menuBody(x) {
  const ctx = x.context || [], shown = ctx.slice(0, 6);
  return (x.question && x.question !== x.title ? `<div class="mq">${esc(x.question)}</div>` : '')
    + (shown.length ? `<pre class="menuctx">${esc(shown.join('\n'))}${ctx.length > 6 ? `\n<i>… ${ctx.length - 6} líneas más en Live screen</i>` : ''}</pre>` : '')
    + (x.said ? `<div class="msaid"><b>${esc(x.name || '')}:</b> ${esc(x.said)}</div>` : '');
}
async function answerMenuItem(x, label, extra = {}) {
  if (menuBusy.has(x.from)) return null; // one answer at a time per person: a second tap never presses again
  menuBusy.add(x.from);
  try {
    const multi = isMulti(x), r = await api('/api/requests/answer', { id: x.id || `menu:${x.from}`, text: label, menuId: x.menuId, terminalId: x.terminalId, via: PHONE ? 'phone' : 'office', ...extra });
    const toggle = multi && r.next && isMulti(r.next);
    menuHide.set(x.menuId, Date.now() + 10000);
    if (extra.message && r.sent === false) toast(`<i class="dot blocked"></i><span>Se eligió «${esc(label)}», pero tu texto no se envió: <b>${esc(x.name || x.from)}</b> ya pregunta otra cosa.</span>`, 'err', 9000);
    else toast(`<i class="dot" style="background:#4ade80"></i><span>${toggle ? (ticked(label) ? 'Desmarcado para' : 'Marcado para') : 'Enviado a'} <b>${esc(x.name || x.from)}</b>: ${esc(toggle ? label.replace(BOX, '$1') : label)}</span>`, 'ok', 5000);
    if (r.next && toggle) menuQuiet.add(r.next.menuId);
    if (r.next) { menuFresh.set(r.next.menuId, Date.now() + (toggle ? 0 : 20000)); if (!toggle) toast(`<i class="dot blocked"></i><span>Contestado. Ahora <b>${esc(r.next.name || x.name)}</b> pregunta: ${esc(String(r.next.title || '').slice(0, 90))}</span><button type="button" class="go" data-go="requests">Ver</button>`, '', 12000); }
    return r;
  } catch (e) {
    if (/no longer on the screen/i.test(e.message)) menuHide.set(x.menuId, Date.now() + 10000);
    throw e;
  } finally { menuBusy.delete(x.from); }
}
const menuData = (x) => (x.menu ? ` data-menu-id="${esc(x.menuId)}" data-terminal-id="${esc(x.terminalId)}"` : '');

// ------------------------------------------------------------------ answering: one card body and one click handler
// for the person panel (#asks here) and For you (inbox.js), so a fix lands in both.
//   a terminal menu   its options; the free one ("Type something.") opens a box in the card and sends option + text
//                     together; a multiple choice one shows its boxes ticked or not; every card has Live screen
//   a request         its options (one that carries a command is answered when you run it: term.js) and a box
//   a message         Mark as read
function answerActs(x) {
  if (x.kind !== 'request') return '<div class="acts"><button type="button" data-read>Mark as read</button></div>';
  const opts = x.options || [];
  if (x.menu) {
    const multi = isMulti(x), free = opts.find((o) => FREE.test(o)), arm = menuArming(x.menuId);
    return `<div class="acts${arm ? ' arming' : ''}" role="group" aria-label="${esc(x.title || x.question || '')}"${arm ? ` style="animation-duration:${arm}ms"` : ''}>${opts.map((o, i) => `<button type="button" class="${multi ? (ticked(o) ? 'on' : '') : i ? '' : 'pri'}" data-answer="${esc(o)}"${multi && BOX.test(o) ? ` aria-pressed="${ticked(o)}"` : ''}>${esc(multi ? o.replace(BOX, (_, n, b) => `${n}${ticked(`${n}${b}`) ? '☑' : '☐'} `) : o)}</button>`).join('')}</div>`
      + (multi ? '<div class="mhint">Varias respuestas: cada toque marca o desmarca una casilla. Para confirmar, pulsa Enter en Live screen.</div>' : '')
      + (free ? `<div class="acts mfree" hidden><input placeholder="Tu respuesta para ${esc(x.name || '')}…" aria-label="Tu respuesta"><button type="button" class="pri" data-free="${esc(free)}">Enviar</button></div>` : '')
      + `<div class="acts"><button type="button" class="mlive" data-live="${esc(x.from)}">Live screen ›</button></div>`;
  }
  const run = (o, i) => window.termRun && window.termRun.answer && window.termRun.answer(esc(o), i ? '' : 'pri');
  return `${opts.length ? `<div class="acts">${opts.map((o, i) => run(o, i) || `<button type="button" class="${i ? '' : 'pri'}" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}
    <div class="acts"><input placeholder="Write an answer…" aria-label="Your answer"><button type="button" data-send>Send</button></div>`;
}
// What team-ask said about the answer reaching them: the server passes its words on (or a `delivery` field).
function deliveryOf(r) {
  if (r && r.delivery) return String(r.delivery);
  if (r && r.delivered === true) return 'delivered';
  if (r && r.delivered === false) return 'missed';
  const t = String((r && r.result) || '');
  if (/delivered|entregad/i.test(t)) return 'delivered';
  if (/queued|en cola|when (?:they|she|he) (?:is|are) free/i.test(t)) return 'queued';
  if (/not running|not delivered|will see it|offline|blocked/i.test(t)) return 'missed';
  return t ? 'other' : '';
}
function sayDelivered(r, from, text) {
  const a = agentBy(from), name = a ? first(a) : from, how = deliveryOf(r), q = esc(String(text).length > 60 ? `${String(text).slice(0, 59)}…` : text);
  if (how === 'delivered') return toast(`<i class="dot" style="background:#4ade80"></i><span>Entregado a <b>${esc(name)}</b>: «${q}»</span>`, 'ok', 5000);
  if (how === 'queued') { // kept in the outbox: it is typed in as soon as they can take it
    const blocked = a && a.status === 'blocked';
    return toast(`<i class="dot blocked"></i><span>Guardado. <b>${esc(name)}</b> ${blocked ? 'está esperando una respuesta en el terminal: lo recibirá en cuanto la conteste' : 'está ocupado y lo recibirá en cuanto quede libre'}.</span>${blocked ? `<button type="button" class="go" data-live="${esc(from)}">Live screen</button>` : ''}`, '', 12000);
  }
  if (how === 'missed') {
    const why = a && a.status === 'blocked' ? 'está esperando una respuesta en el terminal' : a && a.status === 'offline' ? 'no está en marcha' : 'no lo ha recibido todavía';
    return toast(`<i class="dot offline"></i><span>Guardado, pero no le llegó: <b>${esc(name)}</b> ${why}. Lo verá en sus peticiones.</span>${a && a.status === 'blocked' ? `<button type="button" class="go" data-live="${esc(from)}">Live screen</button>` : ''}`, 'err', 12000);
  }
  return toast(`<i class="dot" style="background:#4ade80"></i><span>Contestado${how === 'other' ? `: ${esc(String(r.result).slice(0, 120))}` : ''}</span>`, 'ok', 5000);
}
// The person's Live screen, from a card or a toast. Someone of another floor: their floor opens on them.
async function openLive(from, leave) {
  const c = window.office.chat;
  if (agentBy(from)) { if (leave) leave(); if (c && c.live && c.live(from)) return; select(agentBy(from).slug); return; }
  const x = (asks.items || []).find((q) => q.from === from && q.floor); // the floors and their ports: the hub's list (floors.json)
  const d = x ? await api('/api/attention').catch(() => null) : null, o = d && (d.offices || []).find((f) => f.name === x.floor);
  if (o) { location.href = `${location.protocol}//${location.hostname}:${o.port}/#p=${encodeURIComponent(from)}`; return; }
  toast(`${esc(from)} no está en esta planta.`, 'err', 6000);
}
// A click in a card. `list` is where the card's item is; `leave` closes the panel the card is in (For you) before a
// chat or a Live screen opens over it. Returns true when something was sent (the caller refreshes its list).
async function answerClick(e, card, list, leave) {
  const b = e.target.closest('button'); if (!card || !b) return false;
  const id = card.dataset.id, from = card.dataset.from;
  if (b.dataset.live !== undefined) { openLive(b.dataset.live || from, leave); return false; }
  const x = list.find((q) => (card.dataset.menuId ? q.menu && q.menuId === card.dataset.menuId : String(q.id) === id)) || { id, from, menuId: card.dataset.menuId, terminalId: card.dataset.terminalId, menu: !!card.dataset.menuId, options: [] };
  if (card.dataset.menuId && b.dataset.answer !== undefined && FREE.test(b.dataset.answer)) { // your own words go with this option: write them first
    const row = card.querySelector('.mfree'); if (row) { row.hidden = false; row.querySelector('input').focus(); }
    return false;
  }
  const busy = () => { card.classList.add('busy'); card.querySelectorAll('button').forEach((q) => { q.disabled = true; }); };
  const done = () => { card.classList.remove('busy'); card.querySelectorAll('button').forEach((q) => { q.disabled = false; }); };
  if (b.dataset.free !== undefined) {
    const input = card.querySelector('.mfree input'), message = input ? input.value.trim() : '';
    if (!message) { if (input) input.focus(); return false; }
    busy(); try { await answerMenuItem(x, b.dataset.free, { message }); } finally { done(); }
    return true;
  }
  if (b.hasAttribute('data-read')) { await api('/api/requests/read', { id }); return true; }
  const text = b.dataset.answer ?? (b.hasAttribute('data-send') ? (card.querySelector('.acts:not(.mfree) input') || {}).value?.trim() : null);
  if (!text) return false;
  if (card.dataset.menuId) {
    if (menuArming(card.dataset.menuId)) return false; // just appeared: that tap was meant for the card before it
    if (!sure(b, text)) return false; busy(); try { await answerMenuItem(x, text); } finally { done(); } return true;
  }
  busy();
  try { const r = await api('/api/requests/answer', { id, text }); sayDelivered(r, from, text); } finally { done(); }
  return true;
}
// A failed answer: what went wrong, and the way to the screen when the error points there.
function answerFailed(err, card) {
  const from = card && card.dataset.from, msg = String((err && err.message) || err || 'Could not answer.');
  toast(`<span>${esc(msg)}</span>${from && /live screen/i.test(msg) ? `<button type="button" class="go" data-live="${esc(from)}">Abrir Live screen</button>` : ''}`, 'err', 10000);
}
// Enter in a card's box sends it (the free answer of a menu, or a written answer).
function answerKey(e) {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.isComposing) return;
  e.preventDefault(); const b = e.target.parentElement.querySelector('[data-free], [data-send]'); if (b) b.click();
}
document.addEventListener('click', (e) => { const b = e.target.closest('.toast [data-live]'); if (b) openLive(b.dataset.live, () => { const x = $('#inbox.show [data-close]'); if (x) x.click(); }); });

function renderAsks() {
  const a = selected && agentBy(selected), list = a ? asksOf(a) : [];
  asksBox.classList.toggle('show', list.length > 0);
  asksBox.innerHTML = list.map((x) => `<div class="ask ${x.kind === 'request' ? 'request' : 'note'}${x.menu ? ' tmenu' : ''}" data-id="${esc(x.id)}" data-from="${esc(x.from)}"${menuData(x)}>
    <div class="ahead"><b>${x.menu ? 'Esperando en el terminal' : x.kind === 'request' ? 'Needs your answer' : 'Message for you'}</b>${x.menu && menuIsNew(x.menuId) ? '<i class="mnew">pregunta nueva</i>' : ''}<span>${esc(since(new Date(x.created).getTime()))}</span>
      ${x.ticket && asks.site ? `<a class="key" href="${esc(asks.site)}/browse/${esc(x.ticket)}" target="_blank" rel="noopener">${esc(x.ticket)}</a>` : ''}</div>
    <div class="atitle">${x.menu ? esc(x.title || '') : rich(x.title || '')}</div>${x.menu ? menuBody(x) : x.body ? `<div class="abody">${md(x.body)}</div>` : ''}
    ${answerActs(x)}
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
// One reader of /api/requests for the whole page: the person panel here, and For you (inbox.js, "office-requests").
let asksSig = '', asksSeen = null;
async function pollAsks() {
  try {
    const d = await api('/api/requests'), sig = JSON.stringify(d);
    dispatchEvent(new CustomEvent('office-requests', { detail: d }));
    if (sig === asksSig) return;
    asksSig = sig;
    asks = { items: (d.items || []).filter((x) => !(x.menu && menuHidden(x.menuId))), more: d.withLucia ?? d.withLead ?? 0, site: d.site || '' };
    const ids = new Set(asks.items.map((x) => x.notifyId || x.id));
    if (asksSeen) for (const x of asks.items) {
      if (asksSeen.has(x.notifyId || x.id) || x.kind !== 'request' || (x.menu && (menuIsNew(x.menuId) || menuQuiet.has(x.menuId)))) continue; // a follow-up menu already has its "Contestado. Ahora…" toast
      toast(`<i class="dot blocked"></i><b>${esc(x.name)}</b> has a question for you<button type="button" class="go" data-go="requests">Open</button>`, '', 12000); chime([880, 660]);
    }
    asksSeen = ids;
    applyAsks();
  } catch { /* server restarting */ }
}
asksBox.addEventListener('click', async (e) => {
  try { if (await answerClick(e, e.target.closest('.ask'), asks.items)) { if (document.activeElement) document.activeElement.blur(); asksSig = ''; pollAsks(); } }
  catch (err) { answerFailed(err, e.target.closest('.ask')); }
});
asksBox.addEventListener('keydown', answerKey);
pollAsks(); setInterval(pollAsks, 3000);
// The count in the top bar jumps to the next person who is waiting.
$('#stats').addEventListener('click', (e) => {
  if (e.target.closest('#stat-appr') && state) { const l = state.approvals || [], i = l.findIndex((x) => x.key === apprAt); apprAt = l.length ? l[(i + 1) % l.length].key : ''; if (apprAt) openCard(apprAt); return; }
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
Object.assign(window.office, { menus: { body: menuBody, answer: answerMenuItem, hidden: menuHidden, isNew: menuIsNew, hide: (id, ms = 10000) => menuHide.set(id, Date.now() + ms), next: (id, quiet) => (quiet ? menuQuiet.add(id) : menuFresh.set(id, Date.now() + 20000)) }, answers: { acts: answerActs, click: answerClick, key: answerKey, failed: answerFailed, live: openLive, said: sayDelivered }, forYouKeys: () => asks.items.map((x) => (x.menu ? x.notifyId : `r${x.id}`)), rich, md, selected: () => selected, zap: runZap, api, openCard, closeCard, boardSets, personName, agoOf, toast, chime, select, applyAsks, state: () => state, agents: () => (state ? state.agents : []), refreshAsks: () => { asksSig = ''; pollAsks(); } }); // for inbox.js
window.office.recap = (sinceMs) => setTimeout(() => recap(sinceMs), 2500); // after a fresh page: let the first state and questions arrive

// ------------------------------------------------------------------ state stream
function onState(s) {
  const before = new Map((state ? state.agents : []).flatMap((a) => (a.tickets || []).map((t) => [`${a.slug}:${t.key}`, t.status])));
  state = s;
  if (booted) for (const a of s.agents) for (const t of a.tickets || []) {
    const was = before.get(`${a.slug}:${t.key}`);
    if (was && was !== t.status) world.pinCard(a.herdrName, `${t.key} → ${t.status}`);
  }
  if (s.theme && isTheme(s.theme.effective) && s.theme.effective !== THEME_ID) themeChanged(s.theme.effective);
  world.setAgents(s.agents, { jira: s.jira, trace: pickTrace(s.trace) });
  if (cardsData) paintBoard();
  { const w = s.watchdog || {}, b = $('#btn-watch'); if (b) {
    const down = w.on && !w.running, blind = w.on && w.running && w.error;
    b.textContent = `Watchdog: ${!w.on ? 'off' : down ? '⚠ not running' : blind ? '⚠ cannot see Herdr' : 'on'}`; b.dataset.on = w.on ? '1' : '';
    b.style.color = down || blind ? '#f87171' : '';
    b.title = down ? `The watchdog is switched on for this office but is not running${w.checkedAt ? ` (last check ${dayTime(w.checkedAt)})` : ' (it has never run)'}, so nobody is caught. Start it with: team-watch start` + (w.checkedAt ? '' : '. Its login job (com.omniloy.watchdog) comes with setup/install.py.')
      : blind ? `The watchdog runs but cannot read the terminals: ${w.error}` : 'The watchdog tells the lead when someone here stops while it is their move. Click to switch it off or on for this office only.';
  } }
  const fresh = new Set();
  for (const f of s.feed) {
    if (seenFeed.has(f.id)) continue;
    seenFeed.add(f.id);
    if (f.type === 'msg') { const same = `msg|${f.from}|${f.to}|${f.ts}|${f.text}`; if (seenFeed.has(same)) continue; seenFeed.add(same); } // the same message under another id is not a new one
    if (!booted || Date.now() - f.ts > 45000) continue;
    fresh.add(f.id);
    const from = agentBy(f.from), to = agentBy(f.to);
    if (f.type === 'msg' && from && to) {
      world.converse(f.from, f.to, f.text);
      const until = Date.now() + 14000;
      talking.set(f.from, until); talking.set(f.to, until);
      setTimeout(() => state && (renderRoster(), renderPanel(false)), 14100);
    } else if (f.type === 'you' && to) world.planeTo(to.slug, f.text);
    else if (f.type === 'zap' && from) runZap(f.from, f.text);
    else if (f.type === 'jira' && from) world.pinCard(f.from, f.key || '');
    else if (f.type === 'status' && from) {
      if (f.status === 'blocked') { toast(`<i class="dot blocked"></i><b>${esc(first(from))}</b> needs you`, 'err', 9000); chime([880, 660]); }
      else if (f.status === 'idle' && f.prev === 'working') { toast(`<i class="dot idle"></i><b>${esc(first(from))}</b> finished`); chime([660, 880]); }
    }
  }
  booted = true;
  window.office.ready = true;
  $('#banner').classList.toggle('show', !s.hcOk || !!s.teamError);
  if (s.teamError) $('#banner').textContent = s.teamError; // the floor's team.json cannot be read: say so instead of an empty room
  else if (!s.hcOk) $('#banner').textContent = 'Herdr is not answering, so statuses may be stale. Is the Herdr app running?';
  renderStats(); renderRoster(); renderFeed(fresh); renderPanel(false);
}
// Another theme for the building: reload with it, once nobody is halfway through typing here.
let themeWant = '';
function themeChanged(id) {
  if (themeWant === id) return;
  themeWant = id;
  let wait = 0; try { wait = 15000 - (Date.now() - Number(sessionStorage.getItem('office.themeReload') || 0)); } catch {}
  if (wait > 0) { setTimeout(() => { themeWant = ''; if (state && state.theme && state.theme.effective === id) themeChanged(id); }, wait); return; } // never a reload loop
  const go = () => {
    const el = document.activeElement;
    if (el && /INPUT|TEXTAREA/.test(el.tagName) && el.value && el.value.trim()) { setTimeout(go, 4000); return; }
    try { sessionStorage.setItem('office.theme', themeWant); sessionStorage.setItem('office.themeReload', String(Date.now())); } catch {}
    location.reload();
  };
  go();
}
// The picker: owner only (not visitors from another building, not the Herdr view). On a computer it is a button in
// the top bar with its menu; on a phone it is a "Theme" row in the More sheet that opens the choices under it.
if (!window.__GUEST__ && !EMBED) {
  const items = [...THEMES.map((t) => ({ mode: 'fixed', theme: t.id, label: t.name })), { mode: 'daily', theme: '', label: 'Tema del día' }];
  const cur = () => (state && state.theme) || { mode: 'fixed', theme: THEME_ID, effective: THEME_ID };
  const nameOf = (id) => (THEMES.find((t) => t.id === id) || {}).name || '';
  const isOn = (x, c) => (x.mode === 'daily' ? c.mode === 'daily' : c.mode !== 'daily' && c.theme === x.theme);
  const noteOf = (x, c) => (x.mode === 'daily' ? (c.mode === 'daily' ? `today ${nameOf(c.effective)}` : 'changes every day') : isOn(x, c) ? '✓' : '');
  async function choose(x, done) {
    try {
      const r = await api('/api/theme', { mode: x.mode, theme: x.theme || THEME_ID });
      if (state) state.theme = r;
      done();
      if (r.effective !== THEME_ID) { toast(`Theme: <b>${esc(nameOf(r.effective) || r.effective)}</b> for every floor`); themeWant = ''; try { sessionStorage.removeItem('office.themeReload'); } catch {} themeChanged(r.effective); }
      else { toast(x.mode === 'daily' ? 'Tema del día: a different theme every day' : 'Theme kept'); }
    } catch (err) { toast(esc(err.message), 'err'); }
  }
  const css = document.createElement('style');
  css.textContent = '#theme-menu { min-width: 210px; } #theme-menu button small { color: var(--dim); font-size: 11.5px; } #theme-menu button.on span { font-weight: 600; }'
    + ' .pmenu > button.theme-opt { min-height: 46px; padding-left: 34px; font-size: 14.5px; } .pmenu > button.theme-opt.on span { font-weight: 600; color: var(--accent); }';
  document.head.append(css);
  if (!PHONE) {
    const tools = $('.tools'), btn = document.createElement('button'), menu = document.createElement('div');
    btn.type = 'button'; btn.id = 'btn-theme'; btn.title = 'The look of every floor of this building'; btn.textContent = 'Theme';
    menu.className = 'menu glass'; menu.id = 'theme-menu';
    tools.insertBefore(btn, $('#btn-more')); tools.append(menu);
    const paint = () => { const c = cur(); menu.innerHTML = items.map((x, i) => `<button type="button" data-i="${i}"${isOn(x, c) ? ' class="on"' : ''}><span>${esc(x.label)}</span><small>${esc(noteOf(x, c))}</small></button>`).join(''); };
    btn.onclick = (e) => { e.stopPropagation(); $('#more').classList.remove('open'); paint(); menu.style.left = `${btn.offsetLeft}px`; menu.style.right = 'auto'; menu.classList.toggle('open'); };
    addEventListener('click', (e) => { if (!e.target.closest('#theme-menu')) menu.classList.remove('open'); });
    menu.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) choose(items[Number(b.dataset.i)], () => { menu.classList.remove('open'); paint(); }); });
  } else { // phone.js builds the More sheet after this file runs: wait for it, then put the rows before "Switch office"
    const wait = (n = 0) => {
      const sheet = $('#sheet-more .pmenu'); if (!sheet) { if (n < 40) setTimeout(() => wait(n + 1), 300); return; }
      const head = document.createElement('button'); head.type = 'button'; head.id = 'btn-theme';
      const opts = items.map((x) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'theme-opt'; b.style.display = 'none'; b.onclick = () => choose(x, paint); return b; });
      let open = false;
      function paint() {
        const c = cur();
        head.innerHTML = `Theme<small>${esc(nameOf(c.effective || c.theme) || 'Oficina')}${c.mode === 'daily' ? ' · del día' : ''} ${open ? '⌄' : '›'}</small>`;
        opts.forEach((b, i) => { const x = items[i]; b.classList.toggle('on', isOn(x, c)); b.innerHTML = `<span>${esc(x.label)}</span><small>${esc(noteOf(x, c))}</small>`; b.style.display = open ? '' : 'none'; });
      }
      head.onclick = () => { open = !open; paint(); if (open) requestAnimationFrame(() => opts[opts.length - 1].scrollIntoView({ block: 'end', behavior: 'smooth' })); }; // after the rows are laid out: the choices sit under the fold otherwise
      const sw = [...sheet.children].find((x) => /Switch office/.test(x.textContent));
      for (const el of [head, ...opts]) sheet.insertBefore(el, sw || null);
      paint();
      $('#tabbar') && $('#tabbar').addEventListener('click', () => { if (open) { open = false; paint(); } }); // the menu comes back closed
    };
    wait();
  }
}

let stream = null;
document.addEventListener('visibilitychange', () => { if (!document.hidden && stream && stream.readyState === EventSource.CLOSED) connect(); }); // a phone drops the stream when it sleeps
function connect() {
  const es = stream = new EventSource(`/api/stream?token=${TOKEN}`);
  es.addEventListener('state', (e) => { $('#live').classList.add('on'); if (/Lost the local server/.test($('#banner').textContent)) $('#banner').classList.remove('show'); onState(JSON.parse(e.data)); });
  es.onerror = () => {
    $('#live').classList.remove('on');
    if (es.readyState === EventSource.CLOSED) {
      const say = (t) => { $('#banner').classList.add('show'); $('#banner').textContent = t; };
      fetch('/api/state', { headers: { 'x-office-token': TOKEN } }).then((r) => {
        if (r.status !== 401) return;
        if (window.__GUEST__) say('This building does not know who you are: visit it from your own office (zoom out to the city and tap it), once the two buildings have met.');
        else staleToken();
      }).catch(() => {});
      say('Lost the local server. Start it again and reload this page.');
    }
  };
}
connect();
setInterval(() => {
  $('#clock').textContent = new Date().toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}, 1000);
setInterval(() => { if (state) { renderRoster(); renderStats(); } }, 20000);

// ------------------------------------------------------------------ messaging
async function sendMessage(targets, text) {
  try {
    const { results } = await api('/api/send', { to: targets, text });
    for (const r of results) {
      const a = agentBy(r.name), n = a ? first(a) : r.name;
      if (!r.ok) toast(`Could not reach <b>${esc(n)}</b>: ${esc(r.error)}`, 'err', 8000);
      else toast(r.held ? `Guardado para <b>${esc(n)}</b>: espera una respuesta en el terminal y lo recibirá en cuanto la contestes.` : r.queued ? `Queued for <b>${esc(n)}</b>. It lands when their prompt is free.` : `Sent to <b>${esc(n)}</b>`);
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
  if (!PHONE) msg.focus(); // on a phone this would bring the keyboard back up
}
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); submitPanel(); });
msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !PHONE) { /* on a phone Enter is a new line; the Send button sends */ e.preventDefault(); submitPanel(); } });
msg.addEventListener('input', () => { msg.style.height = ''; msg.style.height = `${Math.min(140, msg.scrollHeight + 2)}px`; });
$('#chips').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const a = selected && agentBy(selected);
  if (b.id === 'stop') {
    if (b.dataset.sure) {
      try { await api('/api/interrupt', { to: a.herdrName }); toast(`Interrupted <b>${esc(first(a))}</b>`); } catch (err) { toast(esc(err.message), 'err'); }
    } else { b.dataset.sure = '1'; b.textContent = PHONE ? 'Tap again to stop their turn' : 'Click again to stop their current turn'; }
    return;
  }
  msg.value = b.dataset.q; msg.focus();
});
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; renderPanel(true); } });
$('#roster').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) select(c.dataset.slug === selected ? null : c.dataset.slug); });

// command bar: "@daniel …", "@lucia @marta …", "@all …"
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
$('#feed-list').addEventListener('click', (e) => {
  if (e.target.closest('a')) return; // links just open
  const li = e.target.closest('li.msg');
  if (!li) return;
  const id = li.dataset.id;
  if (openFeed.has(id)) openFeed.delete(id); else openFeed.add(id);
  li.classList.toggle('open');
});
$('#btn-watch').onclick = async (e) => { const b = e.currentTarget, on = !b.dataset.on; try { await api('/api/watchdog', { on }); b.dataset.on = on ? '1' : ''; b.textContent = `Watchdog: ${on ? (state && state.watchdog && !state.watchdog.running ? '⚠ not running' : 'on') : 'off'}`; toast(on ? '⚡ Watchdog on for this office' : 'Watchdog off for this office'); } catch (err) { toast(esc(err.message), 'err'); } };
$('#btn-feed').onclick = (e) => { e.currentTarget.classList.toggle('on'); $('#feed').classList.toggle('hidden'); };
// A new browser tab. From the Herdr terminal view this opens the real browser (office-tty hands new windows to it).
$('#btn-more').onclick = (e) => { e.stopPropagation(); $('#more').classList.toggle('open'); };
addEventListener('click', (e) => { if (!e.target.closest('#btn-light, #btn-sound, #btn-feed')) $('#more').classList.remove('open'); });
if (innerWidth <= 1100) { $('#btn-feed').classList.remove('on'); $('#feed').classList.add('hidden'); } // narrow views start with the feed tucked away
$('#btn-open').onclick = () => { window.open(`${location.origin}/`, '_blank', 'noopener'); };
if (sound) { $('#btn-sound').textContent = 'Sound: on'; $('#btn-sound').classList.add('on'); }
$('#btn-sound').onclick = (e) => { sound = !sound; try { localStorage.setItem('office.sound', sound ? '1' : '0'); } catch {} e.currentTarget.textContent = `Sound: ${sound ? 'on' : 'off'}`; e.currentTarget.classList.toggle('on', sound); chime([660, 880]); };
$('#btn-light').onclick = (e) => {
  lightMode = { auto: 'day', day: 'night', night: 'auto' }[lightMode];
  e.currentTarget.textContent = `Light: ${lightMode}`;
  world.setLight(lightMode);
};
addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else select(null); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || !state) return;
  if (e.key === '/') { e.preventDefault(); cmd.focus(); }
  else if (e.key === '0') { world.focus(null); select(null); }
  else if (e.key === 'b' || e.key === 'B') select('@board');
  else if (e.key === 't' || e.key === 'T') select('@trace');
  else if (/^[1-9]$/.test(e.key)) { const a = state.agents[Number(e.key) - 1]; if (a) select(a.slug); }
});
