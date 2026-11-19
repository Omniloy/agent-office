// Hospital: Planta 3 of a bright, modern hospital: the medical director's central control station at the heart of
// the ward, a glass-walled operating theatre to one side, one clinical station per role along the back, and the
// "Cafetería de guardia" where the shift goes for a coffee. Everything is built here from three.js primitives and
// canvas-painted textures (no downloaded assets). The contract is in themes/index.js.
//
// What it builds:
//   shell    light speckled vinyl with coloured zones (operating theatre, cafeteria) and wayfinding lines, white walls
//            with a teal wainscot, bumper rail and gas trunking, clerestory windows with blinds, a lit cornice.
//   centre   "Dirección médica · Control central", the heart of the ward: a round two-step dais with lit rings and
//            the floor medallion; on it a C-shaped nurses' counter all round the director (flat front with the
//            nameplate and the lit name, "CONTROL CENTRAL" on its curved sides, open on the right where they walk
//            in), the ward status and ER triage screens turned out to the room, the chart rack, nurse-call panel and
//            printer; inside, the director's own desk with two monitors, the coat stand; two lit totems with glowing
//            crosses on the dais's rim.
//   stations one per role, each with its own body and its own floor bay (the service's name painted in front):
//            surgeon (a draped instrument table on castors, the sterile field falling to the floor, the Mayo stand
//            with instruments over it, a touch panel, the laparoscopy tower, a big surgical light on a boom),
//            radiology (a curved dark reading console round the seat with a lit edge, three diagnostic monitors in
//            an arc, a microscope and a dictation mic, a dark curved reading-room screen behind with two lit CT light
//            boxes), equipment technician (an open steel workbench, thick oak top, yellow front rail, a lower shelf of
//            equipment waiting for service, a magnifier lamp, a monitor open for repair, oscilloscope, soldering
//            station; the pegboard wall under a gantry of parts bins, a red tool chest), researcher (a lab bench
//            with a reagent shelf along its front, a plate reader, flasks, the freezer under it, the blue class II
//            biosafety cabinet behind the stool), head of service (a deep walnut bow-front desk on pedestals, on a
//            big rug, a banker's lamp, the bookcase wing, the coat stand), resident (skeleton, textbooks), clinical
//            committee (case files, flip chart), manager (walnut desk, hospital model), and a consulting desk for
//            anyone else. Status lights become nurse-call lamps; the wall screens get teal frames.
//   decor    operating theatre (glass partitions, sliding door, "QUIRÓFANO EN USO", table, lamps, anaesthesia
//            machine with live vitals, ESU, Mayo, back table, IV pole, C-arm, scrub trough, X-ray light box, OR
//            panel; while the surgeon works: a draped patient, a surgeon and a scrub nurse); Cafetería de guardia at
//            the coffee spot, its front to the room (counter, espresso machine with steam, grinder, cup tree,
//            pastries, fridge, shelves, chalk menu, pendant lamps, the lit sign on top, a high table and stools; the
//            staff notice board on its back); a patient on a stretcher waiting for theatre and a portable X-ray
//            behind it; the medication trolley along the theatre's glass; medicines cabinet, automated dispensing
//            cabinet, supply shelving, crash cart, linen cart, wheelchair, water cooler, waiting bench, signage in Spanish and a
//            pharmacy robot that follows the floor line. By day, sun shafts from the clerestory; at night warm pools
//            from the corridor's downlights and a glowing wayfinding line. The coffee mug in hand is a teal one, steaming.
//   layout   tall pieces of a desk (tower, gantry, pegboard, cabinet, shelves) show only where they cannot hide a
//            nameplate: the back row, and the centre with one row of desks. The theatre's light box and blade sign
//            show with one row only. A third row of desks (big teams, no centre) hides the theatre, the cafeteria
//            and the stretcher.
//   people   scrubs in the role colour with a surgical cap, white coats for the doctors in charge, a suit for the
//            manager, a work uniform and tool belt for the technician, goggles for the researcher; stethoscopes,
//            masks and gloves; ID badges; clogs. Visitors get a "VISITA" badge and shoe covers.
// Static meshes are merged per material (bake) after building, so the room costs a few hundred draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
// the coffee corner: people stand in front of the counter (z 4.5..5.15), turned to the room and the camera
const CAFE_DX = -0.45; // the café sits this far left of where it was built, clear of the whiteboard
const CAFE = { x: 4.95 + CAFE_DX, z: 6.0, yaw: -0.3 };

// ---------------------------------------------------------------- small helpers
function tex(k, w, h, draw) { const s = k.surface(w, h); draw(s.ctx, w, h); s.tex.needsUpdate = true; return s; }
function plane(w, h, material) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); }
function at(m, x, y, z, ry = 0) { m.position.set(x, y, z); if (ry) m.rotation.y = ry; return m; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function txt(c, s, x, y, font, color, align = 'left', base = 'middle') { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y); }
function fit(c, s, maxW, weight, size, min = 10) { let f = size; c.font = `${weight} ${f}px system-ui`; while (f > min && c.measureText(s).width > maxW) { f -= 1; c.font = `${weight} ${f}px system-ui`; } return `${weight} ${f}px system-ui`; }
function crossIcon(c, x, y, s, color) { c.fillStyle = color; c.fillRect(x - s / 6, y - s / 2, s / 3, s); c.fillRect(x - s / 2, y - s / 6, s, s / 3); }
const keep = (o) => { o.userData.keep = true; return o; };

// shared materials, made once per page
function M(k) {
  if (k.my.M) return k.my.M;
  const { mat } = k;
  const m = k.my.M = {
    white: mat(0xf5f8f9, { roughness: 0.36 }),
    offwhite: mat(0xe2e9ec, { roughness: 0.45 }),
    grey: mat(0xa3adb6, { roughness: 0.5 }),
    midgrey: mat(0x6b7785, { roughness: 0.5 }),
    dark: mat(0x27303a, { roughness: 0.45 }),
    black: mat(0x12161c, { roughness: 0.35 }),
    steel: mat(0xc6cdd4, { roughness: 0.28, metalness: 0.85 }),
    brushed: mat(0xc3cbd2, { roughness: 0.32, metalness: 0.75 }),
    chrome: mat(0xe8ecf0, { roughness: 0.12, metalness: 1 }),
    teal: mat(0x14a39a, { roughness: 0.4 }),
    tealDeep: mat(0x0f6f68, { roughness: 0.45 }),
    tealSoft: mat(0xbfe3dd, { roughness: 0.5 }),
    mint: mat(0xdcefeb, { roughness: 0.45 }),
    navyPad: mat(0x1d2b45, { roughness: 0.55 }),
    navy: mat(0x243a5e, { roughness: 0.6 }),
    drapeGreen: mat(0x3b9c8c, { roughness: 0.95 }),
    drapeBlue: mat(0x3d7fb8, { roughness: 0.95 }),
    red: mat(0xd62839, { roughness: 0.4 }),
    yellow: mat(0xf5c518, { roughness: 0.45 }),
    orange: mat(0xf08a24, { roughness: 0.45 }),
    rubber: mat(0x1b1f24, { roughness: 0.9 }),
    sheet: mat(0xf7f9fa, { roughness: 0.9 }),
    blanket: mat(0x8fb8de, { roughness: 0.95 }),
    oak: mat(0xd2b183, { roughness: 0.5 }),
    walnut: mat(0x6e4a32, { roughness: 0.42 }),
    walnutDark: mat(0x4a3022, { roughness: 0.5 }),
    leather: mat(0x2b211d, { roughness: 0.55 }),
    resin: mat(0x232c33, { roughness: 0.3 }),
    labTop: mat(0xd9e1e4, { roughness: 0.3 }),
    esd: mat(0x3e6d8f, { roughness: 0.85 }),
    cork: mat(0xc49a6c, { roughness: 0.95 }),
    bone: mat(0xeee3cc, { roughness: 0.6 }),
    leaf1: mat(0x2f9e62, { roughness: 0.6 }), leaf2: mat(0x3bb273, { roughness: 0.6 }), leaf3: mat(0x268752, { roughness: 0.6 }),
    soil: mat(0x4a3526, { roughness: 1 }),
    pot: mat(0xe9e2d6, { roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xd9eef5, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false }),
    pane: new THREE.MeshStandardMaterial({ color: 0xcfeff0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
    frost: new THREE.MeshStandardMaterial({ color: 0xf4fbfb, roughness: 0.6, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
    clear: new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }),
    fluid: new THREE.MeshStandardMaterial({ color: 0xcfe9ff, roughness: 0.1, transparent: true, opacity: 0.75 }),
    glowWhite: k.glow(0xf4fbff, 1.7),
    glowWarm: k.glow(0xffe2b8, 2.2),
    glowGreen: k.glow(0x22c55e, 1.8),
    glowRed: k.glow(0xff2a3d, 1.9),
    glowAmber: k.glow(0xffb020, 2.0),
    glowCyan: k.glow(0x38e1ff, 1.8),
    glowTeal: k.glow(0x2de0c8, 1.7),
    glowUV: k.glow(0xb9dcff, 1.6),
  };
  return m;
}

// a cached plain material: the same colour and options give the same material, so baking can merge them
function mc(k, color, o) {
  const cache = k.my.mcache || (k.my.mcache = new Map());
  const key = `${typeof color === 'object' ? color.getHex() : color}|${o ? JSON.stringify(o) : ''}`;
  let m = cache.get(key);
  if (!m) cache.set(key, m = k.mat(color, o));
  return m;
}

// Meshes builders bound to a parent: b.box(w, h, d, m, x, y, z, { r, cast, rx, ry, rz }), b.cyl(rt, rb, h, m, x, y, z, o)
function kit(k, parent) {
  const box = (w, h, d, m, x, y, z, o = {}) => {
    const b = k.box(w, h, d, 0, { m, x, y, z, r: o.r || 0, cast: o.cast !== undefined ? o.cast : (w * h * d > 0.02) });
    if (o.rx) b.rotation.x = o.rx; if (o.ry) b.rotation.y = o.ry; if (o.rz) b.rotation.z = o.rz;
    (o.to || parent).add(b); return b;
  };
  const cyl = (rt, rb, h, m, x, y, z, o = {}) => {
    const c = k.cyl(rt, rb, h, 0, { m, x, y, z, seg: o.seg || 20 });
    c.castShadow = o.cast !== undefined ? o.cast : (rb * h > 0.03);
    if (o.rx) c.rotation.x = o.rx; if (o.rz) c.rotation.z = o.rz; if (o.ry) c.rotation.y = o.ry;
    (o.to || parent).add(c); return c;
  };
  const rod = (a, b, r, m, to) => { const x = k.rod(new THREE.Vector3(...a), new THREE.Vector3(...b), r, m); x.castShadow = r > 0.02; (to || parent).add(x); return x; };
  const sph = (r, m, x, y, z, o = {}) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, o.seg || 14, o.seg2 || 10), m); s.position.set(x, y, z); if (o.sx) s.scale.set(o.sx, o.sy || o.sx, o.sz || o.sx); s.castShadow = o.cast !== undefined ? o.cast : r > 0.06; (o.to || parent).add(s); return s; };
  const grp = (x = 0, y = 0, z = 0, ry = 0, to) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; (to || parent).add(g); return g; };
  const caster = (x, z, to) => { const M_ = M(k); cyl(0.012, 0.012, 0.06, M_.steel, x, 0.1, z, { cast: false, to }); cyl(0.045, 0.045, 0.03, M_.rubber, x, 0.05, z, { rz: Math.PI / 2, cast: false, seg: 12, to }); };
  const sign = (w, h, s, { lit = 0, rough = 0.45, to } = {}) => {
    const mm = lit ? new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false, color: new THREE.Color(lit, lit, lit) }) : new THREE.MeshStandardMaterial({ map: s.tex, roughness: rough });
    const p = plane(w, h, mm); (to || parent).add(p); return p;
  };
  const screen = (w, h, s, lit = 1.25, to) => sign(w, h, s, { lit, to });
  const plant = (x, z, s = 1, to) => { // a potted plant: pot, soil and a bunch of long leaves
    const M_ = M(k), g = grp(x, 0, z, 0, to);
    cyl(0.26 * s, 0.2 * s, 0.5 * s, M_.pot, 0, 0.25 * s, 0, { to: g }); cyl(0.24 * s, 0.24 * s, 0.02, M_.soil, 0, 0.49 * s, 0, { to: g, cast: false });
    for (let i = 0; i < 9; i++) { const l = sph(0.3 * s, [M_.leaf1, M_.leaf2, M_.leaf3][i % 3], Math.cos(i * 0.7) * 0.18 * s, (0.85 + (i % 3) * 0.2) * s, Math.sin(i * 0.7) * 0.18 * s, { sx: 0.42, sy: 1.5, sz: 0.42, seg: 9, seg2: 7, to: g, cast: true }); l.rotation.set(Math.sin(i * 1.7) * 0.6, i, Math.cos(i * 0.7) * -0.55); }
    return g;
  };
  const add = (...o) => { parent.add(...o); return o[0]; };
  return { box, cyl, rod, sph, grp, caster, sign, screen, plant, add };
}

// Merge every static mesh under `root` into one mesh per material (positions baked in root's own space). Things
// marked keep (and their children), hidden things and multi-material meshes stay as they are.
function bake(root) {
  root.updateMatrixWorld(true);
  const _inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), _mm = new THREE.Matrix4(); // per call: kept groups are baked from inside this one
  const buckets = new Map();
  const visit = (o) => {
    if (o !== root && !o.visible) return;
    if (o.userData.keep) { if (o !== root && !o.isMesh && !o.isSprite) bake(o); if (o !== root) return; } // a kept group moves as one: merge inside it
    if (o.isMesh && !o.children.length && !Array.isArray(o.material) && !o.isInstancedMesh && o.geometry && o.geometry.attributes.position) {
      const key = `${o.castShadow ? 1 : 0}|${o.renderOrder || 0}`; // by the material object itself (uuids need Math.random)
      let byMat = buckets.get(o.material);
      if (!byMat) buckets.set(o.material, byMat = new Map());
      let b = byMat.get(key);
      if (!b) byMat.set(key, b = { m: o.material, cast: o.castShadow, ro: o.renderOrder || 0, geos: [], meshes: [] });
      const g = o.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
      g.morphAttributes = {}; g.clearGroups();
      g.applyMatrix4(_mm.multiplyMatrices(_inv, o.matrixWorld));
      b.geos.push(g); b.meshes.push(o);
    }
    for (const c of o.children.slice()) visit(c);
  };
  visit(root);
  for (const b of [...buckets.values()].flatMap((x) => [...x.values()])) {
    if (b.meshes.length < 2) { b.geos.forEach((g) => g.dispose()); continue; }
    let geo = null;
    try { geo = mergeGeometries(b.geos, false); } catch { geo = null; }
    b.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.m); mesh.castShadow = b.cast; mesh.receiveShadow = true; mesh.renderOrder = b.ro;
    root.add(mesh);
    for (const o of b.meshes) { o.parent.remove(o); o.geometry.dispose(); }
  }
  return root;
}

// A scrolling physiological trace like on a bedside monitor: the line is drawn left to right and a gap runs
// ahead of it, erasing the old sweep. bands: [{ y0, y1, fn(t), color }]. Only the new columns are drawn.
function sweeper(ctx, x0, x1, bands, speed) {
  const st = { x: x0, t: -1, last: bands.map(() => null) };
  return (t) => {
    if (st.t < 0) { st.t = t; return; }
    const n = Math.min(160, Math.floor((t - st.t) * speed / 2));
    if (n <= 0) return;
    for (let i = 0; i < n; i++) {
      st.t += 2 / speed; st.x += 2;
      if (st.x >= x1) { st.x = x0; st.last = bands.map(() => null); }
      bands.forEach((b, j) => {
        ctx.fillStyle = b.bg || '#02070b'; ctx.fillRect(st.x, b.y0, 14, b.y1 - b.y0);
        const y = b.y1 - 6 - b.fn(st.t) * (b.y1 - b.y0 - 12);
        const p = st.last[j];
        if (p) { ctx.strokeStyle = b.color; ctx.lineWidth = b.w || 2.6; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(st.x, y); ctx.stroke(); }
        st.last[j] = [st.x, y];
      });
    }
  };
}
const ecgWave = (t, bpm = 72) => { const p = (t * bpm / 60) % 1; return 0.32 + 0.1 * gauss(p, 0.14, 0.025) - 0.1 * gauss(p, 0.265, 0.008) + 0.68 * gauss(p, 0.29, 0.011) - 0.22 * gauss(p, 0.315, 0.01) + 0.17 * gauss(p, 0.52, 0.045); };
const plethWave = (t) => { const p = ((t * 1.2) - 0.18) % 1; const q = p < 0 ? p + 1 : p; return 0.08 + 0.85 * gauss(q, 0.3, 0.09) + 0.25 * gauss(q, 0.58, 0.07); };
const capnoWave = (t) => { const p = (t / 3.75) % 1; return 0.06 + 0.82 * (Math.min(1, Math.max(0, (p - 0.05) / 0.08)) * (1 - Math.min(1, Math.max(0, (p - 0.55) / 0.05)))) * (0.88 + 0.12 * p); };
const scopeWave = (t) => 0.5 + 0.34 * Math.sin(t * 9) * Math.exp(-((t * 1.3) % 1) * 2.2) + 0.08 * Math.sin(t * 47);

// ---------------------------------------------------------------- canvas paintings
function paintVitalsFrame(c) {
  c.fillStyle = '#02070b'; c.fillRect(0, 0, 512, 320);
  c.fillStyle = '#0b1a24'; c.fillRect(0, 0, 512, 26);
  txt(c, 'QUIRÓFANO 1 · ADULTO', 10, 13, '600 15px system-ui', '#8fb6c9');
  txt(c, 'ALARMAS ON', 502, 13, '600 14px system-ui', '#39ff88', 'right');
  txt(c, 'II', 6, 40, '600 14px system-ui', '#39ff88');
  txt(c, 'Pleth', 6, 132, '600 14px system-ui', '#3fe0ff');
  txt(c, 'CO₂', 6, 224, '600 14px system-ui', '#ffd23f');
  c.strokeStyle = '#123040'; c.lineWidth = 1; c.beginPath(); c.moveTo(340, 26); c.lineTo(340, 320); c.stroke();
}
function paintVitalsNumbers(c, hr, spo2, rr_) {
  c.fillStyle = '#02070b'; c.fillRect(342, 28, 170, 292);
  txt(c, 'FC', 350, 44, '600 15px system-ui', '#39ff88'); txt(c, String(hr), 504, 76, '700 54px system-ui', '#39ff88', 'right');
  txt(c, 'SpO₂', 350, 120, '600 15px system-ui', '#3fe0ff'); txt(c, String(spo2), 504, 150, '700 46px system-ui', '#3fe0ff', 'right');
  txt(c, 'PNI', 350, 192, '600 15px system-ui', '#f2f5f7'); txt(c, '118/76', 504, 216, '700 30px system-ui', '#f2f5f7', 'right');
  txt(c, '(90)', 504, 242, '500 16px system-ui', '#a9b6bf', 'right');
  txt(c, 'EtCO₂', 350, 270, '600 15px system-ui', '#ffd23f'); txt(c, String(rr_), 504, 296, '700 34px system-ui', '#ffd23f', 'right');
  txt(c, 'T 36,6°', 350, 304, '600 14px system-ui', '#c4a7ff');
}

function paintLed(c) {
  c.fillStyle = '#2d333b'; c.fillRect(0, 0, 256, 256);
  for (let r = 0; r <= 4; r++) {
    const n = r ? r * 6 : 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r * 0.3, x = 128 + Math.cos(a) * r * 25, y = 128 + Math.sin(a) * r * 25;
      const g = c.createRadialGradient(x, y, 1, x, y, 11);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#fff2d6'); g.addColorStop(1, '#5d564b');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill();
    }
  }
}

function paintFloor(c) {
  c.fillStyle = '#aec3bc'; c.fillRect(0, 0, 1024, 1024); // sage-grey vinyl: the white furniture stands out on it
  const tones = ['rgba(90,120,116,.30)', 'rgba(250,252,250,.55)', 'rgba(60,96,98,.18)', 'rgba(170,196,190,.5)', 'rgba(20,140,130,.14)', 'rgba(255,250,240,.35)'];
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 30000; i++) { c.fillStyle = tones[i % tones.length]; const r = 0.9 + rnd() * 2.0; c.fillRect(rnd() * 1024, rnd() * 1024, r, r); }
  for (let i = 0; i < 60; i++) {
    const x = rnd() * 1024, y = rnd() * 1024, r = 40 + rnd() * 120, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rnd() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(60,100,100,.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.strokeStyle = 'rgba(60,95,95,.22)'; c.lineWidth = 2;
  for (let x = 0; x < 1024; x += 256) { c.beginPath(); c.moveTo(x + 1, 0); c.lineTo(x + 1, 1024); c.stroke(); c.beginPath(); c.moveTo(0, x + 1); c.lineTo(1024, x + 1); c.stroke(); }
}
function paintWoodFloor(c, W, H) {
  c.fillStyle = '#b98a5c'; c.fillRect(0, 0, W, H);
  let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const plank = 64;
  for (let y = 0; y < H; y += plank) {
    let x = -rnd() * 200;
    while (x < W) {
      const len = 180 + rnd() * 220, tone = 150 + rnd() * 50;
      c.fillStyle = `rgb(${tone + 40},${tone - 2},${tone - 50})`; c.fillRect(x, y, len, plank);
      c.strokeStyle = 'rgba(80,50,25,.12)'; c.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) { const yy = y + 8 + i * 11 + rnd() * 4; c.beginPath(); c.moveTo(x, yy); c.bezierCurveTo(x + len * 0.3, yy + rnd() * 6 - 3, x + len * 0.6, yy + rnd() * 6 - 3, x + len, yy); c.stroke(); }
      c.fillStyle = 'rgba(60,35,15,.45)'; c.fillRect(x, y, 2, plank);
      x += len;
    }
    c.fillStyle = 'rgba(60,35,15,.5)'; c.fillRect(0, y, W, 2);
  }
}

function paintOrZone(c, W, H) {
  c.clearRect(0, 0, W, H);
  c.strokeStyle = '#d62839'; c.lineWidth = 18; rr(c, 30, 30, W - 60, H - 60, 26); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 5; c.setLineDash([26, 18]); rr(c, 58, 58, W - 116, H - 116, 18); c.stroke(); c.setLineDash([]);
  const t = 'ZONA ESTÉRIL · NO PASAR SIN MASCARILLA';
  const f = fit(c, t, W - 200, 800, 40, 20);
  txt(c, t, W / 2, H - 92, f, 'rgba(150,20,35,.85)', 'center');
}

function paintXray(c) {
  c.fillStyle = '#eef6ff'; c.fillRect(0, 0, 512, 352);
  const film = (x0, draw, label) => {
    c.fillStyle = '#04070c'; c.fillRect(x0, 16, 232, 320);
    c.save(); c.beginPath(); c.rect(x0, 16, 232, 320); c.clip(); draw(x0); c.restore();
    txt(c, label, x0 + 10, 30, '600 13px system-ui', 'rgba(255,255,255,.75)');
    txt(c, 'R', x0 + 212, 48, '800 22px system-ui', 'rgba(255,255,255,.85)', 'center');
  };
  film(16, (x0) => chestFilm(c, x0 + 116, 0), 'TÓRAX PA');
  film(264, (x0) => {
    const cx = x0 + 116;
    c.fillStyle = 'rgba(140,150,165,.35)'; c.beginPath(); c.ellipse(cx, 180, 70, 170, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(232,238,246,.85)';
    c.beginPath(); c.moveTo(cx - 26, 20); c.lineTo(cx + 22, 20); c.lineTo(cx + 34, 150); c.quadraticCurveTo(cx, 186, cx - 38, 150); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx - 34, 196); c.quadraticCurveTo(cx, 180, cx + 32, 196); c.lineTo(cx + 22, 340); c.lineTo(cx - 22, 340); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(cx + 52, 160, 14, 26, 0.2, 0, TAU); c.fill();
    c.fillStyle = 'rgba(120,200,255,.9)'; c.fillRect(cx - 4, 120, 8, 120);
    for (let i = 0; i < 8; i++) c.fillRect(cx - 9, 126 + i * 14, 18, 3);
  }, 'RODILLA LAT');
}
function chestFilm(c, cx, y0) {
  const lung = (sx) => { const g = c.createRadialGradient(cx + sx * 52, y0 + 170, 10, cx + sx * 52, y0 + 170, 90); g.addColorStop(0, 'rgba(40,52,70,.9)'); g.addColorStop(1, 'rgba(120,130,150,.25)'); c.fillStyle = g; c.beginPath(); c.ellipse(cx + sx * 52, y0 + 175, 46, 100, sx * -0.08, 0, TAU); c.fill(); };
  c.fillStyle = 'rgba(150,160,175,.35)'; c.beginPath(); c.ellipse(cx, y0 + 180, 112, 150, 0, 0, TAU); c.fill();
  lung(-1); lung(1);
  c.fillStyle = 'rgba(220,228,236,.55)'; c.beginPath(); c.ellipse(cx + 18, y0 + 225, 44, 54, 0.3, 0, TAU); c.fill();
  c.fillStyle = 'rgba(235,240,245,.8)'; c.fillRect(cx - 7, y0 + 40, 14, 300);
  c.strokeStyle = 'rgba(235,240,248,.7)'; c.lineWidth = 6;
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx + sx * 8, y0 + 70); c.quadraticCurveTo(cx + sx * 60, y0 + 54, cx + sx * 104, y0 + 66); c.stroke(); }
  c.lineWidth = 4;
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) { const y = y0 + 84 + i * 24; c.beginPath(); c.moveTo(cx + sx * 9, y); c.bezierCurveTo(cx + sx * 70, y - 26, cx + sx * 104, y + 4, cx + sx * 96, y + 34); c.stroke(); }
}
// a CT slice of the head (axial), or of the chest
function paintCT(c, W, H, kind) {
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2 + 6;
  if (kind === 'head') {
    c.fillStyle = '#e9edf2'; c.beginPath(); c.ellipse(cx, cy, W * 0.36, H * 0.33, 0, 0, TAU); c.fill(); // skull
    c.fillStyle = '#6c7178'; c.beginPath(); c.ellipse(cx, cy, W * 0.32, H * 0.295, 0, 0, TAU); c.fill(); // brain
    c.strokeStyle = 'rgba(40,44,50,.9)'; c.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; c.beginPath(); c.arc(cx + Math.cos(a) * W * 0.2, cy + Math.sin(a) * H * 0.19, W * 0.07, a, a + 2); c.stroke(); } // sulci
    c.fillStyle = '#20242a'; c.beginPath(); c.ellipse(cx - W * 0.05, cy - 4, W * 0.035, H * 0.09, 0.2, 0, TAU); c.fill(); c.beginPath(); c.ellipse(cx + W * 0.05, cy - 4, W * 0.035, H * 0.09, -0.2, 0, TAU); c.fill(); // ventricles
    c.fillStyle = 'rgba(255,240,180,.9)'; c.beginPath(); c.arc(cx + W * 0.14, cy - H * 0.1, W * 0.04, 0, TAU); c.fill(); // a finding
    c.strokeStyle = '#ffd23f'; c.lineWidth = 2; c.beginPath(); c.arc(cx + W * 0.14, cy - H * 0.1, W * 0.07, 0, TAU); c.stroke();
    txt(c, 'TC CRÁNEO · AXIAL', 8, 12, '600 12px system-ui', '#9fb3c2');
  } else {
    c.fillStyle = '#8a8f96'; c.beginPath(); c.ellipse(cx, cy, W * 0.42, H * 0.3, 0, 0, TAU); c.fill(); // body
    c.fillStyle = '#111316'; c.beginPath(); c.ellipse(cx - W * 0.17, cy - 4, W * 0.15, H * 0.2, 0.1, 0, TAU); c.fill(); c.beginPath(); c.ellipse(cx + W * 0.17, cy - 4, W * 0.15, H * 0.2, -0.1, 0, TAU); c.fill(); // lungs
    c.fillStyle = '#c9ced4'; c.beginPath(); c.ellipse(cx + W * 0.03, cy + 8, W * 0.08, H * 0.1, 0.4, 0, TAU); c.fill(); // heart
    c.fillStyle = '#f2f4f6'; c.beginPath(); c.arc(cx, cy + H * 0.22, W * 0.04, 0, TAU); c.fill(); // spine
    c.strokeStyle = 'rgba(60,64,70,.6)'; c.lineWidth = 1;
    for (let i = 0; i < 20; i++) { c.beginPath(); c.moveTo(cx - W * 0.2 + Math.sin(i) * 20, cy - 20 + i * 2); c.lineTo(cx - W * 0.1 + Math.cos(i) * 10, cy - 40 + i * 4); c.stroke(); }
    txt(c, 'TC TÓRAX · AXIAL', 8, 12, '600 12px system-ui', '#9fb3c2');
  }
  txt(c, 'W 80 L 40', W - 8, H - 12, '600 11px system-ui', '#9fb3c2', 'right');
}
function paintLapImage(c, W, H) { // laparoscopic view: round field, pink tissue, two instruments
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.5); g.addColorStop(0, '#f6b3a6'); g.addColorStop(0.55, '#c95c58'); g.addColorStop(1, '#3a0b10');
  c.fillStyle = g; c.beginPath(); c.arc(W / 2, H / 2, H * 0.46, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,220,200,.5)'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(W * 0.3 + i * 12, H * 0.3); c.quadraticCurveTo(W * 0.5, H * 0.5 + i * 8, W * 0.65 + i * 6, H * 0.75); c.stroke(); }
  c.fillStyle = '#d9dde2'; c.save(); c.translate(W * 0.2, H * 0.85); c.rotate(-0.75); c.fillRect(0, -6, 120, 12); c.fillStyle = '#3a3f46'; c.fillRect(110, -8, 26, 16); c.restore();
  c.fillStyle = '#d9dde2'; c.save(); c.translate(W * 0.85, H * 0.88); c.rotate(-2.3); c.fillRect(0, -6, 110, 12); c.fillStyle = '#3a3f46'; c.fillRect(100, -8, 24, 16); c.restore();
  txt(c, 'HD 1080 · 30 mmHg', 8, 12, '600 12px system-ui', '#cfd8df');
}

function paintCapPattern(c) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const cx = x * 32 + (y % 2) * 16 + 8, cy = y * 32 + 12;
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(cx - 2, cy - 7, 4, 14); c.fillRect(cx - 7, cy - 2, 14, 4);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(cx + 14, cy + 14, 3, 0, TAU); c.fill();
  }
}

// the floor medallion under the central station
function paintMedallion(c, W) {
  const R = W / 2;
  c.clearRect(0, 0, W, W);
  c.fillStyle = '#14a39a'; c.beginPath(); c.arc(R, R, R - 4, 0, TAU); c.fill();
  c.fillStyle = '#eaf6f3'; c.beginPath(); c.arc(R, R, R - 26, 0, TAU); c.fill();
  c.fillStyle = '#0f6f68'; c.beginPath(); c.arc(R, R, R - 36, 0, TAU); c.fill();
  c.fillStyle = '#e2f3ef'; c.beginPath(); c.arc(R, R, R - 104, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(20,163,154,.35)'; c.lineWidth = 3;
  for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, r0 = R - 104, r1 = r0 - (i % 6 ? 16 : 34); c.beginPath(); c.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); c.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1); c.stroke(); }
  c.fillStyle = 'rgba(20,163,154,.10)'; c.beginPath(); c.arc(R, R, R - 170, 0, TAU); c.fill();
  // text round the ring, upright at the bottom (the side seen from the room)
  const s = 'DIRECCIÓN MÉDICA  ·  CONTROL CENTRAL  ·  PLANTA 3  ·  ';
  c.font = '800 44px system-ui'; c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const r = R - 70, total = c.measureText(s).width * 2, scale = (TAU * r) / total;
  let a0 = Math.PI / 2 + Math.PI;
  for (let rep = 0; rep < 2; rep++) for (const ch of s) {
    const w = c.measureText(ch).width * scale, a = a0 + (w / 2) / r;
    c.save(); c.translate(R + Math.cos(a) * r, R + Math.sin(a) * r); c.rotate(a + Math.PI / 2); c.fillText(ch, 0, 0); c.restore();
    a0 += w / r;
  }
}

// the ward status screen on the central station: beds, ER queue, theatre
function paintWard(c, busy, tick) {
  const W = 512, H = 320;
  c.fillStyle = '#061620'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#0f6f68'; c.fillRect(0, 0, W, 40);
  txt(c, 'ESTADO DE PLANTA 3', 14, 21, '800 21px system-ui', '#ffffff');
  const now = new Date(); txt(c, `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, W - 14, 21, '700 20px system-ui', '#bff3ea', 'right');
  const st = ['#39d98a', '#39d98a', '#ffd23f', '#39d98a', '#3fb8ff', '#39d98a', '#ff5d6c', '#39d98a', '#7b8a94', '#39d98a', '#ffd23f', '#39d98a', '#39d98a', '#3fb8ff', '#39d98a', '#7b8a94', '#39d98a', '#39d98a', '#ffd23f', '#39d98a', '#39d98a', '#39d98a', '#3fb8ff', '#39d98a'];
  for (let i = 0; i < 24; i++) {
    const x = 14 + (i % 8) * 38, y = 54 + Math.floor(i / 8) * 46, call = i === 6 && tick % 2;
    c.fillStyle = call ? '#ffffff' : st[i]; rr(c, x, y, 32, 38, 6); c.fill();
    txt(c, String(301 + i), x + 16, y + 20, '700 13px system-ui', '#06202a', 'center');
  }
  txt(c, 'OCUPACIÓN', 330, 64, '700 14px system-ui', '#7fa6b8'); txt(c, '87%', 500, 98, '800 40px system-ui', '#39d98a', 'right');
  c.fillStyle = '#123040'; c.fillRect(330, 118, 168, 10); c.fillStyle = '#39d98a'; c.fillRect(330, 118, 146, 10);
  txt(c, 'URGENCIAS', 330, 150, '700 14px system-ui', '#7fa6b8'); txt(c, '3 en espera', 500, 176, '800 22px system-ui', '#ffd23f', 'right');
  c.fillStyle = '#0c2430'; c.fillRect(0, 210, W, 110);
  txt(c, 'QUIRÓFANO 1', 14, 236, '700 15px system-ui', '#7fa6b8');
  txt(c, busy ? '● EN CURSO' : '○ LIBRE', 14, 266, '800 26px system-ui', busy ? '#ff5d6c' : '#7fa6b8');
  txt(c, 'GUARDIA', 260, 236, '700 15px system-ui', '#7fa6b8');
  txt(c, 'Dra. de guardia · busca 4412', 260, 264, '600 16px system-ui', '#e6eef3');
  txt(c, 'Altas previstas hoy: 5', 14, 300, '600 16px system-ui', '#bff3ea'); txt(c, 'Ingresos: 4', 260, 300, '600 16px system-ui', '#bff3ea');
}

// ---------------------------------------------------------------- the room
function buildShell(k) {
  const { room, mat, C: { BACK_Z, LEFT_X, WALL_H } } = k;
  const m = M(k), b = kit(k, room);
  const flat = (w, d, x, z, mm, y) => { const s = plane(w, d, mm); s.rotation.x = -Math.PI / 2; s.position.set(x, y, z); s.receiveShadow = true; room.add(s); return s; };
  // floor: glossy speckled vinyl
  const f = tex(k, 1024, 1024, paintFloor);
  f.tex.wrapS = f.tex.wrapT = THREE.RepeatWrapping; f.tex.repeat.set(5, 3.5);
  const floorMat = new THREE.MeshPhysicalMaterial({ map: f.tex, roughness: 0.45, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const floor = k.my.floor = plane(26, 18, floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  room.add(floor, k.box(26.6, 0.6, 18.6, 0x1b2430, { y: -0.31, cast: false }));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), mat(0x0d1620, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62; room.add(ground);
  // inlaid zones: the operating theatre's conductive vinyl, the cafeteria's wood, a darker border along the walls
  const orT = tex(k, 512, 512, (c) => { c.fillStyle = '#8fcfc0'; c.fillRect(0, 0, 512, 512); c.strokeStyle = 'rgba(30,110,100,.3)'; c.lineWidth = 3; for (let i = 0; i <= 512; i += 128) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 512); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(512, i); c.stroke(); } c.fillStyle = 'rgba(20,120,110,.12)'; let s = 3; for (let i = 0; i < 4000; i++) { s = (s * 16807) % 2147483647; c.fillRect(s % 512, (s >> 9) % 512, 2, 2); } });
  orT.tex.wrapS = orT.tex.wrapT = THREE.RepeatWrapping; orT.tex.repeat.set(3.8, 3.5);
  flat(7.5, 7.0, -9.18, 5.42, new THREE.MeshPhysicalMaterial({ map: orT.tex, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15 }), 0.003);
  {
    const bm = mat(0x5f8f8a, { roughness: 0.35 });
    flat(26, 0.6, 0, BACK_Z + 0.3, bm, 0.0035); flat(0.6, 7.0, LEFT_X + 0.3, -2.0, bm, 0.0035);
    flat(25.4, 0.05, 0.3, BACK_Z + 0.65, m.teal, 0.0045); flat(0.05, 10.9, LEFT_X + 0.65, -3.5, m.teal, 0.0045);
  }
  room.add(k.box(26.6, 0.06, 0.08, 0, { m: m.teal, y: -0.02, z: 9.3, cast: false }), k.box(0.08, 0.06, 18.6, 0, { m: m.teal, x: 13.3, y: -0.02, cast: false }));

  // walls
  const wall = k.my.wallMat = mat(0xeef4f3, { roughness: 0.8 });
  room.add(k.box(26.6, WALL_H, 0.3, 0, { m: wall, y: WALL_H / 2, z: BACK_Z - 0.15 }));
  room.add(k.box(0.3, WALL_H, 18.3, 0, { m: wall, x: LEFT_X - 0.15, y: WALL_H / 2, z: 0.15 }));
  const wsc = tex(k, 512, 128, (c) => {
    c.fillStyle = '#7fb3ad'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(0, 0, 512, 30);
    c.fillStyle = 'rgba(20,60,60,.35)'; c.fillRect(0, 0, 3, 128); c.fillRect(255, 0, 3, 128);
  });
  wsc.tex.wrapS = THREE.RepeatWrapping;
  const wscBack = wsc.tex, wscLeft = wsc.tex.clone(); wscBack.repeat.set(10.4, 1); wscLeft.repeat.set(7.2, 1); wscLeft.needsUpdate = true;
  const wb = plane(26, 1.15, new THREE.MeshStandardMaterial({ map: wscBack, roughness: 0.4 })); at(wb, 0, 0.575, BACK_Z + 0.012);
  const wl = plane(18, 1.15, new THREE.MeshStandardMaterial({ map: wscLeft, roughness: 0.4 })); wl.rotation.y = Math.PI / 2; at(wl, LEFT_X + 0.012, 0.575, 0);
  room.add(wb, wl);
  {
    const fb = tex(k, 1024, 128, (c) => { const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#d3e9e4'); g.addColorStop(1, '#c2e0d9'); c.fillStyle = g; c.fillRect(0, 0, 1024, 128); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, 0, 1024, 4); c.fillRect(0, 124, 1024, 4); });
    const fm = new THREE.MeshStandardMaterial({ map: fb.tex, roughness: 0.85 });
    const f1 = plane(26, 3.1, fm); at(f1, 0, 3.82, BACK_Z + 0.008); const f2 = plane(18, 3.1, fm); f2.rotation.y = Math.PI / 2; at(f2, LEFT_X + 0.008, 3.82, 0);
    room.add(f1, f2);
  }
  const rail = mat(0xf7f9fa, { roughness: 0.35 }), cove = mat(0x3f6466, { roughness: 0.5 });
  room.add(
    k.box(26, 0.12, 0.05, 0, { m: m.teal, y: 1.21, z: BACK_Z + 0.025, cast: false }), k.box(0.05, 0.12, 18, 0, { m: m.teal, x: LEFT_X + 0.025, y: 1.21, cast: false }),
    k.box(26, 0.13, 0.07, 0, { m: rail, y: 0.92, z: BACK_Z + 0.05, r: 0.03, cast: false }), k.box(0.07, 0.13, 18, 0, { m: rail, x: LEFT_X + 0.05, y: 0.92, r: 0.03, cast: false }),
    k.box(26, 0.12, 0.05, 0, { m: cove, y: 0.06, z: BACK_Z + 0.03, cast: false }), k.box(0.05, 0.12, 18, 0, { m: cove, x: LEFT_X + 0.03, y: 0.06, cast: false }));
  // a teal night-light strip along the skirting (glows at night: the ward's calm floor light)
  k.my.skirt = k.glow(0x2de0c8, 1.2);
  room.add(k.box(26, 0.025, 0.02, 0, { m: k.my.skirt, y: 0.15, z: BACK_Z + 0.06, cast: false }), k.box(0.02, 0.025, 18, 0, { m: k.my.skirt, x: LEFT_X + 0.06, y: 0.15, cast: false }));
  // bedhead gas trunking along the back wall
  const trunk = tex(k, 512, 48, (c) => {
    c.fillStyle = '#eef3f5'; c.fillRect(0, 0, 512, 48);
    c.fillStyle = '#14a39a'; c.fillRect(0, 40, 512, 8);
    const out = (x, ring, inner, edge) => { c.fillStyle = edge; c.beginPath(); c.arc(x, 20, 17, 0, TAU); c.fill(); c.fillStyle = ring; c.beginPath(); c.arc(x, 20, 14, 0, TAU); c.fill(); c.fillStyle = inner; c.beginPath(); c.arc(x, 20, 8, 0, TAU); c.fill(); c.fillStyle = '#20262d'; c.beginPath(); c.arc(x, 20, 3.5, 0, TAU); c.fill(); };
    out(146, '#ffffff', '#2f9e62', '#2f9e62'); out(190, '#1d232a', '#ffffff', '#1d232a'); out(234, '#f5c518', '#f5c518', '#8a6d00');
    for (const [x, col] of [[280, '#f7f9fa'], [320, '#e23a46']]) { c.fillStyle = col; rr(c, x - 15, 6, 30, 26, 4); c.fill(); c.fillStyle = '#20262d'; c.beginPath(); c.arc(x - 5, 19, 2.5, 0, TAU); c.arc(x + 5, 19, 2.5, 0, TAU); c.fill(); }
  });
  trunk.tex.wrapS = THREE.RepeatWrapping; trunk.tex.repeat.set(10, 1);
  const tm = mat(0xe9eef0);
  room.add(k.box(25.8, 0.24, 0.07, 0, { y: 1.62, z: BACK_Z + 0.04, cast: false, m: [tm, tm, tm, tm, new THREE.MeshStandardMaterial({ map: trunk.tex, roughness: 0.4 }), tm] }));
  {
    const hb = tex(k, 2048, 96, (c) => {
      c.clearRect(0, 0, 2048, 96); c.strokeStyle = 'rgba(20,163,154,.75)'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); c.moveTo(0, 60);
      for (let x = 0; x < 2048; x += 4) { const p = (x % 340) / 340; c.lineTo(x, 60 - 46 * gauss(p, 0.5, 0.012) + 18 * gauss(p, 0.53, 0.01) - 9 * gauss(p, 0.4, 0.03) - 12 * gauss(p, 0.7, 0.05)); }
      c.stroke();
    });
    const p = plane(26, 1.22, new THREE.MeshStandardMaterial({ map: hb.tex, transparent: true, roughness: 0.6, depthWrite: false })); at(p, 0, 2.15, BACK_Z + 0.012); room.add(p);
  }
  // clerestory windows: white frames, half-lowered blinds
  const windowMat = k.my.windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const sky = tex(k, 256, 128, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#8fc7ff'); gr.addColorStop(1, '#e6f4ff'); c.fillStyle = gr; c.fillRect(0, 0, 256, 128);
    c.fillStyle = 'rgba(255,255,255,.9)';
    for (const [x, y, r] of [[46, 62, 15], [66, 56, 21], [92, 64, 14], [176, 90, 13], [196, 83, 19], [220, 92, 12]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(120,150,170,.55)'; c.fillRect(0, 110, 256, 18); for (let i = 0; i < 14; i++) c.fillRect(i * 19, 96 - (i * 7) % 16, 12, 30);
  });
  windowMat.map = k.my.skyDay = sky.tex;
  k.my.skyNight = tex(k, 256, 128, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#04121c'); gr.addColorStop(1, '#0f2f3e'); c.fillStyle = gr; c.fillRect(0, 0, 256, 128);
    c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 26; i++) c.fillRect((i * 97) % 256, (i * 41) % 70, 1.5, 1.5);
    c.fillStyle = '#06111a'; c.fillRect(0, 110, 256, 18); for (let i = 0; i < 14; i++) c.fillRect(i * 19, 96 - (i * 7) % 16, 12, 30);
    c.fillStyle = 'rgba(255,205,120,.9)'; for (let i = 0; i < 40; i++) { const x = (i * 53) % 256, bb = Math.floor(x / 19); if (x % 19 < 11) c.fillRect(x, 100 - (bb * 7) % 16 + (i % 4) * 5, 2, 2); }
  }).tex;
  const blinds = tex(k, 64, 128, (c) => { c.clearRect(0, 0, 64, 128); for (let y = 0; y < 128; y += 8) { c.fillStyle = 'rgba(245,247,248,.97)'; c.fillRect(0, y, 64, 6); c.fillStyle = 'rgba(180,190,196,.9)'; c.fillRect(0, y + 5, 64, 1); } });
  blinds.tex.wrapS = THREE.RepeatWrapping; blinds.tex.repeat.set(8, 1);
  const blindMat = new THREE.MeshStandardMaterial({ map: blinds.tex, transparent: true, roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const x = -10.4 + i * 5.2, drop = [0.35, 0.5, 0.3, 0.45, 0.38][i];
    b.box(4.4, 1.25, 0.1, m.white, x, 6.25, BACK_Z + 0.03, { cast: false });
    const pane = plane(4.15, 1.0, windowMat); at(pane, x, 6.25, BACK_Z + 0.09);
    const bl = plane(4.1, drop, blindMat); at(bl, x, 6.75 - drop / 2, BACK_Z + 0.13);
    room.add(pane, bl);
    b.box(0.06, 1.0, 0.04, m.white, x, 6.25, BACK_Z + 0.11, { cast: false }); b.box(4.2, 0.07, 0.06, m.offwhite, x, 6.78, BACK_Z + 0.15, { cast: false });
  }
  // lit cornice along the top of both walls
  b.box(26.6, 0.32, 0.55, m.white, 0, 7.05, BACK_Z + 0.27, { cast: false }); b.box(0.55, 0.32, 18.3, m.white, LEFT_X + 0.27, 7.05, 0.15, { cast: false });
  b.box(25.9, 0.05, 0.05, m.glowWhite, 0, 6.88, BACK_Z + 0.52, { cast: false }); b.box(0.05, 0.05, 17.9, m.glowWhite, LEFT_X + 0.52, 6.88, 0.15, { cast: false });

  // wayfinding lines on the floor (the pharmacy robot follows the blue one)
  const line = (pts, color, w = 0.12) => {
    const lm = mat(color, { roughness: 0.3 });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az) + w;
      const s = plane(len, w, lm); s.rotation.x = -Math.PI / 2; s.rotation.z = -Math.atan2(bz - az, bx - ax);
      s.position.set((ax + bx) / 2, 0.005, (az + bz) / 2); s.receiveShadow = true; room.add(s);
    }
  };
  k.my.path = [[11.45, -2.3], [11.45, 8.68], [-4.75, 8.68], [-4.75, 4.9]];
  line(k.my.path, 0x2b6cb0);
  // at night the blue line glows faintly (a lit wayfinding strip): an additive overlay, faded in daylight()
  {
    const gm = k.my.lineGlow = new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const P = k.my.path;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], len = Math.hypot(bx - ax, bz - az) + 0.3;
      for (const w of [0.07, 0.34]) { const s = plane(len, w, w < 0.1 ? gm : (k.my.lineHalo || (k.my.lineHalo = gm.clone()))); s.rotation.x = -Math.PI / 2; s.rotation.z = -Math.atan2(bz - az, bx - ax); s.position.set((ax + bx) / 2, w < 0.1 ? 0.0075 : 0.0072, (az + bz) / 2); room.add(s); }
    }
  }
  const lab = (s, color, x, z, rz) => {
    const t = tex(k, 512, 64, (c) => { c.clearRect(0, 0, 512, 64); txt(c, s, 256, 34, '800 34px system-ui', color, 'center'); });
    const p = plane(3.0, 0.375, new THREE.MeshStandardMaterial({ map: t.tex, transparent: true, roughness: 0.3, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.rotation.z = rz || 0; p.position.set(x, 0.007, z); room.add(p); return p;
  };
  k.my.floorLabs = [lab('← QUIRÓFANO 1 · FARMACIA →', '#2b6cb0', -1.0, 8.05), lab('UCI · URGENCIAS ↓', '#2b6cb0', 10.95, 2.2, Math.PI / 2)];
  bake(room);
  // by day: warm sunlight from the clerestory, as soft window-shaped patches on the open floor (additive, faded in
  // daylight(); kept faint so nothing on the floor goes over the glow threshold)
  {
    const patchT = tex(k, 128, 256, (c) => { c.clearRect(0, 0, 128, 256); c.filter = 'blur(14px)'; c.fillStyle = 'rgba(255,226,178,1)'; c.fillRect(26, 26, 76, 204); c.filter = 'none'; }).tex;
    const patchM = k.my.patchMat = new THREE.MeshBasicMaterial({ map: patchT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const sg = new THREE.Group(); room.add(sg);
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue; // the centre's medallion
      const x = -10.4 + i * 5.2, pt = plane(2.6, 4.4, patchM); pt.rotation.x = -Math.PI / 2; pt.rotation.z = 0.32; pt.position.set(x - 1.6, 0.012, 0.2); sg.add(pt);
    }
  }
}

// A static person in theatre clothes (no agent): legs, a gown, the arms reaching forward to the table, a big head
// with a cap, a surgical mask and eyes, in the same proportions as the floor's people (head top at about 1.85).
function staffFigure(k, b, parent, { x, z, ry = 0, gown, cap, reach = 0.9, skin = 0xd9a37e }) {
  const m = M(k), g = b.grp(x, 0, z, ry, parent);
  const gm = mc(k, gown, { roughness: 0.9 }), sk = mc(k, skin, { roughness: 0.6 }), shoe = mc(k, 0xf3f5f6, { roughness: 0.5 });
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), gm); l.position.set(s * 0.15, 0.3, 0); l.castShadow = true; g.add(l); b.box(0.2, 0.1, 0.3, shoe, s * 0.15, 0.05, 0.05, { r: 0.04, to: g }); }
  const gw = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.6, 20), gm); gw.position.y = 0.66; gw.scale.z = 0.84; gw.castShadow = true; g.add(gw);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.26, 6, 16), gm); torso.position.y = 0.92; torso.scale.set(1.2, 1, 0.84); torso.castShadow = true; g.add(torso);
  b.cyl(0.085, 0.1, 0.16, sk, 0, 1.26, 0, { to: g, cast: false });
  for (const s of [-1, 1]) {
    const arm = b.grp(s * 0.36, 1.14, 0.05, 0, g); arm.rotation.x = -reach; arm.rotation.z = s * -0.15;
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, 4, 10), gm); a.position.y = -0.22; arm.add(a);
    b.sph(0.085, mc(k, 0x5b8def, { roughness: 0.4 }), 0, -0.46, 0, { to: arm, cast: false });
  }
  const h = b.grp(0, 1.52, 0, 0, g); h.rotation.x = 0.22;
  b.sph(0.31, sk, 0, 0, 0, { to: h, sx: 1, sy: 1.04, sz: 0.97, seg: 24, seg2: 16 });
  const cp = new THREE.Mesh(new THREE.SphereGeometry(0.345, 24, 12, 0, TAU, 0, Math.PI * 0.55), mc(k, cap, { roughness: 0.9 })); cp.rotation.x = -0.42; cp.scale.set(1.08, 1.1, 1.08); h.add(cp);
  const mk = new THREE.Mesh(new THREE.SphereGeometry(0.325, 20, 10, Math.PI / 2 - 1.0, 2.0, Math.PI * 0.5, Math.PI * 0.32), mc(k, 0x9cc7f0, { roughness: 0.95, side: THREE.DoubleSide })); mk.position.y = -0.02; h.add(mk);
  for (const s of [-1, 1]) { b.sph(0.058, m.white, s * 0.118, 0.04, 0.265, { to: h, sz: 0.5, cast: false }); b.sph(0.034, m.black, s * 0.118, 0.04, 0.29, { to: h, sz: 0.6, cast: false }); }
  return g;
}

// ---------------------------------------------------------------- operating theatre (left front, behind glass)
function buildTheatre(k) {
  const { C: { LEFT_X } } = k, mat = (c, o) => mc(k, c, o);
  const m = M(k);
  const or = k.my.theatre = new THREE.Group(); k.room.add(or);
  const b = kit(k, or);
  const X1 = -5.4, Z0 = 1.9, Z1 = 8.85, H = 2.6;
  // sterile-zone decal round the table
  { const zt = tex(k, 1024, 680, paintOrZone); const d = plane(5.8, 3.85, new THREE.MeshStandardMaterial({ map: zt.tex, transparent: true, roughness: 0.25, depthWrite: false })); d.rotation.x = -Math.PI / 2; d.position.set(-9.0, 0.008, 5.45); or.add(d); }
  // glass partitions: steel frame, clear panes, a frosted band with the theatre's name
  const band = tex(k, 1024, 64, (c) => { c.clearRect(0, 0, 1024, 64); c.fillStyle = 'rgba(244,251,251,.92)'; c.fillRect(0, 0, 1024, 64); c.fillStyle = '#14a39a'; c.fillRect(0, 56, 1024, 8); for (let i = 0; i < 2; i++) { crossIcon(c, 40 + i * 512, 28, 30, '#14a39a'); txt(c, 'QUIRÓFANO 1 · BLOQUE QUIRÚRGICO', 70 + i * 512, 30, '800 26px system-ui', '#0f6f68'); } });
  band.tex.wrapS = THREE.RepeatWrapping;
  const bandMat = (len) => { const t = band.tex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 7, 1); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, depthWrite: false }); };
  const wallRun = (ax, az, bx, bz, gaps = []) => { // from a to b, straight; gaps: [from, to] along it left open (the door)
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = -Math.atan2(uz, ux);
    const seg = (s0, s1) => {
      const L = s1 - s0, cx = ax + ux * (s0 + L / 2), cz = az + uz * (s0 + L / 2);
      const g = b.grp(cx, 0, cz, ry);
      b.box(L, 0.1, 0.1, m.steel, 0, 0.05, 0, { to: g }); b.box(L, 0.08, 0.1, m.steel, 0, H, 0, { to: g, cast: false });
      const p = plane(L, H - 0.12, m.pane); p.position.y = H / 2; g.add(p);
      const bm = bandMat(L); // one face each way, so the name reads right from inside and outside
      const fb = plane(L, 0.3, bm); fb.position.set(0, 1.42, 0.004); g.add(fb);
      const fb2 = plane(L, 0.3, bm); fb2.rotation.y = Math.PI; fb2.position.set(0, 1.42, -0.004); g.add(fb2);
      const n = Math.max(1, Math.round(L / 1.3));
      for (let i = 0; i <= n; i++) b.box(0.05, H, 0.07, m.steel, -L / 2 + (i / n) * L, H / 2, 0, { to: g, cast: false });
    };
    let s = 0;
    for (const [g0, g1] of gaps) { if (g0 > s) seg(s, g0); s = g1; }
    if (s < len) seg(s, len);
  };
  wallRun(LEFT_X + 0.05, Z0, X1, Z0);
  wallRun(X1, Z0, X1, Z1, [[0.85, 2.25]]); // the door, z 2.75..4.15
  // the sliding doors: two glass leaves, one pushed half open, a header, the "QUIRÓFANO EN USO" light box
  {
    const d = b.grp(X1, 0, 3.45, Math.PI / 2); // local +x = towards -z (the opening runs along z), +z = out of the theatre (+x)
    b.box(1.5, 0.22, 0.14, m.white, 0, H - 0.11, 0, { to: d });
    for (const [x, s] of [[0.36, 1], [-0.05, -1]]) {
      const leaf = b.grp(x, 0, s * 0.05, 0, d);
      const p = plane(0.68, 2.3, m.glass); p.position.y = 1.2; leaf.add(p);
      b.box(0.68, 0.06, 0.04, m.steel, 0, 0.06, 0, { to: leaf, cast: false }); b.box(0.68, 0.06, 0.04, m.steel, 0, 2.33, 0, { to: leaf, cast: false });
      for (const e of [-0.34, 0.34]) b.box(0.04, 2.3, 0.04, m.steel, e, 1.2, 0, { to: leaf, cast: false });
      b.box(0.5, 0.18, 0.012, m.frost, 0, 1.25, 0.02, { to: leaf, cast: false });
      b.box(0.03, 0.4, 0.05, m.chrome, s > 0 ? -0.28 : 0.28, 1.1, 0.05, { to: leaf, cast: false });
    }
    const uso = tex(k, 512, 112, (c) => { c.fillStyle = '#1a0507'; c.fillRect(0, 0, 512, 112); txt(c, 'QUIRÓFANO EN USO', 256, 58, '800 50px system-ui', '#ff3347', 'center'); });
    const usoOff = tex(k, 512, 112, (c) => { c.fillStyle = '#120709'; c.fillRect(0, 0, 512, 112); txt(c, 'QUIRÓFANO EN USO', 256, 58, '800 50px system-ui', '#4a2226', 'center'); });
    k.my.usoTex = [usoOff.tex, uso.tex];
    // the light box over the door and the blade sign: both stand over a second row of desks, so layout() hides
    // them when there are two rows (k.my.orSigns)
    const us = keep(b.grp(X1, 0, 3.45, Math.PI / 2));
    b.box(1.5, 0.36, 0.12, m.dark, 0, H + 0.24, 0.02, { to: us, cast: false });
    const usoMat = k.my.usoMat = new THREE.MeshBasicMaterial({ map: usoOff.tex, toneMapped: false });
    const up = plane(1.42, 0.3, usoMat); up.position.set(0, H + 0.24, 0.085); us.add(keep(up));
    const usoL = k.my.usoLight = new THREE.PointLight(0xff3040, 0, 3.2, 2); usoL.position.set(0, H + 0.2, 0.6); us.add(usoL);
    // a blade sign at the corner, seen from the room
    const q1 = tex(k, 512, 160, (c) => { c.fillStyle = '#ffffff'; rr(c, 0, 0, 512, 160, 16); c.fill(); c.fillStyle = '#14a39a'; rr(c, 0, 0, 150, 160, 16); c.fill(); c.fillRect(120, 0, 30, 160); txt(c, '1', 75, 84, '800 110px system-ui', '#ffffff', 'center'); txt(c, 'QUIRÓFANO', 170, 62, '800 50px system-ui', '#0f2f2b'); txt(c, 'Cirugía general', 172, 116, '600 30px system-ui', '#14776f'); });
    const bl = keep(b.grp(X1 + 0.62, 0, Z0 + 0.02, 0));
    k.my.orSigns = [us, bl];
    b.box(1.24, 0.42, 0.05, m.white, 0, H + 0.33, 0, { to: bl, cast: false });
    for (const s of [1, -1]) { const p = b.sign(1.18, 0.37, q1, { to: bl }); p.position.set(0, H + 0.33, s * 0.027); if (s < 0) p.rotation.y = Math.PI; }
    b.rod([-0.55, H, 0], [-0.55, H + 0.12, 0], 0.012, m.steel, bl); b.rod([0.55, H, 0], [0.55, H + 0.12, 0], 0.012, m.steel, bl);
  }
  // operating table, long axis along x, head at -x
  {
    const t = b.grp(-9.0, 0, 5.45);
    b.box(0.95, 0.08, 0.58, m.dark, 0, 0.05, 0, { r: 0.03, to: t });
    b.box(0.36, 0.62, 0.28, m.white, 0, 0.4, 0, { r: 0.05, to: t });
    b.box(0.28, 0.2, 0.2, m.chrome, 0, 0.78, 0, { to: t });
    b.box(2.05, 0.06, 0.56, m.steel, 0.05, 0.9, 0, { to: t });
    for (const z of [-0.3, 0.3]) b.box(1.9, 0.035, 0.025, m.chrome, 0.05, 0.89, z, { cast: false, to: t });
    for (const [x, l, w] of [[-0.95, 0.3, 0.3], [-0.49, 0.58, 0.54], [0.1, 0.56, 0.54], [0.72, 0.64, 0.54]]) b.box(l, 0.085, w, m.navyPad, x, 0.97, 0, { r: 0.035, to: t });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 10, 24), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.2, transparent: true, opacity: 0.85 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(-0.98, 1.04, 0); t.add(ring);
    for (const s of [-1, 1]) { b.box(0.16, 0.05, 0.55, m.navyPad, -0.45, 0.97, s * 0.52, { r: 0.02, ry: s * 0.25, to: t }); b.box(0.06, 0.12, 0.06, m.steel, -0.45, 0.9, s * 0.3, { to: t }); }
    b.box(1.3, 0.015, 0.74, m.drapeGreen, 0.43, 1.02, 0, { cast: true, to: t });
    for (const s of [-1, 1]) b.box(1.3, 0.34, 0.012, m.drapeGreen, 0.43, 0.86, s * 0.37, { cast: false, to: t });
    b.box(0.012, 0.3, 0.74, m.drapeGreen, 1.08, 0.88, 0, { cast: false, to: t });
    b.box(0.36, 0.05, 0.28, m.drapeBlue, -0.45, 1.04, 0.05, { r: 0.02, to: t });
  }
  // the operation in progress (shown while the surgeon works, tick): the patient under the drapes with the
  // anaesthesia screen at the head, a surgeon across the table and a scrub nurse at its foot
  {
    const sg = k.my.surgery = keep(b.grp(0, 0, 0)); sg.visible = false;
    const t = b.grp(-9.0, 0, 5.45, 0, sg);
    b.box(1.45, 0.16, 0.46, m.drapeGreen, 0.22, 1.1, 0, { r: 0.07, to: t });
    b.box(0.42, 0.12, 0.44, m.drapeGreen, 0.12, 1.2, 0, { r: 0.05, to: t });
    for (const s of [-1, 1]) b.box(0.2, 0.1, 0.12, m.drapeGreen, 0.98, 1.12, s * 0.1, { r: 0.04, to: t });
    b.box(0.22, 0.12, 0.2, mc(k, 0xffd6d0, { roughness: 0.8 }), 0.12, 1.27, 0, { r: 0.04, to: t }); // the field, under the light
    b.sph(0.14, mc(k, 0xc99a7a, { roughness: 0.6 }), -0.95, 1.13, 0, { to: t });
    b.sph(0.15, mc(k, 0x3d7fb8, { roughness: 0.9 }), -0.98, 1.17, 0, { sx: 1.05, sy: 0.7, sz: 1.05, to: t });
    b.box(0.08, 0.06, 0.1, m.clear, -0.85, 1.16, 0, { to: t, cast: false });
    b.rod([-0.6, 0.95, -0.36], [-0.6, 1.62, -0.36], 0.012, m.steel, t); b.rod([-0.6, 0.95, 0.36], [-0.6, 1.62, 0.36], 0.012, m.steel, t); b.rod([-0.6, 1.62, -0.36], [-0.6, 1.62, 0.36], 0.012, m.steel, t);
    b.box(0.02, 0.6, 0.74, m.drapeBlue, -0.6, 1.33, 0, { to: t, cast: false });
    const hoseM = mc(k, 0x9cc9e6, { roughness: 0.35 });
    b.rod([-1.55, 1.2, -0.75], [-1.2, 1.2, -0.2], 0.022, hoseM, t); b.rod([-1.2, 1.2, -0.2], [-0.88, 1.17, 0], 0.022, hoseM, t);
    staffFigure(k, b, sg, { x: -8.5, z: 4.72, ry: 0.15, gown: 0x3d7fb8, cap: 0x2f7fc4, reach: 1.0 });
    staffFigure(k, b, sg, { x: -7.72, z: 5.55, ry: -Math.PI / 2 + 0.2, gown: 0x3d9c8c, cap: 0xe36b9a, reach: 0.75 });
  }
  // surgical lamp on a heavy mobile stand: two heads with LED fields, light cones and a spot
  {
    const stand = b.grp(-10.7, 0, 7.75);
    b.cyl(0.2, 0.26, 0.14, m.white, 0, 0.12, 0, { to: stand });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; b.box(0.09, 0.06, 0.6, m.white, Math.sin(a) * 0.3, 0.08, Math.cos(a) * 0.3, { r: 0.02, ry: a, to: stand, cast: false }); b.caster(Math.sin(a) * 0.58, Math.cos(a) * 0.58, stand); }
    const TOP = 2.7;
    b.cyl(0.055, 0.06, TOP - 0.1, m.white, 0, (TOP - 0.1) / 2 + 0.1, 0, { to: stand });
    b.cyl(0.09, 0.09, 0.16, m.offwhite, 0, TOP + 0.05, 0, { to: stand });
    b.cyl(0.07, 0.07, 0.04, m.teal, 0, TOP - 0.04, 0, { cast: false, to: stand });
    const ledMat = new THREE.MeshBasicMaterial({ map: tex(k, 256, 256, paintLed).tex, color: new THREE.Color(1.45, 1.4, 1.3), toneMapped: false });
    const coneMat = k.my.coneMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.02, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const head = (hx, hy, hz, tilt, r) => {
      const top = [0, TOP + 0.02, 0], elbow = [hx * 0.5, TOP + 0.12, hz * 0.5], drop = [hx, hy + 0.42, hz];
      b.rod(top, elbow, 0.04, m.white, stand); b.rod(elbow, drop, 0.035, m.white, stand);
      b.cyl(0.05, 0.05, 0.08, m.teal, ...elbow, { cast: false, to: stand });
      b.rod(drop, [hx, hy + 0.14, hz], 0.03, m.offwhite, stand);
      const h = new THREE.Group(); h.position.set(hx, hy, hz); h.rotation.set(tilt[0], 0, tilt[1]); stand.add(h);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 12, 0, TAU, 0, Math.PI * 0.36), m.white); dome.scale.y = 0.5; dome.castShadow = true; h.add(dome);
      b.cyl(r * 1.02, r * 1.02, 0.07, m.offwhite, 0, -0.01, 0, { seg: 36, to: h });
      b.cyl(r * 1.03, r * 1.03, 0.012, m.teal, 0, 0.028, 0, { seg: 36, cast: false, to: h });
      const led = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 36), ledMat); led.rotation.x = Math.PI / 2; led.position.y = -0.05; h.add(led);
      b.cyl(0.035, 0.045, 0.18, m.teal, 0, -0.12, 0, { cast: false, to: h });
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.9, hy - 1.05, 32, 1, true), coneMat); cone.position.y = -0.05 - (hy - 1.05) / 2; h.add(keep(cone));
    };
    head(1.55, 2.05, -2.4, [0.12, 0.14], 0.42);
    head(2.35, 2.15, -2.05, [0.1, -0.12], 0.34);
    const spot = new THREE.SpotLight(0xfff5e6, 22, 7, 0.55, 0.6, 1.3);
    spot.position.set(-9.0, 3.2, 5.45); spot.target.position.set(-9.0, 0.9, 5.45);
    or.add(spot, spot.target); k.my.spot = spot;
  }
  // anaesthesia machine at the head of the table, with the live monitor
  {
    const a = b.grp(-10.95, 0, 4.55, 0.55);
    for (const [x, z] of [[-0.36, -0.26], [0.36, -0.26], [-0.36, 0.26], [0.36, 0.26]]) b.caster(x, z, a);
    b.box(0.88, 0.9, 0.62, m.offwhite, 0, 0.6, 0, { r: 0.04, to: a });
    for (let i = 0; i < 3; i++) { b.box(0.8, 0.005, 0.01, m.grey, 0, 0.42 + i * 0.26, 0.312, { cast: false, to: a }); b.box(0.2, 0.025, 0.03, m.steel, 0, 0.5 + i * 0.26, 0.32, { cast: false, to: a }); }
    b.box(0.98, 0.04, 0.7, m.dark, 0, 1.07, 0.02, { to: a });
    b.box(0.86, 0.78, 0.34, m.white, 0, 1.48, -0.16, { r: 0.04, to: a });
    b.box(0.9, 0.06, 0.4, m.offwhite, 0, 1.9, -0.16, { r: 0.02, to: a });
    b.box(0.3, 0.36, 0.02, m.black, -0.18, 1.5, 0.02, { cast: false, to: a });
    [0x2f9e62, 0x2b6cb0, 0xf5f7f8].forEach((c, i) => { b.cyl(0.018, 0.018, 0.3, m.clear, -0.27 + i * 0.09, 1.5, 0.04, { cast: false, to: a }).renderOrder = 2; b.cyl(0.02, 0.012, 0.03, k.glow(c, 1.2), -0.27 + i * 0.09, 1.42 + i * 0.05, 0.04, { cast: false, to: a }); });
    [[0xf5c518, 0.15], [0x2b6cb0, 0.33]].forEach(([c, x]) => { b.box(0.14, 0.26, 0.18, mat(c, { roughness: 0.3 }), x, 1.32, 0.05, { r: 0.02, to: a }); });
    b.cyl(0.13, 0.14, 0.05, m.dark, -0.32, 1.12, 0.17, { cast: false, to: a });
    b.cyl(0.11, 0.11, 0.34, m.clear, -0.32, 1.32, 0.17, { cast: false, to: a }).renderOrder = 2;
    const prof = []; for (let i = 0; i <= 12; i++) prof.push(new THREE.Vector2(i % 2 ? 0.085 : 0.07, i / 12));
    const bel = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), mat(0x5aa9e6, { roughness: 0.35 }));
    bel.position.set(-0.32, 1.15, 0.17); bel.scale.y = 0.25; a.add(keep(bel)); k.my.bellows = bel;
    b.rod([0.4, 1.62, -0.1], [0.62, 1.74, 0.0], 0.025, m.steel, a);
    const scr = k.my.vit = tex(k, 512, 320, paintVitalsFrame); paintVitalsNumbers(scr.ctx, 72, 98, 35);
    const mon = b.grp(0.88, 1.8, 0.04, -0.3, a); mon.position.y = 1.8;
    b.box(0.78, 0.52, 0.07, m.dark, 0, 0, -0.02, { r: 0.02, to: mon });
    const face = b.screen(0.72, 0.45, scr, 1.35, mon); face.position.z = 0.016;
    b.box(0.78, 0.04, 0.08, m.teal, 0, -0.28, -0.02, { cast: false, to: mon });
    k.my.vitDraw = sweeper(scr.ctx, 30, 334, [
      { y0: 28, y1: 118, fn: (t) => ecgWave(t, 72), color: '#39ff88', w: 3 },
      { y0: 120, y1: 210, fn: plethWave, color: '#3fe0ff' },
      { y0: 212, y1: 318, fn: capnoWave, color: '#ffd23f' },
    ], 120);
    const lt = tex(k, 256, 48, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 48); txt(c, 'ANESTESIA', 128, 25, '800 26px system-ui', '#14776f', 'center'); });
    at(b.sign(0.5, 0.09, lt, { to: a }), 0, 1.78, 0.012);
    b.cyl(0.075, 0.075, 0.72, m.white, -0.25, 0.5, -0.4, { to: a }); b.cyl(0.075, 0.075, 0.72, mat(0x2b6cb0, { roughness: 0.4 }), 0.0, 0.5, -0.42, { to: a });
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x9cc9e6, roughness: 0.35, transparent: true, opacity: 0.85 });
    for (const dz of [-0.04, 0.04]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-10.55, 1.12, 4.8 + dz), new THREE.Vector3(-10.35, 0.95, 5.15 + dz), new THREE.Vector3(-10.1, 1.2, 5.35 + dz), new THREE.Vector3(-9.98, 1.1, 5.45)]);
      or.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.022, 8), hoseMat));
    }
  }
  // electrosurgical unit on its cart
  {
    const e = b.grp(-7.25, 0, 3.75, -0.5);
    for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) { b.caster(x, z, e); b.cyl(0.015, 0.015, 0.95, m.steel, x, 0.58, z, { cast: false, to: e }); }
    b.box(0.58, 0.03, 0.48, m.white, 0, 0.35, 0, { to: e }); b.box(0.58, 0.03, 0.48, m.white, 0, 1.05, 0, { to: e });
    b.box(0.5, 0.2, 0.4, m.white, 0, 1.17, 0, { r: 0.02, to: e });
    const et = tex(k, 256, 80, (c) => { c.fillStyle = '#0b2540'; c.fillRect(0, 0, 256, 80); txt(c, 'CORTE', 14, 20, '600 15px system-ui', '#ffd23f'); txt(c, '40 W', 120, 20, '800 22px system-ui', '#ffd23f', 'right'); txt(c, 'COAG', 140, 20, '600 15px system-ui', '#60a5fa'); txt(c, '30 W', 246, 20, '800 22px system-ui', '#60a5fa', 'right'); txt(c, 'BIPOLAR · MONOPOLAR', 128, 58, '600 14px system-ui', '#8fb6c9', 'center'); });
    at(b.screen(0.36, 0.11, et, 1.3, e), 0, 1.2, 0.202);
    b.box(0.4, 0.2, 0.36, m.grey, 0, 0.47, 0, { r: 0.02, to: e });
  }
  // Mayo stand over the foot of the table, instrument back table, IV pole, kick bucket
  {
    const y = b.grp(-8.05, 0, 6.35);
    b.box(0.7, 0.04, 0.06, m.steel, 0, 0.03, -0.3, { to: y }); b.box(0.06, 0.04, 0.62, m.steel, -0.32, 0.03, 0, { to: y }); b.box(0.06, 0.04, 0.62, m.steel, 0.32, 0.03, 0, { to: y });
    b.cyl(0.025, 0.025, 1.2, m.steel, 0, 0.62, -0.3, { to: y });
    b.box(0.7, 0.03, 0.48, m.steel, 0, 1.24, 0, { to: y }); b.box(0.74, 0.015, 0.52, m.drapeBlue, 0, 1.262, 0, { cast: false, to: y });
    for (let i = 0; i < 6; i++) b.box(0.22 + (i % 3) * 0.03, 0.012, 0.018, m.chrome, -0.2 + i * 0.075, 1.276, -0.06 + (i % 2) * 0.03, { ry: 0.08 * (i - 3), cast: false, to: y });
    const bt = b.grp(-7.05, 0, 7.75, Math.PI / 2);
    for (const [x, z] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]]) { b.caster(x, z, bt); b.cyl(0.018, 0.018, 0.86, m.steel, x, 0.52, z, { cast: false, to: bt }); }
    b.box(0.68, 0.03, 1.5, m.steel, 0, 0.3, 0, { to: bt });
    b.box(0.72, 0.03, 1.56, m.drapeBlue, 0, 0.96, 0, { to: bt });
    for (const s of [-1, 1]) b.box(0.012, 0.36, 1.56, m.drapeBlue, s * 0.36, 0.8, 0, { cast: false, to: bt });
    b.box(0.42, 0.06, 0.5, m.steel, 0, 1.01, -0.35, { to: bt });
    for (let i = 0; i < 7; i++) b.box(0.012, 0.012, 0.36, m.chrome, -0.16 + i * 0.05, 1.05, -0.35, { cast: false, to: bt });
    for (const [z, r] of [[0.15, 0.12], [0.45, 0.09]]) { const bowl = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), m.chrome); bowl.position.set(-0.12, 0.98 + r, z); bt.add(bowl); }
    b.box(0.24, 0.07, 0.2, m.drapeGreen, 0.18, 1.01, 0.55, { r: 0.02, cast: false, to: bt });
    const p = b.grp(-9.95, 0, 6.75);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; b.box(0.04, 0.03, 0.34, m.steel, Math.sin(a) * 0.17, 0.08, Math.cos(a) * 0.17, { ry: a, cast: false, to: p }); b.caster(Math.sin(a) * 0.33, Math.cos(a) * 0.33, p); }
    b.cyl(0.018, 0.018, 2.15, m.chrome, 0, 1.15, 0, { to: p });
    for (const s of [-1, 1]) { b.box(0.15, 0.24, 0.05, m.clear, s * 0.15, 2.04, 0, { r: 0.02, cast: false, to: p }).renderOrder = 2; b.box(0.13, 0.16, 0.035, m.fluid, s * 0.15, 2.0, 0, { r: 0.015, cast: false, to: p }); b.rod([0, 2.2, 0], [s * 0.15, 2.17, 0], 0.008, m.chrome, p); }
    b.cyl(0.016, 0.016, 0.08, m.clear, 0.15, 1.78, 0, { cast: false, to: p });
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), m.fluid); drop.position.set(0.15, 1.8, 0); p.add(keep(drop)); k.my.drop = drop;
    b.box(0.22, 0.2, 0.14, m.white, 0.04, 1.3, 0.08, { r: 0.02, to: p });
    const pt = tex(k, 128, 64, (c) => { c.fillStyle = '#04140e'; c.fillRect(0, 0, 128, 64); txt(c, '125', 64, 26, '800 30px system-ui', '#39ff88', 'center'); txt(c, 'ml/h', 64, 52, '600 14px system-ui', '#8fd9b0', 'center'); });
    at(b.screen(0.13, 0.065, pt, 1.4, p), 0.04, 1.33, 0.152);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m.glowGreen.clone()); led.position.set(0.12, 1.24, 0.15); p.add(keep(led)); k.my.pumpLed = led;
    const kb = b.grp(-7.95, 0, 4.5);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; b.caster(Math.cos(a) * 0.22, Math.sin(a) * 0.22, kb); }
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd0d6dc, roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide })); bucket.position.y = 0.3; bucket.castShadow = true; kb.add(bucket);
  }
  // scrub trough against the glass, facing the table
  {
    const s = b.grp(-9.6, 0, Z0 + 0.38);
    b.box(1.5, 0.34, 0.58, m.steel, 0, 0.95, 0, { r: 0.03, to: s });
    b.box(1.38, 0.04, 0.46, mat(0x8d969e, { roughness: 0.3, metalness: 0.8 }), 0, 1.1, 0, { cast: false, to: s });
    b.box(1.5, 0.5, 0.04, m.steel, 0, 1.36, -0.28, { cast: false, to: s });
    for (const x of [-0.4, 0, 0.4]) { b.rod([x, 1.4, -0.26], [x, 1.55, -0.12], 0.015, m.chrome, s); const neck = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 8, 16, Math.PI), m.chrome); neck.position.set(x, 1.55, -0.04); neck.rotation.y = Math.PI / 2; s.add(neck); b.box(0.1, 0.18, 0.08, m.white, x + 0.18, 1.62, -0.24, { r: 0.02, cast: false, to: s }); }
    for (const x of [-0.65, 0.65]) b.cyl(0.025, 0.025, 0.78, m.steel, x, 0.39, 0.1, { cast: false, to: s });
    const lav = tex(k, 512, 96, (c) => { c.fillStyle = '#ffffff'; rr(c, 0, 0, 512, 96, 12); c.fill(); c.fillStyle = '#2b6cb0'; rr(c, 0, 0, 96, 96, 12); c.fill(); c.fillRect(70, 0, 26, 96); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(48, 18); c.quadraticCurveTo(70, 50, 48, 78); c.quadraticCurveTo(26, 50, 48, 18); c.fill(); txt(c, 'LAVADO QUIRÚRGICO', 112, 36, '800 34px system-ui', '#0f2f4f'); txt(c, 'Mínimo 3 minutos · uñas, manos, antebrazos', 112, 72, '600 21px system-ui', '#2b6cb0'); });
    at(b.sign(1.3, 0.24, lav, { to: s }), 0, 1.85, -0.255);
  }
  // left wall, inside the theatre: X-ray light box, OR panel, the corridor door, a red cross high up
  {
    const w = b.grp(LEFT_X, 0, 4.3, Math.PI / 2);
    b.box(1.62, 1.12, 0.09, m.offwhite, 0, 2.35, 0.045, { cast: false, to: w });
    const xp = b.screen(1.5, 1.03, tex(k, 512, 352, paintXray), 1.12, w); xp.position.set(0, 2.35, 0.092);
    b.box(1.62, 0.5, 0.06, m.dark, 0, 3.3, 0.03, { r: 0.02, cast: false, to: w });
    const pnl = k.my.panel = k.surface(512, 160);
    const pm = b.screen(1.54, 0.45, pnl, 1.3, w); pm.position.set(0, 3.3, 0.064); keep(pm);
    const d = b.grp(LEFT_X, 0, 7.25, Math.PI / 2);
    b.box(1.6, 2.4, 0.08, m.steel, 0, 1.2, 0.03, { cast: false, to: d });
    const leaf = mat(0x6fa8c4, { roughness: 0.35 });
    b.box(1.46, 2.3, 0.06, leaf, 0, 1.16, 0.08, { r: 0.02, cast: false, to: d });
    b.box(1.36, 0.3, 0.01, m.steel, 0, 0.17, 0.115, { cast: false, to: d });
    const port = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.05, metalness: 0.3 })); port.position.set(0, 1.62, 0.116); d.add(port);
    const pd = tex(k, 384, 96, (c) => { c.fillStyle = '#ffffff'; rr(c, 0, 0, 384, 96, 10); c.fill(); txt(c, 'PASILLO LIMPIO', 192, 34, '800 32px system-ui', '#0f2f4f', 'center'); txt(c, 'Acceso restringido', 192, 70, '600 22px system-ui', '#c81e1e', 'center'); });
    at(b.sign(0.9, 0.225, pd, { to: d }), 0, 2.6, 0.035);
    const rc = b.grp(LEFT_X + 0.06, 4.6, 7.25);
    b.box(0.06, 0.9, 0.9, m.white, 0, 0, 0, { r: 0.04, cast: false, to: rc });
    b.box(0.03, 0.66, 0.22, m.glowRed, 0.04, 0, 0, { cast: false, to: rc }); b.box(0.03, 0.22, 0.66, m.glowRed, 0.04, 0, 0, { cast: false, to: rc });
  }
  // the C-arm parked in the corner, and the fluoroscopy monitor cart
  {
    const ca = b.grp(-6.35, 0, 7.85, -0.75);
    for (const [x, z] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) b.caster(x, z, ca);
    b.box(0.7, 0.75, 1.2, m.white, 0, 0.5, 0, { r: 0.06, to: ca });
    b.box(0.72, 0.08, 1.22, m.teal, 0, 0.2, 0, { r: 0.03, cast: false, to: ca });
    b.box(0.26, 0.9, 0.26, m.white, 0, 1.3, 0.25, { r: 0.04, to: ca });
    b.box(0.22, 0.2, 0.7, m.offwhite, 0, 1.68, 0.6, { r: 0.04, to: ca });
    const c = b.grp(0, 1.45, 1.05, 0, ca); c.position.y = 1.45;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 12, 40, Math.PI * 1.15), m.white); arc.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.075 + Math.PI); arc.scale.set(1, 1, 1.6); arc.castShadow = true; c.add(arc);
    b.cyl(0.2, 0.2, 0.26, m.offwhite, 0, 0.55, 0.42, { seg: 28, to: c }); b.cyl(0.21, 0.21, 0.03, m.teal, 0, 0.42, 0.42, { seg: 28, cast: false, to: c });
    b.box(0.3, 0.22, 0.28, m.offwhite, 0, -0.62, 0.42, { r: 0.04, to: c });
    const ft = tex(k, 256, 64, (g2) => { g2.fillStyle = '#ffd400'; g2.fillRect(0, 0, 256, 64); g2.fillStyle = '#111'; g2.beginPath(); g2.moveTo(32, 8); g2.lineTo(58, 56); g2.lineTo(6, 56); g2.closePath(); g2.fill(); g2.fillStyle = '#ffd400'; g2.beginPath(); g2.arc(32, 40, 7, 0, TAU); g2.fill(); txt(g2, 'RAYOS X', 160, 34, '800 32px system-ui', '#111', 'center'); });
    for (const s of [-1, 1]) { const p = b.sign(0.5, 0.125, ft, { to: ca }); p.rotation.y = s * Math.PI / 2; p.position.set(s * 0.355, 0.62, 0); }
    const mc = b.grp(-12.2, 0, 2.75, 0.9);
    for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) b.caster(x, z, mc);
    b.box(0.72, 0.85, 0.55, m.white, 0, 0.55, 0, { r: 0.04, to: mc }); b.box(0.74, 0.06, 0.57, m.teal, 0, 0.98, 0, { cast: false, to: mc });
    b.cyl(0.05, 0.05, 0.75, m.steel, 0, 1.38, -0.05, { to: mc });
    const fl = tex(k, 256, 192, (g2) => {
      g2.fillStyle = '#000'; g2.fillRect(0, 0, 256, 192);
      const gr = g2.createRadialGradient(128, 96, 10, 128, 96, 90); gr.addColorStop(0, '#5d6066'); gr.addColorStop(1, '#0a0a0c'); g2.fillStyle = gr; g2.beginPath(); g2.arc(128, 96, 88, 0, TAU); g2.fill();
      g2.fillStyle = 'rgba(230,232,236,.8)'; for (let i = 0; i < 5; i++) { g2.beginPath(); g2.roundRect(112, 20 + i * 32, 32, 26, 6); g2.fill(); }
      g2.fillStyle = 'rgba(160,220,255,.95)'; g2.fillRect(86, 70, 84, 6); g2.fillRect(96, 64, 6, 18); g2.fillRect(154, 64, 6, 18);
      txt(g2, 'ESCOPIA · L3-L4', 8, 10, '600 11px system-ui', '#9fb3c2');
    });
    for (const s of [-1, 1]) { const mon = b.grp(s * 0.36, 1.9, 0, -s * 0.12, mc); mon.position.y = 1.9; b.box(0.66, 0.5, 0.05, m.dark, 0, 0, -0.01, { r: 0.015, to: mon }); b.screen(0.62, 0.465, fl, 1.1, mon).position.z = 0.017; }
    b.box(1.4, 0.06, 0.08, m.steel, 0, 1.7, -0.05, { cast: false, to: mc });
  }
  bake(or);
}

// ---------------------------------------------------------------- Cafetería de guardia (front, right of centre)
// A self-service coffee bar whose front faces the room and the camera: the counter runs along x with its back wall
// behind it (towards the desks), the sign lit on top. People take their mug and stand in front of the counter,
// turned to the room, sipping (spots.coffee). The back of the wall, seen from the desks, is the staff notice board.
function buildCafe(k) {
  const mat = (c, o) => mc(k, c, o);
  const m = M(k);
  const cf = k.my.cafe = new THREE.Group(); k.room.add(cf); cf.position.x = CAFE_DX;
  const b = kit(k, cf), block = (x0, z0, x1, z1) => k.block(x0 + CAFE_DX, z0, x1 + CAFE_DX, z1);
  const X0 = 3.35, X1 = 7.25, XC = (X0 + X1) / 2, WZ = 4.45, CZ0 = 4.5, CZ1 = 5.15, CZC = (CZ0 + CZ1) / 2, TOP = 1.0, WH = 2.5;
  // the café's wood floor with a walnut edge
  {
    const flat = (w, d, x, z, mm, y) => { const p = plane(w, d, mm); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; cf.add(p); return p; };
    const wd = tex(k, 512, 512, paintWoodFloor); wd.tex.wrapS = wd.tex.wrapT = THREE.RepeatWrapping; wd.tex.repeat.set(1.9, 1.4);
    flat(4.3, 2.95, 5.3, 5.8, new THREE.MeshStandardMaterial({ map: wd.tex, roughness: 0.55 }), 0.003);
    flat(4.4, 0.06, 5.3, 7.29, m.walnut, 0.004); flat(0.06, 2.98, 3.13, 5.8, m.walnut, 0.004); flat(0.06, 2.98, 7.47, 5.8, m.walnut, 0.004);
  }
  // the back wall: white, a walnut cap, tiled splashback on the café side, the staff notice board on the other
  {
    b.box(X1 - X0 + 0.1, WH, 0.12, m.white, XC, WH / 2, WZ - 0.0);
    b.box(X1 - X0 + 0.16, 0.06, 0.2, m.walnutDark, XC, WH + 0.03, WZ, { cast: false });
    for (const x of [X0 - 0.02, X1 + 0.02]) b.box(0.08, WH, 0.16, m.oak, x, WH / 2, WZ, { cast: false });
    const tile = tex(k, 256, 128, (c) => { c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#d9ece6'; for (let i = 0; i < 4; i++) c.fillRect(((i * 3) % 4) * 64 + 2, (i % 2) * 64 + 2, 60, 28); c.strokeStyle = '#cfc8bb'; c.lineWidth = 3; for (let y = 0; y <= 128; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); for (let x = (y / 32) % 2 ? 32 : 0; x <= 256; x += 64) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 32); c.stroke(); } } });
    tile.tex.wrapS = tile.tex.wrapT = THREE.RepeatWrapping; tile.tex.repeat.set(6, 1);
    at(b.sign(X1 - X0, 0.7, tile, { rough: 0.25 }), XC, TOP + 0.37, WZ + 0.062);
    b.box(X1 - X0, 0.03, 0.03, m.walnut, XC, TOP + 0.73, WZ + 0.07, { cast: false });
    // the staff notice board on the back (the side the desks see): cork, pinned posters and the shift rota
    const nb = tex(k, 1024, 420, (c) => {
      c.fillStyle = '#c49a6c'; c.fillRect(0, 0, 1024, 420);
      let s = 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 3000; i++) { c.fillStyle = rnd() > 0.5 ? 'rgba(90,60,30,.25)' : 'rgba(255,240,210,.25)'; c.fillRect(rnd() * 1024, rnd() * 420, 2, 2); }
      const poster = (x, y, w, h, bg, rot, draw) => { c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(rot); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-w / 2 + 5, -h / 2 + 6, w, h); c.fillStyle = bg; c.fillRect(-w / 2, -h / 2, w, h); draw(-w / 2, -h / 2, w, h); c.fillStyle = '#e23a46'; c.beginPath(); c.arc(0, -h / 2 + 12, 7, 0, TAU); c.fill(); c.restore(); };
      poster(30, 40, 250, 330, '#fbfaf6', -0.03, (x, y, w) => { txt(c, 'TURNOS', x + w / 2, y + 44, '800 34px system-ui', '#0f6f68', 'center'); txt(c, 'DE GUARDIA', x + w / 2, y + 80, '800 26px system-ui', '#0f6f68', 'center'); for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#e6f3f0' : '#ffffff'; c.fillRect(x + 16, y + 106 + i * 30, w - 32, 30); txt(c, ['L', 'M', 'X', 'J', 'V', 'S', 'D'][i], x + 30, y + 121 + i * 30, '700 18px system-ui', '#1d232a'); for (let j = 0; j < 3; j++) { c.fillStyle = ['#14a39a', '#f5c518', '#2b6cb0'][(i + j) % 3]; c.fillRect(x + 60 + j * 52, y + 112 + i * 30, 40, 18); } } });
      poster(310, 60, 230, 300, '#e23a46', 0.04, (x, y, w) => { c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x + w / 2, y + 70); c.bezierCurveTo(x + w / 2 + 70, y + 140, x + w / 2 + 40, y + 200, x + w / 2, y + 200); c.bezierCurveTo(x + w / 2 - 40, y + 200, x + w / 2 - 70, y + 140, x + w / 2, y + 70); c.fill(); txt(c, 'DONA', x + w / 2, y + 238, '900 40px system-ui', '#ffffff', 'center'); txt(c, 'SANGRE', x + w / 2, y + 276, '900 34px system-ui', '#ffffff', 'center'); });
      poster(570, 36, 230, 200, '#2b6cb0', -0.05, (x, y, w) => { txt(c, 'CURSO', x + w / 2, y + 50, '800 30px system-ui', '#bfe0ff', 'center'); txt(c, 'RCP', x + w / 2, y + 112, '900 74px system-ui', '#ffffff', 'center'); txt(c, 'jueves · aula 2', x + w / 2, y + 170, '600 22px system-ui', '#ffffff', 'center'); });
      poster(820, 50, 180, 180, '#fde68a', 0.06, (x, y, w) => { txt(c, '¡Gracias', x + w / 2, y + 70, 'italic 700 30px Georgia, serif', '#3b2a1e', 'center'); txt(c, 'equipo!', x + w / 2, y + 108, 'italic 700 30px Georgia, serif', '#3b2a1e', 'center'); txt(c, '— familia cama 12', x + w / 2, y + 150, '500 16px Georgia, serif', '#6b4a32', 'center'); });
      poster(600, 260, 380, 130, '#ffffff', 0.01, (x, y, w) => { c.fillStyle = '#14a39a'; c.fillRect(x, y, 90, 130); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x + 45, y + 22); c.quadraticCurveTo(x + 76, y + 64, x + 45, y + 100); c.quadraticCurveTo(x + 14, y + 64, x + 45, y + 22); c.fill(); txt(c, 'HIGIENE DE MANOS', x + 104, y + 46, '800 30px system-ui', '#0f2f2b'); txt(c, '5 momentos · 40 segundos', x + 104, y + 88, '600 24px system-ui', '#14776f'); });
    });
    const back = b.sign(3.6, 1.48, nb, { rough: 0.9 }); back.rotation.y = Math.PI; back.position.set(XC, 1.55, WZ - 0.062);
    b.box(3.7, 1.58, 0.03, m.walnut, XC, 1.55, WZ - 0.07, { cast: false });
    const ft = tex(k, 512, 64, (c) => { c.fillStyle = '#0f6f68'; c.fillRect(0, 0, 512, 64); txt(c, 'TABLÓN DEL PERSONAL', 256, 34, '800 34px system-ui', '#ffffff', 'center'); });
    const fl = b.sign(1.6, 0.2, ft); fl.rotation.y = Math.PI; fl.position.set(XC, 2.42, WZ - 0.065);
  }
  // the counter: oak doors facing the room, a white quartz top, a warm line of light under its front edge
  {
    b.box(X1 - X0, TOP - 0.1, CZ1 - CZ0, m.oak, XC, (TOP - 0.1) / 2 + 0.06, CZC);
    b.box(X1 - X0 - 0.06, 0.06, CZ1 - CZ0 - 0.06, m.dark, XC, 0.03, CZC - 0.03, { cast: false });
    for (let i = 0; i < 5; i++) { const x = X0 + 0.42 + i * 0.66; b.box(0.62, 0.78, 0.012, m.walnut, x, 0.5, CZ1 + 0.006, { cast: false }); b.box(0.03, 0.22, 0.03, m.steel, x + 0.25, 0.62, CZ1 + 0.02, { cast: false }); }
    b.box(X1 - X0 + 0.08, 0.045, CZ1 - CZ0 + 0.08, m.white, XC, TOP + 0.02, CZC + 0.02, { r: 0.012 });
    b.box(X1 - X0 - 0.1, 0.025, 0.02, m.glowWarm, XC, TOP - 0.03, CZ1 + 0.03, { cast: false });
    // a little glass-door fridge at the right end, lit inside, with milk
    const fx = 6.85;
    b.box(0.6, 0.66, 0.02, m.glass, fx, 0.45, CZ1 + 0.02, { cast: false }).renderOrder = 2;
    b.box(0.54, 0.6, 0.01, m.glowWhite.clone(), fx, 0.45, CZ1 - 0.1, { cast: false }).material.color.setScalar(0.6);
    for (let i = 0; i < 4; i++) { b.cyl(0.035, 0.035, 0.16, m.white, fx - 0.15 + Math.floor(i / 2) * 0.3, 0.27 + (i % 2) * 0.26, CZ1 - 0.15, { cast: false }); b.cyl(0.02, 0.02, 0.03, m.drapeBlue, fx - 0.15 + Math.floor(i / 2) * 0.3, 0.37 + (i % 2) * 0.26, CZ1 - 0.15, { cast: false }); }
  }
  // open shelves with mugs and jars over the right half, the chalk menu on the left
  {
    for (const y of [1.92, 2.26]) {
      b.box(1.9, 0.035, 0.26, m.oak, 6.15, y, WZ + 0.19);
      for (let i = 0; i < 8; i++) {
        const x = 5.35 + i * 0.23;
        if (y > 2 && i % 3 === 1) { b.cyl(0.06, 0.06, 0.2, m.clear, x, y + 0.12, WZ + 0.19, { cast: false }); b.cyl(0.055, 0.055, 0.12, mat(i % 2 ? 0x6b3f22 : 0xd9b38c), x, y + 0.08, WZ + 0.19, { cast: false }); continue; }
        b.cyl(0.05, 0.045, 0.1, [m.white, m.teal, m.white, m.yellow, m.white, m.red, m.white, m.drapeBlue][i], x, y + 0.068, WZ + 0.19, { cast: false, seg: 14 });
      }
    }
    const menu = tex(k, 320, 256, (c) => {
      c.fillStyle = '#6b4a32'; c.fillRect(0, 0, 320, 256); c.fillStyle = '#1f2a26'; c.fillRect(10, 10, 300, 236);
      txt(c, 'Menú de guardia', 160, 38, '700 30px Georgia, serif', '#f6efe1', 'center');
      c.strokeStyle = 'rgba(246,239,225,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(40, 60); c.lineTo(280, 60); c.stroke();
      [['Café solo', '0,90'], ['Cortado', '1,00'], ['Café con leche', '1,20'], ['Infusión', '0,80'], ['Cruasán', '1,10']].forEach(([a, p], i) => { txt(c, a, 34, 88 + i * 30, '500 21px Georgia, serif', '#f6efe1'); txt(c, `${p} €`, 288, 88 + i * 30, '600 21px Georgia, serif', '#ffd9a0', 'right'); });
      txt(c, '¡Ánimo con la guardia!', 160, 236, 'italic 500 17px Georgia, serif', '#9fe3d6', 'center');
    });
    at(b.sign(1.0, 0.8, menu, { rough: 0.9 }), 4.25, 2.1, WZ + 0.075);
    const clk = tex(k, 256, 96, (c) => { c.fillStyle = '#fbf5ea'; rr(c, 0, 0, 256, 96, 14); c.fill(); txt(c, 'OFFICE DE', 128, 34, '800 26px system-ui', '#14776f', 'center'); txt(c, 'ENFERMERÍA', 128, 66, '800 26px system-ui', '#14776f', 'center'); });
    at(b.sign(0.52, 0.2, clk), 5.0, 2.08, WZ + 0.07);
  }
  // the sign along the top of the wall, lit, facing the room: nothing crosses it
  {
    const st = tex(k, 1024, 200, (c) => {
      c.fillStyle = '#fbf5ea'; rr(c, 0, 0, 1024, 200, 24); c.fill();
      c.fillStyle = '#6b4a32'; c.fillRect(0, 160, 1024, 40);
      c.fillStyle = '#0f6f68'; rr(c, 40, 62, 106, 82, 16); c.fill(); c.strokeStyle = '#0f6f68'; c.lineWidth = 12; c.beginPath(); c.arc(150, 101, 23, -1.3, 1.3); c.stroke();
      c.strokeStyle = '#14a39a'; c.lineWidth = 8; c.lineCap = 'round'; for (const x of [70, 94, 118]) { c.beginPath(); c.moveTo(x, 52); c.bezierCurveTo(x - 12, 36, x + 12, 26, x, 10); c.stroke(); }
      txt(c, 'CAFETERÍA DE GUARDIA', 590, 70, fit(c, 'CAFETERÍA DE GUARDIA', 780, 900, 76, 40), '#3b2a1e', 'center');
      txt(c, 'Personal sanitario · abierta 24 h', 590, 128, '600 34px system-ui', '#14776f', 'center');
      txt(c, 'Un café, un respiro, y de vuelta a planta', 512, 181, 'italic 600 24px Georgia, serif', '#fbf5ea', 'center');
    });
    b.box(3.5, 0.72, 0.08, m.walnutDark, XC, WH + 0.42, WZ, { cast: false });
    at(b.sign(3.42, 0.668, st, { lit: 1.02 }), XC, WH + 0.42, WZ + 0.042);
  }
  // three pendant lamps over the back of the counter, hung from short arms under the sign
  {
    const shade = mat(0x1f3b3a, { roughness: 0.4, side: THREE.DoubleSide });
    const bulbM = k.my.cafeBulb = k.glow(0xffd59a, 2.6);
    for (const x of [4.0, 5.3, 6.6]) {
      b.box(0.04, 0.04, 0.42, m.walnutDark, x, WH - 0.04, WZ + 0.27, { cast: false });
      b.cyl(0.006, 0.006, 0.18, m.black, x, WH - 0.14, WZ + 0.46, { cast: false });
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.17, 24, 1, true), shade); s.position.set(x, WH - 0.31, WZ + 0.46); s.castShadow = true; cf.add(s);
      b.cyl(0.05, 0.05, 0.03, m.oak, x, WH - 0.22, WZ + 0.46, { cast: false });
      b.sph(0.045, bulbM, x, WH - 0.37, WZ + 0.46, { cast: false });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 6, 28), bulbM); rim.rotation.x = Math.PI / 2; rim.position.set(x, WH - 0.395, WZ + 0.46); cf.add(rim);
    }
    const pl = k.my.cafeLight = new THREE.PointLight(0xffc27a, 6, 8, 1.4); pl.position.set(5.2, 2.3, 6.9); cf.add(pl);
    (k.my.lamps = k.my.lamps || []).push([pl, 16, 3]);
  }
  // on the counter: espresso machine facing the room, grinder, cup tree, cups, pastries under a dome
  {
    const e = b.grp(6.1, TOP + 0.045, 4.82, -0.12); e.scale.setScalar(1.25);
    const red = mat(0xb3202c, { roughness: 0.3, metalness: 0.2 });
    b.box(0.66, 0.4, 0.46, m.chrome, 0, 0.24, -0.02, { r: 0.03, to: e });
    b.box(0.6, 0.2, 0.02, red, 0, 0.3, 0.215, { r: 0.01, to: e, cast: false });
    b.box(0.68, 0.04, 0.48, m.dark, 0, 0.46, -0.02, { to: e });
    for (let i = 0; i < 6; i++) b.cyl(0.03, 0.025, 0.045, m.white, -0.24 + i * 0.095, 0.505, -0.02 + (i % 2) * 0.1, { to: e, cast: false, seg: 12 });
    for (const x of [-0.16, 0.16]) {
      b.cyl(0.045, 0.04, 0.05, m.chrome, x, 0.19, 0.24, { to: e, cast: false });
      b.box(0.03, 0.03, 0.18, m.black, x, 0.16, 0.34, { to: e, cast: false });
      b.cyl(0.03, 0.025, 0.045, m.white, x, 0.045, 0.22, { to: e, cast: false, seg: 12 });
    }
    b.box(0.6, 0.025, 0.16, m.steel, 0, 0.012, 0.25, { to: e, cast: false });
    b.rod([0.29, 0.3, 0.2], [0.33, 0.08, 0.3], 0.008, m.chrome, e);
    const gauge = mc(k, 0xf4efe6, { roughness: 0.3 });
    for (const x of [-0.08, 0.08]) { b.cyl(0.035, 0.035, 0.01, gauge, x, 0.3, 0.225, { to: e, cast: false, rx: Math.PI / 2 }); b.box(0.004, 0.03, 0.004, m.dark, x, 0.31, 0.232, { to: e, cast: false, rz: 0.6 }); }
    const led = k.my.cafeLed = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 0.6), toneMapped: false });
    for (const [x, c] of [[-0.25, led], [-0.21, m.glowAmber], [0.21, m.glowAmber], [0.25, led]]) b.box(0.025, 0.018, 0.01, c, x, 0.3, 0.228, { to: e, cast: false });
    const logo = tex(k, 256, 48, (c) => { c.clearRect(0, 0, 256, 48); txt(c, 'GUARDIA ESPRESSO', 128, 26, '800 22px system-ui', '#ffffff', 'center'); });
    at(b.sign(0.44, 0.08, logo, { to: e }), 0, 0.405, 0.227).material.transparent = true;
    // steam puffs (animated in tick)
    const sm = k.my.steamMat = new THREE.SpriteMaterial({ map: tex(k, 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }).tex, transparent: true, depthWrite: false, opacity: 0.6, color: 0xe8f0f2 });
    k.my.steam = [];
    const wp = new THREE.Vector3(0.33, 0.12, 0.32);
    for (let i = 0; i < 5; i++) { const p = new THREE.Sprite(sm); p.scale.setScalar(0.12); p.userData.base = wp.clone(); p.userData.ph = i / 5; e.add(keep(p)); k.my.steam.push(p); }
    // a mug waiting under the left group head
    b.cyl(0.045, 0.04, 0.09, m.teal, -0.16, 0.07, 0.22, { to: e, cast: false, seg: 14 });
    // grinder with beans
    b.box(0.2, 0.3, 0.24, m.black, 6.82, TOP + 0.2, 4.8, { r: 0.02 });
    b.cyl(0.08, 0.05, 0.22, m.clear, 6.82, TOP + 0.46, 4.8, { cast: false }).renderOrder = 2;
    b.cyl(0.07, 0.045, 0.14, mat(0x4a2a17, { roughness: 0.9 }), 6.82, TOP + 0.42, 4.8, { cast: false });
    // cup tree
    const ctx = 3.75, ctz = 4.85;
    b.cyl(0.08, 0.09, 0.02, m.walnut, ctx, TOP + 0.055, ctz, { cast: false }); b.cyl(0.012, 0.012, 0.42, m.walnut, ctx, TOP + 0.26, ctz, { cast: false });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU, y = TOP + 0.22 + (i % 2) * 0.13;
      b.rod([ctx, y, ctz], [ctx + Math.cos(a) * 0.1, y + 0.03, ctz + Math.sin(a) * 0.1], 0.006, m.walnut);
      b.cyl(0.04, 0.035, 0.08, [m.teal, m.white, m.yellow, m.red, m.white, m.drapeBlue][i], ctx + Math.cos(a) * 0.14, y - 0.02, ctz + Math.sin(a) * 0.14, { cast: false, seg: 12 });
    }
    // paper cups, lids, sugar jar and stirrers, a napkin box and the tip jar
    for (let i = 0; i < 2; i++) b.cyl(0.045, 0.035, 0.32, m.white, 5.05 + i * 0.12, TOP + 0.2, 4.72, { cast: false, seg: 14 });
    b.cyl(0.05, 0.05, 0.12, m.clear, 5.4, TOP + 0.1, 4.75, { cast: false }); b.cyl(0.045, 0.045, 0.06, m.white, 5.4, TOP + 0.07, 4.75, { cast: false });
    b.cyl(0.035, 0.035, 0.1, m.steel, 5.6, TOP + 0.09, 4.8, { cast: false }); for (let i = 0; i < 4; i++) b.rod([5.6, TOP + 0.1, 4.8], [5.6 + (i - 1.5) * 0.015, TOP + 0.2, 4.8 + (i % 2) * 0.01], 0.003, mat(0xd9b38c));
    b.box(0.16, 0.08, 0.1, m.walnut, 5.2, TOP + 0.08, 5.0, { cast: false, r: 0.01 }); b.box(0.1, 0.03, 0.06, m.sheet, 5.2, TOP + 0.13, 5.0, { cast: false });
    b.cyl(0.05, 0.05, 0.12, m.clear, 5.55, TOP + 0.1, 5.02, { cast: false }).renderOrder = 2; b.cyl(0.04, 0.04, 0.03, mat(0xc9a35a, { metalness: 0.7, roughness: 0.3 }), 5.55, TOP + 0.06, 5.02, { cast: false });
    const pz = 4.85, px = 4.35;
    b.cyl(0.2, 0.2, 0.02, m.white, px, TOP + 0.06, pz, { cast: false });
    const crois = mat(0xd8953f, { roughness: 0.6 });
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.03, 8, 12, Math.PI * 1.1), crois); c.rotation.set(-Math.PI / 2, 0, i * 2.1); c.position.set(px + Math.cos(i * 2.1) * 0.08, TOP + 0.1, pz + Math.sin(i * 2.1) * 0.08); cf.add(c); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 10, 0, TAU, 0, Math.PI / 2), m.clear); dome.position.set(px, TOP + 0.07, pz); dome.renderOrder = 2; cf.add(dome);
    b.sph(0.02, m.chrome, px, TOP + 0.3, pz, { cast: false });
    // a fruit bowl
    b.cyl(0.14, 0.09, 0.07, m.white, 4.75, TOP + 0.075, 4.9, { cast: false });
    for (let i = 0; i < 4; i++) b.sph(0.045, [m.red, m.yellow, m.leaf2, m.orange][i], 4.75 + Math.cos(i * 1.6) * 0.06, TOP + 0.13, 4.9 + Math.sin(i * 1.6) * 0.06, { cast: false });
  }
  // a high round table with two stools, a vase and the newspaper; a tall plant at the open corner
  {
    const tx = 6.8, tz = 6.4;
    b.cyl(0.24, 0.26, 0.03, m.dark, tx, 0.015, tz, { cast: false }); b.cyl(0.03, 0.03, 1.02, m.steel, tx, 0.53, tz);
    b.cyl(0.38, 0.38, 0.04, m.oak, tx, 1.05, tz, { seg: 32 });
    b.cyl(0.04, 0.05, 0.16, m.tealSoft, tx + 0.1, 1.15, tz - 0.08, { cast: false }); b.rod([tx + 0.1, 1.2, tz - 0.08], [tx + 0.13, 1.42, tz - 0.1], 0.006, m.leaf1); b.sph(0.04, m.yellow, tx + 0.13, 1.43, tz - 0.1, { cast: false });
    b.cyl(0.04, 0.035, 0.09, m.white, tx - 0.15, 1.115, tz + 0.05, { cast: false, seg: 12 });
    const np = tex(k, 256, 180, (c) => { c.fillStyle = '#f3f1ea'; c.fillRect(0, 0, 256, 180); txt(c, 'DIARIO MÉDICO', 128, 22, '800 24px Georgia, serif', '#1d232a', 'center'); c.fillStyle = '#1d232a'; c.fillRect(10, 38, 236, 2); for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(30,35,42,.45)'; c.fillRect(12 + (i % 2) * 120, 52 + Math.floor(i / 2) * 24, 110, 5); } c.fillStyle = '#9cb6c4'; c.fillRect(132, 52, 112, 60); });
    const npm = b.sign(0.34, 0.24, np, { rough: 0.9 }); npm.rotation.set(-Math.PI / 2, 0, 0.4); npm.position.set(tx - 0.05, 1.073, tz + 0.12);
    for (const [x, z] of [[7.15, 6.85], [6.35, 6.85]]) { b.cyl(0.2, 0.2, 0.06, m.teal, x, 0.78, z, { seg: 20 }); b.cyl(0.025, 0.025, 0.75, m.steel, x, 0.39, z, { cast: false }); const r = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 20), m.steel); r.rotation.x = Math.PI / 2; r.position.set(x, 0.3, z); cf.add(r); b.cyl(0.18, 0.2, 0.02, m.dark, x, 0.01, z, { cast: false }); }
    block(6.3, 5.95, 7.4, 7.1);
    b.plant(3.5, 6.85, 0.85);
    block(3.15, 6.5, 3.85, 7.2);
  }
  block(X0 - 0.1, WZ - 0.12, X1 + 0.1, CZ1 + 0.05);
  bake(cf);
}

// ---------------------------------------------------------------- the rest of the floor
function buildFloor(k) {
  const { room, C: { BACK_Z, LEFT_X } } = k, mat = (c, o) => mc(k, c, o);
  const m = M(k), b = kit(k, room);
  const zone = new THREE.Group(); room.add(zone);
  const z = kit(k, zone);
  // sign over the board (as long as the board under it)
  {
    const W = 1600, H = 140;
    const bq = tex(k, W, H, (c) => {
      c.fillStyle = '#0f6f68'; rr(c, 0, 0, W, H, 16); c.fill();
      c.fillStyle = '#14a39a'; c.fillRect(0, H - 14, W, 14);
      c.fillStyle = '#ffffff'; rr(c, 22, 18, 96, 96, 14); c.fill(); crossIcon(c, 70, 66, 64, '#0f6f68');
      const right = 'Quirófanos 1–4  →', x0 = 150;
      c.font = '600 40px system-ui'; const rw = c.measureText(right).width;
      txt(c, 'PLANTA 3 · CIRUGÍA Y HOSPITALIZACIÓN', x0, 66, fit(c, 'PLANTA 3 · CIRUGÍA Y HOSPITALIZACIÓN', W - 40 - rw - 60 - x0, 800, 60, 30), '#ffffff');
      txt(c, right, W - 40, 66, '600 40px system-ui', '#bff3ea', 'right');
    });
    const p = z.sign(8.2, 0.72, bq); p.rotation.y = Math.PI / 2; p.position.set(LEFT_X + 0.02, 6.2, -3.2);
  }
  // back-left corner: medicines cabinet with glass doors (under the clock)
  {
    const c = z.grp(-11.75, 0, BACK_Z + 0.3);
    const W = 1.8, H = 3.3, D = 0.48;
    z.box(W, 0.95, D, m.white, 0, 0.475, 0, { r: 0.02, to: c });
    for (let i = 0; i < 3; i++) { z.box(W - 0.08, 0.27, 0.01, m.offwhite, 0, 0.17 + i * 0.3, D / 2 + 0.005, { cast: false, to: c }); z.box(0.3, 0.025, 0.03, m.steel, 0, 0.26 + i * 0.3, D / 2 + 0.02, { cast: false, to: c }); }
    z.box(W, H - 1.0, 0.03, mat(0xeaf3f2), 0, 1.0 + (H - 1.0) / 2, -D / 2 + 0.015, { cast: false, to: c });
    for (const s of [-1, 1]) z.box(0.05, H - 1.0, D, m.white, s * (W / 2 - 0.025), 1.0 + (H - 1.0) / 2, 0, { cast: false, to: c });
    z.box(W, 0.06, D, m.white, 0, H, 0, { cast: false, to: c });
    const names = ['Paracetamol', 'Heparina', 'Amoxicilina', 'Ibuprofeno', 'Midazolam', 'Suero 0,9%'], doses = ['1 g', '5000 UI', '500 mg', '600 mg', '15 mg', '500 ml'];
    const boxM = ['#e23a46', '#2b6cb0', '#16a34a', '#f59e0b', '#7c3aed', '#0ea5e9'].map((col, i) => new THREE.MeshStandardMaterial({ roughness: 0.6, map: tex(k, 128, 64, (g2) => { g2.fillStyle = '#fbfcfd'; g2.fillRect(0, 0, 128, 64); g2.fillStyle = col; g2.fillRect(0, 0, 128, 14); g2.fillRect(0, 54, 128, 10); txt(g2, names[i], 64, 32, '700 15px system-ui', '#1d2a33', 'center'); txt(g2, doses[i], 64, 46, '600 11px system-ui', col, 'center'); }).tex }));
    const amber = new THREE.MeshStandardMaterial({ color: 0xb4651d, roughness: 0.15, transparent: true, opacity: 0.85 });
    for (let r = 0; r < 4; r++) {
      const y = 1.03 + r * 0.56;
      z.box(W - 0.1, 0.025, D - 0.06, m.glass, 0, y, 0, { cast: false, to: c });
      let x = -W / 2 + 0.12, n = 0;
      while (x < W / 2 - 0.16) {
        const kind = (r * 5 + n * 3) % 7;
        if (kind < 4) { const w = 0.16 + (n % 3) * 0.04, h = 0.18 + ((r + n) % 3) * 0.06; z.box(w, h, 0.22, boxM[(r * 2 + n) % boxM.length], x + w / 2, y + 0.012 + h / 2, -0.02, { cast: false, to: c }); x += w + 0.03; }
        else if (kind < 6) { for (let j = 0; j < 3; j++) z.cyl(0.035, 0.035, 0.13, amber, x + 0.04 + j * 0.08, y + 0.08, 0.05, { cast: false, seg: 10, to: c }); x += 0.26; }
        else { z.cyl(0.06, 0.06, 0.22, m.clear, x + 0.07, y + 0.12, 0, { cast: false, seg: 12, to: c }); x += 0.18; }
        n++;
      }
    }
    for (const s of [-1, 1]) { z.box(W / 2 - 0.04, H - 1.06, 0.015, m.glass, s * (W / 4), 1.0 + (H - 1.0) / 2, D / 2 + 0.01, { cast: false, to: c }).renderOrder = 3; z.box(0.025, 0.3, 0.03, m.chrome, s * 0.07, 2.1, D / 2 + 0.04, { cast: false, to: c }); }
    const ft = tex(k, 256, 64, (g2) => { g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, 256, 64); crossIcon(g2, 32, 32, 40, '#16a34a'); txt(g2, 'BOTIQUÍN', 62, 34, '800 34px system-ui', '#14532d'); });
    at(z.sign(0.9, 0.22, ft, { to: c }), 0, H - 0.2, D / 2 + 0.03);
    // waste bins along the left wall (general, biohazard, sharps)
    const w = z.grp(LEFT_X + 0.38, 0, -7.6);
    [[0x9aa4ae, 0], [0xf5c518, 0.55], [0xd62839, 1.05]].forEach(([col, zz], i) => {
      z.box(0.45, 0.7, 0.45, mat(col, { roughness: 0.45 }), 0, 0.36, zz, { r: 0.04, to: w }); z.box(0.48, 0.06, 0.48, i === 1 ? mat(0xd4a50e) : m.dark, 0, 0.74, zz, { r: 0.02, cast: false, to: w });
      if (i === 1) { const bt = tex(k, 128, 128, (g2) => { g2.fillStyle = '#f5c518'; g2.fillRect(0, 0, 128, 128); g2.strokeStyle = '#111'; g2.lineWidth = 7; for (let j = 0; j < 3; j++) { const a = j * TAU / 3 - Math.PI / 2; g2.beginPath(); g2.arc(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18, 20, 0, TAU); g2.stroke(); } g2.beginPath(); g2.arc(64, 64, 9, 0, TAU); g2.stroke(); txt(g2, 'BIOPELIGRO', 64, 116, '800 15px system-ui', '#111', 'center'); }); const bp = z.sign(0.3, 0.3, bt, { to: w }); bp.rotation.y = Math.PI / 2; bp.position.set(0.228, 0.42, zz); }
    });
  }
  // right side: automated dispensing cabinet ("Farmacia de planta") and supply shelving
  {
    const d = z.grp(12.35, 0, -1.55, -Math.PI / 2 + 0.45);
    z.box(1.25, 2.05, 0.62, m.white, 0, 1.025, 0, { r: 0.03, to: d });
    z.box(1.27, 0.12, 0.64, m.teal, 0, 2.0, 0, { cast: false, to: d });
    z.box(1.1, 0.42, 0.12, m.offwhite, 0, 1.38, 0.33, { rx: -0.35, to: d });
    const ds = tex(k, 256, 160, (c) => { c.fillStyle = '#05212a'; c.fillRect(0, 0, 256, 160); c.fillStyle = '#14a39a'; c.fillRect(0, 0, 256, 30); txt(c, 'DISPENSACIÓN', 128, 16, '800 18px system-ui', '#ffffff', 'center'); txt(c, 'Identifíquese', 128, 62, '700 22px system-ui', '#e6f6f3', 'center'); c.fillStyle = '#39d98a'; rr(c, 58, 88, 140, 44, 10); c.fill(); txt(c, 'HUELLA', 128, 111, '800 20px system-ui', '#06202a', 'center'); });
    const sp = z.screen(0.62, 0.38, ds, 1.2, d); sp.position.set(-0.15, 1.39, 0.4); sp.rotation.x = -0.35;
    const ledM = k.glow(0x39d98a, 1.6), ledA = k.glow(0xffb020, 1.8);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { z.box(0.26, 0.17, 0.012, m.offwhite, -0.42 + c * 0.28, 0.2 + r * 0.2, 0.315, { cast: false, to: d }); z.box(0.04, 0.02, 0.01, (r + c) % 5 === 1 ? ledA : ledM, -0.42 + c * 0.28 + 0.08, 0.26 + r * 0.2, 0.323, { cast: false, to: d }); }
    const ft = tex(k, 384, 80, (g2) => { g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, 384, 80); crossIcon(g2, 40, 40, 46, '#16a34a'); txt(g2, 'FARMACIA DE PLANTA', 74, 42, fit(g2, 'FARMACIA DE PLANTA', 300, 800, 32), '#14532d'); });
    at(z.sign(1.1, 0.23, ft, { to: d }), 0, 1.78, 0.315);
    for (const [sz, ry] of [[0.55, -Math.PI / 2 + 0.3], [1.85, -Math.PI / 2 + 0.3]]) {
      const s = z.grp(12.45, 0, sz, ry);
      for (const [x, zz] of [[-0.58, -0.22], [0.58, -0.22], [-0.58, 0.22], [0.58, 0.22]]) z.cyl(0.015, 0.015, 1.9, m.chrome, x, 0.95, zz, { cast: false, to: s });
      const bins = [m.drapeBlue, m.yellow, m.teal, m.red, m.white];
      for (let r = 0; r < 4; r++) {
        z.box(1.2, 0.02, 0.48, m.steel, 0, 0.2 + r * 0.5, 0, { cast: false, to: s });
        for (let i = 0; i < 3; i++) z.box(0.34, 0.2, 0.4, bins[(r * 3 + i + (sz > 1 ? 2 : 0)) % bins.length], -0.38 + i * 0.38, 0.31 + r * 0.5, 0, { r: 0.02, cast: false, to: s });
      }
    }
  }
  // back-right: crash cart with defibrillator; linen cart
  {
    const c = z.grp(12.2, 0, -4.4, -Math.PI / 2 + 0.35);
    for (const [x, zz] of [[-0.33, -0.24], [0.33, -0.24], [-0.33, 0.24], [0.33, 0.24]]) z.caster(x, zz, c);
    z.box(0.78, 0.95, 0.56, m.red, 0, 0.6, 0, { r: 0.03, to: c });
    for (let i = 0; i < 5; i++) { z.box(0.72, 0.006, 0.01, mat(0x8f1420), 0, 0.3 + i * 0.17, 0.283, { cast: false, to: c }); z.box(0.26, 0.02, 0.03, m.chrome, 0, 0.38 + i * 0.17, 0.29, { cast: false, to: c }); }
    z.box(0.84, 0.05, 0.62, m.grey, 0, 1.1, 0, { r: 0.015, to: c });
    const lt = tex(k, 480, 72, (g2) => { g2.fillStyle = '#8f1420'; rr(g2, 0, 0, 480, 72, 10); g2.fill(); txt(g2, 'CARRO DE PARADAS', 240, 38, '900 42px system-ui', '#ffffff', 'center'); });
    at(z.sign(0.74, 0.11, lt, { to: c }), 0, 1.0, 0.288);
    z.box(0.46, 0.3, 0.32, mat(0xf2c230, { roughness: 0.4 }), -0.08, 1.28, -0.04, { r: 0.03, to: c });
    const dt = k.my.defib = k.surface(256, 128); dt.ctx.fillStyle = '#02070b'; dt.ctx.fillRect(0, 0, 256, 128); txt(dt.ctx, 'DEA · LISTO', 6, 11, '600 12px system-ui', '#8fb6c9');
    const dp = z.screen(0.22, 0.12, dt, 1.4, c); dp.position.set(-0.13, 1.31, 0.122); keep(dp);
    k.my.defibDraw = sweeper(dt.ctx, 6, 250, [{ y0: 18, y1: 124, fn: (t) => ecgWave(t * 0.92, 80), color: '#39ff88', w: 3 }], 90);
    z.cyl(0.08, 0.08, 0.75, m.white, 0.47, 0.6, 0.0, { to: c });
    const l = z.grp(12.25, 0, -7.7);
    for (const [x, zz] of [[-0.28, -0.55], [0.28, -0.55], [-0.28, 0.55], [0.28, 0.55]]) { z.caster(x, zz, l); z.cyl(0.015, 0.015, 1.5, m.chrome, x, 0.85, zz, { cast: false, to: l }); }
    const lin = [m.drapeBlue, m.sheet, m.drapeGreen, m.blanket];
    for (let r = 0; r < 3; r++) { z.box(0.6, 0.02, 1.15, m.chrome, 0, 0.25 + r * 0.55, 0, { cast: false, to: l }); for (let j = 0; j < 3; j++) for (let s = 0; s < 3 - ((r + j) % 2); s++) z.box(0.44, 0.075, 0.3, lin[(r + j + s) % 4], 0.0, 0.3 + r * 0.55 + s * 0.08, -0.36 + j * 0.36, { r: 0.025, cast: false, to: l }); }
  }
  // right front: wheelchair, water cooler, waiting bench, a plant; hand sanitiser by the theatre door
  {
    const w = z.grp(12.1, 0, 3.55, -2.3);
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 8, 28), m.rubber); wheel.rotation.y = Math.PI / 2; wheel.position.set(s * 0.3, 0.31, -0.05); wheel.castShadow = true; w.add(wheel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.008, 6, 28), m.chrome); rim.rotation.y = Math.PI / 2; rim.position.set(s * 0.33, 0.31, -0.05); w.add(rim);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 6; z.rod([s * 0.3, 0.31 + Math.sin(a) * 0.27, -0.05 + Math.cos(a) * 0.27], [s * 0.3, 0.31 - Math.sin(a) * 0.27, -0.05 - Math.cos(a) * 0.27], 0.004, m.chrome, w); }
      z.cyl(0.05, 0.05, 0.03, m.rubber, s * 0.22, 0.05, 0.38, { rz: Math.PI / 2, cast: false, to: w });
      z.rod([s * 0.24, 0.5, -0.2], [s * 0.24, 1.0, -0.3], 0.014, m.steel, w); z.rod([s * 0.24, 1.0, -0.3], [s * 0.24, 1.0, -0.42], 0.016, m.rubber, w);
      z.rod([s * 0.24, 0.5, -0.2], [s * 0.22, 0.12, 0.38], 0.012, m.steel, w);
      z.box(0.05, 0.03, 0.34, m.dark, s * 0.25, 0.72, 0.0, { cast: false, to: w });
    }
    z.box(0.46, 0.04, 0.42, m.navy, 0, 0.5, 0.02, { to: w }); z.box(0.46, 0.4, 0.03, m.navy, 0, 0.75, -0.24, { rx: -0.12, to: w });
    const wc = z.grp(12.55, 0, -3.05);
    z.box(0.36, 1.0, 0.36, m.white, 0, 0.5, 0, { r: 0.03, to: wc });
    const wcm = new THREE.MeshStandardMaterial({ color: 0x7cc4ff, roughness: 0.05, transparent: true, opacity: 0.55 });
    z.cyl(0.15, 0.15, 0.4, wcm, 0, 1.24, 0, { cast: false, to: wc }).renderOrder = 2;
    const bn = z.grp(12.45, 0, 6.6, -Math.PI / 2);
    z.box(2.1, 0.05, 0.08, m.steel, 0, 0.4, 0, { to: bn }); for (const x of [-0.85, 0.85]) z.box(0.06, 0.4, 0.5, m.steel, x, 0.2, 0, { cast: false, to: bn });
    for (let i = 0; i < 3; i++) { z.box(0.56, 0.06, 0.48, m.teal, -0.68 + i * 0.68, 0.46, 0.04, { r: 0.03, to: bn }); z.box(0.56, 0.5, 0.06, m.teal, -0.68 + i * 0.68, 0.78, -0.22, { r: 0.03, rx: -0.12, to: bn }); }
    z.plant(12.3, 8.4, 1.05);
    z.plant(-12.5, -5.9, 0.9);
    const tt = z.grp(-4.85, 0, 2.3);
    z.box(0.36, 0.04, 0.36, m.dark, 0, 0.02, 0, { cast: false, to: tt }); z.cyl(0.04, 0.04, 1.1, m.white, 0, 0.57, 0, { to: tt }); z.box(0.3, 0.42, 0.14, m.white, 0, 1.25, 0, { r: 0.03, to: tt });
    const ht = tex(k, 128, 160, (c) => { c.fillStyle = '#14a39a'; c.fillRect(0, 0, 128, 160); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(64, 20); c.quadraticCurveTo(100, 70, 64, 104); c.quadraticCurveTo(28, 70, 64, 20); c.fill(); txt(c, 'HIGIENE', 64, 126, '800 20px system-ui', '#ffffff', 'center'); txt(c, 'DE MANOS', 64, 146, '700 15px system-ui', '#d9fff9', 'center'); });
    at(z.sign(0.26, 0.33, ht, { to: tt }), 0, 1.25, 0.072);
    const ex = tex(k, 256, 96, (c) => { c.fillStyle = '#0d9b4a'; c.fillRect(0, 0, 256, 96); txt(c, 'SALIDA', 150, 50, '800 44px system-ui', '#ffffff', 'center'); c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(20, 48); c.lineTo(62, 48); c.moveTo(44, 30); c.lineTo(64, 48); c.lineTo(44, 66); c.stroke(); });
    at(z.sign(0.85, 0.32, ex, { lit: 1.5 }), 12.55, 5.55, BACK_Z + 0.06);
  }
  // the medication round trolley ("carro de unidosis") parked along the theatre's glass wall, out of the way
  {
    const cg = k.my.cart = new THREE.Group(); room.add(cg); const z = kit(k, cg);
    const c = z.grp(-3.95, 0, 6.4, Math.PI / 2 - 0.08);
    for (const [x, zz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) z.caster(x, zz, c);
    z.box(0.92, 0.86, 0.56, m.white, 0, 0.56, 0, { r: 0.03, to: c });
    const dB = mat(0x2b6cb0, { roughness: 0.45 }), dW = mat(0xdbe7f3, { roughness: 0.45 });
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) { z.box(0.2, 0.17, 0.012, (r + i) % 2 ? dW : dB, -0.32 + i * 0.213, 0.27 + r * 0.19, 0.285, { cast: false, to: c }); z.box(0.08, 0.015, 0.02, m.steel, -0.32 + i * 0.213, 0.33 + r * 0.19, 0.295, { cast: false, to: c }); }
    z.box(0.98, 0.04, 0.62, m.tealDeep, 0, 1.01, 0, { r: 0.015, to: c });
    z.box(0.06, 0.06, 0.62, m.steel, 0.52, 0.95, 0, { cast: false, to: c });
    z.cyl(0.02, 0.02, 0.36, m.steel, -0.3, 1.2, -0.12, { to: c }); z.box(0.44, 0.02, 0.32, m.dark, -0.3, 1.4, -0.08, { to: c, rx: -0.15 });
    const em = tex(k, 256, 160, (cc) => { cc.fillStyle = '#071622'; cc.fillRect(0, 0, 256, 160); cc.fillStyle = '#14a39a'; cc.fillRect(0, 0, 256, 26); txt(cc, 'UNIDOSIS · 22:00', 128, 14, '800 15px system-ui', '#ffffff', 'center'); [['301', 'Paracetamol 1 g', '#39ff88'], ['302', 'Heparina 5000', '#ffd23f'], ['304', 'Amoxicilina', '#39ff88'], ['307', 'Insulina 6 UI', '#ff5d6c']].forEach(([a1, b1, col], i) => { txt(cc, a1, 10, 46 + i * 28, '700 15px system-ui', '#e6eef3'); txt(cc, b1, 52, 46 + i * 28, '600 15px system-ui', col); }); });
    const es = z.screen(0.4, 0.25, em, 1.15, c); es.position.set(-0.3, 1.56, -0.2); es.rotation.x = -0.15;
    z.box(0.42, 0.27, 0.02, m.dark, -0.3, 1.56, -0.215, { to: c, rx: -0.15, cast: false });
    z.box(0.14, 0.18, 0.12, m.yellow, 0.3, 1.12, 0.12, { r: 0.012, to: c }); z.box(0.15, 0.03, 0.13, m.red, 0.3, 1.22, 0.12, { cast: false, to: c });
    z.box(0.22, 0.09, 0.12, m.white, 0.28, 1.08, -0.15, { cast: false, to: c }); z.box(0.222, 0.035, 0.122, m.drapeBlue, 0.28, 1.08, -0.15, { cast: false, to: c });
    for (let i = 0; i < 6; i++) z.cyl(0.018, 0.018, 0.05, [m.white, m.red, m.yellow, m.white, m.drapeBlue, m.white][i], 0.02 + (i % 3) * 0.06, 1.055, 0.1 + Math.floor(i / 3) * 0.06, { cast: false, seg: 8, to: c });
    const ut = tex(k, 256, 48, (cc) => { cc.fillStyle = '#ffffff'; cc.fillRect(0, 0, 256, 48); crossIcon(cc, 24, 24, 28, '#2b6cb0'); txt(cc, 'CARRO DE UNIDOSIS', 46, 25, fit(cc, 'CARRO DE UNIDOSIS', 200, 800, 22), '#1d2b45'); });
    for (const s of [-1, 1]) { const p = z.sign(0.5, 0.094, ut, { to: c }); p.rotation.y = s * Math.PI / 2; p.position.set(s * 0.465, 0.9, 0); }
    bake(cg);
  }
  bake(zone);
  // between the centre and the café's back: a patient on a stretcher waiting for theatre with a nurse's monitor,
  // a portable X-ray unit parked, a hand-gel post. One group (hidden with three rows of desks, which reach here).
  {
    const wg = k.my.wardFill = new THREE.Group(); room.add(wg); const w = kit(k, wg);
    const st = w.grp(5.55, 0, 2.75, 0.08);
    for (const [x, zz] of [[-0.85, -0.3], [0.85, -0.3], [-0.85, 0.3], [0.85, 0.3]]) w.caster(x, zz, st);
    w.box(2.0, 0.08, 0.7, m.grey, 0, 0.22, 0, { r: 0.03, to: st }); w.cyl(0.06, 0.07, 0.42, m.steel, -0.55, 0.42, 0, { to: st }); w.cyl(0.06, 0.07, 0.42, m.steel, 0.55, 0.42, 0, { to: st });
    w.box(2.0, 0.1, 0.72, m.navyPad, 0, 0.68, 0, { r: 0.04, to: st });
    for (const s2 of [-1, 1]) { w.box(1.2, 0.04, 0.03, m.chrome, 0.1, 0.95, s2 * 0.38, { cast: false, to: st }); for (const x of [-0.45, 0.1, 0.65]) w.box(0.03, 0.22, 0.03, m.chrome, x, 0.84, s2 * 0.38, { cast: false, to: st }); }
    w.box(0.6, 0.2, 0.66, m.navyPad, -0.75, 0.82, 0, { r: 0.05, rz: -0.35, to: st }); // raised back rest
    // the patient: pillow, head, a blanket over the body, the hands on top
    w.box(0.36, 0.1, 0.5, m.sheet, -0.82, 1.0, 0, { r: 0.05, rz: -0.35, to: st });
    w.sph(0.2, mc(k, 0xd7a77f, { roughness: 0.6 }), -0.72, 1.16, 0, { to: st });
    w.sph(0.205, mc(k, 0x5a3a2a, { roughness: 0.6 }), -0.77, 1.2, 0, { sx: 1, sy: 0.9, sz: 1.05, to: st });
    for (const e of [-1, 1]) w.box(0.012, 0.012, 0.06, m.black, -0.56, 1.17, e * 0.07, { cast: false, to: st });
    w.box(1.35, 0.2, 0.62, m.blanket, 0.28, 0.82, 0, { r: 0.08, to: st }); w.box(0.18, 0.21, 0.63, m.sheet, -0.36, 0.83, 0, { r: 0.06, cast: false, to: st });
    w.box(0.2, 0.12, 0.62, m.blanket, 0.9, 0.86, 0, { r: 0.06, to: st });
    w.box(0.6, 0.16, 0.66, m.sheet, -0.3, 0.86, 0, { r: 0.07, rz: -0.18, to: st });
    const tagT = tex(k, 256, 64, (c) => { c.fillStyle = '#ffffff'; rr(c, 0, 0, 256, 64, 10); c.fill(); c.fillStyle = '#e23a46'; rr(c, 0, 0, 64, 64, 10); c.fill(); c.fillRect(40, 0, 24, 64); txt(c, 'Q1', 32, 34, '800 26px system-ui', '#ffffff', 'center'); txt(c, 'Pendiente de quirófano', 76, 34, '700 19px system-ui', '#0f2f2b'); });
    const tg = w.sign(0.64, 0.16, tagT, { to: st }); tg.position.set(1.04, 0.86, 0); tg.rotation.y = Math.PI / 2;
    // an IV pole on the stretcher's head end and a small vitals monitor on it
    w.cyl(0.016, 0.016, 1.3, m.chrome, -1.0, 1.4, 0.33, { to: st }); w.rod([-1.0, 2.04, 0.33], [-0.88, 2.0, 0.33], 0.008, m.chrome, st);
    w.box(0.12, 0.18, 0.04, m.clear, -0.88, 1.88, 0.33, { r: 0.02, cast: false, to: st }); w.box(0.1, 0.1, 0.03, m.fluid, -0.88, 1.84, 0.33, { r: 0.01, cast: false, to: st });
    const vm = w.grp(-1.0, 1.42, 0.42, 0.3, st);
    w.box(0.3, 0.22, 0.08, m.offwhite, 0, 0, 0, { r: 0.02, to: vm });
    const vt = tex(k, 128, 96, (c) => { c.fillStyle = '#02070b'; c.fillRect(0, 0, 128, 96); c.strokeStyle = '#39ff88'; c.lineWidth = 3; c.beginPath(); for (let x = 0; x < 80; x += 2) c.lineTo(x, 40 - 26 * gauss((x % 40) / 40, 0.5, 0.05)); c.stroke(); txt(c, '78', 120, 24, '800 26px system-ui', '#39ff88', 'right'); txt(c, '97', 120, 62, '800 22px system-ui', '#3fe0ff', 'right'); txt(c, '124/80', 6, 80, '700 15px system-ui', '#f2f5f7'); });
    w.screen(0.26, 0.19, vt, 1.25, vm).position.z = 0.042;
    // the portable X-ray unit parked against the café wall, its tube arm folded over
    const xr = w.grp(7.05, 0, 3.55, -0.5);
    for (const [x, zz] of [[-0.28, -0.4], [0.28, -0.4], [-0.28, 0.35], [0.28, 0.35]]) w.caster(x, zz, xr);
    w.box(0.66, 0.8, 1.0, m.white, 0, 0.55, 0, { r: 0.06, to: xr }); w.box(0.68, 0.08, 1.02, m.teal, 0, 0.2, 0, { r: 0.03, cast: false, to: xr });
    w.box(0.5, 0.06, 0.3, m.dark, 0, 1.0, -0.32, { rx: -0.3, to: xr });
    w.box(0.2, 1.1, 0.2, m.offwhite, 0, 1.5, 0.3, { r: 0.03, to: xr });
    w.box(0.14, 0.14, 0.9, m.white, 0, 1.98, -0.05, { r: 0.03, to: xr });
    w.box(0.34, 0.3, 0.32, m.offwhite, 0, 1.78, -0.52, { r: 0.05, to: xr }); w.box(0.24, 0.05, 0.24, m.dark, 0, 1.61, -0.52, { cast: false, to: xr });
    const rx = tex(k, 256, 64, (g2) => { g2.fillStyle = '#ffd400'; g2.fillRect(0, 0, 256, 64); g2.fillStyle = '#111'; g2.beginPath(); g2.moveTo(32, 8); g2.lineTo(58, 56); g2.lineTo(6, 56); g2.closePath(); g2.fill(); g2.fillStyle = '#ffd400'; g2.beginPath(); g2.arc(32, 40, 7, 0, TAU); g2.fill(); txt(g2, 'RAYOS X', 160, 34, '800 32px system-ui', '#111', 'center'); });
    for (const s2 of [-1, 1]) { const p = w.sign(0.5, 0.125, rx, { to: xr }); p.rotation.y = s2 * Math.PI / 2; p.position.set(s2 * 0.335, 0.62, 0); }
    // hand gel on a post by the stretcher
    const hg = w.grp(4.2, 0, 2.15);
    w.box(0.32, 0.04, 0.32, m.dark, 0, 0.02, 0, { cast: false, to: hg }); w.cyl(0.035, 0.035, 1.05, m.white, 0, 0.55, 0, { to: hg }); w.box(0.22, 0.32, 0.12, m.white, 0, 1.2, 0, { r: 0.03, to: hg });
    const ht2 = tex(k, 128, 160, (c) => { c.fillStyle = '#14a39a'; c.fillRect(0, 0, 128, 160); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(64, 20); c.quadraticCurveTo(100, 70, 64, 104); c.quadraticCurveTo(28, 70, 64, 20); c.fill(); txt(c, 'HIGIENE', 64, 126, '800 20px system-ui', '#ffffff', 'center'); txt(c, 'DE MANOS', 64, 146, '700 15px system-ui', '#d9fff9', 'center'); });
    at(w.sign(0.2, 0.25, ht2, { to: hg }), 0, 1.2, 0.062);
    k.block(4.35, 2.2, 7.4, 4.33);
    bake(wg);
  }
  // the pharmacy delivery robot that follows the blue line
  {
    const r = k.my.robot = new THREE.Group(), rb = kit(k, r);
    rb.box(0.55, 0.62, 0.78, m.white, 0, 0.4, 0, { r: 0.08 });
    rb.box(0.57, 0.08, 0.8, m.teal, 0, 0.16, 0, { r: 0.03 });
    rb.box(0.5, 0.04, 0.7, m.offwhite, 0, 0.73, 0, { r: 0.02, cast: false });
    rb.box(0.42, 0.07, 0.02, m.black, 0, 0.52, 0.39, { cast: false });
    rb.box(0.3, 0.025, 0.01, m.glowCyan, 0, 0.52, 0.402, { cast: false });
    const ft = tex(k, 256, 64, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 64); crossIcon(c, 30, 32, 36, '#16a34a'); txt(c, 'FARMACIA', 58, 34, '800 32px system-ui', '#14532d'); });
    for (const s of [-1, 1]) { const p = rb.sign(0.6, 0.15, ft); p.rotation.y = s * Math.PI / 2; p.position.set(s * 0.278, 0.42, 0); }
    rb.cyl(0.03, 0.03, 0.08, m.dark, 0.18, 0.78, -0.25, { cast: false });
    const bc = k.my.beacon = rb.cyl(0.045, 0.045, 0.07, k.glow(0xffa31a, 2), 0.18, 0.85, -0.25, { cast: false });
    bc.material = bc.material.clone();
    k.scene.add(r);
    k.my.rs = { d: 0, dir: 1, len: 0 };
    let L = 0; for (let i = 0; i < k.my.path.length - 1; i++) L += Math.hypot(k.my.path[i + 1][0] - k.my.path[i][0], k.my.path[i + 1][1] - k.my.path[i][1]);
    k.my.rs.len = L; k.my.rs.d = L * 0.42;
  }
}

// ---------------------------------------------------------------- desks: one station per role
function roleKind(st) {
  if (st.centre) return 'centre';
  const r = String((st.agent && st.agent.role) || '');
  if (/^\s*(develop|ciruj|engineer)/i.test(r)) return 'surgeon';
  if (/verif|diagn|\bqa\b|test/i.test(r)) return 'diag';
  if (/infra|técn|tecn|devops|\bops\b|platform/i.test(r)) return 'tech';
  if (/research|investig/i.test(r)) return 'research';
  if (/protot|resid/i.test(r)) return 'resident';
  if (/review|comit/i.test(r)) return 'review';
  if (/superadmin|gerent|admin/i.test(r)) return 'manager';
  if (/lead|jefe|product|director/i.test(r)) return 'chief';
  return 'consult';
}

// The default desk becomes ours: its top stays as the click target (shown or hidden), clutter goes, the lamp
// keeps only its light (moved by each station to its own lamp head).
function prepDesk(k, st, { top, keepFrame = false, frame, mat: deskMat, mug = true }) {
  const p = st.props, m = M(k);
  for (const x of [...(p.books || []), ...(p.pens || []), ...(p.plant || [])]) x.visible = false;
  if (p.desk) {
    if (top) p.desk[0].material = top; else p.desk[0].visible = false;
    for (let i = 1; i < p.desk.length; i++) { if (keepFrame && i < 4) { if (frame) p.desk[i].material = frame; } else p.desk[i].visible = false; }
  }
  if (p.mat) { if (deskMat) p.mat.material = deskMat; else p.mat.visible = false; }
  if (!mug) for (const x of p.mug || []) x.visible = false;
  if (p.lamp) p.lamp.traverse((o) => { if (o.isMesh) o.visible = false; });
  if (p.bezel) { p.bezel.material.color.set(0xdde5e9); p.bezel.material.roughness = 0.35; }
  if (p.laptop) p.laptop.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) { o.material.color.set(0xd9dee4); } });
  return m;
}
function chairStyle(k, st, kind, col) {
  const p = st.props, m = M(k), S = k.C.SEAT_Z;
  if (!p.chair) return;
  if (kind === 'stool') { // a lab stool: round seat at hip height, ring footrest, five castors
    p.chair.visible = false;
    const g = new THREE.Group(); g.position.set(0, 0, S - 0.04); (st.group.userData.R || st.group).add(g); const b = kit(k, g);
    b.cyl(0.25, 0.23, 0.08, mc(k, col.clone().lerp(new THREE.Color(0x0f2f33), 0.35), { roughness: 0.6 }), 0, 0.62, 0, { seg: 24 });
    b.cyl(0.035, 0.035, 0.55, m.chrome, 0, 0.32, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 24), m.chrome); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.box(0.05, 0.04, 0.3, m.dark, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15, { ry: a, cast: false }); b.sph(0.035, m.dark, Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29, { cast: false }); }
    return;
  }
  const ch = p.chair.children, c = kind === 'exec' ? new THREE.Color(0x2b211d) : kind === 'white' ? new THREE.Color(0x0f5f59) : col.clone().lerp(new THREE.Color(0x103a3f), 0.45);
  if (ch[0] && ch[0].material) ch[0].material.color.copy(c);
  if (ch[2] && ch[2].material) ch[2].material.color.set(kind === 'exec' ? 0x1a1a1a : 0xd9e0e4);
  if (kind === 'exec' || kind === 'white') { const h = k.box(0.5, 0.3, 0.1, 0, { m: ch[0] ? ch[0].material : m.leather, y: 1.62, z: -0.33, r: 0.05 }); p.chair.add(h); }
}
// the desk lamp's light, moved to (x, y, z) in desk coordinates (it sits at 0.8, 2.1, DESK_Z + 0.1 in its group)
function lightAt(k, st, x, y, z) { if (st.props.lamp) st.props.lamp.position.set(x - 0.8, y - 2.1, z - (k.C.DESK_Z + 0.1)); }
// a front panel behind the nameplate, so it never floats
function frontPanel(b, D, mat, w = 2.8) { b.box(w, 0.6, 0.04, mat, 0, 0.66, D + 0.6, { cast: false }); }

// ---- shared parts of the role stations
// the laptop goes where a station has screens of its own
function noLaptop(st) { if (st.props.laptop) st.props.laptop.visible = false; }
// the default top stays the click target: sized and placed to match the station's own top
function sizeTop(st, w, d, x, z, y = 1.0) { const t = st.props.desk && st.props.desk[0]; if (!t) return; t.scale.set(w / 3.0, 1, d / 1.5); t.position.set(x, y, z); }
// move the working information onto the station's own surfaces: { front | orb | tray | flags: [dx, dy, dz] }
function infoAt(st, o) { if (!st.info) return; for (const n of Object.keys(o)) { const g = st.info[n]; if (g) g.position.set(...o[n]); } }
// a flat outline turned into a slab lying on the floor plan: shape x -> x, shape y -> z (around x, z), its top at
// y, `depth` thick downwards
function slab(parent, shape, depth, mat, x, y, z) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  const s = new THREE.Mesh(g, mat); s.rotation.x = Math.PI / 2; s.position.set(x, y, z); s.castShadow = depth > 0.03; s.receiveShadow = true;
  parent.add(s); return s;
}
// a C-shaped (or sector) outline round a centre: angle a from straight ahead (+z) towards +x, from a0 to a1;
// rOut(a) and rIn(a) give the outer and inner radius
function cShape(rOut, rIn, a0, a1, step = 0.035) {
  const s = new THREE.Shape(), n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, r = rOut(a); i ? s.lineTo(Math.sin(a) * r, Math.cos(a) * r) : s.moveTo(Math.sin(a) * r, Math.cos(a) * r); }
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n, r = rIn(a); s.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
  return s;
}
// surgical instruments laid out in a row on a tray (parent group, its top at y): scalpels, scissors, forceps,
// clamps, a retractor; n of them, `gap` apart, centred
function instruments(k, b, to, y, n, gap) {
  const m = M(k), ch = m.chrome, x0 = -((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * gap, kind = i % 4, l = 0.24 + (i % 3) * 0.03;
    if (kind === 0) { b.box(0.016, 0.01, l * 0.7, m.steel, x, y, -0.03, { to, cast: false }); b.box(0.022, 0.012, l * 0.3, ch, x, y + 0.002, l * 0.35, { to, cast: false }); } // scalpel
    else { // scissors, forceps and clamps: two blades and finger rings
      for (const s of [-1, 1]) { const bl = b.box(0.01, 0.01, l * 0.8, ch, x + s * 0.006, y, -0.02, { to, cast: false }); bl.rotation.y = s * (kind === 2 ? 0.04 : 0.08); }
      if (kind !== 2) for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), ch); r.rotation.x = Math.PI / 2; r.position.set(x + s * 0.02, y, l * 0.42); to.add(r); }
    }
  }
}
// a laboratory microscope, about 0.4 m tall before scaling: base, arm, stage with a lit slide, nosepiece and
// objectives, the binocular head with its eyepieces towards +z, focus knobs
function microscope(k, b, g) {
  const m = M(k), body = m.white, dk = m.dark;
  b.box(0.2, 0.035, 0.26, body, 0, 0.018, 0, { to: g, r: 0.012 });
  b.box(0.07, 0.24, 0.08, body, 0, 0.15, -0.09, { to: g, r: 0.015 });
  b.rod([0, 0.26, -0.09], [0, 0.31, -0.02], 0.035, body, g);
  b.box(0.17, 0.014, 0.15, dk, 0, 0.13, 0.02, { to: g, cast: false });
  b.box(0.07, 0.003, 0.025, M(k).clear, 0, 0.139, 0.03, { to: g, cast: false }); b.cyl(0.008, 0.008, 0.002, mc(k, 0xd6336c), 0, 0.141, 0.03, { to: g, cast: false, seg: 8 });
  b.cyl(0.02, 0.02, 0.006, M(k).glowWhite, 0, 0.12, 0.03, { to: g, cast: false });
  b.cyl(0.032, 0.04, 0.03, dk, 0, 0.245, 0.02, { to: g, cast: false });
  for (let i = 0; i < 3; i++) { const a = i * 2.1; b.cyl(0.009, 0.012, 0.055, i === 1 ? mc(k, 0xc9a35a, { metalness: 0.7, roughness: 0.3 }) : m.chrome, Math.sin(a) * 0.018, 0.205, 0.02 + Math.cos(a) * 0.018, { to: g, cast: false, seg: 8 }); }
  b.box(0.09, 0.06, 0.13, body, 0, 0.33, 0.0, { to: g, rx: -0.3, r: 0.015 });
  for (const s of [-1, 1]) { const e = b.cyl(0.014, 0.016, 0.09, dk, s * 0.025, 0.385, 0.07, { to: g, cast: false, seg: 10 }); e.rotation.x = 0.7; }
  for (const s of [-1, 1]) { b.cyl(0.03, 0.03, 0.022, dk, s * 0.048, 0.12, -0.09, { to: g, rz: Math.PI / 2, cast: false }); b.cyl(0.018, 0.018, 0.03, m.grey, s * 0.055, 0.17, -0.09, { to: g, rz: Math.PI / 2, cast: false }); }
}
// the specialty's floor bay under a row station: a tinted rounded area with its border and the service's name
// painted at the front, in the aisle in front of the nameplate
const ZONES = {
  surgeon: { label: 'CIRUGÍA', sub: 'ÁREA ESTÉRIL', fill: 'rgba(40,150,120,.20)', edge: '#1f8f70', ink: '#14634f', pat: 'grid' },
  diag: { label: 'RADIOLOGÍA', sub: 'DIAGNÓSTICO POR IMAGEN', fill: 'rgba(91,63,168,.16)', edge: '#5b3fa8', ink: '#45308a', pat: 'dots' },
  tech: { label: 'TALLER', sub: 'ELECTROMEDICINA', fill: 'rgba(60,70,80,.20)', edge: '#f5c518', ink: '#1d232a', pat: 'hazard' },
  research: { label: 'LABORATORIO', sub: 'INVESTIGACIÓN CLÍNICA', fill: 'rgba(47,143,216,.16)', edge: '#2f8fd8', ink: '#1d5f9a', pat: 'hex' },
};
function floorZone(k, R, D, kind) {
  const z = ZONES[kind]; if (!z) return;
  const key = `zone_${kind}`, W = 3.44, H = 2.92;
  const t = k.my[key] || (k.my[key] = tex(k, 512, 436, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    rr(c, 6, 6, w - 12, h - 12, 26); c.fillStyle = z.fill; c.fill();
    c.save(); rr(c, 6, 6, w - 12, h - 12, 26); c.clip();
    if (z.pat === 'grid') { c.strokeStyle = 'rgba(31,143,112,.22)'; c.lineWidth = 2; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }
    if (z.pat === 'dots') { c.fillStyle = 'rgba(91,63,168,.25)'; for (let x = 16; x < w; x += 28) for (let y = 16; y < h; y += 28) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); } }
    if (z.pat === 'hex') { c.strokeStyle = 'rgba(47,143,216,.25)'; c.lineWidth = 2; for (let y = 0, r = 0; y < h + 30; y += 26, r++) for (let x = (r % 2) * 22; x < w + 30; x += 44) { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); } c.closePath(); c.stroke(); } }
    if (z.pat === 'hazard') { c.fillStyle = 'rgba(40,46,54,.30)'; c.fillRect(0, 0, w, h); }
    c.restore();
    if (z.pat === 'hazard') { // a yellow and black striped border
      c.save(); rr(c, 6, 6, w - 12, h - 12, 26); rr(c, 30, 30, w - 60, h - 60, 12); c.clip('evenodd');
      for (let x = -h; x < w + h; x += 36) { c.fillStyle = '#f5c518'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 18, 0); c.lineTo(x + 18 + h, h); c.lineTo(x + h, h); c.fill(); c.fillStyle = '#1d232a'; c.beginPath(); c.moveTo(x + 18, 0); c.lineTo(x + 36, 0); c.lineTo(x + 36 + h, h); c.lineTo(x + 18 + h, h); c.fill(); }
      c.restore();
    } else { c.strokeStyle = z.edge; c.lineWidth = 10; rr(c, 10, 10, w - 20, h - 20, 22); c.stroke(); }
    // the name band at the front (the bottom of the picture)
    const by = h - 78;
    c.fillStyle = z.pat === 'hazard' ? '#1d232a' : z.edge; rr(c, 40, by, w - 80, 56, 12); c.fill();
    crossIcon(c, 76, by + 28, 34, z.pat === 'hazard' ? '#f5c518' : '#ffffff');
    txt(c, z.label, 108, by + 22, fit(c, z.label, 300, 900, 30, 16), z.pat === 'hazard' ? '#f5c518' : '#ffffff');
    txt(c, z.sub, 108, by + 44, fit(c, z.sub, 340, 700, 15, 10), z.pat === 'hazard' ? '#ffffff' : 'rgba(255,255,255,.85)');
  }));
  const p = plane(W, H, new THREE.MeshStandardMaterial({ map: t.tex, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  p.rotation.x = -Math.PI / 2; p.position.set(0, 0.009, D - 0.4); p.receiveShadow = true; R.add(p);
}

const LAB_STATIONS = {
  // --- Cirugía: a draped instrument table on castors (the sterile field hangs to the floor on three sides), the
  // Mayo stand with the instruments laid out over its front, a touch panel, the laparoscopy tower at the back right
  // and a big surgical light on a boom over the table
  surgeon(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: M(k).brushed, mug: false }), b = kit(k, R), t = kit(k, T);
    noLaptop(st); floorZone(k, R, D, 'surgeon');
    const TZ = D - 0.04, TW = 2.62, TD = 1.1, TOP = 1.0;
    sizeTop(st, TW, TD, 0, TZ);
    // the frame under the drape: four legs on castors and a low shelf with sterile packs (only the castors show)
    for (const [x, z] of [[-1.2, TZ - 0.45], [1.2, TZ - 0.45], [-1.2, TZ + 0.45], [1.2, TZ + 0.45]]) { b.cyl(0.025, 0.025, 0.86, m.steel, x, 0.53, z, { cast: false }); b.caster(x, z); }
    b.box(2.4, 0.025, 0.92, m.steel, 0, 0.3, TZ, { cast: false });
    // the sterile field: a green cloth over the top, falling to the floor in pleats at the front and both ends
    const green = mc(k, 0x2e8c76, { roughness: 0.95, side: THREE.DoubleSide }), hem = mc(k, 0x23705e, { roughness: 0.95 });
    b.box(TW + 0.08, 0.03, TD + 0.08, green, 0, TOP + 0.045, TZ, { cast: false });
    const drape = (w, h, pleats) => { const g = new THREE.PlaneGeometry(w, h, pleats * 4, 1), pa = g.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin((pa.getX(i) / w) * pleats * TAU) * 0.022 + (pa.getY(i) < 0 ? 0.03 : 0)); g.computeVertexNormals(); const d = new THREE.Mesh(g, green); d.castShadow = true; return d; };
    const DH = TOP + 0.03 - 0.12;
    const fd = drape(TW + 0.08, DH, 13); fd.position.set(0, 0.12 + DH / 2, TZ + TD / 2 + 0.05); R.add(fd);
    for (const s of [-1, 1]) { const sd = drape(TD + 0.08, DH, 5); sd.rotation.y = s * Math.PI / 2; sd.position.set(s * (TW / 2 + 0.05), 0.12 + DH / 2, TZ); R.add(sd); }
    b.box(TW + 0.1, 0.035, 0.03, hem, 0, 0.13, TZ + TD / 2 + 0.07, { cast: false });
    // a white "ESTÉRIL" indicator tape on the front of the drape, beside the nameplate
    const tape = k.my.sterT || (k.my.sterT = tex(k, 256, 64, (c) => { c.fillStyle = '#f4f7f6'; c.fillRect(0, 0, 256, 64); for (let i = 0; i < 8; i++) { c.fillStyle = '#2b6cb0'; c.fillRect(8 + i * 32, 8, 14, 6); c.fillRect(8 + i * 32, 50, 14, 6); } txt(c, 'ESTÉRIL', 128, 33, '800 28px system-ui', '#14634f', 'center'); }));
    for (const s of [-1, 1]) at(b.sign(0.34, 0.085, tape), s * 1.12, 0.93, TZ + TD / 2 + 0.09);
    // on the field: a stainless instrument tray with a blue towel and the instruments, a kidney dish, gauze, a
    // sharps box, sterile packs
    const tray = b.grp(-0.62, TOP + 0.06, TZ + 0.16, 0.06);
    b.box(0.7, 0.04, 0.44, m.chrome, 0, 0.02, 0, { to: tray }); b.box(0.66, 0.008, 0.4, m.drapeBlue, 0, 0.044, 0, { to: tray, cast: false });
    instruments(k, b, tray, 0.05, 9, 0.07);
    const kd = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 20, Math.PI * 1.25), m.chrome); kd.rotation.x = -Math.PI / 2; kd.position.set(0.95, TOP + 0.09, TZ - 0.28); R.add(kd);
    for (let i = 0; i < 3; i++) b.box(0.2, 0.03, 0.16, m.sheet, 1.02 + (i % 2) * 0.03, TOP + 0.075 + i * 0.03, TZ + 0.12, { ry: i * 0.25, cast: false });
    b.box(0.15, 0.2, 0.13, m.yellow, -1.15, TOP + 0.16, TZ - 0.32, { r: 0.015 }); b.box(0.16, 0.04, 0.14, m.red, -1.15, TOP + 0.28, TZ - 0.32, { r: 0.01, cast: false });
    for (let i = 0; i < 2; i++) b.box(0.3, 0.05, 0.22, i ? m.drapeBlue : m.white, 1.12, TOP + 0.085 + i * 0.05, TZ - 0.4, { ry: 0.2, cast: false });
    // a touch panel on a stand, turned to the surgeon (its white back to the room)
    const tp = b.grp(0.05, TOP + 0.06, TZ - 0.32, Math.PI);
    b.box(0.16, 0.02, 0.12, m.white, 0, 0.01, 0, { to: tp, cast: false }); b.box(0.05, 0.16, 0.03, m.white, 0, 0.1, -0.02, { to: tp, cast: false });
    b.box(0.58, 0.36, 0.035, m.white, 0, 0.32, 0.0, { to: tp, rx: -0.3, r: 0.015 });
    b.screen(0.54, 0.32, k.my.lapImg || (k.my.lapImg = tex(k, 256, 160, paintLapImage)), 1.1, tp).position.set(0, 0.325, 0.022);
    tp.children[tp.children.length - 1].rotation.x = -0.3;
    // the Mayo stand: its foot on castors in front of the left of the table, the tray cantilevered back over it,
    // draped blue, scalpels, scissors, forceps and clamps laid out in a row
    const my = b.grp(-1.2, 0, TZ + TD / 2 + 0.25);
    b.box(0.32, 0.04, 0.24, m.steel, 0, 0.09, 0, { to: my }); for (const x of [-0.13, 0.13]) b.caster(x, 0, my);
    b.cyl(0.022, 0.022, 1.32, m.chrome, 0, 0.77, 0, { to: my });
    b.box(0.06, 0.06, 0.06, m.steel, 0, 1.42, 0, { to: my, cast: false });
    b.box(0.05, 0.03, 0.46, m.chrome, 0, 1.44, -0.22, { to: my, cast: false });
    const mt = b.grp(0.22, 1.47, -0.42, 0, my);
    b.box(0.74, 0.025, 0.46, m.steel, 0, 0, 0, { to: mt }); b.box(0.78, 0.012, 0.5, m.drapeBlue, 0, 0.018, 0, { to: mt, cast: false });
    b.box(0.02, 0.1, 0.5, m.drapeBlue, 0.39, -0.045, 0, { to: mt, cast: false }); b.box(0.78, 0.08, 0.02, m.drapeBlue, 0, -0.035, 0.25, { to: mt, cast: false });
    instruments(k, b, mt, 0.03, 8, 0.08);
    // the laparoscopy tower at the back right, turned to the room: castors, stacked units, the monitor on top
    const tw = b.grp(1.25, 0, D - 1.2, -0.35);
    for (const [x, z] of [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]]) b.caster(x, z, tw);
    for (const [x, z] of [[-0.23, -0.19], [0.23, -0.19], [-0.23, 0.19], [0.23, 0.19]]) b.box(0.04, 1.3, 0.04, m.white, x, 0.79, z, { cast: false, to: tw });
    b.box(0.54, 0.05, 0.46, m.white, 0, 0.16, 0, { to: tw }); b.box(0.54, 0.05, 0.46, m.white, 0, 1.44, 0, { to: tw });
    const unitT = k.my.lapUnits || (k.my.lapUnits = tex(k, 256, 96, (c) => { c.fillStyle = '#0d1a24'; c.fillRect(0, 0, 256, 96); txt(c, 'INSUFLADOR', 10, 14, '700 12px system-ui', '#8fb6c9'); txt(c, '12', 70, 54, '800 34px system-ui', '#39ff88', 'center'); txt(c, 'mmHg', 70, 82, '600 12px system-ui', '#8fd9b0', 'center'); txt(c, '20', 186, 54, '800 34px system-ui', '#3fe0ff', 'center'); txt(c, 'l/min', 186, 82, '600 12px system-ui', '#8fd9b0', 'center'); }));
    ['#1d2530', '#2a3644', '#1d2530'].forEach((col, i) => { b.box(0.5, 0.26, 0.4, mc(k, col, { roughness: 0.4 }), 0, 0.4 + i * 0.32, 0, { to: tw }); const s = b.screen(0.3, 0.11, unitT, 1.2, tw); s.position.set(-0.07, 0.42 + i * 0.32, 0.202); b.box(0.06, 0.03, 0.01, i === 1 ? m.glowAmber : m.glowGreen, 0.15, 0.42 + i * 0.32, 0.204, { to: tw, cast: false }); });
    const tl = k.my.lapLabT || (k.my.lapLabT = tex(k, 256, 40, (c) => { c.fillStyle = '#14a39a'; c.fillRect(0, 0, 256, 40); txt(c, 'LAPAROSCOPIA', 128, 21, '800 22px system-ui', '#ffffff', 'center'); }));
    b.sign(0.5, 0.08, tl, { to: tw }).position.set(0, 1.5, 0.242);
    const lab = t.grp(1.25, 0, D - 1.2, -0.35);
    t.cyl(0.03, 0.03, 0.3, m.steel, 0, 1.62, -0.05, { to: lab });
    t.box(0.8, 0.5, 0.06, m.dark, 0, 2.0, 0, { r: 0.015, to: lab });
    t.screen(0.76, 0.44, k.my.lapImg, 1.15, lab).position.set(0, 2.0, 0.032);
    // the surgical light: a mast at the back left, a boom out over the table and the big head, angled down onto it
    t.cyl(0.1, 0.12, 0.06, m.white, -1.38, 0.03, D - 1.62); t.cyl(0.045, 0.045, 2.78, m.white, -1.38, 1.42, D - 1.62);
    t.box(0.12, 0.14, 0.12, m.offwhite, -1.38, 2.84, D - 1.62, { r: 0.02 });
    t.rod([-1.38, 2.84, D - 1.62], [-0.86, 2.86, D - 0.86], 0.04, m.white); t.box(0.1, 0.1, 0.1, m.offwhite, -0.86, 2.86, D - 0.86, { r: 0.02 });
    t.rod([-0.86, 2.86, D - 0.86], [-0.62, 2.62, D - 0.4], 0.035, m.white);
    const hd = t.grp(-0.6, 2.5, D - 0.34); hd.rotation.set(-0.32, 0, 0.42);
    t.cyl(0.03, 0.03, 0.14, m.white, 0, 0.08, 0, { to: hd });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 10, 0, TAU, 0, Math.PI * 0.4), m.white); dome.scale.y = 0.42; dome.castShadow = true; hd.add(dome);
    t.cyl(0.43, 0.43, 0.07, m.offwhite, 0, -0.02, 0, { seg: 32, to: hd }); t.cyl(0.435, 0.435, 0.014, m.teal, 0, 0.02, 0, { seg: 32, cast: false, to: hd });
    t.cyl(0.04, 0.05, 0.12, m.teal, 0, -0.1, 0, { cast: false, to: hd });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), k.my.ledMat || (k.my.ledMat = new THREE.MeshBasicMaterial({ map: tex(k, 256, 256, paintLed).tex, color: new THREE.Color(1.35, 1.32, 1.25), toneMapped: false }))); led.rotation.x = Math.PI / 2; led.position.y = -0.057; hd.add(led);
    // a soft cone of light from the head onto the field
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.75, 1.25, 28, 1, true), k.my.beamMat || (k.my.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6e6, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })));
    cone.position.y = -0.7; hd.add(keep(cone));
    lightAt(k, st, -0.35, 1.95, TZ + 0.05);
    infoAt(st, { orb: [0, 0.03, -0.12], flags: [0.05, 0.03, -0.14], tray: [0.12, 0.03, -0.12], front: [0, 0, -0.04] });
    chairStyle(k, st, 'stool', new THREE.Color(st.agent.color || '#14a39a'));
  },

  // --- Radiología: a curved reading console round the seat (dark resin top, a lit edge) with three diagnostic
  // monitors in an arc, a dictation microphone, a microscope on the right wing, and behind the chair a dark curved
  // reading-room screen with two lit CT light boxes and its sign
  diag(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: null }), b = kit(k, R), t = kit(k, T);
    noLaptop(st); floorZone(k, R, D, 'diag');
    const S = k.C.SEAT_Z, A = 1.1, RO = 1.72, RI = 0.92, TOP = 1.04;
    const arc = (r0, r1, a0, a1) => cShape((a) => r1, (a) => r0, a0, a1);
    slab(R, arc(RI, RO, -A, A), 0.06, m.resin, 0, TOP, S);
    slab(R, arc(RO - 0.005, RO + 0.012, -A, A), 0.02, k.my.diagGlow || (k.my.diagGlow = k.glow(0x8f7bff, 1.7)), 0, TOP - 0.035, S);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(RO - 0.1, RO - 0.1, 0.86, 48, 1, true, -A, 2 * A), mc(k, 0x2a3140, { roughness: 0.5, side: THREE.DoubleSide })); skirt.position.set(0, 0.55, S); skirt.castShadow = true; R.add(skirt);
    const kick = new THREE.Mesh(new THREE.CylinderGeometry(RO - 0.13, RO - 0.13, 0.1, 48, 1, true, -A, 2 * A), mc(k, 0x5b3fa8, { roughness: 0.5, side: THREE.DoubleSide })); kick.position.set(0, 0.06, S); R.add(kick);
    for (const s of [-1, 1]) { const a = s * A, rm = (RO + RI) / 2; b.box(0.05, TOP - 0.04, RO - RI, mc(k, 0x2a3140, { roughness: 0.5 }), Math.sin(a) * rm, (TOP - 0.04) / 2, S + Math.cos(a) * rm, { ry: a }); }
    // the flat badge panel at the front for the nameplate
    b.box(1.84, 0.66, 0.26, m.white, 0, 0.6, D + 0.46); b.box(1.86, 0.04, 0.28, mc(k, 0x5b3fa8, { roughness: 0.5 }), 0, 0.95, D + 0.46, { cast: false });
    // monitors in an arc, turned to the radiologist: portrait at the sides, landscape in the middle
    const mon = (a, r, w, h, ry = 0) => {
      const g = b.grp(Math.sin(a) * r, TOP, S + Math.cos(a) * r, a + Math.PI + ry);
      b.box(0.24, 0.02, 0.18, m.dark, 0, 0.01, 0, { to: g, cast: false }); b.box(0.05, 0.16, 0.04, m.midgrey, 0, 0.1, -0.05, { to: g, cast: false });
      b.box(w, h, 0.05, mc(k, 0xe9edf0, { roughness: 0.4 }), 0, 0.17 + h / 2, 0, { to: g, r: 0.012 });
      b.box(w - 0.04, h - 0.04, 0.012, m.black, 0, 0.17 + h / 2, 0.026, { to: g, cast: false });
      b.box(0.14, 0.05, 0.01, m.grey, 0, 0.17 + h * 0.3, -0.027, { to: g, cast: false }); // a vent on the back
      return g;
    };
    mon(-0.62, 1.34, 0.5, 0.7, 0.12); mon(0.62, 1.34, 0.5, 0.7, -0.12); mon(0, 1.22, 0.78, 0.46);
    // dictation microphone and a keyboard
    const mic = b.grp(Math.sin(-0.95) * 1.3, TOP, S + Math.cos(-0.95) * 1.3, 0.4);
    b.cyl(0.07, 0.08, 0.03, m.dark, 0, 0.015, 0, { to: mic, cast: false });
    b.rod([0, 0.03, 0], [0.02, 0.22, 0.05], 0.008, m.dark, mic); b.rod([0.02, 0.22, 0.05], [0.0, 0.3, 0.12], 0.008, m.dark, mic);
    b.sph(0.035, mc(k, 0x111418, { roughness: 0.9 }), 0, 0.31, 0.13, { to: mic, sx: 1, sy: 1.3, sz: 1, cast: false });
    b.box(0.5, 0.02, 0.17, m.dark, 0, TOP + 0.01, S + 0.86, { cast: false }); b.box(0.09, 0.025, 0.12, m.dark, 0.36, TOP + 0.012, S + 0.86, { cast: false, r: 0.02 });
    // the microscope on the right wing, its profile to the room
    const ms = b.grp(Math.sin(0.92) * 1.32, TOP, S + Math.cos(0.92) * 1.32, -2.2); ms.scale.setScalar(1.6);
    microscope(k, b, ms);
    // a rack of sample tubes on the left wing
    const caps = [0xe23a46, 0xf5c518, 0x3fa7f5, 0x7c3aed, 0x16a34a].map((c) => mc(k, c, { roughness: 0.3 }));
    const rk = b.grp(Math.sin(-0.55) * 1.6, TOP, S + Math.cos(-0.55) * 1.6, -0.55);
    b.box(0.34, 0.03, 0.1, m.white, 0, 0.06, 0, { to: rk, cast: false }); b.box(0.34, 0.02, 0.1, m.white, 0, 0.01, 0, { to: rk, cast: false });
    caps.forEach((c, i) => { b.cyl(0.015, 0.015, 0.14, m.clear, -0.13 + i * 0.065, 0.08, 0, { to: rk, cast: false, seg: 8 }); b.cyl(0.017, 0.017, 0.03, c, -0.13 + i * 0.065, 0.16, 0, { to: rk, cast: false, seg: 8 }); });
    // the reading room behind the chair: a dark curved screen (an ellipse round the seat), its cove light, two lit
    // CT light boxes and the lit sign on top
    const back = (r0, h, y, mat_) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, h, 40, 1, true, Math.PI - 1.28, 2.56), mat_); c.scale.set(1.5, 1, 0.62); c.position.set(0, y, S); c.castShadow = true; c.receiveShadow = true; T.add(c); return c; };
    back(1, 2.2, 1.12, mc(k, 0x1c2438, { roughness: 0.7, side: THREE.DoubleSide }));
    back(1.02, 0.06, 2.24, mc(k, 0x5b3fa8, { roughness: 0.5, side: THREE.DoubleSide }));
    back(0.975, 0.03, 2.12, k.my.diagGlow);
    back(0.975, 0.03, 0.12, k.my.diagGlow);
    const ct = [k.my.ctHead || (k.my.ctHead = tex(k, 192, 256, (c, w, h) => paintCT(c, w, h, 'head'))), k.my.ctChest || (k.my.ctChest = tex(k, 192, 256, (c, w, h) => paintCT(c, w, h, 'chest')))];
    for (const s of [-1, 1]) {
      const a = Math.PI + s * 0.92, x = Math.sin(a) * 1.5 * 0.97, z = S + Math.cos(a) * 0.62 * 0.97;
      const g = t.grp(x, 1.52, z, -s * 0.62);
      t.box(0.56, 0.74, 0.04, mc(k, 0xe9edf0, { roughness: 0.4 }), 0, 0, -0.01, { to: g, cast: false });
      t.screen(0.5, 0.66, ct[s < 0 ? 0 : 1], 1.15, g).position.z = 0.012;
    }
    const ps = k.my.pacsT || (k.my.pacsT = tex(k, 512, 64, (c) => { c.fillStyle = '#2a1f55'; rr(c, 0, 0, 512, 64, 10); c.fill(); crossIcon(c, 34, 32, 34, '#b9a8ff'); txt(c, 'RADIOLOGÍA · SALA DE INFORMES', 270, 34, fit(c, 'RADIOLOGÍA · SALA DE INFORMES', 420, 800, 30), '#ffffff', 'center'); }));
    t.sign(1.5, 0.19, ps, { lit: 1.0 }).position.set(0, 2.38, S - 0.6);
    lightAt(k, st, 0, 1.95, D - 0.2);
    infoAt(st, { orb: [0.1, 0, -0.65], flags: [0.35, 0, -0.3], front: [0, 0, -0.04] });
    chairStyle(k, st, 'default', new THREE.Color(0x3b2f7a));
  },

  // --- Electromedicina: an open steel workbench (a thick oak top, a yellow front rail, the lower shelf full of
  // equipment waiting for service), a magnifier lamp, a patient monitor open for repair, the oscilloscope and the
  // soldering station; behind the stool the pegboard tool wall under a gantry of parts bins, a red tool chest
  tech(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: M(k).oak }), b = kit(k, R), t = kit(k, T);
    noLaptop(st); floorZone(k, R, D, 'tech');
    const TZ = D - 0.05;
    sizeTop(st, 3.1, 1.22, 0, TZ);
    b.box(3.1, 0.07, 1.22, m.oak, 0, 0.93, TZ, { cast: false }); // the thick top's edge
    const gr = mc(k, 0x3a4048, { roughness: 0.45, metalness: 0.4 });
    for (const [x, z] of [[-1.46, TZ - 0.55], [1.46, TZ - 0.55], [-1.46, TZ + 0.55], [1.46, TZ + 0.55]]) { b.box(0.08, 0.9, 0.08, gr, x, 0.45, z); b.box(0.14, 0.03, 0.14, m.dark, x, 0.015, z, { cast: false }); }
    for (const z of [TZ - 0.55, TZ + 0.55]) b.box(2.92, 0.06, 0.05, gr, 0, 0.3, z, { cast: false });
    b.box(2.92, 0.025, 1.1, gr, 0, 0.32, TZ, { cast: false }); // the lower shelf
    b.box(3.0, 0.09, 0.06, m.yellow, 0, 0.86, TZ + 0.6, { cast: false }); // the front rail
    b.box(1.84, 0.5, 0.03, gr, 0, 0.62, TZ + 0.6, { cast: false }); // the nameplate's backing plate
    for (const x of [-0.85, 0.85]) b.cyl(0.02, 0.02, 0.02, m.chrome, x, 0.82, TZ + 0.62, { rx: Math.PI / 2, cast: false });
    // on the lower shelf: two infusion pumps, a defibrillator in its case, a cable coil and a red toolbox
    for (let i = 0; i < 2; i++) { const p = b.grp(0.75 + i * 0.36, 0.335, TZ + 0.1); b.box(0.3, 0.32, 0.22, m.white, 0, 0.16, 0, { to: p, r: 0.02 }); b.box(0.2, 0.1, 0.01, mc(k, 0x0d2a3a), 0, 0.22, 0.112, { to: p, cast: false }); b.box(0.06, 0.03, 0.01, i ? m.glowAmber : m.glowRed, 0.08, 0.08, 0.112, { to: p, cast: false }); }
    b.box(0.46, 0.34, 0.24, m.yellow, -0.15, 0.505, TZ + 0.12, { r: 0.03 }); b.box(0.2, 0.05, 0.05, m.dark, -0.15, 0.7, TZ + 0.12, { cast: false });
    const tag = k.my.fdsT || (k.my.fdsT = tex(k, 128, 64, (c) => { c.fillStyle = '#ffd400'; rr(c, 0, 0, 128, 64, 6); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 3; rr(c, 4, 4, 120, 56, 5); c.stroke(); txt(c, 'FUERA DE', 64, 22, '800 18px system-ui', '#111', 'center'); txt(c, 'SERVICIO', 64, 44, '800 18px system-ui', '#111', 'center'); }));
    at(b.sign(0.16, 0.08, tag), -0.15, 0.52, TZ + 0.245).rotation.z = 0.12;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 20), m.dark); coil.rotation.x = Math.PI / 2; coil.position.set(-0.8, 0.36, TZ + 0.15); R.add(coil);
    b.box(0.46, 0.2, 0.24, m.red, -1.15, 0.435, TZ - 0.15, { r: 0.02 }); b.box(0.28, 0.04, 0.04, m.dark, -1.15, 0.55, TZ - 0.15, { cast: false });
    // the patient monitor under repair, bigger, its back off and lying on the bench, the board showing
    const pm = b.grp(-0.8, 1.0, D - 0.2, 0.3); pm.scale.setScalar(1.3);
    b.box(0.5, 0.36, 0.1, m.offwhite, 0, 0.21, 0, { r: 0.02, to: pm });
    b.box(0.46, 0.3, 0.012, m.dark, 0, 0.21, 0.052, { to: pm, cast: false });
    const bars = k.my.barsT || (k.my.barsT = tex(k, 128, 80, (c) => { ['#ffffff', '#ffe600', '#00e5ff', '#00e676', '#ff2bd6', '#ff1744', '#2962ff'].forEach((col, i) => { c.fillStyle = col; c.fillRect(i * 18.3, 0, 19, 56); }); c.fillStyle = '#111'; c.fillRect(0, 56, 128, 24); txt(c, 'PRUEBA', 64, 68, '700 14px system-ui', '#e6eef3', 'center'); }));
    b.screen(0.42, 0.26, bars, 1.05, pm).position.set(0, 0.21, 0.059);
    b.box(0.44, 0.3, 0.01, mc(k, 0x1f7a3a, { roughness: 0.6 }), 0, 0.21, -0.06, { to: pm, cast: false });
    for (let i = 0; i < 6; i++) b.box(0.05 + (i % 2) * 0.03, 0.04, 0.02, m.black, -0.15 + (i % 3) * 0.15, 0.12 + Math.floor(i / 3) * 0.14, -0.07, { to: pm, cast: false });
    b.box(0.5, 0.012, 0.36, m.offwhite, 0.05, 0.006, -0.34, { to: pm, ry: -0.3, cast: false });
    b.rod([0.2, 0.1, 0.0], [0.5, 0.02, 0.25], 0.006, m.red, pm); b.rod([0.22, 0.1, 0.0], [0.55, 0.02, 0.2], 0.006, m.dark, pm);
    // oscilloscope (its trace runs in tick), soldering station with a hot tip, a multimeter
    const os = b.grp(0.98, 1.0, D - 0.52, -0.45);
    b.box(0.46, 0.28, 0.32, m.dark, 0, 0.14, 0, { r: 0.02, to: os });
    if (!k.my.scope) { const s = k.my.scope = k.surface(256, 160); s.ctx.fillStyle = '#031a10'; s.ctx.fillRect(0, 0, 256, 160); s.ctx.strokeStyle = 'rgba(80,255,170,.15)'; for (let i = 0; i <= 256; i += 32) { s.ctx.beginPath(); s.ctx.moveTo(i, 0); s.ctx.lineTo(i, 160); s.ctx.stroke(); } for (let i = 0; i <= 160; i += 32) { s.ctx.beginPath(); s.ctx.moveTo(0, i); s.ctx.lineTo(256, i); s.ctx.stroke(); } k.my.scopeDraw = sweeper(s.ctx, 0, 254, [{ y0: 4, y1: 156, fn: scopeWave, color: '#5dffb0', w: 2.4, bg: '#031a10' }], 140); }
    b.screen(0.26, 0.17, k.my.scope, 1.2, os).position.set(-0.06, 0.15, 0.163);
    for (let i = 0; i < 4; i++) b.cyl(0.015, 0.015, 0.02, i % 2 ? m.grey : m.yellow, 0.14 + (i % 2) * 0.05, 0.2 - Math.floor(i / 2) * 0.07, 0.165, { to: os, rx: Math.PI / 2, cast: false });
    const sd = b.grp(1.28, 1.0, D - 0.05, -0.3);
    b.box(0.2, 0.1, 0.16, m.dark, 0, 0.05, 0, { to: sd }); b.box(0.09, 0.04, 0.01, k.glow(0xff4a2a, 1.4), -0.03, 0.06, 0.081, { to: sd, cast: false });
    const spring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), m.steel); spring.position.set(-0.14, 0.08, 0); sd.add(spring);
    b.rod([-0.14, 0.05, 0], [-0.14, 0.16, -0.12], 0.012, m.dark, sd); b.rod([-0.14, 0.16, -0.12], [-0.14, 0.04, 0.08], 0.006, m.steel, sd);
    b.sph(0.012, k.glow(0xff5a1a, 2.4), -0.14, 0.04, 0.08, { to: sd, cast: false });
    b.box(0.12, 0.04, 0.2, m.yellow, 1.05, 1.02, D + 0.3, { r: 0.012, ry: 0.3 }); b.box(0.08, 0.005, 0.06, k.glow(0x9effc9, 1), 1.05, 1.043, D + 0.26, { ry: 0.3, cast: false });
    // the magnifier lamp clamped at the front right, its lit ring out over the bench
    b.box(0.1, 0.12, 0.1, gr, 1.42, 0.98, TZ + 0.5, { cast: false });
    b.rod([1.42, 1.04, TZ + 0.5], [1.32, 1.62, TZ + 0.32], 0.018, m.white); b.rod([1.32, 1.62, TZ + 0.32], [0.98, 1.58, TZ + 0.02], 0.018, m.white);
    const mg = b.grp(0.9, 1.5, TZ - 0.02); mg.rotation.set(-0.95, 0, 0.25);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 10, 28), m.white); mg.add(ring);
    const rl = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 6, 28), k.my.magGlow || (k.my.magGlow = k.glow(0xf2fbff, 1.8))); rl.position.z = -0.025; mg.add(rl);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), M(k).clear); mg.add(lens);
    lightAt(k, st, 0.6, 1.75, TZ + 0.1);
    // the overhead gantry: two posts at the back corners, a beam, a shelf of parts bins and a hanging work light
    const dc = [0xe23a46, 0xf5c518, 0x2b6cb0, 0x16a34a, 0xf08a24];
    for (const x of [-1.47, 1.47]) t.box(0.07, 2.6, 0.07, gr, x, 1.3, D - 0.72);
    t.box(3.0, 0.08, 0.08, m.yellow, 0, 2.6, D - 0.72, { cast: false });
    t.box(2.9, 0.03, 0.34, m.oak, 0, 2.48, D - 0.82, { cast: false });
    for (let i = 0; i < 7; i++) t.box(0.3, 0.16, 0.28, mc(k, dc[i % 5], { roughness: 0.5 }), -1.2 + i * 0.4, 2.58, D - 0.82, { r: 0.015, cast: false });
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 18), m.yellow); reel.rotation.z = Math.PI / 2; reel.position.set(1.3, 2.3, D - 0.72); T.add(reel);
    // the pegboard tool wall on a frame behind the stool
    for (const x of [-1.5, 1.5]) t.box(0.06, 2.4, 0.06, gr, x, 1.2, D - 1.8);
    if (!k.my.pegT) k.my.pegT = tex(k, 768, 288, (c) => {
      c.fillStyle = '#d7c7a6'; c.fillRect(0, 0, 768, 288);
      c.fillStyle = 'rgba(80,60,30,.35)'; for (let x = 12; x < 768; x += 24) for (let y = 12; y < 288; y += 24) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); }
      c.fillStyle = '#1d232a'; c.fillRect(0, 0, 768, 40); for (let x = -40; x < 768; x += 40) { c.fillStyle = '#f5c518'; c.beginPath(); c.moveTo(x, 40); c.lineTo(x + 20, 40); c.lineTo(x + 40, 32); c.lineTo(x + 20, 32); c.fill(); }
      txt(c, 'TALLER DE ELECTROMEDICINA', 384, 18, '800 24px system-ui', '#f5c518', 'center');
      const tool = (x, y, w, h, col, r = 0) => { c.save(); c.translate(x, y); c.rotate(r); c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, -w / 2 + 3, -h / 2 + 3, w, h, 4); c.fill(); c.fillStyle = col; rr(c, -w / 2, -h / 2, w, h, 4); c.fill(); c.restore(); };
      for (let i = 0; i < 6; i++) { tool(60 + i * 26, 130, 12, 110 - i * 8, '#9aa4ae'); tool(60 + i * 26, 84, 18, 36, ['#e23a46', '#f5c518', '#2b6cb0', '#16a34a', '#e23a46', '#f08a24'][i]); }
      for (let i = 0; i < 4; i++) { tool(250 + i * 34, 140, 14, 130 - i * 16, '#b7c0c8'); c.strokeStyle = '#b7c0c8'; c.lineWidth = 8; c.beginPath(); c.arc(250 + i * 34, 72 + i * 8, 13, 0.6, TAU - 0.6); c.stroke(); }
      for (let i = 0; i < 3; i++) { c.save(); c.translate(420 + i * 44, 120); c.fillStyle = '#e23a46'; rr(c, -14, 10, 10, 70, 4); c.fill(); rr(c, 4, 10, 10, 70, 4); c.fill(); c.fillStyle = '#8b949c'; c.beginPath(); c.moveTo(-10, 10); c.lineTo(0, -40); c.lineTo(10, 10); c.fill(); c.restore(); }
      c.strokeStyle = '#2b6cb0'; c.lineWidth = 7; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(590 + i * 46, 130, 18, 40, 0, 0, TAU); c.stroke(); }
      c.fillStyle = '#f5c518'; rr(c, 700, 70, 44, 76, 8); c.fill(); c.fillStyle = '#1d232a'; c.fillRect(708, 80, 28, 18);
      c.fillStyle = '#fbf8f0'; rr(c, 24, 214, 300, 58, 6); c.fill(); txt(c, 'Revisión desfibriladores: viernes', 36, 236, '700 18px system-ui', '#1d232a'); txt(c, 'Bombas de infusión: 3 pendientes', 36, 258, '600 16px system-ui', '#c81e1e');
    });
    t.sign(3.0, 1.12, k.my.pegT, { to: T, rough: 0.85 }).position.set(0, 1.62, D - 1.77);
    t.box(3.04, 1.2, 0.03, m.walnutDark, 0, 1.62, D - 1.8, { cast: false });
    // the red rolling tool chest beside the stool, left
    const tc = b.grp(-1.28, 0, D - 1.4, 0.15);
    for (const [x, z] of [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]]) b.caster(x, z, tc);
    b.box(0.56, 0.78, 0.46, m.red, 0, 0.53, 0, { r: 0.02, to: tc });
    for (let i = 0; i < 5; i++) { b.box(0.52, 0.006, 0.01, mc(k, 0x8f1420), 0, 0.24 + i * 0.14, 0.232, { cast: false, to: tc }); b.box(0.3, 0.02, 0.03, m.chrome, 0, 0.3 + i * 0.14, 0.24, { cast: false, to: tc }); }
    b.box(0.6, 0.04, 0.5, m.dark, 0, 0.94, 0, { cast: false, to: tc });
    b.box(0.3, 0.05, 0.06, m.yellow, -0.08, 0.99, 0.05, { cast: false, to: tc, ry: 0.3 }); b.cyl(0.02, 0.02, 0.22, m.red, 0.12, 0.98, -0.05, { cast: false, to: tc, rz: Math.PI / 2 });
    infoAt(st, { tray: [0.05, 0, -0.06], front: [0, 0, -0.04] });
    chairStyle(k, st, 'stool', new THREE.Color(st.agent.color || '#7c3aed'));
  },

  // --- Investigación clínica: a white lab bench with a low reagent shelf along its front, flasks, a plate reader
  // and pipettes; the -20 °C freezer under its right end; behind the stool on the left the class II biosafety
  // cabinet, glowing blue
  research(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: M(k).labTop }), b = kit(k, R), t = kit(k, T);
    noLaptop(st); floorZone(k, R, D, 'research');
    const BX0 = -0.78, BX1 = 1.58, bxc = (BX0 + BX1) / 2, TZ = D - 0.02;
    sizeTop(st, BX1 - BX0, 1.3, bxc, TZ);
    b.box(BX1 - BX0, 0.05, 1.3, m.labTop, bxc, 0.95, TZ, { cast: false });
    // under the bench: the freezer at the right, a knee space and a white modesty panel, the end panel at the left
    b.box(0.96, 0.88, 1.2, m.offwhite, 1.06, 0.5, TZ); b.box(0.94, 0.06, 1.14, m.teal, 1.06, 0.03, TZ, { cast: false });
    b.box(0.92, 0.012, 0.01, m.grey, 1.06, 0.55, TZ + 0.605, { cast: false }); b.box(0.04, 0.4, 0.03, m.steel, 0.65, 0.5, TZ + 0.62, { cast: false });
    const fr = k.my.frzT || (k.my.frzT = tex(k, 128, 48, (cc) => { cc.fillStyle = '#04141c'; cc.fillRect(0, 0, 128, 48); txt(cc, '-20 °C', 64, 25, '800 26px system-ui', '#7fd3ff', 'center'); }));
    b.screen(0.16, 0.06, fr, 1.2, R).position.set(1.25, 0.85, TZ + 0.605);
    b.box(1.36, 0.5, 0.04, m.white, 0.0, 0.66, TZ + 0.58, { cast: false });
    b.box(0.05, 0.94, 1.22, m.white, BX0 + 0.03, 0.47, TZ, { cast: false });
    // the reagent shelf along the front edge: two posts, a glass shelf, coloured bottles
    for (const x of [-0.35, 1.52]) b.box(0.03, 0.26, 0.03, m.steel, x, 1.1, TZ + 0.56, { cast: false });
    b.box(1.9, 0.02, 0.16, m.glass, 0.585, 1.24, TZ + 0.56, { cast: false });
    const rc = [0xe23a46, 0xf5c518, 0x3fa7f5, 0x7c3aed, 0x16a34a, 0xf08a24, 0xffffff];
    for (let i = 0; i < 11; i++) { const x = -0.25 + i * 0.165, h = 0.12 + (i % 3) * 0.04; b.box(0.09, h, 0.09, i % 4 === 1 ? M(k).clear : mc(k, rc[i % 7], { roughness: 0.3 }), x, 1.25 + h / 2, TZ + 0.56, { cast: false, r: 0.012 }); b.box(0.05, 0.03, 0.05, m.white, x, 1.25 + h + 0.015, TZ + 0.56, { cast: false }); }
    // on the bench: flasks with coloured liquid, a plate reader turned to the researcher, a pipette carousel,
    // petri dishes, a tube rack, a lab notebook
    const liq = [0x2de0c8, 0xf5a623, 0xff6fa8].map((cc) => mc(k, cc, { roughness: 0.15, transparent: true, opacity: 0.85 }));
    const flaskG = k.my.flaskG || (k.my.flaskG = new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.095, 0.02], [0.06, 0.12], [0.025, 0.17], [0.025, 0.24], [0.03, 0.25]].map(([x, y]) => new THREE.Vector2(x, y)), 18));
    const liqG = k.my.liqG || (k.my.liqG = new THREE.LatheGeometry([[0, 0.005], [0.088, 0.005], [0.09, 0.02], [0.065, 0.09], [0, 0.09]].map(([x, y]) => new THREE.Vector2(x, y)), 18));
    for (let i = 0; i < 3; i++) { const x = 0.75 + i * 0.27, z = TZ - 0.42 + (i % 2) * 0.16; const f = new THREE.Mesh(flaskG, M(k).clear); f.position.set(x, 1.0, z); f.scale.setScalar(1.5); f.renderOrder = 2; R.add(f); const l = new THREE.Mesh(liqG, liq[i]); l.position.set(x, 1.0, z); l.scale.setScalar(1.5); R.add(l); }
    const pr = b.grp(-0.05, 1.0, TZ - 0.35, Math.PI);
    b.box(0.5, 0.22, 0.4, m.white, 0, 0.11, 0, { to: pr, r: 0.03 }); b.box(0.3, 0.012, 0.2, M(k).tealSoft, 0, 0.226, 0.04, { to: pr, cast: false });
    const prT = k.my.prT || (k.my.prT = tex(k, 160, 96, (cc) => { cc.fillStyle = '#05212a'; cc.fillRect(0, 0, 160, 96); txt(cc, 'LECTOR · 96', 80, 14, '700 13px system-ui', '#8fd3c9', 'center'); for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) { cc.fillStyle = ['#2de0c8', '#1f9e8f', '#f5a623', '#ff6fa8'][(r * 3 + c * 5) % 4]; cc.beginPath(); cc.arc(14 + c * 19, 34 + r * 16, 6, 0, TAU); cc.fill(); } }));
    const prs = b.screen(0.26, 0.15, prT, 1.15, pr); prs.position.set(0, 0.13, 0.205);
    b.cyl(0.13, 0.14, 0.03, m.white, 1.35, 1.015, TZ + 0.02); b.cyl(0.015, 0.015, 0.42, m.steel, 1.35, 1.22, TZ + 0.02, { cast: false }); b.cyl(0.11, 0.11, 0.02, m.white, 1.35, 1.38, TZ + 0.02, { cast: false });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.cyl(0.018, 0.008, 0.3, [m.white, m.teal, m.white, m.yellow, m.white][i], 1.35 + Math.cos(a) * 0.09, 1.24, TZ + 0.02 + Math.sin(a) * 0.09, { cast: false, seg: 8 }); }
    for (let i = 0; i < 4; i++) b.cyl(0.06, 0.06, 0.014, i === 3 ? mc(k, 0xffd1dc, { roughness: 0.3 }) : M(k).clear, -0.6, 1.01 + i * 0.016, TZ - 0.36, { cast: false });
    const nb = b.grp(0.95, 1.0, TZ + 0.27, -0.25); b.box(0.32, 0.02, 0.24, mc(k, 0x1d2b45), 0, 0.01, 0, { to: nb, cast: false }); b.box(0.3, 0.004, 0.22, m.sheet, 0.0, 0.022, 0, { to: nb, cast: false });
    // the biosafety cabinet at the back left: its base, the lit blue work zone behind a sloped sash, the filter
    // housing on top (the tall part stays out of a second row)
    const CX0 = -1.6, CX1 = -0.8, cx = (CX0 + CX1) / 2, CZ = D - 1.45;
    b.box(CX1 - CX0, 0.95, 0.78, m.white, cx, 0.475, CZ); b.box(CX1 - CX0 - 0.04, 0.06, 0.72, m.teal, cx, 0.03, CZ, { cast: false });
    for (let i = 0; i < 2; i++) b.box(0.36, 0.7, 0.012, m.offwhite, cx - 0.19 + i * 0.38, 0.5, CZ + 0.395, { cast: false });
    const c = t.grp(cx, 0.95, CZ);
    for (const x of [-0.39, 0.39]) t.box(0.04, 0.9, 0.76, m.white, x, 0.45, 0, { to: c });
    t.box(0.82, 0.55, 0.8, m.white, 0, 1.17, 0, { to: c });
    t.box(0.76, 0.84, 0.02, k.my.bscBlue || (k.my.bscBlue = k.glow(0x4aa8ff, 1.35)), 0, 0.45, -0.36, { to: c, cast: false });
    t.box(0.76, 0.02, 0.7, m.steel, 0, 0.02, 0.0, { to: c, cast: false });
    t.box(0.76, 0.035, 0.03, k.my.bscBlue, 0, 0.86, 0.33, { to: c, cast: false });
    const sash = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.52), M(k).glass); sash.position.set(0, 0.62, 0.39); sash.rotation.x = -0.1; c.add(sash);
    t.box(0.78, 0.05, 0.04, m.steel, 0, 0.34, 0.4, { to: c, cast: false });
    t.box(0.14, 0.22, 0.1, m.white, -0.18, 0.13, 0.02, { to: c, cast: false }); t.cyl(0.015, 0.008, 0.24, m.teal, 0.15, 0.15, 0.05, { to: c, cast: false, rz: 0.5 });
    for (let i = 0; i < 3; i++) t.cyl(0.03, 0.03, 0.1, M(k).clear, -0.02 + i * 0.08, 0.08, -0.1, { to: c, cast: false, seg: 10 });
    const bsc = k.my.bscT || (k.my.bscT = tex(k, 256, 56, (cc) => { cc.fillStyle = '#05212a'; cc.fillRect(0, 0, 256, 56); txt(cc, 'CLASE II · FLUJO OK', 128, 20, '800 18px system-ui', '#7fffd4', 'center'); txt(cc, 'UV  ○   LUZ  ●   0,45 m/s', 128, 42, '600 14px system-ui', '#cfe8ff', 'center'); }));
    t.screen(0.5, 0.11, bsc, 1.15, c).position.set(0, 1.2, 0.41);
    const bl = k.my.bioT || (k.my.bioT = tex(k, 256, 48, (cc) => { cc.fillStyle = '#ffffff'; cc.fillRect(0, 0, 256, 48); cc.fillStyle = '#f5c518'; cc.beginPath(); cc.moveTo(10, 40); cc.lineTo(26, 8); cc.lineTo(42, 40); cc.closePath(); cc.fill(); txt(cc, 'BIOSEGURIDAD', 150, 25, '800 22px system-ui', '#1d232a', 'center'); }));
    t.sign(0.5, 0.094, bl, { to: c }).position.set(0, 1.37, 0.41);
    const bscL = k.my.bscLight || (k.my.bscLight = []); const pl = new THREE.PointLight(0x5ab0ff, 0, 3.0, 2); pl.position.set(0, 0.5, 0.7); c.add(pl); bscL.push(pl);
    lightAt(k, st, 0.5, 1.85, TZ + 0.15);
    infoAt(st, { orb: [0.55, 0, -0.05], flags: [0.6, 0, -0.5], tray: [0.08, 0, -0.05], front: [0, 0, -0.04] });
    chairStyle(k, st, 'stool', new THREE.Color(st.agent.color || '#ea580c'));
  },

  // --- Médico residente: piles of textbooks, coffee cups, a backpack, and a full skeleton on its stand
  resident(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: M(k).oak, keepFrame: true, frame: M(k).white, deskMat: M(k).tealSoft }), b = kit(k, R), t = kit(k, T);
    const bookC = [0x7a1d2c, 0x2b6cb0, 0x16a34a, 0xf5c518, 0x0f6f68, 0x7c3aed, 0xe23a46];
    [[-1.15, D - 0.45, 5], [-0.78, D - 0.5, 3], [1.15, D - 0.15, 4]].forEach(([x, z, n], j) => { for (let i = 0; i < n; i++) { b.box(0.34 - (i % 2) * 0.03, 0.07, 0.25, mc(k, bookC[(i + j * 2) % 7], { roughness: 0.6 }), x, 1.075 + i * 0.072, z, { ry: (i % 3 - 1) * 0.12, cast: false }); b.box(0.32 - (i % 2) * 0.03, 0.06, 0.005, m.sheet, x, 1.075 + i * 0.072, z + 0.125, { ry: (i % 3 - 1) * 0.12, cast: false }); } });
    const ob = b.grp(0.88, 1.045, D - 0.45, -0.3); b.box(0.24, 0.015, 0.32, m.sheet, -0.12, 0.012, 0, { to: ob, rz: 0.06, cast: false }); b.box(0.24, 0.015, 0.32, m.sheet, 0.12, 0.012, 0, { to: ob, rz: -0.06, cast: false });
    for (let i = 0; i < 3; i++) b.cyl(0.045, 0.035, 0.12, m.white, 0.55 + i * 0.12, 1.1, D - 0.62 + (i % 2) * 0.08, { cast: false, seg: 12 });
    for (let i = 0; i < 4; i++) b.box(0.07, 0.003, 0.07, mc(k, [0xfff07a, 0xff9ec2, 0x9be8ff, 0xb6ff9e][i]), -0.25 + i * 0.12, 1.06, D + 0.08 + (i % 2) * 0.05, { ry: i * 0.3, cast: false });
    const sk = b.grp(1.22, 1.04, D - 0.55, -0.5); // a little skull, too
    b.sph(0.09, m.bone, 0, 0.13, 0, { sx: 0.9, sy: 0.95, sz: 1.1, to: sk }); b.box(0.11, 0.05, 0.09, m.bone, 0, 0.05, 0.03, { r: 0.02, to: sk });
    for (const s of [-1, 1]) b.sph(0.022, m.black, s * 0.035, 0.12, 0.08, { to: sk, cast: false });
    const bp = b.grp(-0.75, 0, k.C.SEAT_Z + 0.15, 0.4); b.box(0.32, 0.4, 0.2, m.navy, 0, 0.2, 0, { r: 0.06, to: bp }); b.box(0.24, 0.16, 0.06, m.teal, 0, 0.14, 0.11, { r: 0.03, to: bp });
    // the skeleton on its stand behind the left of the chair (tall)
    const s = t.grp(-1.15, 0, D - 1.5, 0.35), bone = m.bone;
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; t.box(0.04, 0.03, 0.3, m.steel, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, { ry: a, cast: false, to: s }); t.caster(Math.sin(a) * 0.29, Math.cos(a) * 0.29, s); }
    t.cyl(0.018, 0.018, 1.95, m.steel, 0, 1.03, -0.12, { to: s }); t.rod([0, 2.0, -0.12], [0, 2.02, 0], 0.012, m.steel, s); t.rod([0, 2.02, 0], [0, 1.92, 0], 0.008, m.steel, s);
    t.sph(0.1, bone, 0, 1.8, 0, { sx: 0.9, sy: 1, sz: 1.1, to: s }); t.box(0.1, 0.06, 0.08, bone, 0, 1.69, 0.03, { r: 0.02, to: s });
    for (const e of [-1, 1]) t.sph(0.022, m.black, e * 0.035, 1.79, 0.085, { to: s, cast: false });
    for (let i = 0; i < 10; i++) t.cyl(0.025, 0.025, 0.035, bone, 0, 1.08 + i * 0.05, -0.02, { to: s, cast: false, seg: 8 }); // spine
    for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.12 - Math.abs(i - 2) * 0.012, 0.01, 6, 18, Math.PI * 1.6), bone); r.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.7); r.position.set(0, 1.28 + i * 0.055, 0.0); s.add(r); }
    t.rod([-0.17, 1.55, 0.02], [0.17, 1.55, 0.02], 0.014, bone, s); // clavicles
    t.sph(0.1, bone, 0, 0.98, 0, { sx: 1.4, sy: 0.6, sz: 0.8, to: s }); // pelvis
    for (const e of [-1, 1]) {
      t.rod([e * 0.18, 1.53, 0], [e * 0.21, 1.22, 0.02], 0.018, bone, s); t.rod([e * 0.21, 1.22, 0.02], [e * 0.23, 0.95, 0.06], 0.014, bone, s); t.sph(0.03, bone, e * 0.23, 0.92, 0.06, { to: s, cast: false });
      t.rod([e * 0.1, 0.95, 0], [e * 0.11, 0.5, 0.02], 0.022, bone, s); t.rod([e * 0.11, 0.5, 0.02], [e * 0.11, 0.12, 0.0], 0.018, bone, s); t.box(0.06, 0.03, 0.12, bone, e * 0.11, 0.1, 0.04, { to: s, cast: false });
    }
    lightAt(k, st, 0.55, 1.6, D + 0.15);
    deskLamp(k, b, D);
    chairStyle(k, st, 'default', new THREE.Color(st.agent.color || '#14a39a'));
  },

  // --- Comité clínico: case files in piles, a stamp, and a flip chart with today's cases
  review(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: M(k).oak, deskMat: M(k).tealSoft }), b = kit(k, R), t = kit(k, T);
    for (const x of [-1.05, 1.05]) { b.box(0.8, 0.96, 1.2, m.white, x, 0.48, D - 0.02); for (let i = 0; i < 3; i++) { b.box(0.74, 0.005, 0.01, m.grey, x, 0.3 + i * 0.3, D + 0.585, { cast: false }); b.box(0.24, 0.025, 0.03, m.steel, x, 0.42 + i * 0.3, D + 0.6, { cast: false }); } }
    frontPanel(b, D, m.white, 1.3);
    const fc = [0xf9d77e, 0x9cc7f0, 0xf4a7b9, 0xbfe3dd, 0xfde68a, 0xc4b5fd];
    [[-1.1, D - 0.4, 7], [-0.75, D - 0.5, 4], [1.12, D - 0.45, 6]].forEach(([x, z, n], j) => { for (let i = 0; i < n; i++) b.box(0.32, 0.028, 0.24, mc(k, fc[(i + j) % 6], { roughness: 0.7 }), x, 1.06 + i * 0.03, z, { ry: ((i * 7) % 5 - 2) * 0.04, cast: false }); });
    const stp = b.grp(1.15, 1.04, D + 0.05); b.box(0.09, 0.03, 0.06, m.red, 0, 0.015, 0, { to: stp }); b.cyl(0.012, 0.016, 0.07, m.walnut, 0, 0.065, 0, { to: stp }); b.cyl(0.024, 0.024, 0.022, m.walnut, 0, 0.11, 0, { to: stp });
    b.box(0.12, 0.015, 0.08, m.navy, 0.95, 1.05, D + 0.07, { cast: false });
    const gl = b.grp(-0.6, 1.06, D + 0.05, 0.3); for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), m.dark); r.rotation.x = -Math.PI / 2; r.position.x = s * 0.038; gl.add(r); }
    // flip chart easel behind the left of the chair (tall)
    const e = t.grp(-1.12, 0, D - 1.5, 0.3);
    t.rod([-0.36, 0, 0.18], [-0.3, 1.95, 0], 0.02, m.steel, e); t.rod([0.36, 0, 0.18], [0.3, 1.95, 0], 0.02, m.steel, e); t.rod([0, 0, -0.35], [0, 1.85, -0.02], 0.02, m.steel, e);
    const fp = k.my.flipT || (k.my.flipT = tex(k, 256, 320, (c) => {
      c.fillStyle = '#fdfdfb'; c.fillRect(0, 0, 256, 320);
      txt(c, 'SESIÓN CLÍNICA', 128, 26, '800 24px system-ui', '#0f6f68', 'center'); c.fillStyle = '#14a39a'; c.fillRect(30, 44, 196, 3);
      [['Caso 1 · Colecistitis', true], ['Caso 2 · Fractura cadera', true], ['Caso 3 · Neumonía', false], ['Caso 4 · Apendicitis', false]].forEach(([s, ok], i) => { txt(c, ok ? '✓' : '○', 22, 76 + i * 40, '800 22px system-ui', ok ? '#16a34a' : '#c81e1e'); txt(c, s, 44, 76 + i * 40, '600 17px system-ui', '#1d232a'); });
      txt(c, 'Decisión por consenso', 128, 260, 'italic 600 17px system-ui', '#2b6cb0', 'center'); c.strokeStyle = '#e23a46'; c.lineWidth = 4; c.beginPath(); c.ellipse(128, 260, 104, 20, 0, 0, TAU); c.stroke();
    }));
    t.box(0.7, 0.9, 0.03, m.white, 0, 1.45, 0.03, { to: e }); t.sign(0.64, 0.8, fp, { to: e, rough: 0.9 }).position.set(0, 1.42, 0.05);
    t.box(0.74, 0.06, 0.06, m.dark, 0, 1.92, 0.04, { to: e, cast: false }); t.box(0.64, 0.05, 0.08, m.white, 0, 1.94, -0.02, { to: e, rx: -0.6, cast: false });
    t.box(0.7, 0.04, 0.1, m.steel, 0, 0.98, 0.07, { to: e, cast: false });
    lightAt(k, st, 0.55, 1.6, D + 0.15);
    deskLamp(k, b, D);
    chairStyle(k, st, 'default', new THREE.Color(st.agent.color || '#14a39a'));
  },

  // --- Gerente del hospital: walnut desk, leather chair, a model of the hospital under acrylic
  manager(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: M(k).walnut, keepFrame: true, frame: M(k).walnutDark, deskMat: M(k).leather }), b = kit(k, R);
    b.box(3.04, 0.02, 1.54, M(k).walnutDark, 0, 0.955, D, { cast: false });
    const md = b.grp(-1.1, 0, D - 1.45, 0.35);
    b.box(0.62, 0.95, 0.52, m.white, 0, 0.475, 0, { to: md }); b.box(0.66, 0.04, 0.56, m.walnutDark, 0, 0.97, 0, { to: md, cast: false });
    const bl = [[0, 0.17, 0, 0.3, 0.22], [0.16, 0.1, -0.08, 0.14, 0.16], [-0.17, 0.08, 0.06, 0.16, 0.2], [0.05, 0.06, 0.15, 0.3, 0.08]];
    for (const [x, h, z, w, d] of bl) b.box(w, h, d, m.white, x, 0.99 + h / 2, z, { to: md, cast: false });
    for (const [x, h, z, w, d] of bl) for (let i = 1; i < h / 0.035; i++) b.box(w + 0.004, 0.006, d + 0.004, mc(k, 0x6aa8c8, { roughness: 0.2 }), x, 0.99 + i * 0.035, z, { to: md, cast: false });
    const hp = tex(k, 64, 64, (c) => { c.fillStyle = '#2f3b45'; c.fillRect(0, 0, 64, 64); c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 24, 0, TAU); c.stroke(); txt(c, 'H', 32, 34, '900 30px system-ui', '#ffffff', 'center'); });
    const hpm = b.sign(0.14, 0.14, hp, { to: md }); hpm.rotation.x = -Math.PI / 2; hpm.position.set(0, 1.162, 0);
    b.box(0.03, 0.06, 0.03, m.red, 0, 1.19, 0.08, { to: md, cast: false });
    for (let i = 0; i < 5; i++) b.sph(0.03, M(k).leaf2, -0.25 + i * 0.12, 1.02, 0.22, { to: md, cast: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.32, 0.5), M(k).glass); box.position.set(0, 1.15, 0); box.renderOrder = 3; md.add(box);
    const pl = tex(k, 256, 64, (c) => { c.fillStyle = '#c9a76b'; c.fillRect(0, 0, 256, 64); txt(c, 'Hospital · Nuevo bloque 2028', 128, 33, '700 20px Georgia, serif', '#3b2a1e', 'center'); });
    b.sign(0.4, 0.1, pl, { to: md }).position.set(0, 0.8, 0.262);
    // desk: a globe, a phone, the strategic plan, a fountain pen
    const gb = b.grp(1.12, 1.04, D - 0.45); b.cyl(0.06, 0.07, 0.02, m.walnutDark, 0, 0.01, 0, { to: gb }); b.cyl(0.01, 0.01, 0.12, m.chrome, 0, 0.07, 0, { to: gb, cast: false }); b.sph(0.11, mc(k, 0x3f7cc4, { roughness: 0.4 }), 0, 0.2, 0, { to: gb });
    for (let i = 0; i < 4; i++) b.sph(0.045, M(k).leaf2, Math.cos(i * 1.7) * 0.07, 0.2 + Math.sin(i * 2.3) * 0.06, Math.sin(i * 1.7) * 0.07 + 0.04, { to: gb, sx: 1, sy: 0.6, sz: 0.5, cast: false });
    const pt = tex(k, 192, 256, (c) => { c.fillStyle = '#0f6f68'; c.fillRect(0, 0, 192, 256); txt(c, 'PLAN', 96, 70, '800 30px system-ui', '#ffffff', 'center'); txt(c, 'ESTRATÉGICO', 96, 104, '800 24px system-ui', '#ffffff', 'center'); txt(c, '2027–2030', 96, 150, '700 26px system-ui', '#bff3ea', 'center'); });
    const pp = b.sign(0.24, 0.32, pt, { rough: 0.7 }); pp.rotation.x = -Math.PI / 2; pp.rotation.z = 0.2; pp.position.set(-0.85, 1.062, D - 0.1);
    b.box(0.2, 0.05, 0.14, m.dark, -1.15, 1.065, D - 0.5, { r: 0.02, cast: false }); b.box(0.06, 0.04, 0.18, m.dark, -1.15, 1.1, D - 0.5, { r: 0.015, cast: false });
    b.cyl(0.008, 0.008, 0.16, mc(k, 0x1d2b45, { metalness: 0.6, roughness: 0.3 }), -0.6, 1.05, D - 0.05, { rz: Math.PI / 2, cast: false });
    lightAt(k, st, 0.55, 1.6, D + 0.15);
    deskLamp(k, b, D, true);
    chairStyle(k, st, 'exec');
  },

  // --- Jefatura de servicio: a deep walnut executive desk with a bow front (brass trim, a leather top) on two
  // drawer pedestals, on a big rug; the bookcase wing behind on the left, the white coat on its stand behind the
  // right, an X-ray viewer, a heart model and a green banker's lamp
  chief(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: null }), b = kit(k, R), t = kit(k, T);
    const TOP = 1.06, BZ = D - 0.82, SZ = D + 0.56, FZ = D + 0.76, HW = 1.6;
    // the rug under it all
    const rug = k.my.rugT || (k.my.rugT = tex(k, 512, 420, (c) => {
      c.fillStyle = '#7a2230'; c.fillRect(0, 0, 512, 420);
      c.strokeStyle = '#e8d3a8'; c.lineWidth = 10; c.strokeRect(18, 18, 476, 384); c.lineWidth = 3; c.strokeRect(38, 38, 436, 344);
      c.fillStyle = '#1d2b45'; c.fillRect(46, 46, 420, 328);
      c.fillStyle = '#7a2230'; c.beginPath(); c.ellipse(256, 210, 150, 110, 0, 0, TAU); c.fill();
      c.strokeStyle = '#e8d3a8'; c.lineWidth = 4; c.beginPath(); c.ellipse(256, 210, 150, 110, 0, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(256, 210, 70, 50, 0, 0, TAU); c.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.fillStyle = '#c9a76b'; c.beginPath(); c.arc(256 + Math.cos(a) * 110, 210 + Math.sin(a) * 80, 9, 0, TAU); c.fill(); }
      for (let x = 30; x < 490; x += 16) { c.fillStyle = '#e8d3a8'; c.fillRect(x, 2, 6, 10); c.fillRect(x, 408, 6, 10); }
    }));
    const rp = b.sign(3.44, 2.86, rug, { rough: 0.95 }); rp.rotation.x = -Math.PI / 2; rp.position.set(0, 0.006, D - 0.42); rp.receiveShadow = true;
    // the top: a bow front (an arc through the front corners and the middle), straight back and sides
    const Rb = ((HW * HW) + (FZ - SZ) * (FZ - SZ)) / (2 * (FZ - SZ)), cz = FZ - Rb, a1 = Math.asin(HW / Rb);
    const top = new THREE.Shape(); top.moveTo(-HW, BZ - D); top.lineTo(HW, BZ - D); top.lineTo(HW, SZ - D);
    for (let i = 0; i <= 24; i++) { const a = a1 - (2 * a1 * i) / 24; top.lineTo(Math.sin(a) * Rb, cz - D + Math.cos(a) * Rb); }
    top.lineTo(-HW, BZ - D);
    slab(R, top, 0.08, m.walnut, 0, TOP, D);
    const inlay = new THREE.Shape(); inlay.moveTo(-1.05, -0.62); inlay.lineTo(1.05, -0.62); inlay.lineTo(1.05, 0.2); inlay.lineTo(-1.05, 0.2); inlay.lineTo(-1.05, -0.62);
    slab(R, inlay, 0.006, m.leather, 0, TOP + 0.004, D);
    // the bow front: a curved walnut panel, a brass line under the top, a dark plinth
    const bow = (r, h, y, mat_) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1, true, -a1, 2 * a1), mat_); c.position.set(0, y, cz); c.castShadow = true; c.receiveShadow = true; R.add(c); return c; };
    bow(Rb - 0.06, 0.86, 0.55, mc(k, 0x5a3a28, { roughness: 0.45, side: THREE.DoubleSide }));
    bow(Rb - 0.045, 0.025, 0.95, mc(k, 0xc9a35a, { roughness: 0.3, metalness: 0.7 }));
    bow(Rb - 0.08, 0.1, 0.05, m.walnutDark);
    for (let i = 0; i < 5; i++) { const a = -a1 * 0.8 + (i * 1.6 * a1) / 4; if (i === 2) continue; b.box(0.05, 0.62, 0.03, m.walnutDark, Math.sin(a) * (Rb - 0.045), 0.55, cz + Math.cos(a) * (Rb - 0.045), { ry: a, cast: false }); } // fluting
    // the drawer pedestals at the ends, a back panel
    for (const s of [-1, 1]) {
      b.box(0.62, 0.92, 1.18, m.walnut, s * 1.22, 0.48, D - 0.22);
      for (let i = 0; i < 3; i++) b.box(0.012, 0.24, 0.5, m.walnutDark, s * 1.53, 0.2 + i * 0.27, D - 0.22, { cast: false });
    }
    b.box(1.84, 0.62, 0.04, m.walnutDark, 0, 0.62, BZ + 0.08, { cast: false });
    // a walnut plaque behind the nameplate, at the middle of the bow
    b.box(1.82, 0.5, 0.1, m.walnutDark, 0, 0.64, FZ - 0.09);
    // on the desk: the X-ray viewer, the heart model, a stethoscope, a framed photo, a fountain pen
    const xv = b.grp(-1.0, TOP, D - 0.45, 0.45);
    b.box(0.5, 0.42, 0.05, m.offwhite, 0, 0.27, 0, { to: xv }); b.box(0.2, 0.06, 0.16, m.offwhite, 0, 0.03, -0.04, { to: xv });
    const xr = k.my.chestT || (k.my.chestT = tex(k, 232, 320, (c) => { c.fillStyle = '#04070c'; c.fillRect(0, 0, 232, 320); chestFilm(c, 116, -20); }));
    b.screen(0.42, 0.36, xr, 1.15, xv).position.set(0, 0.28, 0.027);
    const hm = b.grp(0.62, TOP, D - 0.55); b.cyl(0.07, 0.08, 0.03, m.walnutDark, 0, 0.015, 0, { to: hm }); b.cyl(0.008, 0.008, 0.1, m.chrome, 0, 0.07, 0, { to: hm, cast: false });
    b.sph(0.09, mc(k, 0xb3202c, { roughness: 0.4 }), 0, 0.19, 0, { sx: 0.9, sy: 1.1, sz: 0.85, to: hm }); b.cyl(0.025, 0.03, 0.1, mc(k, 0x2b6cb0, { roughness: 0.4 }), 0.03, 0.29, 0, { to: hm, rz: -0.4, cast: false }); b.cyl(0.03, 0.03, 0.09, mc(k, 0xd84a4a), -0.03, 0.3, 0.02, { to: hm, rz: 0.5, cast: false });
    const sc = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 28, Math.PI * 1.6), m.dark); sc.rotation.x = -Math.PI / 2; sc.position.set(-0.55, TOP + 0.015, D + 0.02); R.add(sc);
    const fr = b.grp(0.98, TOP, D - 0.62, Math.PI - 0.4); b.box(0.2, 0.16, 0.02, m.walnutDark, 0, 0.08, 0, { to: fr, rx: -0.15 }); b.box(0.17, 0.13, 0.005, mc(k, 0x9cc7f0), 0, 0.08, 0.012, { to: fr, rx: -0.15, cast: false });
    b.cyl(0.008, 0.008, 0.16, mc(k, 0x1d2b45, { metalness: 0.6, roughness: 0.3 }), 0.2, TOP + 0.012, D + 0.12, { rz: Math.PI / 2, cast: false });
    // a green banker's lamp at the front right: brass foot and stem, the green glass shade lit from under
    const bk = b.grp(1.12, TOP, D + 0.12, -0.25), brass = mc(k, 0xc9a35a, { roughness: 0.3, metalness: 0.7 });
    b.cyl(0.08, 0.1, 0.03, brass, 0, 0.015, 0, { to: bk }); b.cyl(0.012, 0.012, 0.34, brass, 0, 0.18, 0, { to: bk, cast: false }); b.rod([0, 0.34, 0], [0, 0.36, 0.06], 0.01, brass, bk);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 18, 1, true, Math.PI / 2, Math.PI), mc(k, 0x1f6b4a, { roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide })); shade.rotation.z = Math.PI / 2; shade.scale.z = 0.7; shade.position.set(0, 0.4, 0.06); shade.castShadow = true; bk.add(shade);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), M(k).glowWarm); gl.rotation.x = Math.PI / 2; gl.position.set(0, 0.36, 0.06); bk.add(gl);
    // the bookcase wing: a low cupboard along the left side (always), its shelves up to 2.1 m (back row only)
    const BX = -1.42, BZ0 = D - 1.85, BZ1 = D - 0.86, bz = (BZ0 + BZ1) / 2;
    b.box(0.36, 0.9, BZ1 - BZ0, m.walnut, BX, 0.45, bz);
    for (let i = 0; i < 2; i++) b.box(0.012, 0.76, 0.46, m.walnutDark, BX + 0.185, 0.46, BZ0 + 0.27 + i * 0.5, { cast: false });
    b.box(0.4, 0.04, BZ1 - BZ0 + 0.04, m.walnutDark, BX, 0.92, bz, { cast: false });
    if (!k.my.spinesT) k.my.spinesT = tex(k, 512, 128, (c) => { let x = 0, i = 0; const cols = ['#7a1d2c', '#2b6cb0', '#16a34a', '#f5c518', '#0f6f68', '#7c3aed', '#e23a46', '#f3ead9', '#1d2b45']; c.fillStyle = '#4a3022'; c.fillRect(0, 0, 512, 128); while (x < 512) { const w = 14 + ((i * 7) % 11), h = 92 + ((i * 13) % 30); c.fillStyle = cols[i % cols.length]; c.fillRect(x, 128 - h, w, h); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x + 3, 128 - h + 12, w - 6, 3); c.fillRect(x + 3, 128 - 20, w - 6, 3); x += w + 1; i++; } });
    for (const y of [1.3, 1.72]) {
      t.box(0.34, 0.03, BZ1 - BZ0, m.walnut, BX, y - 0.21, bz, { cast: false });
      const sp = t.sign(BZ1 - BZ0 - 0.06, 0.38, k.my.spinesT, { to: T, rough: 0.7 }); sp.rotation.y = Math.PI / 2; sp.position.set(BX + 0.1, y, bz);
    }
    for (const z of [BZ0, BZ1]) t.box(0.36, 1.2, 0.04, m.walnut, BX, 1.5, z);
    t.box(0.38, 0.04, BZ1 - BZ0 + 0.04, m.walnut, BX, 2.11, bz);
    t.box(0.03, 1.2, BZ1 - BZ0, m.walnutDark, BX - 0.17, 1.5, bz, { cast: false });
    const dip = k.my.dipT || (k.my.dipT = tex(k, 192, 140, (c) => { c.fillStyle = '#c9a76b'; c.fillRect(0, 0, 192, 140); c.fillStyle = '#fbf8f0'; c.fillRect(10, 10, 172, 120); txt(c, 'DOCTORADO', 96, 38, '700 16px Georgia, serif', '#3b2a1e', 'center'); txt(c, 'MEDICINA', 96, 62, '800 22px Georgia, serif', '#3b2a1e', 'center'); c.fillStyle = '#b3202c'; c.beginPath(); c.arc(150, 104, 13, 0, TAU); c.fill(); }));
    for (const [z, ry] of [[BZ0 + 0.28, 0.25], [BZ1 - 0.3, 0.4]]) { const f = t.grp(BX + 0.02, 2.13, z, Math.PI / 2 - ry); t.box(0.34, 0.26, 0.025, m.walnutDark, 0, 0.14, 0, { to: f, rx: -0.12 }); t.sign(0.3, 0.22, dip, { to: f }).position.set(0, 0.14, 0.016); }
    const gb = b.grp(BX, 0.94, BZ0 + 0.3); b.cyl(0.06, 0.07, 0.02, m.walnutDark, 0, 0.01, 0, { to: gb }); b.cyl(0.01, 0.01, 0.12, m.chrome, 0, 0.07, 0, { to: gb, cast: false }); b.sph(0.11, mc(k, 0x3f7cc4, { roughness: 0.4 }), 0, 0.2, 0, { to: gb });
    for (let i = 0; i < 4; i++) b.sph(0.045, M(k).leaf2, Math.cos(i * 1.7) * 0.07, 0.2 + Math.sin(i * 2.3) * 0.06, Math.sin(i * 1.7) * 0.07 + 0.04, { to: gb, sx: 1, sy: 0.6, sz: 0.5, cast: false });
    coatStand(k, t, 1.25, D - 1.62, -0.5);
    lightAt(k, st, 0.75, 1.45, D + 0.35);
    infoAt(st, { orb: [0.05, 0.06, -0.05], tray: [0.05, 0.06, -0.12], flags: [0.05, 0.06, -0.05], front: [0, 0, FZ - D - 0.69] });
    chairStyle(k, st, 'exec');
  },

  // --- anyone else: a consulting desk with a blood-pressure monitor on its stand and an eye chart
  consult(k, st, R, T, D) {
    const m = prepDesk(k, st, { top: M(k).white, keepFrame: true, frame: M(k).tealSoft, deskMat: M(k).tealSoft }), b = kit(k, R);
    const bp = b.grp(-1.2, 0, D - 1.35, 0.4);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.box(0.04, 0.03, 0.26, m.steel, Math.sin(a) * 0.13, 0.06, Math.cos(a) * 0.13, { ry: a, cast: false, to: bp }); b.caster(Math.sin(a) * 0.25, Math.cos(a) * 0.25, bp); }
    b.cyl(0.018, 0.018, 1.2, m.chrome, 0, 0.65, 0, { to: bp }); b.box(0.28, 0.2, 0.12, m.white, 0, 1.3, 0, { r: 0.02, to: bp });
    const bt = tex(k, 128, 80, (c) => { c.fillStyle = '#04140e'; c.fillRect(0, 0, 128, 80); txt(c, '128/82', 64, 30, '800 28px system-ui', '#39ff88', 'center'); txt(c, '68 lpm', 64, 62, '700 18px system-ui', '#3fe0ff', 'center'); });
    b.screen(0.18, 0.11, bt, 1.3, bp).position.set(0, 1.32, 0.062);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 16), m.navy); cuff.position.set(0.17, 1.15, 0); cuff.rotation.y = Math.PI / 2; bp.add(cuff);
    const sc = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 28, Math.PI * 1.6), m.dark); sc.rotation.x = -Math.PI / 2; sc.position.set(-0.75, 1.055, D - 0.05); R.add(sc);
    const rx = tex(k, 128, 160, (c) => { c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, 128, 160); txt(c, 'RECETA', 10, 16, '800 14px system-ui', '#14776f'); c.strokeStyle = '#cfd6dc'; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(10, 36 + i * 13); c.lineTo(118, 36 + i * 13); c.stroke(); } });
    const rp = b.sign(0.2, 0.25, rx, { rough: 0.8 }); rp.rotation.x = -Math.PI / 2; rp.rotation.z = 0.15; rp.position.set(-1.1, 1.05, D - 0.35);
    b.plant(1.15, D - 0.45, 0.45).position.y = 1.04;
    lightAt(k, st, 0.55, 1.6, D + 0.15);
    deskLamp(k, b, D);
    chairStyle(k, st, 'default', new THREE.Color(st.agent.color || '#14a39a'));
  },
};

// white lab cabinets under a bench, a knee space in the middle, a teal kick plinth
function labCabinets(k, b, D, mat, freezer = false) {
  const m = M(k);
  for (const x of [-1.0, 1.0]) {
    b.box(0.9, 0.9, 1.28, x > 0 && freezer ? m.offwhite : mat, x, 0.51, D - 0.02);
    b.box(0.88, 0.06, 1.2, m.teal, x, 0.03, D - 0.02, { cast: false });
    if (x > 0 && freezer) { b.box(0.86, 0.012, 0.01, m.grey, x, 0.55, D + 0.625, { cast: false }); b.box(0.04, 0.4, 0.03, m.steel, x - 0.36, 0.5, D + 0.64, { cast: false }); continue; }
    for (let i = 0; i < 3; i++) { b.box(0.84, 0.005, 0.01, m.grey, x, 0.3 + i * 0.25, D + 0.625, { cast: false }); b.box(0.22, 0.025, 0.03, m.steel, x, 0.4 + i * 0.25, D + 0.64, { cast: false }); }
  }
  b.box(1.1, 0.5, 0.04, mat, 0, 0.72, D + 0.6, { cast: false });
}
// a white articulated exam lamp at the back right of the desk (the desk lamp's light sits in its head)
function deskLamp(k, b, D, brass = false) {
  const m = M(k), lm = brass ? mc(k, 0xc9a35a, { roughness: 0.3, metalness: 0.7 }) : m.white;
  b.cyl(0.1, 0.12, 0.035, lm, 1.25, 1.06, D - 0.6);
  b.rod([1.25, 1.07, D - 0.6], [1.15, 1.6, D - 0.55], 0.016, lm); b.rod([1.15, 1.6, D - 0.55], [0.6, 1.85, D - 0.25], 0.016, lm);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.14, 18, 1, true), new THREE.MeshStandardMaterial({ color: brass ? 0x1f4a3f : 0xf2f5f7, roughness: 0.35, side: THREE.DoubleSide }));
  sh.position.set(0.55, 1.8, D - 0.22); sh.rotation.z = 0.35; sh.castShadow = true; b.add(sh);
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), m.glowWarm); bulb.rotation.set(Math.PI / 2, 0.35, 0); bulb.position.set(0.53, 1.74, D - 0.22); b.add(bulb); // lit from under only
}

// a coat stand with a white coat hanging from it (collar, sleeves, pockets, a stethoscope over the hook), turned ry
function coatStand(k, b, x, z, ry = 0) {
  const m = M(k), g = b.grp(x, 0, z, ry);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; b.rod([0, 0.02, 0], [Math.cos(a) * 0.26, 0.02, Math.sin(a) * 0.26], 0.018, m.walnutDark, g); b.sph(0.03, m.walnutDark, Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26, { to: g, cast: false }); }
  b.cyl(0.022, 0.026, 1.92, m.walnut, 0, 0.96, 0, { to: g }); b.sph(0.045, m.walnutDark, 0, 1.94, 0, { to: g, cast: false });
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; b.rod([0, 1.78, 0], [Math.cos(a) * 0.13, 1.88, Math.sin(a) * 0.13], 0.01, m.chrome, g); }
  // the coat, on the hook facing +z: yoke, open body, two hanging sleeves, collar and lapels, pockets
  const c = b.grp(0, 0, 0.17, 0, g), cm = mc(k, 0xf6f8f9, { roughness: 0.8, side: THREE.DoubleSide });
  b.box(0.44, 0.08, 0.18, cm, 0, 1.7, 0, { r: 0.04, to: c });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.05, 22, 1, true, 0.32, TAU - 0.64), cm); body.scale.z = 0.62; body.position.y = 1.18; body.castShadow = true; c.add(body);
  for (const s of [-1, 1]) {
    b.rod([s * 0.2, 1.68, 0], [s * 0.25, 1.05, 0.0], 0.065, cm, c); b.cyl(0.066, 0.066, 0.02, mc(k, 0xe3e9ec), s * 0.25, 1.04, 0, { to: c, cast: false });
    const lap = b.box(0.07, 0.34, 0.02, mc(k, 0xe7ecef, { roughness: 0.8 }), s * 0.075, 1.55, 0.115, { to: c, cast: false }); lap.rotation.z = s * 0.35;
    b.box(0.13, 0.12, 0.012, mc(k, 0xe7ecef, { roughness: 0.8 }), s * 0.13, 0.95, 0.15, { to: c, cast: false });
  }
  const col = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 18, Math.PI), cm); col.rotation.x = -Math.PI / 2 - 0.2; col.position.set(0, 1.74, 0.02); c.add(col);
  b.box(0.012, 0.09, 0.012, m.drapeBlue, -0.12, 1.43, 0.15, { to: c, cast: false }); b.box(0.012, 0.08, 0.012, m.red, -0.15, 1.43, 0.15, { to: c, cast: false });
  b.box(0.1, 0.05, 0.012, M(k).teal, 0.12, 1.42, 0.152, { to: c, cast: false });
  const st = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 24, Math.PI * 1.2), mc(k, 0x22303a, { roughness: 0.35 })); st.position.set(0, 1.58, 0.13); st.rotation.z = Math.PI * 0.9; c.add(st);
  b.cyl(0.035, 0.035, 0.02, m.chrome, 0.06, 1.42, 0.15, { to: c, cast: false, rx: Math.PI / 2 });
  return g;
}

// --- Dirección médica: the heart of the ward. A round two-step dais (the floor medallion on top, lit rings at its
// edges); on it a C-shaped nurses'-station counter all round the director (a flat front for the nameplate, open on
// the right where they walk in), the ward and triage screens on the counter turned out to the room, inside it the
// director's own desk, and two lit totems with glowing crosses on the dais's rim.
const CTR = { FO: 1.9, RO: 2.3, FI: 1.45, RI: 1.85, G0: 1.43, G1: 2.23, H: 1.12, DAIS: 2.4, OFF: -0.65 };
function paintTriage(c) {
  const W = 512, H = 320;
  c.fillStyle = '#061620'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#b3202c'; c.fillRect(0, 0, W, 40);
  txt(c, 'URGENCIAS · TRIAJE', 14, 21, '800 21px system-ui', '#ffffff');
  txt(c, 'en espera', W - 14, 21, '600 16px system-ui', '#ffd9dc', 'right');
  [['I', 'Resucitación', 0, '0 min', '#e23a46'], ['II', 'Emergencia', 1, '4 min', '#f08a24'], ['III', 'Urgente', 3, '22 min', '#f5c518'], ['IV', 'Menos urgente', 5, '48 min', '#22c55e'], ['V', 'No urgente', 2, '1 h 10', '#3fa7f5']].forEach(([lv, name, n, w, col], i) => {
    const y = 66 + i * 50;
    c.fillStyle = col; rr(c, 14, y - 18, 56, 36, 8); c.fill(); txt(c, lv, 42, y + 1, '800 22px system-ui', '#0b1a24', 'center');
    txt(c, name, 84, y, '700 19px system-ui', '#e6eef3');
    for (let j = 0; j < n; j++) { c.fillStyle = col; c.beginPath(); c.arc(290 + j * 22, y, 8, 0, TAU); c.fill(); }
    txt(c, w, W - 16, y, '700 19px system-ui', col, 'right');
  });
}
function centreStation(k, st, R, T, D) {
  const m = prepDesk(k, st, { top: mc(k, 0xe8eff0, { roughness: 0.3 }), deskMat: M(k).tealSoft }), b = kit(k, R), t = kit(k, T);
  noLaptop(st);
  const L = st.lift || 0, CZ = D + CTR.OFF, H = CTR.H, { FO, RO, FI, RI, G0, G1 } = CTR;
  const AO = Math.acos(FO / RO), AI = Math.acos(FI / RI), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const rO = (d) => (a) => { const w = wrap(a); return (Math.abs(w) < AO ? FO / Math.cos(w) : RO) + d; };
  const rI = (d) => (a) => { const w = wrap(a); return (Math.abs(w) < AI ? FI / Math.cos(w) : RI) + d; };
  const ring = (fo, fi, depth, mat_, y) => slab(R, cShape(fo, fi, G1, G0 + TAU), depth, mat_, 0, y, CZ);
  const gl = k.my.centreGlow = k.my.centreGlow || k.glow(0x2de0c8, 1.6);
  // the dais: two steps down to the room's floor, the medallion on top, lit rings at both edges and on the floor
  const dm = mc(k, 0xf2f6f6, { roughness: 0.35 });
  if (L > 0) {
    const d1 = new THREE.Mesh(new THREE.CylinderGeometry(CTR.DAIS + 0.22, CTR.DAIS + 0.26, L / 2, 72), dm); d1.position.set(0, -L * 0.75, CZ); d1.receiveShadow = true; R.add(d1);
    const d2 = new THREE.Mesh(new THREE.CylinderGeometry(CTR.DAIS, CTR.DAIS + 0.02, L / 2, 72), dm); d2.position.set(0, -L * 0.25, CZ); d2.receiveShadow = true; d2.castShadow = true; R.add(d2);
    const st1 = new THREE.Mesh(new THREE.RingGeometry(CTR.DAIS + 0.02, CTR.DAIS + 0.22, 72), m.tealSoft); st1.rotation.x = -Math.PI / 2; st1.position.set(0, -L / 2 + 0.002, CZ); st1.receiveShadow = true; R.add(st1);
    for (const [r, y] of [[CTR.DAIS + 0.005, -0.006], [CTR.DAIS + 0.225, -L / 2 - 0.004], [CTR.DAIS + 0.275, -L + 0.012]]) { const tr = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 6, 96), gl); tr.rotation.x = Math.PI / 2; tr.position.set(0, y, CZ); R.add(tr); }
  }
  { const md = k.my.medT || (k.my.medT = tex(k, 1024, 1024, paintMedallion)); const p = plane(CTR.DAIS * 2, CTR.DAIS * 2, new THREE.MeshStandardMaterial({ map: md.tex, transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); p.rotation.x = -Math.PI / 2; p.position.set(0, 0.004, CZ); p.receiveShadow = true; R.add(keep(p)); }
  // the counter: body, kick plinth, the worktop ledge, lit lines under the ledge and at the plinth
  const fas = mc(k, 0xf7fafa, { roughness: 0.3 }), wt = mc(k, 0xdfe9e7, { roughness: 0.25 });
  ring(rO(-0.03), rI(0.03), H - 0.14, fas, H - 0.04);
  ring(rO(-0.07), rI(0.07), 0.1, m.tealDeep, 0.1);
  ring(rO(0.035), rI(-0.02), 0.05, wt, H + 0.01);
  ring(rO(0.0), rO(-0.04), 0.025, gl, H - 0.065);
  ring(rO(-0.045), rO(-0.09), 0.02, gl, 0.125);
  const F = CZ + FO - 0.03; // the flat front's face
  // the front: emblems either side of the nameplate, the station's name lit below it
  const em = k.my.emblemT || (k.my.emblemT = tex(k, 128, 128, (c) => { c.clearRect(0, 0, 128, 128); c.fillStyle = '#14a39a'; c.beginPath(); c.arc(64, 64, 60, 0, TAU); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(64, 64, 50, 0, TAU); c.fill(); crossIcon(c, 64, 64, 60, '#14a39a'); }));
  for (const s of [-1, 1]) { const e = b.sign(0.32, 0.32, em, { rough: 0.4 }); e.material.transparent = true; e.position.set(s * 1.07, 0.64, F + 0.004); }
  const dmT = k.my.dmT || (k.my.dmT = tex(k, 1024, 96, (c) => { c.fillStyle = '#0f6f68'; rr(c, 0, 0, 1024, 96, 14); c.fill(); crossIcon(c, 44, 48, 44, '#ffffff'); crossIcon(c, 980, 48, 44, '#ffffff'); txt(c, 'DIRECCIÓN MÉDICA', 512, 50, fit(c, 'DIRECCIÓN MÉDICA', 820, 800, 62, 30), '#ffffff', 'center'); }));
  at(b.sign(2.3, 0.215, dmT, { lit: 1.05 }), 0, 0.27, F + 0.005);
  // the curved sides: "CONTROL CENTRAL" in teal, both sides of the front
  const ccT = k.my.ccT2 || (k.my.ccT2 = tex(k, 768, 80, (c) => { c.clearRect(0, 0, 768, 80); txt(c, '✚  CONTROL CENTRAL  ✚', 384, 42, '800 50px system-ui', '#0f6f68', 'center'); }));
  const ccM = new THREE.MeshStandardMaterial({ map: ccT.tex, transparent: true, roughness: 0.4 });
  for (const a0 of [AO + 0.06, -G0 + 0.04]) { const cy = new THREE.Mesh(new THREE.CylinderGeometry(RO - 0.026, RO - 0.026, 0.2, 24, 1, true, a0, G0 - AO - 0.1), ccM); cy.position.set(0, 0.66, CZ); R.add(cy); }
  // the director's desk inside the ring: a white top on two pedestals, a modesty panel, the teal mat
  sizeTop(st, 2.4, 0.7, 0, D - 0.2);
  for (const x of [-0.92, 0.92]) { b.box(0.52, 0.94, 0.62, fas, x, 0.48, D - 0.2); for (let i = 0; i < 3; i++) b.box(0.2, 0.02, 0.02, m.steel, x, 0.3 + i * 0.25, D + 0.115, { cast: false }); }
  b.box(1.3, 0.5, 0.03, fas, 0, 0.68, D + 0.1, { cast: false });
  if (st.props.mat) { st.props.mat.position.z = D - 0.22; st.props.mat.scale.z = 0.85; }
  // two monitors on arms turned to the director, the phone
  const patT = k.my.patT || (k.my.patT = tex(k, 256, 160, (c) => { c.fillStyle = '#071622'; c.fillRect(0, 0, 256, 160); txt(c, 'PACIENTES · PLANTA 3', 10, 14, '700 13px system-ui', '#8fb6c9'); [['301', 'Estable', '#39ff88'], ['302', 'Post-op', '#ffd23f'], ['304', 'Alta hoy', '#3fe0ff'], ['307', 'Aislamiento', '#ff5d6c'], ['309', 'Libre', '#7b8a94']].forEach(([a, b2, col], i) => { txt(c, a, 12, 40 + i * 25, '700 15px system-ui', '#e6eef3'); c.fillStyle = col; c.beginPath(); c.arc(60, 40 + i * 25, 5, 0, TAU); c.fill(); txt(c, b2, 72, 40 + i * 25, '600 15px system-ui', col); }); }));
  for (const s of [-1, 1]) {
    const mo = b.grp(s * 0.72, 1.03, D - 0.4, Math.PI + s * 0.35);
    b.cyl(0.07, 0.08, 0.02, m.dark, 0, 0.01, 0, { to: mo, cast: false }); b.cyl(0.018, 0.018, 0.34, m.steel, 0, 0.18, 0, { to: mo, cast: false });
    b.box(0.6, 0.38, 0.04, m.white, 0, 0.48, 0, { r: 0.012, to: mo }); b.screen(0.56, 0.34, patT, 1.05, mo).position.set(0, 0.48, 0.021);
    const lg = b.sign(0.12, 0.12, em, { to: mo }); lg.material.transparent = true; lg.rotation.y = Math.PI; lg.position.set(0, 0.5, -0.021);
  }
  b.box(0.22, 0.05, 0.16, m.dark, 0.98, 1.055, D - 0.42, { r: 0.02, cast: false }); b.box(0.06, 0.04, 0.2, m.dark, 0.98, 1.1, D - 0.42, { r: 0.015, cast: false });
  // on the counter, turned out to the room: the ward status screen (right) and the ER triage board (left)
  const onRing = (a, r, ry = a) => b.grp(Math.sin(a) * r, H + 0.01, CZ + Math.cos(a) * r, ry);
  const scr = (a, s, keepIt) => {
    const g = onRing(a, 2.06);
    b.cyl(0.08, 0.09, 0.02, m.dark, 0, 0.01, 0, { to: g, cast: false }); b.cyl(0.03, 0.03, 0.34, m.steel, 0, 0.18, 0, { to: g });
    b.box(1.06, 0.68, 0.06, m.dark, 0, 0.7, 0, { r: 0.02, to: g }); b.box(1.06, 0.03, 0.065, gl, 0, 0.35, 0, { to: g, cast: false });
    const sc = b.screen(0.98, 0.61, s, 1.1, g); sc.position.set(0, 0.7, 0.032); if (keepIt) keep(sc);
    return g;
  };
  const ward = k.my.ward = k.surface(512, 320); paintWard(ward.ctx, false, 0); ward.tex.needsUpdate = true;
  scr(0.98, ward, true);
  scr(-0.98, k.my.triT || (k.my.triT = tex(k, 512, 320, paintTriage)));
  // the front ledge: a bell and sanitiser on the right, an orchid on the left
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, TAU, 0, Math.PI / 2), m.chrome); bell.position.set(0.62, H + 0.04, CZ + 1.72); R.add(bell); b.cyl(0.055, 0.06, 0.015, m.dark, 0.62, H + 0.045, CZ + 1.72, { cast: false });
  b.cyl(0.04, 0.045, 0.16, m.clear, 0.86, H + 0.12, CZ + 1.7, { cast: false }); b.cyl(0.035, 0.04, 0.1, m.fluid, 0.86, H + 0.09, CZ + 1.7, { cast: false }); b.cyl(0.015, 0.015, 0.05, m.white, 0.86, H + 0.22, CZ + 1.7, { cast: false });
  const orc = b.grp(-0.75, H + 0.04, CZ + 1.7);
  b.cyl(0.07, 0.06, 0.12, m.white, 0, 0.06, 0, { to: orc }); b.rod([0, 0.1, 0], [0.02, 0.42, 0.0], 0.006, m.leaf3, orc); b.rod([0.02, 0.42, 0], [0.1, 0.46, 0.03], 0.005, m.leaf3, orc);
  for (let i = 0; i < 5; i++) b.sph(0.03, mc(k, 0xd06bd6, { roughness: 0.6 }), 0.02 + i * 0.022, 0.4 + Math.sin(i) * 0.03, 0.02 + (i % 2) * 0.02, { to: orc, sx: 1.2, sy: 0.7, sz: 1.2, cast: false });
  for (let i = 0; i < 3; i++) b.sph(0.06, m.leaf2, Math.cos(i * 2.1) * 0.06, 0.13, Math.sin(i * 2.1) * 0.06, { to: orc, sx: 1.4, sy: 0.3, sz: 0.6, cast: false });
  // the back of the ring: the patient-chart rack (left), a printer, the nurse-call panel (right, by the way in)
  const rack = onRing(-2.05, 2.06, -2.05 + Math.PI);
  b.box(0.9, 0.02, 0.3, m.dark, 0, 0.01, 0, { to: rack, cast: false });
  const fc = [0xe23a46, 0x2b6cb0, 0x16a34a, 0xf5c518, 0x7c3aed, 0xf08a24, 0x0ea5e9];
  for (let i = 0; i < 7; i++) b.box(0.025, 0.3, 0.26, mc(k, fc[i], { roughness: 0.6 }), -0.36 + i * 0.12, 0.16, 0, { to: rack, rz: -0.25, cast: false });
  const pr = onRing(Math.PI - 0.35, 2.06, Math.PI - 0.35 + Math.PI);
  b.box(0.46, 0.22, 0.34, m.white, 0, 0.11, 0, { r: 0.02, to: pr }); b.box(0.3, 0.02, 0.18, m.sheet, 0, 0.23, 0.05, { to: pr, cast: false }); b.box(0.06, 0.02, 0.01, m.glowGreen, 0.16, 0.15, 0.172, { to: pr, cast: false });
  const callT = k.my.callT || (k.my.callT = tex(k, 192, 96, (c) => { c.fillStyle = '#0d1a24'; c.fillRect(0, 0, 192, 96); txt(c, 'LLAMADAS', 96, 13, '700 13px system-ui', '#8fb6c9', 'center'); for (let i = 0; i < 8; i++) { txt(c, String(301 + i * 3), 24 + (i % 4) * 48, 42 + Math.floor(i / 4) * 34, '700 13px system-ui', '#cfe1ea', 'center'); } }));
  const cp = onRing(2.5, 2.06, 2.5 + Math.PI);
  b.box(0.36, 0.2, 0.06, m.dark, 0, 0.1, 0, { to: cp, rx: -0.4 });
  const cps = b.screen(0.32, 0.16, callT, 1.1, cp); cps.position.set(0, 0.11, 0.035); cps.rotation.x = -0.4;
  const callM = k.my.callLed = k.my.callLed || new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.1), toneMapped: false });
  b.box(0.05, 0.03, 0.01, callM, 0.08, 0.06, 0.06, { to: cp, rx: -0.4, cast: false }).userData.keep = true;
  // inside the ring behind the chair: the coat stand with the white coat, a plant
  coatStand(k, b, -0.95, CZ - 1.2, 0.5);
  b.plant(0.95, CZ - 1.25, 0.42);
  chairStyle(k, st, 'white');
  lightAt(k, st, 0, 2.5, D - 0.3);
  infoAt(st, { orb: [0.2, 0, -0.55], tray: [0, 0, -0.45], flags: [0.25, 0, -0.55], front: [0, 0, F - D - 0.66 + 0.006] });
  // two lit totems on the dais's rim either side of the station, a glowing cross on top of each: they rise over the
  // ring at its sides only, where they hide nothing of the rows behind (the tall group: one row of desks only)
  const totT = k.my.totT || (k.my.totT = tex(k, 96, 512, (c) => { c.fillStyle = '#f7fafa'; c.fillRect(0, 0, 96, 512); c.fillStyle = '#0f6f68'; c.fillRect(0, 0, 96, 300); crossIcon(c, 48, 52, 52, '#ffffff'); c.save(); c.translate(48, 180); c.rotate(-Math.PI / 2); txt(c, 'DIRECCIÓN', 0, 0, '800 34px system-ui', '#ffffff', 'center'); c.restore(); c.fillStyle = '#2de0c8'; c.fillRect(0, 300, 96, 8); txt(c, 'PLANTA', 48, 350, '800 20px system-ui', '#0f6f68', 'center'); txt(c, '3', 48, 410, '900 64px system-ui', '#0f6f68', 'center'); }));
  const TH = 2.62;
  for (const a of [-1.62, 1.2]) {
    const g = t.grp(Math.sin(a) * (CTR.DAIS - 0.16), 0, CZ + Math.cos(a) * (CTR.DAIS - 0.16), a * 0.55);
    t.box(0.44, 0.08, 0.3, m.tealDeep, 0, 0.04, 0, { to: g, cast: false });
    t.box(0.4, TH, 0.22, fas, 0, TH / 2, 0, { to: g, r: 0.04 });
    t.sign(0.34, TH * 0.86, totT, { to: g, rough: 0.4 }).position.set(0, TH * 0.47, 0.112);
    for (const s2 of [-1, 1]) t.box(0.02, TH - 0.2, 0.02, gl, s2 * 0.205, TH / 2, 0.06, { to: g, cast: false });
    t.box(0.08, 0.42, 0.08, gl, 0, TH + 0.27, 0, { to: g, cast: false }); t.box(0.42, 0.08, 0.08, gl, 0, TH + 0.3, 0, { to: g, cast: false });
  }
  // its light: a warm pool on the dais at night
  const hl = new THREE.PointLight(0xffe7c2, 0, 7.5, 1.6); hl.position.set(0, 4.2 - L, CZ + 0.3); T.add(hl); (k.my.lamps = k.my.lamps || []).push([hl, 5.5, 0.6]);
}

// the mug people hold at the coffee spot (world.js's ch.mug, on the right hand): bigger, teal with a white band and
// a handle, upright in the coffee pose, with a little steam
function mugStyle(k, mug) {
  const m = M(k);
  mug.material = m.teal; mug.scale.set(1.45, 1.35, 1.45); mug.rotation.x = 1.3; mug.position.set(0, -0.56, 0.13);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.071, 0.066, 0.035, 18, 1, true), m.white); band.position.y = 0.02; mug.add(band);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.011, 6, 14), m.teal); h.position.set(0.075, 0, 0); mug.add(h);
  const cof = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), mc(k, 0x4a2a17, { roughness: 0.3 })); cof.rotation.x = -Math.PI / 2; cof.position.y = 0.055; mug.add(cof);
  const sm = k.my.mugSteamMat || (k.my.mugSteamMat = new THREE.SpriteMaterial({ map: tex(k, 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }).tex, transparent: true, depthWrite: false, opacity: 0.5 }));
  for (let i = 0; i < 3; i++) { const p = new THREE.Sprite(sm.clone()); p.userData.ph = i / 3; p.scale.setScalar(0.08); p.position.y = 0.12; mug.add(p); (k.my.mugSteam = k.my.mugSteam || []).push(p); }
}

// ---------------------------------------------------------------- the theme
export default {
  id: 'hospital',
  name: 'Hospital',
  roles: {
    // service names rather than job titles, so no woman on the floor wears a masculine title (and no man a feminine one)
    Product: 'Dirección médica', Development: 'Cirugía', Verification: 'Diagnóstico',
    Infrastructure: 'Electromedicina', Lead: 'Jefatura de servicio', Research: 'Investigación clínica',
    Prototyping: 'Residente', Review: 'Comité clínico', Superadmin: 'Gerencia',
  },
  texts: {
    room: 'Planta 3', board: 'Tablón de guardia', trace: 'Historia clínica', composer: 'Indicación para @{name}, o @all para todo el equipo',
    boardSub: 'tarjetas abiertas por quién debe moverlas', noCards: 'Sin tarjetas',
    traceHint: ['Este equipo aún no tiene matriz.', 'Pulsa el tablero para ver la de otro equipo.'],
    status: { working: 'en consulta', idle: 'de guardia', blocked: 'te necesita', offline: 'fuera de turno', now: 'ahora' },
  },
  exposure: 1.0,
  bloom: { strength: 0.55, radius: 0.5, threshold: 1 },
  // the director médico (Product, else Lead) runs the floor from the central station (themes/index.js: centre)
  // the dais is 2.66 round (CTR); with two rows of desks it moves forward and left, clear of the second row and the café
  centre: { roles: ['Product', 'Lead'], x: (rows) => (rows === 1 ? 0.6 : 0.0), z: (rows) => (rows === 1 ? 0.9 : 4.9), lift: 0.25, foot: { x0: -2.7, x1: 2.7, z0: CTR.OFF - 2.7, z1: CTR.OFF + 2.7 }, side: 2.95 },
  spots: { coffee: { x: CAFE.x, z: CAFE.z, yaw: CAFE.yaw } },
  boardStyle: { bg: '#0d1c22', ink: '#5eead4' },
  traceStyle: { bg: '#fbfdfc', ink: '#0f2f2b' },

  shell(k) { buildShell(k); },
  decor(k) {
    k.my.lamps = k.my.lamps || [];
    buildTheatre(k);
    buildCafe(k);
    buildFloor(k);
    // a cool fill high over the floor at night (the ward's calm blue-teal), off by day
    for (const [x, z] of [[-3.5, 1.5], [6.5, 0.5]]) { const l = new THREE.PointLight(0x7fd8e6, 0, 20, 1.3); l.position.set(x, 6.4, z); k.room.add(l); k.my.lamps.push([l, 3.2, 0]); }
    // at night the corridor's ceiling downlights leave warm pools on the open floor (soft additive patches, faded in
    // daylight()), and one real warm light over the front of the floor
    const poolT = tex(k, 256, 256, (c) => { const g = c.createRadialGradient(128, 128, 4, 128, 128, 126); g.addColorStop(0, 'rgba(255,214,160,1)'); g.addColorStop(0.45, 'rgba(255,200,140,.55)'); g.addColorStop(1, 'rgba(255,190,130,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }).tex;
    const pm = k.my.poolMat = new THREE.MeshBasicMaterial({ map: poolT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    for (const [x, z, r] of [[-2.4, 5.3, 2.3], [0.8, 7.6, 2.1], [-1.2, 8.4, 1.6], [9.0, 1.2, 2.4], [8.6, 7.6, 1.8]]) { const p = plane(r * 2, r * 2, pm); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.011, z); k.room.add(p); }
    const fl = new THREE.PointLight(0xffd8a8, 0, 11, 1.4); fl.position.set(-0.8, 4.8, 6.4); k.room.add(fl); k.my.lamps.push([fl, 9, 0]);
  },

  // ------------------------------------------------------------ fixtures: board, whiteboard (a giant clipboard), clock
  fixtures(k, fx) {
    const m = M(k);
    fx.board.frame.material = m.offwhite;
    const bf = fx.board.frame;
    k.room.add(k.box(0.14, 0.12, 8.5, 0, { m: m.teal, x: bf.position.x + 0.03, y: bf.position.y + 2.2, z: bf.position.z, cast: false }));
    fx.trace.frame.material = new THREE.MeshStandardMaterial({ color: 0x9a7b58, roughness: 0.55 });
    for (const l of fx.trace.legs) l.material = m.steel;
    const clip = new THREE.Group(); clip.position.set(0, 3.72, 0.06); fx.trace.group.add(clip);
    clip.add(k.box(0.9, 0.22, 0.08, 0, { m: m.chrome, r: 0.03 }), k.box(0.5, 0.12, 0.1, 0, { m: m.steel, y: 0.12, r: 0.03 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 20), m.chrome); ring.position.y = 0.22; clip.add(ring);
    const ht = tex(k, 512, 96, (c) => { c.fillStyle = '#0f6f68'; rr(c, 0, 0, 512, 96, 12); c.fill(); txt(c, 'HOJA DE EVOLUCIÓN', 256, 50, '800 46px system-ui', '#ffffff', 'center'); });
    const hp = plane(0.82, 0.154, new THREE.MeshStandardMaterial({ map: ht.tex, roughness: 0.45 })); hp.position.z = 0.042; clip.add(hp);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fx.trace.group.add(k.box(0.24, 0.24, 0.13, 0, { m: m.teal, x: sx * 1.98, y: 2.35 + sy * 1.28, z: 0.0, r: 0.06, cast: false }));
    k.my.traceMesh = fx.trace.mesh; k.my.boardMesh = fx.board.mesh;
    fx.clock.rim.material = m.white;
    const bez = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 10, 48), m.steel); bez.position.copy(fx.clock.face.position); bez.position.z += 0.01; k.room.add(bez);
  },

  clockFace(c, d) {
    c.fillStyle = '#fdfefe'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#13212a'; c.lineCap = 'butt';
    for (let i = 0; i < 60; i++) {
      const a = (i * Math.PI) / 30, big = i % 5 === 0;
      c.lineWidth = big ? 6 : 2;
      c.beginPath(); c.moveTo(128 + Math.sin(a) * (big ? 100 : 108), 128 - Math.cos(a) * (big ? 100 : 108)); c.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); c.stroke();
    }
    for (let i = 1; i <= 12; i++) { const a = (i * Math.PI) / 6; txt(c, String(i), 128 + Math.sin(a) * 82, 130 - Math.cos(a) * 82, '700 24px system-ui', '#13212a', 'center'); }
    txt(c, 'PLANTA 3', 128, 172, '700 13px system-ui', '#14a39a', 'center');
    const hand = (a, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(128 - Math.sin(a) * 14, 128 + Math.cos(a) * 14); c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); c.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 58, 10, '#13212a');
    hand(d.getMinutes() * (Math.PI / 30), 92, 6, '#13212a');
    c.fillStyle = '#e11d48'; c.beginPath(); c.arc(128, 128, 8, 0, TAU); c.fill();
  },

  // ------------------------------------------------------------ desks
  station(k, st) {
    const D = k.C.DESK_Z, kind = roleKind(st);
    const R = new THREE.Group(), T = new THREE.Group();
    st.group.add(R, T); st.group.userData.R = R;
    if (kind === 'centre') centreStation(k, st, R, T, D);
    else (LAB_STATIONS[kind] || LAB_STATIONS.consult)(k, st, R, T, D);
    // the status light becomes a nurse-call lamp: a frosted dome on a white base with a teal ring
    if (st.info && st.info.orb) {
      const o = st.info.orb, base = o.children[1];
      if (base && base.material) base.material = M(k).white;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.128, 18, 10, 0, TAU, 0, Math.PI * 0.62), M(k).clear); dome.position.set(-1.15, 1.2, D + 0.5); dome.renderOrder = 2; o.add(dome);
      o.add(at(k.cyl(0.135, 0.135, 0.025, 0, { m: M(k).teal }), -1.15, 1.15, D + 0.5));
    }
    if (st.props.bezel) { st.props.bezel.material.color.set(0x0f5e58); st.props.bezel.material.roughness = 0.4; }
    bake(R); bake(T);
    (k.my.tall = k.my.tall || {})[st.slug] = T;
    st.group.userData.hospital = kind;
  },

  plate(c, { name, title, color }) {
    c.clearRect(0, 0, 512, 128);
    c.fillStyle = '#ffffff'; rr(c, 2, 2, 508, 124, 18); c.fill();
    c.fillStyle = color; rr(c, 2, 2, 112, 124, 18); c.fill(); c.fillRect(90, 2, 24, 124);
    c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(58, 64, 36, 0, TAU); c.fill();
    crossIcon(c, 58, 64, 44, color);
    c.fillStyle = color; c.fillRect(114, 112, 396, 6);
    txt(c, name, 130, 46, fit(c, name, 370, 700, 42, 26), '#0f2a2f');
    txt(c, title, 130, 92, fit(c, title, 370, 600, 28, 18), color);
  },

  // ------------------------------------------------------------ people
  outfit(k, ch, a) {
    const { mats } = ch, role = (a && a.role) || '', m = M(k);
    if (ch.mug) mugStyle(k, ch.mug);
    const base = new THREE.Color((a && a.color) || '#14a39a'), hsl = {};
    base.getHSL(hsl);
    const scrub = new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.75), 0.5);
    if (!role) { // a visitor from another building: own clothes, a VISITA badge and blue shoe covers
      const vt = k.my.visT || (k.my.visT = tex(k, 64, 96, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 96); c.fillStyle = '#f59e0b'; c.fillRect(0, 0, 64, 30); txt(c, 'VISITA', 32, 16, '800 15px system-ui', '#ffffff', 'center'); c.fillStyle = '#cfd6dc'; c.fillRect(10, 40, 44, 8); c.fillRect(10, 56, 34, 8); }).tex);
      const bdg = plane(0.09, 0.135, new THREE.MeshStandardMaterial({ map: vt, roughness: 0.5 })); bdg.position.set(0.13, 0.48, 0.225); ch.upper.add(bdg);
      const cover = mc(k, 0x7fb2e5, { roughness: 0.9 });
      for (const leg of [ch.legL, ch.legR]) { const s = leg.children[2]; if (s && s.children[0]) s.children[0].material = cover; }
      return;
    }
    const manager = /superadmin|gerent|admin/i.test(role), tech = /infra|técn|tecn|devops|\bops\b/i.test(role);
    const coat = !manager && !tech && /product|lead|research|director|jefe/i.test(role);
    const surgeon = /^\s*(develop|ciruj|engineer)/i.test(role), researcher = /research|investig/i.test(role);
    if (manager) { // a dark suit, white shirt and a tie
      mats.shirt.color.set(0x2a3340); mats.shirtDark.color.set(0x1f2730); mats.pants.color.set(0x262e39);
      for (const arm of [ch.armL, ch.armR]) if (arm.children[1]) arm.children[1].material = mats.shirt;
      const v = new THREE.Shape(); v.moveTo(-0.1, 0.0); v.lineTo(0.1, 0.0); v.lineTo(0, -0.26); v.closePath();
      const vee = new THREE.Mesh(new THREE.ShapeGeometry(v), m.white); vee.position.set(0, 0.69, 0.218); vee.rotation.x = -0.2; ch.upper.add(vee);
      const tie = k.box(0.05, 0.24, 0.012, 0, { m: mc(k, 0xb3202c, { roughness: 0.5 }), y: 0.56, z: 0.224, cast: false }); tie.rotation.x = -0.18; ch.upper.add(tie);
      for (const s of [-1, 1]) { const lap = k.box(0.06, 0.3, 0.02, 0, { m: mats.shirtDark, x: s * 0.08, y: 0.56, z: 0.222, cast: false }); lap.rotation.z = s * 0.32; lap.rotation.x = -0.12; ch.upper.add(lap); }
      ch.upper.add(k.box(0.08, 0.03, 0.012, 0, { m: m.white, x: -0.13, y: 0.56, z: 0.218, cast: false }));
    } else if (tech) { // a navy work uniform with a hi-vis stripe and a tool belt, hair uncovered
      mats.shirt.color.copy(new THREE.Color(0x2c4a6e)); mats.shirtDark.color.set(0x223a58); mats.pants.color.set(0x2a3d55);
      ch.upper.add(k.box(0.46, 0.05, 0.02, 0, { m: k.glow(0xd8ff3a, 1.05), y: 0.42, z: 0.215, cast: false }));
      ch.upper.add(k.box(0.1, 0.1, 0.012, 0, { m: base.clone ? mc(k, base, { roughness: 0.5 }) : m.teal, x: -0.12, y: 0.55, z: 0.218, cast: false }));
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.03, 6, 24), mc(k, 0x5a3b22, { roughness: 0.7 })); belt.rotation.x = Math.PI / 2; belt.position.y = 0.12; belt.scale.set(1, 0.85, 1); ch.upper.add(belt);
      for (const s of [-1, 1]) ch.upper.add(k.box(0.08, 0.1, 0.05, 0, { m: mc(k, 0x5a3b22), x: s * 0.2, y: 0.06, z: 0.14, cast: false }));
      ch.upper.add(k.box(0.012, 0.09, 0.012, 0, { m: m.yellow, x: 0.2, y: 0.12, z: 0.17, cast: false }));
    } else {
      mats.shirt.color.copy(coat ? new THREE.Color(0xf7f9fa) : scrub);
      mats.shirtDark.color.copy(coat ? new THREE.Color(0xe4e9ec) : scrub.clone().multiplyScalar(0.78));
      mats.pants.color.copy(scrub.clone().multiplyScalar(0.92));
    }
    if (coat) { // long white sleeves, open coat skirt, lapels with the scrub top showing
      for (const arm of [ch.armL, ch.armR]) if (arm.children[1]) arm.children[1].material = mats.shirt;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.37, 0.42, 24, 1, true, 0.55, TAU - 1.1), new THREE.MeshStandardMaterial({ color: 0xf7f9fa, roughness: 0.8, side: THREE.DoubleSide }));
      skirt.position.y = -0.14; ch.wear(ch.upper, skirt);
      const v = new THREE.Shape(); v.moveTo(-0.1, 0.0); v.lineTo(0.1, 0.0); v.lineTo(0, -0.24); v.closePath();
      const vee = new THREE.Mesh(new THREE.ShapeGeometry(v), new THREE.MeshStandardMaterial({ color: scrub, roughness: 0.9 })); vee.position.set(0, 0.69, 0.218); vee.rotation.x = -0.2; ch.upper.add(vee);
      for (const s of [-1, 1]) { const lap = k.box(0.05, 0.3, 0.02, 0, { m: mats.shirtDark, x: s * 0.075, y: 0.56, z: 0.222, cast: false }); lap.rotation.z = s * 0.32; lap.rotation.x = -0.12; ch.upper.add(lap); }
      for (let i = 0; i < 3; i++) { const bt = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), m.offwhite); bt.position.set(0.03, 0.36 - i * 0.12, 0.222); ch.upper.add(bt); }
      ch.upper.add(k.box(0.12, 0.1, 0.012, 0, { m: mats.shirtDark, x: -0.13, y: 0.24, z: 0.215, cast: false }));
      ch.upper.add(k.box(0.012, 0.07, 0.012, 0, { m: m.drapeBlue, x: -0.1, y: 0.3, z: 0.224, cast: false }), k.box(0.012, 0.06, 0.012, 0, { m: m.red, x: -0.15, y: 0.3, z: 0.224, cast: false }));
    } else if (!manager && !tech) { // scrubs: V-neck, chest pocket with a pen; surgical cap with the hair tucked in
      const v = new THREE.Shape(); v.moveTo(-0.07, 0.0); v.lineTo(0.07, 0.0); v.lineTo(0, -0.12); v.closePath();
      const vee = new THREE.Mesh(new THREE.ShapeGeometry(v), mats.skin); vee.position.set(0, 0.665, 0.2); vee.rotation.x = -0.35; ch.upper.add(vee);
      ch.upper.add(k.box(0.11, 0.1, 0.012, 0, { m: mats.shirtDark, x: -0.12, y: 0.48, z: 0.215, cast: false }), k.box(0.012, 0.06, 0.012, 0, { m: m.dark, x: -0.1, y: 0.54, z: 0.222, cast: false }));
      for (const h of ch.hair || []) h.visible = false;
      const pat = k.my.capT || (k.my.capT = (() => { const t = tex(k, 128, 128, paintCapPattern).tex; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.5); return t; })());
      let capC;
      if (surgeon) capC = new THREE.Color(0x2f7fc4);
      else { const skinish = hsl.h > 0.02 && hsl.h < 0.13; capC = new THREE.Color().setHSL(skinish ? 0.045 : hsl.h, skinish ? 0.9 : Math.max(0.6, hsl.s), skinish ? 0.45 : 0.42); }
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.355, 28, 14, 0, TAU, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: capC, map: pat, roughness: 0.92 }));
      cap.rotation.x = -0.28; cap.position.y = 0.02; cap.scale.set(1.1, 1.14, 1.1); ch.wear(ch.head, cap);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 8, 32), new THREE.MeshStandardMaterial({ color: capC.clone().multiplyScalar(0.62), roughness: 0.9 }));
      band.rotation.x = Math.PI / 2 - 0.28; band.position.set(0, 0.05, -0.02); band.scale.set(1.08, 1.0, 1.02); ch.head.add(band);
    }
    if (researcher) { // safety goggles pushed up on the forehead
      const gg = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 24, Math.PI), mc(k, 0x2a3a4a)); gg.rotation.set(-0.1, 0, 0); gg.position.set(0, 0.16, 0.03); gg.scale.set(1.05, 0.5, 1.1); ch.head.add(gg);
      const lens = k.box(0.3, 0.09, 0.03, 0, { m: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, transparent: true, opacity: 0.6 }), y: 0.2, z: 0.3, cast: false }); lens.rotation.x = -0.5; ch.head.add(lens);
    }
    if (/product|lead|verif|protot|superadmin|director|jefe|diagn/i.test(role) && !manager) { // stethoscope round the neck
      const tubeM = mc(k, 0x22303a, { roughness: 0.35 });
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.016, 6, 24, Math.PI), tubeM); arc.rotation.x = -Math.PI / 2; arc.position.y = 0.7; arc.scale.set(1, 0.85, 1); ch.upper.add(arc);
      for (const s of [-1, 1]) ch.upper.add(k.rod(new THREE.Vector3(s * 0.2, 0.7, 0), new THREE.Vector3(s * 0.2, 0.6, 0.2), 0.014, tubeM), k.rod(new THREE.Vector3(s * 0.2, 0.6, 0.2), new THREE.Vector3(s * 0.12, 0.4, 0.24), 0.014, tubeM));
      const bell = k.cyl(0.04, 0.04, 0.025, 0, { m: m.chrome, x: 0.12, y: 0.38, z: 0.25 }); bell.rotation.x = Math.PI / 2; ch.upper.add(bell);
    }
    if (surgeon) { // a mask hanging at the neck and blue gloves
      // the surgical mask pulled down under the chin, its ties going back to the ears
      const mm = mc(k, 0x8fc1ee, { roughness: 0.95, side: THREE.DoubleSide });
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.33, 20, 8, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.66, Math.PI * 0.2), mm); ch.head.add(mask);
      for (const s of [-1, 1]) ch.head.add(k.rod(new THREE.Vector3(s * 0.26, -0.2, 0.12), new THREE.Vector3(s * 0.31, -0.02, 0.0), 0.007, m.white));
      const glove = mc(k, 0x5b8def, { roughness: 0.4 });
      for (const arm of [ch.armL, ch.armR]) if (arm.children[2]) arm.children[2].material = glove;
    }
    // ID badge on the chest
    const bt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.105, 0.008), [m.white, m.white, m.white, m.white, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, map: (k.my.idT || (k.my.idT = tex(k, 64, 96, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 96); c.fillStyle = '#14a39a'; c.fillRect(0, 0, 64, 22); c.fillStyle = '#cbd5db'; c.beginPath(); c.arc(32, 46, 13, 0, TAU); c.fill(); c.fillRect(10, 68, 44, 7); c.fillRect(14, 80, 36, 6); }).tex)) }), m.white]);
    bt.position.set(0.13, 0.47, 0.228); ch.upper.add(bt);
    // clogs (work boots for the technician, black shoes for the manager)
    const clog = mc(k, manager ? 0x15171a : tech ? 0x3a2a1e : coat ? 0xf3f5f6 : scrub.clone().lerp(new THREE.Color(0xffffff), 0.35), { roughness: manager ? 0.3 : 0.4 });
    for (const leg of [ch.legL, ch.legR]) { const s = leg.children[2]; if (s && s.children[0]) s.children[0].material = clog; }
  },

  // ------------------------------------------------------------ light: bright clinical day, calm blue-teal night
  daylight(k, f, gold) {
    const { scene, hemi, sun, mix: C } = k;
    // day: a warm key light and a cool sky fill; night: the general light falls low so the lamps make the pools
    scene.background = C(0x040d13, 0xdbeaee, f).lerp(new THREE.Color(0xf2c29a), gold * 0.35);
    if (scene.fog) scene.fog.color.copy(scene.background);
    hemi.intensity = 0.2 + f * 0.92;
    hemi.color = C(0x4f93a8, 0xf4fbff, f);
    hemi.groundColor = C(0x081820, 0x9fa890, f);
    sun.intensity = 0.1 + f * 2.15;
    sun.color = C(0x5f86c4, 0xffe6c4, f).lerp(new THREE.Color(0xffa766), gold * 0.5);
    sun.position.set(-9 - gold * 5, 16 - gold * 7, 11);
    scene.environmentIntensity = 0.04 + f * 0.32;
    if (k.my.patchMat) k.my.patchMat.opacity = 0.12 * Math.max(0, f * 1.4 - 0.4);
    if (k.my.bscBlue) k.my.bscBlue.color.setRGB(0.16, 0.5, 1.0).multiplyScalar(1.05 + (1 - f) * 0.35);
    for (const l of k.my.bscLight || []) l.intensity = 0.3 + (1 - f) * 1.8;
    if (k.my.boardMesh) k.my.boardMesh.material.color.setScalar(0.8 + 0.2 * f);
    if (k.my.windowMat) {
      const night = f < 0.45, want = night ? k.my.skyNight : k.my.skyDay;
      if (want && k.my.windowMat.map !== want) { k.my.windowMat.map = want; k.my.windowMat.needsUpdate = true; }
      k.my.windowMat.color = night ? new THREE.Color(0.9, 0.9, 0.95) : C(0xb8c4e0, 0xffffff, f);
    }
    for (const [l, night, day] of k.my.lamps || []) l.intensity = night + (day - night) * f;
    k.my.spotI = 30 - f * 8; if (k.my.spot) k.my.spot.intensity = k.my.spotI * (k.my.usoBusy ? 1 : 0.4);
    if (k.my.coneMat) k.my.coneMat.opacity = 0.012 + (1 - f) * 0.02;
    if (k.my.lineGlow) { k.my.lineGlow.opacity = Math.max(0, 0.9 - f * 1.2); k.my.lineHalo.opacity = Math.max(0, 0.22 - f * 0.3); }
    if (k.my.poolMat) k.my.poolMat.opacity = Math.max(0, 0.32 - f * 0.4);
    if (k.my.beamMat) k.my.beamMat.opacity = 0.03 + (1 - f) * 0.06;
    // the teal night lights (skirting, the centre station's lines) are bright at night and quiet by day
    if (k.my.skirt) k.my.skirt.color.setRGB(0.18, 0.88, 0.78).multiplyScalar(0.55 + (1 - f) * 0.75);
    if (k.my.centreGlow) k.my.centreGlow.color.setRGB(0.18, 0.88, 0.78).multiplyScalar(0.9 + (1 - f) * 0.9);
    if (k.my.traceMesh) k.my.traceMesh.material.color.setScalar(0.52 + 0.46 * f);
  },

  // ------------------------------------------------------------ layout and animation
  layout(k) {
    const my = k.my, fz = k.frontZ(), three = fz > 3;
    // a station's tall back piece (tower, gantry, pegboard, cabinet, shelves) only at the back row and the centre:
    // in a second row it would stand in front of the first row's nameplates
    for (const d of k.desks()) { const t = my.tall && my.tall[d.slug]; if (t) t.visible = d.centre ? fz < 0 : d.row <= 0; }
    // a third row of desks (big teams, no centre) reaches into the theatre and the cafeteria
    if (my.theatre) my.theatre.visible = !three;
    if (my.cafe) my.cafe.visible = !three;
    if (my.cart) my.cart.visible = !three;
    if (my.wardFill) my.wardFill.visible = !three;
    // the theatre's light box and blade sign stand over the front-left desk of a second row: only with one row
    for (const g of my.orSigns || []) g.visible = fz < 0;
    // forget animated parts of desks that left the room
    const inScene = (o) => { while (o) { if (o === k.scene) return true; o = o.parent; } return false; };
    if (my.spin) my.spin = my.spin.filter(([o]) => inScene(o));
    if (my.lamps) my.lamps = my.lamps.filter(([l]) => inScene(l)); // the centre desk's lamp goes with its desk
    if (my.tall) for (const s of Object.keys(my.tall)) if (!inScene(my.tall[s])) delete my.tall[s];
  },
  tick(k, dt, t) {
    const my = k.my;
    if (!my.vAt || t - my.vAt > 0.04) { // monitors: the sweeping traces, about 25 updates a second
      my.vAt = t;
      if (my.vitDraw) { my.vitDraw(t); my.vit.tex.needsUpdate = true; }
      if (my.defibDraw) { my.defibDraw(t); my.defib.tex.needsUpdate = true; }
      if (my.scopeDraw) { my.scopeDraw(t); my.scope.tex.needsUpdate = true; }
    }
    if (my.vit && (!my.nAt || t - my.nAt > 3)) { my.nAt = t; const hr = 70 + Math.round(Math.sin(t * 0.37) * 3 + Math.sin(t * 1.3)); paintVitalsNumbers(my.vit.ctx, hr, 98 + (Math.sin(t * 0.21) > 0.6 ? 1 : 0), 34 + Math.round(Math.sin(t * 0.5) * 2)); }
    if (my.bellows) my.bellows.scale.y = 0.2 + 0.12 * (0.5 + 0.5 * Math.sin((t / 3.75) * TAU));
    if (my.drop) { const p = (t * 1.1) % 1; my.drop.position.y = 1.81 - p * 0.05; my.drop.visible = p < 0.85; }
    if (my.pumpLed) my.pumpLed.visible = (t % 1.6) < 0.25;
    if (my.beacon) { const s = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6)); my.beacon.material.color.setRGB(2 * s, 1.3 * s, 0.1); }
    if (my.spin) for (const [o, v] of my.spin) o.rotation.y += dt * v;
    if (my.steam) for (const p of my.steam) { // steam off the espresso machine's wand
      const ph = (t * 0.32 + p.userData.ph) % 1, b = p.userData.base;
      p.position.set(b.x + Math.sin(t * 1.3 + p.userData.ph * 9) * 0.03 * ph, b.y + ph * 0.5, b.z + ph * 0.05);
      p.scale.setScalar(0.06 + ph * 0.22);
    }
    if (my.mugSteam) for (const p of my.mugSteam) { // steam off a mug in someone's hand (only while it shows)
      if (!p.parent.visible) continue;
      const ph = (t * 0.45 + p.userData.ph) % 1;
      p.position.set(Math.sin(t * 1.7 + p.userData.ph * 9) * 0.03 * ph, 0.1 + ph * 0.32, 0);
      p.scale.setScalar(0.05 + ph * 0.13); p.material.opacity = 0.55 * (1 - ph);
    }
    if (my.callLed) my.callLed.color.setRGB(...((t % 1.2) < 0.6 ? [2.2, 1.3, 0.1] : [0.25, 0.15, 0.02]));
    // once a second: "QUIRÓFANO EN USO" lights while anyone works, the OR panel, the ward screen
    if (!my.sAt || t - my.sAt > 1) {
      my.sAt = t; my.sN = (my.sN || 0) + 1;
      // the theatre is in use while the surgeon (Development) works; on a floor without one, while anyone works
      let busy = false, anyS = false, anyW = false;
      for (const d of k.desks()) {
        const a = d.agent; if (!a) continue;
        const sur = /^\s*(develop|ciruj|engineer)/i.test(String(a.role || '')), w = a.online && a.status === 'working';
        if (sur) { anyS = true; if (w) busy = true; }
        if (w) anyW = true;
      }
      if (!anyS) busy = anyW;
      if (my.surgery) my.surgery.visible = busy;
      if (my.spot) my.spot.intensity = (my.spotI || 22) * (busy ? 1 : 0.4);
      if (my.usoMat && my.usoBusy !== busy) {
        my.usoBusy = busy; my.usoMat.map = my.usoTex[busy ? 1 : 0]; my.usoMat.color.setScalar(busy ? 2.1 : 1); my.usoMat.needsUpdate = true;
        if (my.usoLight) my.usoLight.intensity = busy ? 2.5 : 0;
      }
      if (my.panel) {
        const c = my.panel.ctx, now = new Date(), hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
        if (busy && !my.busySince) my.busySince = Date.now(); if (!busy) my.busySince = 0;
        const el = my.busySince ? Math.floor((Date.now() - my.busySince) / 1000) : 0;
        const chrono = `${String(Math.floor(el / 3600)).padStart(2, '0')}:${String(Math.floor(el / 60) % 60).padStart(2, '0')}:${String(el % 60).padStart(2, '0')}`;
        c.fillStyle = '#05121a'; c.fillRect(0, 0, 512, 160);
        const cell = (x, lab, val, col, unit) => { txt(c, lab, x, 30, '600 17px system-ui', '#7fa6b8'); txt(c, val, x, 82, '800 42px system-ui', col); if (unit) txt(c, unit, x + c.measureText(val).width + 4, 90, '700 20px system-ui', col); };
        cell(14, 'TEMP.', '21,0°', '#3fe0ff'); cell(132, 'HUMEDAD', '48%', '#3fe0ff'); cell(242, 'PRESIÓN', '+15', '#39ff88', 'Pa'); cell(384, 'HORA', `${hh}:${mm}`, '#f2f5f7');
        c.fillStyle = '#0c2430'; c.fillRect(0, 112, 512, 48);
        txt(c, busy ? '● CIRUGÍA EN CURSO' : '○ QUIRÓFANO LIBRE', 16, 136, '700 22px system-ui', busy ? '#ff5d6c' : '#7fa6b8');
        txt(c, chrono, 496, 136, '800 30px Menlo, monospace', busy ? '#ffd23f' : '#5d7684', 'right');
        my.panel.tex.needsUpdate = true;
      }
      if (my.ward && my.sN % 2 === 0) { paintWard(my.ward.ctx, busy, my.sN / 2); my.ward.tex.needsUpdate = true; }
    }
    // the pharmacy robot goes back and forth along the blue floor line
    const r = my.robot, rs = my.rs, P = my.path;
    if (r && rs && P) {
      rs.d += rs.dir * dt * 0.65;
      if (rs.d > rs.len) { rs.d = rs.len; rs.dir = -1; } else if (rs.d < 0) { rs.d = 0; rs.dir = 1; }
      let d = rs.d;
      for (let i = 0; i < P.length - 1; i++) {
        const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az);
        if (d <= L || i === P.length - 2) {
          const u = Math.min(1, d / L); r.position.set(ax + (bx - ax) * u, 0, az + (bz - az) * u);
          const want = Math.atan2((bx - ax) * rs.dir, (bz - az) * rs.dir);
          let dy = want - r.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          r.rotation.y += dy * Math.min(1, dt * 3);
          break;
        }
        d -= L;
      }
    }
  },
};
