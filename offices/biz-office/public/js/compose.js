// One message bar everywhere a message goes to an agent: attach on the left, the text, and on the right the
// microphone, which becomes Send as soon as there is something to send.
// It dresses the boxes the other files already draw (chat, person panel, command bar, answers to requests, questions
// about a draft) and leaves their sending code alone: pictures are uploaded to this computer (hub.mjs, /api/upload)
// and, at the moment of sending, their file paths are added to the text, so the agent can open them.
// The same file runs in the three office apps.
if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const FIELDS = '#chat form textarea, #msg, #cmd-input, .ask .acts input, #inbox .acts input, #requests .acts input, #dr-q';
  const SEND = '[data-send], .send, .go, #dr-ask, button[type=submit]';
  const MARK = / ?\[attached image, open this file: [^\]]+\]/g, HAS = /\[attached image, open this file: /;
  const PHONE = document.documentElement.classList.contains('phone');
  const office = () => window.office || {};
  const say = (t) => { if (office().toast) office().toast(t, 'err', 6000); };
  const I = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const CLIP = I('<path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L10 17a1.8 1.8 0 0 1-2.5-2.5L15 7"/>');
  const MIC = I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>');
  const ARROW = I('<path d="M12 19V5M6 11l6-6 6 6"/>');

  const css = document.createElement('style');
  css.textContent = `
.cx { flex-wrap: wrap !important; align-items: flex-end !important; gap: 6px !important; }
.cx > .cx-f { min-height: 40px; box-sizing: border-box; min-width: 0; flex: 1 1 0 !important; }
.cx > button.cx-b { width: 40px !important; height: 40px !important; min-width: 40px; padding: 0 !important; margin: 0 !important; border-radius: 50% !important; border: 0 !important; display: grid !important; place-items: center; flex: none !important; background: rgba(255, 255, 255, .09) !important; color: inherit !important; cursor: pointer; font-size: 0 !important; }
.cx > button.cx-send { background: var(--accent, #6c7cff) !important; color: var(--on-accent, #fff) !important; }
.cx > button.cx-b:disabled { opacity: .45; }
.cx:not(.cx-has) > button.cx-send { display: none !important; }
.cx.cx-has > button.cx-mic:not(.rec):not(.busy) { display: none !important; }
.cx > button.cx-mic.rec { background: #ef4444 !important; color: #fff !important; animation: cx-pulse 1.2s ease-in-out infinite; }
.cx > button.cx-mic.busy { opacity: .5; }
.cx-b svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.cx-thumbs { flex: 0 0 100%; order: -1; display: flex; flex-wrap: wrap; gap: 6px; }
.cx-thumbs:empty { display: none; }
.cx-t { position: relative; width: 56px; height: 56px; border-radius: 10px; overflow: hidden; background: rgba(255, 255, 255, .08); border: 1px solid var(--line, rgba(255,255,255,.16)); }
.cx-t img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cx-t.up img { opacity: .4; }
.cx-t.up::after { content: ''; position: absolute; inset: 0; margin: auto; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; border-top-color: transparent; animation: cx-spin .8s linear infinite; }
.cx-thumbs .cx-t button { position: absolute; top: 2px; right: 2px; width: 20px !important; height: 20px !important; min-width: 0; padding: 0 !important; margin: 0; border: 0 !important; border-radius: 50% !important; background: rgba(0, 0, 0, .7) !important; color: #fff !important; font: 600 13px/20px system-ui, sans-serif !important; text-align: center; cursor: pointer; }
@keyframes cx-spin { to { transform: rotate(360deg); } }
@keyframes cx-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, .6); } 50% { box-shadow: 0 0 0 9px rgba(239, 68, 68, 0); } }
.cx-shot { display: inline-block; vertical-align: top; margin: 3px 4px 3px 0; }
.cx-shot img { display: block; max-width: 160px; max-height: 160px; border-radius: 10px; }
html.phone .cx > .cx-f { font-size: 16px; }
`;
  document.head.append(css);

  // ---- what is attached, per box (it survives the lists being drawn again)
  const held = new Map();
  const keyOf = (f) => (f.id ? `#${f.id}` : f.closest('#chat') ? `chat:${f.closest('#chat').dataset.who || ''}` : `ask:${(f.closest('[data-id]') || {}).dataset?.id || ''}`);
  const listOf = (f) => held.get(keyOf(f)) || [];
  const fields = () => [...document.querySelectorAll('.cx-f')];
  const clean = (s) => s.replace(MARK, '');

  function paint(f) {
    const p = f.parentElement, list = listOf(f), th = p.querySelector(':scope > .cx-thumbs');
    if (th) { const html = list.map((x) => `<span class="cx-t ${x.path ? '' : 'up'}"><img src="${x.url}" alt=""><button type="button" data-rm="${x.id}" aria-label="Remove">×</button></span>`).join(''); if (th.dataset.h !== html) { th.dataset.h = html; th.innerHTML = html; } }
    p.classList.toggle('cx-has', !!(f.value.trim() || list.length));
  }
  const paintKey = (key) => fields().forEach((f) => { if (keyOf(f) === key) paint(f); });

  function dress(f) {
    const p = f.parentElement, send = p && p.querySelector(SEND);
    if (!send || f.classList.contains('cx-f')) return;
    p.querySelectorAll(':scope > .cx-att, :scope > .cx-mic, :scope > .cx-thumbs').forEach((x) => x.remove());
    f.classList.add('cx-f'); p.classList.add('cx');
    const b = (cls, label, svg) => { const x = document.createElement('button'); x.type = 'button'; x.className = `cx-b ${cls}`; x.title = label; x.setAttribute('aria-label', label); x.innerHTML = svg; return x; };
    f.before(b('cx-att', 'Attach an image', CLIP));
    send.before(b('cx-mic', 'Dictate', MIC));
    send.classList.add('cx-b', 'cx-send'); send.innerHTML = ARROW; send.title = 'Send'; send.setAttribute('aria-label', 'Send');
    const th = document.createElement('div'); th.className = 'cx-thumbs'; p.prepend(th);
    paint(f);
  }
  let queued = false;
  const sweep = () => { queued = false; document.querySelectorAll(FIELDS).forEach(dress); };
  new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(sweep); } }).observe(document.body, { childList: true, subtree: true });
  sweep();
  setInterval(() => fields().forEach(paint), 400); // the other files empty or fill the boxes without telling anyone
  document.addEventListener('input', (e) => { if (e.target.classList && e.target.classList.contains('cx-f')) paint(e.target); }, true);

  // ---- pictures
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'image/*'; picker.multiple = true; picker.hidden = true;
  document.body.append(picker);
  let pickFor = '';
  picker.onchange = () => { for (const file of picker.files) add(pickFor, file); picker.value = ''; };

  async function shrink(file) { // phone photos are huge; 2000 px is plenty to read a screen or a document
    const plain = /^image\/(png|jpeg|webp|gif)$/.test(file.type);
    try {
      const bmp = await createImageBitmap(file), big = Math.max(bmp.width, bmp.height);
      if (plain && big <= 2000 && file.size < 3e6) return file;
      if (file.type === 'image/gif') return file;
      const k = Math.min(1, 2000 / big), c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((ok) => c.toBlob((b) => ok(b || file), 'image/jpeg', 0.86));
    } catch { return file; }
  }
  let seq = 0;
  async function add(key, file) {
    if (!file || !/^image\//.test(file.type || '')) return say('Only images can be attached.');
    const x = { id: ++seq, url: URL.createObjectURL(file), path: '' };
    held.set(key, [...(held.get(key) || []), x]); paintKey(key);
    try {
      const blob = await shrink(file);
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'x-office-token': window.__TOKEN__, 'content-type': blob.type || 'image/jpeg' }, body: blob });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'The image could not be saved.');
      x.path = d.path;
    } catch (e) { held.set(key, (held.get(key) || []).filter((y) => y !== x)); say(e.message || 'The image could not be saved.'); }
    paintKey(key);
  }
  document.addEventListener('paste', (e) => {
    const f = e.target.closest && e.target.closest('.cx-f'), files = f && e.clipboardData ? [...e.clipboardData.files].filter((x) => /^image\//.test(x.type)) : [];
    if (files.length) { e.preventDefault(); files.forEach((x) => add(keyOf(f), x)); }
  }, true);

  // ---- sending: just before the box's own code reads the text, the paths go in
  function arm(e, f) {
    const key = keyOf(f), list = held.get(key) || [];
    if (list.some((x) => !x.path)) { e.preventDefault(); e.stopImmediatePropagation(); return say('The image is still uploading. Try again in a moment.'); }
    if (!list.length) return;
    f.value = clean(f.value).trim() + list.map((x) => ` [attached image, open this file: ${x.path}]`).join('');
    let n = 0;
    const look = () => { // sent: the box was emptied or drawn again. Not sent: take the paths back out, keep the pictures
      if (!f.isConnected || !HAS.test(f.value)) { held.delete(key); return paintKey(key); }
      if (++n < 5) return setTimeout(look, [0, 150, 600, 2000, 6000][n]);
      f.value = clean(f.value); paint(f);
    };
    setTimeout(look, 0);
  }
  const fieldOf = (el) => { const p = el.closest('.cx'); return p && p.querySelector(':scope > .cx-f'); };

  // ---- microphone: the office's own transcriber (voice.js) writes into the box
  let live = null;
  addEventListener('office-voice', (e) => { if (live) { live.classList.toggle('rec', e.detail === 'rec'); live.classList.toggle('busy', e.detail === 'busy'); if (e.detail === 'idle') live = null; } });
  function dictate(btn, f) {
    const v = office().voice;
    if (!v) return say('Voice is not available here.');
    if (!live && !(v.ready && v.ready())) return v.open(); // says what is missing and how to switch it on
    if (!live) live = btn;
    v.dictate((text, problem) => {
      if (text && f.isConnected) { f.value = (f.value ? `${f.value} ` : '') + text; f.dispatchEvent(new Event('input', { bubbles: true })); }
      if (problem) say(problem);
    });
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const rm = t.closest('.cx-thumbs [data-rm]'), att = t.closest('.cx-att'), mic = t.closest('.cx-mic'), send = t.closest('.cx-send');
    if (!rm && !att && !mic && !send) return;
    const f = fieldOf(t); if (!f) return;
    if (send) return arm(e, f);
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (rm) { const key = keyOf(f); held.set(key, (held.get(key) || []).filter((x) => String(x.id) !== rm.dataset.rm)); paintKey(key); }
    else if (att) { pickFor = keyOf(f); picker.click(); }
    else dictate(mic, f);
  }, true);
  document.addEventListener('keydown', (e) => {
    const f = e.target;
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !f.classList || !f.classList.contains('cx-f')) return;
    if (f.tagName === 'TEXTAREA' && PHONE) return; // there Enter is a new line
    arm(e, f);
  }, true);
  document.addEventListener('submit', (e) => { const f = e.target.querySelector && e.target.querySelector('.cx-f'); if (f) arm(e, f); }, true);

  window.compose = { // for the files that draw messages: the paths become the pictures again
    shots: (html) => html.replace(/ ?\[attached image, open this file: [^\]\s]*\/uploads\/(\d{4}-\d\d-\d\d\/[a-z0-9-]+\.[a-z]+)\]/g, (_m, rel) => `<a class="cx-shot" href="/api/upload/file?p=${rel}&token=${encodeURIComponent(window.__TOKEN__)}" target="_blank" rel="noopener"><img src="/api/upload/file?p=${rel}&token=${encodeURIComponent(window.__TOKEN__)}" alt="image" loading="lazy"></a>`),
  };
}
