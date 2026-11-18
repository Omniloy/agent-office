// Roles & people: who is on every team, what each one is told, what they run on, and the way to change it.
//   list      every team with its people (role, harness, model), its protocol, and "Add a person"
//   person    name, role, harness, model, the one-line description, the start message and the full instructions
//   letting someone go is the Product lead's job: the button asks the lead, who runs `team-person remove`
// The server side is `team-person` (see hub.mjs). The same file runs in the three office apps.
if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const office = () => window.office || {};
  const roleOf = (r, t) => (window.officeRole ? window.officeRole(r, t) : r); // the role as the team's floor theme names it; the Role field edits the real one
  const PHONE = document.documentElement.classList.contains('phone');
  const HARNESS = { 'claude': 'Claude', 'claude-work': 'Claude · work account', 'claude-personal': 'Claude · personal account', codex: 'Codex' };
  const hname = (id) => HARNESS[id] || id;

  const css = document.createElement('style');
  css.textContent = `
#people { position: fixed; inset: 0; z-index: 30; display: none; background: rgba(5, 7, 14, .6); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); font-family: var(--sans, system-ui, sans-serif); color: var(--text, #e8eaf2); }
#people.on { display: flex; align-items: center; justify-content: center; }
#people .pp { width: min(820px, 100vw); height: min(88vh, 900px); display: flex; flex-direction: column; background: var(--panel, #141824); border: 1px solid var(--line, rgba(255,255,255,.1)); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
html.phone #people .pp { width: 100vw; height: 100dvh; border-radius: 0; border: 0; padding-top: env(safe-area-inset-top, 0px); }
#people header { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 6px; border-bottom: 1px solid var(--line, rgba(255,255,255,.1)); }
#people header h3 { flex: 1; margin: 0; font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#people header h3 small { font-weight: 400; opacity: .6; margin-left: 8px; font-size: 13px; }
#people header button { width: 40px; height: 40px; border: 0; border-radius: 12px; background: transparent; color: inherit; font-size: 20px; cursor: pointer; }
#people header button:hover { background: rgba(255, 255, 255, .08); }
#people header .back[hidden] { display: block; visibility: hidden; }
#people .body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 6px 0 18px; }
#people .grp { display: flex; align-items: baseline; gap: 8px; padding: 18px 18px 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, #8d97b0); }
#people .grp b { color: var(--text, #e8eaf2); font-size: 13px; }
#people .row { display: grid; grid-template-columns: 10px 1fr auto 14px; gap: 2px 12px; align-items: center; width: 100%; min-height: 58px; padding: 9px 18px; border: 0; border-top: 1px solid var(--line, rgba(255,255,255,.07)); background: transparent; color: inherit; text-align: left; cursor: pointer; font: inherit; }
#people .row:hover { background: rgba(255, 255, 255, .04); }
#people .row i { width: 10px; height: 10px; border-radius: 50%; grid-row: 1 / 3; }
#people .row b { font-size: 15px; font-weight: 600; }
#people .row b em { font-style: normal; font-weight: 500; font-size: 11px; margin-left: 7px; padding: 1px 7px; border-radius: 99px; background: rgba(255, 255, 255, .1); color: var(--muted, #aab3c9); vertical-align: 1px; }
#people .row span { grid-column: 2; font-size: 13px; color: var(--muted, #8d97b0); }
#people .row u { grid-column: 3; grid-row: 1 / 3; text-decoration: none; text-align: right; font-size: 12px; line-height: 1.35; color: var(--muted, #8d97b0); }
#people .row s { grid-column: 4; grid-row: 1 / 3; text-decoration: none; opacity: .5; }
#people .row.plain { grid-template-columns: 1fr 14px; min-height: 50px; color: var(--accent, #8ea2ff); }
#people .row.plain b { font-weight: 500; }
#people .row.plain s { grid-column: 2; grid-row: 1; }
#people form { padding: 6px 18px 0; display: flex; flex-direction: column; gap: 14px; }
#people label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--muted, #8d97b0); }
#people label[hidden] { display: none; }
#people label small { font-size: 12px; opacity: .8; line-height: 1.4; }
#people input, #people select, #people textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: rgba(255, 255, 255, .05); color: var(--text, #e8eaf2); font: 15px/1.45 var(--sans, system-ui, sans-serif); }
#people textarea { resize: vertical; min-height: 74px; }
#people textarea.big { min-height: 52vh; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
#people input:focus, #people select:focus, #people textarea:focus { outline: 2px solid var(--accent, #8ea2ff); outline-offset: -1px; }
#people .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
#people .ro { padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, .04); color: var(--text, #e8eaf2); font-size: 14px; }
#people footer { flex: none; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line, rgba(255,255,255,.1)); }
#people footer:empty { display: none; }
#people footer button { min-height: 44px; padding: 0 16px; border-radius: 11px; border: 1px solid var(--line, rgba(255,255,255,.16)); background: transparent; color: inherit; font: 500 14px var(--sans, system-ui, sans-serif); cursor: pointer; }
#people footer button.pri { background: var(--accent, #6c7cff); border-color: transparent; color: var(--on-accent, #fff); font-weight: 600; }
#people footer button.warn { color: #fca5a5; border-color: rgba(248, 113, 113, .4); }
#people footer button:disabled { opacity: .5; }
#people footer .msg { flex: 1 1 100%; font-size: 13px; color: var(--muted, #aab3c9); min-height: 0; }
#people footer .msg:empty { display: none; }
#people footer .msg.err { color: #fca5a5; }
#people .empty { padding: 40px 20px; text-align: center; color: var(--muted, #8d97b0); }
@media (max-width: 520px) { #people .two { grid-template-columns: 1fr; } }
body.embed #people { display: none !important; }`;
  document.head.append(css);

  const el = document.createElement('div');
  el.id = 'people';
  el.innerHTML = '<div class="pp"><header><button type="button" class="back" title="Back">‹</button><h3></h3><button type="button" class="x" title="Close">✕</button></header><div class="body"></div><footer></footer></div>';
  document.body.append(el);
  const body = $('.body', el), foot = $('footer', el), title = $('h3', el), backBtn = $('.back', el);

  let data = null, view = { name: 'list' }, dirty = false, warned = false, busy = false, note = null;
  const team = (port) => data.teams.find((t) => String(t.port) === String(port));
  const who = (hn) => { for (const t of data.teams) { const p = t.people.find((x) => x.herdrName === hn); if (p) return [t, p]; } return []; };
  const api = (p, b) => office().api(p, b);
  const say = (t, err) => { const m = $('.msg', foot); if (m) { m.textContent = t || ''; m.classList.toggle('err', !!err); } };

  async function load() { data = await api('/api/people'); }
  async function open() {
    el.classList.add('on'); view = { name: 'list' }; dirty = false;
    title.textContent = 'Roles & people'; body.innerHTML = '<div class="empty">Reading the teams…</div>'; foot.innerHTML = '';
    try { await load(); render(); } catch (e) { body.innerHTML = `<div class="empty">Could not read the teams: ${esc(e.message)}</div>`; }
  }
  function close() { if (dirty && !warned) { warned = true; return say('You have changes that are not saved. Press again to close without saving.', true); } el.classList.remove('on'); dirty = false; warned = false; }
  function go(v) { view = v; dirty = false; warned = false; note = v.note || null; render(); body.scrollTop = 0; }
  function back() {
    if (view.name === 'list') return close();
    if (dirty && !warned) { warned = true; return say('You have changes that are not saved. Press back again to drop them.', true); }
    go({ name: 'list' });
  }

  const field = (label, html, hint) => `<label>${esc(label)}${html}${hint ? `<small>${hint}</small>` : ''}</label>`;
  const select = (name, opts, val) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const harnessField = (t, val) => field('Harness', select('runtime', t.runtimes.map((r) => [r.id, hname(r.id)]), val), '<span data-rtnote></span>');
  const modelField = (val) => `<label data-model>Model${select('model', [...new Set([...(val ? [val] : []), ...data.models])].map((m) => [m, m === 'inherit' ? 'inherit (whatever the session uses)' : m]), val)}</label><label data-codex hidden>Model<div class="ro">Codex uses its own model${data.codexModel ? `: ${esc(data.codexModel)}` : ''}</div><small>It is set in Codex, not per person.</small></label>`;
  function syncHarness(t) { // the model belongs to Claude; Codex brings its own
    const rt = $('[name=runtime]', body); if (!rt) return;
    const r = t.runtimes.find((x) => x.id === rt.value) || {};
    const n = $('[data-rtnote]', body); if (n) n.textContent = r.notes || '';
    const m = $('[data-model]', body), c = $('[data-codex]', body);
    if (m && c) { m.hidden = !!r.codex; c.hidden = !r.codex; }
  }

  function render() {
    backBtn.hidden = view.name === 'list';
    if (view.name === 'list') {
      title.textContent = 'Roles & people';
      body.innerHTML = data.teams.map((t) => `
        <div class="grp"><b>${esc(t.name)}</b>${t.people.length} people</div>
        ${t.people.map((p) => `<button type="button" class="row" data-who="${esc(p.herdrName)}"><i style="background:${esc(p.color)}"></i><b>${esc(p.name)}${p.lead ? '<em>lead</em>' : ''}</b><span>${esc(roleOf(p.role, t))}</span><u>${esc(hname(p.runtime))}<br>${esc((t.runtimes.find((r) => r.id === p.runtime) || {}).codex ? data.codexModel || 'Codex model' : p.model || '')}</u><s>›</s></button>`).join('')}
        <button type="button" class="row plain" data-proto="${t.port}"><b>Team protocol</b><s>›</s></button>
        <button type="button" class="row plain" data-add="${t.port}"><b>+ Add a person</b><s>›</s></button>`).join('');
      foot.innerHTML = '';
    } else if (view.name === 'person') {
      const [t, p] = who(view.who); if (!p) return go({ name: 'list' });
      title.innerHTML = `${esc(p.name)}<small>${esc(t.name)}</small>`;
      body.innerHTML = `<form>
        <div class="two">${field('Name', `<input name="name" value="${esc(p.name)}" autocomplete="off">`)}${field('Role', `<input name="role" value="${esc(p.role)}" autocomplete="off">`)}</div>
        <div class="two">${harnessField(t, p.runtime)}${modelField(p.model)}</div>
        ${field('In one line', `<textarea name="description" rows="2">${esc(p.description)}</textarea>`, 'Who this is and what they do. It is how the role is recognised.')}
        ${field('Start message', `<textarea name="kickoff" rows="3" placeholder="${esc(t.defaultKickoff)}">${esc(p.kickoff)}</textarea>`, 'What they are told when they start a shift. Empty uses the team default shown in grey.')}
        ${field('Instructions', `<textarea name="instructions" class="big" spellcheck="false">${esc(p.instructions)}</textarea>`, `Everything this person is told about who they are and how they work. Their name in Herdr is <b>${esc(p.herdrName)}</b>; that cannot change.`)}
      </form>`;
      foot.innerHTML = `<div class="msg">${esc(note || 'Changes apply the next time they start.')}</div><button type="button" class="pri" data-save>Save</button>${p.running ? '' : '<button type="button" data-start>Start now</button>'}${p.lead ? '' : `<button type="button" class="warn" data-letgo>Ask ${esc(t.leadName || t.lead)} to let them go</button>`}`;
      syncHarness(t);
    } else if (view.name === 'add') {
      const t = team(view.port);
      title.innerHTML = `New person<small>${esc(t.name)}</small>`;
      const all = data.teams.flatMap((x) => x.people.map((p) => [p.herdrName, `${p.name.split(' ')[0]} · ${roleOf(p.role, x)} (${x.name})`]));
      body.innerHTML = `<form>
        <div class="two">${field('Name', '<input name="name" placeholder="First name and surname" autocomplete="off">')}${field('Role', '<input name="role" placeholder="e.g. Development" autocomplete="off">')}</div>
        ${field('Start from', select('like', [['', 'A blank role'], ...all], ''), 'Copies that person\'s instructions, harness and model, with the new name in place of theirs. You can edit everything before they start.')}
        <div class="two">${harnessField(t, t.runtimes[0] ? t.runtimes[0].id : '')}${modelField('claude-fable-5-2')}</div>
      </form>`;
      foot.innerHTML = '<div class="msg">They are added to the team but not started: you review the instructions first.</div><button type="button" class="pri" data-create>Create</button>';
      syncHarness(t);
    } else if (view.name === 'proto') {
      const t = team(view.port);
      title.innerHTML = `Team protocol<small>${esc(t.name)}</small>`;
      body.innerHTML = `<form>${field('Protocol', `<textarea name="text" class="big" style="min-height:66vh" spellcheck="false">${esc(t.protocol)}</textarea>`, 'The way of working everyone on this team reads when they start.')}</form>`;
      foot.innerHTML = '<div class="msg">People read it when they start a shift.</div><button type="button" class="pri" data-saveproto>Save</button>';
    }
  }
  const values = () => Object.fromEntries([...body.querySelectorAll('[name]')].map((x) => [x.name, x.value]));
  async function act(fn, done) {
    if (busy) return; busy = true; foot.querySelectorAll('button').forEach((b) => { b.disabled = true; }); say('Working…');
    try { await fn(); dirty = false; warned = false; if (done) done(); }
    catch (e) { foot.querySelectorAll('button').forEach((b) => { b.disabled = false; }); say(e.message || 'That did not work.', true); }
    busy = false;
  }

  el.addEventListener('input', (e) => { if (e.target.closest('form')) { dirty = true; warned = false; } });
  el.addEventListener('change', (e) => {
    if (e.target.name === 'runtime') syncHarness(view.name === 'person' ? who(view.who)[0] : team(view.port));
    if (e.target.name === 'like' && e.target.value) { const [, p] = who(e.target.value); if (p) { $('[name=runtime]', body).value = p.runtime; const m = $('[name=model]', body); if (p.model && [...m.options].some((o) => o.value === p.model)) m.value = p.model; if (!$('[name=role]', body).value) $('[name=role]', body).value = p.role; syncHarness(team(view.port)); } }
  });
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t === el) return close();
    if (t.closest('.x')) return close();
    if (t.closest('.back')) return back();
    const row = t.closest('.row');
    if (row && row.dataset.who) return go({ name: 'person', who: row.dataset.who });
    if (row && row.dataset.add) return go({ name: 'add', port: row.dataset.add });
    if (row && row.dataset.proto) return go({ name: 'proto', port: row.dataset.proto });
    if (t.closest('[data-save]')) {
      const v = values(), [tm] = who(view.who);
      if ((tm.runtimes.find((r) => r.id === v.runtime) || {}).codex) delete v.model;
      return act(async () => { await api('/api/people/save', { who: view.who, fields: v }); await load(); }, () => { note = 'Saved. It applies the next time they start.'; render(); });
    }
    if (t.closest('[data-start]')) return act(async () => { const r = await api('/api/people/start', { who: view.who }); if (!r.ok) throw new Error(r.out || 'They did not start.'); await load(); }, () => { note = 'Started. They will appear in the office in a moment.'; render(); });
    if (t.closest('[data-letgo]')) {
      const [tm, p] = who(view.who);
      if (!warned) { warned = true; return say(`This asks ${tm.leadName || tm.lead} to hand over ${p.name.split(' ')[0]}'s work and let them go. Press again to send it.`, true); }
      return act(async () => { const r = await api('/api/people/ask-remove', { who: view.who }); if (!r.ok) throw new Error(r.error || 'The message did not reach the lead.'); }, () => { note = `${tm.leadName || tm.lead} has been asked. ${p.name.split(' ')[0]} stays until they do it.`; render(); });
    }
    if (t.closest('[data-create]')) {
      const v = values(); let made = null;
      return act(async () => { const r = await api('/api/people/add', { port: view.port, ...v }); made = r.person; await load(); }, () => go({ name: 'person', who: made.herdrName, note: 'Created. Review the instructions and save; then press Start now.' }));
    }
    if (t.closest('[data-saveproto]')) return act(async () => { await api('/api/people/protocol', { port: view.port, text: values().text }); await load(); }, () => { note = null; render(); say('Saved.'); });
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('on')) { e.stopPropagation(); back(); } }, true);

  // ---------------------------------------------------------------- the way in: More on the phone, the top bar elsewhere
  if (PHONE) {
    const wait = (n = 0) => { const menu = $('#sheet-more .pmenu'); if (!menu) { if (n < 40) setTimeout(() => wait(n + 1), 300); return; }
      const row = document.createElement('button'); row.type = 'button'; row.innerHTML = 'Roles & people<small>›</small>'; row.onclick = open;
      const sw = [...menu.children].find((x) => /Switch office/.test(x.textContent)); menu.insertBefore(row, sw || null); };
    wait();
  } else {
    const tools = $('.tools');
    if (tools) { const b = document.createElement('button'); b.type = 'button'; b.id = 'btn-people'; b.textContent = 'People'; b.title = 'Roles & people: instructions, harness and model of everyone'; b.onclick = open; tools.insertBefore(b, $('#btn-more', tools) || null); }
  }
  if (window.office) window.office.people = { open };
}
