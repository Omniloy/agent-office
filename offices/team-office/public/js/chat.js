// A chat with one person. It reads their session log through hub.mjs (/api/chat), so anything said to them from
// anywhere shows up here, and what they write back appears as they write it.
//   The superadmin (the figure in the clouds above the building): the same chat from every floor.
//     Ways in: tap the figure in the building view, More > their name on a phone, their name in the top bar on a computer.
//   Anyone on this floor, on a phone: tapping them opens this chat instead of their sheet. The sheet's sections
//     (Overview, Activity, Live screen, Notes) are behind the "…" button, and "‹ Chat" in the sheet comes back.
// The same file runs in both office apps.
if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const office = () => window.office || {};
  const api = (p, b) => office().api(p, b);
  const PHONE = document.documentElement.classList.contains('phone');

  const css = document.createElement('style');
  css.textContent = `
#chat { position: fixed; z-index: 30; display: none; flex-direction: column; background: var(--panel, #10131d); color: var(--text, #e8eaf2); font-family: var(--sans, system-ui, sans-serif); top: 0; right: 0; bottom: 0; width: min(460px, 100vw); border-left: 1px solid var(--line, rgba(255,255,255,.12)); box-shadow: -18px 0 50px rgba(0, 0, 0, .45); }
/* on a phone it is one more sheet: the top bar and a strip of the room stay above it, the bottom bar below */
html.phone #chat { left: 0; right: 0; top: auto; bottom: var(--tab); height: min(var(--fullh), var(--chat-h, calc(var(--fullh) - 13dvh))); width: auto; border: 0; border-radius: 18px 18px 0 0; overflow: hidden; z-index: 15; box-shadow: 0 -10px 34px rgba(0, 0, 0, .45); box-sizing: border-box; will-change: transform; }
html.phone #chat.on { animation: sheet-up .24s cubic-bezier(.2, .8, .2, 1); }
html.phone #chat.dragging { animation: none; transition: none; }
/* the chat is the person's sheet now: the old one never shows behind it (its sections live in here, behind "…") */
html.phone.chat-on #panel { visibility: hidden; pointer-events: none; }
html.phone #chat::before { content: ""; flex: none; height: 14px; background: center 6px / 40px 5px no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='5'%3E%3Crect width='40' height='5' rx='2.5' fill='%23ffffff' fill-opacity='.28'/%3E%3C/svg%3E"); }
html.typing.phone #chat { bottom: var(--kb); height: calc(var(--vvh, 100dvh) - var(--bar) + 38px); }
html.phone #chat header { padding: 0 6px 4px; gap: 8px; }
html.phone #chat .av { width: 28px; height: 28px; font-size: 13px; }
html.phone #chat .who { flex-direction: row; align-items: baseline; gap: 8px; }
html.phone #chat header button { border: 0; min-width: 40px; font-size: 22px; line-height: 1; }
html.phone #chat header .stop { font-size: 14px; border: 1px solid #ef4444; min-height: 32px; }
html.phone #chat .log { padding: 10px 10px 6px; gap: 7px; }
html.phone #chat .log .m { max-width: 93%; }
html.phone #chat form { padding: 6px 8px; gap: 6px; }
html.phone #chat form button { width: 42px; height: 42px; }
html.phone #chat textarea { min-height: 42px; padding: 9px 12px; }
#chat .back, #chat .dots { display: none; }
html.phone #chat .back { display: block; } html.phone #chat .x { display: none; }
html.phone #chat.person .dots { display: block; }
#chat .menu { position: absolute; right: 8px; top: 54px; z-index: 2; display: none; flex-direction: column; min-width: 190px; padding: 6px; border-radius: 14px; background: var(--panel, #171b28); border: 1px solid var(--line, rgba(255,255,255,.16)); box-shadow: 0 14px 40px rgba(0, 0, 0, .5); }
#chat .menu.on { display: flex; }
#chat .menu button { min-height: 44px; padding: 0 12px; border: 0; border-radius: 9px; background: transparent; color: inherit; font: 500 15px var(--sans, system-ui, sans-serif); text-align: left; }
#chat .menu button:active { background: rgba(255, 255, 255, .08); }
#chat .need { display: none; flex: none; margin: 6px 10px 0; padding: 9px 12px; border-radius: 11px; border: 0; background: var(--needs, #fbbf24); color: #201600; font: 600 14px var(--sans, system-ui, sans-serif); text-align: left; }
#chat .need.on { display: block; }
#chat .detail { display: none; flex: 1; min-height: 0; flex-direction: column; }
#chat.sec .detail { display: flex; } #chat.sec .log, #chat.sec .need { display: none; }
#chat .detail #asks { flex: none; } #chat .detail .pbody { flex: 1; min-height: 0; }
#chat .menu .chat { display: none; } #chat.sec .menu .chat { display: block; }
#chat .log .m .tw { overflow-x: auto; margin: 6px 0; white-space: normal; -webkit-overflow-scrolling: touch; }
#chat .log .m table { border-collapse: collapse; font-size: 13px; line-height: 1.35; }
#chat .log .m th, #chat .log .m td { border: 1px solid var(--line, rgba(255,255,255,.18)); padding: 5px 8px; text-align: left; vertical-align: top; max-width: 250px; overflow-wrap: normal; word-break: normal; hyphens: none; }
#chat .log .m:has(table) { max-width: 100%; align-self: stretch; }
#chat .log .m th { background: rgba(255, 255, 255, .07); font-weight: 600; }
#chat .log .m ul, #chat .log .m ol { margin: 4px 0; padding-left: 20px; white-space: normal; } #chat .log .m li { margin: 2px 0; }
#chat.on { display: flex; }
#chat header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--line, rgba(255,255,255,.1)); flex: none; }
#chat .av { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 15px; color: #fff; flex: none; }
#chat .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
#chat .who .nm { font: 600 16px var(--sans, system-ui, sans-serif); }
#chat .who small { font-size: 12px; color: var(--muted, #8d97b0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#chat .who small.work { color: #fbbf24; }
#chat header button { min-width: 44px; min-height: 40px; border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.16)); background: transparent; color: inherit; font: 500 14px var(--sans, system-ui, sans-serif); cursor: pointer; }
#chat header .stop { border-color: #ef4444; color: #fca5a5; display: none; padding: 0 12px; }
#chat.working header .stop { display: block; }
#chat .log { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
#chat .log .m { max-width: 88%; padding: 9px 12px; border-radius: 15px; font-size: 15px; line-height: 1.48; white-space: pre-wrap; overflow-wrap: anywhere; }
#chat .log .m.you { align-self: flex-end; background: var(--accent, #6c7cff); color: var(--on-accent, #fff); border-bottom-right-radius: 5px; }
#chat .log .m.you.wait { opacity: .6; }
#chat .log .m.them { align-self: flex-start; background: rgba(255, 255, 255, .07); border-bottom-left-radius: 5px; }
#chat .log .m.peer { align-self: flex-start; background: transparent; border: 1px dashed var(--line, rgba(255,255,255,.2)); font-size: 13px; color: var(--muted, #aab3c9); }
#chat .log .m.peer b { display: block; font-size: 12px; margin-bottom: 2px; }
#chat .log .m code { font: 13px ui-monospace, Menlo, monospace; background: rgba(0, 0, 0, .28); padding: 1px 4px; border-radius: 4px; }
#chat .log .m pre { margin: 6px 0; padding: 8px 10px; border-radius: 8px; background: rgba(0, 0, 0, .3); font: 12px/1.45 ui-monospace, Menlo, monospace; overflow-x: auto; white-space: pre; }
#chat .log .m h4 { margin: 6px 0 2px; font-size: 15px; }
#chat .log .m a { color: inherit; }
#chat .log .st { align-self: flex-start; font-size: 12px; color: var(--muted, #8d97b0); padding: 0 4px; }
#chat .log .typing { align-self: flex-start; display: none; gap: 4px; padding: 10px 12px; }
#chat.working .log .typing { display: flex; }
#chat .log .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted, #8d97b0); animation: chat-dot 1.1s ease-in-out infinite; }
#chat .log .typing i:nth-child(2) { animation-delay: .15s; } #chat .log .typing i:nth-child(3) { animation-delay: .3s; }
@keyframes chat-dot { 0%, 100% { opacity: .25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
#chat .log .scr { font: 11px/1.4 ui-monospace, Menlo, monospace; white-space: pre; overflow-x: auto; color: var(--muted, #aab3c9); }
#chat .log .note { align-self: center; font-size: 13px; color: var(--muted, #8d97b0); text-align: center; padding: 20px; }
#chat form { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line, rgba(255,255,255,.1)); flex: none; }
#chat textarea { flex: 1; min-height: 44px; max-height: 40vh; box-sizing: border-box; resize: none; padding: 11px 13px; border-radius: 14px; border: 1px solid var(--line, rgba(255,255,255,.16)); background: rgba(255, 255, 255, .05); color: inherit; font: 16px/1.4 var(--sans, system-ui, sans-serif); outline: none; }
#chat form button { width: 46px; height: 46px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; flex: none; background: rgba(255, 255, 255, .09); color: inherit; }
#chat form button.go { background: var(--accent, #6c7cff); color: var(--on-accent, #fff); }
#chat form button.rec { background: #ef4444; color: #fff; } #chat form button.busy { opacity: .5; }
#chat form button[hidden] { display: none; }
#chat form svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
#chat .err { font-size: 12px; color: #fca5a5; padding: 0 14px 6px; flex: none; }
#chat .err:empty { display: none; }
#chat svg, .artbadge svg, .artn svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
#chat header .arts { display: none; align-items: center; gap: 4px; padding: 0 8px; font: 600 14px var(--sans, system-ui, sans-serif) !important; min-width: 40px; }
#chat.person header .arts, #chat.admin header .arts { display: inline-flex; }
#chat header .arts svg { width: 19px; height: 19px; } #chat header .arts.none { opacity: .45; } #chat.art header .arts { color: var(--accent, #8e9bff); opacity: 1; }
#chat .artview { display: none; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 6px 10px 10px; }
#chat.art .artview { display: block; } #chat.art .log, #chat.art .need, #chat.art form, #chat.art .detail { display: none; }
#chat .artview .row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--line, rgba(255,255,255,.1)); }
#chat .artview .row a { flex: 1; min-width: 0; color: inherit; text-decoration: none; display: flex; gap: 10px; align-items: center; }
#chat .artview .row a svg { width: 24px; height: 24px; flex: none; color: var(--accent, #8e9bff); }
#chat .artview .row b { display: block; font: 600 15px var(--sans, system-ui, sans-serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#chat .artview .row small { display: block; font-size: 12px; color: var(--muted, #8d97b0); }
#chat .artview .row span { min-width: 0; flex: 1; }
#chat .artview button { min-height: 38px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.16)); background: transparent; color: inherit; font: 500 14px var(--sans, system-ui, sans-serif); flex: none; cursor: pointer; }
#chat .artview button.del { border: 0; padding: 0 8px; color: var(--muted, #8d97b0); } #chat .artview button.del svg { width: 19px; height: 19px; display: block; }
#chat .artview button.yes { background: #ef4444; border-color: #ef4444; color: #fff; }
#chat .artview .ask { flex: 1; font-size: 14px; }
#chat .artview .empty { padding: 28px 12px; text-align: center; color: var(--muted, #8d97b0); font-size: 14px; line-height: 1.5; }
#chat .log .m a.artlink { display: inline-flex; align-items: center; gap: 7px; margin: 3px 0; padding: 7px 12px 7px 9px; border-radius: 11px; background: rgba(255, 255, 255, .09); border: 1px solid var(--line, rgba(255,255,255,.18)); text-decoration: none; font-weight: 600; white-space: normal; }
#chat .log .m a.artlink svg { width: 18px; height: 18px; flex: none; }
/* how many pages someone has published: on their desk in the room, and on their card in the team list */
.artbadge { pointer-events: auto; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px 2px 5px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, .22); background: #f5f1e6; color: #2a2620; font: 700 12px system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0, 0, 0, .35); }
.artbadge svg { width: 13px; height: 13px; }
.artn { display: inline-flex; align-items: center; gap: 2px; margin-left: 6px; font: 600 11px system-ui, sans-serif; font-style: normal; color: var(--muted, #98a0b5); vertical-align: middle; } .artn svg { width: 12px; height: 12px; }
body.embed #chat { display: none !important; }`;
  document.head.append(css);

  const box = document.createElement('div');
  box.id = 'chat';
  box.innerHTML = `<header><button type="button" class="back" aria-label="Back">‹</button><div class="av"></div><div class="who"><b class="nm"></b><small></small></div><button type="button" class="stop" title="Stop what they are doing">Stop</button><button type="button" class="arts none" aria-label="Their artifacts" title="Pages they have published"><svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/></svg><i></i></button><button type="button" class="dots" aria-label="More about them">⋯</button><button type="button" class="x" aria-label="Close">✕</button></header>
<div class="menu"><button type="button" class="chat" data-tab="">Chat</button><button type="button" data-tab="overview">Overview</button><button type="button" data-tab="activity">Activity</button><button type="button" data-tab="terminal">Live screen</button><button type="button" data-tab="notes">Notes</button></div>
<button type="button" class="need">Needs your answer ›</button>
<div class="log"></div><div class="detail"></div><div class="artview"></div><div class="err"></div>
<form><textarea rows="1" placeholder="Message" enterkeyhint="send"></textarea><button type="submit" class="go" title="Send"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>`;
  document.body.append(box);
  const log = $('.log', box), nm = $('.nm', box), sub = $('.who small', box), av = $('.av', box), ta = $('textarea', box), err = $('.err', box);

  // light formatting: code blocks, headings, bold, inline code, links
  const DOC = '<svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/></svg>';
  const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname), ART = /^https?:\/\/(?:127\.0\.0\.1|localhost):4340(\/[^\s<)]*)?$/;
  const artBase = () => (LOCAL ? 'http://127.0.0.1:4340' : `https://${location.hostname}:4340`); // the same server through the phone's door
  const refOf = (u) => { // a GitHub or Jira address reads as what it is: "PR #412 · repo", "SOC-472"
    let m = /^https?:\/\/github\.com\/[^/\s]+\/([^/\s]+)\/(pull|issues|commit|actions\/runs)\/([0-9a-f]+)/i.exec(u);
    if (m) return m[2] === 'pull' ? `PR #${m[3]} · ${m[1]}` : m[2] === 'issues' ? `Issue #${m[3]} · ${m[1]}` : m[2] === 'commit' ? `Commit ${m[3].slice(0, 7)} · ${m[1]}` : `Run ${m[3]} · ${m[1]}`;
    m = /^https?:\/\/[^/\s]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(u);
    return m ? m[1] : '';
  };
  function link(url, label) {
    const m = ART.exec(url);
    if (!m) { const ref = label ? '' : refOf(url); return `<a${ref ? ' class="key"' : ''} href="${url}" target="_blank" rel="noopener">${label || ref || url}</a>`; }
    const path = m[1] || '/', known = arts.find((x) => path.startsWith(`/${x.owner}/${x.slug}/`) || path === `/${x.owner}/${x.slug}`);
    return `<a class="artlink" href="${artBase()}${path}" target="_blank" rel="noopener">${DOC}${label && !/^https?:/.test(label) ? label : known ? esc(known.title) : 'Open page'}</a>`;
  }
  const inline = (x) => { // bold, code, [text](url) and bare links
    const keep = []; const hold = (h) => `\u0001${keep.push(h) - 1}\u0001`;
    x = x.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${c}</code>`)).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => hold(link(u, t))).replace(/(https?:\/\/[^\s<)]+)/g, (u) => hold(link(u)));
    return x.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/\u0001(\d+)\u0001/g, (_, i) => keep[i]);
  };
  function blocks(text) { // tables and lists become real ones; the rest keeps its line breaks
    const L = text.split('\n'), out = [], row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const isRow = (l) => /^\s*\|.*\|\s*$/.test(l || ''), isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
    for (let i = 0; i < L.length; i++) {
      if (isRow(L[i]) && isSep(L[i + 1])) {
        let h = `<div class="tw"><table><tr>${row(L[i]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>`;
        for (i += 2; i < L.length && isRow(L[i]); i++) h += `<tr>${row(L[i]).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`;
        i--; out.push({ html: `${h}</table></div>` }); continue;
      }
      const m = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(L[i]);
      if (m) {
        const ol = !!m[2], re = ol ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*•]\s+(.*)$/; let h = ol ? `<ol start="${m[2]}">` : '<ul>';
        for (let k; i < L.length && ((k = re.exec(L[i])) || (/^\s{2,}\S/.test(L[i]) && !isRow(L[i]))); i++) h += k ? `<li>${inline(k[1])}` : ` ${inline(L[i].trim())}`;
        i--; out.push({ html: h + (ol ? '</ol>' : '</ul>') }); continue;
      }
      const hd = /^#{1,4} (.+)$/.exec(L[i]);
      out.push(hd ? { html: `<h4>${inline(hd[1])}</h4>` } : { line: inline(L[i]) });
    }
    let html = '';
    out.forEach((o, i) => { html += o.html !== undefined ? o.html : o.line + (i < out.length - 1 && out[i + 1].line !== undefined ? '\n' : ''); });
    return html;
  }
  function rich(t) { return esc(t).split(/```/).map((part, i) => (i % 2 ? `<pre>${part.replace(/^[a-z0-9]*\n/i, '')}</pre>` : blocks(part))).join(''); }

  const shots = (h) => (window.compose ? window.compose.shots(h) : h); // attached pictures show as pictures
  let who = '', file = '', pos = 0, timer = 0, open = false, run = 0, pending = [], lastStep = null, target = '', sec = '', status = '';
  const SEC = { overview: 'Overview', activity: 'Activity', terminal: 'Live screen', notes: 'Notes', artifacts: 'Artifacts' }, holder = $('.detail', box), artsB = $('.arts', box), artView = $('.artview', box);
  let arts = [], asking = '';
  const menu = $('.menu', box), need = $('.need', box), panel = $('#panel'), root = document.documentElement;
  const qs = () => (target ? `&name=${encodeURIComponent(target)}` : '');
  const near = () => log.scrollTop + log.clientHeight >= log.scrollHeight - 80;
  function add(m) {
    if (m.role === 'step') { // consecutive steps fold into one quiet line
      if (lastStep && lastStep.el.isConnected && log.lastElementChild === lastStep.el) { lastStep.n++; lastStep.el.textContent = `· ${lastStep.n} steps (${m.text})`; return; }
      const el = document.createElement('div'); el.className = 'st'; el.textContent = `· 1 step (${m.text})`; lastStep = { el, n: 1 }; log.append(el); return;
    }
    if (m.role === 'you') { const k = m.text.slice(0, 60); const i = pending.findIndex((x) => x.k === k || m.text.includes(x.k)); if (i >= 0) { pending[i].el.remove(); pending.splice(i, 1); } }
    const el = document.createElement('div'); el.className = `m ${m.role}`;
    el.innerHTML = m.role === 'peer' ? `<b style="color:${esc(m.color)}">${esc(m.from)}</b>${esc(m.text.length > 600 ? `${m.text.slice(0, 600)}…` : m.text)}` : m.role === 'them' ? rich(m.text) : `${m.spoken ? '🎙 ' : ''}${shots(esc(m.text))}`;
    log.append(el);
    for (const x of pending) log.append(x.el); // what has not arrived yet stays last
  }
  async function poll(me) {
    if (me !== run || !open) return;
    if (!document.hidden) {
      let r = null;
      try { r = await api(`/api/chat?pos=${pos}&file=${encodeURIComponent(file)}${qs()}`); } catch { /* the office is restarting */ }
      if (me !== run) return;
      if (r) {
        const stick = near();
        if (!who || r.reset || r.file !== file) { log.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>'; lastStep = null; }
        who = r.person.herdrName; file = r.file; pos = r.pos;
        nm.textContent = r.person.name; av.style.background = r.person.color; av.textContent = r.person.name.slice(0, 1);
        const typing = $('.typing', log);
        for (const m of r.messages) { add(m); }
        if (r.screen !== undefined) { // no session log to read: show the screen as it is
          let s = $('.scr', log); if (!s) { s = document.createElement('div'); s.className = 'm them scr'; log.append(s); }
          s.textContent = r.screen || ''; if (!r.live) s.remove();
        }
        if (!r.live && !$('.note', log)) { const n = document.createElement('div'); n.className = 'note'; n.textContent = `${r.person.name} is not running in Herdr right now.${r.person.admin ? ' Start him on the computer with: omniloy-admin start' : ''}`; log.append(n); }
        if (typing) log.append(typing);
        box.classList.toggle('working', !!r.working);
        status = !r.live ? 'offline' : r.working ? 'working…' : r.blocked ? 'waiting for you' : PHONE ? '' : r.person.role; sub.textContent = sec ? SEC[sec] : status; sub.classList.toggle('work', !!r.working && !sec);
        need.classList.toggle('on', !!target && !!$('#asks.show')); // they asked something: the question and its answers are in Overview
        if (stick || r.reset) log.scrollTop = log.scrollHeight;
      }
    }
    timer = setTimeout(() => poll(me), box.classList.contains('working') || pending.length ? 1300 : 2500);
  }
  function show(name) {
    name = typeof name === 'string' ? name : '';
    if (name !== target || !open) menu.classList.remove('on');
    section('');
    box.dataset.who = name;
    if (name !== target) { status = ''; target = name; who = ''; file = ''; pos = 0; pending = []; lastStep = null; log.innerHTML = ''; nm.textContent = ''; sub.textContent = ''; av.textContent = ''; av.style.background = 'transparent'; err.textContent = ''; need.classList.remove('on'); box.classList.remove('working'); }
    box.classList.toggle('person', !!target); box.classList.toggle('admin', !target); paintArts();
    open = true; box.classList.add('on'); root.classList.add('chat-on'); dispatchEvent(new Event('office-chat'));
    clearTimeout(timer); poll(++run);
    if (!PHONE) ta.focus();
  }
  function hide() { section(''); open = false; run++; clearTimeout(timer); box.classList.remove('on'); menu.classList.remove('on'); root.classList.remove('chat-on'); dispatchEvent(new Event('office-chat')); }
  function close() { const person = !!target; hide(); if (person && PHONE && office().select) office().select(null); }
  // "…" > a section: the same sheet shows that part of the person (what the old side panel had) instead of the messages.
  // The page keeps drawing into the same two boxes; they only move in here and back.
  function section(tab) {
    menu.classList.remove('on');
    const asks = $('#asks'), body = $('#pbody'), comp = $('#composer');
    if (tab === 'artifacts') { if (asks && body && comp && body.parentNode === holder) { comp.before(asks); comp.before(body); } }
    else if (tab && asks && body) { holder.append(asks, body); const b = document.querySelector(`#tabs [data-tab="${tab}"]`); if (b) b.click(); }
    else { tab = ''; if (asks && body && comp && body.parentNode === holder) { comp.before(asks); comp.before(body); } }
    sec = tab; asking = ''; box.classList.toggle('sec', !!sec && sec !== 'artifacts'); box.classList.toggle('art', sec === 'artifacts'); if (sec === 'artifacts') { paintArts(); loadArts(); } sub.textContent = sec ? SEC[sec] : status; if (sec) sub.classList.remove('work');
    if (!sec && open) log.scrollTop = log.scrollHeight;
  }
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, innerHeight * 0.4)}px`; };
  async function send() {
    const text = ta.value.trim(); if (!text || !who) return;
    ta.value = ''; grow(); err.textContent = '';
    const el = document.createElement('div'); el.className = 'm you wait'; el.innerHTML = shots(esc(text)); log.append(el); log.scrollTop = log.scrollHeight;
    const p = { k: text.slice(0, 60), el }; pending.push(p);
    try { await api('/api/chat/send', { text, name: target }); el.classList.remove('wait'); }
    catch (e) { el.remove(); pending = pending.filter((x) => x !== p); ta.value = text; grow(); err.textContent = `Not sent: ${e.message || 'try again'}`; }
  }
  $('form', box).addEventListener('submit', (e) => { e.preventDefault(); send(); });
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !PHONE && !e.isComposing) { e.preventDefault(); send(); } });
  $('.x', box).onclick = close; $('.back', box).onclick = () => (sec ? section('') : close()); // from a section, back is back to the messages
  $('.dots', box).onclick = () => menu.classList.toggle('on');
  menu.onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) section(b.dataset.tab); };
  need.onclick = () => section('overview');
  artsB.onclick = () => section(sec === 'artifacts' ? '' : 'artifacts');

  // ---------------------------------------------------------------- artifacts: the pages people publish with `team-artifact`
  const mineOf = (name) => arts.filter((x) => x.owner === name);
  const when = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  function paintArts() {
    const name = target || who, list = name ? mineOf(name) : [];
    artsB.querySelector('i').textContent = list.length || ''; artsB.querySelector('i').style.fontStyle = 'normal'; artsB.classList.toggle('none', !list.length);
    const html = sec !== 'artifacts' ? null : list.length ? list.map((x) => {
      const k = `${x.owner}/${x.slug}`;
      return asking === k ? `<div class="row"><div class="ask">Delete “${esc(x.title)}”?</div><button type="button" class="yes" data-del="${esc(k)}">Delete</button><button type="button" data-cancel>Cancel</button></div>`
        : `<div class="row"><a href="${artBase()}/${esc(k)}/" target="_blank" rel="noopener">${DOC}<span><b>${esc(x.title)}</b><small>${esc(x.kind)} · ${esc(when(x.updated))}</small></span></a><button type="button" class="del" data-ask="${esc(k)}" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg></button></div>`;
    }).join('') : `<div class="empty">No pages yet.<br>Ask ${esc(nm.textContent || 'them')} for an artifact and it will show up here.</div>`;
    if (html !== null && html !== artView.dataset.html) { artView.dataset.html = html; artView.innerHTML = html; } // only when it changes: taps must not land on a rebuilt list
    // the room and the team list
    const o = office(), ags = o.agents ? o.agents() : [], counts = {};
    for (const a of ags) { const n = mineOf(a.herdrName).length; if (n) counts[a.slug] = n; }
    if (o.world && o.world.setArtifacts) o.world.setArtifacts(counts);
    document.querySelectorAll('#roster .card[data-slug]').forEach((c) => {
      const n = counts[c.dataset.slug] || 0, b = c.querySelector('.who b'); let i = c.querySelector('.artn');
      if (!n) { if (i) i.remove(); return; }
      if (!i && b) { i = document.createElement('i'); i.className = 'artn'; b.after(i); }
      if (i && i.dataset.n !== String(n)) { i.dataset.n = n; i.innerHTML = `${DOC}${n}`; i.title = `${n} published page${n > 1 ? 's' : ''}`; }
    });
  }
  let artSig = '';
  async function loadArts() {
    let r; try { r = await api('/api/artifacts'); } catch { return; }
    arts = r.items || []; const sig = JSON.stringify(arts);
    if (sig !== artSig || sec === 'artifacts') { artSig = sig; paintArts(); }
  }
  artView.addEventListener('click', async (e) => {
    const ask = e.target.closest('[data-ask]'), del = e.target.closest('[data-del]');
    if (ask) { asking = ask.dataset.ask; return paintArts(); }
    if (e.target.closest('[data-cancel]')) { asking = ''; return paintArts(); }
    if (del) { const [owner, slug] = del.dataset.del.split('/'); asking = ''; try { await api('/api/artifacts/delete', { owner, slug }); } catch (x) { err.textContent = x.message || 'Could not delete it.'; } loadArts(); }
  });
  { const r = $('#roster'); if (r) new MutationObserver(() => { if (arts.length) paintArts(); }).observe(r, { childList: true }); }
  addEventListener('office-artifacts', (e) => { // the paper on someone's desk
    const o = office(), a = (o.agents ? o.agents() : []).find((x) => x.slug === e.detail); if (!a) return;
    if (PHONE && o.select) o.select(a.slug);
    show(a.herdrName); section('artifacts');
  });
  log.addEventListener('pointerdown', () => menu.classList.remove('on'));
  if (PHONE) { try { const f = Number(localStorage.getItem('office.chat.h')); if (f > 0.1 && f < 1) root.style.setProperty('--chat-h', `${(f * 100).toFixed(1)}dvh`); } catch { /* no storage: the usual height */ } } // the height you left it at (drag its top edge)
  if (PHONE && panel) { // tapping someone opens their chat; their sheet stays underneath for the sections
    const openFor = () => { const o = office(), slug = o.selected && o.selected(), a = slug && (o.agents ? o.agents() : []).find((x) => x.slug === slug); if (a && a.herdrName) show(a.herdrName); };
    let was = panel.classList.contains('open'), last = '';
    new MutationObserver(() => {
      const on = panel.classList.contains('open'), slug = on && office().selected ? office().selected() : '';
      if (!on) { if (was && open && target) hide(); }
      else if (!was || slug !== last) openFor();
      was = on; last = slug || '';
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
  $('.stop', box).onclick = async () => { try { await api('/api/chat/stop', { name: target }); } catch (e) { err.textContent = e.message || 'Could not stop them.'; } };
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && document.activeElement !== ta) close(); });

  // ---------------------------------------------------------------- the way in
  const boot = async (n = 0) => {
    if (!office().api) { if (n < 40) setTimeout(() => boot(n + 1), 300); return; }
    window.office.chat = { open: show, close, isOpen: () => open };
    loadArts(); setInterval(() => { if (!document.hidden) loadArts(); }, 8000);
    let r; try { r = await api('/api/chat/status'); } catch { return; } // no superadmin on this computer: no way in
    const name = r.person.name;
    if (PHONE) {
      const wait = (k = 0) => { const menu = $('#sheet-more .pmenu'); if (!menu) { if (k < 40) setTimeout(() => wait(k + 1), 300); return; }
        const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `${esc(name)}<small>change the offices</small>`; b.onclick = () => show(''); menu.insertBefore(b, menu.firstElementChild); };
      wait();
    } else {
      const tools = $('.tools');
      if (tools) { const b = document.createElement('button'); b.type = 'button'; b.id = 'btn-chat'; b.textContent = `⚡ ${name}`; b.title = 'Talk to the superadmin: change floors, people, looks and features'; b.onclick = () => (open ? close() : show('')); tools.insertBefore(b, $('#btn-more', tools) || null); }
    }
  };
  boot();
}
