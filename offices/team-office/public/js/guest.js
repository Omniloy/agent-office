// Visiting a floor of another building: you see the room as its owner does, and you can write only to the floor's
// lead; what you write becomes a request there, and the answer comes back to your own office.
// Loaded only by the guest listener (peers.mjs). The same file runs in both office apps.
const G = window.__GUEST__;
if (G) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lead = (G.lead && G.lead.name || 'the lead').split(' ')[0];
  const css = document.createElement('style');
  css.textContent = `
#cmd, #composer, #chat form, #mic, #chat .stop, #chat .arts, #chat .dots, #panel .tabs, #tabs, .chips { display: none !important; }
/* what a visitor cannot use here: the team editor, voice, connections, the terminal, and For you unless this floor shares its questions */
#btn-people, #row-people, #btn-voice, #row-voice, #btn-peers, #row-peers, #btn-term, #btn-chat, #btn-watch${G.share ? '' : ', #btn-reqs, #tabbar [data-t=you]'} { display: none !important; }
#guest { position: fixed; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 30; width: min(560px, calc(100vw - 20px)); display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 16px; background: rgba(13, 16, 28, .92); border: 1px solid rgba(255, 255, 255, .16); color: #e8ecf6; font: 14px/1.4 var(--sans, system-ui, sans-serif); box-shadow: 0 12px 34px rgba(0, 0, 0, .45); backdrop-filter: blur(10px); }
html.phone #guest { bottom: calc(var(--tab, 54px) + 10px); }
#guest .h { display: flex; align-items: center; gap: 8px; }
#guest .h b { font-weight: 600; } #guest .h small { color: #9aa6bf; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#guest .h a, #guest button { border: 1px solid rgba(255, 255, 255, .2); background: rgba(255, 255, 255, .08); color: inherit; border-radius: 10px; padding: 6px 11px; font: inherit; cursor: pointer; text-decoration: none; white-space: nowrap; }
#guest .r { display: flex; gap: 8px; align-items: flex-end; }
#guest textarea { flex: 1; min-height: 40px; max-height: 30vh; resize: none; box-sizing: border-box; border-radius: 12px; border: 1px solid rgba(255, 255, 255, .18); background: rgba(255, 255, 255, .06); color: inherit; font: 16px/1.35 var(--sans, system-ui, sans-serif); padding: 9px 11px; outline: none; }
#guest .go { background: var(--accent, #6c7cff); border-color: transparent; color: #fff; font-weight: 600; }
#guest .m { color: #9aa6bf; font-size: 12.5px; } #guest .m.err { color: #fca5a5; } #guest .m.ok { color: #86efac; }
`;
  document.head.append(css);
  const box = document.createElement('div'); box.id = 'guest';
  box.innerHTML = `<div class="h"><b>${esc(G.building || 'Another building')}</b><small>${esc(G.floor || '')} · visiting</small><button type="button" class="bk">Back to mine</button></div>
<div class="r"><textarea rows="1" placeholder="Write to ${esc(lead)}"></textarea><button type="button" class="go">Send</button></div>
<div class="m">Only ${esc(lead)} can be written to here. It arrives as a request, and the answer comes back to your office.</div>`;
  const put = () => { if (document.body) document.body.append(box); else setTimeout(put, 50); }; put();
  const ta = box.querySelector('textarea'), msg = box.querySelector('.m'), go = box.querySelector('.go');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, innerHeight * 0.3)}px`; });
  async function send() {
    const text = ta.value.trim(); if (!text) return;
    go.disabled = true; msg.className = 'm'; msg.textContent = 'Sending…';
    try {
      const r = await fetch('/api/guest/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'It did not arrive.');
      ta.value = ''; ta.style.height = 'auto'; msg.className = 'm ok'; msg.textContent = `Left with ${lead} as request #${d.id}. The answer will show in your own office, in For you.`;
    } catch (e) { msg.className = 'm err'; msg.textContent = e.message || 'It did not arrive.'; }
    go.disabled = false;
  }
  go.onclick = send;
  const home = () => { if (history.length > 1) history.back(); else location.href = `${location.protocol}//${location.hostname}:4317/`; };
  box.querySelector('.bk').onclick = home;
  // zooming all the way out of someone else's room goes back to your own city, not to a building view of theirs
  const hook = () => { if (window.office && window.office.floors) window.office.floors.show = home; else setTimeout(hook, 400); }; hook();
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !document.documentElement.classList.contains('phone')) { e.preventDefault(); send(); } });
}
