// Skills de la planta: every skill the agents have, and the few the owner marks as very relevant for this floor.
// Saving writes <team dir>/skill-focus.json and the "Skills destacadas" section of the floor's PROTOCOL.md (server.mjs,
// skills.mjs); "Avisar al equipo ahora" also queues a short note to each person (team-deliver). Team office only.
if (!new URLSearchParams(location.search).has('embed') && !window.__GUEST__) start();

function start() {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = document.documentElement.classList.contains('phone');
  const MAX = 15, NOTE = 200;
  const api = (p, b) => window.office.api(p, b);

  const css = document.createElement('style');
  css.textContent = `
#skills { position: fixed; inset: 0; z-index: 30; display: none; background: rgba(5, 7, 14, .6); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); font-family: var(--sans, system-ui, sans-serif); color: var(--text, #e8eaf2); }
#skills.on { display: flex; align-items: center; justify-content: center; }
#skills .pp { width: min(720px, 100vw); height: min(88vh, 900px); display: flex; flex-direction: column; background: var(--panel, #141824); border: 1px solid var(--line, rgba(255,255,255,.1)); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
html.phone #skills .pp { width: 100vw; height: 100dvh; border-radius: 0; border: 0; padding-top: env(safe-area-inset-top, 0px); }
#skills header { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--line, rgba(255,255,255,.1)); }
#skills header h3 { flex: 1; min-width: 0; margin: 0; font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#skills header h3 small { font-weight: 400; opacity: .6; margin-left: 8px; font-size: 13px; }
#skills header button { flex: none; width: 40px; height: 40px; border: 0; border-radius: 12px; background: transparent; color: inherit; font-size: 20px; cursor: pointer; }
#skills header button:hover { background: rgba(255, 255, 255, .08); }
#skills .help { flex: none; margin: 0; padding: 10px 16px 0; font-size: 12.5px; line-height: 1.45; color: var(--muted, #8d97b0); }
#skills .bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 12px 16px; border-bottom: 1px solid var(--line, rgba(255,255,255,.07)); }
#skills .bar input[type=search] { flex: 1 1 220px; min-width: 0; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: rgba(255, 255, 255, .05); color: var(--text, #e8eaf2); font: 16px/1.3 var(--sans, system-ui, sans-serif); }
#skills .bar input[type=search]:focus, #skills .note:focus { outline: 2px solid var(--accent, #8ea2ff); outline-offset: -1px; }
#skills .tog { display: flex; align-items: center; gap: 7px; font-size: 13.5px; color: var(--muted, #aab3c9); cursor: pointer; white-space: nowrap; }
#skills .tog input { width: 17px; height: 17px; margin: 0; accent-color: var(--accent, #7c9cff); }
#skills .count { margin-left: auto; font-size: 12.5px; color: var(--muted, #8d97b0); white-space: nowrap; font-variant-numeric: tabular-nums; }
#skills .body { flex: 1; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 4px 0 16px; }
#skills .sk { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 0 8px; align-items: start; padding: 10px 16px 10px 10px; border-top: 1px solid var(--line, rgba(255,255,255,.06)); }
#skills .sk:first-child { border-top: 0; }
#skills .sk.on { background: rgba(124, 156, 255, .07); }
#skills .sk[hidden] { display: none; }
#skills .star { width: 34px; height: 34px; margin-top: -4px; border: 0; border-radius: 9px; background: transparent; color: var(--dim, #6b7489); font-size: 19px; line-height: 1; cursor: pointer; }
#skills .star:hover { background: rgba(255, 255, 255, .07); color: var(--text, #e8eaf2); }
#skills .sk.on .star { color: #fbbf24; }
#skills .tx { min-width: 0; cursor: pointer; }
#skills .nm { display: flex; align-items: center; gap: 8px; min-width: 0; }
#skills .nm b { font-size: 14.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#skills .nm em { flex: none; font-style: normal; font-size: 10.5px; font-weight: 600; letter-spacing: .03em; padding: 1px 7px; border-radius: 99px; background: rgba(52, 211, 153, .14); color: #6ee7b7; }
#skills .ds { margin-top: 2px; font-size: 12.5px; color: var(--muted, #8d97b0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#skills .note { grid-column: 2; margin-top: 8px; width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: rgba(255, 255, 255, .05); color: var(--text, #e8eaf2); font: 14px/1.35 var(--sans, system-ui, sans-serif); }
html.phone #skills .note { font-size: 16px; }
#skills .empty { padding: 40px 20px; text-align: center; color: var(--muted, #8d97b0); }
#skills footer { flex: none; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line, rgba(255,255,255,.1)); }
#skills footer .sp { flex: 1; }
#skills footer button { min-height: 44px; padding: 0 18px; border-radius: 11px; border: 0; background: var(--accent, #6c7cff); color: var(--on-accent, #fff); font: 600 14px var(--sans, system-ui, sans-serif); cursor: pointer; }
#skills footer button:disabled { opacity: .5; cursor: default; }
#skills footer .msg { flex: 1 1 100%; font-size: 13px; color: var(--muted, #aab3c9); }
#skills footer .msg:empty { display: none; }
#skills footer .msg.ok { color: #86efac; } #skills footer .msg.err { color: #fca5a5; }
body.embed #skills { display: none !important; }`;
  document.head.append(css);

  const el = document.createElement('div');
  el.id = 'skills';
  el.innerHTML = `<div class="pp" role="dialog" aria-label="Skills de la planta"><header><h3>Skills de la planta</h3><button type="button" class="x" title="Cerrar">✕</button></header>
    <p class="help">Marca las skills especialmente importantes en esta planta: sus agentes las usarán siempre que la tarea encaje. Las demás siguen disponibles como siempre; destacar no oculta ni limita ninguna.</p>
    <div class="bar"><input type="search" placeholder="Buscar por nombre o descripción" autocomplete="off" enterkeyhint="search" aria-label="Buscar skills">
      <label class="tog"><input type="checkbox" class="only"> Solo destacadas</label><span class="count"></span></div>
    <div class="body"></div>
    <footer><label class="tog"><input type="checkbox" class="notify"> Avisar al equipo ahora</label><span class="sp"></span><button type="button" class="save">Guardar</button><div class="msg"></div></footer></div>`;
  document.body.append(el);
  const body = $('.body', el), title = $('h3', el), search = $('input[type=search]', el), only = $('.only', el), count = $('.count', el), msg = $('.msg', el), saveBtn = $('.save', el), notify = $('.notify', el);

  let data = null, sel = new Map(), dirty = false, warned = false, busy = false;
  const say = (t, kind) => { msg.textContent = t || ''; msg.className = `msg${kind ? ` ${kind}` : ''}`; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  async function open() {
    el.classList.add('on'); dirty = false; warned = false; say(''); notify.checked = false; only.checked = false; search.value = '';
    body.innerHTML = '<div class="empty">Leyendo las skills…</div>'; count.textContent = '';
    try { data = await api('/api/skills?refresh=1'); } catch (e) { body.innerHTML = `<div class="empty">No se pudieron leer las skills: ${esc(e.message)}</div>`; return; }
    title.innerHTML = `Skills de la planta${data.floor ? `<small>${esc(data.floor)}</small>` : ''}`;
    sel = new Map(data.focus.map((x) => [x.id, x.note || '']));
    render();
    if (!PHONE) search.focus();
  }
  function close() {
    if (dirty && !warned) { warned = true; return say('Hay cambios sin guardar. Pulsa otra vez para cerrar sin guardar.', 'err'); }
    el.classList.remove('on'); dirty = false; warned = false;
  }
  function render() {
    const known = new Set(data.catalogue.map((x) => x.id));
    const gone = [...sel.keys()].filter((id) => !known.has(id)).map((id) => ({ id, name: id, description: 'Ya no está instalada: se quitará al guardar.', codex: false, gone: true }));
    const list = [...data.catalogue.filter((x) => sel.has(x.id)).sort((a, b) => [...sel.keys()].indexOf(a.id) - [...sel.keys()].indexOf(b.id)), ...gone, ...data.catalogue.filter((x) => !sel.has(x.id))];
    if (!list.length) { body.innerHTML = '<div class="empty">No hay skills en ~/.claude/skills.</div>'; return paint(); }
    body.innerHTML = list.map((x) => `<div class="sk" data-id="${esc(x.id)}" data-q="${esc(norm(`${x.id} ${x.name} ${x.description}`))}"${x.gone ? ' data-gone="1"' : ''}>
      <button type="button" class="star" aria-pressed="false" title="Destacar en esta planta">☆</button>
      <div class="tx" title="${esc(x.description)}"><div class="nm"><b>${esc(x.name)}</b>${x.codex ? '<em title="También enlazada para Codex">Codex</em>' : ''}</div><div class="ds">${esc(x.description || 'Sin descripción')}</div></div>
      <input class="note" maxlength="${NOTE}" placeholder="Cuándo usarla (opcional)" aria-label="Nota para ${esc(x.name)}" hidden></div>`).join('');
    for (const row of body.querySelectorAll('.sk')) { const n = $('.note', row); n.value = sel.get(row.dataset.id) || ''; }
    paint();
  }
  function paint() { // marks, filter and counter, without rebuilding the rows (notes being typed stay)
    const q = norm(search.value).trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of body.querySelectorAll('.sk')) {
      const on = sel.has(row.dataset.id) && !row.dataset.gone, star = $('.star', row), note = $('.note', row);
      row.classList.toggle('on', on); star.textContent = on ? '★' : '☆'; star.setAttribute('aria-pressed', String(on)); note.hidden = !on;
      row.hidden = (only.checked && !on) || !q.every((w) => row.dataset.q.includes(w));
      if (!row.hidden) shown++;
    }
    const n = [...sel.keys()].filter((id) => data.catalogue.some((x) => x.id === id)).length;
    count.textContent = `${n}/${MAX} destacadas`;
    const empty = $('.empty.f', body); if (empty) empty.remove();
    if (!shown && data.catalogue.length) body.insertAdjacentHTML('beforeend', `<div class="empty f">${only.checked && !n ? 'Aún no hay skills destacadas en esta planta.' : 'Ninguna skill coincide con la búsqueda.'}</div>`);
  }
  function toggle(row) {
    const id = row.dataset.id;
    if (row.dataset.gone) { sel.delete(id); row.remove(); dirty = true; return paint(); }
    if (sel.has(id)) sel.delete(id);
    else { if (sel.size >= MAX) return say(`Como mucho ${MAX} skills destacadas: quita alguna antes.`, 'err'); sel.set(id, $('.note', row).value); }
    dirty = true; warned = false; say(''); paint();
    if (sel.has(id) && !PHONE) $('.note', row).focus();
  }
  async function save() {
    if (busy) return;
    busy = true; saveBtn.disabled = true; say('Guardando…');
    const known = new Set(data.catalogue.map((x) => x.id));
    const skills = [...sel].filter(([id]) => known.has(id)).map(([id, note]) => ({ id, note: note.trim() }));
    try {
      const r = await api('/api/skills/focus', { skills, notify: notify.checked });
      sel = new Map(r.focus.map((x) => [x.id, x.note || ''])); dirty = false; warned = false;
      for (const row of [...body.querySelectorAll('.sk[data-gone]')]) row.remove();
      paint();
      const told = r.told ? (r.told.failed ? ` · aviso enviado a ${r.told.ok}, falló con ${r.told.failed}` : ` · aviso en camino a ${r.told.ok}`) : '';
      say(`Guardado · se aplicará a ${r.people} ${r.people === 1 ? 'persona' : 'personas'}${told}`, 'ok');
      notify.checked = false;
    } catch (e) { say(e.message, 'err'); }
    busy = false; saveBtn.disabled = false;
  }

  search.addEventListener('input', paint);
  only.addEventListener('change', paint);
  body.addEventListener('click', (e) => {
    const row = e.target.closest('.sk'); if (!row || e.target.closest('.note')) return;
    if (e.target.closest('.star, .tx')) toggle(row);
  });
  body.addEventListener('input', (e) => {
    const n = e.target.closest('.note'); if (!n) return;
    const id = n.closest('.sk').dataset.id; if (sel.has(id)) { sel.set(id, n.value); dirty = true; warned = false; }
  });
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.x')) close(); });
  saveBtn.addEventListener('click', save);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('on')) { e.stopPropagation(); close(); } }, true);

  // ---------------------------------------------------------------- the way in: More on the phone, the More menu elsewhere
  if (PHONE) {
    const wait = (n = 0) => { const menu = $('#sheet-more .pmenu'); if (!menu) { if (n < 40) setTimeout(() => wait(n + 1), 300); return; }
      const row = document.createElement('button'); row.type = 'button'; row.id = 'row-skills'; row.innerHTML = 'Skills de la planta<small>›</small>'; row.onclick = open;
      const sw = [...menu.children].find((x) => /Switch office/.test(x.textContent)); menu.insertBefore(row, sw || null); };
    wait();
  } else {
    const more = $('#more');
    if (more) { const b = document.createElement('button'); b.type = 'button'; b.id = 'btn-skills'; b.textContent = 'Skills de la planta'; b.title = 'Las skills que los agentes de esta planta deben usar'; b.onclick = open; more.insertBefore(b, $('#btn-open', more) || null); }
  }
  if (window.office) window.office.skills = { open };
}
