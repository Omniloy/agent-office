// Speak to the lead of this floor. The computer that runs the office transcribes (voice/office-stt.py); nothing
// is sent anywhere else.
//   More > Voice   (top bar on a computer) says whether this computer can transcribe. If it cannot, it offers to
//                  ask the lead of this floor to set it up. If it can, it switches the Speak button on for this
//                  device and lets you edit the words the transcriber should expect.
//   Speak button   tap, talk, tap. The text shows for a few seconds (tap it to correct it) and goes to the lead.
// The same file runs in the three office apps.
if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const office = () => window.office || {};
  const PHONE = document.documentElement.classList.contains('phone');
  const store = { get on() { try { return localStorage.getItem('office.voice') === '1'; } catch { return false; } }, set on(v) { try { localStorage.setItem('office.voice', v ? '1' : '0'); } catch { /* private window */ } } };

  const css = document.createElement('style');
  css.textContent = `
#mic { position: fixed; right: 16px; bottom: 18px; z-index: 12; width: 60px; height: 60px; border-radius: 50%; border: 0; display: none; place-items: center; background: var(--accent, #6c7cff); color: var(--on-accent, #fff); box-shadow: 0 8px 24px rgba(0, 0, 0, .4); cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
html.phone #mic { bottom: calc(var(--tab, 64px) + 14px); right: 14px; }
#mic.on { display: grid; }
#mic svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
#mic.rec { background: #ef4444; animation: mic-pulse 1.2s ease-in-out infinite; }
#mic.busy { background: #4b5563; }
#mic b { position: absolute; top: -8px; right: -4px; padding: 2px 7px; border-radius: 99px; background: #111827; color: #fff; font: 600 11px var(--sans, system-ui, sans-serif); display: none; }
#mic.rec b { display: block; }
@keyframes mic-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, .6), 0 8px 24px rgba(0, 0, 0, .4); } 50% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0), 0 8px 24px rgba(0, 0, 0, .4); } }
#mic-say { position: fixed; right: 16px; bottom: 90px; z-index: 12; width: min(360px, calc(100vw - 28px)); display: none; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: var(--panel, #141824); color: var(--text, #e8eaf2); font-family: var(--sans, system-ui, sans-serif); box-shadow: 0 12px 34px rgba(0, 0, 0, .45); }
html.phone #mic-say { right: 14px; bottom: calc(var(--tab, 64px) + 86px); }
#mic-say.on { display: flex; }
#mic-say small { font-size: 12px; color: var(--muted, #8d97b0); }
#mic-say .txt { font-size: 15px; line-height: 1.45; outline: none; max-height: 34vh; overflow-y: auto; white-space: pre-wrap; border-radius: 8px; }
#mic-say .txt:focus { background: rgba(255, 255, 255, .05); padding: 6px 8px; margin: -6px -8px; }
#mic-say .hd { display: flex; align-items: center; gap: 7px; }
#mic-say .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; animation: mic-wait 1.1s ease-in-out infinite; flex: none; }
#mic-say .dot.ok { background: #22c55e; animation: none; }
@keyframes mic-wait { 50% { opacity: .25; } }
#mic-say .me { font-size: 13px; line-height: 1.4; color: var(--muted, #8d97b0); padding-left: 9px; border-left: 2px solid var(--line, rgba(255,255,255,.18)); max-height: 3.9em; overflow: hidden; }
#mic-say .ans { font-size: 15px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 44vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
#mic-say .ans[hidden] { display: none; }
#mic-say .ans { position: relative; }
#mic-say .ans .pre { color: var(--muted, #8d97b0); font-size: 13px; }
#mic-say .ans.scr { font: 12px/1.45 ui-monospace, Menlo, monospace; white-space: pre; overflow-x: auto; }
#mic-say .ans code { font: 13px ui-monospace, Menlo, monospace; background: rgba(255, 255, 255, .08); padding: 1px 4px; border-radius: 4px; }
#mic-say .bar { height: 3px; border-radius: 3px; background: rgba(255, 255, 255, .12); overflow: hidden; }
#mic-say .bar i { display: block; height: 100%; width: 100%; background: var(--accent, #6c7cff); transform-origin: left; }
#mic-say.count .bar i { animation: mic-count 4s linear forwards; }
@keyframes mic-count { to { transform: scaleX(0); } }
#mic-say .acts { display: flex; gap: 8px; justify-content: flex-end; }
#mic-say button, #voice-card button { min-height: 42px; padding: 0 15px; border-radius: 11px; border: 1px solid var(--line, rgba(255,255,255,.16)); background: transparent; color: inherit; font: 500 14px var(--sans, system-ui, sans-serif); cursor: pointer; }
#mic-say button.pri, #voice-card button.pri { background: var(--accent, #6c7cff); border-color: transparent; color: var(--on-accent, #fff); font-weight: 600; }
#voice-card { position: fixed; inset: 0; z-index: 31; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(5, 7, 14, .6); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); font-family: var(--sans, system-ui, sans-serif); color: var(--text, #e8eaf2); }
#voice-card.on { display: flex; }
#voice-card .vc { width: min(460px, 100%); max-height: 86vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 16px; background: var(--panel, #141824); border: 1px solid var(--line, rgba(255,255,255,.12)); box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
#voice-card h3 { margin: 0; font-size: 17px; }
#voice-card p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--muted, #aab3c9); }
#voice-card p b { color: var(--text, #e8eaf2); font-weight: 600; }
#voice-card textarea { width: 100%; box-sizing: border-box; min-height: 120px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.14)); background: rgba(255, 255, 255, .05); color: inherit; font: 14px/1.5 var(--sans, system-ui, sans-serif); resize: vertical; }
#voice-card .acts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
#voice-card .msg { font-size: 13px; color: var(--muted, #aab3c9); min-height: 0; }
#voice-card .msg.err { color: #fca5a5; }
body.embed #mic, body.embed #mic-say, body.embed #voice-card { display: none !important; }`;
  document.head.append(css);

  const mic = document.createElement('button');
  mic.id = 'mic'; mic.type = 'button'; mic.title = 'Speak to the lead of this floor';
  mic.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg><b>0:00</b>';
  const sayBox = document.createElement('div');
  sayBox.id = 'mic-say';
  const card = document.createElement('div');
  card.id = 'voice-card'; card.innerHTML = '<div class="vc"></div>';
  document.body.append(mic, sayBox, card);

  let info = null; // what the server says: { ready, configured, model, keywords, lead }
  let entry = null; // the row or button that opens the card
  const api = (p, b) => office().api(p, b);
  const label = () => { if (!entry) return; const on = store.on && info && info.ready; if (PHONE) entry.innerHTML = `Voice<small>${on ? 'on' : 'off'}</small>`; else { entry.textContent = 'Voice'; entry.classList.toggle('on', !!on); } };
  async function refresh() { try { info = await api('/api/voice'); } catch { info = null; } mic.classList.toggle('on', !!(store.on && info && info.ready)); label(); return info; }

  // ---------------------------------------------------------------- the card: set up, switch on, keywords
  const vc = $('.vc', card);
  function showCard() {
    card.classList.add('on');
    if (!info) { vc.innerHTML = '<h3>Voice</h3><p>The office server did not answer. Try again in a moment.</p><div class="acts"><button type="button" data-close>Close</button></div>'; return; }
    const lead = info.lead ? info.lead.name : 'the lead';
    if (!info.ready) {
      vc.innerHTML = `<h3>Voice</h3><p>${info.configured ? 'The transcription service on this computer is <b>not answering</b>.' : 'This computer has <b>no transcription service</b> yet, so there is nothing to turn your voice into text.'}</p>
        <p>Do you want to give <b>${esc(lead)}</b>, the lead of this floor, the instructions to ${info.configured ? 'get it running again' : 'set it up'}? ${esc(lead)} will pick the engine that fits this computer, install it and tell you when it works.</p>
        <div class="msg"></div><div class="acts"><button type="button" data-close>Not now</button><button type="button" class="pri" data-setup>Ask ${esc(lead)}</button></div>`;
      return;
    }
    vc.innerHTML = `<h3>Voice</h3><p>This computer transcribes with <b>${esc(info.model || info.engine)}</b>. What you say goes to <b>${esc(lead)}</b>, the lead of this floor, after you have seen the text.</p>
      <div class="acts" style="justify-content:flex-start"><button type="button" class="pri" data-toggle>${store.on ? 'Hide the Speak button' : 'Show the Speak button'}</button></div>
      <p style="margin-top:6px"><b>Words to expect</b><br>Names, products and terms the transcriber should recognise. One per line or separated by commas.</p>
      <textarea spellcheck="false">${esc((info.keywords || []).join(', '))}</textarea>
      <div class="msg"></div><div class="acts"><button type="button" data-close>Close</button><button type="button" data-keys>Save words</button></div>`;
  }
  const cmsg = (t, err) => { const m = $('.msg', vc); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } };
  card.addEventListener('click', async (e) => {
    if (e.target === card || e.target.closest('[data-close]')) return card.classList.remove('on');
    if (e.target.closest('[data-setup]')) {
      const b = e.target.closest('[data-setup]'); b.disabled = true; cmsg('Sending…');
      try { const r = await api('/api/voice/setup', {}); vc.innerHTML = `<h3>Voice</h3><p><b>${esc(r.lead.name)}</b> has the instructions. You will hear from them when it works; then come back here to switch the Speak button on.</p><div class="acts"><button type="button" class="pri" data-close>OK</button></div>`; }
      catch (err) { b.disabled = false; cmsg(err.message || 'That did not work.', true); }
    }
    if (e.target.closest('[data-toggle]')) { store.on = !store.on; await refresh(); showCard(); if (store.on) card.classList.remove('on'); }
    if (e.target.closest('[data-keys]')) {
      try { const r = await api('/api/voice/keywords', { keywords: $('textarea', vc).value.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean) }); info.keywords = r.keywords; cmsg(`Saved: ${r.keywords.length} words.`); }
      catch (err) { cmsg(err.message || 'That did not work.', true); }
    }
  });
  const openCard = async () => { await refresh(); showCard(); };

  // ---------------------------------------------------------------- recording: plain 16 kHz WAV, built here
  let rec = null, state = 'idle', tick = 0, sendTimer = 0, pollTimer = 0, following = 0, WORKLET = '';
  let sink = null; // set while the chat is dictating: the text goes there instead of to the lead
  const setState = (s) => { state = s; mic.classList.toggle('rec', s === 'rec'); mic.classList.toggle('busy', s === 'busy'); dispatchEvent(new CustomEvent('office-voice', { detail: s })); };
  function bubble(html, count) { sayBox.innerHTML = html; sayBox.classList.add('on'); sayBox.classList.toggle('count', !!count); }
  const hide = () => { clearTimeout(sendTimer); clearTimeout(pollTimer); following = 0; sayBox.classList.remove('on', 'count'); };
  async function begin() {
    hide();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { if (sink) { const f = sink; sink = null; return f('', 'The microphone is not allowed for this page.'); } bubble(`<small>Microphone</small><div class="txt">${navigator.mediaDevices ? 'The microphone is not allowed for this page. Allow it in the browser or phone settings and try again.' : 'This browser cannot use the microphone here.'}</div><div class="acts"><button type="button" data-x>OK</button></div>`); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume();
    const src = ctx.createMediaStreamSource(stream), mute = ctx.createGain(), chunks = [];
    mute.gain.value = 0;
    let node;
    try { // capture on the audio thread: the 3D room keeps the page busy, and capturing from the page repeats pieces of sound
      if (!WORKLET) WORKLET = URL.createObjectURL(new Blob(["class R extends AudioWorkletProcessor { process(i) { const c = i[0] && i[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } } registerProcessor('office-rec', R);"], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(WORKLET);
      node = new AudioWorkletNode(ctx, 'office-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      node.port.onmessage = (e) => chunks.push(e.data);
    } catch { // very old browsers
      node = ctx.createScriptProcessor(4096, 1, 1); node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    rec = { stream, ctx, src, node, chunks, t0: Date.now() };
    setState('rec');
    const b = $('b', mic); b.textContent = '0:00';
    tick = setInterval(() => { const s = Math.floor((Date.now() - rec.t0) / 1000); b.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 150) end(); }, 500); // two and a half minutes at most
  }
  function wav() {
    const { chunks, ctx } = rec, n = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(n); let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    const ratio = ctx.sampleRate / 16000, m = Math.floor(n / ratio), buf = new ArrayBuffer(44 + m * 2), v = new DataView(buf);
    const str = (at, s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + m * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, m * 2, true);
    for (let i = 0; i < m; i++) { // average each stretch of input that becomes one output sample
      const a = Math.floor(i * ratio), z = Math.max(a + 1, Math.floor((i + 1) * ratio)); let s = 0;
      for (let j = a; j < z && j < n; j++) s += all[j];
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s / (z - a))) * 32767, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function end() {
    if (state !== 'rec') return;
    clearInterval(tick);
    const blob = wav();
    rec.node.disconnect(); rec.src.disconnect(); rec.stream.getTracks().forEach((t) => t.stop()); rec.ctx.close(); rec = null;
    setState('busy'); if (!sink) bubble('<small>Transcribing…</small>');
    let d;
    try {
      const r = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'x-office-token': window.__TOKEN__, 'content-type': 'audio/wav' }, body: blob });
      d = await r.json(); if (!r.ok) throw new Error(d.error || 'The transcription failed.');
    } catch (e) { setState('idle'); if (sink) { const f = sink; sink = null; return f('', e.message || 'The transcription failed.'); } bubble(`<small>Voice</small><div class="txt">${esc(e.message || 'The transcription failed.')}</div><div class="acts"><button type="button" data-x>OK</button></div>`); return; }
    setState('idle');
    const text = String(d.text || '').trim(), lead = info && info.lead;
    if (sink) { const f = sink; sink = null; return f(text, text ? '' : 'I did not catch anything.'); }
    if (!text) { bubble('<small>Voice</small><div class="txt">I did not catch anything. Tap the button and try again.</div><div class="acts"><button type="button" data-x>OK</button></div>'); sendTimer = setTimeout(hide, 3500); return; }
    bubble(`<small>To ${esc(lead ? lead.name : 'the lead')} · tap the text to correct it</small><div class="txt" contenteditable="true" spellcheck="false">${esc(text)}</div><div class="bar"><i></i></div><div class="acts"><button type="button" data-x>Cancel</button><button type="button" class="pri" data-send>Send now</button></div>`, true);
    sendTimer = setTimeout(send, 4000);
  }
  async function send() {
    clearTimeout(sendTimer);
    const t = $('.txt', sayBox), text = t ? t.innerText.trim() : '', lead = info && info.lead;
    if (!text || !lead) return hide();
    bubble('<small>Sending…</small>');
    try {
      const { results } = await api('/api/send', { to: [lead.herdrName], text: `(spoken by __OWNER__, transcribed) ${text}` });
      const bad = (results || []).find((x) => !x.ok); if (bad) throw new Error(bad.error || 'It did not arrive.');
      follow(lead, text, Date.now());
    } catch (e) { bubble(`<small>Not sent</small><div class="txt" contenteditable="true">${esc(text)}</div><small>${esc(e.message || '')}</small><div class="acts"><button type="button" data-x>Cancel</button><button type="button" class="pri" data-send>Try again</button></div>`); }
  }
  // After sending, the bubble stays and fills with what the lead writes back; nothing to tap or open.
  const rich = (t) => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  function follow(lead, text, t0) {
    const me = ++following, who = esc(lead.name);
    bubble(`<small class="hd"><i class="dot"></i><span>Sent · waiting for ${who}…</span></small><div class="me">${esc(text)}</div><div class="ans" hidden></div><div class="acts"><button type="button" data-open="${esc(lead.herdrName)}">Open ${who}</button><button type="button" data-x>Close</button></div>`);
    const hd = $('.hd span', sayBox), dot = $('.dot', sayBox), ans = $('.ans', sayBox);
    let shown = '';
    const poll = async () => {
      if (me !== following) return;
      let r = null;
      try { r = await api(`/api/voice/reply?name=${encodeURIComponent(lead.herdrName)}&age=${Date.now() - t0}&q=${encodeURIComponent(text.slice(0, 80))}`); } catch { /* the office is restarting: try again */ }
      if (me !== following) return;
      if (r) {
        if (r.text && r.text !== shown) {
          const cut = r.tail ? r.text.length - r.tail : 0, grew = r.text.startsWith(shown) && shown.length > cut; // the same piece getting longer
          shown = r.text; ans.hidden = false; ans.classList.toggle('scr', !!r.screen);
          ans.innerHTML = `${cut ? `<span class="pre">${rich(r.text.slice(0, cut))}</span>` : ''}<span class="last">${rich(r.text.slice(cut))}</span>`;
          if (r.screen) ans.scrollTop = ans.scrollHeight; else if (!grew) ans.scrollTop = $('.last', ans).offsetTop - ans.offsetTop; // start of the newest piece: earlier notes stay above
        }
        dot.classList.toggle('ok', !!r.done);
        hd.textContent = r.done ? `${lead.name} answered` : r.text ? `${lead.name} is writing…` : r.found ? `${lead.name} is working on it${r.steps ? ` · ${r.steps} step${r.steps === 1 ? '' : 's'}` : ''}…` : Date.now() - t0 > 20000 ? `${lead.name} is busy; your message is next in line…` : `Sent · waiting for ${lead.name}…`;
        if (r.done) { if (navigator.vibrate) navigator.vibrate(60); return; }
      }
      if (Date.now() - t0 > 20 * 60000) { hd.textContent = `Still no final answer from ${lead.name}. Open them to see more.`; return; }
      pollTimer = setTimeout(poll, r && r.text ? 1500 : 2200);
    };
    pollTimer = setTimeout(poll, 1200);
  }
  mic.addEventListener('click', () => { if (state === 'idle') begin(); else if (state === 'rec') end(); });
  sayBox.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) return hide();
    const op = e.target.closest('[data-open]'); if (op) { hide(); location.hash = `p=${encodeURIComponent(op.dataset.open)}`; return; }
    if (e.target.closest('[data-send]')) return send();
    if (e.target.closest('.txt[contenteditable]')) { clearTimeout(sendTimer); sayBox.classList.remove('count'); } // correcting it: nothing goes until Send
  });

  // ---------------------------------------------------------------- the way in
  if (PHONE) {
    const wait = (n = 0) => { const menu = $('#sheet-more .pmenu'); if (!menu) { if (n < 40) setTimeout(() => wait(n + 1), 300); return; }
      entry = document.createElement('button'); entry.type = 'button'; entry.onclick = openCard;
      const first = menu.firstElementChild; menu.insertBefore(entry, first ? first.nextSibling : null); label(); };
    wait();
  } else {
    const tools = $('.tools');
    if (tools) { entry = document.createElement('button'); entry.type = 'button'; entry.id = 'btn-voice'; entry.title = 'Speak to the lead of this floor'; entry.onclick = openCard; tools.insertBefore(entry, $('#btn-more', tools) || null); label(); }
  }
  const boot = (n = 0) => { if (!office().api) { if (n < 40) setTimeout(() => boot(n + 1), 300); return; } refresh(); };
  boot();
  const dictate = (fn) => { if (state === 'idle') { sink = fn; begin(); } else if (state === 'rec') end(); }; // tap to start, tap to stop
  if (window.office) window.office.voice = { open: openCard, refresh, dictate, ready: () => !!(info && info.ready) };
}
