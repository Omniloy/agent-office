// USS HERD: the bridge of an exploration starship (original design). Everything is built here from three.js
// primitives and canvas-painted textures: no downloaded models, images or fonts. See themes/index.js for the
// contract. The room is a cut-away deck section floating in space:
//   - space: a painted nebula sky, a field of crisp stars, a turning ocean planet with clouds, city lights on its
//     night side and an atmosphere, a cratered moon;
//   - shell: hull-panelled walls, a panoramic viewport above the wall screens, a second viewport and a turbolift on
//     the left wall, deck plates with lit seams, a lit soffit that turns amber when someone needs you;
//   - command: the captain's chair on a two-step dais, two officers' chairs, helm consoles and a curved tactical rail;
//   - holo table with a turning hologram of the planet and the ship in orbit, warp core, engineering and science
//     stations, a replicator at the break spot, a transporter pad, hydroponics, an observation bench, a drone;
//   - signage in Spanish, animated readouts, running lights, uniforms by division with badge, pips and headsets.
// Working information (wall screens, board, whiteboard, clock, desks, plates, status strips) stays where it is.
import * as THREE from 'three';

// ------------------------------------------------------------------ small helpers
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TAU = Math.PI * 2;
const SUN = new THREE.Vector3(0.78, 0.42, 0.46).normalize(); // the star that lights the planet and the moon
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
function stardate(d) { const y0 = new Date(d.getFullYear(), 0, 1); return (80000 + ((d - y0) / 864e5 / 365.25) * 1000).toFixed(1).replace('.', ','); }
function paintStatus(g, t, alert, night) {
  const W = 2048, H = 160;
  g.fillStyle = '#050a14'; g.fillRect(0, 0, W, H);
  const blink = alert ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3)) : 1;
  g.globalAlpha = blink; g.fillStyle = alert ? '#fbbf24' : '#34d399'; g.beginPath(); g.roundRect(10, 14, 600, H - 28, 60); g.fill(); g.globalAlpha = 1;
  g.fillStyle = '#050a14'; g.textBaseline = 'middle'; g.font = '800 52px system-ui'; g.letterSpacing = '4px';
  g.fillText(alert ? 'ALERTA AMARILLA' : 'CONDICIÓN VERDE', 52, H / 2 + 2, 540);
  g.letterSpacing = '2px';
  const items = alert ? [['TRIPULACIÓN', 'alguien te necesita'], ['ESCUDOS', '100 %'], ['FECHA ESTELAR', stardate(new Date())]]
    : [['ESCUDOS', '100 %'], ['CURVATURA', (6 + Math.sin(t * 0.05) * 0.2).toFixed(1).replace('.', ',')], ['RUMBO', '047 · 12'], [night ? 'TURNO' : 'FECHA ESTELAR', night ? 'de noche' : stardate(new Date())]];
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
    room: 'Puente de mando', board: 'Registro de misiones', trace: 'Bitácora', composer: 'Orden para @{name}, o @all para toda la tripulación',
    boardSub: 'tarjetas abiertas por quién debe moverlas', noCards: 'Sin tarjetas',
    status: { working: 'en servicio', idle: 'en espera', blocked: 'te necesita', offline: 'fuera de servicio', now: 'ahora' },
  },
  exposure: 1.05,
  bloom: { strength: 0.85, radius: 0.5, threshold: 1 },
  // the captain (Product, else Lead) sits on the command dais in the middle of the bridge (themes/index.js: centre)
  centre: { roles: ['Product', 'Lead'], x: -1.5, z: 4.2, lift: 0.24 },
  boardStyle: { bg: '#050b16', ink: '#7dd3fc' },
  traceStyle: { bg: '#081627', ink: '#cfefff' }, // a dark glass display like the board, not an office whiteboard

  // ---------------------------------------------------------------- shell: space, hull, viewports, deck
  shell(k) {
    const { room, scene, C: { BACK_Z, LEFT_X } } = k, my = k.my;
    const WH = my.WH = 8.75; // taller than the office: the viewport sits above the wall screens, the name beam over it (in view from the default camera)
    const glows = my.glows = new Map();
    const G = my.G = (c, n = 1.6) => { const key = `${c}:${n}`; if (!glows.has(key)) glows.set(key, k.glow(c, n)); return glows.get(key); };
    const M = my.M = {
      dark: k.mat(0x1a1f29, { roughness: 0.42, metalness: 0.7 }),
      mid: k.mat(0x394252, { roughness: 0.35, metalness: 0.75 }),
      light: k.mat(0x8792a6, { roughness: 0.3, metalness: 0.85 }),
      chrome: k.mat(0xc3cad6, { roughness: 0.18, metalness: 1 }),
      gold: k.mat(GOLD, { roughness: 0.28, metalness: 1 }),
      black: k.mat(0x0b0d12, { roughness: 0.6, metalness: 0.3 }),
      red: k.mat(0x5e1a24, { roughness: 0.5, metalness: 0.1 }),
      seat: k.mat(0x2b3444, { roughness: 0.55, metalness: 0.15 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.14, depthWrite: false }),
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
            float spec=pow(max(dot(reflect(-sunDir,n),v),0.0),30.0)*(1.0-cl)*step(c.b,c.r+0.25)*0.0;
            vec3 col=c*(0.012+1.5*max(d,0.0)*lit)+spec;
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
      moon.scale.setScalar(0.62); moon.position.set(8.5, -13.5, -95);
      const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,240,220,.9)'], [0.25, 'rgba(255,200,150,.25)'], [1, 'rgba(255,180,120,0)']], 128), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      glare.material.color.setScalar(1.6); glare.scale.setScalar(26); glare.position.copy(SUN).multiplyScalar(140);
      scene.add(planet, halo, moon, glare);
    }

    // ---- deck
    const deck = paintDeck(k);
    const floor = my.floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), k.mat(0xffffff, { map: deck.map, roughnessMap: deck.rough, roughness: 0.9, metalness: 0.55 }));
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
    B(25.4, 0.012, 0.05, G(CYAN, 1.5), 0.3, 0.008, BACK_Z + 0.55);
    B(0.05, 0.012, 17.4, G(CYAN, 1.5), LEFT_X + 0.55, 0.008, 0.3);
    {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.014, 0.16), G(0x7dd3fc, 1.3), 52), m4 = new THREE.Matrix4();
      for (let i = 0; i < 26; i++) { m4.setPosition(-12 + i * 0.98, 0.008, 8.75); im.setMatrixAt(i, m4); m4.setPosition(12.75, 0.008, -8.2 + i * 0.66); im.setMatrixAt(26 + i, m4); }
      room.add(im);
    }

    // ---- hull walls (taller than the office) with the panoramic viewport
    const hullCanvas = canvasTex(512, 512); paintHull(hullCanvas.ctx, 512, 512, 21);
    const hullTex = hullCanvas.tex; hullTex.wrapS = hullTex.wrapT = THREE.RepeatWrapping;
    const hullMat = my.hullMat = (w, h) => { const t = hullTex.clone(); t.repeat.set(w / 3.2, h / 3.2); t.needsUpdate = true; return k.mat(0xffffff, { map: t, roughness: 0.55, metalness: 0.45 }); };
    const wallSkin = (w, h, x, y, z, ry) => { const p = Pl(w, h, hullMat(w, h), x, y, z, ry); p.receiveShadow = true; return p; };
    const WIN0 = 5.62, WIN1 = 8.0; // viewport bottom (clear of two tiers of wall screens) and top
    // back wall: lower part (behind the screens), the frame over the viewport, the viewport itself
    B(26.6, WIN0, 0.3, M.dark, 0, WIN0 / 2, BACK_Z - 0.15);
    wallSkin(26.6, WIN0, 0, WIN0 / 2, BACK_Z + 0.001, 0);
    B(26.6, WH - WIN1, 0.5, M.dark, 0, (WH + WIN1) / 2, BACK_Z - 0.05);
    wallSkin(26.6, WH - WIN1, 0, (WH + WIN1) / 2, BACK_Z + 0.201, 0);
    Pl(26.6, WIN1 - WIN0, M.glass, 0, (WIN0 + WIN1) / 2, BACK_Z - 0.1);
    B(26.6, 0.16, 0.55, M.mid, 0, WIN0 + 0.08, BACK_Z + 0.12, { cast: false }); // sill
    B(26.2, 0.04, 0.03, G(CYAN, 2.2), 0, WIN0 + 0.17, BACK_Z + 0.38);
    B(26.2, 0.04, 0.03, G(CYAN, 2.0), 0, WIN1 - 0.04, BACK_Z + 0.22);
    for (let i = 0; i <= 6; i++) { // mullions with gussets at the corners
      const x = -13.15 + i * (26.3 / 6), wd = i === 0 || i === 6 ? 0.5 : 0.34;
      B(wd, WIN1 - WIN0, 0.5, M.mid, x, (WIN0 + WIN1) / 2, BACK_Z + 0.02);
      B(0.06, WIN1 - WIN0 - 0.3, 0.04, M.light, x, (WIN0 + WIN1) / 2, BACK_Z + 0.28);
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if ((i === 0 && sx < 0) || (i === 6 && sx > 0)) continue;
        B(0.75, 0.22, 0.4, M.mid, x + sx * 0.38, sy > 0 ? WIN1 - 0.28 : WIN0 + 0.28, BACK_Z + 0.02, { rz: sx * sy * -0.62 });
      }
    }
    // lower back wall: kick light, a vent band, an auxiliary console ledge with blinking keys
    B(26.2, 0.035, 0.03, G(CYAN, 2.0), 0, 0.09, BACK_Z + 0.06);
    B(26.2, 0.32, 0.12, M.black, 0, 0.32, BACK_Z + 0.06);
    for (let i = 0; i < 26; i++) B(0.6, 0.02, 0.02, M.mid, -12.6 + i * 1.0, 0.32, BACK_Z + 0.13);
    B(26.2, 0.42, 0.42, M.dark, 0, 1.0, BACK_Z + 0.21, { cast: false });
    B(26.2, 0.06, 0.5, M.mid, 0, 1.24, BACK_Z + 0.25, { cast: false });
    {
      const r = rng(4), n = 150, im = my.keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
      const m4 = new THREE.Matrix4(), c = new THREE.Color(); my.keyCols = [];
      for (let i = 0; i < n; i++) {
        const x = -12.7 + (i % 75) * 0.34 + (r() - 0.5) * 0.05, z = BACK_Z + 0.33 + Math.floor(i / 75) * 0.13;
        m4.makeRotationX(-0.15).setPosition(x, 1.28, z); im.setMatrixAt(i, m4);
        c.set(UI[Math.floor(r() * UI.length)]); my.keyCols.push(c.clone()); im.setColorAt(i, c);
      }
      room.add(im);
    }
    // soffit along the top of both walls: a band of light that turns amber when someone needs you
    // (a shallow lip, so from the default camera it does not hide the name beam under it)
    B(26.6, 0.3, 0.46, M.dark, 0, WH + 0.05, BACK_Z + 0.43);
    B(0.46, 0.3, 18.3, M.dark, LEFT_X + 0.23, WH + 0.05, 0.15);
    my.alertMat = k.glow(CYAN, 1.8);
    B(26.6, 0.08, 0.03, my.alertMat, 0, WH - 0.04, BACK_Z + 0.67);
    B(0.03, 0.08, 18.3, my.alertMat, LEFT_X + 0.47, WH - 0.04, 0.15);
    // the ship's name over the viewport
    {
      const s = canvasTex(2048, 128), g = s.ctx;
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 2048, 128);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 72px system-ui'; g.letterSpacing = '22px'; g.fillStyle = '#d8f3ff';
      g.fillText('U.S.S. HERD   ·   NCC-7104', 1024, 68);
      const m = new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, toneMapped: false, depthWrite: false }); m.color.setScalar(1.25);
      Pl(11, 0.69, m, 0.6, (WH + WIN1) / 2 + 0.02, BACK_Z + 0.21);
      // alert beacons either side of the name: dim at green, pulsing amber when someone needs you
      const by = (WH + WIN1) / 2 + 0.02;
      my.beaconMat = k.glow(AMBER, 0.3);
      for (const bx of [-5.6, 6.8]) {
        B(0.7, 0.3, 0.16, M.mid, bx, by, BACK_Z + 0.27, { r: 0.05 });
        B(0.56, 0.17, 0.06, my.beaconMat, bx, by, BACK_Z + 0.36, { r: 0.04 });
      }
      // the watch on duty, right on the beam (the lower end of it from the default camera): day watch / night watch (lit violet at night)
      const sh = my.shift = canvasTex(512, 128);
      my.shiftMat = new THREE.MeshBasicMaterial({ map: sh.tex, toneMapped: false });
      Pl(2.4, 0.6, my.shiftMat, 9.7, by, BACK_Z + 0.22);
      paintShift(sh.ctx, false); sh.tex.needsUpdate = true;
    }

    // left wall: board section, turbolift, viewport
    const LX = LEFT_X - 0.15, segs = [[-9.3, 1.75], [4.05, 4.9], [8.7, 9.3]];
    for (const [z0, z1] of segs) { B(0.3, WH, z1 - z0, M.dark, LX, WH / 2, (z0 + z1) / 2); wallSkin(z1 - z0, WH, LEFT_X + 0.001, WH / 2, (z0 + z1) / 2, Math.PI / 2); }
    // over the door and around the side viewport
    B(0.3, WH - 3.6, 2.3, M.dark, LX, (WH + 3.6) / 2, 2.9); wallSkin(2.3, WH - 3.6, LEFT_X + 0.001, (WH + 3.6) / 2, 2.9, Math.PI / 2);
    B(0.3, 1.25, 3.8, M.dark, LX, 0.625, 6.8); wallSkin(3.8, 1.25, LEFT_X + 0.001, 0.625, 6.8, Math.PI / 2);
    B(0.3, WH - 7.8, 3.8, M.dark, LX, (WH + 7.8) / 2, 6.8); wallSkin(3.8, WH - 7.8, LEFT_X + 0.001, (WH + 7.8) / 2, 6.8, Math.PI / 2);
    Pl(3.8, 6.55, M.glass, LX - 0.05, 4.525, 6.8, Math.PI / 2);
    B(0.5, 0.14, 3.9, M.mid, LEFT_X + 0.1, 1.25, 6.8); B(0.5, 0.14, 3.9, M.mid, LEFT_X + 0.1, 7.8, 6.8);
    B(0.5, 6.55, 0.3, M.mid, LEFT_X + 0.05, 4.525, 6.8);
    B(0.4, 0.3, 3.8, M.mid, LEFT_X + 0.05, 4.5, 6.8);
    B(0.03, 0.04, 3.7, G(CYAN, 2.0), LEFT_X + 0.36, 1.33, 6.8); B(0.03, 0.04, 3.7, G(CYAN, 2.0), LEFT_X + 0.36, 7.72, 6.8);
    for (const z of [4.95, 8.65]) B(0.5, 6.7, 0.18, M.mid, LEFT_X + 0.08, 4.525, z);
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
      // two leaves painted with a band, chevrons and a lit window slit; each mirrored so the chevrons meet at the seam
      const doorTex = (flip) => {
        const t = canvasTex(256, 896), c = t.ctx, W = 256, H = 896;
        const gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#2a3242'); gr.addColorStop(1, '#3a4456'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
        if (flip) { c.translate(W, 0); c.scale(-1, 1); }
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, 6); c.fillRect(0, H - 6, W, 6); c.fillRect(W - 8, 0, 8, H);
        c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 4; c.strokeRect(22, 30, W - 50, 300); c.strokeRect(22, 560, W - 50, 300);
        c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.strokeRect(25, 33, W - 50, 300); c.strokeRect(25, 563, W - 50, 300);
        c.fillStyle = '#141923'; c.fillRect(0, 380, W, 140); // the band
        c.fillStyle = '#d4a62a'; for (let i = 0; i < 3; i++) { const x0 = 40 + i * 62; c.beginPath(); c.moveTo(x0, 404); c.lineTo(x0 + 34, 450); c.lineTo(x0, 496); c.lineTo(x0 + 18, 496); c.lineTo(x0 + 52, 450); c.lineTo(x0 + 18, 404); c.closePath(); c.fill(); }
        c.fillStyle = '#7dd3fc'; c.fillRect(W - 40, 120, 14, 160); c.fillStyle = 'rgba(125,211,252,.25)'; c.fillRect(W - 46, 114, 26, 172);
        c.fillStyle = 'rgba(190,205,225,.35)'; c.font = '700 26px system-ui'; c.fillText('TL-1', 34, 545);
        return t.tex;
      };
      for (const s of [-1, 1]) {
        const leaf = B(0.1, 3.45, 0.94, M.dark, LEFT_X - 0.16, 1.73, z + s * 0.48);
        const face = Pl(0.94, 3.45, k.mat(0xffffff, { map: doorTex(s < 0), roughness: 0.45, metalness: 0.6 }), LEFT_X - 0.105, 1.73, z + s * 0.48, Math.PI / 2);
        face.receiveShadow = true; void leaf;
      }
      B(0.02, 3.3, 0.03, G(CYAN, 2.4), LEFT_X - 0.1, 1.73, z);
      // recessed threshold
      B(0.5, 0.02, 2.3, M.black, LEFT_X + 0.1, 0.004, z);
      B(0.02, 0.022, 2.24, G(CYAN, 1.4), LEFT_X + 0.34, 0.005, z);
      B(0.32, 0.12, 2.5, M.mid, LEFT_X + 0.05, 3.6, z); B(0.3, 3.62, 0.12, M.mid, LEFT_X + 0.05, 1.81, z - 1.2); B(0.3, 3.62, 0.12, M.mid, LEFT_X + 0.05, 1.81, z + 1.2);
      B(0.03, 0.04, 2.3, G(CYAN, 2.4), LEFT_X + 0.22, 3.53, z); B(0.03, 3.4, 0.04, G(CYAN, 2.4), LEFT_X + 0.22, 1.8, z - 1.13); B(0.03, 3.4, 0.04, G(CYAN, 2.4), LEFT_X + 0.22, 1.8, z + 1.13);
      B(0.06, 0.4, 0.26, M.dark, LEFT_X + 0.03, 1.5, z + 1.55);
      my.callLight = B(0.03, 0.08, 0.16, k.glow(AMBER, 2.2), LEFT_X + 0.07, 1.6, z + 1.55);
      B(0.03, 0.06, 0.16, G(0x4ade80, 1.8), LEFT_X + 0.07, 1.42, z + 1.55);
      Sign('TURBOASCENSOR', 'Cubiertas 1 – 42', 2.3, 0.55, LEFT_X + 0.22, 4.15, z, Math.PI / 2, { h: 256, k: 1.15 });
      // deck marking in front of it: a hazard-striped frame with the deck stencil inside
      const s = canvasTex(1024, 512), g = s.ctx, W = 1024, H = 512, bw = 46;
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(bw, bw, W - 2 * bw, H - 2 * bw); g.clip('evenodd');
      for (let i = -H; i < W + H; i += 64) { g.fillStyle = (i / 64) % 2 ? '#111' : '#e5b02a'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - H, H); g.lineTo(i - H, H); g.fill(); }
      g.restore();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 150px system-ui'; g.letterSpacing = '22px'; g.fillStyle = 'rgba(253,224,71,.6)'; g.fillText('CUBIERTA 1', W / 2, H / 2 + 6, W - 140);
      const hm = new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, depthWrite: false }); hm.color.setScalar(0.8);
      const st = Pl(2.3, 1.1, hm, LEFT_X + 0.95, 0.012, z, 0, 0);
      st.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    }
    // status strip above the board (live: condition, shields, warp, heading, stardate)
    {
      const s = my.status = canvasTex(2048, 160);
      paintStatus(s.ctx, 0, false, false);
      const m = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false });
      Pl(8.2, 0.64, m, LEFT_X + 0.12, 6.3, -3.2, Math.PI / 2);
      B(0.12, 0.8, 8.4, M.mid, LEFT_X + 0.05, 6.3, -3.2);
    }
    // the end caps of the cut-away: structural beams with lights
    B(0.6, WH + 0.3, 0.6, M.mid, 13.3, (WH + 0.3) / 2 - 0.15, BACK_Z - 0.0);
    B(0.6, WH + 0.3, 0.6, M.mid, LEFT_X - 0.0, (WH + 0.3) / 2 - 0.15, 9.3);
    for (let i = 0; i < 8; i++) { B(0.04, 0.04, 0.04, G(i % 2 ? 0xff5c5c : 0x4ade80, 2.2), 13.61, 1.2 + i * 0.95, BACK_Z); B(0.04, 0.04, 0.04, G(i % 2 ? 0xff5c5c : 0x4ade80, 2.2), LEFT_X, 1.2 + i * 0.95, 9.61); }
  },

  // ---------------------------------------------------------------- decor: command, holo table, stations
  decor(k) {
    const { room, scene, C: { LEFT_X } } = k, my = k.my, { M, G, B, Cy, Pl, Ring, Sign } = my;
    my.roomLamps = [];
    const shared = (w, h) => { const s = canvasTex(w, h); return s; };
    const roA = my.roA = shared(512, 256), roB = my.roB = shared(512, 256), radar = my.radar = shared(256, 256);
    paintReadoutA(roA.ctx, 0); paintReadoutB(roB.ctx, 0, 1); paintRadar(radar.ctx, 0);
    const screen = (tex, n = 1.05, extra = {}) => { const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, ...extra }); m.color.setScalar(n); return m; };
    const roAm = screen(roA.tex, 1.15), roBm = screen(roB.tex, 0.85);
    my.roAm = roAm; my.roBm = roBm;

    // ---- command dais, captain's chair, officers' chairs, helm consoles, tactical rail
    const CX = -1.5, CZ = 4.2;
    {
      Cy(2.95, 3.0, 0.12, M.dark, CX, 0.06, CZ, { seg: 72 });
      Cy(2.6, 2.65, 0.12, M.mid, CX, 0.18, CZ, { seg: 72 });
      const t = canvasTex(1024, 1024), g = t.ctx;
      const gr = g.createRadialGradient(512, 512, 0, 512, 512, 512); gr.addColorStop(0, '#26304a'); gr.addColorStop(1, '#141a2a'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
      g.strokeStyle = 'rgba(212,166,42,.35)'; g.lineWidth = 3;
      for (const r of [180, 360, 470]) { g.beginPath(); g.arc(512, 512, r, 0, TAU); g.stroke(); }
      for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; g.beginPath(); g.moveTo(512 + Math.cos(a) * 470, 512 + Math.sin(a) * 470); g.lineTo(512 + Math.cos(a) * (i % 4 ? 450 : 420), 512 + Math.sin(a) * (i % 4 ? 450 : 420)); g.stroke(); }
      g.globalAlpha = 0.18; drawEmblem(g, 512, 520, 1.6, '#d4a62a'); g.globalAlpha = 1;
      const top = new THREE.Mesh(new THREE.CircleGeometry(2.58, 72), k.mat(0xffffff, { map: t.tex, roughness: 0.85, metalness: 0.1 }));
      top.rotation.x = -Math.PI / 2; top.position.set(CX, 0.241, CZ); top.receiveShadow = true; room.add(top);
      Ring(2.97, 0.02, G(AMBER, 1.9), CX, 0.125, CZ); Ring(2.62, 0.018, G(GOLD, 1.7), CX, 0.245, CZ);
      Ring(3.35, 0.012, G(CYAN, 1.2), CX, 0.01, CZ);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.13; B(0.03, 0.01, 0.9, G(CYAN, 0.95), CX + Math.sin(a) * 3.95, 0.006, CZ + Math.cos(a) * 3.95, { ry: a }); }
      const l = new THREE.PointLight(0xffc77a, 7, 7, 1.6); l.position.set(CX, 3.0, CZ + 0.5); room.add(l); my.daisLight = l;
    }
    const chair = (x, z, ry, big, cushion) => {
      const c = new THREE.Group(), s = big ? 1 : 0.86;
      c.add(Cy(0.3, 0.42, 0.34, M.dark, 0, 0.17, 0, { to: c, cast: true }));
      c.add(B(0.95, 0.2, 0.86, cushion, 0, 0.52, 0, { r: 0.08, to: c, cast: true }));
      const back = B(0.95, 1.3, 0.22, cushion, 0, 1.18, 0.4, { r: 0.1, to: c, cast: true }); back.rotation.x = 0.12;
      B(1.05, 1.2, 0.08, M.dark, 0, 1.15, 0.53, { r: 0.03, to: c, rx: 0.12, cast: true });
      if (big) { B(0.6, 0.32, 0.2, cushion, 0, 1.96, 0.5, { r: 0.08, to: c, rx: 0.18 }); }
      for (const sx of [-1, 1]) {
        B(0.18, 0.14, 0.86, M.dark, sx * 0.56, 0.78, 0.02, { r: 0.05, to: c, cast: true });
        B(0.12, 0.3, 0.12, M.mid, sx * 0.56, 0.6, 0.3, { to: c });
        if (big) { const p = Pl(0.13, 0.5, roBm, sx * 0.56, 0.855, 0.0, 0, -Math.PI / 2, c); p.rotation.set(-Math.PI / 2, 0, 0); }
        B(0.02, 0.02, 0.8, G(big ? AMBER : CYAN, 2), sx * 0.66, 0.78, 0.02, { to: c });
      }
      if (big) { // the emblem on the back of the captain's chair
        const t = canvasTex(256, 256), g = t.ctx; drawEmblem(g, 128, 132, 1.0, '#ffd27a');
        const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, toneMapped: false }); m.color.setScalar(1.7);
        const e = Pl(0.42, 0.42, m, 0, 1.38, 0.585, 0, 0, c); e.rotation.x = 0.12;
      }
      c.scale.setScalar(s); c.position.set(x, 0.24, z); c.rotation.y = ry; room.add(c);
      return c;
    };
    my.captainChair = chair(CX, CZ + 0.3, 0, true, M.red);
    chair(CX - 1.35, CZ + 0.55, -0.18, false, M.seat); chair(CX + 1.35, CZ + 0.55, 0.18, false, M.seat);
    for (const sx of [-1, 1]) { // helm and operations consoles, facing the captain
      const g = new THREE.Group();
      B(0.5, 0.75, 0.42, M.dark, 0, 0.62, 0, { to: g, cast: true, r: 0.04 });
      B(1.25, 0.1, 0.62, M.mid, 0, 1.03, 0.04, { to: g, cast: true, rx: 0.35, r: 0.03 });
      const p = Pl(1.12, 0.5, roAm, 0, 1.09, 0.05, 0, -Math.PI / 2 + 0.35, g); p.rotation.set(-Math.PI / 2 + 0.35, 0, 0);
      B(1.2, 0.025, 0.025, G(CYAN, 2.2), 0, 1.0, 0.36, { to: g });
      Sign(sx < 0 ? 'TIMÓN' : 'OPERACIONES', null, 0.7, 0.16, 0, 0.86, 0.22, 0, { to: g, h: 128, w: 512, k: 1.1 });
      g.position.set(CX + sx * 1.05, 0.24, CZ - 1.75); g.rotation.y = sx * -0.12; room.add(g);
    }
    { // tactical rail: a curved console behind the captain
      const R0 = 2.0, R1 = 2.42, a0 = -1.05, a1 = 1.05, y0 = 0.24, h = 0.88;
      const wall = (r) => Cy(r, r, h, M.dark, CX, y0 + h / 2, CZ, { seg: 48, open: true, t0: a0, tl: a1 - a0 });
      wall(R0).material = M.dark; wall(R1);
      for (const m of room.children.slice(-2)) { m.material = new THREE.MeshStandardMaterial({ color: 0x1a1f29, roughness: 0.42, metalness: 0.7, side: THREE.DoubleSide }); m.castShadow = true; }
      const top = new THREE.Mesh(arcStrip(R0 - 0.04, R1 + 0.06, a0, a1, 48, y0 + h + 0.07, y0 + h - 0.05), M.mid); top.position.set(CX, 0.01, CZ); room.add(top);
      const tTex = roA.tex.clone(); tTex.wrapS = THREE.RepeatWrapping; tTex.repeat.set(4, 1); my.animTex.push(tTex);
      const scr = new THREE.Mesh(arcStrip(R0 + 0.06, R1 - 0.04, a0 + 0.05, a1 - 0.05, 48, y0 + h + 0.08, y0 + h - 0.035), screen(tTex, 1.05)); scr.position.set(CX, 0.012, CZ); room.add(scr);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R1 + 0.06, 0.02, 6, 64, a1 - a0), G(GOLD, 1.8)); lip.rotation.set(Math.PI / 2, 0, Math.PI / 2 - a1); lip.position.set(CX, y0 + h - 0.06, CZ);
      room.add(lip);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R1 + 0.005, R1 + 0.005, 0.05, 48, 1, true, a0, a1 - a0), G(CYAN, 1.6)); band.position.set(CX, 0.42, CZ); room.add(band);
      for (const a of [a0, a1]) B(0.5, h + 0.1, 0.12, M.mid, CX + Math.sin(a) * 2.21, y0 + (h + 0.1) / 2, CZ + Math.cos(a) * 2.21, { ry: a, cast: true });
      Sign('TÁCTICO', null, 0.9, 0.2, CX, 0.75, CZ + R1 + 0.01, 0, { h: 128, w: 512, k: 1.1 });
    }

    // ---- holo table: planet hologram, the ship in orbit, a scan ring
    const HX = 3.8, HZ = 6.3;
    {
      Cy(0.62, 0.85, 0.95, M.dark, HX, 0.475, HZ, { seg: 6, cast: true });
      Cy(1.18, 1.0, 0.16, M.mid, HX, 1.03, HZ, { seg: 6, cast: true });
      Ring(0.86, 0.02, G(CYAN, 2), HX, 0.06, HZ);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 1.05, 6, 1), screen(roB.tex, 0.95)); ring.rotation.set(-Math.PI / 2, 0, Math.PI / 6); ring.position.set(HX, 1.115, HZ); room.add(ring);
      const em = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshBasicMaterial({ toneMapped: false, map: radialTex([[0, 'rgba(170,240,255,1)'], [0.25, 'rgba(56,214,255,.75)'], [0.55, 'rgba(10,50,74,1)'], [0.7, 'rgba(56,214,255,.9)'], [0.78, 'rgba(8,24,36,1)'], [0.9, 'rgba(56,214,255,.6)'], [1, 'rgba(8,24,36,1)']], 128) })); // emitter lens em.rotation.x = -Math.PI / 2; em.position.set(HX, 1.12, HZ); room.add(em);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.02, 4, 6), G(CYAN, 2.2)); edge.rotation.set(Math.PI / 2, 0, Math.PI / 6); edge.position.set(HX, 1.11, HZ); room.add(edge);
      // light cone
      const ct = canvasTex(8, 128), cg = ct.ctx, gr = cg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(120,220,255,0)'); gr.addColorStop(1, 'rgba(120,220,255,.13)'); cg.fillStyle = gr; cg.fillRect(0, 0, 8, 128);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.36, 1.7, 40, 1, true), new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      cone.position.set(HX, 1.98, HZ); room.add(cone);
      const holo = my.holo = new THREE.Group(); holo.position.set(HX, 2.35, HZ);
      const add = (m) => { m.renderOrder = 2; holo.add(m); return m; };
      const hm = (c, o, k = 1.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.56, 48, 24), new THREE.MeshBasicMaterial({ map: holoPlanetTex(my.planet && my.planet.material.uniforms.day.value), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: true }));
      add(sphere);
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 2), Object.assign(hm(0x38d6ff, 0.07, 1), { wireframe: true })));
      const orbit = add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.008, 6, 96), hm(0x9be8ff, 0.8))); orbit.rotation.x = Math.PI / 2 + 0.35;
      const ship = my.holoShip = new THREE.Group();
      ship.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24), hm(0xbfefff, 0.85, 0.95)));
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.14), hm(0xe8f8ff, 0.9)); hull.position.set(0, -0.03, -0.1); ship.add(hull);
      for (const s of [-1, 1]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.16), hm(0x9be8ff, 0.9)); n.position.set(s * 0.07, -0.01, -0.14); ship.add(n); }
      const orbitG = my.holoOrbit = new THREE.Group(); orbitG.rotation.x = 0.35; orbitG.add(ship); ship.position.set(0.95, 0, 0); holo.add(orbitG);
      const scan = my.holoScan = add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.006, 6, 64), hm(0x9be8ff, 0.9))); scan.rotation.x = Math.PI / 2;
      const lab = canvasTex(512, 128), lg = lab.ctx; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillStyle = '#9be8ff'; lg.font = '700 44px system-ui'; lg.letterSpacing = '6px'; lg.fillText('HERD PRIME', 256, 44); lg.font = '500 30px system-ui'; lg.letterSpacing = '3px'; lg.fillText('Clase M · órbita estable', 256, 96);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: lab.tex, transparent: true, depthWrite: false, toneMapped: false })); tag.material.color.setScalar(1.3); tag.scale.set(1.0, 0.25, 1); tag.position.set(0, 0.95, 0); holo.add(tag);
      room.add(holo);
      const l = new THREE.PointLight(0x5fd4ff, 4, 7, 1.7); l.position.set(HX, 2.4, HZ); room.add(l); my.holoLight = l;
      // compass on the deck around it
      const t = canvasTex(512, 512), g = t.ctx; g.translate(256, 256); g.strokeStyle = 'rgba(56,214,255,.55)'; g.lineWidth = 3;
      for (const r of [200, 236]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU, r0 = i % 6 ? 224 : 206; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * 236, Math.sin(a) * 236); g.stroke(); }
      g.fillStyle = 'rgba(56,214,255,.6)'; g.font = '700 26px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CARTOGRAFÍA ESTELAR', 0, -170);
      const dm = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
      const decal = Pl(4.2, 4.2, dm, HX, 0.014, HZ, 0, -Math.PI / 2);
      decal.rotation.set(-Math.PI / 2, 0, 0);
    }

    // ---- warp core in the back right corner
    const WX = 12.35, WZ = -7.3;
    {
      Cy(1.05, 1.15, 0.3, M.dark, WX, 0.15, WZ, { seg: 8, cast: true });
      Cy(0.72, 0.9, 0.7, M.mid, WX, 0.65, WZ, { seg: 16, cast: true });
      const TOP = my.WH || 8.75, c0 = 0.95, c1 = TOP - 1.05; // the core runs from the floor housing to the cap under the soffit
      Cy(0.72, 0.9, 0.7, M.mid, WX, TOP - 0.7, WZ, { seg: 16, cast: true, rx: Math.PI });
      const bt = canvasTex(32, 256, true), bg = bt.ctx;
      for (let y = 0; y < 256; y++) { const v = Math.pow(0.5 + 0.5 * Math.cos((y / 256) * TAU * 2), 6); bg.fillStyle = `rgb(${40 + v * 180},${120 + v * 135},${255})`; bg.fillRect(0, y, 32, 1); }
      bt.tex.wrapT = THREE.RepeatWrapping; bt.tex.repeat.set(1, 3);
      my.coreTex = bt.tex;
      const coreM = new THREE.MeshBasicMaterial({ map: bt.tex, toneMapped: false }); coreM.color.setScalar(1.5); my.coreMat = coreM;
      Cy(0.3, 0.3, c1 - c0 + 0.1, coreM, WX, (c0 + c1) / 2, WZ, { seg: 24 });
      Cy(0.48, 0.48, c1 - c0, M.glass, WX, (c0 + c1) / 2, WZ, { seg: 32, open: true });
      my.coreRings = [];
      for (let i = 0; i < 9; i++) {
        const y = 1.45 + i * ((c1 - 1.95) / 8);
        Ring(0.52, 0.06, M.mid, WX, y, WZ);
        my.coreRings.push(Ring(0.5, 0.022, k.glow(0x6fc3ff, 1.4), WX, y + 0.075, WZ));
      }
      for (let i = 0; i < 4; i++) { const a = i * (TAU / 4) + 0.4; Cy(0.06, 0.06, c1 - c0 + 0.5, M.light, WX + Math.cos(a) * 0.7, (c0 + c1) / 2, WZ + Math.sin(a) * 0.7, { seg: 10 }); }
      Ring(1.3, 0.035, M.light, WX, 1.05, WZ);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; if (Math.cos(a) < -0.5) continue; Cy(0.025, 0.025, 1.0, M.light, WX + Math.cos(a) * 1.3, 0.55, WZ + Math.sin(a) * 1.3, { seg: 6 }); }
      // hazard ring on the deck
      const t = canvasTex(512, 512), g = t.ctx; g.translate(256, 256);
      for (let i = 0; i < 36; i++) { g.fillStyle = i % 2 ? '#fbbf24' : '#111'; g.beginPath(); g.arc(0, 0, 250, (i / 36) * TAU, ((i + 1) / 36) * TAU); g.arc(0, 0, 205, ((i + 1) / 36) * TAU, (i / 36) * TAU, true); g.fill(); }
      g.fillStyle = '#fbbf24'; g.font = '800 22px system-ui'; g.textAlign = 'center';
      const hm = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false }); hm.color.setScalar(0.75);
      const hz = Pl(3.4, 3.4, hm, WX, 0.013, WZ, 0, -Math.PI / 2); hz.rotation.set(-Math.PI / 2, 0, 0);
      Sign('NÚCLEO DE CURVATURA', 'Sala de máquinas · nivel 1', 1.9, 0.48, WX - 0.4, 2.5, WZ + 1.21, -0.25, { k: 1.1 });
      B(0.06, 1.1, 0.06, M.mid, WX - 0.4, 1.72, WZ + 1.08);
      const l = new THREE.PointLight(0x4da6ff, 22, 10, 1.6); l.position.set(WX - 1.2, 4, WZ + 1.6); room.add(l); my.coreLight = l;
    }
    // ---- engineering console beside it
    {
      const g = new THREE.Group();
      B(0.7, 1.0, 1.7, M.dark, 0, 0.5, 0, { to: g, cast: true, r: 0.04 });
      B(0.82, 0.08, 1.8, M.mid, -0.06, 1.05, 0, { to: g, rz: -0.32 });
      const p = Pl(1.62, 0.66, roAm, -0.08, 1.1, 0, -Math.PI / 2, 0, g); p.rotation.set(-Math.PI / 2, 0, Math.PI / 2); p.rotateX(-0.32);
      B(0.12, 1.4, 0.12, M.mid, 0.25, 1.75, 0, { to: g });
      Pl(1.5, 0.9, roAm, -0.02, 2.35, 0, -Math.PI / 2, 0, g);
      B(0.08, 1.0, 1.6, M.dark, 0.05, 2.35, 0, { to: g });
      Sign('INGENIERÍA', 'Diagnóstico de sistemas', 1.5, 0.36, -0.03, 3.0, 0, -Math.PI / 2, { to: g, k: 1.1, accent: '#ffb347' });
      g.position.set(12.45, 0, -3.6); room.add(g);
    }
    // ---- science station in the back left corner
    {
      const g = new THREE.Group();
      B(2.0, 0.95, 0.75, M.dark, 0, 0.475, 0, { to: g, cast: true, r: 0.04 });
      B(2.1, 0.08, 0.85, M.mid, 0, 1.0, 0.05, { to: g, rx: 0.3 });
      const p = Pl(1.9, 0.62, roBm, 0, 1.05, 0.07, 0, 0, g); p.rotation.set(-Math.PI / 2 + 0.3, 0, 0);
      B(1.5, 1.0, 0.08, M.dark, -0.15, 2.05, -0.3, { to: g, rx: -0.12 });
      const d = Pl(1.36, 0.88, screen(radar.tex, 1.1), -0.15, 2.05, -0.25, 0, 0, g); d.rotation.x = -0.12;
      Cy(0.09, 0.09, 2.6, M.light, 0.85, 1.3, -0.2, { to: g, seg: 10 });
      for (let i = 0; i < 5; i++) B(0.05, 0.05, 0.05, G(UI[i], 2), 0.85, 1.2 + i * 0.3, -0.1, { to: g });
      Sign('CIENCIAS', 'Sensores de largo alcance', 1.5, 0.36, -0.15, 2.82, -0.31, 0, { to: g, k: 1.1, accent: '#4ade80' });
      g.position.set(-11.75, 0, -8.45); room.add(g);
    }
    // ---- replicator at the break spot (people come here for a coffee)
    {
      const g = new THREE.Group();
      B(1.15, 1.05, 2.8, M.dark, 0, 0.525, 0, { to: g, cast: true, r: 0.04 });
      B(1.25, 0.07, 2.9, M.mid, -0.03, 1.085, 0, { to: g });
      B(0.35, 2.7, 2.9, hullMatOf(k, 2.9, 2.7), 0.45, 2.45, 0, { to: g, cast: true });
      B(0.36, 0.9, 1.0, M.black, 0.27, 1.65, -0.5, { to: g });
      const niche = Pl(0.92, 0.82, G(0xffe2b8, 1.25), 0.08, 1.65, -0.5, -Math.PI / 2, 0, g);
      { // a cool lit niche: bright emitter at the top, a dark grille below, a pad under the cup
        const t = canvasTex(128, 128), c = t.ctx, gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#e9fbff'); gr.addColorStop(0.18, '#8fdcf2'); gr.addColorStop(0.55, '#1d5266'); gr.addColorStop(1, '#050b12'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
        c.fillStyle = 'rgba(2,6,12,.75)'; for (let y = 62; y < 120; y += 7) for (let x = 10; x < 118; x += 9) { c.beginPath(); c.roundRect(x, y, 6, 4, 1.5); c.fill(); }
        c.fillStyle = 'rgba(200,245,255,.5)'; for (let i = 0; i < 40; i++) c.fillRect((i * 37) % 120 + 4, 10 + ((i * 53) % 40), 1, 6);
        niche.material = new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }); niche.material.color.setScalar(0.85); }
      B(0.05, 0.03, 0.9, G(0xcff6ff, 2.2), 0.08, 2.06, -0.5, { to: g });
      for (const s of [-1, 1]) B(0.06, 0.95, 0.05, G(CYAN, 1.5), 0.05, 1.65, -0.5 + s * 0.5, { to: g });
      Ring(0.16, 0.012, G(CYAN, 2.0), -0.05, 1.125, -0.5, Math.PI / 2, g);
      my.replCup = Cy(0.07, 0.055, 0.14, M.chrome, -0.05, 1.19, -0.5, { to: g, seg: 16 });
      my.replSpark = Pl(0.5, 0.7, new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(200,240,255,.9)'], [1, 'rgba(120,200,255,0)']], 64), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }), 0.0, 1.5, -0.5, -Math.PI / 2, 0, g);
      for (let i = 0; i < 3; i++) Cy(0.07, 0.055, 0.14, i === 1 ? M.gold : M.chrome, -0.2, 1.19, 0.5 + i * 0.25, { to: g, seg: 16 });
      Sign('REPLICADOR', 'Café solo · Té Earl Grey, caliente', 2.2, 0.5, 0.26, 2.85, -0.3, -Math.PI / 2, { to: g, k: 1.1, accent: '#ffb347' });
      { const t = canvasTex(512, 384), c = t.ctx; c.fillStyle = '#060c18'; c.fillRect(0, 0, 512, 384); c.fillStyle = '#ffb347'; c.beginPath(); c.roundRect(14, 14, 484, 56, 28); c.fill();
        c.fillStyle = '#060c18'; c.font = '800 34px system-ui'; c.textBaseline = 'middle'; c.letterSpacing = '4px'; c.fillText('MENÚ DEL DÍA', 40, 43); c.letterSpacing = '0px';
        ['Café solo', 'Café con leche', 'Té Earl Grey, caliente', 'Chocolate', 'Agua fría'].forEach((x, i) => { c.fillStyle = i === 2 ? '#ffb347' : '#cfe9ff'; c.font = `${i === 2 ? 700 : 500} 34px system-ui`; c.fillText(x, 40, 112 + i * 54); c.fillStyle = '#38d6ff'; c.fillRect(470, 104 + i * 54, 14, 14); });
        Pl(0.84, 0.63, new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }), 0.27, 1.72, 0.45, -Math.PI / 2, 0, g); }
      g.position.set(10.75, 0, 0.7); room.add(g);
      const l = new THREE.PointLight(0x9fe6ff, 2.4, 4, 1.8); l.position.set(10.2, 1.8, 0.2); room.add(l);
    }
    // ---- transporter pad in the front right corner
    {
      const TX = 11.55, TZ = 7.7;
      Cy(1.1, 1.18, 0.14, M.mid, TX, 0.07, TZ, { seg: 6, cast: true });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const p = Cy(0.24, 0.26, 0.05, M.light, TX + Math.cos(a) * 0.62, 0.16, TZ + Math.sin(a) * 0.62, { seg: 20 }); p.userData.pad = true; }
      Cy(0.24, 0.26, 0.05, M.light, TX, 0.16, TZ, { seg: 20 });
      my.padRings = [];
      for (let i = 0; i < 7; i++) { const a = (i / 6) * TAU, x = i < 6 ? TX + Math.cos(a) * 0.62 : TX, z = i < 6 ? TZ + Math.sin(a) * 0.62 : TZ; my.padRings.push(Ring(0.2, 0.012, k.glow(0x9be8ff, 1.4), x, 0.19, z)); }
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.02, 4, 6), G(CYAN, 2)); edge.rotation.set(Math.PI / 2, 0, 0); edge.position.set(TX, 0.145, TZ); room.add(edge);
      const N = 160, pp = new Float32Array(N * 3), r = rng(8); my.beamSeeds = [];
      for (let i = 0; i < N; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.9; pp.set([TX + Math.cos(a) * d, 0.2 + r() * 2.4, TZ + Math.sin(a) * d], i * 3); my.beamSeeds.push(r()); }
      const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      const beam = my.beam = new THREE.Points(bgeo, new THREE.PointsMaterial({ size: 0.06, color: new THREE.Color(0xbfefff).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
        map: radialTex([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], 32) }));
      my.beamBase = pp.slice(); room.add(beam);
      const t = canvasTex(1024, 128), g = t.ctx; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 56px system-ui'; g.letterSpacing = '8px'; g.fillStyle = 'rgba(125,211,252,.6)'; g.fillText('TRANSPORTADOR', 512, 66);
      const st = Pl(2.6, 0.32, new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false }), TX - 0.2, 0.012, TZ - 1.5, 0, -Math.PI / 2); st.rotation.set(-Math.PI / 2, 0, 0);
    }
    // ---- supply crates by the transporter
    {
      const crate = (w, h, d, x, y, z, ry, label, col) => {
        const c = B(w, h, d, M.mid, x, y, z, { ry, cast: true, r: 0.03 });
        B(w + 0.02, 0.05, d + 0.02, M.dark, x, y + h / 2 - 0.08, z, { ry }); B(w + 0.02, 0.05, d + 0.02, M.dark, x, y - h / 2 + 0.08, z, { ry });
        const t = canvasTex(512, 256), g = t.ctx; g.fillStyle = col; g.fillRect(0, 0, 512, 36); g.fillRect(0, 220, 512, 36);
        g.fillStyle = 'rgba(230,240,255,.85)'; g.font = '800 64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '6px'; g.fillText(label, 256, 128, 480);
        const pl = Pl(w * 0.9, h * 0.62, new THREE.MeshBasicMaterial({ map: t.tex, transparent: true }), 0, 0, 0, 0); pl.material.color.setScalar(0.8);
        pl.position.set(x + Math.sin(ry) * (d / 2 + 0.005), y, z + Math.cos(ry) * (d / 2 + 0.005)); pl.rotation.y = ry;
        return c;
      };
      crate(1.0, 0.7, 0.75, 12.35, 0.35, 4.75, -0.35, 'SUMINISTROS', '#ffb347');
      crate(0.85, 0.6, 0.65, 12.4, 1.0, 4.8, -0.25, 'MÉDICO', '#ff6b6b');
      crate(0.75, 0.55, 0.6, 12.2, 0.275, 5.85, -0.6, 'SENSORES', '#38d6ff');
    }
    // ---- hydroponics column beside the side viewport: trays of fan leaves and hanging vines behind glass
    {
      const x = -12.2, z = 5.3;
      Cy(0.42, 0.46, 0.3, M.mid, x, 0.15, z, { seg: 20, cast: true });
      Cy(0.42, 0.42, 0.18, M.mid, x, 3.15, z, { seg: 20 });
      Cy(0.38, 0.38, 2.7, M.glass, x, 1.65, z, { seg: 24, open: true });
      Ring(0.4, 0.015, G(0xd18cff, 1.6), x, 3.05, z); Ring(0.4, 0.015, G(0xd18cff, 1.6), x, 0.32, z);
      // a leaf card: pointed blade with a midrib, alpha tested (no sorting)
      const lt = canvasTex(64, 128), lg = lt.ctx;
      lg.fillStyle = '#fff'; lg.beginPath(); lg.moveTo(32, 126); lg.bezierCurveTo(-6, 80, 6, 26, 32, 2); lg.bezierCurveTo(58, 26, 70, 80, 32, 126); lg.fill();
      lg.strokeStyle = 'rgba(120,140,110,.9)'; lg.lineWidth = 3; lg.beginPath(); lg.moveTo(32, 124); lg.lineTo(32, 10); lg.stroke();
      lg.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const y = 100 - i * 15; lg.beginPath(); lg.moveTo(32, y); lg.lineTo(14, y - 12); lg.moveTo(32, y); lg.lineTo(50, y - 12); lg.stroke(); }
      const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
      const leafMat = new THREE.MeshStandardMaterial({ map: lt.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
      const r = rng(31), mats = [], greens = [0x2f9e62, 0x5cc27a, 0x1f7a4a, 0x8fd16a];
      const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const put = (px, py, pz, yaw, tilt, w, h) => { e.set(tilt, yaw, 0); q.setFromEuler(e); sc.set(w, h, 1); mats.push(new THREE.Matrix4().compose(v.set(px, py, pz), q, sc)); };
      for (let i = 0; i < 4; i++) {
        const y = 0.55 + i * 0.65;
        Cy(0.3, 0.3, 0.04, M.dark, x, y, z, { seg: 16 });
        for (let j = 0; j < 13; j++) { const a = (j / 13) * TAU + i * 0.7 + r() * 0.3, d = 0.03 + r() * 0.06; put(x + Math.cos(a) * d, y + 0.02, z + Math.sin(a) * d, -a + Math.PI / 2, 0.35 + r() * 0.55, 0.07 + r() * 0.04, 0.2 + r() * 0.12); }
        B(0.5, 0.02, 0.02, G(0xd18cff, 2.0), x, y + 0.53, z);
        // vines spilling over the tray edge
        for (let vI = 0; vI < 2; vI++) { const a = i * 1.9 + vI * 2.6, ex = x + Math.cos(a) * 0.27, ez = z + Math.sin(a) * 0.27; for (let m = 0; m < 5; m++) put(ex + Math.cos(a) * m * 0.012, y - 0.02 - m * 0.075, ez + Math.sin(a) * m * 0.012, -a + Math.PI / 2 + (m % 2 ? 0.6 : -0.6), Math.PI - 0.5, 0.045, 0.09); }
      }
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, mats.length), col = new THREE.Color();
      mats.forEach((m4, i) => { leaves.setMatrixAt(i, m4); leaves.setColorAt(i, col.set(greens[Math.floor(r() * greens.length)])); });
      leaves.castShadow = true; room.add(leaves);
      const l = new THREE.PointLight(0xc58bff, 2.5, 3, 1.8); l.position.set(x + 0.5, 1.8, z); room.add(l);
      B(0.06, 0.32, 0.06, M.mid, x, 3.4, z);
      Sign('HIDROPONÍA', null, 0.9, 0.22, x, 3.62, z, Math.PI / 2, { h: 128, w: 512, k: 1.1, accent: '#4ade80' });
    }
    // ---- observation bench under the side viewport: backless, three cushions on a lit pedestal, facing the window
    {
      const g = new THREE.Group();
      B(0.7, 0.07, 2.2, M.mid, 0, 0.36, 0, { to: g, r: 0.025, cast: true });
      for (let i = -1; i <= 1; i++) B(0.62, 0.13, 0.68, M.seat, 0, 0.465, i * 0.72, { to: g, r: 0.05, cast: true });
      for (let i = -1; i <= 1; i++) B(0.64, 0.015, 0.02, M.dark, 0, 0.535, i * 0.72 + 0.35, { to: g });
      for (const sz of [-0.8, 0.8]) B(0.34, 0.3, 0.16, M.dark, 0, 0.17, sz, { to: g, cast: true });
      B(0.5, 0.012, 1.9, G(CYAN, 1.3), 0, 0.31, 0, { to: g }); // light under the seat
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.6), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(90,200,255,.35)'], [1, 'rgba(90,200,255,0)']], 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.012; g.add(pool);
      g.position.set(-11.35, 0, 7.2); room.add(g);
      Sign('CÁPSULAS DE ESCAPE  →', 'Cubierta 2 · sección 4', 1.9, 0.46, LEFT_X + 0.22, 0.78, 6.8, Math.PI / 2, { k: 1.1, accent: '#ff6b6b' });
    }
    // ---- floor emblem at the front of the bridge
    {
      const t = canvasTex(1024, 512), g = t.ctx;
      g.globalAlpha = 0.5; drawEmblem(g, 230, 250, 1.6, '#7dd3fc'); g.globalAlpha = 1;
      g.fillStyle = 'rgba(125,211,252,.55)'; g.textBaseline = 'middle'; g.font = '800 120px system-ui'; g.letterSpacing = '14px'; g.fillText('HERD', 430, 210);
      g.font = '600 46px system-ui'; g.letterSpacing = '6px'; g.fillText('NCC-7104 · EXPLORACIÓN', 436, 320, 560);
      const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false }); m.color.setScalar(0.85);
      // front left, clear of the dais lines and the cut-away edge
      const d = Pl(3.74, 1.87, m, -7.5, 0.013, 7.5, 0, -Math.PI / 2); d.rotation.set(-Math.PI / 2, 0, 0.12);
    }
    // ---- the open floor: a lit trench in front of the desks, data lines from each desk to the dais, deck hatches
    {
      const fl = my.floorG = new THREE.Group(); room.add(fl);
      // trench: a dark recess with a grating and lit lips (follows the front aisle, see tick)
      const gt = canvasTex(1024, 32), gg = gt.ctx; gg.fillStyle = '#05080e'; gg.fillRect(0, 0, 1024, 32);
      for (let x = 0; x < 1024; x += 8) { gg.fillStyle = 'rgba(120,150,190,.22)'; gg.fillRect(x, 4, 3, 24); }
      for (let x = 0; x < 1024; x += 128) { gg.fillStyle = 'rgba(56,214,255,.85)'; gg.fillRect(x + 60, 12, 8, 8); }
      gt.tex.wrapS = THREE.RepeatWrapping; gt.tex.repeat.set(6, 1);
      const tm = new THREE.MeshBasicMaterial({ map: gt.tex, toneMapped: false }); tm.color.setScalar(0.9);
      const tr = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 0.36), tm); tr.rotation.x = -Math.PI / 2; tr.position.set(-0.9, 0.006, 0); fl.add(tr);
      B(21.6, 0.012, 0.025, G(CYAN, 1.6), -0.9, 0.008, -0.19, { to: fl }); B(21.6, 0.012, 0.025, G(CYAN, 1.2), -0.9, 0.008, 0.19, { to: fl });
      for (const ex of [-11.7, 9.9]) B(0.06, 0.02, 0.4, M.mid, ex, 0.01, 0, { to: fl });
      // data lines: a pulse runs from each front-row desk to the dais (rebuilt when the desks move)
      const pt = canvasTex(16, 256), pg = pt.ctx, pgr = pg.createLinearGradient(0, 0, 0, 256);
      pgr.addColorStop(0, 'rgba(56,214,255,.12)'); pgr.addColorStop(0.8, 'rgba(56,214,255,.12)'); pgr.addColorStop(0.92, 'rgba(160,240,255,1)'); pgr.addColorStop(1, 'rgba(56,214,255,.12)');
      pg.fillStyle = pgr; pg.fillRect(0, 0, 16, 256); pt.tex.wrapT = THREE.RepeatWrapping; my.lineTex = pt.tex;
      const lg = new THREE.PlaneGeometry(0.05, 1); lg.rotateX(-Math.PI / 2);
      my.lines = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ map: pt.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 16);
      my.lines.count = 0; my.lines.frustumCulled = false; my.linesKey = ''; room.add(my.lines);
      const nub = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), G(CYAN, 1.8), 16); nub.count = 0; my.lineNubs = nub; room.add(nub);
      // deck hatches and flush floor read-outs, breaking the repeat of the plates
      const ht = canvasTex(256, 256), hg = ht.ctx;
      hg.fillStyle = '#0b1019'; hg.fillRect(0, 0, 256, 256); hg.strokeStyle = '#2b3445'; hg.lineWidth = 6; hg.strokeRect(6, 6, 244, 244);
      hg.fillStyle = '#0a0f17'; hg.fillRect(26, 26, 204, 204);
      for (let y = 34; y < 222; y += 14) for (let x = 34 + ((y / 14) % 2) * 7; x < 222; x += 14) { hg.fillStyle = '#2c3648'; hg.beginPath(); hg.arc(x, y, 4.5, 0, TAU); hg.fill(); }
      hg.fillStyle = '#38d6ff'; for (const [x, y] of [[14, 14], [242, 14], [14, 242], [242, 242]]) { hg.beginPath(); hg.arc(x, y, 5, 0, TAU); hg.fill(); }
      hg.fillStyle = 'rgba(253,224,71,.6)'; hg.font = '700 15px system-ui'; hg.fillText('ACCESO · EPS', 30, 248);
      const hatchM = new THREE.MeshBasicMaterial({ map: ht.tex, toneMapped: false }); hatchM.color.setScalar(0.85);
      const HATCH = [[-6.6, 0.9, 0], [2.6, 1.3, 0.3], [6.4, 3.6, 0], [-4.6, 8.2, 0.15], [0.9, 8.2, 0], [7.4, 8.2, -0.2], [-9.6, 2.9, 0], [6.6, 0.4, 0]];
      const hi = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2), hatchM, HATCH.length), m4 = new THREE.Matrix4();
      HATCH.forEach(([x, z, ry], i) => { m4.makeRotationY(ry).setPosition(x, 0.009, z); hi.setMatrixAt(i, m4); });
      room.add(hi);
      const READ = [[-3.6, 0.0, 0.0], [4.7, 2.4, -0.5], [-6.2, 5.4, 0.4]];
      const ri = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.45).rotateX(-Math.PI / 2), screen(roA.tex, 0.55), READ.length);
      READ.forEach(([x, z, ry], i) => { m4.makeRotationY(ry).setPosition(x, 0.011, z); ri.setMatrixAt(i, m4); });
      room.add(ri);
      const rim2 = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.0, 0.55).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a2232 }), READ.length);
      READ.forEach(([x, z, ry], i) => { m4.makeRotationY(ry).setPosition(x, 0.0095, z); rim2.setMatrixAt(i, m4); });
      room.add(rim2);
    }
    // ---- maintenance drone (wanders the open floor, hovering)
    {
      // a flat saucer: hull, a dome, a cyan eye strip at the front, a lit underside and a soft cone of light to the deck
      const d = my.drone = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.09, 32), M.light); hull.castShadow = true; d.add(hull);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.05, 32), M.mid); lid.position.y = -0.07; d.add(lid);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 10, 0, TAU, 0, Math.PI / 2), M.dark); dome.position.y = 0.04; dome.scale.y = 0.6; d.add(dome);
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.323, 0.323, 0.022, 32, 1, true, -0.55, 1.1), G(CYAN, 2.4)); d.add(eye);
      const under = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), G(0x9be8ff, 1.5)); under.rotation.x = Math.PI / 2; under.position.y = -0.096; d.add(under);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI; const n = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), G(i ? 0xff5c5c : 0x4ade80, 2)); n.position.set(Math.sin(a) * 0.3, -0.03, Math.cos(a) * 0.3); d.add(n); }
      const ct = canvasTex(8, 128), cg = ct.ctx, gr = cg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(150,225,255,.16)'); gr.addColorStop(1, 'rgba(150,225,255,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 8, 128);
      const cone = my.droneCone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.7, 1, 24, 1, true), new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      scene.add(cone);
      const spot = my.droneSpot = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(150,225,255,.35)'], [1, 'rgba(150,225,255,0)']], 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      spot.rotation.x = -Math.PI / 2; spot.position.y = 0.016; scene.add(spot);
      d.position.set(-2.5, 2.9, 0); my.droneDir = 0.7; my.droneH = 2.95;
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
    { // a display pylon instead of easel legs: two stanchions with light strips over the legs, a plinth, lit edges
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

  // ---------------------------------------------------------------- desks: bridge stations
  station(k, st) {
    const p = st.props, { M, G, B, Pl } = k.my, DZ = k.C.DESK_Z, g = st.group;
    const color = new THREE.Color(st.agent && st.agent.color ? st.agent.color : CYAN);
    p.mats.wood.color.set(0x252c38); p.mats.wood.metalness = 0.6; p.mats.wood.roughness = 0.34;
    p.mats.frame.color.set(0x1a202b); p.mats.frame.metalness = 0.5; p.mats.frame.roughness = 0.45;
    p.mats.steel.color.set(0x0f1218); p.mats.steel.metalness = 0.85;
    p.lamp.visible = false; p.laptop.visible = false;
    for (const m of p.plant) m.visible = false;
    for (const m of p.pens) m.visible = false;
    for (const m of p.mug) m.material = M.chrome;
    for (const m of p.books) m.material = M.dark;
    p.mat.material = k.my.roBm; // the desk surface is a lit keypad
    p.bezel.material = k.mat(0x0d1119, { roughness: 0.32, metalness: 0.75 });
    p.chair.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0x23283a) o.material = M.dark; });
    // PADD on the stack of books
    const pad = Pl(0.26, 0.17, k.my.roAm, -0.96, 1.228, DZ + 0.21, 0, -Math.PI / 2, g); pad.rotation.set(-Math.PI / 2, 0, 0.1);
    // holo display on the desk in the owner's colour (projector bar + a low, tilted translucent screen that stays
    // under the face and chest)
    B(0.7, 0.05, 0.1, M.mid, 0, 1.065, DZ - 0.5, { to: g });
    B(0.64, 0.012, 0.02, k.glow(color, 2.2), 0, 1.095, DZ - 0.5, { to: g });
    if (!k.my.holoTex) { const t = canvasTex(256, 128), c = t.ctx; c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, 0, 256, 128); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.strokeRect(2, 2, 252, 124);
      c.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 7; i++) c.fillRect(14, 16 + i * 15, 40 + ((i * 53) % 150), 6); c.fillRect(200, 16, 40, 40); k.my.holoTex = t.tex; }
    const hm = new THREE.MeshBasicMaterial({ map: k.my.holoTex, color: color.clone().lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(1.1), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const holo = Pl(0.6, 0.28, hm, 0, 1.2, DZ - 0.48, 0, 0.55, g); holo.renderOrder = 2;
    // the card tray (working information, left as it is) gets a lit outline: it reads as an input panel
    for (const [w, d, x, z] of [[0.62, 0.02, 0, -0.235], [0.62, 0.02, 0, 0.235], [0.02, 0.47, -0.305, 0], [0.02, 0.47, 0.305, 0]]) B(w, 0.012, d, G(CYAN, 1.7), 0.42 + x, 1.047, DZ + 0.38 + z, { to: g });
    // lit edges of the console
    B(2.9, 0.025, 0.03, G(CYAN, 2.0), 0, 1.045, DZ + 0.76, { to: g });
    B(0.03, 0.025, 1.4, G(CYAN, 1.6), -1.5, 1.045, DZ, { to: g }); B(0.03, 0.025, 1.4, G(CYAN, 1.6), 1.5, 1.045, DZ, { to: g });
  },

  plate(ctx, p) {
    ctx.fillStyle = '#081120'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 128, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(56,214,255,.5)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.roundRect(10, 10, 30, 108, 12); ctx.fill();
    ctx.fillStyle = '#e8f6ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 44px system-ui'; ctx.fillText(p.name, 276, 48, 440);
    ctx.fillStyle = '#7dd3fc'; ctx.font = '600 28px system-ui'; ctx.fillText(p.title || '', 276, 96, 440);
  },

  // ---------------------------------------------------------------- uniforms by division
  outfit(k, ch, a) {
    const role = a && a.role, div = divisionOf(role), M = ch.mats;
    M.shirt.color.set(DIVISION[div]); M.shirt.roughness = 0.7;
    M.shirtDark.color.set(0x0d0f14); M.pants.color.set(0x111319); M.pants.roughness = 0.75;
    const black = new THREE.MeshStandardMaterial({ color: 0x0f1116, roughness: 0.65 });
    const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.265, 28, 12, 0, TAU, 0, 1.32), black);
    yoke.position.y = 0.5; yoke.scale.set(1.21, 1.02, 0.86);
    ch.wear(ch.upper, yoke);
    // the badge: a gold arrowhead over a silver oval
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 1, emissive: 0x3a2a00 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc9d1dc, roughness: 0.25, metalness: 1 });
    const oval = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), silver); oval.rotation.x = Math.PI / 2; oval.scale.set(1.3, 1, 0.8); oval.position.set(0.14, 0.55, 0.225);
    const sh = new THREE.Shape(); sh.moveTo(0, 0.07); sh.lineTo(0.042, -0.05); sh.lineTo(0, -0.025); sh.lineTo(-0.042, -0.05); sh.closePath();
    const delta = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), gold); delta.position.set(0.14, 0.555, 0.226);
    ch.wear(ch.upper, oval); ch.wear(ch.upper, delta);
    // rank pips on the collar
    const pips = pipsOf(role);
    for (let i = 0; i < pips; i++) {
      const ang = 0.55 + i * 0.22, pip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10), gold);
      pip.rotation.x = Math.PI / 2; pip.position.set(-Math.sin(ang) * 0.2, 0.62, Math.cos(ang) * 0.2 * 0.86 + 0.02);
      ch.wear(ch.upper, pip);
    }
    if (/superadmin/i.test(role || '')) for (const arm of [ch.armL, ch.armR]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.014, 6, 18), gold); b.rotation.x = Math.PI / 2; b.position.y = -0.36; ch.wear(arm, b); }
    // headsets for operations and science
    if (div === 'operaciones' || div === 'ciencias') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.014, 6, 28, Math.PI), black); band.position.set(0, 0.02, -0.02);
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), black); ear.rotation.z = Math.PI / 2; ear.position.set(0.33, 0.0, 0.0);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), black); boom.position.set(0.3, -0.12, 0.13); boom.rotation.set(0.9, 0, 0.25);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), k.glow(div === 'ciencias' ? 0x7dd3fc : AMBER, 2));
      tip.position.set(0.23, -0.2, 0.26);
      for (const m of [band, ear, boom, tip]) ch.wear(ch.head, m);
    }
  },

  // ---------------------------------------------------------------- light: space at any hour, a night shift
  daylight(k, f) {
    const { scene, hemi, sun, my } = k;
    scene.background = new THREE.Color(0x010309);
    scene.fog = null;
    const q = 0.6 + 0.4 * sstep(0.1, 0.5, f); // the night shift: about 60 % of the day's fill
    scene.environmentIntensity = (0.5 + f * 0.25) * q * q;
    hemi.intensity = (0.75 + f * 0.45) * q; hemi.color.set(f < 0.35 ? 0x97a3cc : 0xa9bcff); hemi.groundColor.set(0x241c2a);
    sun.intensity = (1.25 + f * 0.75) * q; sun.color.set(0xdfe8ff); sun.position.set(-7, 18, 9);
    const night = f < 0.35, was = my.night;
    my.night = night;
    if (my.rim) { my.rim.intensity = night ? 0.6 : 0.8; my.rim.color.set(night ? 0x5368c8 : 0x7f9cff); }
    if (my.daisLight) my.daisLight.intensity = night ? 7 : 6;
    // lit trim leans to a deeper blue at night (cool colours only: amber, red and green keep their meaning)
    if (my.G && was !== night) {
      for (const m of my.glows.values()) {
        const b = m.userData.base || (m.userData.base = m.color.clone());
        m.color.copy(b); if (night && b.b > b.r * 1.5) m.color.multiply(my.nightTint || (my.nightTint = new THREE.Color(0.5, 0.68, 1.0)));
      }
    }
    if (my.shift && was !== night) { paintShift(my.shift.ctx, night); my.shift.tex.needsUpdate = true; my.shiftMat.color.setScalar(night ? 1.25 : 0.85); }
  },

  // ---------------------------------------------------------------- animation (cheap: no allocation)
  layout(k) { // the decor's empty captain's chair gives way to the centre desk when someone sits there
    if (k.my.captainChair) k.my.captainChair.visible = !k.centre();
  },
  tick(k, dt, t) {
    const my = k.my;
    if (my.planet) { my.planet.rotation.y += dt * 0.012; my.planet.material.uniforms.shift.value = (t * 0.0025) % 1; }
    if (my.moon) my.moon.rotation.y += dt * 0.004;
    if (my.stars) { my.stars.position.copy(k.camera.position); my.stars.rotation.y += dt * 0.0012; }
    if (my.holo) {
      my.holo.children[0].rotation.y += dt * 0.35; my.holo.children[1].rotation.y -= dt * 0.12;
      my.holoOrbit.rotation.y += dt * 0.6; my.holoShip.rotation.y = Math.PI;
      my.holoScan.position.y = Math.sin(t * 0.9) * 0.5; my.holoScan.scale.setScalar(Math.sqrt(Math.max(0.02, 1 - (my.holoScan.position.y / 0.6) ** 2)));
      my.holoLight.intensity = 4 + Math.sin(t * 7) * 0.3;
    }
    if (my.coreTex) {
      my.coreTex.offset.y = (my.coreTex.offset.y - dt * 0.45) % 1;
      const n = my.coreRings.length;
      for (let i = 0; i < n; i++) { const v = 0.6 + 1.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.6 - i * 0.7), 4); my.coreRings[i].material.color.setRGB(0.44 * v, 0.76 * v, 1.0 * v); }
      my.coreLight.intensity = 20 + Math.sin(t * 2.6) * 4;
    }
    if (my.running) {
      const c = my.tmpC || (my.tmpC = new THREE.Color()), n = my.running.count;
      for (let i = 0; i < n; i++) { const v = 0.25 + 2.2 * Math.pow(Math.max(0, Math.cos((i * 0.35 - t * 3) % TAU)), 16); c.setRGB(v * 0.5, v * 0.85, v); my.running.setColorAt(i, c); }
      my.running.instanceColor.needsUpdate = true;
    }
    if (my.callLight) my.callLight.material.color.setRGB(1, 0.7, 0.28).multiplyScalar((t % 1.6) < 0.8 ? 2.2 : 0.3);
    // readouts, a few times a second
    my.uiAt = my.uiAt || 0;
    if (t - my.uiAt > (k.PHONE ? 0.5 : 0.2)) {
      my.uiAt = t;
      paintReadoutA(my.roA.ctx, t); my.roA.tex.needsUpdate = true; for (const x of my.animTex) x.needsUpdate = true;
      paintReadoutB(my.roB.ctx, t, 1); my.roB.tex.needsUpdate = true;
      paintRadar(my.radar.ctx, t); my.radar.tex.needsUpdate = true;
      if (my.keys) { const c = my.tmpK || (my.tmpK = new THREE.Color()), n = my.keys.count, s = Math.floor(t * (my.night ? 1.5 : 3)); for (let i = 0; i < n; i++) { const on = ((i * 7919 + s * 104729) % 13) < 4; c.copy(my.keyCols[i]).multiplyScalar(on ? (my.night ? 1.2 : 1.9) : (my.night ? 0.22 : 0.35)); my.keys.setColorAt(i, c); } my.keys.instanceColor.needsUpdate = true; }
    }
    // condition: amber when someone needs you (blocked), green otherwise; repainted once a second or while blinking
    my.stAt = my.stAt || -9;
    if (t - my.stAt > 1 || (my.alert && t - my.stAt > 0.1)) {
      my.stAt = t;
      let alert = false;
      for (const d of k.desks()) if (d.agent && d.agent.online !== false && d.agent.status === 'blocked') { alert = true; break; }
      my.alert = alert;
      paintStatus(my.status.ctx, t, alert, my.night); my.status.tex.needsUpdate = true;
      const pulse = Math.abs(Math.sin(t * 3)), v = alert ? 1.3 + pulse * 1.7 : 1.8;
      if (alert) my.alertMat.color.setRGB(1 * v, 0.62 * v, 0.1 * v); else if (my.night) my.alertMat.color.setRGB(0.12 * v, 0.5 * v, 1 * v); else my.alertMat.color.setRGB(0.22 * v, 0.84 * v, 1 * v);
      if (my.beaconMat) { const b = alert ? 0.7 + pulse * 1.0 : 0.2; my.beaconMat.color.setRGB(1 * b, 0.52 * b, 0.08 * b); }
    }
    if (my.lineTex) my.lineTex.offset.y = (my.lineTex.offset.y + dt * 0.35) % 1;
    my.flAt = my.flAt || -9;
    if (my.floorG && t - my.flAt > 1) {
      my.flAt = t;
      const fz = k.frontZ(), ds = k.desks();
      my.floorG.position.z = fz + 1.0;
      let front = 0; for (const d of ds) front = Math.max(front, d.row || 0);
      let key = `${fz}`; for (const d of ds) if ((d.row || 0) === front) key += `,${d.x.toFixed(2)}`;
      if (key !== my.linesKey) {
        my.linesKey = key;
        const m4 = my.tmpM || (my.tmpM = new THREE.Matrix4()), sv = my.tmpV || (my.tmpV = new THREE.Vector3());
        let n = 0;
        for (const d of ds) {
          if ((d.row || 0) !== front || n >= 16) continue;
          const sx = d.x, sz = fz + 1.3, dx = sx - -1.5, dz = sz - 4.2, l = Math.hypot(dx, dz) || 1, ex = -1.5 + (dx / l) * 3.5, ez = 4.2 + (dz / l) * 3.5;
          const L = Math.hypot(ex - sx, ez - sz); if (L < 0.3) continue;
          m4.makeRotationY(Math.atan2(ex - sx, ez - sz)).scale(sv.set(1, 1, L)).setPosition((sx + ex) / 2, 0.01, (sz + ez) / 2);
          my.lines.setMatrixAt(n, m4);
          m4.makeTranslation(sx, 0.01, sz); my.lineNubs.setMatrixAt(n, m4);
          n++;
        }
        my.lines.count = n; my.lineNubs.count = n;
        my.lines.instanceMatrix.needsUpdate = true; my.lineNubs.instanceMatrix.needsUpdate = true;
      }
    }
    // the replicator makes a cup now and then
    if (my.replSpark) { const c = t % 14, on = c < 1.6; my.replSpark.material.opacity = on ? Math.sin((c / 1.6) * Math.PI) * 0.9 : 0; my.replCup.visible = c > 0.8; }
    // transporter: a shimmer column every 22 s
    if (my.beam) {
      const c = t % 22, on = c < 3.5, a = on ? Math.sin((c / 3.5) * Math.PI) : 0;
      my.beam.material.opacity = a; my.beam.visible = a > 0.01;
      if (my.beam.visible) { const p = my.beam.geometry.attributes.position.array, b = my.beamBase; for (let i = 0; i < p.length; i += 3) p[i + 1] = 0.2 + ((b[i + 1] - 0.2 + t * (0.6 + my.beamSeeds[i / 3] * 0.8)) % 2.4); my.beam.geometry.attributes.position.needsUpdate = true; }
      for (let i = 0; i < my.padRings.length; i++) { const v = 1.2 + a * 2.2 + Math.sin(t * 2 + i) * 0.2; my.padRings[i].material.color.setRGB(0.6 * v, 0.9 * v, 1 * v); }
    }
    // the drone wanders the open floor at head height
    const d = my.drone;
    if (d) {
      d.position.x += Math.sin(my.droneDir) * dt * 0.8; d.position.z += Math.cos(my.droneDir) * dt * 0.8;
      // inside the open floor, clear of the holo table (x 3.8, z 6.3) and the whiteboard (right of x 7)
      const rz = Math.min(4.5, k.frontZ() + 1.5), hx = d.position.x - 3.8, hz = d.position.z - 6.3;
      if (d.position.x < -6 || d.position.x > 6.4 || d.position.z < rz || d.position.z > 7.0 || hx * hx + hz * hz < 2.1 * 2.1) {
        if (hx * hx + hz * hz < 2.1 * 2.1) { const l = Math.hypot(hx, hz) || 1; d.position.x = 3.8 + (hx / l) * 2.1; d.position.z = 6.3 + (hz / l) * 2.1; }
        d.position.x = Math.min(6.4, Math.max(-6, d.position.x)); d.position.z = Math.min(7.0, Math.max(rz, d.position.z));
        my.droneDir += 2 + Math.sin(t * 13.7) * 1.5;
      }
      d.position.y = my.droneH + Math.sin(t * 1.7) * 0.1; d.rotation.y = my.droneDir; d.rotation.z = Math.sin(t * 1.3) * 0.05;
      const h = d.position.y - 0.1;
      my.droneCone.position.set(d.position.x, h / 2, d.position.z); my.droneCone.scale.set(1, h, 1);
      my.droneSpot.position.x = d.position.x; my.droneSpot.position.z = d.position.z;
    }
  },
};

// hull material for a piece of the given size (kept here so decor can use it before shell ran in odd orders)
function hullMatOf(k, w, h) { return k.my.hullMat ? k.my.hullMat(w, h) : k.my.M.dark; }
