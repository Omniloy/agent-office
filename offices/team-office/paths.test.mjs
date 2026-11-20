// Walks round the blocked areas (public/js/paths.js, what world.js walks by): run the real route() on many random
// walks in every theme's real floor, 1 to 12 desks with and without a centre person, and on random areas.
// The floors are fixtures/paths-layouts.json: world.paths() read from the page in a headless browser for each theme
// and layout (make it again when a theme moves its decor or its blocked areas). Run: node paths.test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { rect, route, freeSpot, BODY } from './public/js/paths.js';

let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const inside = (x, z, r, m = 1e-6) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m;

// Every leg of the walk a -> corners -> b, sampled every 3 cm: never inside an area (except one a or b stands in),
// never inside an area's band except right where the walk starts or ends next to it, and inside the room.
function check(a, b, areas, room, way, what) {
  const pts = [[a.x, a.z], ...way, [b.x, b.z]];
  const act = areas.filter((o) => !inside(a.x, a.z, o, 0) && !inside(b.x, b.z, o, 0));
  for (let i = 0; i < pts.length - 1; i++) {
    const [p, q] = [pts[i], pts[i + 1]], n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.03));
    if (i > 0) assert.ok(p[0] > room.x0 && p[0] < room.x1 && p[1] > room.z0 && p[1] < room.z1, `${what}: corner off the floor ${p}`);
    const near = act.filter((o) => Math.max(p[0], q[0]) > o.ex.x0 && Math.min(p[0], q[0]) < o.ex.x1 && Math.max(p[1], q[1]) > o.ex.z0 && Math.min(p[1], q[1]) < o.ex.z1);
    for (let j = 0; j <= n; j++) {
      const x = p[0] + ((q[0] - p[0]) * j) / n, z = p[1] + ((q[1] - p[1]) * j) / n;
      for (const o of near) {
        assert.ok(!inside(x, z, o, 1e-4), `${what}: leg ${i} goes through area ${[o.x0, o.z0, o.x1, o.z1]} at ${x.toFixed(2)},${z.toFixed(2)}`);
        const nearEnd = (i === 0 && inside(a.x, a.z, o.ex, 0)) || (i === pts.length - 2 && inside(b.x, b.z, o.ex, 0));
        if (!nearEnd && !o.thin) assert.ok(!inside(x, z, o.ex, 1e-3), `${what}: leg ${i} brushes area ${[o.x0, o.z0, o.x1, o.z1]} at ${x.toFixed(2)},${z.toFixed(2)}`);
      }
    }
  }
}

// ---- the real floors
const layouts = JSON.parse(fs.readFileSync(new URL('./fixtures/paths-layouts.json', import.meta.url), 'utf8'));
let walks = 0, round = 0, thin = 0;
const free = (x, z, all) => all.every((o) => !inside(x, z, o.ex, 0));
for (const [name, L] of Object.entries(layouts)) {
  const blocked = L.obs.map((r) => rect(...r)), desks = L.desks.map((r) => rect(...r, 0.15)), all = [...blocked, ...desks];
  const room = L.room;
  // where walks start and end in the office: seats, the step beside each desk, every aisle along its length, the
  // coffee spot, the wall board and whiteboard, and free places anywhere on the floor
  const places = [];
  for (const s of L.seats) places.push(s.seat, s.side);
  for (const z of L.aisles) for (let x = -11.5; x <= 11.5; x += 0.5) if (free(x, z, all)) places.push([x, z]);
  places.push(L.coffee, ...L.spots);
  for (let i = 0; i < 160; i++) { const x = room.x0 + 0.1 + rnd() * (room.x1 - room.x0 - 0.2), z = -2 + rnd() * 10.4; if (free(x, z, all)) places.push([x, z]); }
  for (let i = 0; i < 200; i++) {
    const [ax, az] = places[Math.floor(rnd() * places.length)], [bx, bz] = places[Math.floor(rnd() * places.length)];
    const a = { x: ax, z: az }, b = { x: bx, z: bz };
    let way = route(a, b, all, room);
    assert.ok(way, `${name}: no way from ${[ax, az]} to ${[bx, bz]}`);
    walks++; if (way.length) round++;
    // a way that needed the thin band (no body-wide way existed) only has to stay out of the areas themselves
    const strict = (() => { try { check(a, b, all, room, way, name); return true; } catch { return false; } })();
    if (!strict) { thin++; check(a, b, all.map((o) => ({ ...o, thin: true })), room, way, name); }
  }
  // standing spots pushed out of the areas and the row desks land on free floor
  const onFloor = (x, z) => x > room.x0 && x < room.x1 && z > room.z0 && z < 8.6;
  const stand = L.stand.map((r) => ({ x0: r[0], z0: r[1], x1: r[2], z1: r[3] }));
  for (let i = 0; i < 300; i++) {
    const v = freeSpot({ x: room.x0 + rnd() * (room.x1 - room.x0), z: -8 + rnd() * 16.5 }, blocked, stand, onFloor);
    assert.ok(onFloor(v.x, v.z), `${name}: a spot was pushed off the floor ${v.x},${v.z}`);
    const left = [...blocked.map((o) => o.ex), ...stand].filter((r) => inside(v.x, v.z, r, 1e-6));
    assert.ok(left.length <= 1, `${name}: a spot stays inside ${left.length} areas at ${v.x.toFixed(2)},${v.z.toFixed(2)}`);
    if (left.length) thin++;
  }
}
console.log(`real floors: ${Object.keys(layouts).length} layouts, ${walks} walks (${round} round an area), ${thin} needed the thin band: ok`);
assert.ok(thin < walks * 0.02, `too many walks squeezed through: ${thin}`);

// ---- random areas: whatever the decor, a way found never goes through an area
{
  const room = { x0: -12.55, x1: 12.6, z0: -8.55, z1: 8.9 };
  let found = 0, none = 0;
  for (let t = 0; t < 400; t++) {
    const areas = [];
    for (let i = 0, n = 1 + Math.floor(rnd() * 9); i < n; i++) {
      const x = -11 + rnd() * 22, z = -7 + rnd() * 15, w = 0.3 + rnd() * 3.5, d = 0.3 + rnd() * 3.5;
      areas.push(rect(x, z, x + w, z + d));
    }
    const pick = () => { for (;;) { const p = { x: room.x0 + 0.2 + rnd() * 24.8, z: room.z0 + 0.2 + rnd() * 17 }; if (areas.every((o) => !inside(p.x, p.z, o.ex, 0))) return p; } };
    const a = pick(), b = pick(), way = route(a, b, areas, room);
    if (!way) { none++; continue; }
    found++;
    let ok = true; try { check(a, b, areas, room, way, `random ${t}`); } catch { ok = false; }
    if (!ok) check(a, b, areas.map((o) => ({ ...o, thin: true })), room, way, `random ${t}`);
  }
  console.log(`random areas: ${found} ways found, ${none} walled in: ok`);
}

// ---- the cases the reviews found: a walk that meets two areas close together never goes straight through them
{
  const room = { x0: -12.55, x1: 12.6, z0: -8.55, z1: 8.9 };
  const dais = rect(-3.0, 1.55, 2.4, 6.95), cafe = rect(2.35, 4.33, 6.9, 5.2), ward = rect(4.35, 2.2, 7.4, 4.33);
  const a = { x: 4.5, z: 6.0 }, b = { x: -2.7, z: 1.1 }; // Hospital, two rows: from the coffee back to the aisle
  const way = route(a, b, [dais, cafe, ward], room);
  assert.ok(way && way.length, 'Hospital coffee walk goes round');
  check(a, b, [dais, cafe, ward], room, way, 'Hospital coffee walk');
  assert.throws(() => check(a, b, [dais, cafe, ward].map((o) => ({ ...o, thin: true })), room, [], 'straight'), /goes through/, 'the checker sees a straight walk through the counter');
  assert.deepEqual(route({ x: -5, z: -3.3 }, { x: 5, z: -3.3 }, [dais], room), [], 'a clear line stays straight');
  const own = rect(-1, -1, 1, 1);
  assert.deepEqual(route({ x: 0, z: 0 }, { x: 0, z: 5 }, [own], room), [], 'a walk out of its own area is not stopped by it');
  assert.equal(BODY, 0.3);
  console.log('known cases: ok');
}
