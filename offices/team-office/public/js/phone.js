// The office on a phone (see phone.css). Nothing here talks to the server on its own except the board list,
// which reads the same local /api/cards the wall board uses. Everything else re-arranges what the page already has:
//   bottom bar   Office · Team · For you · Board · More, in thumb reach
//   sheets       a person, the inbox, a card, the feed: all come up from the bottom, one at a time
//   the room     one finger turns, two fingers move and pinch to zoom, a tap picks the nearest person (world.js)
// The same file runs in both office apps, so every element it uses is optional.
const root = document.documentElement;
if (root.classList.contains('phone')) start();

function start() {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const office = () => window.office || {};
  const click = (sel) => { const b = $(sel); if (b) b.click(); return !!b; };
  // The other offices run on this same machine, one port each: the server's list (floors.json). A visitor from
  // another building gets none (their own floors are not here).
  const OFFICES = (Array.isArray(window.__FLOORS__) ? window.__FLOORS__ : []).map((f) => [String(f.name), Number(f.port)]);
  const ICON = {
    office: '<path d="M3 10.5 12 4l9 6.5V20H3z"/><path d="M9.5 20v-6h5v6"/>',
    team: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17.2" cy="9.5" r="2.4"/><path d="M17 14.6c2.3.2 3.7 1.7 4.2 4.4"/>',
    you: '<path d="M4 6.5h16v11H9l-5 3z"/><path d="M8 10.5h8M8 13.5h5"/>',
    board: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.2 4.5v15M14.8 4.5v15"/>',
    floors: '<path d="M12 3.5 21 8l-9 4.5L3 8z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16l9 4.5 9-4.5"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  };
  const has = { board: !!$('#btn-board'), inbox: () => !!$('#btn-reqs') };

  // ---------------------------------------------------------------- bottom bar
  const bar = document.createElement('nav');
  bar.id = 'tabbar';
  const tabBtn = (id, label) => `<button type="button" data-t="${id}"><svg viewBox="0 0 24 24">${ICON[id]}</svg>${label}<i></i></button>`;
  bar.innerHTML = tabBtn('office', 'Office') + tabBtn('team', 'Team') + tabBtn('you', 'For you') + (has.board ? tabBtn('board', 'Board') : '') + tabBtn('floors', 'Floors') + tabBtn('more', 'More');
  document.body.append(bar);

  // ---------------------------------------------------------------- the sheets this file owns
  const mk = (id, html) => { const el = document.createElement('section'); el.id = id; el.className = 'psheet glass'; el.innerHTML = html; document.body.append(el); return el; };
  const sheets = {
    team: mk('sheet-team', '<h3>Team<small id="team-sub"></small></h3><div class="scroll"></div>'),
    board: mk('sheet-board', '<h3>Board<small id="board-sub"></small></h3><div class="pchips"></div><div class="scroll"></div>'),
    more: mk('sheet-more', '<div class="scroll"><div class="pmenu"></div></div>'),
    offices: mk('sheet-offices', '<h3>Offices</h3><div class="scroll"><div class="pmenu"></div></div>'),
  };
  // Team: the roster and the "message several people" box move in here.
  { const sc = sheets.team.querySelector('.scroll'), r = $('#roster'), c = $('#cmd'); if (r) sc.append(r); if (c) sheets.team.append(c); }
  // More: the page's own menu buttons keep their handlers; every other top-bar button gets a row that presses it.
  {
    const menu = sheets.more.querySelector('.pmenu');
    for (const id of ['btn-sound', 'btn-light', 'btn-watch', 'btn-feed']) { const b = document.getElementById(id); if (b) menu.append(b); }
    const skip = new Set(['btn-home', 'btn-board', 'btn-more', 'btn-reqs', 'btn-open', 'btn-drafts']);
    const extra = () => [...document.querySelectorAll('.tools > button')].filter((b) => b.id && !skip.has(b.id) && getComputedStyle(b).display !== 'none' || b.id === 'btn-trace' || b.id === 'btn-clients');
    for (const b of extra()) { const row = document.createElement('button'); row.type = 'button'; row.innerHTML = `${esc(b.textContent.trim())}<small>›</small>`; row.onclick = () => { open(null); b.click(); }; menu.append(row); }
    if (OFFICES.length > 1) { const sw = document.createElement('button'); sw.type = 'button'; sw.innerHTML = 'Switch office<small>›</small>'; sw.onclick = () => open('offices'); menu.append(sw); }
    const fb = $('#btn-feed'); if (fb) fb.addEventListener('click', () => { if (!fb.closest('.psheet') || !$('#feed') || !$('#feed').classList.contains('hidden')) open(null); }); // opening the feed closes this menu; closing it must not close what replaced it
  }
  sheets.offices.querySelector('.pmenu').innerHTML = OFFICES.map(([name, port]) => {
    const here = String(port) === location.port;
    return `<a class="${here ? 'here' : ''}" data-port="${port}" href="${location.protocol}//${location.hostname}:${port}/">${esc(name)}<small>${here ? 'you are here' : '›'}</small></a>`;
  }).join('');
  const brand = $('.brand'); if (brand) brand.addEventListener('click', () => open(mine === 'offices' ? null : 'offices'));

  // ---------------------------------------------------------------- one sheet at a time
  let mine = null; // which of this file's sheets is up
  const el = { panel: $('#panel'), inbox: () => $('#inbox'), cards: $('#cards'), feed: $('#feed') };
  const isUp = {
    person: () => !!el.panel && el.panel.classList.contains('open'),
    inbox: () => !!el.inbox() && el.inbox().classList.contains('show'),
    card: () => !!el.cards && el.cards.classList.contains('show'),
    feed: () => !!el.feed && !el.feed.classList.contains('hidden'),
    reqs: () => root.classList.contains('reqs-open'), // offices without the For you panel list their requests in #requests
  };
  const shut = {
    person: () => office().select && office().select(null),
    inbox: () => { const x = el.inbox() && el.inbox().querySelector('[data-close]'); if (x) x.click(); },
    card: () => office().closeCard && office().closeCard(),
    feed: () => click('#btn-feed'),
    reqs: () => root.classList.remove('reqs-open'),
  };
  function open(name) { // one of this file's sheets, or null for none
    mine = name;
    for (const [k, s] of Object.entries(sheets)) s.classList.toggle('on', k === name);
    if (name) for (const k of Object.keys(isUp)) if (isUp[k]() && !(k === 'card' && name === 'board')) shut[k]();
    if (name === 'board') loadBoard(); else if (!isUp.card()) clearInterval(boardTimer);
    sync();
  }
  let was = { person: false, inbox: false, card: false, feed: false, reqs: false }, busy = false;
  function sync() {
    if (busy) return; busy = true;
    const now = Object.fromEntries(Object.keys(isUp).map((k) => [k, isUp[k]()]));
    const opened = Object.keys(now).find((k) => now[k] && !was[k]);
    if (opened) { // something the page opened by itself (a tap on a desk, a toast): close whatever else is up
      if (mine && !(opened === 'card' && mine === 'board')) { mine = null; Object.values(sheets).forEach((s) => s.classList.remove('on')); }
      for (const k of Object.keys(now)) if (k !== opened && now[k] && !(opened === 'card' && k === 'person')) { shut[k](); now[k] = isUp[k](); }
    }
    was = now;
    if (el.panel && !now.person && el.panel.classList.contains('full')) el.panel.classList.remove('full'); // only when it changes: writing a class always wakes the observer
    const active = now.inbox || now.reqs ? 'you' : now.card || mine === 'board' ? 'board' : now.person || mine === 'team' ? 'team' : now.feed || mine === 'more' || mine === 'offices' ? 'more' : 'office';
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === active));
    // The room: leave it centred in what the person sheet does not cover; stop drawing it when nothing of it shows.
    const w = office().world, half = now.person && !el.panel.classList.contains('full') && !root.classList.contains('typing') && innerHeight > innerWidth;
    const chat = root.classList.contains('chat-on') && $('#chat'); // the chat sheet leaves a strip of the room above it
    if (w && w.setBottomInset) w.setBottomInset(chat && !root.classList.contains('typing') && innerHeight > innerWidth ? chat.offsetHeight + bar.offsetHeight : half ? el.panel.offsetHeight + bar.offsetHeight : 0);
    if (w && w.setPaused) w.setPaused((now.person && el.panel.classList.contains('full') && !chat) || root.classList.contains('typing'));
    busy = false;
  }
  const watch = new MutationObserver(sync);
  const observe = (n) => n && watch.observe(n, { attributes: true, attributeFilter: ['class'] });
  [el.panel, el.cards, el.feed].forEach(observe);
  const waitInbox = setInterval(() => { if (el.inbox()) { clearInterval(waitInbox); observe(el.inbox()); observe($('#btn-reqs')); badge(); } }, 300);
  function badge() { // the For you count is the one the page already keeps; Team shows who needs an answer
    const set = (b, n) => { if (!b) return; const i = b.querySelector('i'); if (i.textContent !== n) i.textContent = n; b.classList.toggle('has', !!n); };
    const src = $('#btn-reqs b'), need = $('#stat-need b'), sub = $('#team-sub'), s = office().state && office().state();
    set(bar.querySelector('[data-t=you]'), src ? src.textContent.trim() : String(document.querySelectorAll('#requests.show .rq').length || ''));
    set(bar.querySelector('[data-t=team]'), need ? need.textContent.trim() : '');
    if (sub && s) { const t = `${s.agents.filter((a) => a.status === 'working').length} of ${s.agents.length} working`; if (sub.textContent !== t) sub.textContent = t; }
  }
  setInterval(badge, 1000);

  let inboxWasUp = false;
  addEventListener('pointerdown', (e) => { if (e.target.closest('#tabbar')) inboxWasUp = isUp.inbox(); }, true); // the page closes the inbox on any outside press
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const t = b.dataset.t;
    if (office().chat && office().chat.isOpen()) office().chat.close(); // the chat is a sheet like the others: one at a time
    if (t !== 'floors' && office().floors && office().floors.hide && document.querySelector('#floors.on')) office().floors.hide(); // the building covers the room: any other tab leaves it first
    if (t === 'office') { open(null); for (const k of Object.keys(isUp)) if (isUp[k]()) shut[k](); click('#btn-home'); }
    else if (t === 'you' && !has.inbox()) { // no For you panel in this office: its list of requests comes up as the sheet
      const box = $('#requests'), on = !isUp.reqs();
      open(null);
      if (on && !(box && box.classList.contains('show'))) { if (office().toast) office().toast('Nothing is waiting for you.'); else if (box) { box.textContent = 'Nothing is waiting for you.'; } }
      else root.classList.toggle('reqs-open', on);
      sync();
    }
    else if (t === 'you') { if (inboxWasUp) return sync(); open(null); if (!isUp.inbox()) click('#btn-reqs'); }
    else if (t === 'board' && !office().boardSets) { open(null); for (const k of Object.keys(isUp)) if (isUp[k]()) shut[k](); click('#btn-board'); } // no card list here: go and look at the wall
    else if (t === 'floors') { // the whole building: every floor, who is working, and the way to the others
      open(null); for (const k of Object.keys(isUp)) if (isUp[k]()) shut[k]();
      if (office().floors && office().floors.show) office().floors.show(); else open('offices');
    }
    else if (t === 'team') { if (isUp.person()) { shut.person(); open('team'); } else open(mine === 'team' ? null : 'team'); }
    else open(mine === t ? null : t);
  });
  // Choosing someone in the list closes the list; a tap on the room closes this file's sheets.
  { const r = $('#roster'); if (r) r.addEventListener('click', (e) => { if (e.target.closest('.card')) open(null); }); }
  { const sc = $('#scene'); if (sc) sc.addEventListener('pointerdown', () => { if (mine) open(null); }); }

  // ---------------------------------------------------------------- board: the wall is unreadable at this size, so the same cards come as a list
  let boardData = null, boardFilter = 'open', boardTimer = 0;
  const RANK = { caught: 0, idle: 1, waiting: 2, working: 3 }, WORD = { caught: '⚡ stopped', idle: 'stopped', waiting: 'waiting', working: 'working' };
  async function loadBoard() {
    clearInterval(boardTimer); boardTimer = setInterval(() => { if (mine === 'board') fetchBoard(); }, 30000);
    paintBoard(); await fetchBoard();
  }
  async function fetchBoard() { try { boardData = await office().api('/api/cards'); } catch (err) { if (!boardData) sheets.board.querySelector('.scroll').innerHTML = `<div class="pempty">${esc(err.message)}</div>`; return; } paintBoard(); }
  function paintBoard() {
    const o = office(), body = sheets.board.querySelector('.scroll'), chips = sheets.board.querySelector('.pchips');
    if (!boardData || !o.boardSets) { body.innerHTML = '<div class="pempty">Loading…</div>'; return; }
    const { sets, st } = o.boardSets(boardData);
    if (!sets[boardFilter]) boardFilter = 'open';
    chips.innerHTML = Object.entries(sets).map(([id, [label, l]]) => `<button type="button" data-f="${id}" class="${id === boardFilter ? 'on' : ''}">${esc(label)}<b>${l.length}</b></button>`).join('');
    const done = ['today', 'week'].includes(boardFilter), list = [...sets[boardFilter][1]];
    if (!done) list.sort((a, b) => (RANK[st[a.key]] ?? 9) - (RANK[st[b.key]] ?? 9));
    $('#board-sub').textContent = done ? '' : 'stopped first';
    body.innerHTML = list.length ? list.map((c) => {
      const s = done ? 'done' : st[c.key] || 'idle', who = c.owner ? o.personName(c.owner) : '';
      const sub = done ? [who, c.status].filter(Boolean).join(' · ') : `${who}${c.waiting ? ` · waiting for ${c.waiting}` : ` · ${WORD[s]}`}`;
      const age = !done && (c.waiting ? c.waitingSince || c.since : c.since);
      return `<button type="button" class="prow2 ${s}" data-key="${esc(c.key)}"><i></i><span>${esc(c.title || c.summary || c.key)}</span><em>${age ? esc(o.agoOf(age)) : ''}</em><small><b>${esc(c.key)}</b>${esc(sub)}</small></button>`;
    }).join('') : '<div class="pempty">No cards here.</div>';
  }
  sheets.board.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { boardFilter = f.dataset.f; return paintBoard(); }
    const r = e.target.closest('[data-key]'); if (r && office().openCard) office().openCard(r.dataset.key);
  });

  // ---------------------------------------------------------------- drag a sheet by its top edge: down closes, up opens a person fully
  const dragTargets = () => [root.classList.contains('chat-on') ? $('#chat') : null, el.panel, el.inbox(), el.cards, el.feed, isUp.reqs() ? $('#requests') : null, ...Object.values(sheets)].filter(Boolean);
  let drag = null;
  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0], s = dragTargets().find((x) => x.contains(e.target));
    if (!s) return;
    const top = s.getBoundingClientRect().top, scroller = e.target.closest('.pbody, .list, .body, .scroll, ol, pre, #asks');
    const onEdge = t.clientY - top < 56 && !e.target.closest('input, textarea');
    if (!onEdge && !(scroller && scroller.scrollTop <= 0)) return; // from the content, only when it is already at its top
    drag = { s, y: t.clientY, x: t.clientX, dy: 0, onEdge, moved: false, t: Date.now(), h: s.offsetHeight };
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!drag) return;
    const t = e.touches[0], dy = t.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dy) < 8) return;
      if (Math.abs(t.clientX - drag.x) > Math.abs(dy) || (!drag.onEdge && dy < 0)) { drag = null; return; } // sideways, or scrolling the content up
      drag.moved = true; drag.s.classList.add('dragging');
    }
    drag.dy = dy;
    if (e.cancelable) e.preventDefault();
    if (drag.s.id === 'chat') { drag.s.style.height = `min(var(--fullh), ${Math.max(60, drag.h - dy)}px)`; return; } // the chat changes size under the finger: taller, shorter, or all the way down to close
    drag.s.style.transform = `translateY(${Math.max(drag.s === el.panel && !el.panel.classList.contains('full') ? -40 : 0, dy)}px)`;
  }, { passive: false });
  const drop = () => {
    if (!drag) return;
    const drag0 = drag, { s, dy, moved, onEdge, t } = drag; drag = null;
    s.classList.remove('dragging'); s.style.transform = '';
    const isPerson = s === el.panel, full = isPerson && s.classList.contains('full');
    if (s.id === 'chat') {
      s.style.height = '';
      if (!moved) return;
      const min = innerHeight * 0.24, h = drag0.h - dy;
      if (h < min - 50) return office().chat.close();
      const f = Math.min(0.95, Math.max(min, h) / innerHeight);
      root.style.setProperty('--chat-h', `${(f * 100).toFixed(1)}dvh`);
      try { localStorage.setItem('office.chat.h', f.toFixed(3)); } catch { /* it still holds until the page reloads */ }
      return sync();
    }
    if (!moved) { if (isPerson && onEdge && Date.now() - t < 400 && lastTouchOnHandle) { s.classList.toggle('full'); sync(); } return; }
    if (isPerson && dy < -30) { s.classList.add('full'); return sync(); }
    if (dy > 70) {
      if (full) { s.classList.remove('full'); return sync(); }
      if (s.id === 'chat') office().chat.close(); else if (isPerson) shut.person(); else if (s === el.inbox()) shut.inbox(); else if (s === el.cards) shut.card(); else if (s === el.feed) shut.feed(); else if (s.id === 'requests') { shut.reqs(); sync(); } else open(null);
    }
  };
  let lastTouchOnHandle = false;
  addEventListener('touchstart', (e) => { const s = el.panel; lastTouchOnHandle = !!s && s.contains(e.target) && e.touches[0].clientY - s.getBoundingClientRect().top < 20; }, { passive: true });
  addEventListener('touchend', drop); addEventListener('touchcancel', drop);

  // ---------------------------------------------------------------- the keyboard
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--kb', `${Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop))}px`);
  };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
  let typingOff = 0;
  addEventListener('focusin', (e) => { if (e.target.matches('input, textarea')) { clearTimeout(typingOff); root.classList.add('typing'); fit(); sync(); } });
  addEventListener('focusout', () => { clearTimeout(typingOff); typingOff = setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input, textarea')) { root.classList.remove('typing'); scrollTo(0, 0); sync(); } }, 120); });
  // The page must never be pinched or scrolled as a whole: only the room and the sheets move.
  for (const ev of ['gesturestart', 'gesturechange']) addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  addEventListener('resize', sync);
  addEventListener('office-chat', () => { if (root.classList.contains('chat-on') && mine) open(null); else sync(); }); // a chat opened from More (the superadmin) is the sheet now: More goes addEventListener('orientationchange', () => setTimeout(sync, 300));
  sync(); badge();
}
