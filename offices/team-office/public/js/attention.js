// What waits for you in the OTHER offices, shown in this one (the same file runs in the three office apps).
//   chip      one line under the top bar: who, what, which office. A tap takes you there and opens it.
//   arriving  /#foryou opens For you, /#p=<name> opens that person, /#go=<port>/<rest> hops to another office.
//   phone     More > Phone notifications subscribes this phone (hub.mjs sends them; sw.js shows them).
const root = document.documentElement;
if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const office = () => window.office || {};
  const PHONE = root.classList.contains('phone');
  const LABEL = { request: 'needs your answer', note: 'left you a message', draft: 'has a draft to check', stuck: 'is waiting for you' };
  const PORTS = new Set(['4317', '4319', '4320', '4321']);

  const css = document.createElement('style');
  css.textContent = `
#xoffice { position: fixed; top: calc(var(--bar, 48px) + 10px); left: 50%; transform: translateX(-50%); z-index: 12; max-width: min(92vw, 520px); display: none; align-items: center; gap: 8px; padding: 6px 6px 6px 13px; border-radius: 99px; border: 1px solid rgba(251, 191, 36, .5); background: var(--panel, #141824); color: var(--text, #e8eaf2); font: 500 13px/1.25 var(--sans, system-ui, sans-serif); box-shadow: 0 6px 22px rgba(0, 0, 0, .35); cursor: pointer; -webkit-tap-highlight-color: transparent; }
#xoffice.on { display: flex; }
#xoffice .d { width: 8px; height: 8px; border-radius: 50%; flex: none; }
#xoffice .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#xoffice .t small { opacity: .65; font-size: 12px; }
#xoffice em { font-style: normal; font-weight: 700; background: var(--needs, #fbbf24); color: #201600; border-radius: 99px; padding: 1px 7px; font-size: 11px; flex: none; }
#xoffice .x { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; opacity: .6; font-size: 16px; }
html.has-xoffice #toasts { top: calc(var(--bar, 48px) + 58px); }
body.embed #xoffice { display: none !important; }
#sheet-offices a b.n { margin-left: auto; margin-right: 10px; min-width: 20px; text-align: center; padding: 1px 7px; border-radius: 99px; background: var(--needs, #fbbf24); color: #201600; font-size: 12px; font-weight: 700; }
.pmenu .pnote { padding: 0 18px 14px; font-size: 13px; line-height: 1.45; opacity: .75; }`;
  document.head.append(css);

  // ---------------------------------------------------------------- the chip
  const chip = document.createElement('div');
  chip.id = 'xoffice'; chip.setAttribute('role', 'button'); chip.tabIndex = 0;
  document.body.append(chip);
  let hidden = new Set(); try { hidden = new Set(JSON.parse(sessionStorage.getItem('xoffice-hidden') || '[]')); } catch { /* private window */ }
  let others = [], seen = null, sig = '';
  const urlOf = (x) => `${location.protocol}//${location.hostname}:${x.port}/#${x.kind === 'stuck' ? `p=${encodeURIComponent(x.from)}` : 'foryou'}`;
  function paint() {
    const x = others[0];
    chip.classList.toggle('on', !!x); root.classList.toggle('has-xoffice', !!x);
    if (!x) return;
    const html = `<i class="d" style="background:${esc(x.color)}"></i><span class="t"><b>${esc(x.who)}</b> ${LABEL[x.kind] || 'needs you'} <small>· ${esc(x.office)}</small></span>${others.length > 1 ? `<em>+${others.length - 1}</em>` : ''}<span class="x" title="Hide">×</span>`;
    if (html !== sig) { sig = html; chip.innerHTML = html; }
  }
  chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); } }); // a button for the keyboard too
  chip.addEventListener('click', (e) => {
    if (e.target.closest('.x')) { for (const x of others) hidden.add(x.id); try { sessionStorage.setItem('xoffice-hidden', JSON.stringify([...hidden].slice(-200))); } catch { /* fine */ } others = []; return paint(); }
    if (others[0]) location.href = urlOf(others[0]);
  });
  async function poll() {
    const api = office().api; if (!api || document.hidden) return;
    let d; try { d = await api('/api/attention'); } catch { return; }
    const all = d.items || [];
    const listed = new Set(office().forYouKeys ? office().forYouKeys() : []); // already in this floor's For you (the Dev floor lists every floor's)
    others = all.filter((x) => x.port !== d.here && !hidden.has(x.id) && !listed.has(x.id));
    paint();
    for (const o of d.offices || []) { // the office switcher on the phone says how many wait in each
      const a = $(`#sheet-offices a[data-port="${o.port}"]`); if (!a) continue;
      let b = a.querySelector('b.n');
      if (!o.count) { if (b) b.remove(); continue; }
      if (!b) { b = document.createElement('b'); b.className = 'n'; a.insertBefore(b, a.querySelector('small')); }
      if (b.textContent !== String(o.count)) b.textContent = o.count;
    }
    if (seen && office().chime && others.some((x) => !seen.has(x.id))) office().chime([880, 660]);
    seen = new Set(all.map((x) => x.id));
  }
  setInterval(poll, 5000); setTimeout(poll, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // ---------------------------------------------------------------- arriving from a chip or a notification
  function arrive(h) {
    if (!h) return;
    if (h.startsWith('go=')) { const [port, ...rest] = h.slice(3).split('/'); if (PORTS.has(port)) location.replace(`${location.protocol}//${location.hostname}:${port}/#${rest.join('/')}`); return; }
    let tries = 0;
    const run = () => {
      if (!office().ready && tries++ < 80) return setTimeout(run, 250);
      history.replaceState(null, '', location.pathname + location.search);
      if (h === 'foryou') {
        const up = ($('#inbox') && $('#inbox').classList.contains('show')) || root.classList.contains('reqs-open');
        if (up) return;
        const b = PHONE ? $('#tabbar [data-t=you]') : $('#btn-reqs');
        if (b) b.click();
      } else if (h.startsWith('p=')) {
        const name = decodeURIComponent(h.slice(2)), a = (office().agents ? office().agents() : []).find((x) => x.herdrName === name);
        if (a && office().select) office().select(a.slug);
      }
    };
    setTimeout(run, PHONE ? 600 : 300); // let the bottom bar and the inbox finish building
  }
  addEventListener('hashchange', () => arrive(location.hash.slice(1)));
  arrive(location.hash.slice(1));
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && typeof e.data.hash === 'string') arrive(e.data.hash); });

  // ---------------------------------------------------------------- phone notifications
  if (PHONE && !window.__GUEST__) pushRow(); // a visitor's phone subscribes in its own building
  async function pushRow(n = 0) {
    const menu = $('#sheet-more .pmenu');
    if (!menu) { if (n < 40) setTimeout(() => pushRow(n + 1), 300); return; }
    const row = document.createElement('button'); row.type = 'button';
    const note = document.createElement('div'); note.className = 'pnote'; note.hidden = true;
    const first = menu.firstElementChild; menu.insertBefore(row, first ? first.nextSibling : null); row.after(note);
    const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const say = (t) => { note.textContent = t; note.hidden = !t; };
    let sub = null, busy = false;
    const label = () => { row.innerHTML = `Phone notifications<small>${busy ? '…' : sub ? 'on' : 'off'}</small>`; };
    label();
    if (can) { try { const reg = await navigator.serviceWorker.register('/sw.js'); sub = await reg.pushManager.getSubscription(); label(); } catch { /* shown when pressed */ } }
    const bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    row.onclick = async () => {
      if (busy) return;
      if (!can) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
        return say(ios ? 'On iPhone this works from the home screen. In Safari tap Share, then "Add to Home Screen". Open Omniloy HQ from its new icon and switch this on there.' : 'This browser cannot receive notifications.');
      }
      busy = true; label();
      try {
        if (sub) {
          const endpoint = sub.endpoint; await sub.unsubscribe(); sub = null;
          await office().api('/api/push/unsubscribe', { endpoint });
          say('Off. This phone will not be notified.');
        } else {
          const perm = await Notification.requestPermission(); // first thing after the tap: iOS only asks from a tap
          if (perm !== 'granted') { say('Notifications are blocked for this app. Allow them in the phone settings, under Notifications.'); }
          else {
            const reg = await navigator.serviceWorker.ready, { key } = await office().api('/api/push/key');
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) });
            const r = await office().api('/api/push/subscribe', { sub: sub.toJSON() });
            say(r.status >= 200 && r.status < 300 ? 'On. A test notification is on its way. You will hear from every office, also with the phone locked.' : `Switched on, but the test was not accepted (code ${r.status || 'none'}).`);
          }
        }
      } catch (err) { say(`That did not work: ${err.message}`); }
      busy = false; label();
    };
  }
}
