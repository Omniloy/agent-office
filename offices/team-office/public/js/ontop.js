// Whatever is opened from the top bar comes to the front of everything else that is open (a person's panel, a chat,
// another menu), and the one opened last is the one in front. The same file runs in every office app.
// Not on the phone layout, which stacks its own sheets.
(() => {
  const phone = () => document.documentElement.classList.contains('phone');
  const STAY = new Set(['scene', 'labels', 'panel', 'chat', 'roster', 'feed', 'cmd', 'toasts', 'banner', 'tabbar', 'term-veil', 'mic', 'mic-say', 'guest']);
  const order = [];
  const panels = () => [...document.body.children].filter((el) => el.id && !STAY.has(el.id) && !el.classList.contains('top') && getComputedStyle(el).position === 'fixed');
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const raise = (el) => { const k = order.indexOf(el); if (k >= 0) order.splice(k, 1); order.push(el); order.forEach((e, i) => { e.style.zIndex = String(40 + i); }); };
  document.addEventListener('click', (e) => {
    const bar = document.querySelector('.top'); if (!bar || phone() || !e.target.closest) return;
    if (!e.target.closest('.top')) {                                    // a click anywhere else
      bar.style.zIndex = '';                                            // the bar's menus drop back
      const chat = document.getElementById('chat'), sig = () => (chat && shown(chat) ? chat.textContent.slice(0, 80) : ''), was = sig();
      // something pressed inside a raised panel opened a person's chat: that chat is now the last thing opened, so it goes in front
      if (order.length && e.target.closest('#' + order.map((el) => el.id).join(', #'))) setTimeout(() => { const now = sig(); if (now && now !== was) { order.forEach((el) => { el.style.zIndex = ''; }); order.length = 0; } }, 300);
      return;
    }
    bar.style.zIndex = '39';                                            // the bar's own menus (More) over a person's panel
    const before = new Set(panels().filter(shown));
    const look = () => { for (const el of panels()) if (shown(el) && !before.has(el)) { before.add(el); raise(el); } };
    setTimeout(look, 0); setTimeout(look, 250); setTimeout(look, 900);  // some panels show after they load their data
  }, true);
})();
