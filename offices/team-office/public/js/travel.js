// People travelling between rooms (the same file runs in both office apps).
// Every 2 s it asks this office who is away and who is visiting:
//   GET /api/visits -> { out: [{ id, who, label, text, until }], in: [{ id, name, color, from, to, text, until }] }   (until: epoch ms)
//   out  someone of this room is talking to a person elsewhere: world.teleportOut beams them away and signs their desk
//   in   someone from elsewhere is talking to a person of this room: world.visitor beams them in beside that person
// Each id is started once, with the time it has left, so a page opened in the middle still shows people as away.
if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const EVERY = 2000, done = new Map(); // id -> the `until` it was started with
  let busy = false;
  const office = () => window.office || {};

  function apply(list, kind, now) {
    if (!Array.isArray(list)) return;
    const world = office().world;
    for (const it of list) {
      if (!it || it.id == null) continue;
      const until = Number(it.until), key = `${kind}:${it.id}`, left = (until - now) / 1000;
      if (!(left > 0.5)) continue; // over, or about to be
      const had = done.get(key);
      if (had != null && (kind === 'in' || until - had < 1500)) continue; // already started (an `out` whose end moved later is extended)
      let ok = false;
      try {
        ok = kind === 'out'
          ? world.teleportOut(it.who, { label: it.label, text: had == null ? it.text : '', dur: left })
          : world.visitor({ id: it.id, name: it.name, color: it.color, from: it.from, to: it.to, text: it.text, dur: Math.max(2, left - 4) }); // leaves room for beaming in and out
      } catch {}
      if (ok) done.set(key, until); // not there yet (room still loading, person offline): try again next round
    }
  }

  async function poll() {
    const o = office();
    if (busy || document.hidden || !o.ready || !o.api || !o.world || !o.world.teleportOut) return;
    busy = true;
    try {
      const r = await o.api('/api/visits');
      const now = Date.now();
      if (r && typeof r === 'object') { apply(r.out, 'out', now); apply(r.in, 'in', now); }
      for (const [k, until] of done) if (until < now - 60000) done.delete(k);
    } catch {} // no such route yet, or the server is away: nothing to show
    busy = false;
  }

  setInterval(poll, EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  poll();
}
