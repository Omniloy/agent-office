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
html:not(.phone) #chat:not(.person) { top: var(--bar, 44px); } /* the superadmin's column starts under the bar: its buttons (Terminal, For you, Floors) stay in reach */
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
#chat.person .dots { display: block; }
/* on a computer there is room: the sections are tabs under the name, not a menu */
html:not(.phone) #chat.person .dots { display: none; }
html:not(.phone) #chat.person .menu { position: static; display: flex; flex-direction: row; flex: none; gap: 2px; min-width: 0; padding: 0 10px; border: 0; border-bottom: 1px solid var(--line, rgba(255,255,255,.1)); border-radius: 0; background: transparent; box-shadow: none; overflow-x: auto; }
html:not(.phone) #chat.person .menu button { display: block; flex: none; min-height: 38px; padding: 0 12px; border-radius: 0; border-bottom: 2px solid transparent; font-size: 13.5px; color: var(--muted, #9aa3b8); cursor: pointer; }
html:not(.phone) #chat.person .menu button:hover { color: var(--text, #e8eaf2); }
html:not(.phone) #chat.person:not([data-sec]) .menu .chat, html:not(.phone) #chat.person[data-sec=""] .menu .chat, html:not(.phone) #chat.person[data-sec="overview"] .menu [data-tab="overview"], html:not(.phone) #chat.person[data-sec="activity"] .menu [data-tab="activity"], html:not(.phone) #chat.person[data-sec="terminal"] .menu [data-tab="terminal"], html:not(.phone) #chat.person[data-sec="notes"] .menu [data-tab="notes"] { color: var(--text, #e8eaf2); border-bottom-color: var(--accent, #7c9cff); }
html:not(.phone) #chat.ro .menu { display: none; }
#chat.ro form, #chat.ro .stop, #chat.ro .dots, #chat.ro .need { display: none !important; } /* a visitor from another building: read only */
html.phone #chat.ro .log { padding-bottom: 230px; } /* the box for writing to the lead sits over the end of the chat */
/* on a computer a person's chat takes the place of their side panel (same size, the room stays visible beside it) */
html:not(.phone) #chat.person { top: calc(var(--bar, 44px) + 12px); right: 12px; bottom: 12px; width: var(--panel-w, min(560px, 100vw)); border: 1px solid var(--line, rgba(255,255,255,.12)); border-radius: 16px; overflow: hidden; }
html:not(.phone).chat-person #panel { visibility: hidden; pointer-events: none; }
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
#chat .log .m a { color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1.5px; }
#chat .log .m.them a:not(.artlink), #chat .log .m.peer a:not(.artlink) { color: #9cc2ff; font-weight: 600; } #chat .log .m.them a:not(.artlink):hover { color: #c7dcff; }
#chat .log .m a.artlink { text-decoration: none; }
#chat .log .st { flex: none; align-self: flex-start; font-size: 12px; color: var(--muted, #8d97b0); padding: 0 4px; }
#chat .log .typing { flex: none; align-self: flex-start; display: none; align-items: flex-start; gap: 9px; padding: 6px 6px; max-width: 100%; box-sizing: border-box; }
#chat .log .typing .dd { flex: none; display: flex; gap: 4px; padding-top: 6px; }
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
#chat .log .typing .dng { min-width: 0; font-size: 12.5px; line-height: 1.45; color: var(--muted, #8d97b0); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
#chat .log .typing .dng:empty { display: none; }
/* the thread: their answers hang from a line in their colour and use the whole width, each step is a small mark on that line, your own messages stay as bubbles on the right */
#chat .log, html.phone #chat .log { gap: 0; }
#chat .log > * + * { margin-top: 10px; }
#chat .log .m.you { max-width: 82%; margin-top: 16px; } #chat .log .m.you + .m.you { margin-top: 6px; } #chat .log .m.you + :not(.you) { margin-top: 16px; }
#chat .log .m.them, #chat .log .st, #chat .log .typing { position: relative; align-self: stretch; max-width: none; box-sizing: border-box; }
#chat .log .m.them { background: none; border-radius: 0; padding: 0 2px 0 22px; line-height: 1.55; }
#chat .log .st { padding: 0 2px 0 22px; font: 11.5px/1.5 ui-monospace, Menlo, monospace; letter-spacing: .01em; }
#chat .log .typing { padding: 0 2px 0 22px; align-items: flex-start; }
#chat .log .m.them::before, #chat .log .st::before, #chat .log .typing::before { content: ''; position: absolute; left: 5px; top: 0; bottom: 0; width: 2px; border-radius: 2px; background: color-mix(in srgb, var(--wc, #8e9bff) 42%, transparent); }
#chat .log .m.them + .m.them::before, #chat .log .st + .m.them::before, #chat .log .m.them + .st::before, #chat .log .st + .st::before, #chat .log .m.them + .typing::before, #chat .log .st + .typing::before { top: -10px; }
#chat .log .typing::before { background: linear-gradient(color-mix(in srgb, var(--wc, #8e9bff) 42%, transparent), transparent); }
#chat .log .m.them::after { content: ''; position: absolute; left: 1px; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: var(--wc, #8e9bff); }
#chat .log .st::after { content: ''; position: absolute; left: 3px; top: 6px; width: 6px; height: 6px; border-radius: 50%; background: color-mix(in srgb, var(--wc, #8e9bff) 75%, #000); }
#chat .log .typing .dd { padding-top: 7px; }
#chat .log .m.them:not(.fin):not(.scr) { font-size: 13.5px; line-height: 1.5; color: var(--muted, #aab3c9); }
#chat .log .m.them:not(.fin)::after { left: 3px; top: 7px; width: 6px; height: 6px; background: color-mix(in srgb, var(--wc, #8e9bff) 75%, #000); }
#chat .log .m.them.fin { padding: 10px 14px 11px 22px; border-radius: 0 12px 12px 0; background: linear-gradient(90deg, color-mix(in srgb, var(--wc, #8e9bff) 13%, transparent), color-mix(in srgb, var(--wc, #8e9bff) 4%, transparent)); }
#chat .log .m.them.fin::before { background: var(--wc, #8e9bff); width: 3px; left: 4px; }
#chat .log .m.them.fin::after { top: 16px; box-shadow: 0 0 0 4px color-mix(in srgb, var(--wc, #8e9bff) 28%, transparent); }
#chat .wkbar { display: none; flex: none; align-items: center; gap: 9px; margin: 0 10px 8px; padding: 8px 12px; border-radius: 11px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: rgba(255, 255, 255, .05); color: inherit; font: 600 13px var(--sans, system-ui, sans-serif); text-align: left; cursor: pointer; }
#chat .wkbar.on { display: flex; } #chat.sec .wkbar, #chat.art .wkbar, #chat.wkv .wkbar, #chat.wkl .wkbar { display: none; }
#chat.wkv header .stop { display: none; } /* Stop is for the person, not for one helper */
#chat .wkbar:hover { background: rgba(255, 255, 255, .09); }
#chat .wkbar .ws { display: flex; gap: 3px; align-items: flex-end; height: 16px; }
#chat .ws i, #chat .wklist i { display: block; width: 9px; height: 13px; border-radius: 5px 5px 3px 3px; background: var(--wc, #7c9cff); flex: none; }
#chat .ws i.w, #chat .wklist i.w { animation: wk-hop .7s ease-in-out infinite; } #chat .ws i.w:nth-child(2n) { animation-delay: .2s; } #chat .ws i.w:nth-child(3n) { animation-delay: .4s; }
#chat .ws i.d, #chat .wklist i.d { opacity: .38; }
@keyframes wk-hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
#chat .wkbar small { margin-left: auto; font-weight: 500; color: var(--muted, #9aa4bd); white-space: nowrap; }
#chat .wkhead { display: none; flex: none; align-items: center; gap: 8px; margin: 8px 10px 0; padding: 8px 12px; border-radius: 11px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: rgba(255, 255, 255, .05); color: inherit; font: 600 13px var(--sans, system-ui, sans-serif); text-align: left; cursor: pointer; }
#chat.wkv .wkhead, #chat.wkl .wkhead { display: flex; } #chat.sec .wkhead, #chat.art .wkhead { display: none; }
#chat .wkhead b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #chat .wkhead small { margin-left: auto; font-weight: 500; color: var(--muted, #9aa4bd); white-space: nowrap; }
#chat .wklist { display: none; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 8px 10px 10px; }
#chat.wkl .wklist { display: block; } #chat.wkl .log, #chat.wkl form, #chat.wkv form, #chat.wkl .need, #chat.wkv .need { display: none; } #chat.sec .wklist, #chat.art .wklist { display: none; }
#chat .wklist button { display: flex; align-items: center; gap: 11px; width: 100%; margin: 0 0 6px; padding: 10px 12px; border-radius: 11px; border: 1px solid var(--line, rgba(255,255,255,.12)); background: rgba(255, 255, 255, .04); color: inherit; font: inherit; text-align: left; cursor: pointer; }
#chat .wklist button:hover { background: rgba(255, 255, 255, .09); }
#chat .wklist span { min-width: 0; flex: 1; } #chat .wklist b { display: block; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #chat .wklist small { display: block; font-size: 12px; color: var(--muted, #9aa4bd); }
#chat .wklist .empty { padding: 26px 10px; text-align: center; font-size: 13px; color: var(--muted, #9aa4bd); }
body.embed #chat { display: none !important; }`;
  document.head.append(css);

  const box = document.createElement('div');
  box.id = 'chat';
  box.innerHTML = `<header><button type="button" class="back" aria-label="Back">‹</button><div class="av"></div><div class="who"><b class="nm"></b><small></small></div><button type="button" class="stop" title="Stop what they are doing">Stop</button><button type="button" class="arts none" aria-label="Their artifacts" title="Pages they have published"><svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/></svg><i></i></button><button type="button" class="dots" aria-label="More about them">⋯</button><button type="button" class="x" aria-label="Close">✕</button></header>
<div class="menu"><button type="button" class="chat" data-tab="">Chat</button><button type="button" data-tab="overview">Overview</button><button type="button" data-tab="activity">Activity</button><button type="button" data-tab="terminal">Live screen</button><button type="button" data-tab="notes">Notes</button></div>
<button type="button" class="need">Needs your answer ›</button>
<button type="button" class="wkhead"></button><div class="log"></div><div class="wklist"></div><div class="detail"></div><div class="artview"></div><button type="button" class="wkbar"></button><div class="err"></div>
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
    x = x.replace(/`([^`\n]+)`/g, (_, c) => { const r = window.termRun && /^([a-z0-9][a-z0-9._-]*)?\$ (\S.*)$/i.exec(c); return hold(r ? window.termRun.chip(r[2], r[1] || '') : window.termRun && window.termRun.looks(c) ? window.termRun.chip(c.trim(), '') : /^https?:\/\/\S+$/.test(c) ? `<code>${link(c)}</code>` : `<code>${c}</code>`); }).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => hold(link(u, t))).replace(/https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<)])*(?!&quot;|&#39;|&lt;|&gt;)[^\s<).,;:!?*]/g, (u) => hold(link(u)));
    x = x.replace(/(^|[\s(¿¡])((?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|ai|es|eu|cloud)(?:\/[^\s<)\]]*[^\s<)\].,;:!?*])?)(?=$|[\s),.;:!?*])/gim, (_, pre, dom) => pre + hold(link(`https://${dom}`, dom))); // an address written without https:// is a link too
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
  const fence = (part) => { // a ```run block is a command for the terminal; any other block is shown as written, with its links working
    const m = /^([^\n]*)\n([\s\S]*)$/.exec(part) || [0, '', part], info = m[1].trim(), body = (/^[\w .-]*$/.test(info) ? m[2] : part).replace(/\n+$/, '');
    if (window.termRun && (/^run\b/i.test(info) || window.termRun.shell(info))) return window.termRun.block(body, /^run\b/i.test(info) ? info.replace(/^run\s*(?:on\s+)?/i, '').trim() : '');
    return `<pre>${part.replace(/^[a-z0-9]*\n/i, '').replace(/https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<)])*(?!&quot;|&#39;|&lt;|&gt;)[^\s<).,;:!?]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)}</pre>`;
  };
  function rich(t) { return esc(t).split(/```/).map((part, i) => (i % 2 ? fence(part) : blocks(part))).join(''); }

  const shots = (h) => (window.compose ? window.compose.shots(h) : h); // attached pictures show as pictures
  let who = '', file = '', pos = 0, timer = 0, open = false, run = 0, pending = [], lastStep = null, target = '', sec = '', status = '';
  let wk = '', wkl = false, workers = [], doing = ''; // the helper whose log is showing ('' = the person), whether their list is up, and who they are
  const SEC = { overview: 'Overview', activity: 'Activity', terminal: 'Live screen', notes: 'Notes', artifacts: 'Artifacts' }, holder = $('.detail', box), artsB = $('.arts', box), artView = $('.artview', box);
  let arts = [], asking = '';
  const menu = $('.menu', box), need = $('.need', box), panel = $('#panel'), root = document.documentElement;
  const qs = () => (target ? `&name=${encodeURIComponent(target)}` : '') + (wk ? `&worker=${encodeURIComponent(wk)}` : '');
  const near = () => log.scrollTop + log.clientHeight >= log.scrollHeight - 80;
  function add(m, live) {
    if (m.role === 'step') { // consecutive steps fold into one quiet line
      const tail = [...log.children].filter((x) => !x.classList.contains('typing')).pop(); // the typing row sits last: it does not break a run of steps
      if (lastStep && lastStep.el.isConnected && tail === lastStep.el) { lastStep.n++; if (!lastStep.tools.includes(m.text)) lastStep.tools.push(m.text); lastStep.el.textContent = `${lastStep.n} steps (${lastStep.tools.slice(0, 4).join(', ')}${lastStep.tools.length > 4 ? '…' : ''})`; return; }
      const el = document.createElement('div'); el.className = 'st'; el.textContent = `1 step (${m.text})`; lastStep = { el, n: 1, tools: [m.text] }; log.append(el); return;
    }
    if (m.role === 'you') { const k = m.text.slice(0, 60); const i = pending.findIndex((x) => x.k === k || m.text.includes(x.k)); if (i >= 0) { pending[i].el.remove(); pending.splice(i, 1); } }
    const el = document.createElement('div'); el.className = `m ${m.role}`;
    el.innerHTML = m.role === 'peer' ? `<b style="color:${esc(m.color)}">${esc(m.from)}</b>${esc(m.text.length > 600 ? `${m.text.slice(0, 600)}…` : m.text)}` : m.role === 'them' ? rich(m.text) : `${m.spoken ? '🎙 ' : ''}${shots(esc(m.text))}`;
    log.append(el);
    if (live && m.role === 'them' && m.text.length > 40) reveal(el, m.text);
    if (!wk) for (const x of pending) log.append(x.el); // what has not arrived yet stays last
  }
  async function poll(me) {
    if (me !== run || !open) return;
    if (!document.hidden) {
      let r = null;
      try { r = await api(`/api/chat?pos=${pos}&file=${encodeURIComponent(file)}${qs()}`); } catch { /* the office is restarting */ }
      if (me !== run) return;
      if (r) {
        const stick = near(), fresh = !who || r.reset || r.file !== file;
        if (wk && r.gone) return setWorker('', workers.length > 1); // that helper left the list
        if (fresh) { log.innerHTML = '<div class="typing"><span class="dd"><i></i><i></i><i></i></span><span class="dng"></span></div>'; lastStep = null; }
        pending = pending.filter((x) => Date.now() - x.t < 300_000); // never found in the log: it stops following the bottom
        who = r.person.herdrName; file = r.file; pos = r.pos;
        nm.textContent = r.person.name; av.style.background = r.person.color; av.textContent = r.person.name.slice(0, 1);
        const typing = $('.typing', log), nowEl = $('.dng', log);
        for (const m of r.messages) { add(m, !fresh); }
        { const all = r.workers || [], t0 = Math.min(...all.filter((x) => !x.done).map((x) => x.started)); workers = all.filter((x) => !x.done || x.ended >= t0 || x.id === wk); } /* only this round: the ones working now and the ones that finished while they ran, not helpers from earlier tasks */ box.style.setProperty('--wc', r.person.color); paintWorkers();
        if (r.screen !== undefined) { // no session log to read: show the screen as it is
          let s = $('.scr', log); if (!s) { s = document.createElement('div'); s.className = 'm them scr'; log.append(s); }
          s.textContent = r.screen || ''; if (!r.live) s.remove();
        }
        if (!r.live && !$('.note', log)) { const n = document.createElement('div'); n.className = 'note'; n.textContent = `${r.person.name} is not running in Herdr right now.${r.person.admin ? ' Start him on the computer with: omniloy-admin start' : ''}`; log.append(n); }
        if (nowEl) { // what they are doing right now: the tool in use, or the line the room shows over their head
          if (fresh) doing = ''; if ('now' in r) doing = r.now || '';
          const ag = wk ? null : (office().agents ? office().agents() : []).find((x) => x.herdrName === who), said = (ag && ag.nowDoing) || '', line = !r.working ? '' : said && doing.includes(said.replace(/…$/, '').slice(0, 30)) ? doing : [said, doing].filter(Boolean).join(' · ');
          if (nowEl.textContent !== line) nowEl.textContent = line;
        }
        if (typing) log.append(typing);
        box.classList.toggle('working', !!r.working);
        { let last = null; const fin = new Set(); for (const el of log.children) { if (el.classList.contains('you') || el.classList.contains('peer')) { if (last) fin.add(last); last = null; } else if (el.classList.contains('them') && !el.classList.contains('scr')) last = el; } if (last && !r.working) fin.add(last); for (const el of log.querySelectorAll('.m.them')) el.classList.toggle('fin', fin.has(el)); } // the answer that closes each turn stands out; what they said on the way there is quieter
        status = !r.live ? 'offline' : r.working ? 'working…' : r.blocked ? 'waiting for you' : PHONE ? '' : r.person.role; sub.textContent = sec ? SEC[sec] : status; sub.classList.toggle('work', !!r.working && !sec);
        need.classList.toggle('on', !!target && !!$('#asks.show')); // they asked something: the question and its answers are in Overview
        if (stick || r.reset) log.scrollTop = log.scrollHeight;
      }
    }
    timer = setTimeout(() => poll(me), box.classList.contains('working') || pending.length ? 1000 : 2500);
  }
  function show(name) {
    name = typeof name === 'string' ? name : '';
    if (name !== target || !open) menu.classList.remove('on');
    section('');
    box.dataset.who = name;
    if (name !== target) { wk = ''; wkl = false; workers = []; box.classList.remove('wkv', 'wkl'); paintWorkers(); status = ''; target = name; who = ''; file = ''; pos = 0; pending = []; lastStep = null; log.innerHTML = ''; nm.textContent = ''; sub.textContent = ''; av.textContent = ''; av.style.background = 'transparent'; err.textContent = ''; need.classList.remove('on'); box.classList.remove('working'); }
    box.classList.toggle('person', !!target); box.classList.toggle('admin', !target); paintArts();
    open = true; box.classList.add('on'); root.classList.add('chat-on'); root.classList.toggle('chat-person', !!target); dispatchEvent(new Event('office-chat'));
    clearTimeout(timer); poll(++run);
    if (!PHONE && !target) ta.focus(); // with a person the keys still pick people (1-9) until you click the box
  }
  function hide() { section(''); open = false; run++; clearTimeout(timer); box.classList.remove('on'); menu.classList.remove('on'); root.classList.remove('chat-on', 'chat-person'); dispatchEvent(new Event('office-chat')); }
  function close() { const person = !!target; hide(); if (person && office().select) office().select(null); }
  // "…" > a section: the same sheet shows that part of the person (what the old side panel had) instead of the messages.
  // The page keeps drawing into the same two boxes; they only move in here and back.
  function section(tab) {
    menu.classList.remove('on');
    const asks = $('#asks'), body = $('#pbody'), comp = $('#composer');
    if (tab === 'artifacts') { if (asks && body && comp && body.parentNode === holder) { comp.before(asks); comp.before(body); } }
    else if (tab && asks && body) { holder.append(asks, body); const b = document.querySelector(`#tabs [data-tab="${tab}"]`); if (b) b.click(); }
    else { tab = ''; if (asks && body && comp && body.parentNode === holder) { comp.before(asks); comp.before(body); } }
    sec = tab; box.dataset.sec = sec; asking = ''; box.classList.toggle('sec', !!sec && sec !== 'artifacts'); box.classList.toggle('art', sec === 'artifacts'); if (sec === 'artifacts') { paintArts(); loadArts(); } sub.textContent = sec ? SEC[sec] : status; if (sec) sub.classList.remove('work');
    if (!sec && open) log.scrollTop = log.scrollHeight;
  }
  // ---------------------------------------------------------------- workers: the sub-agents and workflow agents they have running
  // A strip above the box says how many there are (only while some are working); a tap lists them, a tap on one shows
  // what it was asked and what it is writing, and the bar on top goes back.
  const wkBar = $('.wkbar', box), wkHead = $('.wkhead', box), wkList = $('.wklist', box);
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };
  function paintWorkers() {
    const live = workers.filter((x) => !x.done), n = workers.length, done = n - live.length;
    wkBar.classList.toggle('on', live.length > 0);
    const icons = workers.slice(-10).map((x) => `<i class="${x.done ? 'd' : 'w'}"></i>`).join('');
    const bar = `<span class="ws">${icons}</span><b>${n} worker${n === 1 ? '' : 's'}</b><small>${live.length} working${done ? ` · ${done} done` : ''} ›</small>`;
    if (wkBar.dataset.html !== bar) { wkBar.dataset.html = bar; wkBar.innerHTML = bar; }
    const cur = wk ? workers.find((x) => x.id === wk) : null;
    const head = wk ? `‹ <b>${esc(cur ? cur.label : 'Worker')}</b><small>${cur ? (cur.done ? 'done' : 'working…') : ''}</small>` : `‹ <b>Back to the chat</b><small>${n} worker${n === 1 ? '' : 's'}</small>`;
    if (wkHead.dataset.html !== head) { wkHead.dataset.html = head; wkHead.innerHTML = head; }
    if (!wkl) return;
    const rows = n ? workers.slice().reverse().map((x) => `<button type="button" data-w="${esc(x.id)}"><i class="${x.done ? 'd' : 'w'}"></i><span><b>${esc(x.label)}</b><small>${esc([x.kind === 'workflow' ? 'workflow' : 'sub-agent', x.type, x.done ? `done ${ago(x.ended)} ago` : `working for ${ago(x.started)}`].filter(Boolean).join(' · '))}</small></span>›</button>`).join('') : '<div class="empty">No workers right now.</div>';
    if (wkList.dataset.html !== rows) { wkList.dataset.html = rows; wkList.innerHTML = rows; }
  }
  function setWorker(id, list) { // '' is the person's own chat
    wk = id || ''; wkl = !wk && !!list; file = ''; pos = 0; lastStep = null; log.innerHTML = '';
    box.classList.toggle('wkv', !!wk); box.classList.toggle('wkl', wkl);
    paintWorkers(); clearTimeout(timer); poll(++run);
  }
  wkBar.onclick = () => (workers.length === 1 ? setWorker(workers[0].id) : setWorker('', true));
  wkHead.onclick = () => (wk && workers.length > 1 ? setWorker('', true) : setWorker(''));
  wkList.onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) setWorker(b.dataset.w); };
  // new text is written out instead of dropping in whole (the session log only holds finished paragraphs, so this is
  // the closest to seeing them write)
  function reveal(el, text) {
    const t0 = performance.now(), dur = Math.min(1500, 200 + text.length * 3); let last = 0;
    const step = (t) => {
      if (!el.isConnected) return;
      const k = (t - t0) / dur;
      if (k >= 1) { el.innerHTML = rich(text); if (near()) log.scrollTop = log.scrollHeight; return; }
      if (t - last > 45) { last = t; const stick = near(); let n = text.lastIndexOf(' ', Math.floor(text.length * k)); if (n < 0) n = 0; let part = text.slice(0, n); const o = part.lastIndexOf('['); if (o >= 0 && !/^\[[^\]]*\]\([^)]*\)/.test(part.slice(o)) && /^\[[^\]\n]*\]\(/.test(text.slice(o))) part = part.slice(0, o); /* a link appears whole, never as half-written markup */ el.innerHTML = rich(part); if (stick) log.scrollTop = log.scrollHeight; }
      requestAnimationFrame(step);
    };
    el.textContent = ''; requestAnimationFrame(step);
  }
  async function loadWorkers() { // everyone on the floor: the room shows each helper as a tiny copy of the person
    const o = office(); if (!o.world || !o.world.setWorkers || !o.agents || document.hidden) return;
    let r; try { r = await api('/api/workers'); } catch { return; }
    const map = {};
    for (const a of o.agents()) { const l = (r.byName || {})[a.herdrName]; if (l) map[a.slug] = l.filter((x) => !x.done || Date.now() - x.ended < 8_000).slice(-10).map((x) => ({ id: x.id, done: x.done })); }
    o.world.setWorkers(map);
  }
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, innerHeight * 0.4)}px`; };
  async function send() {
    const text = ta.value.trim(); if (!text || !who) return;
    ta.value = ''; grow(); err.textContent = '';
    const el = document.createElement('div'); el.className = 'm you wait'; el.innerHTML = shots(esc(text)); log.append(el); log.scrollTop = log.scrollHeight;
    const p = { k: text.slice(0, 60), el, t: Date.now() }; pending.push(p);
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
  if (panel && (!window.__GUEST__ || window.__GUEST__.chats)) { // a visitor reads chats only where that building allows it
    if (window.__GUEST__) box.classList.add('ro'); // picking someone opens their chat; their panel stays underneath for the sections
    const openFor = () => { const o = office(), slug = o.selected && o.selected(), a = slug && (o.agents ? o.agents() : []).find((x) => x.slug === slug); if (a && a.herdrName) show(a.herdrName); };
    let was = panel.classList.contains('open'), last = '';
    new MutationObserver(() => {
      const on = panel.classList.contains('open'), slug = on && office().selected ? office().selected() : '';
      if (!on) { if (was && open && target) hide(); }
      else if (!was || slug !== last) openFor();
      was = on; last = slug || '';
    }).observe(panel, PHONE ? { attributes: true, attributeFilter: ['class'] } : { attributes: true, attributeFilter: ['class'], childList: true, subtree: true }); // on a computer you can pick another person while one is open
  }
  $('.stop', box).onclick = async () => { try { await api('/api/chat/stop', { name: target }); } catch (e) { err.textContent = e.message || 'Could not stop them.'; } };
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && document.activeElement !== ta) close(); });

  // ---------------------------------------------------------------- the way in
  const boot = async (n = 0) => {
    if (!office().api) { if (n < 40) setTimeout(() => boot(n + 1), 300); return; }
    window.office.chat = { open: show, close, isOpen: () => open };
    loadArts(); setInterval(() => { if (!document.hidden) loadArts(); }, 8000);
    loadWorkers(); setInterval(loadWorkers, 4000);
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
