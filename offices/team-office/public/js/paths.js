// Walking round the blocked areas of the floor (world.js): the centre desk and what a theme blocks (k.block).
// Plain geometry, no three.js, so node can test it (offices/team-office/paths.test.mjs).
// An area is a rectangle in world x/z { x0, z0, x1, z1 } plus `ex`, the same grown by a body's width. People keep
// out of `ex`; they only stand in it right beside the area, where a walk starts or ends next to it.

export const BODY = 0.3;
const E = 0.06; // a corner of the way round stands this far outside the band

export function rect(x0, z0, x1, z1, pad = BODY) {
  const r = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
  r.ex = { x0: r.x0 - pad, z0: r.z0 - pad, x1: r.x1 + pad, z1: r.z1 + pad };
  return r;
}
export const inR = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

// where the segment a-b enters the rectangle's inside (0..1), or -1 when it does not
export function segHit(ax, az, bx, bz, r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az, P = [-dx, dx, -dz, dz], Q = [ax - r.x0, r.x1 - ax, az - r.z0, r.z1 - az];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(P[i]) < 1e-9) { if (Q[i] <= 0) return -1; continue; }
    const t = Q[i] / P[i];
    if (P[i] < 0) { if (t > t1) return -1; if (t > t0) t0 = t; } else { if (t < t0) return -1; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6 ? t0 : -1;
}

// Shortest way from A to B ([x, z]) through the corners of the areas `act`, none of its legs crossing an area's
// band (or the area itself, for a leg that starts or ends inside that band). null when there is none.
function search(A, B, act, room) {
  const inside = (p, r) => inR(p[0], p[1], r);
  const blocked = (p, q) => act.some((o) => segHit(p[0], p[1], q[0], q[1], inside(p, o.ex) || inside(q, o.ex) ? o : o.ex) >= 0);
  const pts = [A, B];
  for (const o of act) {
    const e = o.ex;
    for (const c of [[e.x0 - E, e.z0 - E], [e.x1 + E, e.z0 - E], [e.x1 + E, e.z1 + E], [e.x0 - E, e.z1 + E]]) {
      if (c[0] > room.x0 && c[0] < room.x1 && c[1] > room.z0 && c[1] < room.z1 && !act.some((o2) => inside(c, o2.ex))) pts.push(c);
    }
  }
  const n = pts.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) { // Dijkstra on the visibility graph (a few dozen points at most)
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) return null;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const d = dist[u] + Math.hypot(pts[u][0] - pts[v][0], pts[u][1] - pts[v][1]);
      if (d < dist[v] && !blocked(pts[u], pts[v])) { dist[v] = d; prev[v] = u; }
    }
  }
  const way = [];
  for (let i = prev[1]; i > 0; i = prev[i]) way.unshift(pts[i]);
  return way;
}

// The way from a to b ({ x, z } each) round the areas `obs`: the corners to walk through ([x, z] each), [] when the
// straight line is clear, null when there is no way round at all (the caller then keeps the straight walk). An area
// that a or b stands inside is not in the way (one's own desk). room { x0, x1, z0, z1 }: where a corner may stand
// (inside the walls). When the bands of two areas overlap, no body fits between them and the way goes round both;
// only when that leaves no way at all is a thinner band tried.
export function route(a, b, obs, room) {
  const A = [a.x, a.z], B = [b.x, b.z];
  const act = obs.filter((o) => !inR(A[0], A[1], o) && !inR(B[0], B[1], o));
  if (!act.length) return [];
  const clear = act.every((o) => segHit(A[0], A[1], B[0], B[1], inR(A[0], A[1], o.ex) || inR(B[0], B[1], o.ex) ? o : o.ex) < 0);
  if (clear) return [];
  return search(A, B, act, room) || search(A, B, act.map((o) => rect(o.x0, o.z0, o.x1, o.z1, 0.08)), room);
}

// A place to stand, moved out of every area it falls in: the band of a blocked area (obs) or a plain rectangle
// (desks: a desk with its chair). It moves to the nearest edge that is on the floor (onFloor(x, z)) and outside the
// others; a few passes, as one move can land in the next area.
export function freeSpot(v, obs, desks = [], onFloor = () => true) {
  const all = [...obs.map((o) => o.ex), ...desks];
  const free = (x, z, skip) => onFloor(x, z) && all.every((r) => r === skip || !inR(x, z, r));
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const e of all) {
      if (!inR(v.x, v.z, e)) continue;
      const ms = [[v.x - e.x0, e.x0 - E, v.z], [e.x1 - v.x, e.x1 + E, v.z], [v.z - e.z0, v.x, e.z0 - E], [e.z1 - v.z, v.x, e.z1 + E]].sort((p, q) => p[0] - q[0]);
      const m = ms.find((c) => free(c[1], c[2], e)) || ms.find((c) => onFloor(c[1], c[2])) || ms[0];
      v.x = m[1]; v.z = m[2]; moved = true;
    }
    if (!moved) break;
  }
  return v;
}
