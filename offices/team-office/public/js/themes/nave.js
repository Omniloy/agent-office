// USS HERD: the bridge of an exploration starship (original design) that is also a space programme's launch control.
// Everything is built here from three.js primitives and canvas-painted textures: no downloaded models, images or fonts.
// See themes/index.js for the contract. The room is a cut-away deck section floating in space:
//   - space: a painted nebula sky, crisp stars, a turning ocean planet with clouds and city lights, a cratered moon;
//   - shell: hull-panelled walls, a panoramic viewport over the wall screens, a turbolift and a side viewport, deck
//     plates with lit seams, a soffit that turns amber when someone needs you; a glass balustrade on the open edges;
//   - the hero: LAUNCH BAY 1, an enclosed hangar behind the back-right corner seen through a tall hangar window: the
//     rocket HERD-7 with two boosters on its mount, the red umbilical tower with swing arms and hoses, floodlight masts
//     with soft beams, venting vapour, a gantry crane, the great door ajar on space; the launch countdown clock (big
//     amber digits) stands on the deck in front of it;
//   - command: the captain's chair on a two-tier dais in the middle of the bridge (the centre desk: Product, else
//     Lead), with a crescent command console, a tactical rail, status pylons and the helm and navigation bank in front;
//   - one station per role, each with its own body and silhouette: a J-shaped systems console with holo code panels
//     and a server rack; a white L-shaped lab bench with a fume hood and a sensor mast; a tall sloped engine console
//     with a plasma column; a first officer's crescent with leaning pylons; a round star-chart table with a star globe
//     and a telescope; a tactical console between swept shield fins with a targeting ring; an open prototyping bench
//     on legs under a gantry with a hoist; a plain ops console otherwise;
//   - the cantina in the front-left corner: people stand with their mug on the warm mat, backs to the mess bar with
//     the replicator glowing in its middle, a high table beside them; neon, menu, shelves of cups, planters;
//   - two watches: a bright day watch (the planet's sunlit face in the viewport) and a dim night watch (a crescent
//     planet with its cities, glowing consoles and pools of light, a warm cantina, the rocket floodlit);
//   - signage in Spanish, animated readouts, running lights, uniforms by division with role kit.
// Working information (wall screens, board, whiteboard, clock, desks, plates, status strips) stays readable and where
// world.js puts it. Static meshes are merged per material (Parts) and textures are painted once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ small helpers
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TAU = Math.PI * 2;
const SUN = new THREE.Vector3(0.78, 0.42, 0.46).normalize(); // the star that lights the planet and the moon (moves with the watch)
const SUN_DAY = new THREE.Vector3(0.42, 0.5, 0.76).normalize(), SUN_NIGHT = new THREE.Vector3(0.7, 0.16, -0.7).normalize();
const CYAN = 0x38d6ff, AMBER = 0xffb347, GOLD = 0xd4a62a;
const DIVISION = { mando: 0x9b1c2a, operaciones: 0xc8921c, ciencias: 0x1f6db0, visita: 0x5b6577 };
const divisionOf = (role) => (!role ? 'visita' : /product|lead|superadmin/i.test(role) ? 'mando' : /verif|research|qa|scien/i.test(role) ? 'ciencias' : 'operaciones');
const pipsOf = (role) => (/superadmin/i.test(role || '') ? 5 : /product/i.test(role || '') ? 4 : /lead/i.test(role || '') ? 3 : role ? 2 : 0);

// value noise in 3D (sampled on the sphere, so planet textures wrap without a seam)
function noise3(seed) {
  const r = rng(seed), perm = new Uint8Array(512), val = new Float32Array(256);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) val[i] = r();
  const h = (x, y, z) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const n = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const a = h(xi, yi, zi) + (h(xi + 1, yi, zi) - h(xi, yi, zi)) * u, b = h(xi, yi + 1, zi) + (h(xi + 1, yi + 1, zi) - h(xi, yi + 1, zi)) * u;
    const c = h(xi, yi, zi + 1) + (h(xi + 1, yi, zi + 1) - h(xi, yi, zi + 1)) * u, d = h(xi, yi + 1, zi + 1) + (h(xi + 1, yi + 1, zi + 1) - h(xi, yi + 1, zi + 1)) * u;
    const e = a + (b - a) * v, f = c + (d - c) * v;
    return e + (f - e) * w;
  };
  return (x, y, z, oct = 5) => {
    let s = 0, a = 0.5, t = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n(x + i * 17.3, y, z); t += a; a *= 0.5;
      const X = (0.0 * x + 0.8 * y + 0.6 * z) * 2.03, Y = (-0.8 * x + 0.36 * y - 0.48 * z) * 2.03, Z = (-0.6 * x - 0.48 * y + 0.64 * z) * 2.03;
      x = X; y = Y; z = Z;
    }
    return s / t;
  };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function canvasTex(w, h, srgb = true) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

// a flat ring sector with u running along the arc (x = r sin a, z = r cos a, like CylinderGeometry's theta);
// yIn / yOut tilt it (inner and outer edge heights)
function arcStrip(r0, r1, a0, a1, seg, yIn = 0, yOut = 0) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = a0 + (a1 - a0) * u, s = Math.sin(a), c = Math.cos(a);
    pos.push(r0 * s, yIn, r0 * c, r1 * s, yOut, r1 * c); uv.push(u, 1, u, 0);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ painted textures
// hull wall panels: tileable, rows of plates with bevels, rivets, vents and small stencils
function paintHull(g, W, H, seed, base = [43, 51, 66]) {
  const r = rng(seed);
  g.fillStyle = `rgb(${base[0] - 14},${base[1] - 14},${base[2] - 14})`; g.fillRect(0, 0, W, H);
  let y = 0;
  while (y < H) {
    const rh = Math.min(H - y, [64, 96, 128, 128, 160][Math.floor(r() * 5)]);
    let x = 0;
    while (x < W) {
      const pw = Math.min(W - x, [96, 128, 160, 192, 256][Math.floor(r() * 5)]);
      const v = Math.floor((r() - 0.5) * 12);
      g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v + 2})`; g.fillRect(x + 2, y + 2, pw - 4, rh - 4);
      const grd = g.createLinearGradient(0, y, 0, y + rh); grd.addColorStop(0, 'rgba(255,255,255,.06)'); grd.addColorStop(1, 'rgba(0,0,0,.12)');
      g.fillStyle = grd; g.fillRect(x + 2, y + 2, pw - 4, rh - 4);
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 2, y + 2, pw - 4, 2); g.fillRect(x + 2, y + 2, 2, rh - 4);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 2, y + rh - 4, pw - 4, 2); g.fillRect(x + pw - 4, y + 2, 2, rh - 4);
      g.fillStyle = 'rgba(0,0,0,.45)'; for (const [bx, by] of [[x + 9, y + 9], [x + pw - 11, y + 9], [x + 9, y + rh - 11], [x + pw - 11, y + rh - 11]]) { g.beginPath(); g.arc(bx, by, 2.6, 0, TAU); g.fill(); }
      const kind = r();
      if (kind < 0.16 && pw > 120 && rh > 80) { // vent slits
        for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + 22, y + 22 + i * ((rh - 44) / 6), pw - 44, 4); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 22, y + 26 + i * ((rh - 44) / 6), pw - 44, 1); }
      } else if (kind < 0.28 && pw > 100) { // stencil
        g.fillStyle = 'rgba(190,205,225,.20)'; g.font = '600 13px system-ui'; g.fillText(['CUB-01', 'SECC 7', 'P-2214', 'EPS', 'NO PISAR', 'CONDUCTO', 'ACCESO'][Math.floor(r() * 7)], x + 16, y + rh - 18);
      } else if (kind < 0.36 && pw > 100 && rh > 90) { // recessed hatch
        g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.strokeRect(x + 18, y + 18, pw - 36, rh - 36);
        g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.strokeRect(x + 20, y + 20, pw - 36, rh - 36);
      }
      x += pw;
    }
    y += rh;
  }
  for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.05)'; g.fillRect(r() * W, r() * H, 6 + r() * 60, 1); } // wear
}
// deck plates 4 m tile: 2x2 plates, each brushed or diamond tread, seams, bolts; plus a roughness map
function paintDeck(k) {
  const S = 1024, col = canvasTex(S, S), rough = canvasTex(S, S, false), g = col.ctx, q = rough.ctx, r = rng(7);
  g.fillStyle = '#0a0d13'; g.fillRect(0, 0, S, S); q.fillStyle = '#e6e6e6'; q.fillRect(0, 0, S, S);
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const x = px * 512 + 4, y = py * 512 + 4, w = 504, kind = (px + py) % 2;
    const v = Math.floor(r() * 8);
    g.fillStyle = `rgb(${40 + v},${46 + v},${57 + v})`; g.fillRect(x, y, w, w);
    q.fillStyle = kind ? '#8c8c8c' : '#6e6e6e'; q.fillRect(x, y, w, w);
    if (kind) { // diamond tread
      for (let yy = 0; yy < w; yy += 24) for (let xx = (yy / 24) % 2 ? 12 : 0; xx < w; xx += 24) {
        g.save(); g.translate(x + xx + 6, y + yy + 6); g.rotate(((yy / 24) % 2 ? 1 : -1) * 0.7);
        g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(-7, -1.5, 14, 3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-7, 1.5, 14, 1.5); g.restore();
        q.fillStyle = '#5a5a5a'; q.fillRect(x + xx + 1, y + yy + 4, 12, 3);
      }
    } else { // brushed with an inset panel
      for (let i = 0; i < 160; i++) { const yy = y + r() * w; g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)'; g.fillRect(x, yy, w, 1); q.fillStyle = r() < 0.5 ? '#5c5c5c' : '#7c7c7c'; q.fillRect(x, yy, w, 1); }
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 4; g.strokeRect(x + 60, y + 60, w - 120, w - 120);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2; g.strokeRect(x + 64, y + 64, w - 120, w - 120);
    }
    g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(x, y, w, 3); g.fillRect(x, y, 3, w);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x, y + w - 3, w, 3); g.fillRect(x + w - 3, y, 3, w);
    for (const [bx, by] of [[x + 18, y + 18], [x + w - 18, y + 18], [x + 18, y + w - 18], [x + w - 18, y + w - 18], [x + w / 2, y + 18], [x + w / 2, y + w - 18]]) {
      g.fillStyle = '#151a22'; g.beginPath(); g.arc(bx, by, 6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(bx - 1, by - 1, 3, 0, TAU); g.fill();
    }
  }
  for (let i = 0; i < 90; i++) { g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1; g.beginPath(); const x = r() * S, y = r() * S; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 140, y + (r() - 0.5) * 30); g.stroke(); } // scuffs
  for (const t of [col.tex, rough.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26 / 4, 18 / 4); t.anisotropy = 8; }
  return { map: col.tex, rough: rough.tex };
}
// the ship's emblem: an arrowhead with a star inside an orbit ring
function drawEmblem(g, cx, cy, s, color, fill) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.strokeStyle = color; g.lineWidth = 7; g.beginPath(); g.ellipse(0, 6, 92, 58, -0.25, 0, TAU); g.stroke();
  g.fillStyle = fill || color; g.beginPath(); g.moveTo(0, -96); g.lineTo(58, 92); g.lineTo(0, 54); g.lineTo(-58, 92); g.closePath(); g.fill();
  g.fillStyle = '#05080f'; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? 7 : 22; g.lineTo(Math.cos(a) * rr, 20 + Math.sin(a) * rr); }
  g.closePath(); g.fill();
  g.restore();
}
// a sign: a dark rounded panel with a coloured cap, a title and an optional line under it
function signTex(text, sub, { w = 1024, h = 256, accent = '#38d6ff', bg = '#070d18', ink = '#e8f6ff', subInk = '#7dd3fc', cap = true } = {}) {
  const s = canvasTex(w, h), g = s.ctx;
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, h * 0.22); g.fill();
  g.strokeStyle = accent; g.globalAlpha = 0.55; g.lineWidth = 4; g.stroke(); g.globalAlpha = 1;
  const x0 = cap ? h * 0.42 : h * 0.18;
  if (cap) { g.fillStyle = accent; g.beginPath(); g.roundRect(16, 16, h * 0.2, h - 32, h * 0.1); g.fill(); }
  g.textBaseline = 'middle'; g.fillStyle = ink; g.textAlign = 'left';
  g.font = `700 ${Math.round(h * (sub ? 0.36 : 0.46))}px system-ui`; g.letterSpacing = `${Math.round(h * 0.03)}px`;
  g.fillText(text, x0, sub ? h * 0.38 : h * 0.52, w - x0 - 24);
  if (sub) { g.font = `500 ${Math.round(h * 0.2)}px system-ui`; g.letterSpacing = '1px'; g.fillStyle = subInk; g.fillText(sub, x0 + 2, h * 0.74, w - x0 - 24); }
  return s.tex;
}
// the holo table's planet: ocean as faint scanlines, continents as brighter cyan with lit coastlines (from the
// planet's own day map, so the hologram shows the same world as the viewport)
function holoPlanetTex(day) {
  const W = 512, H = 256, s = canvasTex(W, H), g = s.ctx;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const src = day && day.image;
  if (src && src.getContext) {
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tg = tmp.getContext('2d'); tg.drawImage(src, 0, 0, W, H);
    const D = tg.getImageData(0, 0, W, H).data, O = g.createImageData(W, H), land = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) land[i] = D[i * 4] > D[i * 4 + 2] - 6 ? 1 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, l = land[i], coast = l && (!land[i - 1] || !land[i + 1] || !land[i - W] || !land[i + W]);
      const scan = y % 4 < 2 ? 1 : 0.35;
      const v = coast ? 1 : l ? 0.5 * scan : 0.12 * scan;
      O.data[i * 4] = 40 * v; O.data[i * 4 + 1] = 200 * v; O.data[i * 4 + 2] = 255 * v; O.data[i * 4 + 3] = 255;
    }
    g.putImageData(O, 0, 0);
  }
  g.strokeStyle = 'rgba(120,220,255,.35)'; g.lineWidth = 1;
  for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo((i * W) / 12, 0); g.lineTo((i * W) / 12, H); g.stroke(); }
  for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(0, (j * H) / 6); g.lineTo(W, (j * H) / 6); g.stroke(); }
  s.tex.wrapS = THREE.RepeatWrapping;
  return s.tex;
}
// soft round sprite (glows, stars, halos)
function radialTex(stops, size = 128) {
  const s = canvasTex(size, size), g = s.ctx, gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return s.tex;
}

// the planet: ocean world with continents, ice caps, clouds and city lights (equirectangular, sampled on the sphere)
function paintPlanet() {
  const W = 768, H = 384, n = noise3(42), m = noise3(1337);
  const day = canvasTex(W, H), night = canvasTex(W, H, false), clouds = canvasTex(W, H, false);
  const D = day.ctx.createImageData(W, H), N = night.ctx.createImageData(W, H), Cl = clouds.ctx.createImageData(W, H);
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * TAU, x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      const wx = m(x * 2 + 9, y * 2, z * 2, 2) - 0.5, h = n(x * 1.6 + 3 + wx, y * 1.6 + wx, z * 1.6, 6), sea = 0.53;
      let c;
      if (h < sea) c = lerp3([6, 30, 66], [22, 112, 140], sstep(0.36, sea, h));
      else {
        const e = (h - sea) / (1 - sea);
        c = e < 0.04 ? [176, 160, 116] : e < 0.25 ? lerp3([62, 104, 58], [104, 112, 60], e / 0.25) : e < 0.5 ? lerp3([128, 104, 64], [150, 118, 84], (e - 0.25) / 0.25) : lerp3([150, 132, 116], [228, 232, 236], sstep(0.55, 0.8, e));
      }
      const ice = sstep(1.12, 1.3, Math.abs(lat) + (m(x * 3, y * 3, z * 3, 3) - 0.5) * 0.35);
      c = lerp3(c, [232, 240, 246], ice);
      const o = (j * W + i) * 4;
      D.data[o] = c[0]; D.data[o + 1] = c[1]; D.data[o + 2] = c[2]; D.data[o + 3] = 255;
      const city = h > sea + 0.012 && ice < 0.2 ? Math.pow(Math.max(0, m(x * 14, y * 14, z * 14, 3) - 0.48) * 3.2, 2.2) * (h < sea + 0.12 ? 1.4 : 0.6) : 0;
      N.data[o] = N.data[o + 1] = N.data[o + 2] = Math.min(255, city * 255); N.data[o + 3] = 255;
      const cc = sstep(0.5, 0.74, m(x * 2.1 + 5, y * 4.2, z * 2.1, 5)) * (0.55 + 0.45 * sstep(0.2, 0.9, Math.abs(Math.sin(lat * 3))));
      Cl.data[o] = Cl.data[o + 1] = Cl.data[o + 2] = Math.min(255, cc * 255); Cl.data[o + 3] = 255;
    }
  }
  day.ctx.putImageData(D, 0, 0); night.ctx.putImageData(N, 0, 0); clouds.ctx.putImageData(Cl, 0, 0);
  for (const t of [day.tex, night.tex, clouds.tex]) { t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; }
  return { day: day.tex, night: night.tex, clouds: clouds.tex };
}
function paintMoon() {
  const W = 256, H = 128, n = noise3(9), s = canvasTex(W, H), D = s.ctx.createImageData(W, H), r = rng(5);
  const craters = Array.from({ length: 40 }, () => { const a = r() * TAU, b = (r() - 0.5) * 2.6; return [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a), 0.04 + r() * 0.16]; });
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI;
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * TAU, x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      let v = 0.42 + (n(x * 3, y * 3, z * 3, 5) - 0.5) * 0.5;
      for (const [cx, cy, cz, cr] of craters) { const d = Math.hypot(x - cx, y - cy, z - cz) / cr; if (d < 1.15) v += d < 0.85 ? -0.1 : 0.12 * (1.15 - d) / 0.3; }
      const o = (j * W + i) * 4, c = Math.max(0, Math.min(255, v * 255));
      D.data[o] = c; D.data[o + 1] = c * 0.97; D.data[o + 2] = c * 0.94; D.data[o + 3] = 255;
    }
  }
  s.ctx.putImageData(D, 0, 0); s.tex.wrapS = THREE.RepeatWrapping; s.tex.needsUpdate = true;
  return s.tex;
}
// the sky: deep space with a band of nebula, computed per pixel on the sphere (no seam, no dithering artefacts) and
// brightest where the viewport looks out. Mapped on a sphere turned by PI (see the dome in shell).
function paintSky() {
  const w = 1024, h = 512, n = noise3(77), q = noise3(5), low = canvasTex(w, h), D = low.ctx.createImageData(w, h);
  const nb = new THREE.Vector3(0.18, 1, 0.32).normalize(), core = new THREE.Vector3(-0.32, 0.02, -0.95).normalize();
  for (let j = 0; j < h; j++) {
    const th = ((j + 0.5) / h) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i < w; i++) {
      const ph = ((i + 0.5) / w) * TAU, x = Math.cos(ph) * st, y = ct, z = -Math.sin(ph) * st; // world direction (dome turned by PI)
      const band = Math.exp(-(((x * nb.x + y * nb.y + z * nb.z) / 0.24) ** 2));
      const ang = Math.acos(Math.max(-1, Math.min(1, x * core.x + y * core.y + z * core.z))), em = Math.exp(-((ang / 0.42) ** 2));
      const f = n(x * 2.2, y * 2.2, z * 2.2, 5), g = q(x * 3.1, y * 3.1, z * 3.1, 3);
      const dust = 1 - 0.75 * sstep(0.52, 0.66, n(x * 5 + 3, y * 5, z * 5, 3)) * band;
      const d = Math.max(0, band * (f - 0.28) * 1.9) * dust, e = Math.max(0, em * (f - 0.3) * 2.6) * dust;
      const r = 2 + d * (40 + 70 * g) + e * (230 * g + 60), gg = 3 + d * (45 + 10 * g) + e * (70 + 90 * (1 - g)), b = 9 + d * (140 + 40 * (1 - g)) + e * (150 + 60 * (1 - g));
      const o = (j * w + i) * 4;
      D.data[o] = Math.min(255, r); D.data[o + 1] = Math.min(255, gg); D.data[o + 2] = Math.min(255, b); D.data[o + 3] = 255;
    }
  }
  low.ctx.putImageData(D, 0, 0);
  const W = 2048, H = 1024, s = canvasTex(W, H), c = s.ctx, r = rng(3);
  c.imageSmoothingQuality = 'high'; c.drawImage(low.canvas, 0, 0, W, H);
  for (let i = 0; i < 7000; i++) { const b = r(); c.fillStyle = `rgba(${200 + b * 55},${210 + b * 45},255,${0.12 + b * 0.45})`; c.fillRect(r() * W, r() * H, 1, 1); }
  return s.tex;
}
// the room seen in reflections: dark, with cool light strips and a bright viewport (replaces the white room)
function bridgeEnv(renderer) {
  const sc = new THREE.Scene(), em = (c, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide });
  sc.add(new THREE.Mesh(new THREE.BoxGeometry(30, 12, 30), new THREE.MeshBasicMaterial({ color: 0x0b0f18, side: THREE.BackSide })));
  const add = (w, h, c, i, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), em(c, i)); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); sc.add(m); };
  add(26, 4, 0x3b5a9a, 1.4, 0, 3, -14.5); // viewport
  for (let i = -2; i <= 2; i++) add(1.2, 24, 0xdbe8ff, 3, i * 5, 5.8, 0, 0, Math.PI / 2); // ceiling strips
  add(28, 0.3, CYAN, 4, 0, 0.3, -14.5); add(0.3, 28, CYAN, 4, -14.5, 0.3, 0, Math.PI / 2);
  add(3, 3, AMBER, 2, 10, 2, 12, Math.PI);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.04);
  pm.dispose();
  return rt.texture;
}

// animated readouts shared by every console (one canvas each, repainted a few times a second)
const UI = ['#38d6ff', '#ffb347', '#ff6b8b', '#7c9cff', '#4ade80', '#c4a7ff'];
function paintReadoutA(g, t) { // bars, a waveform, numbers
  const W = 512, H = 256;
  g.fillStyle = '#040912'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffb347'; g.beginPath(); g.roundRect(8, 8, 120, 34, 17); g.fill();
  g.fillStyle = '#7c9cff'; g.beginPath(); g.roundRect(136, 8, 200, 34, 6); g.fill();
  g.fillStyle = '#c4a7ff'; g.beginPath(); g.roundRect(344, 8, 160, 34, 17); g.fill();
  g.fillStyle = '#040912'; g.font = '700 20px system-ui'; g.textBaseline = 'middle';
  g.fillText('SIST', 22, 26); g.fillText(`${String(Math.floor(4000 + (t * 37) % 5000))}-${String(Math.floor(t * 3) % 100).padStart(2, '0')}`, 150, 26); g.fillText('ENL 4', 362, 26);
  for (let i = 0; i < 14; i++) {
    const v = 0.25 + 0.7 * Math.abs(Math.sin(t * (0.9 + i * 0.23) + i * 1.7) * Math.cos(t * 0.37 + i));
    g.fillStyle = UI[i % 3 === 0 ? 0 : i % 3 === 1 ? 3 : 4]; g.fillRect(14 + i * 17, 230 - v * 160, 11, v * 160);
  }
  g.strokeStyle = '#38d6ff'; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= 230; x += 4) { const y = 120 + Math.sin(x * 0.07 + t * 4) * 26 * Math.sin(x * 0.013 + t) + Math.sin(x * 0.31 + t * 9) * 5; x ? g.lineTo(270 + x, y) : g.moveTo(270, y); }
  g.stroke();
  g.strokeStyle = 'rgba(56,214,255,.3)'; g.lineWidth = 1; g.strokeRect(266, 60, 236, 120);
  g.font = '600 19px Menlo, monospace'; g.fillStyle = '#ffb347';
  g.fillText(`FLUJO ${(Math.sin(t * 0.7) * 40 + 60).toFixed(1)}`, 272, 202);
  g.fillStyle = '#4ade80'; g.fillText(`${(97 + Math.sin(t * 0.5) * 2).toFixed(1)} %`, 420, 228);
  g.fillStyle = '#7c9cff'; g.fillText(`OK · ${Math.floor(t) % 60}`, 272, 228);
}
function paintReadoutB(g, t, seed) { // keypad of lit pads (desk surfaces)
  const W = 512, H = 256, r = rng(seed + Math.floor(t * 2.5));
  g.fillStyle = '#03070e'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) {
    const on = r(), c = (x * 7 + y * 3) % 11 === 0 ? '#ffb347' : (x + y) % 3 ? '#38d6ff' : '#7c9cff';
    g.fillStyle = c; g.globalAlpha = on < 0.18 ? 0.9 : 0.16;
    g.beginPath(); g.roundRect(10 + x * 50, 12 + y * 48, x % 4 === 3 ? 40 : 42, 38, 8); g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#38d6ff'; g.fillRect(10, 252, ((t * 0.2) % 1) * 490, 3);
}
function paintRadar(g, t) {
  const S = 256, c = S / 2;
  g.fillStyle = '#020a10'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(74,222,128,.35)'; g.lineWidth = 2;
  for (const rr of [30, 60, 90, 118]) { g.beginPath(); g.arc(c, c, rr, 0, TAU); g.stroke(); }
  g.beginPath(); g.moveTo(c - 120, c); g.lineTo(c + 120, c); g.moveTo(c, c - 120); g.lineTo(c, c + 120); g.stroke();
  const a = (t * 1.4) % TAU, gr = g.createConicGradient ? g.createConicGradient(a - 0.9, c, c) : null;
  if (gr) { gr.addColorStop(0, 'rgba(74,222,128,0)'); gr.addColorStop(0.14, 'rgba(74,222,128,.55)'); gr.addColorStop(0.1401, 'rgba(74,222,128,0)'); g.fillStyle = gr; g.beginPath(); g.arc(c, c, 118, 0, TAU); g.fill(); }
  for (let i = 0; i < 7; i++) {
    const ba = i * 2.3 + 0.4, br = 26 + ((i * 47) % 88), age = ((a - ba) % TAU + TAU) % TAU;
    g.fillStyle = i === 2 ? `rgba(255,179,71,${Math.max(0.15, 1 - age / 3)})` : `rgba(140,255,180,${Math.max(0.1, 1 - age / 3)})`;
    g.beginPath(); g.arc(c + Math.cos(ba) * br, c + Math.sin(ba) * br, i === 2 ? 6 : 4, 0, TAU); g.fill();
  }
  g.fillStyle = '#4ade80'; g.font = '600 15px Menlo, monospace'; g.fillText(`DIST ${(1.42 + Math.sin(t * 0.2) * 0.1).toFixed(2)} UA`, 8, 18);
}
// the ship status strip above the board; alert when someone needs you
function missionDay(d) { const y0 = new Date(d.getFullYear(), 0, 1); return `D+${Math.floor((d - y0) / 864e5) + 1}`; } // the day of the mission (of the year)
function paintStatus(g, t, alert, night, launch) {
  const W = 2048, H = 160;
  g.fillStyle = '#050a14'; g.fillRect(0, 0, W, H);
  const blink = alert ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3)) : 1;
  g.globalAlpha = blink; g.fillStyle = alert ? '#fbbf24' : '#34d399'; g.beginPath(); g.roundRect(10, 14, 600, H - 28, 60); g.fill(); g.globalAlpha = 1;
  g.fillStyle = '#050a14'; g.textBaseline = 'middle'; g.font = '800 52px system-ui'; g.letterSpacing = '4px';
  g.fillText(alert ? 'ALERTA AMARILLA' : 'CONDICIÓN VERDE', 52, H / 2 + 2, 540);
  g.letterSpacing = '2px';
  const items = alert ? [['TRIPULACIÓN', 'alguien te necesita'], ['ESCUDOS', '100 %'], ['DÍA DE MISIÓN', missionDay(new Date())]]
    : [['ESCUDOS', '100 %'], ['ÓRBITA', `${Math.round(412 + Math.sin(t * 0.05) * 3)} km`], launch ? ['LANZAMIENTO', launch] : ['RUMBO', '047 · 12'], [night ? 'TURNO' : 'DÍA DE MISIÓN', night ? 'de noche' : missionDay(new Date())]];
  let x = 650;
  for (const [a, b] of items) {
    g.fillStyle = '#7c9cff'; g.fillRect(x, 26, 8, H - 52);
    g.fillStyle = '#7dd3fc'; g.font = '600 30px system-ui'; g.fillText(a, x + 26, 52, 320);
    g.fillStyle = '#eaf6ff'; g.font = '700 44px system-ui'; g.fillText(b, x + 26, 106, 320);
    x += Math.max(330, Math.min(470, 60 + Math.max(g.measureText(b).width, (g.font = '600 30px system-ui', g.measureText(a).width))));
  }
}

function paintShift(g, night) {
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = night ? '#120d2a' : '#071120'; g.beginPath(); g.roundRect(4, 4, 504, 120, 26); g.fill();
  g.strokeStyle = night ? '#a78bfa' : 'rgba(125,211,252,.5)'; g.lineWidth = 4; g.stroke();
  g.fillStyle = night ? '#a78bfa' : '#38d6ff'; g.beginPath(); g.arc(56, 64, 22, 0, TAU); g.fill();
  if (night) { g.fillStyle = '#120d2a'; g.beginPath(); g.arc(66, 56, 20, 0, TAU); g.fill(); }
  g.fillStyle = night ? '#e9e3ff' : '#dff4ff'; g.textBaseline = 'middle'; g.font = '800 40px system-ui'; g.letterSpacing = '4px';
  g.fillText(night ? 'TURNO DE NOCHE' : 'TURNO DE DÍA', 100, 48, 390);
  g.font = '500 26px system-ui'; g.letterSpacing = '2px'; g.fillStyle = night ? '#c4b5fd' : '#7dd3fc';
  g.fillText(night ? 'Gamma · tripulación reducida' : 'Alfa · todos los puestos', 102, 92, 390);
}

// ------------------------------------------------------------------ Parts: static geometry merged per material
// Each add() bakes its transform (and the push()ed parent transforms) into the geometry; flush() makes one mesh per
// material. A station or a prop is then a handful of draw calls instead of a hundred.
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
class Parts {
  constructor() { this.b = new Map(); this.st = [new THREE.Matrix4()]; }
  get top() { return this.st[this.st.length - 1]; }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    this.st.push(this.top.clone().multiply(new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, s, s)))); return this;
  }
  pop() { if (this.st.length > 1) this.st.pop(); return this; }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)).premultiply(this.top);
    let g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
    g.applyMatrix4(_m4);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    let l = this.b.get(mat); if (!l) this.b.set(mat, (l = [])); l.push(g);
    return g;
  }
  box(w, h, d, m, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz); }
  rbox(w, h, d, r, m, x, y, z, rx, ry, rz) { return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), m, x, y, z, rx, ry, rz); }
  cyl(rt, rb, h, m, x, y, z, rx, ry, rz, seg = 20, open = false, t0 = 0, tl = TAU) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl), m, x, y, z, rx, ry, rz); }
  sph(r, m, x, y, z, sx = 1, sy = 1, sz = 1, ws = 16, hs = 10) { return this.add(new THREE.SphereGeometry(r, ws, hs), m, x, y, z, 0, 0, 0, sx, sy, sz); }
  tor(r, t, m, x, y, z, rx = 0, ry = 0, rz = 0, arc = TAU, rs = 8, ts = 32) { return this.add(new THREE.TorusGeometry(r, t, rs, ts, arc), m, x, y, z, rx, ry, rz); }
  pl(w, h, m, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.PlaneGeometry(w, h), m, x, y, z, rx, ry, rz); }
  // a bar from a to b ([x, y, z] in the current frame)
  rod(a, b, r, m, seg = 8, box = false) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); if (L < 1e-5) return null;
    const g = box ? new THREE.BoxGeometry(r * 2, L, r * 2) : new THREE.CylinderGeometry(r, r, L, seg);
    _q.setFromUnitVectors(_up, _d.normalize()); _e.setFromQuaternion(_q);
    return this.add(g, m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, _e.x, _e.y, _e.z);
  }
  // a tube through points ([x, y, z] list)
  tube(pts, r, m, seg = 24, rs = 8) { return this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, rs, false), m); }
  ext(shape, depth, m, x, y, z, rx, ry, rz, bevel = 0) { return this.add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 }), m, x, y, z, rx, ry, rz); }
  flush(parent, { cast = true, recv = true } = {}) {
    const out = [];
    for (const [m, list] of this.b) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!g) { console.warn('nave: merge failed'); continue; }
      if (g !== list[0]) for (const x of list) x.dispose();
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = cast && !m.isMeshBasicMaterial && !m.transparent; mesh.receiveShadow = recv && !m.isMeshBasicMaterial;
      if (m.transparent) mesh.renderOrder = 1;
      parent.add(mesh); out.push(mesh);
    }
    this.b.clear();
    return out;
  }
}
// a cylinder whose texture v runs from v0 (bottom) to v1 (top): pieces of one painted skin (the rocket)
function skinCyl(rt, rb, h, v0, v1, seg = 40) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  return g;
}

// ------------------------------------------------------------------ painted textures (round 2)
const ROCKET = { Y0: 0.42, Y1: 8.15 }; // the part of the rocket the skin covers (rocket units)
const rv = (y) => (y - ROCKET.Y0) / (ROCKET.Y1 - ROCKET.Y0);
// the rocket's skin: white with the black roll pattern, panel lines, the name, the emblem and soot at the bottom
function paintRocket() {
  const W = 512, H = 2048, s = canvasTex(W, H), g = s.ctx, r = rng(71);
  const Y = (y) => (1 - rv(y)) * H; // canvas row of a rocket height
  g.fillStyle = '#eef1f4'; g.fillRect(0, 0, W, H);
  const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, Y(y1), W, Y(y0) - Y(y1)); };
  const quads = (y0, y1, first) => { for (let i = 0; i < 4; i++) if ((i + first) % 2 === 0) { g.fillStyle = '#16181d'; g.fillRect((i * W) / 4, Y(y1), W / 4, Y(y0) - Y(y1)); } };
  quads(0.85, 1.75, 1); // roll pattern, low
  quads(3.12, 3.7, 0); // and high on the first stage
  band(3.7, 3.79, '#16181d'); band(3.98, 4.06, '#16181d'); band(5.94, 6.0, '#16181d');
  band(6.32, 6.56, '#16181d'); g.fillStyle = '#16181d'; g.fillRect(W * 0.08, Y(7.3), W * 0.16, Y(6.56) - Y(7.3)); g.fillRect(W * 0.58, Y(7.3), W * 0.16, Y(6.56) - Y(7.3));
  band(7.3, 7.4, '#3a3f4a'); for (let i = 0; i < 24; i++) { g.fillStyle = i % 3 ? '#6b7280' : '#d4a62a'; g.fillRect(i * (W / 24) + 4, Y(7.39), W / 24 - 8, Y(7.31) - Y(7.39)); }
  band(7.4, 7.75, '#dfe3e8'); band(7.75, 8.15, '#f4f6f8');
  // panel lines: rings and stringers
  for (let y = 0.95; y < 8.1; y += 0.22) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, Y(y), W, 2); }
  for (let i = 0; i < 64; i++) { g.fillStyle = 'rgba(0,0,0,.045)'; g.fillRect((i * W) / 64, Y(3.7), 1, Y(0.85) - Y(3.7)); }
  for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect((i * W) / 16, 0, 2, H); }
  // the name, read top to bottom on the side facing the bridge (u 0.5)
  g.save(); g.fillStyle = '#16181d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 96px system-ui';
  ['H', 'E', 'R', 'D'].forEach((c, i) => g.fillText(c, W * 0.5, Y(3.0) + i * ((Y(1.95) - Y(3.0)) / 3)));
  g.restore();
  // the ship emblem and the mission on the second stage
  drawEmblem(g, W * 0.5, Y(5.25), 0.42, '#16181d', '#b91c1c');
  g.fillStyle = '#16181d'; g.textAlign = 'center'; g.font = '800 40px system-ui'; g.fillText('HERD-7', W * 0.5, Y(4.55));
  g.font = '700 22px system-ui'; g.fillText('MISIÓN LUNAR', W * 0.5, Y(4.38));
  g.fillStyle = '#b91c1c'; g.fillRect(W * 0.5 - 70, Y(4.25), 140, 6);
  // soot and wear near the engines
  const gr = g.createLinearGradient(0, Y(1.15), 0, Y(0.42)); gr.addColorStop(0, 'rgba(30,26,22,0)'); gr.addColorStop(1, 'rgba(30,26,22,.75)'); g.fillStyle = gr; g.fillRect(0, Y(1.15), W, Y(0.42) - Y(1.15));
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 8); }
  // frost on the cryogenic tanks: pale streaks running down over the first stage and its black roll pattern
  for (let i = 0; i < 520; i++) { const x = r() * W, y0 = Y(3.65 - r() * 2.6), h = 8 + r() * 70; g.fillStyle = `rgba(226,238,252,${0.08 + r() * 0.22})`; g.fillRect(x, y0, 1 + r() * 2.5, h); }
  for (let i = 0; i < 60; i++) { const x = r() * W, y = Y(3.7 - r() * 0.2); g.fillStyle = 'rgba(235,244,255,.5)'; g.fillRect(x, y, 4 + r() * 10, 3); }
  // the stage separation lines and the hatch on the second stage
  for (const y of [3.74, 6.0, 7.32]) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, Y(y), W, 3); }
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.strokeRect(W * 0.5 - 26, Y(5.75), 52, 40); g.strokeRect(W * 0.27 - 14, Y(4.9), 28, 22);
  s.tex.anisotropy = 8;
  return s.tex;
}
// yellow and black hazard stripes (tileable)
function hazardTex(rep = 1) {
  const s = canvasTex(256, 64), g = s.ctx;
  g.fillStyle = '#111317'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#e5b02a'; for (let i = -64; i < 320; i += 64) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 32, 64); g.lineTo(i + 64, 0); g.lineTo(i + 32, 0); g.fill(); }
  s.tex.wrapS = s.tex.wrapT = THREE.RepeatWrapping; s.tex.repeat.set(rep, 1);
  return s.tex;
}
// a soft puff of vapour
function puffTex() {
  const S = 128, s = canvasTex(S, S), g = s.ctx, r = rng(13);
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = r() * 26, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, rr = 18 + r() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  return s.tex;
}
// the launch countdown clock (like the big one at the press site): the mission, huge amber digits over their unlit
// segments, and the go / hold lights
function paintClock(g, left, hold, go) {
  const W = 1024, H = 410;
  g.fillStyle = '#020305'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,179,71,.55)'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12);
  g.fillStyle = '#ffb347'; g.fillRect(6, 6, W - 12, 58);
  g.textBaseline = 'middle'; g.fillStyle = '#05070c'; g.font = '800 38px system-ui'; g.letterSpacing = '8px'; g.textAlign = 'left';
  g.fillText(go ? '¡DESPEGUE! HERD-7' : hold ? 'PAUSA PROGRAMADA' : 'LANZAMIENTO HERD-7', 30, 37, 640);
  g.textAlign = 'right'; g.letterSpacing = '4px'; g.fillText('BAHÍA 1', W - 30, 37, 260);
  const m = Math.floor(left / 60) % 60, s = left % 60, p = (n) => String(n).padStart(2, '0');
  g.textAlign = 'center'; g.font = '700 236px Menlo, monospace'; g.letterSpacing = '6px';
  g.fillStyle = 'rgba(255,150,40,.07)'; g.fillText('−88:88', W / 2, 212, W - 60);
  g.shadowColor = hold ? '#fbbf24' : '#ff8a1e'; g.shadowBlur = 22; g.fillStyle = hold ? '#ffd45a' : '#ffa733';
  g.fillText(`−${p(m)}:${p(s)}`, W / 2, 212, W - 60); g.shadowBlur = 0;
  g.letterSpacing = '3px'; g.font = '700 34px system-ui';
  [['COMBUSTIBLE', '#4ade80'], ['METEO', '#4ade80'], ['TRIPULACIÓN', hold ? '#fbbf24' : '#4ade80']].forEach(([t, c], i) => {
    const x = 120 + i * 300; g.fillStyle = c; g.beginPath(); g.arc(x - 34, 362, 13, 0, TAU); g.fill(); g.fillStyle = '#d7ecff'; g.textAlign = 'left'; g.fillText(t, x - 12, 364, 250);
  });
  g.letterSpacing = '0px';
}
// the bay's back wall: its name in big letters between hazard bands
function paintBayWall() {
  const W = 1024, H = 512, s = canvasTex(W, H), g = s.ctx;
  paintHull(g, W, H, 33, [38, 44, 56]);
  g.save(); g.beginPath(); g.rect(0, H - 70, W, 50); g.clip(); for (let i = -64; i < W + 64; i += 56) { g.fillStyle = '#e5b02a'; g.beginPath(); g.moveTo(i, H - 20); g.lineTo(i + 28, H - 20); g.lineTo(i + 56, H - 70); g.lineTo(i + 28, H - 70); g.fill(); } g.restore();
  g.fillStyle = 'rgba(226,232,240,.85)'; g.font = '900 86px system-ui'; g.letterSpacing = '10px'; g.textBaseline = 'middle';
  g.fillText('BAHÍA 1', 60, 120, W - 120);
  g.font = '700 40px system-ui'; g.letterSpacing = '6px'; g.fillStyle = 'rgba(253,224,71,.8)'; g.fillText('ZONA DE LANZAMIENTO', 64, 210, W - 120);
  g.font = '600 30px system-ui'; g.fillStyle = 'rgba(190,205,225,.6)'; g.fillText('Prohibido el paso sin traje · Nivel 0', 64, 268, W - 120);
  g.letterSpacing = '0px';
  return s.tex;
}
// a lamp bank: rows of bright cells (floodlights)
function lampBankTex() {
  const s = canvasTex(128, 64), g = s.ctx;
  g.fillStyle = '#20242c'; g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) { const gr = g.createRadialGradient(18 + x * 31, 16 + y * 32, 2, 18 + x * 31, 16 + y * 32, 14); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#fff3d6'); gr.addColorStop(1, '#8a7a5a'); g.fillStyle = gr; g.beginPath(); g.arc(18 + x * 31, 16 + y * 32, 13, 0, TAU); g.fill(); }
  return s.tex;
}
// scrolling code in a dark editor (systems console)
const CODE = ['const curso = rumbo(047, 12);', 'if (escudos < 0.8) alerta();', 'await motor.encender(3);', 'for (const s of sensores) {', '  s.calibrar(0.02);', '}', 'export function lanzar(t) {', '  return cuenta(t).then(ok);', '// TODO: revisar telemetría', 'log("órbita estable");', 'npm test  ✓ 128 ok', 'git push origin main'];
function paintCode(g, t) {
  const W = 256, H = 256, off = Math.floor(t * 2.2);
  g.fillStyle = '#060b14'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#111b2c'; g.fillRect(0, 0, 26, H);
  g.font = '600 15px Menlo, monospace'; g.textBaseline = 'top';
  for (let i = 0; i < 13; i++) {
    const ln = CODE[(i + off) % CODE.length], y = 6 + i * 19;
    g.fillStyle = '#3b4a66'; g.fillText(String((i + off) % 99 + 1).padStart(2, ' '), 3, y);
    g.fillStyle = ln.startsWith('//') ? '#64748b' : /✓/.test(ln) ? '#4ade80' : /^(const|if|for|export|await)/.test(ln.trim()) ? '#7dd3fc' : '#e2e8f0';
    g.fillText(ln, 32, y, W - 36);
  }
  if (Math.floor(t * 2) % 2) { g.fillStyle = '#ffb347'; g.fillRect(32 + ((off * 37) % 120), 6 + 12 * 19, 8, 15); }
}
// spectrum and a DNA-like helix (science)
function paintSpectrum(g, t) {
  const W = 256, H = 128;
  g.fillStyle = '#02101a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { const v = 0.15 + 0.8 * Math.pow(Math.abs(Math.sin(i * 0.45 + t * 1.3) * Math.cos(i * 0.17 - t * 0.6)), 1.5); g.fillStyle = `hsl(${180 + i * 4},90%,${45 + v * 20}%)`; g.fillRect(4 + i * 4.2, H - 8 - v * 70, 3, v * 70); }
  g.strokeStyle = '#4ade80'; g.lineWidth = 2;
  for (const ph of [0, Math.PI]) { g.beginPath(); for (let x = 0; x <= 80; x += 3) { const y = 30 + Math.sin(x * 0.14 + t * 2 + ph) * 18; x ? g.lineTo(172 + x, y) : g.moveTo(172, y); } g.stroke(); }
  g.fillStyle = '#a7f3d0'; g.font = '700 13px Menlo, monospace'; g.fillText(`MUESTRA ${String(Math.floor(t / 4) % 90 + 10)}`, 176, 70); g.fillStyle = '#4ade80'; g.fillText('PURA 99,8 %', 176, 88);
}
// tactical: rotating reticle with contacts
function paintTarget(g, t) {
  const S = 256, c = S / 2;
  g.fillStyle = '#12040a'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,90,110,.5)'; g.lineWidth = 2;
  for (const r of [40, 80, 116]) { g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); }
  g.save(); g.translate(c, c); g.rotate(t * 0.6);
  g.strokeStyle = '#ff5c74'; g.lineWidth = 4; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(52, 0); g.lineTo(96, 0); g.stroke(); }
  g.restore();
  const a = t * 0.4; g.fillStyle = '#ffb347'; g.beginPath(); g.arc(c + Math.cos(a) * 60, c + Math.sin(a * 1.3) * 50, 7, 0, TAU); g.fill();
  g.fillStyle = '#ff8fa3'; g.font = '700 16px Menlo, monospace'; g.fillText('BLANCO 01', 10, 22); g.fillText(`${(1.2 + Math.sin(t * 0.3) * 0.4).toFixed(2)} km`, 10, 244);
}
// server rack lights
function paintRack(g, t) {
  const W = 64, H = 256, r = rng(Math.floor(t * 4));
  g.fillStyle = '#07090d'; g.fillRect(0, 0, W, H);
  for (let u = 0; u < 12; u++) {
    const y = 4 + u * 21; g.fillStyle = '#151a23'; g.fillRect(3, y, W - 6, 18);
    for (let i = 0; i < 6; i++) { const on = r() < 0.5; g.fillStyle = on ? (i === 5 ? '#ffb347' : i % 2 ? '#38d6ff' : '#4ade80') : '#14321f'; g.fillRect(8 + i * 8, y + 6, 5, 5); }
  }
}
// the ship's systems schematic (engine control), painted once
function paintMSD() {
  const W = 512, H = 256, s = canvasTex(W, H), g = s.ctx;
  g.fillStyle = '#040a14'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(56,214,255,.25)'; g.lineWidth = 1; for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = '#7dd3fc'; g.lineWidth = 3; g.fillStyle = 'rgba(56,214,255,.12)';
  g.beginPath(); g.ellipse(170, 110, 120, 44, 0, 0, TAU); g.fill(); g.stroke(); // saucer
  g.beginPath(); g.moveTo(230, 140); g.lineTo(330, 170); g.lineTo(330, 196); g.lineTo(220, 168); g.closePath(); g.fill(); g.stroke(); // neck
  for (const y of [70, 210]) { g.beginPath(); g.roundRect(300, y - 14, 190, 28, 14); g.fill(); g.stroke(); } // nacelles
  g.beginPath(); g.moveTo(360, 170); g.lineTo(400, 84); g.moveTo(360, 186); g.lineTo(400, 196); g.stroke();
  g.fillStyle = '#ffb347'; for (const [x, y] of [[150, 110], [320, 182], [470, 70], [470, 210]]) { g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); }
  g.fillStyle = '#c4b5fd'; g.fillRect(300, 66, 160, 8); g.fillRect(300, 206, 160, 8);
  g.fillStyle = '#7dd3fc'; g.font = '700 18px system-ui'; g.letterSpacing = '3px'; g.fillText('SISTEMAS · USS HERD', 16, 26); g.letterSpacing = '0px';
  g.fillStyle = '#4ade80'; g.font = '600 15px Menlo, monospace'; g.fillText('PLASMA 97 %', 16, 236); g.fillStyle = '#ffb347'; g.fillText('MOTOR 3 · CALIENTE', 150, 236);
  return s.tex;
}
// a star chart (astrometrics), painted once
function paintStarChart() {
  const W = 512, H = 192, s = canvasTex(W, H), g = s.ctx, r = rng(91);
  g.fillStyle = '#030716'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { const b = r(); g.fillStyle = `rgba(200,220,255,${0.2 + b * 0.7})`; g.fillRect(r() * W, r() * H, b > 0.9 ? 2 : 1, b > 0.9 ? 2 : 1); }
  g.strokeStyle = 'rgba(125,211,252,.25)'; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo((i * W) / 8, 0); g.lineTo((i * W) / 8, H); g.stroke(); }
  g.strokeStyle = '#7dd3fc'; g.lineWidth = 2; g.beginPath(); const pts = [[40, 140], [120, 96], [196, 120], [270, 60], [360, 82], [470, 40]]; pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.fillStyle = '#ffb347'; for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
  g.fillStyle = '#e0f2fe'; g.font = '700 15px system-ui'; g.fillText('RUTA HERD-7 · LUNA', 300, 176); g.fillText('SECTOR SOL-3', 14, 22);
  return s.tex;
}
// a pegboard with tool outlines (prototyping)
function paintPegboard() {
  const W = 512, H = 384, s = canvasTex(W, H), g = s.ctx;
  g.fillStyle = '#2b3340'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#161b23'; for (let y = 12; y < H; y += 24) for (let x = 12; x < W; x += 24) { g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
  const tool = (x, y, w, h, col, round) => { g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.roundRect(x - 4, y - 4, w + 8, h + 8, 8); g.fill(); g.fillStyle = col; g.beginPath(); g.roundRect(x, y, w, h, round ? w / 2 : 4); g.fill(); };
  tool(40, 40, 18, 150, '#c9d1dc'); tool(30, 30, 38, 26, '#c9d1dc', true); // wrench
  tool(100, 50, 14, 120, '#e5b02a'); tool(94, 160, 26, 60, '#111'); // screwdriver
  tool(150, 46, 14, 110, '#ef4444'); tool(144, 150, 26, 60, '#111');
  tool(210, 40, 60, 20, '#94a3b8'); tool(232, 60, 16, 140, '#7c5c3b'); // hammer
  tool(300, 40, 24, 120, '#c9d1dc'); tool(330, 40, 24, 120, '#c9d1dc'); // pliers
  for (let i = 0; i < 6; i++) tool(390 + i * 18, 44, 8, 60 + i * 14, '#94a3b8'); // hex keys
  g.fillStyle = '#e5b02a'; g.fillRect(0, H - 60, W, 8);
  g.fillStyle = 'rgba(230,240,255,.8)'; g.font = '800 30px system-ui'; g.letterSpacing = '4px'; g.fillText('TALLER DE PROTOTIPOS', 24, H - 20, W - 40); g.letterSpacing = '0px';
  g.fillStyle = 'rgba(253,224,71,.7)'; g.font = '700 18px system-ui'; g.fillText('Cada herramienta a su silueta', 30, 250);
  return s.tex;
}
function paintGauge(g, v, label) {
  const S = 128, c = S / 2;
  g.fillStyle = '#e8edf3'; g.beginPath(); g.arc(c, c, 60, 0, TAU); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 3; for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; g.beginPath(); g.moveTo(c + Math.cos(a) * 44, c + Math.sin(a) * 44); g.lineTo(c + Math.cos(a) * 54, c + Math.sin(a) * 54); g.stroke(); }
  g.strokeStyle = '#dc2626'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, 50, Math.PI * 1.95, Math.PI * 2.25); g.stroke();
  const a = Math.PI * 0.75 + v * Math.PI * 1.5; g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * 46, c + Math.sin(a) * 46); g.stroke();
  g.fillStyle = '#111'; g.font = '700 14px system-ui'; g.textAlign = 'center'; g.fillText(label, c, c + 30); g.textAlign = 'left';
}
// the cantina's neon sign (transparent around the letters)
function paintNeon() {
  const W = 1024, H = 256, s = canvasTex(W, H), g = s.ctx;
  g.clearRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 800 150px system-ui'; g.letterSpacing = '10px';
  g.shadowColor = '#ff9d2e'; g.shadowBlur = 30; g.fillStyle = '#ffd7a0'; g.fillText('Cantina', W / 2, 108);
  g.shadowBlur = 0; g.strokeStyle = '#fff4e0'; g.lineWidth = 3; g.strokeText('Cantina', W / 2, 108);
  g.font = '700 40px system-ui'; g.letterSpacing = '8px'; g.shadowColor = '#38d6ff'; g.shadowBlur = 16; g.fillStyle = '#bff0ff';
  g.fillText('CAFÉ · TÉ · BOLLERÍA', W / 2, 212);
  return s.tex;
}
function paintMenu() {
  const s = canvasTex(512, 384), c = s.ctx;
  c.fillStyle = '#0a0f1a'; c.fillRect(0, 0, 512, 384);
  c.fillStyle = '#ffb347'; c.beginPath(); c.roundRect(14, 14, 484, 56, 28); c.fill();
  c.fillStyle = '#0a0f1a'; c.font = '800 34px system-ui'; c.textBaseline = 'middle'; c.letterSpacing = '4px'; c.fillText('MENÚ DE GUARDIA', 40, 43); c.letterSpacing = '0px';
  [['Café solo', '1'], ['Café con leche', '2'], ['Té de jazmín', '2'], ['Café de órbita', '3'], ['Chocolate', '2']].forEach(([x, p], i) => { c.fillStyle = i === 3 ? '#ffb347' : '#e5eefb'; c.font = `${i === 3 ? 700 : 500} 32px system-ui`; c.fillText(x, 36, 110 + i * 52); c.fillStyle = '#38d6ff'; c.textAlign = 'right'; c.fillText(`${p} cr`, 480, 110 + i * 52); c.textAlign = 'left'; });
  return s.tex;
}

// ------------------------------------------------------------------ layout of the bridge (world x/z)
const DZ = -5.4, SZ = -6.55, BACK_Z_ = -9; // world.js DESK_Z and SEAT_Z (also k.C): a desk's centre and its seat, in desk coordinates
const WALL_R = 9.7; // the back wall ends here: right of it the hangar window looks into LAUNCH BAY 1
const HANGAR = { x0: WALL_R, x1: 18.6, z0: -17.2, z1: BACK_Z_, h: 11.6 }; // the launch bay behind the back-right corner
const BAY = { x: 11.0, z: -11.6, top: 0.55, s: 0.82, w: 1.24 }; // the rocket's axis, the mount's top, its scale (w: girth)
const TOWER = { x: 14.1, z: -12.4 }; // the umbilical tower, right of the rocket
const CAN = { x: -9.0, z: 6.05, yaw: 1.12 }; // the coffee spot: people stand with their backs to the replicator bar, facing the bridge
const BAR = { x: -10.75, z: 5.75 }; // the replicator in the middle of the curved mess bar behind the spot
const CLOCK = { x: 12.05, z: -1.1 }; // the launch countdown clock standing on the deck, like the one at the press site
const HOLO = { x: 4.7, z: 6.3 };
const CX = -0.9, centreZ = (rows) => (rows === 1 ? 2.1 : 5.6); // the command dais (desk centre)
const LIFT = 0.26;
const EMPTY_FOOT = { x0: -2.35, x1: 2.35, z0: -2.95, z1: 3.1 }; // the command dais's footprint round its desk centre (with or without a captain)
const DRONE_WP = [[-5.6, 3.4], [6.4, 3.2], [-5.2, 7.4], [2.6, 7.6], [6.6, 1.2], [-6.2, 1.6]]; // where the maintenance drone heads next
// which station a role gets (the centre desk is always the captain's)
function kindOf(role) {
  const r = String(role || '');
  if (/^\s*dev/i.test(r)) return 'sistemas';
  if (/verif|\bqa\b|test/i.test(r)) return 'ciencia';
  if (/infra|platform|devops|\bops\b|sre/i.test(r)) return 'maquinas';
  if (/^\s*lead/i.test(r) || /product/i.test(r)) return 'mando';
  if (/superadmin|admin/i.test(r)) return 'almirante';
  if (/research|explor|discover/i.test(r)) return 'exploracion';
  if (/review|tact|secur/i.test(r)) return 'tactico';
  if (/proto|lab|maker/i.test(r)) return 'prototipos';
  return 'operaciones';
}
const DEPT = { sistemas: ['SIS', '#38d6ff'], ciencia: ['CIE', '#4ade80'], maquinas: ['MAQ', '#ffb347'], mando: ['1.º OF', '#ff5c74'], almirante: ['ALM', '#d4a62a'], exploracion: ['EXP', '#7c9cff'], tactico: ['TÁC', '#ff5c74'], prototipos: ['PRO', '#c4a7ff'], operaciones: ['OPS', '#38d6ff'], capitan: ['CAP', '#d4a62a'] };
function deptTex(kind) {
  const [t, c] = DEPT[kind] || DEPT.operaciones, s = canvasTex(256, 256), g = s.ctx;
  g.fillStyle = '#060b16'; g.beginPath(); g.roundRect(6, 6, 244, 244, 40); g.fill();
  g.strokeStyle = c; g.lineWidth = 8; g.stroke();
  g.fillStyle = c; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${t.length > 3 ? 70 : 92}px system-ui`; g.fillText(t, 128, 112, 220);
  g.fillStyle = '#cfe9ff'; g.font = '700 30px system-ui'; g.fillText('PUENTE', 128, 196);
  return s.tex;
}

// ------------------------------------------------------------------ the theme
export default {
  id: 'nave',
  name: 'USS HERD',
  roles: {
    Product: 'Capitán', Development: 'Ingeniero de sistemas', Verification: 'Oficial científico',
    Infrastructure: 'Jefe de máquinas', Lead: 'Primer oficial', Research: 'Oficial de exploración',
    Prototyping: 'Ingeniero de prototipos', Review: 'Oficial táctico', Superadmin: 'Almirante',
  },
  texts: {
    traceHint: ['Este equipo aún no tiene matriz de trazabilidad.', 'Pulsa el panel para ver la de otro equipo.'],
    room: 'Puente de mando', board: 'Registro de misiones', trace: 'Bitácora', composer: 'Orden para @{name}, o @all para toda la tripulación',
    boardSub: 'tarjetas abiertas por quién debe moverlas', noCards: 'Sin tarjetas',
    status: { working: 'en servicio', idle: 'en espera', blocked: 'te necesita', offline: 'fuera de servicio', now: 'ahora' },
  },
  exposure: 1.08,
  bloom: { strength: 0.9, radius: 0.55, threshold: 1 },
  // the captain (Product, else Lead) sits on the command dais in the middle of the bridge (themes/index.js: centre)
  // foot covers the dais and the helm bank in front of it (part of the same station: it moves with the captain)
  centre: { roles: ['Product', 'Lead'], x: CX, z: centreZ, lift: LIFT, foot: EMPTY_FOOT, side: 2.75 },
  spots: { coffee: { x: CAN.x + Math.sin(CAN.yaw) * 0.45, z: CAN.z + Math.cos(CAN.yaw) * 0.45, yaw: CAN.yaw } },
  boardStyle: { bg: '#050b16', ink: '#7dd3fc' },
  traceStyle: { bg: '#081627', ink: '#cfefff' }, // a dark glass display like the board, not an office whiteboard

  // ---------------------------------------------------------------- shell: space, hull, viewports, deck
  shell(k) {
    const { room, scene, C: { BACK_Z, LEFT_X } } = k, my = k.my;
    const WH = my.WH = 8.75; // taller than the office: the viewport sits above the wall screens, the name beam over it
    const glows = my.glows = new Map();
    const G = my.G = (c, n = 1.6) => { const key = `${c}:${n}`; if (!glows.has(key)) glows.set(key, k.glow(c, n)); return glows.get(key); };
    const M = my.M = {
      dark: k.mat(0x1c222d, { roughness: 0.42, metalness: 0.65 }),
      mid: k.mat(0x3a4454, { roughness: 0.35, metalness: 0.7 }),
      light: k.mat(0x8792a6, { roughness: 0.3, metalness: 0.85 }),
      chrome: k.mat(0xc3cad6, { roughness: 0.18, metalness: 1 }),
      gold: k.mat(GOLD, { roughness: 0.28, metalness: 1 }),
      black: k.mat(0x0b0d12, { roughness: 0.6, metalness: 0.3 }),
      red: k.mat(0x6e1a26, { roughness: 0.5, metalness: 0.1 }),
      seat: k.mat(0x2b3444, { roughness: 0.55, metalness: 0.15 }),
      white: k.mat(0xe8edf3, { roughness: 0.35, metalness: 0.05 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.16, depthWrite: false }),
    };
    const B = my.B = (w, h, d, m, x, y, z, o = {}) => {
      const b = k.box(w, h, d, 0, { m, x, y, z, r: o.r || 0, cast: !!o.cast });
      if (o.rx) b.rotation.x = o.rx; if (o.ry) b.rotation.y = o.ry; if (o.rz) b.rotation.z = o.rz;
      (o.to || room).add(b); return b;
    };
    const Cy = my.Cy = (rt, rb, h, m, x, y, z, o = {}) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 24, 1, !!o.open, o.t0 || 0, o.tl || TAU), m);
      c.position.set(x, y, z); c.castShadow = !!o.cast; c.receiveShadow = true;
      if (o.rx) c.rotation.x = o.rx; if (o.rz) c.rotation.z = o.rz; if (o.ry) c.rotation.y = o.ry;
      (o.to || room).add(c); return c;
    };
    const Pl = my.Pl = (w, h, m, x, y, z, ry = 0, rx = 0, to = room) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); to.add(p); return p; };
    const Ring = my.Ring = (r, tube, m, x, y, z, rx = Math.PI / 2, to = room, arc = TAU) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, Math.max(24, Math.round(r * 40)), arc), m); t.position.set(x, y, z); t.rotation.x = rx; to.add(t); return t; };
    const Sign = my.Sign = (text, sub, w, h, x, y, z, ry = 0, o = {}) => {
      const tex = signTex(text, sub, o), m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
      if (o.k) m.color.setScalar(o.k);
      return Pl(w, h, m, x, y, z, ry, o.rx || 0, o.to || room);
    };
    my.animTex = [];
    my.spin = []; // [{ o, sp, ax, g }]: things that turn (a station's g is checked: gone desks stop turning)

    // reflections: the bridge, not a white room
    try { const env = bridgeEnv(k.renderer); if (scene.environment) scene.environment.dispose(); scene.environment = env; } catch (e) { console.warn('nave env', e); }
    scene.fog = null;
    my.sky = paintSky();

    // ---- space outside: stars, planet, moon, a far star glare
    {
      const r = rng(11), N = k.PHONE ? 1400 : 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      const bp = [], bc = [];
      for (let i = 0; i < N; i++) {
        const u = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - u * u), R = 140, tone = r();
        const c = tone < 0.15 ? [0.75, 0.85, 1.3] : tone < 0.25 ? [1.3, 1.05, 0.8] : [1, 1, 1.05], b = 0.35 + Math.pow(r(), 3) * 0.9;
        if (b > 1.05 && bp.length < 300) { bp.push(Math.cos(a) * s * R, u * R, Math.sin(a) * s * R); bc.push(c[0] * 1.6, c[1] * 1.6, c[2] * 1.6); continue; }
        pos.set([Math.cos(a) * s * R, u * R, Math.sin(a) * s * R], i * 3); col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      }
      const px = k.renderer.getPixelRatio();
      const mk = (p, c, size) => {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: size * px, sizeAttenuation: false, vertexColors: true, toneMapped: false, fog: false, depthWrite: false, transparent: true,
          map: radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']], 32) }));
        pts.frustumCulled = false; pts.renderOrder = -2;
        return pts;
      };
      const stars = my.stars = new THREE.Group();
      stars.add(mk(pos, col, 2.2), mk(bp, bc, 4.2));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(160, 64, 32), new THREE.MeshBasicMaterial({ map: my.sky, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
      dome.renderOrder = -3; dome.frustumCulled = false; dome.rotation.y = Math.PI;
      stars.add(dome);
      scene.add(stars);

      const tx = paintPlanet();
      const pmat = (day, night, clouds, cloudK, atm, atmK) => new THREE.ShaderMaterial({
        uniforms: { day: { value: day }, night: { value: night }, clouds: { value: clouds }, sunDir: { value: SUN }, shift: { value: 0 }, cloudK: { value: cloudK }, atm: { value: new THREE.Color(atm) }, atmK: { value: atmK } },
        vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vP; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
        fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform sampler2D clouds; uniform vec3 sunDir; uniform vec3 atm; uniform float shift; uniform float cloudK; uniform float atmK;
          varying vec2 vUv; varying vec3 vN; varying vec3 vP;
          void main(){
            vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vP); float d=dot(n,sunDir); float lit=smoothstep(-0.1,0.3,d);
            vec3 c=texture2D(day,vUv).rgb; float cl=texture2D(clouds,vec2(vUv.x+shift,vUv.y)).r*cloudK;
            c=mix(c,vec3(0.92,0.95,1.0),cl);
            vec3 col=c*(0.012+1.5*max(d,0.0)*lit);
            float nl=texture2D(night,vUv).r*(1.0-lit)*(1.0-cl);
            col+=vec3(1.0,0.66,0.3)*nl*1.4;
            float f=pow(1.0-max(dot(n,v),0.0),2.6);
            col+=atm*f*atmK*(0.05+smoothstep(-0.3,0.6,d));
            gl_FragColor=vec4(col,1.0);
            #include <colorspace_fragment>
          }`,
        toneMapped: false,
      });
      const planet = my.planet = new THREE.Mesh(new THREE.SphereGeometry(30, 128, 64), pmat(tx.day, tx.night, tx.clouds, 0.9, 0x5fa8ff, 1.6));
      planet.position.set(-8, -48, -110); planet.rotation.set(0.25, 0, 0.18); // the limb crosses the viewport from the default camera
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(120,180,255,0)'], [0.78, 'rgba(120,180,255,0)'], [0.815, 'rgba(150,205,255,.85)'], [0.87, 'rgba(90,150,255,.25)'], [1, 'rgba(60,110,255,0)']], 256), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      halo.scale.setScalar((2 * 30) / 0.815); halo.position.copy(planet.position);
      const moonTex = paintMoon(); moonTex.colorSpace = THREE.SRGBColorSpace;
      const moon = my.moon = new THREE.Mesh(new THREE.SphereGeometry(5, 48, 32), pmat(moonTex, tx.night, tx.clouds, 0, 0x888888, 0.15));
      moon.material.uniforms.night.value = null;
      moon.material.fragmentShader = moon.material.fragmentShader.replace('float nl=texture2D(night,vUv).r', 'float nl=0.0');
      moon.scale.setScalar(0.62); moon.position.set(4.5, -13.5, -95);
      const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,240,220,.9)'], [0.25, 'rgba(255,200,150,.25)'], [1, 'rgba(255,180,120,0)']], 128), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      glare.material.color.setScalar(1.6); glare.scale.setScalar(26); glare.position.copy(SUN).multiplyScalar(140); my.glare = glare;
      scene.add(planet, halo, moon, glare);
    }

    // ---- deck
    const deck = paintDeck(k);
    const floor = my.floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), k.mat(0xffffff, { map: deck.map, roughnessMap: deck.rough, roughness: 0.85, metalness: 0.35 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    room.add(floor);
    // the deck section's hull below the floor, with running lights on the open edges
    B(26.6, 0.6, 18.6, M.dark, 0, -0.31, 0);
    B(26.0, 0.9, 18.0, k.mat(0x10141c, { roughness: 0.5, metalness: 0.6 }), 0.2, -1.05, 0.2);
    B(25.0, 0.5, 17.0, k.mat(0x0b0e14, { roughness: 0.6, metalness: 0.5 }), 0.4, -1.7, 0.4);
    B(26.62, 0.05, 0.02, G(CYAN, 1.4), 0, -0.6, 9.31); B(0.02, 0.05, 18.62, G(CYAN, 1.4), 13.31, -0.6, 0);
    {
      const pts = [];
      for (let x = -12.5; x <= 12.6; x += 1) pts.push([x, -0.3, 9.32, 0]);
      for (let z = -8.5; z <= 8.6; z += 1) pts.push([13.32, -0.3, z, Math.PI / 2]);
      const im = my.running = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), pts.length);
      const m4 = new THREE.Matrix4(), c = new THREE.Color(0x222222);
      pts.forEach(([x, y, z, ry], i) => { m4.makeRotationY(ry).setPosition(x, y, z); im.setMatrixAt(i, m4); im.setColorAt(i, c); });
      room.add(im);
    }
    // lit seams on the deck: along the walls, and the aisle guide in front of the desks
    B(WALL_R + 12.9, 0.012, 0.05, G(CYAN, 1.5), (WALL_R - 12.7) / 2, 0.008, BACK_Z + 0.55);
    B(0.05, 0.012, 17.4, G(CYAN, 1.5), LEFT_X + 0.55, 0.008, 0.3);
    {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.014, 0.16), G(0x7dd3fc, 1.3), 52), m4 = new THREE.Matrix4();
      for (let i = 0; i < 26; i++) { m4.setPosition(-12 + i * 0.98, 0.008, 8.75); im.setMatrixAt(i, m4); m4.setPosition(12.75, 0.008, -7.6 + i * 0.62); im.setMatrixAt(26 + i, m4); }
      room.add(im);
    }

    // ---- hull walls (taller than the office) with the panoramic viewport
    const hullCanvas = canvasTex(512, 512); paintHull(hullCanvas.ctx, 512, 512, 21);
    const hullTex = hullCanvas.tex; hullTex.wrapS = hullTex.wrapT = THREE.RepeatWrapping;
    my.hullMats = [];
    const hullMat = my.hullMat = (w, h) => { const t = hullTex.clone(); t.repeat.set(w / 3.2, h / 3.2); t.needsUpdate = true; const m = k.mat(0xffffff, { map: t, roughness: 0.55, metalness: 0.4 }); my.hullMats.push(m); return m; };
    const wallSkin = (w, h, x, y, z, ry) => { const p = Pl(w, h, hullMat(w, h), x, y, z, ry); p.receiveShadow = true; return p; };
    const WIN0 = 5.62, WIN1 = 8.0; // viewport bottom (clear of two tiers of wall screens) and top
    const BW = WALL_R + 13.3, BX = (WALL_R - 13.3) / 2; // the back wall's width and centre
    // back wall: lower part (behind the screens), the frame over the viewport, the viewport itself
    B(BW, WIN0, 0.3, M.dark, BX, WIN0 / 2, BACK_Z - 0.15);
    wallSkin(BW, WIN0, BX, WIN0 / 2, BACK_Z + 0.001, 0);
    B(BW, WH - WIN1, 0.5, M.dark, BX, (WH + WIN1) / 2, BACK_Z - 0.05);
    wallSkin(BW, WH - WIN1, BX, (WH + WIN1) / 2, BACK_Z + 0.201, 0);
    Pl(BW, WIN1 - WIN0, M.glass, BX, (WIN0 + WIN1) / 2, BACK_Z - 0.1);
    B(BW, 0.16, 0.55, M.mid, BX, WIN0 + 0.08, BACK_Z + 0.12, { cast: false }); // sill
    B(BW - 0.4, 0.04, 0.03, G(CYAN, 2.2), BX, WIN0 + 0.17, BACK_Z + 0.38);
    B(BW - 0.4, 0.04, 0.03, G(CYAN, 2.0), BX, WIN1 - 0.04, BACK_Z + 0.22);
    for (let i = 0; i <= 6; i++) { // mullions with gussets at the corners
      const x = -13.15 + i * ((WALL_R + 13.0) / 6), wd = i === 0 || i === 6 ? 0.5 : 0.34;
      B(wd, WIN1 - WIN0, 0.5, M.mid, x, (WIN0 + WIN1) / 2, BACK_Z + 0.02);
      B(0.06, WIN1 - WIN0 - 0.3, 0.04, M.light, x, (WIN0 + WIN1) / 2, BACK_Z + 0.28);
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if ((i === 0 && sx < 0) || (i === 6 && sx > 0)) continue;
        B(0.75, 0.22, 0.4, M.mid, x + sx * 0.38, sy > 0 ? WIN1 - 0.28 : WIN0 + 0.28, BACK_Z + 0.02, { rz: sx * sy * -0.62 });
      }
    }
    // lower back wall: kick light, a vent band, an auxiliary console ledge with blinking keys
    B(BW - 0.4, 0.035, 0.03, G(CYAN, 2.0), BX, 0.09, BACK_Z + 0.06);
    B(BW - 0.4, 0.32, 0.12, M.black, BX, 0.32, BACK_Z + 0.06);
    for (let i = 0; i < 25; i++) B(0.6, 0.02, 0.02, M.mid, -12.6 + i * 0.98, 0.32, BACK_Z + 0.13);
    B(BW - 0.4, 0.42, 0.42, M.dark, BX, 1.0, BACK_Z + 0.21, { cast: false });
    B(BW - 0.4, 0.06, 0.5, M.mid, BX, 1.24, BACK_Z + 0.25, { cast: false });
    {
      const r = rng(4), n = 144, im = my.keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
      const m4 = new THREE.Matrix4(), c = new THREE.Color(); my.keyCols = [];
      for (let i = 0; i < n; i++) {
        const x = -12.7 + (i % 72) * 0.33 + (r() - 0.5) * 0.05, z = BACK_Z + 0.33 + Math.floor(i / 72) * 0.13;
        m4.makeRotationX(-0.15).setPosition(x, 1.28, z); im.setMatrixAt(i, m4);
        c.set(UI[Math.floor(r() * UI.length)]); my.keyCols.push(c.clone()); im.setColorAt(i, c);
      }
      room.add(im);
    }
    // the back wall's end: a structural column with hazard chevrons, where the hangar window onto the launch bay starts
    {
      B(0.36, WH + 0.3, 0.7, M.mid, WALL_R, (WH + 0.3) / 2 - 0.15, BACK_Z, { cast: true });
      const hz = k.mat(0xffffff, { map: hazardTex(1), roughness: 0.6 }); hz.map.repeat.set(1, 14); hz.map.rotation = Math.PI / 2;
      B(0.04, WH - 0.4, 0.4, hz, WALL_R + 0.2, WH / 2, BACK_Z);
      B(0.03, WH - 0.6, 0.04, G(AMBER, 2.2), WALL_R + 0.22, WH / 2, BACK_Z + 0.26);
    }
    // soffit along the top of both walls: a band of light that turns amber when someone needs you
    B(BW, 0.3, 0.46, M.dark, BX, WH + 0.05, BACK_Z + 0.43);
    B(0.46, 0.3, 18.3, M.dark, LEFT_X + 0.23, WH + 0.05, 0.15);
    my.alertMat = k.glow(CYAN, 1.8);
    B(BW, 0.08, 0.03, my.alertMat, BX, WH - 0.04, BACK_Z + 0.67);
    B(0.03, 0.08, 18.3, my.alertMat, LEFT_X + 0.47, WH - 0.04, 0.15);
    // the ship's name over the viewport, the watch on duty at its left end and the launch countdown at its right
    {
      const s = canvasTex(2048, 128), g = s.ctx;
      g.clearRect(0, 0, 2048, 128);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 72px system-ui'; g.letterSpacing = '22px'; g.fillStyle = '#d8f3ff';
      g.fillText('U.S.S. HERD   ·   HX-07', 1024, 68);
      const m = new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, toneMapped: false, depthWrite: false }); m.color.setScalar(1.25);
      const by = (WH + WIN1) / 2 + 0.02;
      Pl(10.4, 0.66, m, -0.4, by, BACK_Z + 0.21);
      my.beaconMat = k.glow(AMBER, 0.3);
      for (const bx of [-6.3, 5.5]) {
        B(0.7, 0.3, 0.16, M.mid, bx, by, BACK_Z + 0.27, { r: 0.05 });
        B(0.56, 0.17, 0.06, my.beaconMat, bx, by, BACK_Z + 0.36, { r: 0.04 });
      }
      const sh = my.shift = canvasTex(512, 128);
      my.shiftMat = new THREE.MeshBasicMaterial({ map: sh.tex, toneMapped: false });
      Pl(2.4, 0.6, my.shiftMat, -9.9, by, BACK_Z + 0.22);
      paintShift(sh.ctx, false); sh.tex.needsUpdate = true;
    }

    // left wall: board section, turbolift, the cantina's wall with a viewport above it
    const LX = LEFT_X - 0.15, segs = [[-9.3, 1.75], [4.05, 4.9], [8.7, 9.3]], WB = 4.3; // WB: the side viewport's bottom
    for (const [z0, z1] of segs) { B(0.3, WH, z1 - z0, M.dark, LX, WH / 2, (z0 + z1) / 2); wallSkin(z1 - z0, WH, LEFT_X + 0.001, WH / 2, (z0 + z1) / 2, Math.PI / 2); }
    B(0.3, WH - 3.6, 2.3, M.dark, LX, (WH + 3.6) / 2, 2.9); wallSkin(2.3, WH - 3.6, LEFT_X + 0.001, (WH + 3.6) / 2, 2.9, Math.PI / 2);
    B(0.3, WB, 3.8, M.dark, LX, WB / 2, 6.8); wallSkin(3.8, WB, LEFT_X + 0.001, WB / 2, 6.8, Math.PI / 2);
    B(0.3, WH - 7.8, 3.8, M.dark, LX, (WH + 7.8) / 2, 6.8); wallSkin(3.8, WH - 7.8, LEFT_X + 0.001, (WH + 7.8) / 2, 6.8, Math.PI / 2);
    Pl(3.8, 7.8 - WB, M.glass, LX - 0.05, (7.8 + WB) / 2, 6.8, Math.PI / 2);
    B(0.5, 0.14, 3.9, M.mid, LEFT_X + 0.1, WB, 6.8); B(0.5, 0.14, 3.9, M.mid, LEFT_X + 0.1, 7.8, 6.8);
    B(0.5, 7.8 - WB, 0.3, M.mid, LEFT_X + 0.05, (7.8 + WB) / 2, 6.8);
    B(0.03, 0.04, 3.7, G(CYAN, 2.0), LEFT_X + 0.36, WB + 0.08, 6.8); B(0.03, 0.04, 3.7, G(CYAN, 2.0), LEFT_X + 0.36, 7.72, 6.8);
    for (const z of [4.95, 8.65]) B(0.5, 7.8 - WB + 0.15, 0.18, M.mid, LEFT_X + 0.08, (7.8 + WB) / 2, z);
    B(0.03, 0.035, 18.2, G(CYAN, 2.0), LEFT_X + 0.03, 0.09, 0.15); // kick light
    // pipes under the board
    for (const [y, rad, x] of [[0.28, 0.07, LEFT_X + 0.16], [0.48, 0.05, LEFT_X + 0.14], [0.64, 0.035, LEFT_X + 0.12]]) {
      Cy(rad, rad, 10.4, y > 0.6 ? M.gold : M.light, x, y, -3.9, { rx: Math.PI / 2, seg: 12 });
    }
    for (let z = -8.4; z < 1.4; z += 1.6) B(0.12, 0.6, 0.12, M.dark, LEFT_X + 0.1, 0.45, z);
    // turbolift: recess, two leaves with a lit seam, lit frame, call panel, sign
    {
      const z = 2.9;
      B(0.05, 3.6, 2.3, M.black, LEFT_X - 0.28, 1.8, z);
      const doorTex = (flip) => {
        const t = canvasTex(256, 896), c = t.ctx, W = 256, H = 896;
        const gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#2a3242'); gr.addColorStop(1, '#3a4456'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
        if (flip) { c.translate(W, 0); c.scale(-1, 1); }
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, 6); c.fillRect(0, H - 6, W, 6); c.fillRect(W - 8, 0, 8, H);
        c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 4; c.strokeRect(22, 30, W - 50, 300); c.strokeRect(22, 560, W - 50, 300);
        c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.strokeRect(25, 33, W - 50, 300); c.strokeRect(25, 563, W - 50, 300);
        c.fillStyle = '#141923'; c.fillRect(0, 380, W, 140);
        c.fillStyle = '#d4a62a'; for (let i = 0; i < 3; i++) { const x0 = 40 + i * 62; c.beginPath(); c.moveTo(x0, 404); c.lineTo(x0 + 34, 450); c.lineTo(x0, 496); c.lineTo(x0 + 18, 496); c.lineTo(x0 + 52, 450); c.lineTo(x0 + 18, 404); c.closePath(); c.fill(); }
        c.fillStyle = '#7dd3fc'; c.fillRect(W - 40, 120, 14, 160); c.fillStyle = 'rgba(125,211,252,.25)'; c.fillRect(W - 46, 114, 26, 172);
        c.fillStyle = 'rgba(190,205,225,.35)'; c.font = '700 26px system-ui'; c.fillText('TL-1', 34, 545);
        return t.tex;
      };
      for (const s of [-1, 1]) {
        B(0.1, 3.45, 0.94, M.dark, LEFT_X - 0.16, 1.73, z + s * 0.48);
        const face = Pl(0.94, 3.45, k.mat(0xffffff, { map: doorTex(s < 0), roughness: 0.45, metalness: 0.55 }), LEFT_X - 0.105, 1.73, z + s * 0.48, Math.PI / 2);
        face.receiveShadow = true;
      }
      B(0.02, 3.3, 0.03, G(CYAN, 2.4), LEFT_X - 0.1, 1.73, z);
      B(0.5, 0.02, 2.3, M.black, LEFT_X + 0.1, 0.004, z);
      B(0.02, 0.022, 2.24, G(CYAN, 1.4), LEFT_X + 0.34, 0.005, z);
      B(0.32, 0.12, 2.5, M.mid, LEFT_X + 0.05, 3.6, z); B(0.3, 3.62, 0.12, M.mid, LEFT_X + 0.05, 1.81, z - 1.2); B(0.3, 3.62, 0.12, M.mid, LEFT_X + 0.05, 1.81, z + 1.2);
      B(0.03, 0.04, 2.3, G(CYAN, 2.4), LEFT_X + 0.22, 3.53, z); B(0.03, 3.4, 0.04, G(CYAN, 2.4), LEFT_X + 0.22, 1.8, z - 1.13); B(0.03, 3.4, 0.04, G(CYAN, 2.4), LEFT_X + 0.22, 1.8, z + 1.13);
      B(0.06, 0.4, 0.26, M.dark, LEFT_X + 0.03, 1.5, z - 1.55);
      my.callLight = B(0.03, 0.08, 0.16, k.glow(AMBER, 2.2), LEFT_X + 0.07, 1.6, z - 1.55);
      B(0.03, 0.06, 0.16, G(0x4ade80, 1.8), LEFT_X + 0.07, 1.42, z - 1.55);
      Sign('ASCENSOR', 'Cubiertas 1 – 12', 2.3, 0.55, LEFT_X + 0.22, 4.15, z, Math.PI / 2, { h: 256, k: 1.15 });
      const s = canvasTex(1024, 512), g = s.ctx, W = 1024, H = 512, bw = 46;
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(bw, bw, W - 2 * bw, H - 2 * bw); g.clip('evenodd');
      for (let i = -H; i < W + H; i += 64) { g.fillStyle = (i / 64) % 2 ? '#111' : '#e5b02a'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - H, H); g.lineTo(i - H, H); g.fill(); }
      g.restore();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 150px system-ui'; g.letterSpacing = '22px'; g.fillStyle = 'rgba(253,224,71,.6)'; g.fillText('CUBIERTA 1', W / 2, H / 2 + 6, W - 140);
      const hm = new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, depthWrite: false }); hm.color.setScalar(0.8);
      const st = Pl(2.3, 1.1, hm, LEFT_X + 0.95, 0.012, z, 0, 0);
      st.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    }
    // status strip above the board (live: condition, shields, warp, countdown, stardate)
    {
      const s = my.status = canvasTex(2048, 160);
      paintStatus(s.ctx, 0, false, false, '');
      const m = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false });
      Pl(8.2, 0.64, m, LEFT_X + 0.12, 6.3, -3.2, Math.PI / 2);
      B(0.12, 0.8, 8.4, M.mid, LEFT_X + 0.05, 6.3, -3.2);
    }
    // the front-left end cap of the cut-away: a structural beam with lights
    B(0.6, WH + 0.3, 0.6, M.mid, LEFT_X, (WH + 0.3) / 2 - 0.15, 9.3);
    for (let i = 0; i < 8; i++) B(0.04, 0.04, 0.04, G(i % 2 ? 0xff5c5c : 0x4ade80, 2.2), LEFT_X, 1.2 + i * 0.95, 9.61);
  },

  // ---------------------------------------------------------------- decor: launch bay, cantina, holo table...
  decor(k) {
    const { room, scene, C: { LEFT_X } } = k, my = k.my, { M, G, B, Cy, Pl, Ring, Sign } = my;
    const WH_ = my.WH;
    const screen = my.screen = (tex, n = 1.05, extra = {}) => { const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, ...extra }); m.color.setScalar(n); return m; };
    const holoMat = my.holoMat = (tex, c = 0x9be8ff, o = 0.75) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(c).multiplyScalar(1.1), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    // animated readouts (repainted a few times a second in tick) and painted panels, shared by every console
    const ro = (w, h) => canvasTex(w, h);
    const roA = my.roA = ro(512, 256), roB = my.roB = ro(512, 256), radar = my.radar = ro(256, 256);
    const code = my.code = ro(256, 256), spec = my.spec = ro(256, 128), target = my.target = ro(256, 256), rack = my.rack = ro(64, 256);
    paintReadoutA(roA.ctx, 0); paintReadoutB(roB.ctx, 0, 1); paintRadar(radar.ctx, 0); paintCode(code.ctx, 0); paintSpectrum(spec.ctx, 0); paintTarget(target.ctx, 0); paintRack(rack.ctx, 0);
    // more materials: consoles, lab white, gunmetal, hazard, the rocket, the tower, the bay floor, warm wood
    Object.assign(M, {
      cTop: k.mat(0x151a23, { roughness: 0.3, metalness: 0.6 }),
      cBody: k.mat(0x2b3342, { roughness: 0.4, metalness: 0.6 }),
      cFront: k.mat(0x222a37, { roughness: 0.45, metalness: 0.55 }),
      lab: k.mat(0xd3dbe5, { roughness: 0.35, metalness: 0.1 }),
      labTop: k.mat(0xeef2f6, { roughness: 0.25, metalness: 0.05 }),
      gun: k.mat(0x3a404b, { roughness: 0.38, metalness: 0.75 }),
      hazard: k.mat(0xffffff, { map: hazardTex(6), roughness: 0.6 }),
      hazardS: k.mat(0xffffff, { map: hazardTex(2), roughness: 0.6 }),
      rSkin: k.mat(0xffffff, { map: paintRocket(), roughness: 0.42, metalness: 0.05 }),
      rWhite: k.mat(0xeef1f4, { roughness: 0.42, metalness: 0.05 }),
      rBlack: k.mat(0x16181d, { roughness: 0.5, metalness: 0.2 }),
      bell: k.mat(0x2a2d33, { roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }),
      tower: k.mat(0xb8401c, { roughness: 0.55, metalness: 0.35 }),
      towerDark: k.mat(0x5a2414, { roughness: 0.6, metalness: 0.3 }),
      bayFloor: k.mat(0x2e343e, { roughness: 0.9, metalness: 0.2 }),
      wood: k.mat(0x7a4f30, { roughness: 0.45, metalness: 0.05 }),
      copper: k.mat(0xb87333, { roughness: 0.3, metalness: 1 }),
      frost: k.mat(0xe6eef6, { roughness: 0.75, metalness: 0.05 }),
      bezel: k.mat(0x0d1119, { roughness: 0.32, metalness: 0.75 }),
      keys: screen(roB.tex, 0.9), roA: screen(roA.tex, 1.1), radar: screen(radar.tex, 1.1), code: screen(code.tex, 1.05), spec: screen(spec.tex, 1.1),
      target: screen(target.tex, 1.1), rack: screen(rack.tex, 1.2), msd: screen(paintMSD(), 1.05), star: holoMat(paintStarChart(), 0xbfe6ff, 0.9),
      peg: k.mat(0xffffff, { map: paintPegboard(), roughness: 0.7 }),
      plasma: k.glow(0x8a6bff, 2.6),
    });
    { const t = canvasTex(128, 128); paintGauge(t.ctx, 0.62, 'PLASMA'); M.gauge = new THREE.MeshBasicMaterial({ map: t.tex }); M.gauge.color.setScalar(0.95); }
    my.deptMats = {};
    my.vials = [k.glow(0x4ade80, 2), k.glow(0x38d6ff, 2), k.glow(0xc084fc, 2)];
    my.tacBeacon = k.glow(0xff3b4e, 0.5);
    my.roAm = M.roA; my.roBm = M.keys;

    // ---- LAUNCH BAY 1: the hero. An enclosed hangar behind the back-right corner, seen through the hangar window: the
    // bridge's deck plates run on into it; hull walls with light strips, a roof truss with crane rails and a gantry
    // crane, the far wall's great door ajar on space; the launch mount over a flame trench, the rocket HERD-7 with two
    // boosters, the red umbilical tower with swing arms and hoses, floodlight masts with soft beams, vapour, propellant
    // tanks piped to the mount. The countdown clock stands on the bridge's deck in front of it.
    {
      const P = new Parts(), { x0: X0, x1: X1, z0: Z0, z1: Z1, h: HH } = HANGAR, bx = (X0 + X1) / 2, bz = (Z0 + Z1) / 2, W = X1 - X0, D = Z1 - Z0;
      { // the floor: the same deck plates as the bridge
        const t = my.floor.material.map.clone(), rm = my.floor.material.roughnessMap.clone();
        for (const x of [t, rm]) { x.repeat.set(W / 4, D / 4); x.needsUpdate = true; }
        const f = new THREE.Mesh(new THREE.PlaneGeometry(W, D), k.mat(0xffffff, { map: t, roughnessMap: rm, roughness: 0.85, metalness: 0.35 }));
        f.rotation.x = -Math.PI / 2; f.position.set(bx, 0.001, bz); f.receiveShadow = true; room.add(f);
      }
      P.box(W + 0.3, 0.6, D + 0.3, M.dark, bx, -0.31, bz - 0.15);
      P.box(W - 0.2, 0.9, D - 0.2, M.black, bx + 0.2, -1.05, bz - 0.1);
      // walls: left (behind the bridge's back wall), far (with the great door), right; a roof with its truss
      const hm = my.hullMat;
      P.box(0.3, HH, D, M.dark, X0 - 0.15, HH / 2, bz); P.pl(D, HH, hm(D, HH), X0 + 0.002, HH / 2, bz, 0, Math.PI / 2, 0);
      P.box(0.3, HH, D, M.dark, X1 + 0.15, HH / 2, bz); P.pl(D, HH, hm(D, HH), X1 - 0.002, HH / 2, bz, 0, -Math.PI / 2, 0);
      const DX0 = 12.6, DX1 = 17.6, DH = 9.2, GAP = 0.7; // the door opening on the far wall and the slit between its leaves
      for (const [a, b] of [[X0, DX0], [DX1, X1]]) { P.box(b - a, HH, 0.3, M.dark, (a + b) / 2, HH / 2, Z0 - 0.15); P.pl(b - a, HH, hm(b - a, HH), (a + b) / 2, HH / 2, Z0 + 0.002); }
      P.box(DX1 - DX0, HH - DH, 0.3, M.dark, (DX0 + DX1) / 2, (HH + DH) / 2, Z0 - 0.15); P.pl(DX1 - DX0, HH - DH, hm(DX1 - DX0, HH - DH), (DX0 + DX1) / 2, (HH + DH) / 2, Z0 + 0.002);
      const leafW = (DX1 - DX0 - GAP) / 2, doorM = k.mat(0xffffff, { map: (() => { const t = canvasTex(256, 1024), g = t.ctx; paintHull(g, 256, 1024, 57, [52, 60, 76]); g.fillStyle = 'rgba(229,176,42,.75)'; g.font = '900 300px system-ui'; g.textAlign = 'center'; g.fillText('1', 128, 520); return t.tex; })(), roughness: 0.5, metalness: 0.5 });
      for (const s of [-1, 1]) {
        const cx = s < 0 ? DX0 + leafW / 2 : DX1 - leafW / 2;
        P.box(leafW, DH, 0.35, M.mid, cx, DH / 2, Z0 - 0.05); P.pl(leafW, DH, doorM, cx, DH / 2, Z0 + 0.13);
        P.box(0.18, DH, 0.04, M.hazardS, s < 0 ? DX0 + leafW - 0.09 : DX1 - leafW + 0.09, DH / 2, Z0 + 0.14, 0, 0, Math.PI / 2);
      }
      P.box(DX1 - DX0, 0.3, 0.5, M.mid, (DX0 + DX1) / 2, DH + 0.15, Z0 + 0.1); P.box(DX1 - DX0, 0.05, 0.04, G(AMBER, 2.2), (DX0 + DX1) / 2, DH - 0.02, Z0 + 0.36);
      for (const x of [X0 + 0.9, 11.9, DX1 + 0.5]) P.box(0.06, HH - 1.2, 0.03, G(CYAN, 1.7), x, HH / 2, Z0 + 0.03);
      for (const z of [-11.2, -14.2]) { P.box(0.03, HH - 1.2, 0.06, G(CYAN, 1.7), X1 - 0.02, HH / 2, z); P.box(0.03, HH - 1.2, 0.06, G(CYAN, 1.7), X0 + 0.02, HH / 2, z); }
      P.box(W, 0.05, 0.05, G(CYAN, 1.6), bx, 0.1, Z0 + 0.04); P.box(0.05, 0.05, D, G(CYAN, 1.6), X1 - 0.04, 0.1, bz);
      P.pl(5.2, 2.6, k.mat(0xffffff, { map: paintBayWall(), roughness: 0.6, metalness: 0.3 }), (DX0 + DX1) / 2, DH + 1.25, Z0 + 0.36, 0, 0, 0);
      // the roof: a slab, a truss of deep beams, two crane rails and the gantry crane over the rocket
      P.box(W + 0.3, 0.3, D + 0.3, M.dark, bx, HH + 0.15, bz);
      for (let z = Z0 + 0.8; z < Z1; z += 1.8) { P.box(W, 0.5, 0.18, M.mid, bx, HH - 0.25, z); for (let x = X0 + 0.6; x < X1; x += 1.2) P.rod([x, HH - 0.5, z], [x + 0.6, HH, z], 0.025, M.mid, 4, true); }
      for (const x of [X0 + 0.5, X1 - 0.5]) { P.box(0.3, 0.3, D, M.gun, x, HH - 0.65, bz); P.box(0.06, 0.06, D, M.chrome, x, HH - 0.47, bz); }
      { const cz = BAY.z + 0.2, cy = HH - 1.05;
        P.box(W - 0.6, 0.45, 0.4, M.hazardS, bx, cy, cz); P.box(W - 0.6, 0.12, 0.5, M.dark, bx, cy - 0.28, cz);
        for (const x of [X0 + 0.5, X1 - 0.5]) P.box(0.6, 0.5, 0.9, M.gun, x, cy + 0.15, cz);
        P.box(0.9, 0.5, 0.8, M.gun, BAY.x, cy - 0.5, cz); P.box(0.3, 0.05, 0.03, G(AMBER, 2.4), BAY.x, cy - 0.45, cz + 0.41);
        for (const s of [-1, 1]) P.rod([BAY.x + s * 0.2, cy - 0.75, cz], [BAY.x + s * 0.2, cy - 2.6, cz], 0.015, M.black);
        P.box(0.5, 0.35, 0.3, M.hazardS, BAY.x, cy - 2.75, cz); P.tor(0.14, 0.04, M.chrome, BAY.x, cy - 3.05, cz, 0, 0, 0, Math.PI * 1.4, 6, 16); }
      // the hangar window: the bridge's back wall ends at WALL_R; from there to the hangar's end the bay's front is glass,
      // a low sill, a transom in line with the top of the bridge's wall (the bay's name on it), glass above to the roof
      const SL = 0.7, WT = HH - 0.7; // the sill's top and where the top corner gussets sit
      P.box(W, SL, 0.7, M.mid, bx, SL / 2, Z1); P.box(W, 0.1, 0.012, M.hazard, bx, 0.13, Z1 + 0.356);
      P.box(W, 0.035, 0.03, G(CYAN, 2.2), bx, SL + 0.02, Z1 + 0.3);
      P.box(W, 0.4, 0.55, M.dark, bx, HH - 0.2, Z1 + 0.05); P.box(W, 0.035, 0.03, G(CYAN, 2.0), bx, HH - 0.42, Z1 + 0.33);
      for (const x of [13.0, X1 - 0.2]) {
        P.box(0.42, HH, 0.7, M.mid, x, HH / 2, Z1); P.box(0.04, HH - 0.6, 0.03, G(AMBER, 2.0), x, HH / 2, Z1 + 0.36);
        for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { if (x > 18 && sx > 0) continue; P.box(0.8, 0.24, 0.45, M.mid, x + sx * 0.42, sy > 0 ? WT : SL + 0.3, Z1, 0, 0, sx * sy * -0.62); }
      }
      for (const [sy, y] of [[1, WT], [-1, SL + 0.3]]) P.box(0.8, 0.24, 0.45, M.mid, X0 + 0.42, y, Z1, 0, 0, sy * -0.62);
      const glassG = canvasTex(256, 512), gg = glassG.ctx; gg.clearRect(0, 0, 256, 512);
      for (const [x0, w, a] of [[40, 70, 0.07], [130, 18, 0.1], [170, 40, 0.05]]) { gg.fillStyle = `rgba(200,230,255,${a})`; gg.beginPath(); gg.moveTo(x0, 512); gg.lineTo(x0 + w, 512); gg.lineTo(x0 + w + 180, 0); gg.lineTo(x0 + 180, 0); gg.fill(); }
      const streak = new THREE.MeshBasicMaterial({ map: glassG.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      P.pl(W, HH - 0.4 - SL, M.glass, bx, (HH - 0.4 + SL) / 2, Z1 + 0.02); P.pl(W, HH - 0.4 - SL, streak, bx, (HH - 0.4 + SL) / 2, Z1 + 0.03);
      // the mount: a table on four legs over the flame trench, hold-down arms, a lit ring; hazard lines on the floor
      const T = BAY.top, MW = 4.3, MD = 3.1;
      for (const [w, d, x, z] of [[MW + 1, 0.22, BAY.x, BAY.z - MD / 2 - 0.5], [MW + 1, 0.22, BAY.x, BAY.z + MD / 2 + 0.5], [0.22, MD + 1, BAY.x - MW / 2 - 0.5, BAY.z], [0.22, MD + 1, BAY.x + MW / 2 + 0.5, BAY.z]]) P.box(w, 0.012, d, M.hazardS, x, 0.006, z);
      P.box(2.0, 0.02, MD + 0.8, M.black, BAY.x, 0.008, BAY.z);
      for (let i = 0; i < 11; i++) P.box(1.9, 0.03, 0.05, M.dark, BAY.x, 0.02, BAY.z - MD / 2 - 0.3 + i * 0.37);
      P.box(MW, 0.16, MD, M.gun, BAY.x, T - 0.08, BAY.z);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        P.box(0.42, T - 0.16, 0.42, M.gun, BAY.x + sx * (MW / 2 - 0.3), (T - 0.16) / 2, BAY.z + sz * (MD / 2 - 0.3));
        P.box(0.3, 0.22, 0.12, M.dark, BAY.x + sx * 0.66, T + 0.1, BAY.z + sz * 0.62, 0, Math.atan2(sx, sz), 0);
      }
      P.box(MW + 0.02, 0.04, 0.04, M.hazardS, BAY.x, T - 0.04, BAY.z + MD / 2); P.box(0.04, 0.04, MD + 0.02, M.hazardS, BAY.x - MW / 2, T - 0.04, BAY.z);
      P.cyl(0.95, 0.95, 0.012, M.black, BAY.x, T + 0.006, BAY.z, 0, 0, 0, 40);
      P.tor(1.25, 0.018, G(AMBER, 2.0), BAY.x, T + 0.01, BAY.z, Math.PI / 2);
      // the umbilical tower: a red lattice, a hammerhead crane on top, three swing arms reaching the rocket
      const TW = 1.2, TH = 10.4, tx = TOWER.x, tz = TOWER.z, h = TW / 2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.13, TH, 0.13, M.tower, tx + sx * h, TH / 2, tz + sz * h);
      for (let y = 0.6; y < TH; y += 0.75) {
        P.box(TW, 0.07, 0.07, M.tower, tx, y, tz - h); P.box(TW, 0.07, 0.07, M.tower, tx, y, tz + h);
        P.box(0.07, 0.07, TW, M.tower, tx - h, y, tz); P.box(0.07, 0.07, TW, M.tower, tx + h, y, tz);
        if (y + 0.75 < TH) for (const s of [-1, 1]) { P.rod([tx - h, y, tz + s * h], [tx + h, y + 0.75, tz + s * h], 0.03, M.tower, 6, true); P.rod([tx - h * s, y, tz - h], [tx - h * s, y + 0.75, tz + h], 0.03, M.tower, 6, true); }
      }
      for (let y = 2.1; y < TH; y += 3) { P.box(TW + 0.5, 0.06, TW + 0.5, M.gun, tx, y, tz); P.box(TW + 0.5, 0.3, 0.02, M.tower, tx, y + 0.15, tz + h + 0.25); }
      P.box(TW + 0.3, 0.1, TW + 0.3, M.towerDark, tx, TH, tz);
      P.box(4.0, 0.22, 0.3, M.tower, tx - 0.9, TH + 0.5, tz); P.box(0.5, 0.5, 0.5, M.towerDark, tx + 0.9, TH + 0.35, tz);
      P.box(0.25, 0.6, 0.25, M.tower, tx, TH + 0.3, tz);
      const S = BAY.s, Wd = BAY.s * BAY.w, rCore = 0.72 * Wd, rUp = 0.5 * Wd, bOut = (1.2 + 0.42) * Wd; // world radii
      const arms = [[2.9, bOut + 0.05, false], [6.35, rUp + 0.05, false], [7.55, 0.44 * Wd + 0.05, true]];
      for (const [yr, rr, white] of arms) {
        const y = T + yr * S, x0 = tx - h, x1 = BAY.x + rr;
        P.box(x0 - x1, 0.12, 0.1, M.tower, (x0 + x1) / 2, y + 0.18, tz + 0.25); P.box(x0 - x1, 0.12, 0.1, M.tower, (x0 + x1) / 2, y - 0.18, tz + 0.25);
        for (let x = x1; x < x0; x += 0.3) P.rod([x, y - 0.18, tz + 0.25], [Math.min(x0, x + 0.3), y + 0.18, tz + 0.25], 0.02, M.tower, 4, true);
        P.box(x0 - x1, 0.04, 0.5, M.gun, (x0 + x1) / 2, y - 0.22, tz + 0.05);
        if (white) { P.rbox(0.6, 0.55, 0.6, 0.04, M.white, x1 + 0.25, y + 0.05, tz + 0.05); P.box(0.3, 0.2, 0.02, G(0xfff1c7, 2.0), x1 + 0.25, y + 0.1, tz + 0.36); }
        P.tube([[x0 - 0.2, y - 0.25, tz + 0.15], [(x0 + x1) / 2, y - 0.75, tz + 0.05], [x1 - 0.05, y - 0.35, BAY.z - 0.1]], 0.05, M.black, 20, 6);
        P.tube([[x0 - 0.4, y - 0.25, tz - 0.1], [(x0 + x1) / 2 + 0.2, y - 0.95, tz - 0.25], [x1 - 0.1, y - 0.55, BAY.z - 0.3]], 0.04, M.frost, 20, 6);
      }
      // floodlight masts in three corners and lamp heads on the window's posts; soft beams from the masts
      const bank = new THREE.MeshBasicMaterial({ map: lampBankTex(), toneMapped: false }); bank.color.setScalar(1.8);
      my.floodPts = []; my.floodAims = [];
      const flood = (x, y, z, ax, ay, az, beam) => {
        const yaw = Math.atan2(ax - x, az - z), pitch = Math.atan2(ay - y, Math.hypot(ax - x, az - z));
        P.push(x, y, z, 0, yaw, 0); P.push(0, 0, 0, -pitch, 0, 0);
        P.box(0.7, 0.38, 0.14, M.dark, 0, 0, -0.04); P.pl(0.64, 0.32, bank, 0, 0, 0.035);
        P.pop(); P.pop();
        if (beam) { my.floodPts.push(new THREE.Vector3(x, y, z)); my.floodAims.push(new THREE.Vector3(ax, ay, az)); }
      };
      for (const [mx, mz] of [[X0 + 0.8, Z0 + 0.8], [X1 - 0.8, Z0 + 0.8], [X1 - 0.8, Z1 - 1.1]]) {
        P.cyl(0.08, 0.12, 8.2, M.mid, mx, 4.1, mz, 0, 0, 0, 10);
        P.box(1.0, 0.08, 0.08, M.mid, mx, 8.1, mz); P.box(1.0, 0.08, 0.08, M.mid, mx, 7.3, mz);
        flood(mx - 0.28, 8.3, mz, BAY.x, 4.8, BAY.z, true); flood(mx + 0.28, 8.3, mz, BAY.x, 4.8, BAY.z, false); flood(mx, 7.5, mz, BAY.x, 2.2, BAY.z, true);
      }
      flood(WALL_R + 0.3, 7.0, Z1 - 0.5, BAY.x, 6.0, BAY.z, false); flood(13.0, 6.2, Z1 - 0.5, BAY.x, 3.0, BAY.z, false);
      // propellant tanks on the bay's right side, piped to the mount along the floor
      for (const [x, z, r, name, col] of [[16.9, -10.5, 0.85, 'OXÍGENO LÍQUIDO', '#38d6ff'], [16.95, -14.2, 0.72, 'HIDRÓGENO', '#ffb347']]) {
        const y = 0.5 + r;
        P.sph(r, M.frost, x, y, z, 1, 1, 1, 28, 18); P.tor(r + 0.01, 0.035, M.gun, x, y, z, Math.PI / 2, 0, 0, TAU, 8, 40);
        for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; P.rod([x + Math.sin(a) * r * 0.7, y - r * 0.5, z + Math.cos(a) * r * 0.7], [x + Math.sin(a) * r * 1.05, 0, z + Math.cos(a) * r * 1.05], 0.045, M.gun); }
        P.cyl(0.08, 0.08, 0.3, M.gun, x, y + r + 0.1, z); P.cyl(0.12, 0.12, 0.06, M.copper, x, y + r + 0.25, z);
        const t = canvasTex(512, 96), g = t.ctx; g.fillStyle = col; g.fillRect(0, 0, 512, 96); g.fillStyle = '#0b0f17'; g.font = '800 46px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '4px'; g.fillText(name, 256, 50, 490);
        const lab = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.22, 40, 1, true, -1.9, 1.5), k.mat(0xffffff, { map: t.tex, roughness: 0.6 }));
        lab.position.set(x, y + 0.05, z); room.add(lab);
        P.tube([[x - r * 0.6, 0.12, z], [x - 2.2, 0.12, z + (BAY.z - z) * 0.3], [BAY.x + MW / 2, 0.12, BAY.z + (z < BAY.z ? -0.6 : 0.6)]], 0.07, M.frost, 16, 8);
      }
      P.rbox(0.5, 0.55, 0.5, 0.04, M.gun, 15.1, 0.3, -12.0); P.cyl(0.11, 0.11, 0.06, k.mat(0xc81e1e), 15.1, 0.62, -12.0, 0, 0, 0, 12);
      // on the bridge's side of the window: a hazard band on the deck along the sill
      P.box(13.0 - X0, 0.012, 0.45, M.hazardS, (13.0 + X0) / 2, 0.007, Z1 + 0.62);
      P.flush(room);
      Sign('BAHÍA 1 · LANZAMIENTO', 'HERD-7 · zona restringida', 2.9, 0.46, (X0 + 13.0) / 2, 0.42, Z1 + 0.357, 0, { k: 1.15, accent: '#ffb347', h: 200 });
      // the beams: soft planes from each mast lamp to the rocket, wide at the far end, turned to the default camera
      const bt = canvasTex(64, 256), bg = bt.ctx, im = bg.createImageData(64, 256);
      for (let j = 0; j < 256; j++) for (let i = 0; i < 64; i++) { const u = (i + 0.5) / 64 - 0.5, v = (j + 0.5) / 256, a = Math.exp(-((u / 0.22) ** 2)) * Math.pow(1 - v, 1.3) * sstep(0, 0.06, v) * 0.33; const o = (j * 64 + i) * 4; im.data[o] = 255; im.data[o + 1] = 240; im.data[o + 2] = 210; im.data[o + 3] = a * 255; }
      bg.putImageData(im, 0, 0); bt.tex.needsUpdate = true;
      const beamM = my.beamM = new THREE.MeshBasicMaterial({ map: bt.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const glowT = radialTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,244,214,.8)'], [0.5, 'rgba(255,220,160,.18)'], [1, 'rgba(255,220,160,0)']], 64);
      const camP = new THREE.Vector3(5.5, 15.5, 25.5), d = new THREE.Vector3(), cv = new THREE.Vector3(), xa = new THREE.Vector3(), za = new THREE.Vector3(), m4 = new THREE.Matrix4();
      my.floodPts.forEach((p, i) => {
        const a = my.floodAims[i], L = p.distanceTo(a) * 1.1;
        const geo = new THREE.BufferGeometry(), w0 = 0.35, w1 = 2.4;
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-w0 / 2, 0, 0, w0 / 2, 0, 0, -w1 / 2, L, 0, w1 / 2, L, 0], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)); geo.setIndex([0, 1, 2, 1, 3, 2]);
        d.subVectors(a, p).normalize(); cv.subVectors(camP, p).normalize(); xa.crossVectors(d, cv).normalize(); za.crossVectors(xa, d).normalize();
        m4.makeBasis(xa, d, za).setPosition(p);
        const beam = new THREE.Mesh(geo, beamM); beam.applyMatrix4(m4); beam.renderOrder = 3; room.add(beam);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sp.material.color.setScalar(1.1); sp.scale.setScalar(1.0); sp.position.copy(p); room.add(sp);
      });
      // the light on the rocket (no shadows), a warm pool at its base, the bay's own cool fill
      const spot = my.bayLight = new THREE.SpotLight(0xfff4e0, 60, 30, 0.42, 0.6, 1.3); spot.position.set(8.4, 10.8, -6.2); spot.target.position.set(BAY.x, 4.2, BAY.z); room.add(spot, spot.target);
      const base = my.bayBase = new THREE.PointLight(0xffd7a0, 9, 8, 1.6); base.position.set(BAY.x + 0.8, 1.7, BAY.z + 2.0); room.add(base);
      my.bayFill = new THREE.PointLight(0x9fc4ff, 6, 12, 1.4); my.bayFill.position.set(16.5, 7.5, -13.5); room.add(my.bayFill);
      // the floodlights spill through the hangar window onto the bridge's deck, with the rocket's long shadow in the pool
      const W2 = 3.4, H2 = 5.2, x0 = WALL_R + 0.1, cx = x0 + W2 / 2, cz = Z1 + 0.05 + H2 / 2;
      const sp = canvasTex(256, 512), sg = sp.ctx, gr = sg.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, 'rgba(255,226,170,.62)'); gr.addColorStop(0.35, 'rgba(255,214,150,.26)'); gr.addColorStop(1, 'rgba(255,200,130,0)');
      sg.fillStyle = gr; sg.fillRect(0, 0, 256, 512);
      const fade = sg.createLinearGradient(0, 0, 256, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.12, 'rgba(0,0,0,0)'); fade.addColorStop(0.88, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      sg.globalCompositeOperation = 'destination-out'; sg.fillStyle = fade; sg.fillRect(0, 0, 256, 512);
      const u = ((BAY.x - x0) / W2) * 256; sg.filter = 'blur(6px)'; sg.fillStyle = 'rgba(0,0,0,.75)'; // the shadow: cut out of the pool
      sg.beginPath(); sg.moveTo(u - 26, 0); sg.lineTo(u + 26, 0); sg.lineTo(u + 22, 300); sg.lineTo(u + 8, 400); sg.lineTo(u, 430); sg.lineTo(u - 8, 400); sg.lineTo(u - 22, 300); sg.closePath(); sg.fill();
      for (const s2 of [-1, 1]) { sg.beginPath(); sg.moveTo(u + s2 * 30, 0); sg.lineTo(u + s2 * 52, 0); sg.lineTo(u + s2 * 46, 220); sg.lineTo(u + s2 * 38, 250); sg.closePath(); sg.fill(); }
      sg.filter = 'none'; sg.globalCompositeOperation = 'source-over';
      const spill = Pl(W2, H2, new THREE.MeshBasicMaterial({ map: sp.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), cx, 0.011, cz, 0, -Math.PI / 2);
      my.spillMat = spill.material;
    }
    // the rocket: a Saturn-like core with two strap-on boosters, the roll pattern, fins, engine bells, the capsule and
    // its escape tower (rocket units; scaled by BAY.s, its girth by BAY.w)
    {
      const R = my.rocket = new THREE.Group(), P = new Parts(), sk = M.rSkin;
      const part = (rt, rb, y0, y1, seg = 48) => P.add(skinCyl(rt, rb, y1 - y0, rv(y0), rv(y1), seg), sk, 0, (y0 + y1) / 2, 0);
      part(0.72, 0.77, 0.42, 0.85); part(0.72, 0.72, 0.85, 3.7); part(0.715, 0.72, 3.7, 3.98); part(0.72, 0.715, 3.98, 6.0);
      part(0.5, 0.72, 6.0, 6.32); part(0.5, 0.5, 6.32, 7.3); part(0.5, 0.5, 7.3, 7.4); part(0.4, 0.5, 7.4, 7.75); part(0.08, 0.4, 7.75, 8.15, 32);
      P.cyl(0.08, 0.08, 0.01, M.rWhite, 0, 8.155, 0);
      P.cyl(0.76, 0.76, 0.05, M.rBlack, 0, 0.42, 0, 0, 0, 0, 48);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        P.push(0, 0, 0, 0, a, 0);
        const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.42, 0); fin.lineTo(0.42, 0.14); fin.lineTo(0, 0.85); fin.closePath();
        P.ext(fin, 0.05, M.rBlack, 0, 0.3, 0.7, 0, -Math.PI / 2, 0);
        P.cyl(0.13, 0.19, 0.75, M.rWhite, 0, 0.62, 0.72, 0, 0, 0, 16);
        P.cyl(0.02, 0.13, 0.2, M.rWhite, 0, 1.08, 0.72, 0, 0, 0, 16);
        P.pop();
        P.cyl(0.1, 0.22, 0.42, M.bell, Math.sin(a) * 0.42, 0.2, Math.cos(a) * 0.42, 0, 0, 0, 20, true);
      }
      P.cyl(0.1, 0.22, 0.42, M.bell, 0, 0.2, 0, 0, 0, 0, 20, true);
      for (let i = 0; i < 5; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2, x = i < 4 ? Math.sin(a) * 0.42 : 0, z = i < 4 ? Math.cos(a) * 0.42 : 0; P.cyl(0.07, 0.07, 0.02, M.black, x, 0.41, z, 0, 0, 0, 12); }
      // two boosters on the sides (local x: across the view from the bridge), with struts, bands, nose cones and nozzles
      for (const s of [-1, 1]) {
        const bx = s * 1.2, rb = 0.42;
        P.cyl(rb, rb, 4.6, M.rWhite, bx, 2.95, 0, 0, 0, 0, 32); P.cyl(0.02, rb, 0.9, M.rWhite, bx, 5.7, 0, 0, 0, 0, 32);
        for (const [y, hgt, m] of [[0.9, 0.3, M.rBlack], [4.05, 0.18, M.rBlack], [5.18, 0.08, M.red], [2.3, 0.05, M.rBlack]]) P.cyl(rb + 0.006, rb + 0.006, hgt, m, bx, y, 0, 0, 0, 0, 32);
        P.cyl(0.24, 0.36, 0.5, M.bell, bx, 0.4, 0, 0, 0, 0, 24, true); P.cyl(0.3, 0.3, 0.06, M.rBlack, bx, 0.66, 0, 0, 0, 0, 24);
        for (const y of [1.3, 4.7]) { P.rod([s * 0.68, y, 0.12], [bx - s * 0.36, y, 0.12], 0.04, M.gun); P.rod([s * 0.68, y, -0.12], [bx - s * 0.36, y, -0.12], 0.04, M.gun); }
        P.box(0.05, 1.6, 0.012, M.rBlack, bx, 3.1, -rb - 0.004); // a black lengthwise stripe facing the bridge
      }
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; P.rod([Math.sin(a) * 0.2, 8.1, Math.cos(a) * 0.2], [Math.sin(a) * 0.05, 8.55, Math.cos(a) * 0.05], 0.012, M.rBlack); }
      P.cyl(0.07, 0.07, 0.4, M.rWhite, 0, 8.75, 0, 0, 0, 0, 16); P.cyl(0.07, 0.07, 0.06, M.rBlack, 0, 8.58, 0, 0, 0, 0, 16);
      P.cyl(0.0, 0.07, 0.18, M.rBlack, 0, 9.04, 0, 0, 0, 0, 16); P.cyl(0.008, 0.008, 0.22, M.chrome, 0, 9.24, 0, 0, 0, 0, 6);
      // detail for close-ups: interstage rings, thruster quads on the upper stage, cable raceways, the escape tower's motor
      for (const [y, r] of [[3.76, 0.728], [6.0, 0.728], [7.34, 0.51]]) P.tor(r, 0.014, M.gun, 0, y, 0, Math.PI / 2, 0, 0, TAU, 6, 48);
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; P.push(Math.sin(a) * 0.5, 7.05, Math.cos(a) * 0.5, 0, a, 0); P.box(0.1, 0.12, 0.06, M.rBlack, 0, 0, 0.02); for (const [dx, dy] of [[-0.06, 0], [0.06, 0], [0, 0.07], [0, -0.07]]) P.cyl(0.012, 0.02, 0.04, M.bell, dx, dy, 0.05, Math.PI / 2, 0, 0, 8, true); P.pop(); }
      for (const a of [0.35, Math.PI + 0.35]) P.box(0.05, 2.7, 0.03, M.rWhite, Math.sin(a) * 0.735, 2.3, Math.cos(a) * 0.735, 0, a, 0);
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; P.cyl(0.015, 0.025, 0.07, M.bell, Math.sin(a) * 0.08, 8.66, Math.cos(a) * 0.08, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9, 8, true); }
      P.flush(R);
      R.rotation.y = Math.atan2(5.5 - BAY.x, 25.5 - BAY.z) - Math.PI; // the name and emblem face the bridge's default camera
      R.scale.set(BAY.s * BAY.w, BAY.s, BAY.s * BAY.w); R.position.set(BAY.x, BAY.top, BAY.z);
      room.add(R);
      my.warnMat = k.glow(0xff2d2d, 2.5);
      for (const [x, y, z] of [[BAY.x, BAY.top + 9.38 * BAY.s, BAY.z], [TOWER.x - 2.7, 11.05, TOWER.z], [TOWER.x + 0.6, 10.55, TOWER.z + 0.6]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), my.warnMat); m.position.set(x, y, z); room.add(m); }
    }
    // vapour: puffs boiling off round the base and venting from the upper stage (animated in tick)
    {
      const tex = puffTex(), N = k.PHONE ? 14 : 36, r = rng(5);
      my.puffs = [];
      for (let i = 0; i < N; i++) {
        const vent = i % 4 === 3, m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xeef6ff });
        const sp = new THREE.Sprite(m); sp.renderOrder = 4; room.add(sp);
        my.puffs.push({ sp, vent, ph: r(), sp0: 0.6 + r() * 0.6, a: r() * TAU, life: vent ? 3.2 : 6 + r() * 3 });
      }
    }
    // the countdown clock on the bridge's deck, facing the crew (and the default camera): big amber digits
    {
      const g = my.clock = new THREE.Group(), P = new Parts(), cw = 2.6, chh = 1.04, y0 = 1.3;
      const cd = my.cd = canvasTex(1024, 410); paintClock(cd.ctx, 0, false);
      my.cdMat = new THREE.MeshBasicMaterial({ map: cd.tex, toneMapped: false }); my.cdMat.color.setScalar(1.08);
      for (const sx of [-1, 1]) { P.box(0.16, y0, 0.16, M.mid, sx * 0.9, y0 / 2, 0); P.box(0.5, 0.06, 0.5, M.dark, sx * 0.9, 0.03, 0); P.box(0.04, y0 - 0.2, 0.02, G(AMBER, 1.8), sx * 0.9, y0 / 2, 0.085); }
      P.box(2.0, 0.1, 0.12, M.mid, 0, 0.5, 0);
      P.rbox(cw + 0.2, chh + 0.2, 0.36, 0.05, M.black, 0, y0 + chh / 2, 0);
      P.box(cw + 0.3, 0.06, 0.55, M.mid, 0, y0 + chh + 0.13, 0.08);
      P.pl(cw, chh, my.cdMat, 0, y0 + chh / 2, 0.185);
      P.box(cw + 0.2, 0.025, 0.02, G(AMBER, 2.2), 0, y0 - 0.1, 0.19);
      P.pl(0.42, 0.42, my.capEmblem || (my.capEmblem = capEmblemMat()), 0, y0 + chh + 0.42, 0.0);
      P.cyl(0.025, 0.025, 0.25, M.mid, 0, y0 + chh + 0.2, -0.02, 0, 0, 0, 8);
      P.flush(g); g.position.set(CLOCK.x, 0, CLOCK.z); g.rotation.y = Math.atan2(5.5 - CLOCK.x, 25.5 - CLOCK.z); room.add(g);
      k.block(CLOCK.x - 1.25, CLOCK.z - 0.4, CLOCK.x + 1.25, CLOCK.z + 0.4);
    }

    // ---- the CANTINA in the front-left corner: people take their coffee here as in Oficina. They stand on the warm mat
    // with their backs to the mess bar (the replicator glowing in its middle) and look out over the bridge, so the
    // default camera sees them whole. Built in the spot's own frame: +z is the way people face, the bar at z -1.85.
    {
      const P = new Parts(), cy = Math.cos(CAN.yaw), sy = Math.sin(CAN.yaw);
      const wx = (lx, lz) => CAN.x + lx * cy + lz * sy, wz = (lx, lz) => CAN.z - lx * sy + lz * cy;
      P.push(CAN.x, 0, CAN.z, 0, CAN.yaw, 0);
      const BZ = -1.85; // the bar's back panel
      // the back panel: a tall unit with mug shelves, the neon sign on top, the menu on the right
      P.rbox(4.0, 2.5, 0.3, 0.04, M.cBody, 0, 1.25, BZ - 0.2); P.box(4.1, 0.08, 0.42, M.dark, 0, 2.54, BZ - 0.18);
      P.box(4.0, 0.035, 0.03, G(AMBER, 2.0), 0, 2.48, BZ - 0.03);
      for (const y of [1.55, 1.98]) {
        P.box(1.35, 0.04, 0.24, M.wood, -1.28, y, BZ - 0.02); P.box(1.3, 0.02, 0.02, G(AMBER, 1.5), -1.28, y - 0.03, BZ + 0.1);
        for (let i = 0; i < 6; i++) { const x = -1.85 + i * 0.22; if ((i + (y > 1.7 ? 1 : 0)) % 3 === 2) P.cyl(0.045, 0.045, 0.16, M.glass, x, y + 0.1, BZ - 0.02, 0, 0, 0, 10); else { P.cyl(0.05, 0.042, 0.1, i % 3 ? M.white : M.red, x, y + 0.07, BZ - 0.02, 0, 0, 0, 12); P.tor(0.032, 0.01, M.white, x + 0.055, y + 0.07, BZ - 0.02, 0, 0, 0, TAU, 6, 10); } }
      }
      P.pl(1.25, 0.82, screen(paintMenu(), 1.0), 1.3, 1.78, BZ - 0.04);
      // the counter in front of the panel: wood top with an amber underglow, a pastry case, the urn, cups ready
      P.box(4.0, 1.0, 0.55, M.cBody, 0, 0.5, BZ + 0.2); P.box(4.12, 0.06, 0.66, M.wood, 0, 1.03, BZ + 0.22);
      P.box(4.0, 0.025, 0.02, G(AMBER, 1.9), 0, 0.96, BZ + 0.49); P.box(3.9, 0.02, 0.02, G(AMBER, 1.3), 0, 0.12, BZ + 0.48);
      for (let i = 0; i < 6; i++) P.box(0.02, 0.76, 0.02, M.dark, -1.75 + i * 0.7, 0.54, BZ + 0.48);
      P.rbox(0.7, 0.32, 0.4, 0.03, M.glass, -1.3, 1.22, BZ + 0.2); P.box(0.66, 0.02, 0.36, M.wood, -1.3, 1.1, BZ + 0.2);
      for (const [dx, cc] of [[-0.2, 0xd08a3e], [0, 0xa8642c], [0.2, 0xe9c27a]]) P.sph(0.07, k.mat(cc, { roughness: 0.7 }), -1.3 + dx, 1.15, BZ + 0.2, 1, 0.55, 1);
      P.cyl(0.16, 0.18, 0.42, M.copper, 1.45, 1.27, BZ + 0.18, 0, 0, 0, 20); P.sph(0.1, M.copper, 1.45, 1.52, BZ + 0.18, 1, 0.6, 1); P.cyl(0.02, 0.02, 0.14, M.chrome, 1.45, 1.18, BZ + 0.36, Math.PI / 2, 0, 0);
      for (let i = 0; i < 3; i++) { P.cyl(0.05, 0.042, 0.1, M.white, 0.75 + i * 0.16, 1.11, BZ + 0.35, 0, 0, 0, 12); }
      P.sph(0.16, M.wood, -0.75, 1.08, BZ + 0.3, 1, 0.45, 1); for (const [dx, dz, cc] of [[0, 0, 0xf97316], [0.06, 0.07, 0xef4444], [-0.05, 0.06, 0xfacc15], [0.03, -0.07, 0x84cc16]]) P.sph(0.055, k.mat(cc, { roughness: 0.5 }), -0.75 + dx, 1.15, BZ + 0.3 + dz);
      // the replicator in the middle: a tower out of the counter, its lit alcove facing the room, a ring on top
      const RZ = BZ + 0.05;
      P.rbox(0.95, 2.75, 0.62, 0.06, M.dark, 0, 1.375, RZ); P.rbox(1.05, 0.12, 0.7, 0.03, M.mid, 0, 2.78, RZ);
      P.box(0.62, 0.86, 0.05, M.black, 0, 1.42, RZ + 0.3);
      const niche = canvasTex(128, 160), c = niche.ctx, gr = c.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#fff6e0'); gr.addColorStop(0.2, '#ffd59a'); gr.addColorStop(0.6, '#6b3d12'); gr.addColorStop(1, '#120a04'); c.fillStyle = gr; c.fillRect(0, 0, 128, 160);
      c.fillStyle = 'rgba(10,6,2,.7)'; for (let yy = 104; yy < 150; yy += 7) for (let xx = 10; xx < 118; xx += 9) { c.beginPath(); c.roundRect(xx, yy, 6, 4, 1.5); c.fill(); }
      const nm = new THREE.MeshBasicMaterial({ map: niche.tex, toneMapped: false }); nm.color.setScalar(1.4);
      P.pl(0.54, 0.76, nm, 0, 1.42, RZ + 0.33);
      P.box(0.4, 0.035, 0.3, M.chrome, 0, 1.06, RZ + 0.42);
      P.cyl(0.05, 0.042, 0.1, M.white, 0, 1.13, RZ + 0.4, 0, 0, 0, 14); P.cyl(0.042, 0.042, 0.005, k.mat(0x3b2412, { roughness: 0.2 }), 0, 1.176, RZ + 0.4, 0, 0, 0, 14);
      for (const s of [-1, 1]) P.box(0.025, 2.4, 0.025, G(AMBER, 2.2), s * 0.46, 1.42, RZ + 0.31);
      const rs = canvasTex(512, 160), rg = rs.ctx; rg.fillStyle = '#0b0805'; rg.fillRect(0, 0, 512, 160); rg.strokeStyle = '#ffb347'; rg.lineWidth = 6; rg.strokeRect(5, 5, 502, 150);
      rg.textAlign = 'center'; rg.textBaseline = 'middle'; rg.fillStyle = '#ffd59a'; rg.font = '900 64px system-ui'; rg.letterSpacing = '6px'; rg.fillText('CAFÉ', 256, 62); rg.fillStyle = '#7dd3fc'; rg.font = '700 32px system-ui'; rg.letterSpacing = '4px'; rg.fillText('REPLICADOR 24 H', 256, 120);
      const rsm = new THREE.MeshBasicMaterial({ map: rs.tex, toneMapped: false }); rsm.color.setScalar(1.12);
      P.pl(0.82, 0.26, rsm, 0, 2.3, RZ + 0.315);
      P.tor(0.4, 0.022, G(AMBER, 2.4), 0, 2.86, RZ, Math.PI / 2, 0, 0, TAU, 6, 6);
      // a beam over the counter on two posts: two copper pendant lamps over the counter's ends, the neon sign on top
      for (const sx of [-1, 1]) P.box(0.08, 0.66, 0.08, M.dark, sx * 1.95, 2.86, BZ + 0.12);
      P.box(4.0, 0.1, 0.12, M.dark, 0, 3.2, BZ + 0.12); P.box(3.9, 0.02, 0.02, G(AMBER, 1.6), 0, 3.14, BZ + 0.19);
      for (const lx of [-1.3, 1.3]) {
        P.rod([lx, 3.15, BZ + 0.2], [lx, 2.95, BZ + 0.2], 0.008, M.black);
        P.cyl(0.05, 0.19, 0.17, M.copper, lx, 2.88, BZ + 0.2, 0, 0, 0, 20, true);
        P.sph(0.065, G(0xffc27a, 3.0), lx, 2.81, BZ + 0.2);
      }
      // the high table beside the spot (behind and to the right, seen from the default camera) with cups and stools
      const tx = 1.55, tz = 0.6;
      P.cyl(0.42, 0.42, 0.045, M.wood, tx, 1.06, tz, 0, 0, 0, 32); P.tor(0.42, 0.012, G(AMBER, 1.6), tx, 1.06, tz, Math.PI / 2, 0, 0, TAU, 6, 40);
      P.cyl(0.04, 0.04, 1.04, M.chrome, tx, 0.52, tz, 0, 0, 0, 10); P.cyl(0.26, 0.28, 0.04, M.dark, tx, 0.02, tz, 0, 0, 0, 24);
      for (const [dx, dz] of [[-0.18, 0.08], [0.16, -0.1], [0.05, 0.2]]) { P.cyl(0.05, 0.042, 0.1, M.white, tx + dx, 1.13, tz + dz, 0, 0, 0, 14); P.tor(0.032, 0.01, M.white, tx + dx + 0.055, 1.13, tz + dz, 0, 0, 0, TAU, 6, 10); P.cyl(0.042, 0.042, 0.005, k.mat(0x3b2412, { roughness: 0.2 }), tx + dx, 1.176, tz + dz, 0, 0, 0, 14); }
      for (const [sx, sz] of [[0.62, 0.0], [0.2, 0.75]]) { P.cyl(0.18, 0.18, 0.06, M.red, tx + sx, 0.78, tz + sz, 0, 0, 0, 20); P.cyl(0.03, 0.03, 0.75, M.chrome, tx + sx, 0.38, tz + sz, 0, 0, 0, 8); P.tor(0.15, 0.012, M.chrome, tx + sx, 0.3, tz + sz, Math.PI / 2, 0, 0, TAU, 6, 20); P.cyl(0.16, 0.18, 0.03, M.dark, tx + sx, 0.015, tz + sz, 0, 0, 0, 16); }
      // a warm round mat under the spot
      const rt = canvasTex(256, 256), rgc = rt.ctx; rgc.translate(128, 128);
      const rgr = rgc.createRadialGradient(0, 0, 10, 0, 0, 126); rgr.addColorStop(0, 'rgba(120,70,30,.6)'); rgr.addColorStop(0.85, 'rgba(90,50,20,.5)'); rgr.addColorStop(0.9, 'rgba(255,170,80,.75)'); rgr.addColorStop(0.95, 'rgba(90,50,20,.45)'); rgr.addColorStop(1, 'rgba(90,50,20,0)');
      rgc.fillStyle = rgr; rgc.beginPath(); rgc.arc(0, 0, 127, 0, TAU); rgc.fill();
      P.add(new THREE.CircleGeometry(1.9, 48), new THREE.MeshBasicMaterial({ map: rt.tex, transparent: true, depthWrite: false }), 0.4, 0.012, -0.35, -Math.PI / 2);
      P.pop();
      // the low bulkhead with planters closing the corner at the deck's open front edge
      P.box(3.4, 0.55, 0.5, M.cBody, LEFT_X + 1.75, 0.275, 8.7); P.box(3.45, 0.04, 0.56, M.wood, LEFT_X + 1.75, 0.57, 8.7);
      P.box(3.3, 0.02, 0.02, G(AMBER, 1.5), LEFT_X + 1.75, 0.5, 8.96);
      P.flush(room);
      const neon = new THREE.MeshBasicMaterial({ map: paintNeon(), transparent: true, toneMapped: false, depthWrite: false }); neon.color.setScalar(1.12); my.neonMat = neon;
      const nn = Pl(2.6, 0.65, neon, wx(0, BZ + 0.15), 3.58, wz(0, BZ + 0.15), CAN.yaw);
      nn.renderOrder = 2;
      const l = my.cantinaLight = new THREE.PointLight(0xffb36b, 7, 8, 1.4); l.position.set(wx(0, -0.6), 2.4, wz(0, -0.6)); room.add(l);
      my.steam = [0, 1].map((i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: my.puffs[0].sp.material.map, transparent: true, depthWrite: false, opacity: 0 })); s.position.set(wx(0, RZ + 0.4), 1.1, wz(0, RZ + 0.4)); s.userData.ph = i * 0.5; room.add(s); return s; });
      // people walk round the bar (three boxes along it) and the table
      for (const [a, b] of [[-2.05, -0.68], [-0.68, 0.68], [0.68, 2.05]]) {
        const xs = [], zs = []; for (const lx of [a, b]) for (const lz of [-2.2, -1.5]) { xs.push(wx(lx, lz)); zs.push(wz(lx, lz)); }
        k.block(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
      }
      k.block(wx(tx, tz) - 0.45, wz(tx, tz) - 0.45, wx(tx, tz) + 0.45, wz(tx, tz) + 0.45);
      // planters on the bulkhead and hydroponics in the corner (trays of fan leaves behind glass)
      const hx = -12.35, hz = 8.5;
      Cy(0.42, 0.46, 0.3, M.mid, hx, 0.15, hz, { seg: 20, cast: true });
      Cy(0.42, 0.42, 0.18, M.mid, hx, 3.15, hz, { seg: 20 });
      Cy(0.38, 0.38, 2.7, M.glass, hx, 1.65, hz, { seg: 24, open: true });
      Ring(0.4, 0.015, G(0xd18cff, 1.6), hx, 3.05, hz); Ring(0.4, 0.015, G(0xd18cff, 1.6), hx, 0.32, hz);
      const lt = canvasTex(64, 128), lg = lt.ctx;
      lg.fillStyle = '#fff'; lg.beginPath(); lg.moveTo(32, 126); lg.bezierCurveTo(-6, 80, 6, 26, 32, 2); lg.bezierCurveTo(58, 26, 70, 80, 32, 126); lg.fill();
      lg.strokeStyle = 'rgba(120,140,110,.9)'; lg.lineWidth = 3; lg.beginPath(); lg.moveTo(32, 124); lg.lineTo(32, 10); lg.stroke();
      const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
      const leafMat = new THREE.MeshStandardMaterial({ map: lt.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
      const rr = rng(31), mats = [], greens = [0x2f9e62, 0x5cc27a, 0x1f7a4a, 0x8fd16a];
      const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const put = (px, py, pz, yaw, tilt, w, h) => { e.set(tilt, yaw, 0); q.setFromEuler(e); sc.set(w, h, 1); mats.push(new THREE.Matrix4().compose(v.set(px, py, pz), q, sc)); };
      for (let i = 0; i < 4; i++) {
        const y = 0.55 + i * 0.65;
        Cy(0.3, 0.3, 0.04, M.dark, hx, y, hz, { seg: 16 });
        for (let j = 0; j < 13; j++) { const a = (j / 13) * TAU + i * 0.7 + rr() * 0.3, d = 0.03 + rr() * 0.06; put(hx + Math.cos(a) * d, y + 0.02, hz + Math.sin(a) * d, -a + Math.PI / 2, 0.35 + rr() * 0.55, 0.07 + rr() * 0.04, 0.2 + rr() * 0.12); }
      }
      for (let p = 0; p < 4; p++) { const px = LEFT_X + 0.9 + p * 0.65; for (let j = 0; j < 11; j++) { const a = (j / 11) * TAU + p + rr() * 0.4; put(px + Math.cos(a) * 0.08, 0.6, 8.7 + Math.sin(a) * 0.08, -a + Math.PI / 2, 0.5 + rr() * 0.6, 0.1 + rr() * 0.05, 0.3 + rr() * 0.2); } }
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, mats.length), col = new THREE.Color();
      mats.forEach((m4, i) => { leaves.setMatrixAt(i, m4); leaves.setColorAt(i, col.set(greens[Math.floor(rr() * greens.length)])); });
      room.add(leaves);
    }

    // ---- holo table: planet hologram, the ship in orbit, a scan ring
    {
      const HX = HOLO.x, HZ = HOLO.z;
      Cy(0.62, 0.85, 0.95, M.dark, HX, 0.475, HZ, { seg: 6, cast: true });
      Cy(1.18, 1.0, 0.16, M.mid, HX, 1.03, HZ, { seg: 6, cast: true });
      Ring(0.86, 0.02, G(CYAN, 2), HX, 0.06, HZ);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 1.05, 6, 1), screen(roB.tex, 0.95)); ring.rotation.set(-Math.PI / 2, 0, Math.PI / 6); ring.position.set(HX, 1.115, HZ); room.add(ring);
      const em = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshBasicMaterial({ toneMapped: false, map: radialTex([[0, 'rgba(170,240,255,1)'], [0.25, 'rgba(56,214,255,.75)'], [0.55, 'rgba(10,50,74,1)'], [0.7, 'rgba(56,214,255,.9)'], [0.78, 'rgba(8,24,36,1)'], [0.9, 'rgba(56,214,255,.6)'], [1, 'rgba(8,24,36,1)']], 128) }));
      em.rotation.x = -Math.PI / 2; em.position.set(HX, 1.12, HZ); room.add(em);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.02, 4, 6), G(CYAN, 2.2)); edge.rotation.set(Math.PI / 2, 0, Math.PI / 6); edge.position.set(HX, 1.11, HZ); room.add(edge);
      const ct = canvasTex(8, 128), cg = ct.ctx, gr = cg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(120,220,255,0)'); gr.addColorStop(1, 'rgba(120,220,255,.13)'); cg.fillStyle = gr; cg.fillRect(0, 0, 8, 128);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.36, 1.7, 40, 1, true), new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      cone.position.set(HX, 1.98, HZ); room.add(cone);
      const holo = my.holo = new THREE.Group(); holo.position.set(HX, 2.35, HZ);
      const add = (m) => { m.renderOrder = 2; holo.add(m); return m; };
      const hm = (c, o, kk = 1.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(kk), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      add(new THREE.Mesh(new THREE.SphereGeometry(0.56, 48, 24), new THREE.MeshBasicMaterial({ map: holoPlanetTex(my.planet && my.planet.material.uniforms.day.value), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: true })));
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 2), Object.assign(hm(0x38d6ff, 0.07, 1), { wireframe: true })));
      const orbit = add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.008, 6, 96), hm(0x9be8ff, 0.8))); orbit.rotation.x = Math.PI / 2 + 0.35;
      const ship = my.holoShip = new THREE.Group();
      ship.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24), hm(0xbfefff, 0.85, 0.95)));
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.14), hm(0xe8f8ff, 0.9)); hull.position.set(0, -0.03, -0.1); ship.add(hull);
      for (const s of [-1, 1]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.16), hm(0x9be8ff, 0.9)); n.position.set(s * 0.07, -0.01, -0.14); ship.add(n); }
      const orbitG = my.holoOrbit = new THREE.Group(); orbitG.rotation.x = 0.35; orbitG.add(ship); ship.position.set(0.95, 0, 0); holo.add(orbitG);
      const scan = my.holoScan = add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.006, 6, 64), hm(0x9be8ff, 0.9))); scan.rotation.x = Math.PI / 2;
      room.add(holo);
      const l = new THREE.PointLight(0x5fd4ff, 4, 7, 1.7); l.position.set(HX, 2.4, HZ); room.add(l); my.holoLight = l;
      const t = canvasTex(512, 512), g = t.ctx; g.translate(256, 256); g.strokeStyle = 'rgba(56,214,255,.55)'; g.lineWidth = 3;
      for (const r of [200, 236]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU, r0 = i % 6 ? 224 : 206; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * 236, Math.sin(a) * 236); g.stroke(); }
      g.fillStyle = 'rgba(56,214,255,.6)'; g.font = '700 26px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HERD PRIME · HABITABLE', 0, -170);
      const decal = Pl(4.2, 4.2, new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), HX, 0.014, HZ, 0, -Math.PI / 2);
      decal.rotation.set(-Math.PI / 2, 0, 0);
      k.block(HX - 1.2, HZ - 1.15, HX + 1.2, HZ + 1.15);
    }
    // ---- transporter pad in the front right corner, with supply crates beside it
    {
      const TX = 11.55, TZ = 7.7;
      Cy(1.1, 1.18, 0.14, M.mid, TX, 0.07, TZ, { seg: 6, cast: true });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; Cy(0.24, 0.26, 0.05, M.light, TX + Math.cos(a) * 0.62, 0.16, TZ + Math.sin(a) * 0.62, { seg: 20 }); }
      Cy(0.24, 0.26, 0.05, M.light, TX, 0.16, TZ, { seg: 20 });
      my.padRings = [];
      for (let i = 0; i < 7; i++) { const a = (i / 6) * TAU, x = i < 6 ? TX + Math.cos(a) * 0.62 : TX, z = i < 6 ? TZ + Math.sin(a) * 0.62 : TZ; my.padRings.push(Ring(0.2, 0.012, k.glow(0x9be8ff, 1.4), x, 0.19, z)); }
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.02, 4, 6), G(CYAN, 2)); edge.rotation.set(Math.PI / 2, 0, 0); edge.position.set(TX, 0.145, TZ); room.add(edge);
      const N = 160, pp = new Float32Array(N * 3), r = rng(8); my.beamSeeds = [];
      for (let i = 0; i < N; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.9; pp.set([TX + Math.cos(a) * d, 0.2 + r() * 2.4, TZ + Math.sin(a) * d], i * 3); my.beamSeeds.push(r()); }
      const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      const beam = my.beam = new THREE.Points(bgeo, new THREE.PointsMaterial({ size: 0.06, color: new THREE.Color(0xbfefff).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, map: radialTex([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], 32) }));
      my.beamBase = pp.slice(); room.add(beam);
      const t = canvasTex(1024, 128), g = t.ctx; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 56px system-ui'; g.letterSpacing = '8px'; g.fillStyle = 'rgba(125,211,252,.6)'; g.fillText('ELEVADOR DE CARGA', 512, 66);
      const st = Pl(2.6, 0.32, new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false }), TX - 0.2, 0.012, TZ - 1.5, 0, -Math.PI / 2); st.rotation.set(-Math.PI / 2, 0, 0);
      const crate = (w, h, d, x, y, z, ry, label, col) => {
        B(w, h, d, M.mid, x, y, z, { ry, cast: true, r: 0.03 });
        B(w + 0.02, 0.05, d + 0.02, M.dark, x, y + h / 2 - 0.08, z, { ry }); B(w + 0.02, 0.05, d + 0.02, M.dark, x, y - h / 2 + 0.08, z, { ry });
        const tt = canvasTex(512, 256), gg = tt.ctx; gg.fillStyle = col; gg.fillRect(0, 0, 512, 36); gg.fillRect(0, 220, 512, 36);
        gg.fillStyle = 'rgba(230,240,255,.85)'; gg.font = '800 64px system-ui'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.letterSpacing = '6px'; gg.fillText(label, 256, 128, 480);
        const pl = Pl(w * 0.9, h * 0.62, new THREE.MeshBasicMaterial({ map: tt.tex, transparent: true }), 0, 0, 0, 0); pl.material.color.setScalar(0.8);
        pl.position.set(x + Math.sin(ry) * (d / 2 + 0.005), y, z + Math.cos(ry) * (d / 2 + 0.005)); pl.rotation.y = ry;
      };
      crate(1.0, 0.7, 0.75, 12.35, 0.35, 4.75, -0.35, 'SUMINISTROS', '#ffb347');
      crate(0.85, 0.6, 0.65, 12.4, 1.0, 4.8, -0.25, 'MÉDICO', '#ff6b6b');
      crate(0.75, 0.55, 0.6, 12.2, 0.275, 5.85, -0.6, 'SENSORES', '#38d6ff');
    }
    // ---- floor emblem at the front of the bridge
    {
      // the mission patch painted on the deck: the rocket rising from the Earth's limb to the Moon, names round the rim
      const S = 1024, t = canvasTex(S, S), g = t.ctx, c = S / 2;
      g.fillStyle = 'rgba(8,14,30,.85)'; g.beginPath(); g.arc(c, c, 500, 0, TAU); g.fill();
      g.lineWidth = 16; g.strokeStyle = 'rgba(212,166,42,.9)'; g.stroke();
      g.lineWidth = 6; g.strokeStyle = 'rgba(125,211,252,.7)'; g.beginPath(); g.arc(c, c, 360, 0, TAU); g.stroke();
      g.save(); g.beginPath(); g.arc(c, c, 356, 0, TAU); g.clip();
      const sky = g.createLinearGradient(0, c - 360, 0, c + 360); sky.addColorStop(0, '#0b1a3a'); sky.addColorStop(1, '#16306b'); g.fillStyle = sky; g.fillRect(0, 0, S, S);
      const r = rng(3); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.beginPath(); g.arc(c - 340 + r() * 680, c - 340 + r() * 500, 1 + r() * 2.5, 0, TAU); g.fill(); }
      g.fillStyle = '#d9dde3'; g.beginPath(); g.arc(c + 170, c - 170, 80, 0, TAU); g.fill(); g.fillStyle = 'rgba(0,0,0,.18)'; for (const [x, y, rr] of [[25, -20, 18], [-30, 20, 12], [10, 35, 9]]) { g.beginPath(); g.arc(c + 170 + x, c - 170 + y, rr, 0, TAU); g.fill(); }
      const earth = g.createRadialGradient(c, c + 640, 300, c, c + 640, 470); earth.addColorStop(0, '#1d6fb8'); earth.addColorStop(0.92, '#3fa0e8'); earth.addColorStop(1, 'rgba(140,210,255,.9)');
      g.fillStyle = earth; g.beginPath(); g.arc(c, c + 640, 470, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,190,90,.9)'; g.lineWidth = 8; g.setLineDash([4, 18]); g.beginPath(); g.moveTo(c - 60, c + 170); g.quadraticCurveTo(c - 40, c - 120, c + 110, c - 150); g.stroke(); g.setLineDash([]);
      g.save(); g.translate(c - 70, c + 40); g.rotate(0.28); // the rocket
      g.fillStyle = '#ff9d2e'; g.beginPath(); g.moveTo(-22, 120); g.quadraticCurveTo(0, 230, 22, 120); g.fill(); g.fillStyle = '#ffe08a'; g.beginPath(); g.moveTo(-12, 120); g.quadraticCurveTo(0, 185, 12, 120); g.fill();
      g.fillStyle = '#f1f4f8'; g.beginPath(); g.moveTo(-34, 120); g.lineTo(-34, -60); g.quadraticCurveTo(0, -170, 34, -60); g.lineTo(34, 120); g.closePath(); g.fill();
      g.fillStyle = '#16181d'; g.fillRect(-34, 70, 34, 50); g.fillRect(0, -30, 34, 30); g.beginPath(); g.moveTo(-34, 70); g.lineTo(-70, 130); g.lineTo(-34, 120); g.fill(); g.beginPath(); g.moveTo(34, 70); g.lineTo(70, 130); g.lineTo(34, 120); g.fill();
      g.fillStyle = '#b91c1c'; g.fillRect(-34, -64, 68, 10);
      g.restore(); g.restore();
      g.fillStyle = 'rgba(255,214,140,.95)'; g.font = '800 64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const arcText = (txt, rad, inv) => { g.save(); g.translate(c, c); const step = inv ? -0.07 : 0.074; let a = -((txt.length - 1) * step) / 2; for (const ch of txt) { g.save(); g.rotate(a); g.translate(0, inv ? rad : -rad); g.fillText(ch, 0, 0); g.restore(); a += step; } g.restore(); }; // along the top, or along the bottom read left to right
      arcText('MISIÓN HERD-7', 430, false);
      g.font = '700 50px system-ui'; g.fillStyle = 'rgba(190,225,255,.9)'; arcText('· RUMBO A LA LUNA ·', 440, true);
      const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false }); m.color.setScalar(0.8);
      const d = Pl(3.3, 3.3, m, -4.7, 0.013, 7.25, 0, -Math.PI / 2); d.rotation.set(-Math.PI / 2, 0, -0.35);
    }
    // ---- set pieces on the open floor: a 1:50 model of HERD-7 in a glass case on the mission patch (the rocket again,
    // whole, in the default view), a propellant cart for the bay, amber walkway studs from the bridge to the cantina
    {
      const P = new Parts(), x = -4.7, z = 7.25, top = 0.62;
      P.cyl(0.66, 0.74, 0.12, M.dark, x, 0.06, z, 0, 0, 0, 6); P.cyl(0.56, 0.62, top - 0.12, M.cBody, x, 0.12 + (top - 0.12) / 2, z, 0, 0, 0, 6);
      P.cyl(0.6, 0.6, 0.04, M.gold, x, top, z, 0, 0, 0, 6); P.tor(0.62, 0.014, G(AMBER, 2.0), x, 0.125, z, Math.PI / 2, 0, 0, TAU, 4, 6);
      P.cyl(0.46, 0.46, 1.75, M.glass, x, top + 0.02 + 0.875, z, 0, 0, 0, 32, true);
      P.tor(0.465, 0.018, M.chrome, x, top + 1.77, z, Math.PI / 2, 0, 0, TAU, 6, 40); P.tor(0.465, 0.008, G(CYAN, 1.8), x, top + 1.74, z, Math.PI / 2, 0, 0, TAU, 4, 40); // an open glass case: a solid lid read as a black disc floating over the deck
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; P.cyl(0.012, 0.012, 1.75, M.chrome, x + Math.sin(a) * 0.465, top + 0.9, z + Math.cos(a) * 0.465, 0, 0, 0, 6); }
      P.cyl(0.3, 0.3, 0.008, G(0xfff1c7, 1.4), x, top + 0.025, z, 0, 0, 0, 32);
      const yaw = Math.atan2(5.5 - x, 25.5 - z);
      P.pl(0.6, 0.18, signMat(k, 'HERD-7 · 1:50', '#ffb347'), x + Math.sin(yaw) * 0.62, 0.38, z + Math.cos(yaw) * 0.62, 0, yaw, 0);
      P.flush(room, { cast: false }); // no shadows: the case's lid high up threw a lone dark disc on the deck
      const mdl = my.rocket.clone(), sc = 0.155;
      mdl.scale.set(sc * BAY.w, sc, sc * BAY.w); mdl.position.set(x, top + 0.03 - 0.42 * sc + 0.07, z); mdl.rotation.y = yaw - Math.PI;
      room.add(mdl);
      k.block(x - 0.78, z - 0.78, x + 0.78, z + 0.78);
    }
    {
      const P = new Parts(), cx = 7.3, cz = 2.5, ry = -0.5;
      P.push(cx, 0, cz, 0, ry, 0);
      P.rbox(1.5, 0.1, 0.85, 0.02, M.gun, 0, 0.3, 0); P.box(1.52, 0.03, 0.87, M.hazardS, 0, 0.36, 0);
      for (const [dx, dz] of [[-0.6, -0.33], [0.6, -0.33], [-0.6, 0.33], [0.6, 0.33]]) { P.box(0.06, 0.2, 0.06, M.dark, dx, 0.16, dz); P.cyl(0.08, 0.08, 0.06, M.black, dx, 0.08, dz, Math.PI / 2, 0, 0, 12); }
      P.rod([0.75, 0.36, -0.3], [1.05, 1.05, -0.3], 0.025, M.chrome); P.rod([0.75, 0.36, 0.3], [1.05, 1.05, 0.3], 0.025, M.chrome); P.rod([1.05, 1.05, -0.32], [1.05, 1.05, 0.32], 0.03, M.dark);
      for (const [i, band] of [[0, 0x38d6ff], [1, 0xffb347], [2, 0x38d6ff]]) {
        const tx = -0.45 + i * 0.42;
        P.cyl(0.17, 0.17, 0.95, M.white, tx, 0.36 + 0.475, 0, 0, 0, 0, 20); P.sph(0.17, M.white, tx, 1.31, 0, 1, 0.5, 1, 20, 8);
        P.cyl(0.175, 0.175, 0.12, k.mat(band, { roughness: 0.5 }), tx, 0.98, 0, 0, 0, 0, 20); P.cyl(0.05, 0.05, 0.12, M.chrome, tx, 1.43, 0, 0, 0, 0, 10);
        P.cyl(0.05, 0.05, 0.03, k.mat(0xc81e1e, { roughness: 0.5 }), tx, 1.5, 0, 0, 0, 0, 10);
      }
      P.box(1.3, 0.04, 0.02, M.black, 0, 0.78, 0.18); P.box(1.3, 0.04, 0.02, M.black, 0, 0.78, -0.18);
      P.pl(0.7, 0.16, signMat(k, 'PROPELENTE', '#38d6ff'), 0, 0.3, 0.44);
      P.pop(); P.flush(room);
      k.block(cx - 0.95, cz - 0.8, cx + 0.95, cz + 0.8);
    }
    {
      const pts = []; // two rows of amber studs, a gentle curve from the dais's side to the cantina's mat
      const A = [-3.9, 2.4], C = [-5.0, 4.4], B = [-6.9, 4.5]; // a quadratic curve A -> B pulled toward C
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, x = (1 - u) ** 2 * A[0] + 2 * u * (1 - u) * C[0] + u * u * B[0], z = (1 - u) ** 2 * A[1] + 2 * u * (1 - u) * C[1] + u * u * B[1];
        const dx = 2 * (1 - u) * (C[0] - A[0]) + 2 * u * (B[0] - C[0]), dz = 2 * (1 - u) * (C[1] - A[1]) + 2 * u * (B[1] - C[1]), l = Math.hypot(dx, dz);
        for (const s of [-1, 1]) pts.push([x - (dz / l) * s * 0.5, z + (dx / l) * s * 0.5]);
      }
      const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 0.025, 12), G(AMBER, 1.7), pts.length), m4 = new THREE.Matrix4();
      pts.forEach(([x, z], i) => { m4.makeTranslation(x, 0.012, z); im.setMatrixAt(i, m4); });
      room.add(im);
    }
    // ---- a glass balustrade along the deck's open front and right edges: the cut-away reads as a bridge deck, not a
    // slab; lit top rails, chrome posts, a kick light
    {
      const P = new Parts(), rh = 0.95;
      const run = (x0, z0, x1, z1) => {
        const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        P.push(mx, 0, mz, 0, a, 0);
        P.pl(L, rh - 0.12, M.glass, 0, 0.12 + (rh - 0.12) / 2, 0); P.pl(L, rh - 0.12, M.glass, 0, 0.12 + (rh - 0.12) / 2, 0, 0, Math.PI, 0);
        P.box(L, 0.07, 0.09, M.mid, 0, rh, 0); P.box(L, 0.025, 0.03, G(CYAN, 1.9), 0, rh + 0.045, 0); P.box(L, 0.1, 0.12, M.dark, 0, 0.05, 0); P.box(L, 0.02, 0.02, G(CYAN, 1.4), 0, 0.11, 0.065);
        const n = Math.max(1, Math.round(L / 1.9));
        for (let i = 0; i <= n; i++) P.cyl(0.035, 0.035, rh, M.chrome, -L / 2 + (i * L) / n, rh / 2, 0, 0, 0, 0, 10);
        P.pop();
      };
      run(-9.35, 9.08, 12.95, 9.08); run(13.08, 8.95, 13.08, -8.55);
      P.flush(room);
    }
    // ---- the open floor: a lit trench in front of the desks, data lines from each desk to the dais, deck hatches
    {
      const fl = my.floorG = new THREE.Group(); room.add(fl);
      const gt = canvasTex(1024, 32), gg = gt.ctx; gg.fillStyle = '#05080e'; gg.fillRect(0, 0, 1024, 32);
      for (let x = 0; x < 1024; x += 8) { gg.fillStyle = 'rgba(120,150,190,.22)'; gg.fillRect(x, 4, 3, 24); }
      for (let x = 0; x < 1024; x += 128) { gg.fillStyle = 'rgba(56,214,255,.85)'; gg.fillRect(x + 60, 12, 8, 8); }
      gt.tex.wrapS = THREE.RepeatWrapping; gt.tex.repeat.set(6, 1);
      const tm = new THREE.MeshBasicMaterial({ map: gt.tex, toneMapped: false }); tm.color.setScalar(0.9);
      const tr = new THREE.Mesh(new THREE.PlaneGeometry(21.0, 0.36), tm); tr.rotation.x = -Math.PI / 2; tr.position.set(-1.0, 0.006, 0); fl.add(tr);
      B(21.0, 0.012, 0.025, G(CYAN, 1.6), -1.0, 0.008, -0.19, { to: fl }); B(21.0, 0.012, 0.025, G(CYAN, 1.2), -1.0, 0.008, 0.19, { to: fl });
      const pt = canvasTex(16, 256), pg = pt.ctx, pgr = pg.createLinearGradient(0, 0, 0, 256);
      pgr.addColorStop(0, 'rgba(56,214,255,.12)'); pgr.addColorStop(0.8, 'rgba(56,214,255,.12)'); pgr.addColorStop(0.92, 'rgba(160,240,255,1)'); pgr.addColorStop(1, 'rgba(56,214,255,.12)');
      pg.fillStyle = pgr; pg.fillRect(0, 0, 16, 256); pt.tex.wrapT = THREE.RepeatWrapping; my.lineTex = pt.tex;
      const lg = new THREE.PlaneGeometry(0.05, 1); lg.rotateX(-Math.PI / 2);
      my.lines = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ map: pt.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 16);
      my.lines.count = 0; my.lines.frustumCulled = false; my.linesKey = ''; room.add(my.lines);
      const nub = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), G(CYAN, 1.8), 16); nub.count = 0; my.lineNubs = nub; room.add(nub);
      const ht = canvasTex(256, 256), hg = ht.ctx;
      hg.fillStyle = '#0b1019'; hg.fillRect(0, 0, 256, 256); hg.strokeStyle = '#2b3445'; hg.lineWidth = 6; hg.strokeRect(6, 6, 244, 244);
      hg.fillStyle = '#0a0f17'; hg.fillRect(26, 26, 204, 204);
      for (let y = 34; y < 222; y += 14) for (let x = 34 + ((y / 14) % 2) * 7; x < 222; x += 14) { hg.fillStyle = '#2c3648'; hg.beginPath(); hg.arc(x, y, 4.5, 0, TAU); hg.fill(); }
      hg.fillStyle = '#38d6ff'; for (const [x, y] of [[14, 14], [242, 14], [14, 242], [242, 242]]) { hg.beginPath(); hg.arc(x, y, 5, 0, TAU); hg.fill(); }
      hg.fillStyle = 'rgba(253,224,71,.6)'; hg.font = '700 15px system-ui'; hg.fillText('ACCESO · EPS', 30, 248);
      const hatchM = new THREE.MeshBasicMaterial({ map: ht.tex, toneMapped: false }); hatchM.color.setScalar(0.85);
      const HATCH = [[3.6, 1.6, 0.3], [-6.9, 0.6, 0]];
      const hi = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2), hatchM, HATCH.length), m4 = new THREE.Matrix4();
      HATCH.forEach(([x, z, ry], i) => { m4.makeRotationY(ry).setPosition(x, 0.009, z); hi.setMatrixAt(i, m4); });
      room.add(hi);
    }
    // ---- the empty command dais (shown when nobody sits at the centre: no Product or Lead on this floor)
    {
      const g = my.emptyDais = new THREE.Group(), P = new Parts();
      buildCommand(k, P, g, { seat: M.red, glow: G(AMBER, 2.2), color: new THREE.Color(0xd4a62a) }, LIFT, true);
      P.flush(g); g.visible = false; room.add(g);
    }
    // ---- maintenance drone (wanders the open floor, hovering)
    {
      const d = my.drone = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.09, 32), M.white); d.add(hull); // matte white: a metal body read as a black disc from above
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.05, 32), M.gun); lid.position.y = -0.07; d.add(lid);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 10, 0, TAU, 0, Math.PI / 2), M.dark); dome.position.y = 0.04; dome.scale.y = 0.6; d.add(dome);
      d.add(new THREE.Mesh(new THREE.CylinderGeometry(0.323, 0.323, 0.022, 32, 1, true, -0.55, 1.1), G(CYAN, 2.4)));
      const under = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), G(0x9be8ff, 1.5)); under.rotation.x = Math.PI / 2; under.position.y = -0.096; d.add(under);
            const spot = my.droneSpot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(150,225,255,.22)'], [1, 'rgba(150,225,255,0)']], 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      spot.rotation.x = -Math.PI / 2; spot.position.y = 0.016; scene.add(spot);
      d.position.set(-4.5, 2.9, 1); my.droneDir = 0.7; my.droneH = 3.05;
      scene.add(d);
    }
    // rim light from the viewport (no shadows)
    const rim = my.rim = new THREE.DirectionalLight(0x7f9cff, 0.8); rim.position.set(-4, 9, -30); scene.add(rim);
  },

  // ---------------------------------------------------------------- working information: dark metal, lit edges
  fixtures(k, fx) {
    const { M, G, B } = k.my;
    fx.board.frame.material = M.dark;
    const LX = k.C.LEFT_X + 0.1;
    B(0.02, 0.022, 8.4, G(CYAN, 1.5), LX, 5.73, -3.2); B(0.02, 0.022, 8.4, G(CYAN, 1.5), LX, 1.37, -3.2);
    B(0.02, 4.38, 0.022, G(CYAN, 1.5), LX, 3.55, -7.41); B(0.02, 4.38, 0.022, G(CYAN, 1.5), LX, 3.55, 1.01);
    fx.trace.frame.material = M.dark;
    fx.trace.mesh.material.color.setScalar(0.9);
    for (const l of fx.trace.legs) l.material = M.dark;
    { // a display pylon instead of easel legs
      const tg = fx.trace.group;
      B(4.12, 0.035, 0.03, G(CYAN, 2.0), 0, 3.71, 0.06, { to: tg }); B(4.12, 0.035, 0.03, G(CYAN, 2.0), 0, 0.99, 0.06, { to: tg });
      B(0.03, 2.7, 0.03, G(CYAN, 1.6), -2.07, 2.35, 0.06, { to: tg }); B(0.03, 2.7, 0.03, G(CYAN, 1.6), 2.07, 2.35, 0.06, { to: tg });
      for (const sx of [-1, 1]) {
        B(0.26, 1.05, 0.34, M.mid, sx * 1.8, 0.6, 0, { to: tg, r: 0.04, cast: true });
        B(0.035, 0.75, 0.02, G(CYAN, 1.8), sx * 1.8, 0.62, 0.175, { to: tg });
        B(0.16, 0.1, 0.02, G(AMBER, 1.6), sx * 1.8, 0.98, 0.175, { to: tg });
      }
      B(4.3, 0.1, 0.9, M.dark, 0, 0.05, 0, { to: tg, r: 0.03 });
      B(4.2, 0.02, 0.02, G(CYAN, 1.6), 0, 0.1, 0.46, { to: tg });
      B(3.4, 0.1, 0.2, M.mid, 0, 0.88, 0.0, { to: tg, r: 0.03 });
    }
    fx.clock.rim.material = k.glow(CYAN, 1.7);
  },

  clockFace(c, d) {
    c.fillStyle = '#060b16'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(56,214,255,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(128, 128, 118, 0, TAU); c.stroke();
    c.lineCap = 'round';
    for (let i = 0; i < 60; i++) { const a = (i * Math.PI) / 30, big = i % 5 === 0; c.strokeStyle = big ? '#38d6ff' : 'rgba(56,214,255,.45)'; c.lineWidth = big ? 6 : 2; c.beginPath(); c.moveTo(128 + Math.sin(a) * (big ? 94 : 104), 128 - Math.cos(a) * (big ? 94 : 104)); c.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112); c.stroke(); }
    c.fillStyle = '#7dd3fc'; c.font = '700 22px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, 128, 178);
    const hand = (a, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); c.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 58, 10, '#e2f6ff'); hand(d.getMinutes() * (Math.PI / 30), 88, 6, '#e2f6ff');
    c.fillStyle = '#ffb347'; c.beginPath(); c.arc(128, 128, 8, 0, TAU); c.fill();
  },

  // ---------------------------------------------------------------- desks: one station per role
  station(k, st) {
    const my = k.my, M = my.M, p = st.props, g = st.group, a = st.agent || {};
    // the office desk goes: every station below is built from scratch (the working information stays: st.info)
    for (const m of p.desk) m.visible = false;
    for (const m of [...p.books, ...p.pens, ...p.plant, ...p.mug]) m.visible = false;
    p.mat.visible = false; p.laptop.visible = false; p.lamp.visible = false; p.chair.visible = false;
    p.bezel.material = M.bezel;
    if (st.wall && !st.wall.userData.naveFrame) { // a lit frame in the owner's colour round their wall screen
      st.wall.userData.naveFrame = true;
      const fm = k.glow(new THREE.Color(a.color || CYAN), 1.6), W2 = 4.16, H2 = 2.53;
      for (const [w, h, x, y] of [[W2, 0.035, 0, H2 / 2], [0.035, H2, -W2 / 2, 0], [0.035, H2, W2 / 2, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), fm); b.position.set(x, y, k.C.BACK_Z + 0.15); st.wall.add(b); }
    }
    const color = new THREE.Color(a.color || CYAN);
    const own = { color, glow: k.glow(color, 2.2), seat: k.mat(color.clone().lerp(new THREE.Color(0x12151c), 0.5), { roughness: 0.6 }) };
    const kind = st.centre ? 'capitan' : kindOf(a.role);
    const P = new Parts();
    try {
      if (st.centre) buildCommand(k, P, g, own, st.lift || LIFT, false);
      else (STATIONS[kind] || STATIONS.operaciones)(k, P, g, own, kind, st);
      if (a.temp && !st.centre) { // a temp's station: hazard tape on the console and a 'temporal' tag
        const fz = DZ + 0.68 + ((st.info && st.info.front.position.z) || 0), ty = st.tapeY || 0.2;
        P.box(2.86, 0.05, 0.012, M.hazard, 0, ty, fz);
        P.pl(0.5, 0.16, signMat(k, 'TEMPORAL', '#fbbf24'), 1.13, ty + 0.16, fz + 0.004);
      }
    } finally { pickBox(P, p, st.centre); P.flush(g); }
  },

  plate(ctx, p) {
    ctx.fillStyle = '#081120'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 128, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(56,214,255,.5)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.roundRect(10, 10, 30, 108, 12); ctx.fill();
    ctx.fillStyle = '#e8f6ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 44px system-ui'; ctx.fillText(p.name, 276, 48, 440);
    ctx.fillStyle = '#7dd3fc'; ctx.font = '600 28px system-ui'; ctx.fillText(p.title || '', 276, 96, 440);
  },

  // ---------------------------------------------------------------- uniforms by division, kit by role
  outfit(k, ch, a) {
    const role = a && a.role, div = divisionOf(role), M = ch.mats, kind = role ? kindOf(role) : 'visita';
    M.shirt.color.set(DIVISION[div]); M.shirt.roughness = 0.7;
    M.shirtDark.color.set(0x0d0f14); M.pants.color.set(0x111319); M.pants.roughness = 0.75;
    const black = new THREE.MeshStandardMaterial({ color: 0x0f1116, roughness: 0.65 });
    const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.265, 28, 12, 0, TAU, 0, 1.32), black);
    yoke.position.y = 0.5; yoke.scale.set(1.21, 1.02, 0.86);
    ch.wear(ch.upper, yoke);
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 1, emissive: 0x3a2a00 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc9d1dc, roughness: 0.25, metalness: 1 });
    const oval = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), silver); oval.rotation.x = Math.PI / 2; oval.scale.set(1.3, 1, 0.8); oval.position.set(0.14, 0.55, 0.225);
    const sh = new THREE.Shape(); sh.moveTo(0, 0.07); sh.lineTo(0.042, -0.05); sh.lineTo(0, -0.025); sh.lineTo(-0.042, -0.05); sh.closePath();
    const delta = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), gold); delta.position.set(0.14, 0.555, 0.226);
    ch.wear(ch.upper, oval); ch.wear(ch.upper, delta);
    const pips = pipsOf(role);
    for (let i = 0; i < pips; i++) {
      const ang = 0.55 + i * 0.22, pip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10), gold);
      pip.rotation.x = Math.PI / 2; pip.position.set(-Math.sin(ang) * 0.2, 0.62, Math.cos(ang) * 0.2 * 0.86 + 0.02);
      ch.wear(ch.upper, pip);
    }
    if (/superadmin/i.test(role || '')) for (const arm of [ch.armL, ch.armR]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.014, 6, 18), gold); b.rotation.x = Math.PI / 2; b.position.y = -0.36; ch.wear(arm, b); }
    // a belt for everyone on duty, and the kit of each post
    if (role) { const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24, 1, true), black); belt.position.y = 0.13; belt.scale.z = 0.84; ch.wear(ch.upper, belt); }
    const headset = (tipC) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.014, 6, 28, Math.PI), black); band.position.set(0, 0.02, -0.02);
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), black); ear.rotation.z = Math.PI / 2; ear.position.set(0.33, 0.0, 0.0);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), black); boom.position.set(0.3, -0.12, 0.13); boom.rotation.set(0.9, 0, 0.25);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), k.glow(tipC, 2)); tip.position.set(0.23, -0.2, 0.26);
      for (const m of [band, ear, boom, tip]) ch.wear(ch.head, m);
    };
    const onBelt = (geo, mat, x, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0.12, 0.25); m.rotation.z = rz; ch.wear(ch.upper, m); return m; };
    if (kind === 'sistemas' || kind === 'operaciones') headset(AMBER);
    if (kind === 'sistemas') { // a visor band over the eyes
      const v = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 24, Math.PI * 0.7), k.glow(0x38d6ff, 1.6)); v.rotation.set(0, 0, Math.PI * 0.15); v.position.set(0, 0.05, 0.02); v.scale.set(1, 0.55, 1.05); v.rotation.x = Math.PI / 2 - 0.1; ch.wear(ch.head, v);
    }
    if (kind === 'ciencia' || kind === 'exploracion') { // a tricorder on the belt, a science headset
      headset(0x7dd3fc);
      onBelt(new THREE.BoxGeometry(0.1, 0.13, 0.05), black, 0.2); onBelt(new THREE.BoxGeometry(0.06, 0.02, 0.052), k.glow(0x4ade80, 1.8), 0.2).position.y = 0.16;
    }
    if (kind === 'maquinas' || kind === 'prototipos') { // a tool belt and work goggles pushed up on the forehead
      onBelt(new THREE.BoxGeometry(0.12, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 }), -0.2);
      onBelt(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 6), silver, 0.12, 0.2);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.02, 6, 28), black); strap.rotation.x = Math.PI / 2 - 0.35; strap.position.set(0, 0.16, -0.02); ch.wear(ch.head, strap);
      for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xffb347, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 })); l.rotation.x = Math.PI / 2 - 0.35; l.position.set(sx * 0.09, 0.22, 0.27); ch.wear(ch.head, l); }
    }
    if (kind === 'tactico') { // a padded tactical vest and a phaser on the hip
      const vest = new THREE.Mesh(new THREE.CapsuleGeometry(0.255, 0.18, 4, 16), new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.7 })); vest.position.y = 0.38; vest.scale.set(1.24, 0.9, 0.9); ch.wear(ch.upper, vest);
      onBelt(new THREE.BoxGeometry(0.06, 0.08, 0.16), black, -0.26);
    }
    if (kind === 'mando' || kind === 'almirante' || /product/i.test(role || '')) { // command: a gold stripe across the shoulders
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.012, 6, 32, Math.PI), gold); st.rotation.set(0, 0, 0); st.position.set(0, 0.56, 0.02); st.scale.set(1.18, 0.55, 1); st.rotation.x = -Math.PI / 2 + 0.25; ch.wear(ch.upper, st);
    }
    // the crew carry their own light: a soft glow of their own colours (stronger on the night watch, see daylight), as
    // if lit by the consoles round them, so faces and uniforms read on a dark bridge
    const crew = k.my.crew || (k.my.crew = new Set());
    for (const [m, w] of [[M.skin, 1], [M.skinDark, 0.85], [M.shirt, 0.8], [M.shirtDark, 0.6], [M.hair, 0.55], [M.pants, 0.5], [M.white, 0.4], [black, 0.6]]) {
      if (!m || !m.emissive || crew.has(m)) continue;
      m.userData.crewK = w; crew.add(m); m.addEventListener('dispose', () => crew.delete(m));
      crewGlow(m, k.my.crewV || 0);
    }
  },

  // ---------------------------------------------------------------- light: space at any hour, a day and a night watch
  daylight(k, f) {
    const { scene, hemi, sun, my } = k;
    scene.background = new THREE.Color(0x010309);
    scene.fog = null;
    // two watches that look different: the day watch is bright and neutral, the planet's sunlit face toward the bridge;
    // the night watch dims the overheads to a deep blue, the star sets behind the planet (a crescent and its cities),
    // the consoles, the pools under the stations, the cantina and the floodlit rocket carry the light
    const q = sstep(0.1, 0.55, f), night = q < 0.5, was = my.night;
    my.night = night; my.q = q;
    scene.environmentIntensity = 0.24 + 0.86 * q;
    hemi.intensity = 0.5 + 1.75 * q; hemi.color.set(0x5d6cc4).lerp(new THREE.Color(0xf2f5ff), q); hemi.groundColor.set(0x160f22).lerp(new THREE.Color(0x4a4652), q);
    sun.intensity = 0.45 + 2.6 * q; sun.color.set(0x8796ff).lerp(new THREE.Color(0xfff6ea), q); sun.position.set(-7, 18, 9);
    // the day watch reads as day: the deck plates and the hull lighten; the crew's own glow is strongest at night
    if (my.floor) my.floor.material.color.setScalar(0.85 + 0.75 * q);
    if (my.hullMats) for (const m of my.hullMats) m.color.setScalar(0.8 + 0.55 * q);
    my.crewV = 0.07 + 0.36 * (1 - q);
    if (my.crew) for (const m of my.crew) crewGlow(m, my.crewV);
    SUN.lerpVectors(SUN_NIGHT, SUN_DAY, q).normalize(); if (my.glare) my.glare.position.copy(SUN).multiplyScalar(140);
    if (my.rim) { my.rim.intensity = 0.55 + 0.35 * q; my.rim.color.set(night ? 0x5f74e0 : 0x9fb4ff); }
    if (my.bayLight) my.bayLight.intensity = night ? 85 : 55;
    if (my.bayBase) my.bayBase.intensity = night ? 12 : 7;
    if (my.bayFill) my.bayFill.intensity = night ? 3 : 7;
    if (my.spillMat) my.spillMat.color.setScalar(night ? 1.35 : 0.75);
    if (my.cantinaLight) { my.cantinaLight.intensity = night ? 11 : 6; my.cantinaLight.distance = night ? 9.5 : 8; }
    if (my.holoLight) my.holoLight.userData.k = night ? 1.5 : 1;
    if (my.pools) for (const m of my.pools.values()) m.color.copy(m.userData.base).multiplyScalar(0.3 + 0.55 * (1 - q));
    if (my.G && was !== night) { // lit trim leans to a deeper blue at night (cool colours only: amber, red and green keep their meaning)
      for (const m of my.glows.values()) {
        const b = m.userData.base || (m.userData.base = m.color.clone());
        m.color.copy(b); if (night && b.b > b.r * 1.5) m.color.multiply(my.nightTint || (my.nightTint = new THREE.Color(0.55, 0.7, 1.15)));
      }
    }
    if (my.shift && was !== night) { paintShift(my.shift.ctx, night); my.shift.tex.needsUpdate = true; my.shiftMat.color.setScalar(night ? 1.25 : 0.95); }
  },

  // ---------------------------------------------------------------- after the desks move
  layout(k) {
    const my = k.my, c = k.centre();
    const nRows = Math.round((k.frontZ() - k.C.AISLE_Z) / k.C.ROW_D) + 1, rows = nRows > 1 ? 2 : 1;
    if (my.emptyDais) { // nobody at the centre: the empty command dais stands there instead (not when a third row of
      // desks, a big team without a Product or Lead, takes that floor), and people walk round it as round a captain's
      const show = !c && nRows <= 2, ez = centreZ(rows), f = EMPTY_FOOT;
      my.emptyDais.visible = show;
      if (show) my.emptyDais.position.set(CX, LIFT, ez - DZ);
      if (!my.emptyBlock) my.emptyBlock = k.block();
      if (my.emptyBlock) { if (show) my.emptyBlock.set(CX + f.x0, ez + f.z0, CX + f.x1, ez + f.z1); else my.emptyBlock.set(); }
    }
    my.linesKey = ''; my.flAt = -9;
  },

  // ---------------------------------------------------------------- animation (cheap: no allocation)
  tick(k, dt, t) {
    const my = k.my;
    if (my.planet) { my.planet.rotation.y += dt * 0.012; my.planet.material.uniforms.shift.value = (t * 0.0025) % 1; }
    if (my.moon) my.moon.rotation.y += dt * 0.004;
    if (my.stars) { my.stars.position.copy(k.camera.position); my.stars.rotation.y += dt * 0.0012; }
    if (my.holo) {
      my.holo.children[0].rotation.y += dt * 0.35; my.holo.children[1].rotation.y -= dt * 0.12;
      my.holoOrbit.rotation.y += dt * 0.6; my.holoShip.rotation.y = Math.PI;
      my.holoScan.position.y = Math.sin(t * 0.9) * 0.5; my.holoScan.scale.setScalar(Math.sqrt(Math.max(0.02, 1 - (my.holoScan.position.y / 0.6) ** 2)));
      my.holoLight.intensity = (4 + Math.sin(t * 7) * 0.3) * (my.holoLight.userData.k || 1);
    }
    // things that turn: armillary rings, centrifuges, rotors, sensor dishes, holograms (a desk that left stops turning)
    if (my.spin.length) {
      let n = 0;
      for (let i = 0; i < my.spin.length; i++) { const s = my.spin[i]; if (s.g && !s.g.parent) continue; s.o.rotation[s.ax] += dt * s.sp; my.spin[n++] = s; }
      my.spin.length = n;
    }
    if (my.running) {
      const c = my.tmpC || (my.tmpC = new THREE.Color()), n = my.running.count;
      for (let i = 0; i < n; i++) { const v = 0.25 + 2.2 * Math.pow(Math.max(0, Math.cos((i * 0.35 - t * 3) % TAU)), 16); c.setRGB(v * 0.5, v * 0.85, v); my.running.setColorAt(i, c); }
      my.running.instanceColor.needsUpdate = true;
    }
    if (my.callLight) my.callLight.material.color.setRGB(1, 0.7, 0.28).multiplyScalar((t % 1.6) < 0.8 ? 2.2 : 0.3);
    if (my.warnMat) my.warnMat.color.setRGB(1, 0.18, 0.18).multiplyScalar((t % 1.4) < 0.25 ? 3.2 : 0.35);
    if (my.M && my.M.plasma) { const v = 1.25 + Math.sin(t * 5.3) * 0.3 + Math.sin(t * 13.1) * 0.15; my.M.plasma.color.setRGB(0.62 * v, 0.3 * v, 1.0 * v); }
    if (my.vials) for (let i = 0; i < 3; i++) { const v = 1.4 + 0.8 * Math.max(0, Math.sin(t * 1.3 + i * 2.1)); const b = my.vialBase || (my.vialBase = my.vials.map((m) => m.color.clone().multiplyScalar(1 / 2))); my.vials[i].color.copy(b[i]).multiplyScalar(v); }
    // readouts, a few times a second
    my.uiAt = my.uiAt || 0;
    if (t - my.uiAt > (k.PHONE ? 0.5 : 0.2)) {
      my.uiAt = t;
      paintReadoutA(my.roA.ctx, t); my.roA.tex.needsUpdate = true; for (const x of my.animTex) x.needsUpdate = true;
      paintReadoutB(my.roB.ctx, t, 1); my.roB.tex.needsUpdate = true;
      paintRadar(my.radar.ctx, t); my.radar.tex.needsUpdate = true;
      if (my.code) { paintCode(my.code.ctx, t); my.code.tex.needsUpdate = true; paintSpectrum(my.spec.ctx, t); my.spec.tex.needsUpdate = true; paintTarget(my.target.ctx, t); my.target.tex.needsUpdate = true; paintRack(my.rack.ctx, t); my.rack.tex.needsUpdate = true; }
      if (my.keys) { const c = my.tmpK || (my.tmpK = new THREE.Color()), n = my.keys.count, s = Math.floor(t * (my.night ? 1.5 : 3)); for (let i = 0; i < n; i++) { const on = ((i * 7919 + s * 104729) % 13) < 4; c.copy(my.keyCols[i]).multiplyScalar(on ? (my.night ? 1.2 : 1.9) : (my.night ? 0.22 : 0.35)); my.keys.setColorAt(i, c); } my.keys.instanceColor.needsUpdate = true; }
    }
    // the countdown: to the next full hour; on the hour it holds for a minute ("cuenta atrás detenida")
    const now = Date.now(), sec = Math.floor(now / 1000);
    if (my.cd && sec !== my.cdSec) {
      my.cdSec = sec;
      // seconds into the hour: lift-off on the hour (30 s), the count from T-58:30, a built-in hold at T-10:00 for the
      // 49th minute (like a real count), then on to zero at the next hour: no jumps
      const d = new Date(now), s = d.getMinutes() * 60 + d.getSeconds(), hold = s >= 2940 && s < 3000, go = s < 30;
      const left = go ? 0 : s < 2940 ? 3540 - s : hold ? 600 : 3600 - s;
      my.cdLeft = left; my.launchText = go ? '¡DESPEGUE!' : `T−${String(Math.floor(left / 60) % 60).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      paintClock(my.cd.ctx, left, hold, go); my.cd.tex.needsUpdate = true;
    }
    // condition: amber when someone needs you (blocked), green otherwise; repainted once a second or while blinking
    my.stAt = my.stAt || -9;
    if (t - my.stAt > 1 || (my.alert && t - my.stAt > 0.1)) {
      my.stAt = t;
      let alert = false;
      for (const d of k.desks()) if (d.agent && d.agent.online !== false && d.agent.status === 'blocked') { alert = true; break; }
      my.alert = alert;
      paintStatus(my.status.ctx, t, alert, my.night, my.launchText || ''); my.status.tex.needsUpdate = true;
      const pulse = Math.abs(Math.sin(t * 3)), v = alert ? 1.3 + pulse * 1.7 : 1.8;
      if (alert) my.alertMat.color.setRGB(1 * v, 0.62 * v, 0.1 * v); else if (my.night) my.alertMat.color.setRGB(0.75 * v, 0.1 * v, 0.28 * v); else my.alertMat.color.setRGB(0.85 * v, 0.95 * v, 1 * v);
      if (my.beaconMat) { const b = alert ? 0.7 + pulse * 1.0 : 0.2; my.beaconMat.color.setRGB(1 * b, 0.52 * b, 0.08 * b); }
      if (my.tacBeacon) { const b = alert ? 0.8 + pulse * 2.4 : 0.45; my.tacBeacon.color.setRGB(1 * b, 0.2 * b, 0.28 * b); }
    }
    // vapour round the rocket: puffs rise and spread from the trench, the upper stage vents a plume that falls
    if (my.puffs) {
      const s = BAY.s, base = my.cdLeft != null && my.cdLeft < 300 ? 1.5 : 1;
      for (const pf of my.puffs) {
        const life = pf.life, u = ((t / life + pf.ph) % 1), sp = pf.sp;
        if (pf.vent) {
          const a = 0.55 + (pf.a % 1) * 0.55; // out of the side toward the tower, where the bay is open to the bridge's view
          sp.position.set(BAY.x + Math.sin(a) * (0.75 + u * 1.4) * s, BAY.top + (5.95 - u * 2.2) * s, BAY.z + Math.cos(a) * (0.75 + u * 1.4) * s);
          sp.scale.setScalar((0.4 + u * 1.8) * s); sp.material.opacity = Math.sin(u * Math.PI) * 0.7;
        } else {
          const r = 1.0 + u * 1.6 * pf.sp0, a = -1.4 + (pf.a / TAU) * 2.8; // spreading toward the bridge's side of the mount
          sp.position.set(BAY.x + Math.sin(a) * r, 0.35 + u * 2.6 * pf.sp0, BAY.z + Math.cos(a) * r);
          sp.scale.setScalar(1.0 + u * 2.8); sp.material.opacity = Math.sin(u * Math.PI) * 0.55 * base;
        }
        sp.material.rotation = pf.a + u * 0.8;
      }
    }
    if (my.steam) for (const s of my.steam) { const u = (t * 0.45 + s.userData.ph) % 1; s.position.y = 1.2 + u * 0.55; s.scale.setScalar(0.12 + u * 0.3); s.material.opacity = Math.sin(u * Math.PI) * 0.45; }
    if (my.lineTex) my.lineTex.offset.y = (my.lineTex.offset.y + dt * 0.35) % 1;
    // the trench follows the front aisle; data lines run from each front-row desk to the dais
    my.flAt = my.flAt || -9;
    if (my.floorG && t - my.flAt > 1) {
      my.flAt = t;
      const fz = k.frontZ(), ds = k.desks(), c = k.centre();
      my.floorG.position.z = fz + 1.0;
      let front = 0; for (const d of ds) if (!d.centre) front = Math.max(front, d.row || 0);
      const cx = c ? c.x : CX, cz = c ? c.z - 0.7 : (my.emptyDais && my.emptyDais.visible ? my.emptyDais.position.z + DZ - 0.7 : null);
      let key = `${fz}|${cx}|${cz}`; for (const d of ds) if (!d.centre && (d.row || 0) === front) key += `,${d.x.toFixed(2)}`;
      if (key !== my.linesKey) {
        my.linesKey = key;
        const m4 = my.tmpM || (my.tmpM = new THREE.Matrix4()), sv = my.tmpV || (my.tmpV = new THREE.Vector3());
        let n = 0;
        if (cz != null) for (const d of ds) {
          if (d.centre || (d.row || 0) !== front || n >= 16) continue;
          const sx = d.x, sz = fz + 1.3, dx = sx - cx, dz = sz - cz, l = Math.hypot(dx, dz) || 1, ex = cx + (dx / l) * 2.6, ez = cz + (dz / l) * 2.6;
          const L = Math.hypot(ex - sx, ez - sz); if (L < 0.3 || l < 2.7) continue;
          m4.makeRotationY(Math.atan2(ex - sx, ez - sz)).scale(sv.set(1, 1, L)).setPosition((sx + ex) / 2, 0.01, (sz + ez) / 2);
          my.lines.setMatrixAt(n, m4);
          m4.makeTranslation(sx, 0.01, sz); my.lineNubs.setMatrixAt(n, m4);
          n++;
        }
        my.lines.count = n; my.lineNubs.count = n;
        my.lines.instanceMatrix.needsUpdate = true; my.lineNubs.instanceMatrix.needsUpdate = true;
      }
    }
    // transporter: a shimmer column every 22 s
    if (my.beam) {
      const c = t % 22, on = c < 3.5, a = on ? Math.sin((c / 3.5) * Math.PI) : 0;
      my.beam.material.opacity = a; my.beam.visible = a > 0.01;
      if (my.beam.visible) { const p = my.beam.geometry.attributes.position.array, b = my.beamBase; for (let i = 0; i < p.length; i += 3) p[i + 1] = 0.2 + ((b[i + 1] - 0.2 + t * (0.6 + my.beamSeeds[i / 3] * 0.8)) % 2.4); my.beam.geometry.attributes.position.needsUpdate = true; }
      for (let i = 0; i < my.padRings.length; i++) { const v = 1.2 + a * 2.2 + Math.sin(t * 2 + i) * 0.2; my.padRings[i].material.color.setRGB(0.6 * v, 0.9 * v, 1 * v); }
    }
    // the drone wanders the open floor above head height, clear of the holo table and the rocket's side
    const d = my.drone;
    if (d) {
      d.position.x += Math.sin(my.droneDir) * dt * 0.8; d.position.z += Math.cos(my.droneDir) * dt * 0.8;
      const rz = Math.min(4.5, k.frontZ() + 1.5);
      if (!(t - (my.dcAt || -9) < 2)) { my.dcAt = t; const c = k.centre(); my.dcx = c ? c.x : CX; my.dcz = c ? c.z - 0.7 : (my.emptyDais && my.emptyDais.visible ? my.emptyDais.position.z + DZ - 0.7 : 99); }
      let bad = false;
      for (const [ox, oz, orr] of [[HOLO.x, HOLO.z, 2.1], [my.dcx, my.dcz, 3.4]]) { // keep off the holo table and the dais
        const hx = d.position.x - ox, hz = d.position.z - oz;
        if (hx * hx + hz * hz < orr * orr) { const l = Math.hypot(hx, hz) || 1; d.position.x = ox + (hx / l) * orr; d.position.z = oz + (hz / l) * orr; bad = true; }
      }
      if (bad || d.position.x < -7 || d.position.x > 7.2 || d.position.z < rz || d.position.z > 7.6) {
        d.position.x = Math.min(7.2, Math.max(-7, d.position.x)); d.position.z = Math.min(7.6, Math.max(rz, d.position.z));
        const wp = DRONE_WP[(my.dwp = ((my.dwp || 0) + 1) % DRONE_WP.length)]; my.droneDir = Math.atan2(wp[0] - d.position.x, wp[1] - d.position.z) + Math.sin(t * 13.7) * 0.3; // on to the next open patch of floor: never stuck on an edge
      }
      d.position.y = my.droneH + Math.sin(t * 1.7) * 0.1; d.rotation.y = my.droneDir; d.rotation.z = Math.sin(t * 1.3) * 0.05;
      my.droneSpot.position.x = d.position.x; my.droneSpot.position.z = d.position.z;
    }
  },
};

// a crew member's own glow (v: 0 none .. about 0.5): their colour, plus a little cool console light on dark cloth
const _cool = new THREE.Color();
function crewGlow(m, v) { m.emissive.copy(m.color).multiplyScalar(v * m.userData.crewK).add(_cool.setRGB(0.05, 0.075, 0.16).multiplyScalar(v)); }

// ------------------------------------------------------------------ station builders (desk coordinates: desk centre
// at x 0, z DZ; the seat at z SZ; the person faces +z; keep within x -1.45..1.45 and z -7.25..-4.5, nothing tall on
// the seat's line at the sides, where people get up and walk past; work surface top at y 1.04; front face at DZ+0.63)
const _signs = new Map();
function signMat(k, text, color) {
  const key = `${text}|${color}`; if (_signs.has(key)) return _signs.get(key);
  const s = canvasTex(256, 84), g = s.ctx; g.fillStyle = '#0a0d12'; g.fillRect(0, 0, 256, 84); g.fillStyle = color; g.fillRect(0, 0, 256, 10); g.fillRect(0, 74, 256, 10);
  g.fillStyle = color; g.font = '900 40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '4px'; g.fillText(text, 128, 44, 240);
  const m = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false }); _signs.set(key, m); return m;
}
function deptMat(k, kind) { const my = k.my; return my.deptMats[kind] || (my.deptMats[kind] = Object.assign(new THREE.MeshBasicMaterial({ map: deptTex(kind), toneMapped: false }), {})); }
// ---- plan-shaped bodies: each station has its own outline, seen from above and from the default camera
// a polygon in desk plan coordinates ([x, z] pairs) with round corners (one radius, or one per corner)
function rounded(pts, r, seg = 5) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const rr = Array.isArray(r) ? r[i] : r, p = pts[i];
    if (!rr) { out.push(p); continue; }
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const t = Math.min(rr, la / 2, lb / 2), s = [p[0] + ((a[0] - p[0]) / la) * t, p[1] + ((a[1] - p[1]) / la) * t], e = [p[0] + ((b[0] - p[0]) / lb) * t, p[1] + ((b[1] - p[1]) / lb) * t];
    for (let j = 0; j <= seg; j++) { const u = j / seg, w0 = (1 - u) ** 2, w1 = 2 * u * (1 - u), w2 = u * u; out.push([w0 * s[0] + w1 * p[0] + w2 * e[0], w0 * s[1] + w1 * p[1] + w2 * e[1]]); }
  }
  return out;
}
// an outline extruded upward: from y0, h high
function slab(P, pts, y0, h, m) {
  const sh = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z))); sh.closePath();
  return P.ext(sh, h, m, 0, y0, 0, -Math.PI / 2, 0, 0);
}
// a lit line along an outline at height y
function outline(P, pts, y, m, r = 0.01) {
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; P.rod([a[0], y, a[1]], [b[0], y, b[1]], r, m, 4, true); }
}
// an outline shrunk toward a point (a recessed kick plinth under an overhanging top)
const inset = (pts, s, cx = 0, cz = DZ) => pts.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s]);
// a ring sector round the seat (crescents), outer arc then inner arc back
function crescent(r0, r1, a0, a1, n = 18, cz = SZ) {
  const o = [], i = [];
  for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n; o.push([Math.sin(a) * r1, cz + Math.cos(a) * r1]); i.push([Math.sin(a) * r0, cz + Math.cos(a) * r0]); }
  return [...o, ...i.reverse()];
}
// the body most stations are built from: an outline with a kick plinth, a body, a top and a lit edge; returns the top's y
function body(k, P, own, pts, { top = k.my.M.cTop, mat = k.my.M.cBody, h = 1.04, t = 0.06, kick = 0.13 } = {}) {
  const M = k.my.M;
  slab(P, inset(pts, 0.94), 0, kick, M.black);
  slab(P, pts, kick, h - t - kick, mat);
  slab(P, pts, h - t, t, top);
  outline(P, pts, h + 0.002, own.glow, 0.008);
  return h;
}
// the fascia's working information sits on the front: the status strip, the nameplate (world.js's st.info.front)
// and the post's badge; o.lift moves the tray, the orb and the flags onto a top that is not at 1.04
function badge(k, P, kind, x = -1.13, y = 0.6, z = DZ + 0.642, s = 0.36) { P.pl(s, s, deptMat(k, kind), x, y, z); }
function lift(st, dy, parts = ['tray', 'orb', 'flags']) { if (st && st.info) for (const n of parts) if (st.info[n]) st.info[n].position.y = dy; }
// a plain operations console (anyone without a post of their own): chamfered corners, a front panel and two pedestals
function consoleBase(k, P, own, kind, o = {}) {
  const M = k.my.M;
  const pts = rounded([[-1.47, -4.75], [1.47, -4.75], [1.47, -6.0], [-1.47, -6.0]], [0.05, 0.05, 0.35, 0.35]);
  if (o.top !== false) body(k, P, own, pts, { top: o.top || M.cTop, mat: o.body || M.cBody });
  else P.box(2.88, 0.84, 0.05, o.front || M.cFront, 0, 0.55, DZ + 0.61);
  P.box(2.62, 0.016, 0.018, own.glow, 0, 0.14, DZ + 0.66);
  badge(k, P, kind, -1.13, 0.6, DZ + 0.652);
  pool(k, P, own);
}
// the office desk's top and front stay the station's click targets (hidden): the top becomes a box round the
// console's body (its parts between knee and hand height, clipped to the desk's own patch of floor), the front
// shrinks into it, so a click anywhere on the visible console selects its owner and nothing else does
const _pb = new THREE.Box3(), _pp = new THREE.Box3();
function pickBox(P, p, centre) {
  const [top, front] = p.desk || [];
  if (!top) return;
  _pb.makeEmpty();
  for (const list of P.b.values()) for (const geo of list) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox;
    if (b.max.y < 0.35 || b.min.y > 1.2) continue; // floor pools and plates, and tall pieces overhead
    _pp.copy(b); _pb.union(_pp);
  }
  if (_pb.isEmpty()) return;
  const lim = centre ? [-2.3, 2.3, DZ - 1.9, DZ + 1.6] : [-2.2, 2.2, DZ - 1.7, DZ + 1.0];
  const x0 = Math.max(lim[0], _pb.min.x), x1 = Math.min(lim[1], _pb.max.x), z0 = Math.max(lim[2], _pb.min.z), z1 = Math.min(lim[3], _pb.max.z);
  const y0 = Math.max(0, _pb.min.y), y1 = Math.min(1.3, _pb.max.y);
  if (!(x1 > x0 && z1 > z0 && y1 > y0)) return;
  top.scale.set((x1 - x0) / 3.0, (y1 - y0) / 0.08, (z1 - z0) / 1.5); top.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (front) { front.scale.setScalar(0.01); front.position.copy(top.position); }
}
// a soft pool of the post's colour on the deck round the station (brighter on the night watch)
function pool(k, P, own, r = 1.9, z = DZ - 0.25) {
  const my = k.my, key = own.color.getHexString();
  my.pools = my.pools || new Map();
  let m = my.pools.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: my.poolTex || (my.poolTex = radialTex([[0, 'rgba(255,255,255,.55)'], [0.45, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)']], 128)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    m.userData.base = own.color.clone(); m.color.copy(own.color).multiplyScalar(my.night ? 0.75 : 0.32); my.pools.set(key, m);
  }
  P.add(new THREE.CircleGeometry(r, 40), m, 0, 0.016, z, -Math.PI / 2);
}
// a side profile (z, y pairs in desk coordinates) extruded across the desk's width: wedges and sloped consoles
function profile(P, pts, w, m, x = 0) {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath();
  P.ext(sh, w, m, x + w / 2, 0, 0, 0, -Math.PI / 2, 0);
}
// chairs: a bridge chair on a pedestal, a tall-backed command chair or a lab stool
function chair(k, P, own, kind = 'std') {
  const M = k.my.M, z = SZ - 0.04;
  P.cyl(0.3, 0.34, 0.05, M.dark, 0, 0.025, z, 0, 0, 0, 24);
  if (kind === 'stool') {
    P.cyl(0.05, 0.06, 0.55, M.chrome, 0, 0.3, z, 0, 0, 0, 12); P.tor(0.2, 0.015, M.chrome, 0, 0.3, z, Math.PI / 2, 0, 0, TAU, 6, 24);
    P.cyl(0.28, 0.27, 0.09, own.seat, 0, 0.6, z, 0, 0, 0, 28);
    P.rbox(0.48, 0.24, 0.06, 0.03, own.seat, 0, 0.96, z - 0.3, -0.1); P.rod([0, 0.64, z - 0.24], [0, 0.86, z - 0.31], 0.02, M.chrome);
    return;
  }
  const tall = kind === 'tall';
  P.cyl(0.07, 0.09, 0.5, M.mid, 0, 0.3, z, 0, 0, 0, 12);
  P.rbox(0.66, 0.12, 0.6, 0.05, own.seat, 0, 0.585, z);
  P.rbox(0.62, tall ? 0.98 : 0.74, 0.11, 0.05, own.seat, 0, tall ? 1.13 : 1.02, z - 0.33, -0.1);
  P.rbox(0.68, tall ? 1.02 : 0.78, 0.05, 0.02, M.dark, 0, tall ? 1.13 : 1.02, z - 0.4, -0.1);
  for (const sx of [-1, 1]) {
    P.rbox(0.08, 0.06, 0.44, 0.02, M.dark, sx * 0.38, 0.84, z - 0.02); P.box(0.05, 0.22, 0.05, M.dark, sx * 0.38, 0.72, z - 0.12);
    P.box(0.018, tall ? 0.9 : 0.66, 0.02, own.glow, sx * 0.335, tall ? 1.13 : 1.02, z - 0.43, -0.1);
  }
}
// a monitor on an arm, facing the seat: lit back with the ship's emblem, the screen toward its owner
function monitor(k, P, own, x, y, z, w, h, scr) {
  const M = k.my.M, yaw = Math.atan2(0 - x, SZ - z); // face the seat
  P.push(x, y, z, 0, yaw, 0); P.push(0, 0, 0, -0.12, 0, 0);
  P.rbox(w + 0.05, h + 0.05, 0.04, 0.015, M.dark, 0, 0, 0);
  P.pl(w, h, scr, 0, 0, 0.022);
  P.pl(w * 0.5, w * 0.25, k.my.monBack || (k.my.monBack = monBackMat()), 0, 0, -0.022, 0, Math.PI, 0);
  P.box(w + 0.05, 0.012, 0.012, own.glow, 0, -h / 2 - 0.03, -0.02);
  P.pop(); P.pop();
}
function monBackMat() { const s = canvasTex(256, 128), g = s.ctx; g.fillStyle = '#10151e'; g.fillRect(0, 0, 256, 128); drawEmblem(g, 128, 66, 0.38, '#38d6ff'); const m = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false }); m.color.setScalar(0.9); return m; }
// a translucent holo panel (seen from both sides: from the camera too)
function holoPanel(k, P, tex, c, x, y, z, w, h, ry = 0, rx = 0) {
  const my = k.my, key = `holo:${tex.uuid}:${c}`;
  const m = my[key] || (my[key] = my.holoMat(tex, c, 0.8));
  P.pl(w, h, m, x, y, z, rx, ry, 0);
}
// things that turn get their own mesh (in the station's group) and a spin entry
function spinner(k, g, obj, ax, sp) { g.add(obj); k.my.spin.push({ o: obj, ax, sp, g }); return obj; }

// Desk coordinates: desk centre at x 0, z DZ; the seat at z SZ; the person faces +z (the default camera's side). Keep
// within x -1.5..1.5 and z -7.25..-4.5. People leave the seat to the +x side along z SZ, so nothing on x 0.3..1.6
// between z -6.95 and -6.1; the -x side is free to the back. The front (z DZ+0.63) carries the nameplate and the
// status strip. Two rows stand 4.4 apart, so what stands at the back of a desk stays under about 1.9 m (thin posts
// at the sides may go higher) and nothing tall stands in front of the seated face (x -0.3..0.6, y over 1.35, z over
// -6.1): the row behind keeps its nameplates and the person stays in view from the default camera.
// Each post has its own outline, height, materials and front, so a row reads as different stations:
const STATIONS = {
  // the systems engineer: a dark J-shaped console (a left return that curls behind the seat), three low holo code
  // panels over it, a monitor on the return, a server rack behind the right shoulder
  sistemas(k, P, g, own, kind) {
    const my = k.my, M = my.M;
    const J = rounded([[1.5, -4.75], [1.5, -5.95], [-0.7, -5.95], [-0.7, -6.72], [-0.4, -6.98], [-0.4, -7.22], [-1.5, -7.22], [-1.5, -4.75]], [0.1, 0.18, 0.18, 0.22, 0.08, 0.05, 0.32, 0.05]);
    body(k, P, own, J, { top: M.cTop, mat: M.gun });
    for (let i = 0; i < 5; i++) P.box(0.035, 0.62, 0.02, M.mid, 0.98 + i * 0.1, 0.5, -4.755); // vent ribs on the front
    P.box(2.62, 0.016, 0.018, own.glow, 0, 0.14, DZ + 0.66);
    badge(k, P, kind, -1.13, 0.6, DZ + 0.655);
    monitor(k, P, own, -1.1, 1.38, -6.7, 0.56, 0.34, M.roA);
    for (const [x, ry] of [[-0.8, 0.42], [0, 0], [0.8, -0.42]]) { // low, so the face stays in view over them
      const z = DZ - 0.32 - Math.abs(x) * 0.2;
      holoPanel(k, P, my.code.tex, 0x9be8ff, x, 1.36, z, 0.74, 0.38, ry);
      P.box(0.74, 0.012, 0.03, own.glow, x, 1.16, z, 0, ry, 0);
    }
    P.pl(0.78, 0.26, M.keys, 0, 1.046, DZ - 0.02, -Math.PI / 2, 0, 0); P.box(0.82, 0.012, 0.3, M.dark, 0, 1.04, DZ - 0.02);
    P.rbox(0.5, 1.85, 0.34, 0.02, M.dark, 1.18, 0.925, -7.08); P.pl(0.4, 1.66, M.rack, 1.18, 0.95, -6.905);
    P.box(0.5, 0.03, 0.02, own.glow, 1.18, 1.86, -6.91); P.box(0.03, 1.75, 0.02, own.glow, 0.94, 0.925, -6.91); P.box(0.03, 1.75, 0.02, own.glow, 1.42, 0.925, -6.91);
    P.box(0.14, 0.06, 1.0, M.black, 1.18, 0.03, -6.45);
    P.cyl(0.045, 0.04, 0.1, M.white, 1.05, 1.09, DZ - 0.35, 0, 0, 0, 12); P.tor(0.03, 0.009, M.white, 1.1, 1.09, DZ - 0.35, 0, 0, 0, TAU, 6, 10);
    pool(k, P, own);
    chair(k, P, own);
  },
  // the science officer: a white L-shaped lab bench with round corners, lower than the consoles, a fume hood on its
  // left return, microscope, centrifuge, a case of glowing vials, a holo spectrum and a slim sensor mast
  ciencia(k, P, g, own, kind, st) {
    const my = k.my, M = my.M, T = 0.99;
    const L = rounded([[1.5, -4.75], [1.5, -5.95], [-0.62, -5.95], [-0.62, -7.1], [-1.5, -7.1], [-1.5, -4.75]], [0.3, 0.22, 0.16, 0.25, 0.25, 0.3]);
    body(k, P, own, L, { top: M.labTop, mat: M.lab, h: T, t: 0.05, kick: 0.1 });
    P.box(2.6, 0.035, 0.012, my.G(0x4ade80, 1.7), 0, 0.3, -4.755); P.box(2.6, 0.012, 0.012, my.G(0x9bffd0, 1.4), 0, 0.36, -4.755);
    badge(k, P, kind, -1.1, 0.6, -4.748);
    lift(st, T - 1.04);
    // the fume hood: a white cabinet with a glass sash toward the seat, a lit hood band, a short duct
    P.push(-1.06, T, -6.5);
    P.rbox(0.56, 1.0, 1.0, 0.04, M.white, 0, 0.5, -0.02); P.box(0.03, 0.62, 0.86, M.glass, 0.29, 0.4, -0.02);
    P.box(0.02, 0.66, 0.02, my.G(0x9bffd0, 2.2), 0.29, 0.4, 0.42); P.box(0.02, 0.02, 0.88, my.G(0x9bffd0, 2.2), 0.29, 0.72, -0.02);
    P.box(0.42, 0.08, 0.8, my.G(0xd9fff0, 1.5), 0.02, 0.96, -0.02);
    P.pl(0.52, 0.16, signMat(k, 'CAMPANA', '#4ade80'), 0, 0.86, 0.485);
    P.cyl(0.11, 0.11, 0.32, M.chrome, 0, 1.16, -0.2, 0, 0, 0, 14); P.tor(0.11, 0.02, M.gun, 0, 1.02, -0.2, Math.PI / 2, 0, 0, TAU, 6, 16);
    for (let i = 0; i < 4; i++) P.cyl(0.03, 0.03, 0.18, my.vials[i % 3], -0.05 + (i % 2) * 0.14, 0.09, -0.3 + Math.floor(i / 2) * 0.2, 0, 0, 0, 8);
    P.pop();
    P.rbox(1.9, 0.22, 0.2, 0.03, M.lab, 0.42, T + 0.11, DZ - 0.45); P.box(1.9, 0.012, 0.012, own.glow, 0.42, T + 0.225, DZ - 0.35);
    for (let i = 0; i < 6; i++) P.cyl(0.035, 0.035, 0.12, my.vials[i % 3], -0.4 + i * 0.32, T + 0.28, DZ - 0.48, 0, 0, 0, 10);
    P.push(-0.5, T, DZ - 0.05, 0, 0.35, 0); // microscope
    P.rbox(0.26, 0.05, 0.34, 0.02, M.white, 0, 0.025, 0); P.rbox(0.07, 0.42, 0.09, 0.02, M.white, 0, 0.25, 0.12, 0.22); P.box(0.2, 0.02, 0.16, M.black, 0, 0.16, -0.02);
    P.rbox(0.1, 0.1, 0.2, 0.03, M.white, 0, 0.42, 0.0, -0.5); P.cyl(0.025, 0.02, 0.1, M.chrome, 0, 0.31, -0.03, 0, 0, 0, 10);
    for (const s of [-1, 1]) P.cyl(0.018, 0.018, 0.12, M.black, s * 0.026, 0.5, -0.08, 0.9, 0, 0, 10);
    P.cyl(0.03, 0.03, 0.006, my.G(CYAN, 2.4), 0, 0.172, -0.02, 0, 0, 0, 12);
    P.pop();
    P.cyl(0.17, 0.18, 0.12, M.white, 0.12, T + 0.06, DZ - 0.12, 0, 0, 0, 24); P.tor(0.165, 0.012, my.G(0x4ade80, 2.0), 0.12, T + 0.125, DZ - 0.12, Math.PI / 2);
    { const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 6), M.glass); lid.position.set(0.12, T + 0.13, DZ - 0.12); spinner(k, g, lid, 'y', 9); const rot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.015, 0.04), M.chrome); rot.position.set(0.12, T + 0.12, DZ - 0.12); spinner(k, g, rot, 'y', 9); }
    P.push(1.02, T, DZ - 0.1, 0, -0.15, 0); // the sample case, open, with vials
    P.rbox(0.5, 0.1, 0.32, 0.02, M.gun, 0, 0.05, 0); P.rbox(0.5, 0.03, 0.32, 0.01, M.gun, 0, 0.2, -0.17, -1.25);
    for (let i = 0; i < 10; i++) P.cyl(0.018, 0.018, 0.11, my.vials[i % 3], -0.18 + (i % 5) * 0.09, 0.12, i < 5 ? -0.06 : 0.06, 0, 0, 0, 8);
    P.pop();
    holoPanel(k, P, my.spec.tex, 0x9bffd0, 0.75, 1.42, DZ - 0.5, 0.7, 0.34, -0.2);
    P.cyl(0.05, 0.08, 1.75, M.white, 1.22, 0.875, -7.05, 0, 0, 0, 12); P.cyl(0.2, 0.24, 0.08, M.gun, 1.22, 0.04, -7.05, 0, 0, 0, 16);
    for (let i = 0; i < 4; i++) P.box(0.04, 0.04, 0.04, my.G(UI[i], 2), 1.22, 0.5 + i * 0.32, -6.98);
    { const head = new THREE.Group(); head.position.set(1.22, 1.8, -7.05);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 8, 0, TAU, 0, 1.0), M.white); dish.rotation.x = Math.PI / 2 + 0.5; dish.position.z = 0.05; head.add(dish);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 24), my.G(0x38d6ff, 2.4)); ring.rotation.x = 0.5; ring.position.z = 0.1; head.add(ring);
      head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), M.gun));
      spinner(k, g, head, 'y', 0.8); }
    pool(k, P, own);
    chair(k, P, own, 'stool');
  },
  // the chief engineer: a tall dark engine-control console whose top slopes down toward the seat (the schematic and
  // gauges on its face, toward the room), and behind the left shoulder the plasma column on a hexagonal reactor
  // plinth with hazard edges, piped into the console
  maquinas(k, P, g, own, kind, st) {
    const my = k.my, M = my.M, F = DZ + 0.63, LIP = 1.42;
    profile(P, [[F, 0.1], [F, LIP], [DZ + 0.32, LIP], [DZ - 0.6, 0.98], [DZ - 0.6, 0.1]], 2.94, M.gun);
    P.box(2.8, 0.1, 1.1, M.black, 0, 0.05, DZ + 0.0);
    P.box(2.96, 0.02, 0.02, own.glow, 0, LIP + 0.01, F + 0.01); P.box(2.62, 0.016, 0.018, own.glow, 0, 0.14, F + 0.015);
    P.box(2.86, 0.1, 0.012, M.hazard, 0, 0.24, F + 0.006);
    P.pl(2.0, 0.42, M.msd, 0.25, 1.15, F + 0.008); P.box(2.06, 0.48, 0.01, M.bezel, 0.25, 1.15, F + 0.002);
    badge(k, P, kind, -1.13, 0.6, F + 0.008);
    P.pl(0.28, 0.28, M.gauge, -1.13, 1.16, F + 0.008); P.tor(0.145, 0.02, M.chrome, -1.13, 1.16, F + 0.012, 0, 0, 0, TAU, 6, 24);
    P.pl(0.28, 0.28, M.gauge, 1.13, 0.62, F + 0.008); P.tor(0.145, 0.02, M.chrome, 1.13, 0.62, F + 0.012, 0, 0, 0, TAU, 6, 24);
    for (let i = 0; i < 12; i++) P.cyl(0.012, 0.012, 0.01, M.chrome, -1.38 + i * 0.25, 1.37, F + 0.01, Math.PI / 2, 0, 0, 6);
    P.push(0, 1.2, DZ - 0.15, -Math.atan2(LIP - 0.98, 0.92), 0, 0); // on the slope: a keypad and three throttles
    P.pl(1.2, 0.36, M.keys, -0.35, 0.012, 0, -Math.PI / 2, 0, 0);
    [[0.65, 0xff5c5c], [0.85, AMBER], [1.05, 0x4ade80]].forEach(([x, c], i) => { P.rod([x, 0, 0], [x, 0.24, -0.06 + i * 0.03], 0.014, M.chrome); P.sph(0.04, my.G(c, 2.2), x, 0.26, -0.06 + i * 0.03); });
    P.pop();
    lift(st, LIP - 1.04);
    // the reactor plinth and the plasma column
    const cx = -1.0, cz = -6.75, ch = 2.15;
    const hex = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; hex.push([cx + Math.sin(a) * 0.5, cz + Math.cos(a) * 0.48]); }
    slab(P, hex, 0, 0.18, M.dark); slab(P, inset(hex, 0.86, cx, cz), 0.18, 0.04, M.hazardS); outline(P, hex, 0.182, my.G(AMBER, 2.0), 0.01);
    pool(k, P, own);
    P.cyl(0.3, 0.34, 0.22, M.gun, cx, 0.33, cz, 0, 0, 0, 20);
    P.cyl(0.26, 0.26, ch - 0.6, M.glass, cx, 0.44 + (ch - 0.6) / 2, cz, 0, 0, 0, 20, true);
    P.cyl(0.15, 0.15, ch - 0.6, M.plasma, cx, 0.44 + (ch - 0.6) / 2, cz, 0, 0, 0, 14);
    for (let y = 0.7; y < ch - 0.2; y += 0.38) P.tor(0.255, 0.032, M.gun, cx, y, cz, Math.PI / 2, 0, 0, TAU, 6, 20);
    P.cyl(0.33, 0.27, 0.2, M.gun, cx, ch - 0.06, cz, 0, 0, 0, 20); P.cyl(0.16, 0.16, 0.05, M.plasma, cx, ch + 0.06, cz, 0, 0, 0, 16);
    P.tube([[cx + 0.25, 0.55, cz + 0.12], [cx + 0.45, 0.5, DZ - 0.95], [cx + 0.5, 0.6, DZ - 0.6]], 0.07, M.gun, 12, 8);
    P.tube([[cx + 0.25, 0.85, cz + 0.05], [cx + 0.6, 0.8, DZ - 0.95], [cx + 0.7, 0.9, DZ - 0.6]], 0.045, M.plasma, 12, 6);
    for (const [x, z] of [[-0.42, -7.1]]) { P.tor(0.09, 0.016, k.mat(0xc81e1e, { roughness: 0.5 }), x, 0.5, z, 0, 0.6, 0, TAU, 6, 16); P.cyl(0.02, 0.02, 0.5, M.gun, x, 0.25, z, 0, 0, 0, 8); }
    chair(k, P, own);
  },
  // the first officer (Lead, when the captain is someone else): a crescent console hugging the seat, its tips reaching
  // back beside it, a fleet hologram over a chart disc and two short status pylons leaning out at the sides
  mando(k, P, g, own, kind) {
    const my = k.my, M = my.M;
    const band = rounded([[-1.5, -4.75], [1.5, -4.75], [1.5, -5.25], [-1.5, -5.25]], [0.06, 0.06, 0, 0]);
    const cr = crescent(0.98, 1.62, -1.98, 1.2);
    slab(P, inset(band, 0.96), 0, 0.13, M.black); slab(P, band, 0.13, 0.85, M.cBody); slab(P, band, 0.98, 0.06, M.cTop);
    slab(P, cr, 0.13, 0.85, M.cBody); slab(P, cr, 0.98, 0.065, M.cTop);
    outline(P, cr, 1.047, own.glow, 0.009); P.box(2.96, 0.016, 0.016, own.glow, 0, 1.042, -4.748);
    P.box(2.84, 0.04, 0.012, my.G(0xff3b4e, 1.6), 0, 0.3, -4.755); P.box(2.62, 0.016, 0.018, own.glow, 0, 0.14, DZ + 0.66);
    badge(k, P, kind, -1.13, 0.6, -4.748);
    P.cyl(0.33, 0.35, 0.04, M.dark, -0.2, 1.06, DZ + 0.15, 0, 0, 0, 32); P.add(new THREE.CircleGeometry(0.3, 32), M.radar, -0.2, 1.082, DZ + 0.15, -Math.PI / 2);
    P.tor(0.33, 0.012, own.glow, -0.2, 1.08, DZ + 0.15, Math.PI / 2);
    { const h = new THREE.Group(); h.position.set(-0.2, 1.38, DZ + 0.15);
      const hm = (c, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.2), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      h.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), hm(0x3f8fd0, 0.35)));
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), hm(0xffb347, 0.7)); const a = (i / 3) * TAU; s.position.set(Math.cos(a) * 0.26, Math.sin(a) * 0.05, Math.sin(a) * 0.26); s.rotation.z = -Math.PI / 2; h.add(s); }
      { const o = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.005, 4, 40), hm(0x9be8ff, 0.6)); o.rotation.x = Math.PI / 2; h.add(o); }
      spinner(k, g, h, 'y', 0.5); }
    for (const [sx, z] of [[-1, -6.6], [1, -5.72]]) { // pylons on the crescent's tips: the left one back by the shoulder
      P.push(sx * (sx < 0 ? 1.3 : 1.18), 1.04, z, 0, sx * -0.35, sx * -0.1);
      P.rbox(0.24, 0.85, 0.24, 0.04, M.cBody, 0, 0.42, 0); P.pl(0.17, 0.62, M.roA, 0, 0.45, 0.122);
      P.box(0.26, 0.04, 0.26, own.glow, 0, 0.85, 0); P.sph(0.06, my.G(0xff3b4e, 2.4), 0, 0.92, 0);
      P.pop();
    }
    P.pl(0.7, 0.22, M.keys, 0.65, 1.072, -5.0, -Math.PI / 2, 0, 0);
    pool(k, P, own);
    chair(k, P, own, 'tall');
  },
  almirante(k, P, g, own, kind) { STATIONS.mando(k, P, g, own, kind); P.box(2.96, 0.02, 0.02, k.my.G(GOLD, 2.2), 0, 1.0, -4.745); },
  // the exploration officer: a round star-chart table on a pedestal (no front block: a slim rail on two legs carries
  // the nameplate in front of it), a star globe hologram, an armillary sphere on a plinth, and a telescope on its
  // tripod behind the left shoulder, aimed at the viewport
  exploracion(k, P, g, own, kind, st) {
    const my = k.my, M = my.M, tz = -5.66, R = 0.84, T = 1.02;
    if (st && st.info) { st.info.front.position.z = 0.14; if (st.info.flags) st.info.flags.position.set(0, -0.06, 0.19); if (st.info.tray) st.info.tray.position.y = T - 1.04; }
    if (st) st.tapeY = 0.3; // a temp's tape runs between the rail's legs
    P.cyl(0.3, 0.46, 0.12, M.dark, 0, 0.06, tz, 0, 0, 0, 40); P.cyl(0.2, 0.3, T - 0.2, M.cBody, 0, 0.12 + (T - 0.2) / 2, tz, 0, 0, 0, 32);
    P.cyl(R, R - 0.06, 0.08, M.cTop, 0, T - 0.04, tz, 0, 0, 0, 64); P.tor(R + 0.005, 0.016, M.gold, 0, T, tz, Math.PI / 2, 0, 0, TAU, 6, 64);
    P.tor(R - 0.02, 0.01, own.glow, 0, T - 0.07, tz, Math.PI / 2, 0, 0, TAU, 4, 64);
    P.add(new THREE.CircleGeometry(R - 0.06, 64), my.chartMat || (my.chartMat = chartMat(k)), 0, T + 0.003, tz, -Math.PI / 2);
    P.tor(0.5, 0.008, my.G(0x7c9cff, 2.0), 0, T + 0.006, tz, Math.PI / 2, 0, 0, TAU, 4, 48);
    // the rail in front: the nameplate's slim bar on two legs, lit underneath
    P.rbox(2.92, 0.58, 0.08, 0.02, M.cFront, 0, 0.7, -4.65); P.box(2.92, 0.02, 0.1, M.cTop, 0, 0.99, -4.65);
    P.box(2.8, 0.016, 0.016, my.G(0x7c9cff, 2.0), 0, 0.4, -4.65); P.box(2.92, 0.014, 0.014, own.glow, 0, 1.0, -4.598);
    for (const sx of [-1, 1]) { P.box(0.06, 0.41, 0.06, M.chrome, sx * 1.36, 0.205, -4.65); P.box(0.2, 0.03, 0.16, M.dark, sx * 1.36, 0.015, -4.65); }
    badge(k, P, kind, -1.13, 0.73, -4.606, 0.3);
    // the plinths at the sides: the status light on the left one, the armillary sphere on the right one
    for (const sx of [-1, 1]) { P.rbox(0.46, 0.98, 0.46, 0.04, M.cBody, sx * 1.2, 0.49, -5.1); P.box(0.5, 0.05, 0.5, M.cTop, sx * 1.2, 1.015, -5.1); P.box(0.5, 0.014, 0.014, own.glow, sx * 1.2, 1.043, -4.85); }
    { const sp = new THREE.Group(); sp.position.set(-0.5, 1.6, tz + 0.05);
      const hm = (c, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.2), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      sp.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), Object.assign(hm(0x6f8cff, 0.22), { wireframe: true })));
      sp.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), hm(0xffb347, 0.8)));
      for (const [rx, rz] of [[Math.PI / 2, 0], [1.1, 0.5]]) { const o = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.006, 4, 48), hm(0xc4d2ff, 0.7)); o.rotation.set(rx, 0, rz); sp.add(o); }
      spinner(k, g, sp, 'y', 0.35); }
    P.cyl(0.02, 0.05, 0.5, M.gold, -0.5, T + 0.25, tz + 0.05, 0, 0, 0, 10);
    P.cyl(0.08, 0.11, 0.05, M.gold, 1.2, 1.065, -5.1, 0, 0, 0, 16); P.cyl(0.015, 0.015, 0.14, M.gold, 1.2, 1.15, -5.1);
    { const a = new THREE.Group(); a.position.set(1.2, 1.36, -5.1);
      a.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), k.glow(0x38d6ff, 1.4)));
      for (const [rx, rz] of [[Math.PI / 2, 0], [0.4, 0.3], [-0.5, 1.1]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 36), M.gold); r.rotation.set(rx, 0, rz); a.add(r); }
      spinner(k, g, a, 'y', 0.6); }
    const tx = -1.12, tzz = -6.95, ty = 1.2; // the telescope behind the left shoulder
    for (let i = 0; i < 3; i++) { const an = (i / 3) * TAU + 0.4; P.rod([tx, ty - 0.05, tzz], [tx + Math.sin(an) * 0.3, 0, tzz + Math.cos(an) * 0.2], 0.018, M.dark); }
    P.box(0.13, 0.13, 0.13, M.gun, tx, ty, tzz);
    P.push(tx, ty + 0.06, tzz, 0, 0.25, 0); P.push(0, 0, 0, -0.75, 0, 0);
    P.cyl(0.09, 0.11, 1.05, M.white, 0, 0.15, 0, 0, 0, 0, 20); P.cyl(0.11, 0.11, 0.12, M.gold, 0, 0.68, 0, 0, 0, 0, 20); P.tor(0.11, 0.014, own.glow, 0, 0.74, 0, Math.PI / 2);
    P.cyl(0.03, 0.03, 0.3, M.dark, 0.11, 0.25, 0.06, 0, 0, 0, 8); P.cyl(0.025, 0.025, 0.12, M.black, 0, -0.42, 0, 0, 0, 0, 8);
    P.pop(); P.pop();
    pool(k, P, own, 1.9, -5.7);
    chair(k, P, own);
  },
  // the tactical officer: an armoured console with chamfered wings, its front of angled plates with red chevrons, two
  // swept shield fins at the sides, a radar scope with a targeting ring turning flat over it (beside the person, not
  // in front of them)
  tactico(k, P, g, own, kind, st) {
    const my = k.my, M = my.M, T = 1.1, F = -4.75;
    const pts = [[-1.5, F], [1.5, F], [1.5, -5.4], [0.78, -6.02], [-0.78, -6.02], [-1.5, -5.4]];
    body(k, P, own, pts, { top: M.cTop, mat: M.gun, h: T, t: 0.07 });
    lift(st, T - 1.04);
    for (const x of [-1.2, 1.2]) P.box(0.5, 0.7, 0.06, M.cBody, x, 0.45, F + 0.02);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) P.rod([sx * (0.95 + i * 0.16), 0.2, F + 0.06], [sx * (1.05 + i * 0.16), 0.34, F + 0.06], 0.012, my.G(0xff3b4e, 2.0), 4, true);
    P.box(2.84, 0.04, 0.012, my.G(0xff3b4e, 1.8), 0, 0.3, F - 0.005); P.box(2.62, 0.016, 0.018, own.glow, 0, 0.14, DZ + 0.66);
    badge(k, P, kind, -1.2, 0.68, F + 0.055, 0.32);
    const fin = new THREE.Shape(); fin.moveTo(0.5, 0); fin.lineTo(-0.45, 0); fin.lineTo(-0.55, 0.8); fin.lineTo(-0.22, 1.45); fin.lineTo(0.04, 1.45); fin.lineTo(0.27, 0.72); fin.closePath(); // low: the row behind keeps its nameplates
    for (const sx of [-1, 1]) {
      P.push(sx * 1.53, 0, DZ - 0.1, 0, Math.PI / 2 + sx * 0.12, sx * 0.08);
      P.ext(fin, 0.08, M.cBody, 0, 0, -0.04);
      for (const zz of [-0.05, 0.05]) { P.rod([0.5, 0, zz], [0.27, 0.72, zz], 0.014, my.G(0xff3b4e, 2.2)); P.rod([0.27, 0.72, zz], [0.04, 1.45, zz], 0.014, my.G(0xff3b4e, 2.2)); }
      P.box(0.28, 0.07, 0.12, my.tacBeacon, -0.09, 1.48, 0);
      P.pop();
    }
    const rx = -0.85, rz = DZ - 0.25;
    P.cyl(0.25, 0.27, 0.1, M.dark, rx, T + 0.05, rz, 0, 0, 0, 28);
    P.add(new THREE.CircleGeometry(0.22, 32), M.radar, rx, T + 0.105, rz, -Math.PI / 2);
    P.sph(0.22, M.glass, rx, T + 0.105, rz, 1, 0.3, 1, 24, 8);
    { const tg = new THREE.Group(); tg.position.set(rx, T + 0.42, rz); tg.rotation.x = -Math.PI / 2 + 0.35;
      tg.add(new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), my.holoMat(my.target.tex, 0xff8fa3, 0.7)));
      tg.add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.01, 6, 48), my.G(0xff3b4e, 2.2)));
      for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.018), my.G(0xff5c74, 2.2)); const a = (i / 4) * TAU; t.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0); t.rotation.z = a; tg.add(t); }
      spinner(k, g, tg, 'z', 0.4); }
    for (let i = 0; i < 3; i++) { P.box(0.08, 0.1 + i * 0.07, 0.08, M.dark, 0.95 + i * 0.14, T + 0.05 + i * 0.035, DZ - 0.3); P.box(0.06, 0.012, 0.06, my.G(i === 2 ? 0xff3b4e : 0x4ade80, 2.2), 0.95 + i * 0.14, T + 0.1 + i * 0.07, DZ - 0.3); }
    P.pl(0.7, 0.22, M.keys, -0.05, T + 0.006, DZ + 0.05, -Math.PI / 2, 0, 0);
    pool(k, P, own);
    chair(k, P, own);
  },
  // the prototyping engineer: an open wooden workbench on steel legs (bins on a shelf under it, the apron carries the
  // nameplate), a low tool cart with a pegboard on the left, a jointed work lamp clamped to the front corner, a small
  // robot arm, the 3D printer making a rocket and a drone on its stand
  prototipos(k, P, g, own, kind) {
    const my = k.my, M = my.M, F = DZ + 0.61;
    const top = rounded([[-1.5, -4.72], [1.5, -4.72], [1.5, -6.02], [-0.62, -6.02], [-0.62, -5.85], [-1.5, -5.85]], 0.04);
    slab(P, top, 0.97, 0.07, M.wood); slab(P, inset(top, 0.99), 0.94, 0.03, M.gun);
    P.box(2.88, 0.56, 0.05, M.gun, 0, 0.67, F);
    P.box(2.92, 0.016, 0.018, own.glow, 0, 1.043, -4.715); P.box(2.8, 0.016, 0.018, own.glow, 0, 0.385, F + 0.03);
    badge(k, P, kind, -1.2, 0.67, F + 0.028, 0.32);
    for (const [x, z] of [[-1.42, -4.8], [1.42, -4.8], [-1.42, -5.78], [1.42, -5.95]]) { P.box(0.08, 0.95, 0.08, M.chrome, x, 0.475, z); P.box(0.14, 0.03, 0.14, M.dark, x, 0.015, z); }
    P.box(2.76, 0.03, 0.95, M.gun, 0, 0.26, DZ + 0.1);
    for (const [x, c] of [[-0.95, 0xe5b02a], [-0.45, 0x38d6ff], [0.15, 0xff6b6b], [0.7, 0x4ade80]]) P.rbox(0.42, 0.24, 0.5, 0.02, k.mat(c, { roughness: 0.55 }), x, 0.4, DZ + 0.15);
    // the tool cart: low, on castors, a pegboard standing on its back edge (edge-on from the room, so it hides nobody)
    P.rbox(0.62, 0.7, 0.85, 0.03, M.cBody, -1.13, 0.43, -6.6); P.box(0.66, 0.03, 0.89, M.hazardS, -1.13, 0.8, -6.6);
    for (const [dx, dz] of [[-0.25, -0.35], [0.25, -0.35], [-0.25, 0.35], [0.25, 0.35]]) P.sph(0.05, M.black, -1.13 + dx, 0.05, -6.6 + dz);
    for (let i = 0; i < 3; i++) P.box(0.5, 0.012, 0.02, M.chrome, -1.13, 0.3 + i * 0.18, -6.17);
    P.rbox(0.05, 0.85, 0.8, 0.02, M.dark, -1.4, 1.25, -6.6); P.pl(0.76, 0.8, M.peg, -1.37, 1.25, -6.6, 0, Math.PI / 2, 0);
    P.push(-1.05, 0.815, -6.75); P.rbox(0.2, 0.06, 0.2, 0.02, M.white, 0, 0.03, 0); // the drone parked on the cart
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; P.rod([0, 0.03, 0], [Math.sin(a) * 0.2, 0.04, Math.cos(a) * 0.2], 0.012, M.dark); P.cyl(0.07, 0.07, 0.008, M.light, Math.sin(a) * 0.2, 0.06, Math.cos(a) * 0.2, 0, 0, 0, 12); }
    P.sph(0.03, my.G(0x4ade80, 2.2), 0, 0.07, 0.1); P.pop();
    // the work lamp: clamped to the front-right corner, its arm up and over, the shade aimed at the bench
    P.box(0.1, 0.12, 0.1, M.dark, 1.38, 1.04, -4.9);
    P.rod([1.38, 1.1, -4.9], [1.32, 1.55, -5.05], 0.016, M.dark); P.rod([1.32, 1.55, -5.05], [1.0, 1.62, -5.25], 0.016, M.dark);
    P.sph(0.03, M.chrome, 1.32, 1.55, -5.05);
    P.push(0.98, 1.6, -5.27, 0, 0, 0.5); P.cyl(0.05, 0.15, 0.16, M.copper, 0, 0, 0, 0, 0, 0, 20, true); P.sph(0.06, my.G(0xffd59a, 2.6), 0, -0.05, 0); P.pop();
    // the robot arm on the bench's right
    P.push(0.95, 1.04, -5.75, 0, -0.6, 0);
    P.cyl(0.11, 0.13, 0.08, M.dark, 0, 0.04, 0, 0, 0, 0, 20); P.cyl(0.07, 0.07, 0.1, M.chrome, 0, 0.12, 0, 0, 0, 0, 14);
    P.rod([0, 0.15, 0], [0.0, 0.48, 0.12], 0.045, M.white); P.sph(0.06, M.dark, 0, 0.48, 0.12);
    P.rod([0, 0.48, 0.12], [0.0, 0.42, 0.42], 0.035, M.white); P.sph(0.045, M.dark, 0, 0.42, 0.42);
    P.rod([0, 0.42, 0.42], [0, 0.3, 0.48], 0.02, M.chrome); P.sph(0.02, my.G(AMBER, 2.6), 0, 0.28, 0.48);
    P.pop();
    P.push(-1.0, 1.04, -5.45, 0, 0.3, 0); // the 3D printer making a rocket (on the left, clear of the person)
    P.box(0.44, 0.04, 0.38, M.dark, 0, 0.02, 0); P.box(0.44, 0.04, 0.38, M.dark, 0, 0.5, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.03, 0.5, 0.03, M.dark, sx * 0.205, 0.26, sz * 0.175);
    P.box(0.42, 0.46, 0.36, M.glass, 0, 0.26, 0); P.box(0.3, 0.012, 0.26, M.mid, 0, 0.08, 0);
    P.cyl(0.035, 0.035, 0.12, M.white, 0, 0.15, 0, 0, 0, 0, 12); P.cyl(0.0, 0.035, 0.06, M.white, 0, 0.24, 0, 0, 0, 0, 12);
    P.box(0.3, 0.02, 0.03, M.mid, 0, 0.36, 0); P.box(0.04, 0.05, 0.04, M.gun, 0.05, 0.33, 0); P.sph(0.012, my.G(AMBER, 3), 0.05, 0.3, 0);
    P.pop();
    P.pl(0.62, 0.2, M.keys, 0.35, 1.046, -5.1, -Math.PI / 2, 0, 0);
    pool(k, P, own);
    chair(k, P, own, 'stool');
  },
  // anyone else: a plain operations console with a holo panel and a side screen
  operaciones(k, P, g, own, kind) {
    const my = k.my, M = my.M;
    consoleBase(k, P, own, kind);
    holoPanel(k, P, my.roA.tex, 0x9be8ff, -0.62, 1.38, DZ - 0.5, 0.7, 0.36, 0.2);
    P.push(1.05, 1.04, DZ - 0.38, 0, -0.5, 0); P.rbox(0.5, 0.42, 0.06, 0.02, M.dark, 0, 0.3, 0, -0.2); P.pl(0.44, 0.36, M.roA, 0, 0.3, 0.035, -0.2, 0, 0); P.pop();
    P.pl(0.8, 0.24, M.keys, 0, 1.046, DZ - 0.1, -Math.PI / 2, 0, 0);
    chair(k, P, own);
  },
};
// the star chart on the exploration table: a disc of stars, constellations, the route to the Moon and a compass rose
function chartMat(k) {
  const S = 512, t = canvasTex(S, S), g = t.ctx, c = S / 2, r = rng(17);
  const gr = g.createRadialGradient(c, c, 20, c, c, 256); gr.addColorStop(0, '#1b2a6b'); gr.addColorStop(1, '#070b22'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) { const b = r(); g.fillStyle = `rgba(220,230,255,${0.25 + b * 0.75})`; g.beginPath(); g.arc(r() * S, r() * S, b > 0.93 ? 2.6 : 1.1, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(212,166,42,.75)'; g.lineWidth = 3; for (const rr of [120, 200, 250]) { g.beginPath(); g.arc(c, c, rr, 0, TAU); g.stroke(); }
  for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * 236, c + Math.sin(a) * 236); g.lineTo(c + Math.cos(a) * 250, c + Math.sin(a) * 250); g.stroke(); }
  g.strokeStyle = 'rgba(160,190,255,.7)'; g.lineWidth = 2; g.beginPath(); for (const [x, y] of [[150, 160], [200, 130], [250, 170], [300, 140], [340, 190]]) g.lineTo(x, y); g.stroke();
  g.strokeStyle = '#ffb347'; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(c, c + 60); g.quadraticCurveTo(c + 90, c - 30, c + 150, c - 130); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#e8edf3'; g.beginPath(); g.arc(c + 150, c - 130, 16, 0, TAU); g.fill(); g.fillStyle = '#38d6ff'; g.beginPath(); g.arc(c, c + 60, 22, 0, TAU); g.fill();
  const m = new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }); m.color.setScalar(0.95); return m;
}

// the captain's command dais (the centre desk, and the empty one in decor): two tiers with the ship's emblem, the
// captain's chair with armrest panels, a crescent command console, a tactical rail behind, status pylons and the
// mission hologram. In desk coordinates; the dais goes from y -lift to 0.
function buildCommand(k, P, g, own, lift, empty) {
  const my = k.my, M = my.M, G = my.G, DCZ = DZ - 0.7;
  P.cyl(2.25, 2.3, lift * 0.5, M.dark, 0, -lift * 0.75, DCZ, 0, 0, 0, 72);
  P.cyl(1.95, 2.0, lift * 0.5, M.mid, 0, -lift * 0.25, DCZ, 0, 0, 0, 72);
  P.add(new THREE.CircleGeometry(1.94, 72), my.daisTop || (my.daisTop = daisTopMat(k)), 0, 0.002, DCZ, -Math.PI / 2);
  P.tor(2.27, 0.02, G(AMBER, 1.9), 0, -lift * 0.5 + 0.005, DCZ, Math.PI / 2, 0, 0, TAU, 6, 96);
  P.tor(1.97, 0.018, G(GOLD, 1.7), 0, 0.004, DCZ, Math.PI / 2, 0, 0, TAU, 6, 96);
  P.tor(2.45, 0.012, G(CYAN, 1.2), 0, -lift + 0.01, DCZ, Math.PI / 2, 0, 0, TAU, 6, 96);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; if (Math.cos(a) > 0.8) continue; P.box(0.03, 0.012, 0.5, G(CYAN, 0.95), Math.sin(a) * 2.85, -lift + 0.006, DCZ + Math.cos(a) * 2.85, 0, a, 0); }
  P.rbox(0.5, lift * 0.5, 0.7, 0.03, M.mid, 2.25, -lift * 0.75, SZ); // a step on the side the captain comes up from
  // the captain's chair
  const z = SZ - 0.04;
  P.cyl(0.3, 0.42, 0.34, M.dark, 0, 0.17, z, 0, 0, 0, 24);
  P.rbox(0.82, 0.16, 0.74, 0.07, M.red, 0, 0.56, z);
  P.rbox(0.8, 1.2, 0.18, 0.08, M.red, 0, 1.2, z - 0.38, -0.12); P.rbox(0.9, 1.12, 0.07, 0.03, M.dark, 0, 1.17, z - 0.47, -0.12);
  P.rbox(0.5, 0.26, 0.16, 0.07, M.red, 0, 1.92, z - 0.48, -0.18);
  P.pl(0.38, 0.38, my.capEmblem || (my.capEmblem = capEmblemMat()), 0, 1.35, z - 0.512, -0.12, Math.PI, 0);
  for (const sx of [-1, 1]) {
    P.rbox(0.18, 0.12, 0.72, 0.05, M.dark, sx * 0.49, 0.8, z); P.box(0.12, 0.28, 0.12, M.mid, sx * 0.49, 0.6, z - 0.25);
    P.pl(0.12, 0.42, M.keys, sx * 0.49, 0.862, z + 0.02, -Math.PI / 2, 0, 0);
    P.box(0.02, 0.02, 0.7, G(AMBER, 2), sx * 0.59, 0.8, z);
  }
  // the crescent command console: flat front for the nameplate, the top hollowed toward the chair
  const sh = new THREE.Shape(), R = 2.75, c0 = SZ - 1.6;
  sh.moveTo(-1.47, DZ + 0.68); sh.lineTo(1.47, DZ + 0.68);
  for (let i = 0; i <= 16; i++) { const x = 1.47 - (i / 16) * 2.94; sh.lineTo(x, c0 + Math.sqrt(R * R - x * x)); }
  sh.closePath();
  P.ext(sh, 0.06, M.cTop, 0, 1.04, 0, Math.PI / 2, 0, 0);
  P.box(2.88, 0.84, 0.05, M.cFront, 0, 0.55, DZ + 0.61); P.box(2.7, 0.13, 0.12, M.black, 0, 0.065, DZ + 0.53);
  for (const sx of [-1, 1]) P.box(0.6, 0.95, 0.85, M.cBody, sx * 1.13, 0.49, DZ + 0.12);
  P.box(2.92, 0.02, 0.02, G(GOLD, 2.2), 0, 1.045, DZ + 0.69); P.box(2.62, 0.016, 0.018, G(AMBER, 2), 0, 0.14, DZ + 0.64);
  P.box(2.84, 0.04, 0.012, G(GOLD, 1.6), 0, 0.3, DZ + 0.638);
  P.pl(0.36, 0.36, deptMat(k, 'capitan'), -1.13, 0.6, DZ + 0.642);
  P.pl(0.36, 0.36, deptMat(k, 'capitan'), 1.13, 0.6, DZ + 0.642);
  P.pl(0.9, 0.22, M.keys, 0.35, 1.07, DZ - 0.25, -Math.PI / 2 + 0.15, 0, 0);
  // the tactical rail behind the chair: two curved walls, a lit band, a screen strip on top
  const RR0 = 1.45, RR1 = 1.72, a0 = Math.PI - 1.0, a1 = Math.PI + 1.0, rh = 1.0;
  P.cyl(RR0, RR0, rh, M.cBody, 0, rh / 2, SZ, 0, 0, 0, 40, true, a0, a1 - a0); P.cyl(RR1, RR1, rh, M.cBody, 0, rh / 2, SZ, 0, 0, 0, 40, true, a0, a1 - a0);
  P.add(arcStrip(RR0 - 0.04, RR1 + 0.05, a0, a1, 40, rh + 0.07, rh - 0.04), M.mid, 0, 0, SZ);
  P.add(arcStrip(RR0 + 0.05, RR1 - 0.04, a0 + 0.05, a1 - 0.05, 40, rh + 0.08, rh - 0.02), my.railScr || (my.railScr = railMat(k)), 0, 0.006, SZ);
  P.cyl(RR1 + 0.005, RR1 + 0.005, 0.05, G(CYAN, 1.6), 0, 0.25, SZ, 0, 0, 0, 40, true, a0, a1 - a0);
  for (const a of [a0, a1]) P.box(0.34, rh + 0.08, 0.1, M.mid, Math.sin(a) * (RR0 + RR1) / 2, (rh + 0.08) / 2, SZ + Math.cos(a) * (RR0 + RR1) / 2, 0, a, 0);
  // status pylons at the front corners (low: the row desks behind stay in view)
  for (const sx of [-1, 1]) {
    const px = sx * 1.88, pz = DZ + 0.15;
    P.rbox(0.28, 1.12, 0.28, 0.05, M.cBody, px, 0.56, pz); P.pl(0.2, 0.8, M.roA, px, 0.6, pz + 0.142);
    P.box(0.3, 0.05, 0.3, G(GOLD, 2.0), px, 1.14, pz); P.sph(0.07, G(AMBER, 2.4), px, 1.24, pz);
  }
  // the helm and navigation bank in front of the dais: a curved console facing the room (as everyone on the bridge
  // does), the helm's half lit amber and the navigator's cyan, two empty bridge chairs between it and the dais
  {
    const r0 = 3.0, r1 = 3.5, a = 0.44, hb = 0.92, yb = -lift;
    P.cyl(r1, r1, hb, M.cBody, 0, yb + hb / 2, DCZ, 0, 0, 0, 40, true, -a, 2 * a);
    P.cyl(r0, r0, hb, M.cBody, 0, yb + hb / 2, DCZ, 0, 0, 0, 40, true, -a, 2 * a);
    P.add(arcStrip(r0 - 0.04, r1 + 0.06, -a - 0.01, a + 0.01, 40, yb + hb - 0.06, yb + hb + 0.06), M.cTop, 0, 0, DCZ);
    for (const [s0, s1, scr] of [[-a + 0.04, -0.05, M.roA], [0.05, a - 0.04, M.radar]]) P.add(arcStrip(r0 + 0.05, r1 - 0.06, s0, s1, 20, yb + hb - 0.035, yb + hb + 0.065), scr, 0, 0.006, DCZ);
    P.cyl(r1 + 0.008, r1 + 0.008, 0.2, M.keys, 0, yb + 0.6, DCZ, 0, 0, 0, 40, true, -a + 0.02, 2 * a - 0.04);
    P.cyl(r1 + 0.012, r1 + 0.012, 0.022, G(AMBER, 2.0), 0, yb + hb + 0.03, DCZ, 0, 0, 0, 20, true, -a, a - 0.02);
    P.cyl(r1 + 0.012, r1 + 0.012, 0.022, G(CYAN, 2.0), 0, yb + hb + 0.03, DCZ, 0, 0, 0, 20, true, 0.02, a - 0.02);
    P.cyl(r1 + 0.04, r1 + 0.04, 0.1, M.black, 0, yb + 0.05, DCZ, 0, 0, 0, 40, true, -a, 2 * a);
    P.cyl(r1 + 0.05, r1 + 0.05, 0.016, G(CYAN, 1.6), 0, yb + 0.14, DCZ, 0, 0, 0, 40, true, -a, 2 * a);
    for (const e of [-a, a]) P.box(0.08, hb + 0.04, r1 - r0 + 0.1, M.mid, Math.sin(e) * (r0 + r1) / 2, yb + (hb + 0.04) / 2, DCZ + Math.cos(e) * (r0 + r1) / 2, 0, e, 0);
    for (const [e, name, col] of [[-a / 2, 'TIMÓN', '#ffb347'], [a / 2, 'NAVEGACIÓN', '#38d6ff']]) {
      P.pl(0.7, 0.2, signMat(k, name, col), Math.sin(e) * (r1 + 0.015), yb + 0.33, DCZ + Math.cos(e) * (r1 + 0.015), 0, e, 0);
      const cr = 2.68; // an empty chair facing the bank, its back to the dais (low, so the captain's nameplate stays in view)
      P.push(Math.sin(e * 0.9) * cr, yb, DCZ + Math.cos(e * 0.9) * cr, 0, e * 0.9, 0);
      P.cyl(0.24, 0.28, 0.05, M.dark, 0, 0.025, 0, 0, 0, 0, 20); P.cyl(0.06, 0.08, 0.45, M.mid, 0, 0.27, 0, 0, 0, 0, 12);
      P.rbox(0.56, 0.1, 0.52, 0.04, M.seat, 0, 0.53, 0); P.rbox(0.54, 0.36, 0.09, 0.04, M.seat, 0, 0.76, -0.25, -0.12);
      P.box(0.016, 0.3, 0.02, G(col === '#ffb347' ? AMBER : CYAN, 1.8), 0.24, 0.76, -0.31, -0.12, 0, 0); P.box(0.016, 0.3, 0.02, G(col === '#ffb347' ? AMBER : CYAN, 1.8), -0.24, 0.76, -0.31, -0.12, 0, 0);
      P.pop();
    }
  }
  // the mission hologram on the console: HERD-7 turning over its emitter
  P.cyl(0.14, 0.16, 0.05, M.dark, -0.85, 1.07, DZ - 0.3, 0, 0, 0, 20); P.tor(0.14, 0.01, G(CYAN, 2.4), -0.85, 1.095, DZ - 0.3, Math.PI / 2);
  { const h = new THREE.Group(); h.position.set(-0.85, 1.12, DZ - 0.3);
    const hm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9be8ff).multiplyScalar(1.3), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.32, 12), hm); body.position.y = 0.2; h.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 12), hm); nose.position.y = 0.41; h.add(nose);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.07, 0.05), hm); const a = (i / 4) * TAU; f.position.set(Math.sin(a) * 0.045, 0.07, Math.cos(a) * 0.045); f.rotation.y = a; h.add(f); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.003, 4, 32), hm); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; h.add(ring);
    if (empty) g.add(h); else spinner(k, g, h, 'y', 0.7);
    if (empty) k.my.spin.push({ o: h, ax: 'y', sp: 0.7 }); }
  if (!empty) { const l = new THREE.PointLight(0xffc77a, 5, 7, 1.6); l.position.set(0, 3.0, DZ - 0.4); g.add(l); }
}
function daisTopMat(k) {
  const t = canvasTex(1024, 1024), g = t.ctx;
  const gr = g.createRadialGradient(512, 512, 0, 512, 512, 512); gr.addColorStop(0, '#2a3550'); gr.addColorStop(1, '#161c2c'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(212,166,42,.4)'; g.lineWidth = 3;
  for (const r of [200, 380, 490]) { g.beginPath(); g.arc(512, 512, r, 0, TAU); g.stroke(); }
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; g.beginPath(); g.moveTo(512 + Math.cos(a) * 490, 512 + Math.sin(a) * 490); g.lineTo(512 + Math.cos(a) * (i % 4 ? 470 : 440), 512 + Math.sin(a) * (i % 4 ? 470 : 440)); g.stroke(); }
  g.globalAlpha = 0.22; drawEmblem(g, 512, 520, 1.7, '#d4a62a'); g.globalAlpha = 1;
  return k.mat(0xffffff, { map: t.tex, roughness: 0.6, metalness: 0.3 });
}
function capEmblemMat() { const t = canvasTex(256, 256), g = t.ctx; drawEmblem(g, 128, 132, 1.0, '#ffd27a'); const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, toneMapped: false }); m.color.setScalar(1.7); return m; }
function railMat(k) { const t = k.my.roA.tex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); k.my.animTex.push(t); return k.my.screen(t, 1.05); }
