// Every link to a page on the artifacts server gets a small "copy link" button next to it. What it copies is the
// address that works from any of the owner's devices (the computer's Tailscale name), not the 127.0.0.1 one that only
// works on this computer. The same file runs in every office app.
(() => {
  const local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  let host = local ? '' : location.hostname;
  if (local) fetch('/api/artifacts', { headers: { 'x-office-token': window.__TOKEN__ || '' } }).then((r) => r.json()).then((d) => { host = (d && d.host) || ''; }).catch(() => {});
  const st = document.createElement('style');
  st.textContent = 'button.artcp { display: inline-flex !important; align-items: center; justify-content: center; align-self: center; width: 28px !important; min-width: 28px !important; height: 28px !important; min-height: 0 !important; margin: 0 0 0 4px !important; padding: 0 !important; vertical-align: middle; border-radius: 8px !important; border: 1px solid rgba(255,255,255,.18) !important; background: rgba(255,255,255,.07) !important; color: inherit !important; cursor: pointer; opacity: .75; flex: none !important; } button.artcp:hover { opacity: 1; background: rgba(255,255,255,.16) !important; } button.artcp svg { display: block !important; width: 15px !important; height: 15px !important; fill: none !important; stroke: currentColor !important; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; } button.artcp.ok { color: #7ee2a8 !important; opacity: 1; } html.phone button.artcp { width: 34px !important; min-width: 34px !important; height: 34px !important; }';
  document.head.append(st);
  const COPY = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>', OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const tag = () => {
    document.querySelectorAll('a[href*=":4340/"]:not([data-cp])').forEach((a) => {
      a.dataset.cp = '1';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'artcp'; b.title = 'Copy link'; b.setAttribute('aria-label', 'Copy link'); b.innerHTML = COPY;
      a.after(b);
    });
  };
  let due = 0;
  new MutationObserver(() => { if (!due) due = setTimeout(() => { due = 0; tag(); }, 150); }).observe(document.body, { childList: true, subtree: true });
  tag();
  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('button.artcp'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.previousElementSibling; if (!a || !a.href) return;
    const u = new URL(a.href), link = host ? `https://${host}:4340${u.pathname}${u.search}${u.hash}` : a.href;
    try { await navigator.clipboard.writeText(link); }
    catch { const t = document.createElement('textarea'); t.value = link; t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { /* nothing else to try */ } t.remove(); }
    b.classList.add('ok'); b.innerHTML = OK; b.title = host ? 'Copied: works on your devices' : 'Copied (this computer only: the phone door is closed)';
    setTimeout(() => { b.classList.remove('ok'); b.innerHTML = COPY; b.title = 'Copy link'; }, 1600);
  }, true);
})();
