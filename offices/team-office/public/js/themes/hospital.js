// Hospital: a bright, modern surgical floor ("Quirófano 1"). Everything is built here from three.js primitives and
// canvas-painted textures (no downloaded assets). The contract is in themes/index.js.
//
// What it builds:
//   shell    glossy speckled vinyl floor with welded seams and wayfinding lines, white walls with a pale-teal
//            wainscot, a teal stripe and a bumper rail, a bedhead gas trunking along the back wall, clerestory
//            windows with half-lowered blinds, a lit cornice along the top of the walls.
//   decor    the operating island (sterile-zone floor decal, operating table with drapes, two-head surgical lamp
//            with light cones and a spot, anaesthesia machine with a live vital-signs monitor and breathing
//            bellows, electrosurgical unit, Mayo table, instrument back table, IV pole with infusion pump and
//            drip, kick bucket, step stool); a recovery bay (articulated bed, privacy curtains on a rail, bedside
//            monitor, bedhead unit, bedside cabinet, over-bed table); the corridor door with "QUIRÓFANO EN USO"
//            (lit while anyone works); scrub sink and X-ray light box; OR control panel with a running clock;
//            medicine cabinet with glass doors; crash cart with defibrillator; linen cart; nurses' station
//            (the break spot) with coffee machine, patient board and binders; wheelchair; waiting bench; water
//            cooler; waste bins; hand-sanitiser totem; signage in Spanish; a pharmacy delivery robot that follows
//            the floor line.
//   people   scrubs in the role colour with a surgical cap (hair tucked in), white coat for the medical director,
//            the manager, the head of service and the clinical researcher; stethoscopes, a hanging mask and blue
//            gloves for surgeons, ID badges, clogs; visitors get a "VISITA" badge and shoe covers.
//   desks    white medical workstation, folders and clipboard, sanitiser and gloves, a white exam lamp, and a
//            prop per role (microscope, test tubes, instruments, skull, toolbox, case files, pager...).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
const ISLAND = { x: -1, z: 3.2 };

// ---------------------------------------------------------------- small helpers
function tex(k, w, h, draw) { const s = k.surface(w, h); draw(s.ctx, w, h); s.tex.needsUpdate = true; return s; }
function plane(w, h, material) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); }
function at(m, x, y, z, ry = 0) { m.position.set(x, y, z); if (ry) m.rotation.y = ry; return m; }
function noCast(...ms) { for (const m of ms) m.castShadow = false; return ms[0]; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function txt(c, s, x, y, font, color, align = 'left', base = 'middle') { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y); }
function crossIcon(c, x, y, s, color) { c.fillStyle = color; c.fillRect(x - s / 6, y - s / 2, s / 3, s); c.fillRect(x - s / 2, y - s / 6, s, s / 3); }

// shared materials, made once per page
function M(k) {
  if (k.my.M) return k.my.M;
  const { mat } = k;
  const m = k.my.M = {
    white: mat(0xf3f6f7, { roughness: 0.38 }),
    offwhite: mat(0xe3e9ec, { roughness: 0.45 }),
    grey: mat(0xa3adb6, { roughness: 0.5 }),
    dark: mat(0x27303a, { roughness: 0.45 }),
    black: mat(0x12161c, { roughness: 0.35 }),
    steel: mat(0xc6cdd4, { roughness: 0.28, metalness: 0.85 }),
    chrome: mat(0xe8ecf0, { roughness: 0.12, metalness: 1 }),
    teal: mat(0x14a39a, { roughness: 0.4 }),
    tealSoft: mat(0xbfe3dd, { roughness: 0.5 }),
    navyPad: mat(0x1d2b45, { roughness: 0.55 }),
    drapeGreen: mat(0x3b9c8c, { roughness: 0.95 }),
    drapeBlue: mat(0x3d7fb8, { roughness: 0.95 }),
    red: mat(0xd62839, { roughness: 0.4 }),
    yellow: mat(0xf5c518, { roughness: 0.45 }),
    rubber: mat(0x1b1f24, { roughness: 0.9 }),
    sheet: mat(0xf7f9fa, { roughness: 0.9 }),
    blanket: mat(0x8fb8de, { roughness: 0.95 }),
    wood: mat(0xc9a77c, { roughness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xd9eef5, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    clear: new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }),
    fluid: new THREE.MeshStandardMaterial({ color: 0xcfe9ff, roughness: 0.1, transparent: true, opacity: 0.75 }),
    glowWhite: k.glow(0xf4fbff, 1.7),
    glowWarm: k.glow(0xfff1d8, 2.2),
    glowGreen: k.glow(0x22c55e, 1.8),
    glowRed: k.glow(0xff2a3d, 1.9),
    glowAmber: k.glow(0xffb020, 2.0),
    glowCyan: k.glow(0x38e1ff, 1.8),
  };
  return m;
}

// A boxed group: B(group, w, h, d, material, x, y, z, { r, cast, ry })
function B(k, parent, w, h, d, m, x, y, z, o = {}) {
  const b = k.box(w, h, d, 0, { m, x, y, z, r: o.r || 0, cast: o.cast !== undefined ? o.cast : (w * h * d > 0.02) });
  if (o.ry) b.rotation.y = o.ry; if (o.rx) b.rotation.x = o.rx; if (o.rz) b.rotation.z = o.rz;
  parent.add(b); return b;
}
function Cy(k, parent, rt, rb, h, m, x, y, z, o = {}) {
  const c = k.cyl(rt, rb, h, 0, { m, x, y, z, seg: o.seg || 20 });
  c.castShadow = o.cast !== undefined ? o.cast : (rb * h > 0.03);
  if (o.rx) c.rotation.x = o.rx; if (o.rz) c.rotation.z = o.rz; if (o.ry) c.rotation.y = o.ry;
  parent.add(c); return c;
}
function caster(k, parent, x, z, m) { // a swivel wheel
  const M_ = M(k);
  Cy(k, parent, 0.012, 0.012, 0.06, M_.steel, x, 0.1, z, { cast: false });
  const w = Cy(k, parent, 0.045, 0.045, 0.03, m || M_.rubber, x, 0.05, z, { rx: Math.PI / 2, cast: false, seg: 12 });
  w.rotation.z = Math.PI / 2;
}
function rodM(k, parent, a, b, r, m) { const x = k.rod(new THREE.Vector3(...a), new THREE.Vector3(...b), r, m); x.castShadow = r > 0.02; parent.add(x); return x; }
function signMesh(k, w, h, s, { lit = 0, rough = 0.45 } = {}) {
  const m = lit ? new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false, color: new THREE.Color(lit, lit, lit) })
    : new THREE.MeshStandardMaterial({ map: s.tex, roughness: rough });
  const p = plane(w, h, m); return p;
}

// A scrolling physiological trace like on a bedside monitor: the line is drawn left to right and a gap runs
// ahead of it, erasing the old sweep. bands: [{ y0, y1, fn(t), color }]. Only the new columns are drawn.
function sweeper(ctx, x0, x1, bands, speed) {
  const st = { x: x0, t: -1, last: bands.map(() => null) };
  return (t) => {
    if (st.t < 0) { st.t = t; return; }
    let n = Math.min(160, Math.floor((t - st.t) * speed / 2));
    if (n <= 0) return;
    for (let i = 0; i < n; i++) {
      st.t += 2 / speed; st.x += 2;
      if (st.x >= x1) { st.x = x0; st.last = bands.map(() => null); }
      bands.forEach((b, j) => {
        ctx.fillStyle = '#02070b'; ctx.fillRect(st.x, b.y0, 14, b.y1 - b.y0);
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
function paintEcgFrame(c, w, h, title) {
  c.fillStyle = '#02070b'; c.fillRect(0, 0, w, h);
  txt(c, title, 6, 11, '600 12px system-ui', '#8fb6c9');
}

function paintLed(c) {
  c.fillStyle = '#2d333b'; c.fillRect(0, 0, 256, 256);
  const g0 = c.createRadialGradient(128, 128, 20, 128, 128, 128); g0.addColorStop(0, 'rgba(255,255,255,.18)'); g0.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g0; c.fillRect(0, 0, 256, 256);
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
  c.fillStyle = '#93b2aa'; c.fillRect(0, 0, 1024, 1024); // mid-value sea-green vinyl, so white things stand out
  const tones = ['rgba(60,95,92,.35)', 'rgba(235,245,242,.55)', 'rgba(30,70,72,.22)', 'rgba(150,180,176,.45)', 'rgba(20,120,112,.18)', 'rgba(250,250,245,.35)'];
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 34000; i++) { c.fillStyle = tones[i % tones.length]; const r = 0.9 + rnd() * 2.2; c.fillRect(rnd() * 1024, rnd() * 1024, r, r); }
  for (let i = 0; i < 70; i++) { // soft mottling
    const x = rnd() * 1024, y = rnd() * 1024, r = 40 + rnd() * 120, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rnd() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(40,80,80,.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.strokeStyle = 'rgba(40,75,78,.35)'; c.lineWidth = 2; // welded seams between the sheets
  for (const x of [0, 512]) { c.beginPath(); c.moveTo(x + 1, 0); c.lineTo(x + 1, 1024); c.stroke(); }
}

function paintOrZone(c, W, H) {
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(160,215,208,.55)'; rr(c, 30, 30, W - 60, H - 60, 30); c.fill();
  c.strokeStyle = '#d62839'; c.lineWidth = 22; rr(c, 30, 30, W - 60, H - 60, 30); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 5; c.setLineDash([26, 18]); rr(c, 62, 62, W - 124, H - 124, 20); c.stroke(); c.setLineDash([]);
  // the text keeps clear of the lamp stand, which stands in the front-left corner (canvas x < 220)
  const t = 'ZONA ESTÉRIL · NO PASAR SIN MASCARILLA', x0 = 250, x1 = W - 70;
  let fs = 44; c.font = `800 ${fs}px system-ui`; while (fs > 24 && c.measureText(t).width > x1 - x0) { fs -= 1; c.font = `800 ${fs}px system-ui`; }
  txt(c, t, (x0 + x1) / 2, H - 92, `800 ${fs}px system-ui`, 'rgba(150,20,35,.88)', 'center');
}

function paintXray(c) {
  c.fillStyle = '#eef6ff'; c.fillRect(0, 0, 512, 352);
  const film = (x0, draw, label) => {
    c.fillStyle = '#04070c'; c.fillRect(x0, 16, 232, 320);
    c.save(); c.beginPath(); c.rect(x0, 16, 232, 320); c.clip(); draw(x0); c.restore();
    txt(c, label, x0 + 10, 30, '600 13px system-ui', 'rgba(255,255,255,.75)');
    txt(c, 'R', x0 + 212, 48, '800 22px system-ui', 'rgba(255,255,255,.85)', 'center');
  };
  film(16, (x0) => { // chest PA
    const cx = x0 + 116;
    const lung = (sx) => { const g = c.createRadialGradient(cx + sx * 52, 170, 10, cx + sx * 52, 170, 90); g.addColorStop(0, 'rgba(40,52,70,.9)'); g.addColorStop(1, 'rgba(120,130,150,.25)'); c.fillStyle = g; c.beginPath(); c.ellipse(cx + sx * 52, 175, 46, 100, sx * -0.08, 0, TAU); c.fill(); };
    c.fillStyle = 'rgba(150,160,175,.35)'; c.beginPath(); c.ellipse(cx, 180, 112, 150, 0, 0, TAU); c.fill();
    lung(-1); lung(1);
    c.fillStyle = 'rgba(220,228,236,.55)'; c.beginPath(); c.ellipse(cx + 18, 225, 44, 54, 0.3, 0, TAU); c.fill(); // heart
    c.fillStyle = 'rgba(235,240,245,.8)'; c.fillRect(cx - 7, 40, 14, 300); // spine
    c.strokeStyle = 'rgba(235,240,248,.7)'; c.lineWidth = 6;
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx + sx * 8, 70); c.quadraticCurveTo(cx + sx * 60, 54, cx + sx * 104, 66); c.stroke(); } // clavicles
    c.lineWidth = 4;
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) { const y = 84 + i * 24; c.beginPath(); c.moveTo(cx + sx * 9, y); c.bezierCurveTo(cx + sx * 70, y - 26, cx + sx * 104, y + 4, cx + sx * 96, y + 34); c.stroke(); }
  }, 'TÓRAX PA');
  film(264, (x0) => { // knee lateral
    const cx = x0 + 116;
    c.fillStyle = 'rgba(140,150,165,.35)'; c.beginPath(); c.ellipse(cx, 180, 70, 170, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(232,238,246,.85)';
    c.beginPath(); c.moveTo(cx - 26, 20); c.lineTo(cx + 22, 20); c.lineTo(cx + 34, 150); c.quadraticCurveTo(cx, 186, cx - 38, 150); c.closePath(); c.fill(); // femur
    c.beginPath(); c.moveTo(cx - 34, 196); c.quadraticCurveTo(cx, 180, cx + 32, 196); c.lineTo(cx + 22, 340); c.lineTo(cx - 22, 340); c.closePath(); c.fill(); // tibia
    c.beginPath(); c.ellipse(cx + 52, 160, 14, 26, 0.2, 0, TAU); c.fill(); // patella
    c.fillStyle = 'rgba(120,200,255,.9)'; c.fillRect(cx - 4, 120, 8, 120); // a screw
    for (let i = 0; i < 8; i++) c.fillRect(cx - 9, 126 + i * 14, 18, 3);
  }, 'RODILLA LAT');
}

function paintCurtain(c) {
  c.fillStyle = '#e8f3f1'; c.fillRect(0, 0, 256, 256);
  c.fillStyle = 'rgba(20,163,154,.28)';
  for (let i = 0; i < 8; i++) { c.fillRect(i * 32, 0, 10, 256); c.fillRect(0, i * 32, 256, 10); }
  c.fillStyle = 'rgba(61,127,184,.35)';
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if ((x + y) % 2 === 0) { c.save(); c.translate(x * 32 + 21, y * 32 + 21); c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.restore(); }
}

function paintCapPattern(c) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(255,255,255,1)';
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const cx = x * 32 + (y % 2) * 16 + 8, cy = y * 32 + 12;
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(cx - 2, cy - 7, 4, 14); c.fillRect(cx - 7, cy - 2, 14, 4);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(cx + 14, cy + 14, 3, 0, TAU); c.fill();
  }
}

// ---------------------------------------------------------------- the theme
export default {
  id: 'hospital',
  name: 'Hospital',
  roles: {
    Product: 'Director médico', Development: 'Cirujano', Verification: 'Médico de diagnóstico',
    Infrastructure: 'Técnico de equipos médicos', Lead: 'Jefe de servicio', Research: 'Investigador clínico',
    Prototyping: 'Médico residente', Review: 'Comité clínico', Superadmin: 'Gerente del hospital',
  },
  texts: {
    room: 'Quirófano 1', board: 'Tablón de guardia', trace: 'Historia clínica', composer: 'Indicación para @{name}, o @all para todo el equipo',
    boardSub: 'tarjetas abiertas por quién debe moverlas', noCards: 'Sin tarjetas',
    traceHint: ['Este equipo aún no tiene matriz.', 'Pulsa el tablero para ver la de otro equipo.'],
    status: { working: 'en quirófano', idle: 'de guardia', blocked: 'te necesita', offline: 'fuera de turno', now: 'ahora' },
  },
  exposure: 0.9,
  bloom: { strength: 0.5, radius: 0.55, threshold: 1 },
  // the director médico (Product, else Lead) works at a desk in the middle of the ward (themes/index.js: centre)
  centre: { roles: ['Product', 'Lead'] },
  boardStyle: { bg: '#0d1c22', ink: '#5eead4' },
  traceStyle: { bg: '#fbfdfc', ink: '#0f2f2b' },

  // ------------------------------------------------------------ shell
  shell(k) {
    const { room, surface, mat, C: { BACK_Z, LEFT_X, WALL_H } } = k;
    const m = M(k);
    // floor: glossy speckled vinyl
    const f = tex(k, 1024, 1024, paintFloor);
    f.tex.wrapS = f.tex.wrapT = THREE.RepeatWrapping; f.tex.repeat.set(5, 3.5);
    const floorMat = new THREE.MeshPhysicalMaterial({ map: f.tex, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.22 });
    const floor = k.my.floor = plane(26, 18, floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    room.add(floor, k.box(26.6, 0.6, 18.6, 0x1b2430, { y: -0.31, cast: false }));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), mat(0x111821, { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62; room.add(ground);
    // a darker vinyl border inlaid along the walls, with a thin accent line
    {
      const bm = mat(0x4f7f7c, { roughness: 0.35 }), am = m.teal;
      const strip = (w, d, x, z, mm, y) => { const s = plane(w, d, mm); s.rotation.x = -Math.PI / 2; s.position.set(x, y, z); s.receiveShadow = true; room.add(s); };
      strip(26, 0.7, 0, BACK_Z + 0.35, bm, 0.003); strip(0.7, 17.3, LEFT_X + 0.35, 0.35, bm, 0.003);
      strip(25.3, 0.06, 0.35, BACK_Z + 0.78, am, 0.004); strip(0.06, 17.2, LEFT_X + 0.78, 0.4, am, 0.004);
    }
    // floor edge: a teal nosing all round the open sides
    room.add(k.box(26.6, 0.06, 0.08, 0, { m: m.teal, y: -0.02, z: 9.3, cast: false }), k.box(0.08, 0.06, 18.6, 0, { m: m.teal, x: 13.3, y: -0.02, cast: false }));

    // walls
    const wall = k.my.wallMat = mat(0xe3edeb, { roughness: 0.75 });
    room.add(k.box(26.6, WALL_H, 0.3, 0, { m: wall, y: WALL_H / 2, z: BACK_Z - 0.15 }));
    room.add(k.box(0.3, WALL_H, 18.3, 0, { m: wall, x: LEFT_X - 0.15, y: WALL_H / 2, z: 0.15 }));
    // pale-teal wainscot panels with joints, a coloured stripe, a bumper rail and a coved skirting
    const wsc = tex(k, 512, 128, (c) => {
      c.fillStyle = '#6f9995'; c.fillRect(0, 0, 512, 128); // deep teal-grey wainscot panels
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, 0, 512, 34);
      c.fillStyle = 'rgba(20,50,50,.45)'; c.fillRect(0, 0, 3, 128); c.fillRect(255, 0, 3, 128);
    });
    wsc.tex.wrapS = THREE.RepeatWrapping;
    const wscBack = wsc.tex, wscLeft = wsc.tex.clone(); wscBack.repeat.set(10.4, 1); wscLeft.repeat.set(7.2, 1); wscLeft.needsUpdate = true;
    const wb = plane(26, 1.15, new THREE.MeshStandardMaterial({ map: wscBack, roughness: 0.4 })); at(wb, 0, 0.575, BACK_Z + 0.012);
    const wl = plane(18, 1.15, new THREE.MeshStandardMaterial({ map: wscLeft, roughness: 0.4 })); wl.rotation.y = Math.PI / 2; at(wl, LEFT_X + 0.012, 0.575, 0);
    room.add(wb, wl);
    const rail = mat(0xf2f5f6, { roughness: 0.35 }), cove = mat(0x3f5f62, { roughness: 0.5 });
    room.add(
      k.box(26, 0.12, 0.05, 0, { m: m.teal, y: 1.21, z: BACK_Z + 0.025, cast: false }), k.box(0.05, 0.12, 18, 0, { m: m.teal, x: LEFT_X + 0.025, y: 1.21, cast: false }),
      k.box(26, 0.13, 0.07, 0, { m: rail, y: 0.92, z: BACK_Z + 0.05, r: 0.03, cast: false }), k.box(0.07, 0.13, 18, 0, { m: rail, x: LEFT_X + 0.05, y: 0.92, r: 0.03, cast: false }),
      k.box(26, 0.12, 0.05, 0, { m: cove, y: 0.06, z: BACK_Z + 0.03, cast: false }), k.box(0.05, 0.12, 18, 0, { m: cove, x: LEFT_X + 0.03, y: 0.06, cast: false }));
    // bedhead gas trunking along the back wall: O2, air, vacuum, sockets, every 2.6 m
    const trunk = tex(k, 512, 48, (c) => {
      c.fillStyle = '#eef3f5'; c.fillRect(0, 0, 512, 48);
      c.fillStyle = '#14a39a'; c.fillRect(0, 40, 512, 8);
      // gas outlets, colour-coded instead of tiny labels: O2 white/green, air black/white, vacuum yellow
      const out = (x, ring, inner, edge) => { c.fillStyle = edge; c.beginPath(); c.arc(x, 20, 17, 0, TAU); c.fill(); c.fillStyle = ring; c.beginPath(); c.arc(x, 20, 14, 0, TAU); c.fill(); c.fillStyle = inner; c.beginPath(); c.arc(x, 20, 8, 0, TAU); c.fill(); c.fillStyle = '#20262d'; c.beginPath(); c.arc(x, 20, 3.5, 0, TAU); c.fill(); };
      out(146, '#ffffff', '#2f9e62', '#2f9e62'); out(190, '#1d232a', '#ffffff', '#1d232a'); out(234, '#f5c518', '#f5c518', '#8a6d00');
      for (const [x, col] of [[280, '#f7f9fa'], [320, '#e23a46']]) { c.fillStyle = col; rr(c, x - 15, 6, 30, 26, 4); c.fill(); c.fillStyle = '#20262d'; c.beginPath(); c.arc(x - 5, 19, 2.5, 0, TAU); c.arc(x + 5, 19, 2.5, 0, TAU); c.fill(); }
    });
    trunk.tex.wrapS = THREE.RepeatWrapping; trunk.tex.repeat.set(10, 1);
    room.add(k.box(25.8, 0.24, 0.07, 0, { y: 1.62, z: BACK_Z + 0.04, cast: false, m: [mat(0xe9eef0), mat(0xe9eef0), mat(0xe9eef0), mat(0xe9eef0), new THREE.MeshStandardMaterial({ map: trunk.tex, roughness: 0.4 }), mat(0xe9eef0)] }));
    // a heartbeat line painted along the back wall, above the trunking
    {
      const hb = tex(k, 2048, 96, (c) => {
        c.clearRect(0, 0, 2048, 96); c.strokeStyle = 'rgba(20,163,154,.75)'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); c.moveTo(0, 60);
        for (let x = 0; x < 2048; x += 4) { const p = (x % 340) / 340; c.lineTo(x, 60 - 46 * gauss(p, 0.5, 0.012) + 18 * gauss(p, 0.53, 0.01) - 9 * gauss(p, 0.4, 0.03) - 12 * gauss(p, 0.7, 0.05)); }
        c.stroke();
        for (let i = 0; i < 6; i++) { const x = 170 + i * 340 + 20; c.fillStyle = 'rgba(20,163,154,.55)'; c.beginPath(); c.arc(x + 70, 60, 4, 0, TAU); c.fill(); }
      });
      const p = plane(26, 1.22, new THREE.MeshStandardMaterial({ map: hb.tex, transparent: true, roughness: 0.6, depthWrite: false })); at(p, 0, 2.15, BACK_Z + 0.012); room.add(p);
    }
    // clerestory windows: white frames, half-lowered blinds
    const windowMat = k.my.windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const sky = tex(k, 256, 128, (c) => {
      const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#8fc7ff'); gr.addColorStop(1, '#e6f4ff'); c.fillStyle = gr; c.fillRect(0, 0, 256, 128);
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (const [x, y, r] of [[46, 62, 15], [66, 56, 21], [92, 64, 14], [176, 90, 13], [196, 83, 19], [220, 92, 12]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(120,150,170,.55)'; c.fillRect(0, 110, 256, 18); for (let i = 0; i < 14; i++) c.fillRect(i * 19, 96 - (i * 7) % 16, 12, 30); // skyline
    });
    windowMat.map = k.my.skyDay = sky.tex;
    k.my.skyNight = tex(k, 256, 128, (c) => { // night: a dark sky over the lit city
      const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#050a18'); gr.addColorStop(1, '#16213e'); c.fillStyle = gr; c.fillRect(0, 0, 256, 128);
      c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 26; i++) c.fillRect((i * 97) % 256, (i * 41) % 70, 1.5, 1.5);
      c.fillStyle = '#0a0f1c'; c.fillRect(0, 110, 256, 18); for (let i = 0; i < 14; i++) c.fillRect(i * 19, 96 - (i * 7) % 16, 12, 30);
      c.fillStyle = 'rgba(255,205,120,.9)'; for (let i = 0; i < 40; i++) { const x = (i * 53) % 256, b = Math.floor(x / 19); if (x % 19 < 11) c.fillRect(x, 100 - (b * 7) % 16 + (i % 4) * 5, 2, 2); }
    }).tex;
    const blinds = tex(k, 64, 128, (c) => { c.clearRect(0, 0, 64, 128); for (let y = 0; y < 128; y += 8) { c.fillStyle = 'rgba(245,247,248,.97)'; c.fillRect(0, y, 64, 6); c.fillStyle = 'rgba(180,190,196,.9)'; c.fillRect(0, y + 5, 64, 1); } });
    blinds.tex.wrapS = THREE.RepeatWrapping; blinds.tex.repeat.set(8, 1);
    const blindMat = new THREE.MeshStandardMaterial({ map: blinds.tex, transparent: true, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const x = -10.4 + i * 5.2, drop = [0.45, 0.62, 0.38, 0.55, 0.48][i];
      room.add(k.box(4.4, 1.25, 0.1, 0, { m: m.white, x, y: 6.25, z: BACK_Z + 0.03, cast: false }));
      const pane = plane(4.15, 1.0, windowMat); at(pane, x, 6.25, BACK_Z + 0.09);
      const bl = plane(4.1, drop, blindMat); at(bl, x, 6.75 - drop / 2, BACK_Z + 0.13);
      room.add(pane, bl, k.box(0.06, 1.0, 0.04, 0, { m: m.white, x, y: 6.25, z: BACK_Z + 0.11, cast: false }), k.box(4.2, 0.07, 0.06, 0, { m: m.offwhite, x, y: 6.78, z: BACK_Z + 0.15, cast: false }));
    }
    // lit cornice along the top of both walls
    room.add(k.box(26.6, 0.32, 0.55, 0, { m: m.white, y: 7.05, z: BACK_Z + 0.27, cast: false }), k.box(0.55, 0.32, 18.3, 0, { m: m.white, x: LEFT_X + 0.27, y: 7.05, z: 0.15, cast: false }));
    room.add(k.box(25.9, 0.05, 0.05, 0, { m: m.glowWhite, y: 6.88, z: BACK_Z + 0.52, cast: false }), k.box(0.05, 0.05, 17.9, 0, { m: m.glowWhite, x: LEFT_X + 0.52, y: 6.88, z: 0.15, cast: false }));

    // wayfinding lines on the floor (the pharmacy robot follows the blue one)
    const line = (pts, color, w = 0.12) => {
      const lm = mat(color, { roughness: 0.3 });
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az) + w;
        const s = plane(len, w, lm); s.rotation.x = -Math.PI / 2; s.rotation.z = -Math.atan2(bz - az, bx - ax);
        s.position.set((ax + bx) / 2, 0.004, (az + bz) / 2); s.receiveShadow = true; room.add(s);
      }
    };
    k.my.path = [[9.6, 8.45], [-8.6, 8.45], [-8.6, 2.2], [-12.6, 2.2]];
    line(k.my.path, 0x2b6cb0); line([[1.4, 9.2], [1.4, 5.9]], 0x16a34a);
    const lab = (s, color, x, z, ry) => {
      const t = tex(k, 256, 64, (c) => { c.clearRect(0, 0, 256, 64); txt(c, s, 128, 34, '800 34px system-ui', color, 'center'); });
      const p = plane(1.6, 0.4, new THREE.MeshStandardMaterial({ map: t.tex, transparent: true, roughness: 0.3, depthWrite: false }));
      p.rotation.x = -Math.PI / 2; p.rotation.z = ry || 0; p.position.set(x, 0.006, z); room.add(p); return p;
    };
    // the blue label sits inside the robot's line, so the robot drives beside it, not over it
    lab('← UCI · QUIRÓFANOS', '#2b6cb0', 4.6, 7.85); k.my.greenLab = lab('QUIRÓFANO 1 ↑', '#16a34a', 1.85, 7.6, Math.PI / 2);
  },

  // ------------------------------------------------------------ decor
  decor(k) {
    const { room, mat, C: { BACK_Z, LEFT_X } } = k;
    const m = M(k);
    k.my.lamps = [];
    const g = (x, z, ry = 0) => { const o = new THREE.Group(); o.position.set(x, 0, z); o.rotation.y = ry; return o; };

    // ===== the operating island (moves forward when the team needs more rows of desks)
    const isl = k.my.island = g(ISLAND.x, ISLAND.z); isl.scale.setScalar(1.15);
    room.add(isl);
    {
      const zt = tex(k, 1024, 640, paintOrZone);
      const decal = plane(7.6, 4.75, new THREE.MeshStandardMaterial({ map: zt.tex, transparent: true, roughness: 0.25, depthWrite: false }));
      decal.rotation.x = -Math.PI / 2; decal.position.set(0.45, 0.008, -0.15); decal.receiveShadow = true; isl.add(decal);
    }
    // operating table, long axis along x, head at -x
    {
      const t = new THREE.Group(); isl.add(t);
      B(k, t, 0.95, 0.08, 0.58, m.dark, 0, 0.05, 0, { r: 0.03 });
      for (const [x, z] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) Cy(k, t, 0.04, 0.05, 0.03, m.rubber, x, 0.015, z, { cast: false });
      B(k, t, 0.36, 0.62, 0.28, m.white, 0, 0.4, 0, { r: 0.05 });
      B(k, t, 0.28, 0.2, 0.2, m.chrome, 0, 0.78, 0);
      B(k, t, 2.05, 0.06, 0.56, m.steel, 0.05, 0.9, 0);
      for (const z of [-0.3, 0.3]) B(k, t, 1.9, 0.035, 0.025, m.chrome, 0.05, 0.89, z, { cast: false });
      const pads = [[-0.95, 0.3, 0.3], [-0.49, 0.58, 0.54], [0.1, 0.56, 0.54], [0.72, 0.64, 0.54]];
      for (const [x, l, w] of pads) B(k, t, l, 0.085, w, m.navyPad, x, 0.97, 0, { r: 0.035 });
      // the gel head ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 10, 24), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.2, transparent: true, opacity: 0.85 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(-0.98, 1.04, 0); t.add(ring);
      // arm boards
      for (const s of [-1, 1]) { B(k, t, 0.16, 0.05, 0.55, m.navyPad, -0.45, 0.97, s * 0.52, { r: 0.02, ry: s * 0.25 }); B(k, t, 0.06, 0.12, 0.06, m.steel, -0.45, 0.9, s * 0.3); }
      // sterile drape over the lower half, hanging off the sides, and a folded one by the head
      B(k, t, 1.3, 0.015, 0.74, m.drapeGreen, 0.43, 1.02, 0, { cast: true });
      for (const s of [-1, 1]) B(k, t, 1.3, 0.34, 0.012, m.drapeGreen, 0.43, 0.86, s * 0.37, { cast: false });
      B(k, t, 0.012, 0.3, 0.74, m.drapeGreen, 1.08, 0.88, 0, { cast: false });
      B(k, t, 0.36, 0.05, 0.28, m.drapeBlue, -0.45, 1.04, 0.05, { r: 0.02 });
      B(k, t, 0.07, 0.02, 0.62, m.dark, 0.7, 1.035, 0, { cast: false }); // strap
    }
    // surgical lamp on a heavy mobile stand behind the table: two heads with LED fields and light cones
    {
      const stand = new THREE.Group(); stand.position.set(-2.85, 0, 1.75); isl.add(stand); // front-left corner of the sterile zone
      Cy(k, stand, 0.2, 0.26, 0.14, m.white, 0, 0.12, 0);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU, leg = B(k, stand, 0.09, 0.06, 0.6, m.white, Math.sin(a) * 0.3, 0.08, Math.cos(a) * 0.3, { r: 0.02, ry: a }); leg.castShadow = false; caster(k, stand, Math.sin(a) * 0.58, Math.cos(a) * 0.58); }
      const TOP = 2.55; // a low mast: the heads hang at about 2 m, over the table, below the desks' nameplates line of sight
      Cy(k, stand, 0.055, 0.06, TOP - 0.1, m.white, 0, (TOP - 0.1) / 2 + 0.1, 0);
      Cy(k, stand, 0.09, 0.09, 0.16, m.offwhite, 0, TOP + 0.05, 0);
      Cy(k, stand, 0.07, 0.07, 0.04, m.teal, 0, TOP - 0.04, 0, { cast: false });
      const ledTex = tex(k, 256, 256, paintLed).tex;
      const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, color: new THREE.Color(1.45, 1.4, 1.3), toneMapped: false });
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.014, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
      const head = (hx, hy, hz, tilt, r) => {
        // the arm: out from the column top, then down to the head's yoke
        const top = [0, TOP + 0.02, 0], elbow = [hx * 0.5, TOP + 0.12, hz * 0.5], drop = [hx, hy + 0.42, hz];
        rodM(k, stand, top, elbow, 0.04, m.white); rodM(k, stand, elbow, drop, 0.035, m.white);
        Cy(k, stand, 0.05, 0.05, 0.08, m.teal, ...elbow, { cast: false });
        rodM(k, stand, drop, [hx, hy + 0.14, hz], 0.03, m.offwhite);
        const h = new THREE.Group(); h.position.set(hx, hy, hz); h.rotation.set(tilt[0], 0, tilt[1]); stand.add(h);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 12, 0, TAU, 0, Math.PI * 0.36), m.white);
        dome.scale.y = 0.5; dome.castShadow = true; h.add(dome);
        Cy(k, h, r * 1.02, r * 1.02, 0.07, m.offwhite, 0, -0.01, 0, { seg: 36 });
        Cy(k, h, r * 1.03, r * 1.03, 0.012, m.teal, 0, 0.028, 0, { seg: 36, cast: false });
        const led = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 36), ledMat); led.rotation.x = Math.PI / 2; led.position.y = -0.05; h.add(led);
        Cy(k, h, 0.035, 0.045, 0.18, m.teal, 0, -0.12, 0, { cast: false }); // sterile handle
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.9, hy - 1.05, 32, 1, true), coneMat);
        cone.position.y = -0.05 - (hy - 1.05) / 2; h.add(cone);
      };
      // both heads inside the sterile rectangle, over the patient (stand-local: the table is at +2.85, -1.75)
      head(2.45, 1.95, -1.6, [0.1, 0.12], 0.4);
      head(3.35, 2.08, -1.95, [0.08, -0.14], 0.32);
      const spot = new THREE.SpotLight(0xfff5e6, 22, 6, 0.6, 0.65, 1.3);
      spot.position.set(-0.2, 1.95, 0.1); spot.target.position.set(0, 1, 0);
      isl.add(spot, spot.target);
      k.my.spot = spot;
    }
    // anaesthesia machine at the head of the table, with the main monitor, vaporisers, flowmeters, bellows, gas
    {
      const a = new THREE.Group(); a.position.set(-2.15, 0, -0.45); a.rotation.y = 0.35; isl.add(a);
      for (const [x, z] of [[-0.36, -0.26], [0.36, -0.26], [-0.36, 0.26], [0.36, 0.26]]) caster(k, a, x, z);
      B(k, a, 0.88, 0.9, 0.62, m.offwhite, 0, 0.6, 0, { r: 0.04 });
      for (let i = 0; i < 3; i++) { B(k, a, 0.8, 0.005, 0.01, m.grey, 0, 0.42 + i * 0.26, 0.312, { cast: false }); B(k, a, 0.2, 0.025, 0.03, m.steel, 0, 0.53 + i * 0.26 - 0.13 + 0.1, 0.32, { cast: false }); }
      B(k, a, 0.98, 0.04, 0.7, m.dark, 0, 1.07, 0.02);
      B(k, a, 0.86, 0.78, 0.34, m.white, 0, 1.48, -0.16, { r: 0.04 });
      B(k, a, 0.9, 0.06, 0.4, m.offwhite, 0, 1.9, -0.16, { r: 0.02 });
      // flowmeter tubes with floats
      B(k, a, 0.3, 0.36, 0.02, m.black, -0.18, 1.5, 0.02, { cast: false });
      [0x2f9e62, 0x2b6cb0, 0xf5f7f8].forEach((c, i) => { const tube = Cy(k, a, 0.018, 0.018, 0.3, m.clear, -0.27 + i * 0.09, 1.5, 0.04, { cast: false }); tube.renderOrder = 2; Cy(k, a, 0.02, 0.012, 0.03, k.glow(c, 1.2), -0.27 + i * 0.09, 1.42 + i * 0.05, 0.04, { cast: false }); Cy(k, a, 0.025, 0.025, 0.04, mat(c, { roughness: 0.4 }), -0.27 + i * 0.09, 1.3, 0.06, { rx: Math.PI / 2, cast: false }); });
      // vaporisers
      [[0xf5c518, 0.15], [0x2b6cb0, 0.33]].forEach(([c, x]) => { B(k, a, 0.14, 0.26, 0.18, mat(c, { roughness: 0.3 }), x, 1.32, 0.05, { r: 0.02 }); Cy(k, a, 0.05, 0.05, 0.03, m.steel, x, 1.47, 0.05, { cast: false }); });
      // bellows in a clear dome on the left
      Cy(k, a, 0.13, 0.14, 0.05, m.dark, -0.32, 1.12, 0.17, { cast: false });
      const dome = Cy(k, a, 0.11, 0.11, 0.34, m.clear, -0.32, 1.32, 0.17, { cast: false }); dome.renderOrder = 2;
      const prof = []; for (let i = 0; i <= 12; i++) prof.push(new THREE.Vector2(i % 2 ? 0.085 : 0.07, i / 12));
      const bel = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), mat(0x5aa9e6, { roughness: 0.35 }));
      bel.position.set(-0.32, 1.15, 0.17); bel.scale.y = 0.25; a.add(bel); k.my.bellows = bel;
      // monitor on an arm
      rodM(k, a, [0.4, 1.62, -0.1], [0.62, 1.74, 0.0], 0.025, m.steel); // a side arm at the anaesthetist's eye level, under the desks' line of sight
      const scr = k.my.vit = tex(k, 512, 320, paintVitalsFrame); paintVitalsNumbers(scr.ctx, 72, 98, 35);
      const mon = new THREE.Group(); mon.position.set(0.88, 1.8, 0.04); mon.rotation.y = -0.3; a.add(mon);
      B(k, mon, 0.78, 0.52, 0.07, m.dark, 0, 0, -0.02, { r: 0.02 });
      const face = plane(0.72, 0.45, new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false, color: new THREE.Color(1.35, 1.35, 1.35) })); face.position.z = 0.016; mon.add(face);
      B(k, mon, 0.78, 0.04, 0.08, m.teal, 0, -0.28, -0.02, { cast: false });
      k.my.vitDraw = sweeper(scr.ctx, 30, 334, [
        { y0: 28, y1: 118, fn: (t) => ecgWave(t, 72), color: '#39ff88', w: 3 },
        { y0: 120, y1: 210, fn: plethWave, color: '#3fe0ff' },
        { y0: 212, y1: 318, fn: capnoWave, color: '#ffd23f' },
      ], 120);
      // label
      const lt = tex(k, 256, 48, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 48); txt(c, 'ANESTESIA', 128, 25, '800 26px system-ui', '#14776f', 'center'); });
      const lp = signMesh(k, 0.5, 0.09, lt); at(lp, 0, 1.78, 0.012); a.add(lp);
      // gas cylinders behind, and the breathing circuit to the head of the table
      Cy(k, a, 0.075, 0.075, 0.72, m.white, -0.25, 0.5, -0.4); Cy(k, a, 0.075, 0.06, 0.08, m.white, -0.25, 0.9, -0.4, { cast: false });
      Cy(k, a, 0.075, 0.075, 0.72, mat(0x2b6cb0, { roughness: 0.4 }), 0.0, 0.5, -0.42); Cy(k, a, 0.075, 0.06, 0.08, m.white, 0.0, 0.9, -0.42, { cast: false });
      const hoseMat = new THREE.MeshStandardMaterial({ color: 0x9cc9e6, roughness: 0.35, transparent: true, opacity: 0.85 });
      for (const dz of [-0.04, 0.04]) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.15 + 0.4, 1.12, -0.45 + 0.3 + dz), new THREE.Vector3(-1.75, 0.95, -0.1 + dz), new THREE.Vector3(-1.35, 1.2, 0.0 + dz), new THREE.Vector3(-1.05, 1.1, 0.02)]);
        const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.022, 8), hoseMat); isl.add(hose);
      }
    }
    // electrosurgical unit on its cart
    {
      const e = new THREE.Group(); e.position.set(1.85, 0, -1.25); e.rotation.y = -0.3; isl.add(e);
      for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) { caster(k, e, x, z); Cy(k, e, 0.015, 0.015, 0.95, m.steel, x, 0.58, z, { cast: false }); }
      B(k, e, 0.58, 0.03, 0.48, m.white, 0, 0.35, 0); B(k, e, 0.58, 0.03, 0.48, m.white, 0, 1.05, 0);
      B(k, e, 0.5, 0.2, 0.4, m.white, 0, 1.17, 0, { r: 0.02 });
      const et = tex(k, 256, 80, (c) => { c.fillStyle = '#0b2540'; c.fillRect(0, 0, 256, 80); txt(c, 'CORTE', 14, 20, '600 15px system-ui', '#ffd23f'); txt(c, '40 W', 120, 20, '800 22px system-ui', '#ffd23f', 'right'); txt(c, 'COAG', 140, 20, '600 15px system-ui', '#60a5fa'); txt(c, '30 W', 246, 20, '800 22px system-ui', '#60a5fa', 'right'); txt(c, 'BIPOLAR · MONOPOLAR', 128, 58, '600 14px system-ui', '#8fb6c9', 'center'); });
      const ep = plane(0.36, 0.11, new THREE.MeshBasicMaterial({ map: et.tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) })); at(ep, 0, 1.2, 0.202); e.add(ep);
      B(k, e, 0.4, 0.2, 0.36, m.grey, 0, 0.47, 0, { r: 0.02 });
      B(k, e, 0.26, 0.05, 0.18, m.drapeBlue, 0.35, 0.03, 0.45, { r: 0.02, cast: false }); // foot pedal
    }
    // Mayo stand over the foot of the table, with instruments
    {
      const y = new THREE.Group(); y.position.set(1.15, 0, 0.75); isl.add(y);
      B(k, y, 0.7, 0.04, 0.06, m.steel, 0, 0.03, -0.3); B(k, y, 0.06, 0.04, 0.62, m.steel, -0.32, 0.03, 0); B(k, y, 0.06, 0.04, 0.62, m.steel, 0.32, 0.03, 0);
      Cy(k, y, 0.025, 0.025, 1.2, m.steel, 0, 0.62, -0.3);
      B(k, y, 0.7, 0.03, 0.48, m.steel, 0, 1.24, 0);
      B(k, y, 0.74, 0.015, 0.52, m.drapeBlue, 0, 1.262, 0, { cast: false });
      const inst = (x, z, l, ry) => { B(k, y, l, 0.012, 0.018, m.chrome, x, 1.276, z, { ry, cast: false }); const r = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12), m.chrome); r.rotation.x = Math.PI / 2; r.position.set(x - Math.cos(ry) * l / 2, 1.276, z + Math.sin(ry) * l / 2); y.add(r); };
      for (let i = 0; i < 6; i++) inst(-0.2 + i * 0.075, -0.06 + (i % 2) * 0.03, 0.22 + (i % 3) * 0.03, 0.08 * (i - 3));
      B(k, y, 0.16, 0.04, 0.12, m.sheet, 0.22, 1.29, 0.13, { cast: false }); B(k, y, 0.15, 0.03, 0.11, m.sheet, 0.22, 1.32, 0.13, { cast: false });
      B(k, y, 0.13, 0.008, 0.02, m.chrome, -0.15, 1.275, 0.15, { ry: 0.4, cast: false });
    }
    // instrument back table under a blue drape: tray, bowls, kidney dish, towels, syringes
    {
      const b = new THREE.Group(); b.position.set(3.15, 0, -0.35); isl.add(b);
      for (const [x, z] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]]) { caster(k, b, x, z); Cy(k, b, 0.018, 0.018, 0.86, m.steel, x, 0.52, z, { cast: false }); }
      B(k, b, 0.68, 0.03, 1.5, m.steel, 0, 0.3, 0);
      B(k, b, 0.72, 0.03, 1.56, m.drapeBlue, 0, 0.96, 0);
      for (const s of [-1, 1]) B(k, b, 0.012, 0.36, 1.56, m.drapeBlue, s * 0.36, 0.8, 0, { cast: false });
      B(k, b, 0.72, 0.36, 0.012, m.drapeBlue, 0, 0.8, 0.78, { cast: false });
      B(k, b, 0.42, 0.06, 0.5, m.steel, 0, 1.01, -0.35);
      for (let i = 0; i < 7; i++) B(k, b, 0.012, 0.012, 0.36, m.chrome, -0.16 + i * 0.05, 1.05, -0.35, { cast: false });
      for (const [z, r] of [[0.15, 0.12], [0.45, 0.09]]) { const bowl = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), m.chrome); bowl.position.set(-0.12, 0.98 + r, z); b.add(bowl); }
      const kd = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 20, Math.PI * 1.2), m.chrome); kd.rotation.x = -Math.PI / 2; kd.position.set(0.18, 1.0, 0.25); b.add(kd);
      B(k, b, 0.24, 0.07, 0.2, m.drapeGreen, 0.18, 1.01, 0.55, { r: 0.02, cast: false });
      for (let i = 0; i < 3; i++) { Cy(k, b, 0.014, 0.014, 0.16, m.clear, 0.2 + i * 0.05, 0.99, -0.02, { rx: Math.PI / 2, cast: false }); Cy(k, b, 0.006, 0.006, 0.05, m.chrome, 0.2 + i * 0.05, 0.99, 0.08, { rx: Math.PI / 2, cast: false }); }
    }
    // IV pole with two bags, a drip chamber, an infusion pump and the line to the table
    {
      const p = new THREE.Group(); p.position.set(-1.25, 0, -1.15); isl.add(p);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; B(k, p, 0.04, 0.03, 0.34, m.steel, Math.sin(a) * 0.17, 0.08, Math.cos(a) * 0.17, { ry: a, cast: false }); caster(k, p, Math.sin(a) * 0.33, Math.cos(a) * 0.33); }
      Cy(k, p, 0.018, 0.018, 2.15, m.chrome, 0, 1.15, 0);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; rodM(k, p, [0, 2.2, 0], [Math.cos(a) * 0.16, 2.26, Math.sin(a) * 0.16], 0.008, m.chrome); }
      for (const s of [-1, 1]) {
        const bag = B(k, p, 0.15, 0.24, 0.05, m.clear, s * 0.15, 2.04, 0, { r: 0.02, cast: false }); bag.renderOrder = 2;
        B(k, p, 0.13, 0.16, 0.035, m.fluid, s * 0.15, 2.0, 0, { r: 0.015, cast: false });
        B(k, p, 0.1, 0.06, 0.004, m.white, s * 0.15, 2.06, 0.027, { cast: false });
        Cy(k, p, 0.008, 0.008, 0.1, m.clear, s * 0.15, 1.87, 0, { cast: false });
      }
      Cy(k, p, 0.016, 0.016, 0.08, m.clear, 0.15, 1.78, 0, { cast: false });
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), m.fluid); drop.position.set(0.15, 1.8, 0); p.add(drop); k.my.drop = drop;
      // infusion pump
      B(k, p, 0.22, 0.2, 0.14, m.white, 0.04, 1.3, 0.08, { r: 0.02 });
      const pt = tex(k, 128, 64, (c) => { c.fillStyle = '#04140e'; c.fillRect(0, 0, 128, 64); txt(c, '125', 64, 26, '800 30px system-ui', '#39ff88', 'center'); txt(c, 'ml/h', 64, 52, '600 14px system-ui', '#8fd9b0', 'center'); });
      const pp = plane(0.13, 0.065, new THREE.MeshBasicMaterial({ map: pt.tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) })); at(pp, 0.04, 1.33, 0.152); p.add(pp);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m.glowGreen.clone()); led.position.set(0.12, 1.24, 0.15); p.add(led); k.my.pumpLed = led;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.1, 1.74, -1.15), new THREE.Vector3(-1.15, 1.3, -0.95), new THREE.Vector3(-0.95, 0.95, -0.6), new THREE.Vector3(-0.55, 1.03, -0.3)]);
      isl.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.006, 6), m.clear));
    }
    // kick bucket and step stool
    {
      const kb = new THREE.Group(); kb.position.set(2.1, 0, 1.15); isl.add(kb);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; caster(k, kb, Math.cos(a) * 0.22, Math.sin(a) * 0.22); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 24), m.steel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; kb.add(ring);
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd0d6dc, roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide })); bucket.position.y = 0.3; bucket.castShadow = true; kb.add(bucket);
      const st = new THREE.Group(); st.position.set(-0.35, 0, 0.82); isl.add(st);
      B(k, st, 0.55, 0.04, 0.32, m.rubber, 0, 0.24, 0); B(k, st, 0.5, 0.04, 0.28, m.steel, 0, 0.21, 0);
      for (const [x, z] of [[-0.23, -0.12], [0.23, -0.12], [-0.23, 0.12], [0.23, 0.12]]) Cy(k, st, 0.012, 0.012, 0.21, m.steel, x, 0.105, z, { cast: false });
    }

    // ===== the corridor door (left wall), "QUIRÓFANO EN USO", scrub sink and X-ray light box, OR control panel
    {
      const d = new THREE.Group(); d.position.set(LEFT_X, 0, 2.2); d.rotation.y = Math.PI / 2; room.add(d); // local +z = into the room
      B(k, d, 2.2, 2.45, 0.08, m.steel, 0, 1.225, 0.03, { cast: false });
      const leaf = mat(0x6fa8c4, { roughness: 0.35 });
      for (const s of [-1, 1]) {
        B(k, d, 0.98, 2.3, 0.06, leaf, s * 0.5, 1.16, 0.08, { r: 0.02, cast: false });
        B(k, d, 0.9, 0.3, 0.01, m.steel, s * 0.5, 0.17, 0.115, { cast: false });
        B(k, d, 0.1, 0.32, 0.015, m.steel, s * 0.12, 1.15, 0.115, { cast: false });
        const port = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.05, metalness: 0.3 })); port.position.set(s * 0.5, 1.62, 0.116); d.add(port);
        const prt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 28), m.steel); prt.position.set(s * 0.5, 1.62, 0.116); d.add(prt);
      }
      B(k, d, 0.012, 2.28, 0.02, m.dark, 0, 1.16, 0.12, { cast: false });
      const warn = tex(k, 384, 256, (c) => { c.fillStyle = '#ffd400'; rr(c, 0, 0, 384, 256, 18); c.fill(); c.strokeStyle = '#1b1b1b'; c.lineWidth = 10; rr(c, 10, 10, 364, 236, 12); c.stroke(); txt(c, 'PROHIBIDO', 192, 62, '900 50px system-ui', '#1b1b1b', 'center'); txt(c, 'EL PASO', 192, 112, '900 50px system-ui', '#1b1b1b', 'center'); txt(c, 'ZONA ESTÉRIL', 192, 168, '800 40px system-ui', '#c81e1e', 'center'); txt(c, 'Solo personal autorizado', 192, 214, '700 25px system-ui', '#1b1b1b', 'center'); });
      const wp = signMesh(k, 0.6, 0.4, warn); at(wp, -0.5, 1.2, 0.117); d.add(wp);
      // lit "QUIRÓFANO EN USO" box above, and the room sign
      // "QUIRÓFANO EN USO": a lit red box while anyone works, a dead grey one otherwise (two paintings, swapped)
      const uso = tex(k, 512, 112, (c) => { c.fillStyle = '#1a0507'; c.fillRect(0, 0, 512, 112); txt(c, 'QUIRÓFANO EN USO', 256, 58, '800 50px system-ui', '#ff3347', 'center'); });
      const usoOff = tex(k, 512, 112, (c) => { c.fillStyle = '#120709'; c.fillRect(0, 0, 512, 112); txt(c, 'QUIRÓFANO EN USO', 256, 58, '800 50px system-ui', '#3a1a1d', 'center'); });
      k.my.usoTex = [usoOff.tex, uso.tex];
      B(k, d, 1.5, 0.36, 0.1, m.dark, 0, 2.72, 0.05, { cast: false });
      const usoMat = k.my.usoMat = new THREE.MeshBasicMaterial({ map: usoOff.tex, toneMapped: false });
      const up = plane(1.42, 0.3, usoMat); at(up, 0, 2.72, 0.102); d.add(up);
      const glowT = tex(k, 128, 64, (c) => { const g2 = c.createRadialGradient(64, 32, 4, 64, 32, 62); g2.addColorStop(0, 'rgba(255,40,60,.75)'); g2.addColorStop(1, 'rgba(255,40,60,0)'); c.fillStyle = g2; c.fillRect(0, 0, 128, 64); });
      const usoGlow = k.my.usoGlow = plane(2.6, 1.0, new THREE.MeshBasicMaterial({ map: glowT.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      at(usoGlow, 0, 2.72, 0.02); usoGlow.visible = false; d.add(usoGlow);
      const usoL = k.my.usoLight = new THREE.PointLight(0xff3040, 0, 3.2, 2); usoL.position.set(0, 2.72, 0.5); d.add(usoL);
      const q1 = tex(k, 512, 160, (c) => { c.fillStyle = '#ffffff'; rr(c, 0, 0, 512, 160, 16); c.fill(); c.fillStyle = '#14a39a'; rr(c, 0, 0, 150, 160, 16); c.fill(); c.fillRect(120, 0, 30, 160); txt(c, '1', 75, 84, '800 110px system-ui', '#ffffff', 'center'); txt(c, 'QUIRÓFANO', 170, 62, '800 50px system-ui', '#0f2f2b'); txt(c, 'Cirugía general', 172, 116, '600 30px system-ui', '#14776f'); });
      const q1m = signMesh(k, 1.6, 0.5, q1); at(q1m, 0, 3.35, 0.03); d.add(q1m);
      // green exit sign high on the wall, next to the door
      const ex = tex(k, 256, 128, (c) => {
        c.fillStyle = '#0d9b4a'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineCap = 'round';
        c.fillRect(14, 14, 54, 100); c.fillStyle = '#0d9b4a'; c.fillRect(22, 22, 38, 84);
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(98, 30, 10, 0, TAU); c.fill(); c.lineWidth = 11;
        c.beginPath(); c.moveTo(94, 46); c.lineTo(86, 78); c.lineTo(102, 92); c.lineTo(100, 114); c.moveTo(86, 78); c.lineTo(70, 98); c.lineTo(58, 100); c.moveTo(92, 52); c.lineTo(110, 66); c.lineTo(122, 58); c.moveTo(92, 52); c.lineTo(76, 62); c.stroke();
        c.lineWidth = 12; c.beginPath(); c.moveTo(146, 64); c.lineTo(230, 64); c.stroke(); c.beginPath(); c.moveTo(206, 40); c.lineTo(232, 64); c.lineTo(206, 88); c.stroke();
      });
      const exm = signMesh(k, 0.75, 0.375, ex, { lit: 1.5 }); at(exm, 1.75, 2.75, 0.03); d.add(exm);
      B(k, d, 0.8, 0.42, 0.05, m.white, 1.75, 2.75, 0.0, { cast: false });
    }
    {
      // scrub sink with gooseneck taps, soap dispensers, paper towels; X-ray light box above
      const s = new THREE.Group(); s.position.set(LEFT_X, 0, 4.15); s.rotation.y = Math.PI / 2; room.add(s);
      B(k, s, 1.3, 0.34, 0.58, m.steel, 0, 0.95, 0.3, { r: 0.03 });
      B(k, s, 1.18, 0.04, 0.46, mat(0x8d969e, { roughness: 0.3, metalness: 0.8 }), 0, 1.1, 0.3, { cast: false });
      B(k, s, 1.3, 0.55, 0.04, m.steel, 0, 1.36, 0.02, { cast: false });
      for (const x of [-0.3, 0.3]) {
        rodM(k, s, [x, 1.4, 0.04], [x, 1.55, 0.18], 0.015, m.chrome);
        const neck = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 8, 16, Math.PI), m.chrome); neck.position.set(x, 1.55, 0.26); neck.rotation.y = Math.PI / 2; s.add(neck);
        B(k, s, 0.03, 0.03, 0.14, m.chrome, x + 0.1, 1.3, 0.12, { cast: false }); // elbow lever
        B(k, s, 0.12, 0.2, 0.09, m.white, x, 1.78, 0.045, { r: 0.02, cast: false }); B(k, s, 0.03, 0.04, 0.05, m.teal, x, 1.66, 0.09, { cast: false });
      }
      Cy(k, s, 0.025, 0.025, 0.55, m.steel, -0.55, 0.42, 0.45, { cast: false }); Cy(k, s, 0.025, 0.025, 0.55, m.steel, 0.55, 0.42, 0.45, { cast: false });
      B(k, s, 0.34, 0.36, 0.12, m.white, 0.88, 1.5, 0.06, { r: 0.02, cast: false }); B(k, s, 0.24, 0.02, 0.06, m.sheet, 0.88, 1.31, 0.1, { cast: false });
      const xr = tex(k, 512, 352, paintXray);
      B(k, s, 1.62, 1.12, 0.09, m.offwhite, 0, 2.85, 0.045, { cast: false });
      const xp = plane(1.5, 1.03, new THREE.MeshBasicMaterial({ map: xr.tex, toneMapped: false, color: new THREE.Color(1.12, 1.12, 1.15) })); at(xp, 0, 2.85, 0.092); s.add(xp);
      const lav = tex(k, 512, 96, (c) => { c.fillStyle = '#ffffff'; rr(c, 0, 0, 512, 96, 12); c.fill(); c.fillStyle = '#2b6cb0'; rr(c, 0, 0, 96, 96, 12); c.fill(); c.fillRect(70, 0, 26, 96); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(48, 18); c.quadraticCurveTo(70, 50, 48, 78); c.quadraticCurveTo(26, 50, 48, 18); c.fill(); txt(c, 'LAVADO QUIRÚRGICO', 112, 36, '800 34px system-ui', '#0f2f4f'); txt(c, 'Mínimo 3 minutos · uñas, manos, antebrazos', 112, 72, '600 21px system-ui', '#2b6cb0'); });
      const lvp = signMesh(k, 1.3, 0.24, lav); at(lvp, 0, 2.12, 0.03); s.add(lvp);
      // OR control panel with temperature, humidity, pressure, time and a running stopwatch
      B(k, s, 1.62, 0.5, 0.06, m.dark, 0, 3.85, 0.03, { r: 0.02, cast: false });
      const pnl = k.my.panel = k.surface(512, 160);
      const pm = plane(1.54, 0.45, new THREE.MeshBasicMaterial({ map: pnl.tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) })); at(pm, 0, 3.85, 0.064); s.add(pm);
    }
    // ===== recovery bay: bed, curtains on a rail, bedhead unit, monitor, cabinet, over-bed table
    {
      const bay = new THREE.Group(); room.add(bay);
      const BZ = 7.15; // the bay starts 0.8 m clear of the scrub sink (rail at z 5.6)
      const bed = new THREE.Group(); bed.position.set(-11.15, 0, BZ); bay.add(bed); // head at -x
      for (const [x, z] of [[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]]) { caster(k, bed, x, z); }
      B(k, bed, 2.0, 0.1, 0.86, m.grey, 0, 0.2, 0, { r: 0.03 });
      for (const s of [-1, 1]) { B(k, bed, 0.06, 0.5, 0.06, m.steel, s * 0.35, 0.42, -0.3, { rz: s * 0.6 }); B(k, bed, 0.06, 0.5, 0.06, m.steel, s * 0.35, 0.42, 0.3, { rz: s * 0.6 }); }
      B(k, bed, 2.0, 0.07, 0.92, m.offwhite, 0, 0.64, 0, { r: 0.03 });
      B(k, bed, 1.25, 0.16, 0.86, m.sheet, 0.35, 0.75, 0, { r: 0.06 });
      const back = B(k, bed, 0.78, 0.16, 0.86, m.sheet, -0.6, 0.92, 0, { r: 0.06 }); back.rotation.z = -0.5; back.position.x = -0.62;
      const pil = B(k, bed, 0.24, 0.5, 0.62, m.white, -0.82, 1.18, 0, { r: 0.1 }); pil.rotation.z = -0.5;
      B(k, bed, 1.0, 0.08, 0.92, m.blanket, 0.47, 0.86, 0, { r: 0.04 }); B(k, bed, 0.12, 0.09, 0.93, m.sheet, -0.06, 0.865, 0, { r: 0.04, cast: false });
      for (const s of [-1, 1]) B(k, bed, 0.012, 0.3, 0.93, m.blanket, 0.47, 0.72, s * 0.465, { cast: false }).rotation.y = Math.PI / 2 * 0 + 0;
      const board = mat(0x9dc9c2, { roughness: 0.4 });
      B(k, bed, 0.06, 0.6, 0.94, board, -1.02, 0.9, 0, { r: 0.03 }); B(k, bed, 0.06, 0.48, 0.94, board, 1.02, 0.84, 0, { r: 0.03 });
      B(k, bed, 0.04, 0.03, 0.8, m.white, 1.05, 1.1, 0, { cast: false });
      const chart = tex(k, 128, 160, (c) => { c.fillStyle = '#8a6a4a'; c.fillRect(0, 0, 128, 160); c.fillStyle = '#fbfaf6'; c.fillRect(8, 16, 112, 138); c.fillStyle = '#9aa4ae'; c.fillRect(44, 4, 40, 18); txt(c, 'CAMA 2', 64, 34, '800 15px system-ui', '#14776f', 'center'); c.strokeStyle = '#d0d6dc'; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(16, 50 + i * 12); c.lineTo(112, 50 + i * 12); c.stroke(); } c.strokeStyle = '#2b6cb0'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < 10; i++) c.lineTo(18 + i * 10, 120 - Math.sin(i * 0.9) * 10 - i); c.stroke(); });
      const cp = signMesh(k, 0.22, 0.28, chart); cp.rotation.y = Math.PI / 2; cp.position.set(1.06, 0.82, 0.12); bed.add(cp);
      // side rails on the open side
      for (const x of [-0.55, 0.35]) { B(k, bed, 0.6, 0.04, 0.03, m.white, x, 1.05, 0.48, { r: 0.015, cast: false }); B(k, bed, 0.6, 0.04, 0.03, m.white, x, 0.88, 0.48, { r: 0.015, cast: false }); B(k, bed, 0.03, 0.22, 0.03, m.white, x - 0.27, 0.95, 0.48, { cast: false }); B(k, bed, 0.03, 0.22, 0.03, m.white, x + 0.27, 0.95, 0.48, { cast: false }); }
      // bedhead unit on the wall with O2 flowmeter, suction jar, reading light, nurse call
      const bh = new THREE.Group(); bh.position.set(LEFT_X, 0, BZ); bh.rotation.y = Math.PI / 2; bay.add(bh);
      B(k, bh, 2.3, 0.34, 0.1, m.white, 0, 1.72, 0.05, { r: 0.02, cast: false });
      B(k, bh, 2.3, 0.04, 0.11, m.teal, 0, 1.57, 0.05, { cast: false });
      B(k, bh, 2.0, 0.04, 0.04, m.glowWarm, 0, 1.91, 0.09, { cast: false });
      Cy(k, bh, 0.03, 0.03, 0.06, mat(0x2f9e62, { roughness: 0.3 }), -0.7, 1.68, 0.13, { rx: Math.PI / 2, cast: false });
      Cy(k, bh, 0.025, 0.025, 0.16, m.clear, -0.7, 1.58, 0.17, { cast: false });
      const jar = Cy(k, bh, 0.07, 0.07, 0.2, m.clear, -0.35, 1.5, 0.18, { cast: false }); jar.renderOrder = 2;
      Cy(k, bh, 0.06, 0.06, 0.09, mat(0x8fd3ff, { roughness: 0.2, transparent: true, opacity: 0.6 }), -0.35, 1.45, 0.18, { cast: false });
      Cy(k, bh, 0.075, 0.075, 0.03, m.dark, -0.35, 1.61, 0.18, { cast: false });
      Cy(k, bh, 0.03, 0.03, 0.03, m.glowRed, 0.75, 1.72, 0.12, { rx: Math.PI / 2, cast: false });
      const read = new THREE.PointLight(0xffe6c4, 4, 5, 1.8); read.position.set(LEFT_X + 0.8, 2.3, BZ); bay.add(read); k.my.lamps.push([read, 9, 2.5]);
      // bedside monitor on its own pole, with an ECG
      const bm = new THREE.Group(); bm.position.set(-12.3, 0, 6.12); bay.add(bm);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; caster(k, bm, Math.sin(a) * 0.28, Math.cos(a) * 0.28); B(k, bm, 0.04, 0.03, 0.28, m.steel, Math.sin(a) * 0.14, 0.08, Math.cos(a) * 0.14, { ry: a, cast: false }); }
      Cy(k, bm, 0.02, 0.02, 1.7, m.chrome, 0, 0.92, 0);
      const ecg = k.my.ecg = k.surface(256, 128); paintEcgFrame(ecg.ctx, 256, 128, 'CAMA 2 · II');
      const mon = new THREE.Group(); mon.position.set(0.05, 1.75, 0.1); mon.rotation.y = 0.75; bm.add(mon);
      B(k, mon, 0.46, 0.32, 0.08, m.white, 0, 0, -0.03, { r: 0.02 });
      const mf = plane(0.4, 0.21, new THREE.MeshBasicMaterial({ map: ecg.tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) })); mf.position.set(0, 0.03, 0.012); mon.add(mf);
      B(k, mon, 0.46, 0.05, 0.081, m.teal, 0, -0.135, -0.03, { cast: false });
      k.my.ecgDraw = sweeper(ecg.ctx, 6, 194, [{ y0: 18, y1: 122, fn: (t) => ecgWave(t + 0.4, 64), color: '#39ff88', w: 2.4 }], 70);
      ecg.ctx.fillStyle = '#02070b'; ecg.ctx.fillRect(196, 18, 60, 110);
      txt(ecg.ctx, 'FC', 204, 36, '600 13px system-ui', '#39ff88'); txt(ecg.ctx, '64', 250, 70, '800 36px system-ui', '#39ff88', 'right'); txt(ecg.ctx, 'SpO₂', 204, 96, '600 12px system-ui', '#3fe0ff'); txt(ecg.ctx, '97', 250, 116, '800 22px system-ui', '#3fe0ff', 'right');
      // IV pole at the head, bedside cabinet with jug and cup, over-bed table
      Cy(k, bay, 0.016, 0.016, 2.0, m.chrome, -12.35, 1.0, 7.95); Cy(k, bay, 0.2, 0.22, 0.04, m.steel, -12.35, 0.03, 7.95, { cast: false });
      B(k, bay, 0.14, 0.22, 0.05, m.clear, -12.35, 1.88, 7.95, { r: 0.02, cast: false }); B(k, bay, 0.12, 0.13, 0.035, m.fluid, -12.35, 1.84, 7.95, { r: 0.015, cast: false });
      const cab = new THREE.Group(); cab.position.set(-12.45, 0, 8.5); bay.add(cab);
      B(k, cab, 0.5, 0.8, 0.5, m.white, 0, 0.42, 0, { r: 0.03 }); B(k, cab, 0.44, 0.012, 0.01, m.grey, 0, 0.62, 0.252, { cast: false }); B(k, cab, 0.16, 0.025, 0.03, m.steel, 0, 0.7, 0.26, { cast: false });
      B(k, cab, 0.54, 0.03, 0.54, board, 0, 0.83, 0, { r: 0.012 });
      Cy(k, cab, 0.06, 0.07, 0.2, m.clear, -0.1, 0.95, -0.05, { cast: false }); Cy(k, cab, 0.055, 0.065, 0.1, m.fluid, -0.1, 0.9, -0.05, { cast: false });
      Cy(k, cab, 0.035, 0.03, 0.09, m.white, 0.12, 0.89, 0.08, { cast: false }); B(k, cab, 0.14, 0.08, 0.1, mat(0x8fb8de), 0.1, 0.88, -0.12, { cast: false });
      const obt = new THREE.Group(); obt.position.set(-10.35, 0, 7.95); bay.add(obt);
      B(k, obt, 0.08, 0.05, 0.6, m.grey, 0, 0.05, 0, { cast: false }); Cy(k, obt, 0.025, 0.025, 1.0, m.steel, 0, 0.55, -0.24);
      B(k, obt, 0.45, 0.03, 0.8, mat(0xf3ead9, { roughness: 0.5 }), 0, 1.07, -0.55, { r: 0.012 });
      Cy(k, obt, 0.04, 0.035, 0.1, m.white, 0.05, 1.13, -0.4, { cast: false }); B(k, obt, 0.18, 0.02, 0.24, m.drapeBlue, -0.05, 1.095, -0.7, { cast: false });
      // curtain rail and curtains (pleated, patterned, a mesh band on top)
      const railM = m.offwhite, H = 2.78;
      const RZ = 5.6;
      rodM(k, bay, [LEFT_X, H, RZ], [-9.55, H, RZ], 0.022, railM); rodM(k, bay, [-9.55, H, RZ], [-9.55, H, 8.8], 0.022, railM);
      for (const [x, z] of [[-11.3, RZ], [-9.55, RZ], [-9.55, 7.2], [-9.55, 8.8]]) rodM(k, bay, [x, H, z], [x, 7.05, z], 0.01, m.steel);
      const ct = tex(k, 256, 256, paintCurtain); ct.tex.wrapS = ct.tex.wrapT = THREE.RepeatWrapping; ct.tex.repeat.set(3, 3);
      const net = tex(k, 64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(245,248,250,.95)'; c.lineWidth = 3; for (let i = -64; i < 128; i += 12) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke(); c.beginPath(); c.moveTo(i + 64, 0); c.lineTo(i, 64); c.stroke(); } });
      net.tex.wrapS = THREE.RepeatWrapping; net.tex.repeat.set(10, 1);
      const cm = new THREE.MeshStandardMaterial({ map: ct.tex, roughness: 0.92, side: THREE.DoubleSide });
      const nm = new THREE.MeshStandardMaterial({ map: net.tex, transparent: true, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false });
      const curtain = (w, pleats, amp) => {
        const geo = new THREE.PlaneGeometry(w, 2.0, pleats * 4, 1), p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * pleats * TAU) * amp);
        geo.computeVertexNormals();
        const o = new THREE.Group(), c = new THREE.Mesh(geo, cm); c.position.y = 1.35; c.castShadow = true; o.add(c);
        const ng = new THREE.PlaneGeometry(w, 0.38, pleats * 4, 1), q = ng.attributes.position;
        for (let i = 0; i < q.count; i++) q.setZ(i, Math.sin((q.getX(i) / w) * pleats * TAU) * amp * 0.8);
        const n = new THREE.Mesh(ng, nm); n.position.y = 2.54; o.add(n);
        return o;
      };
      // drawn open: bunched at the rail corner, so the sink, the X-ray box and the bed all stay in view
      const c1 = curtain(0.95, 9, 0.08); c1.position.set(-10.1, 0, RZ); bay.add(c1);
      const c2 = curtain(0.7, 7, 0.09); c2.rotation.y = Math.PI / 2; c2.position.set(-9.55, 0, RZ + 0.4); bay.add(c2);
      const c3 = curtain(0.55, 6, 0.09); c3.rotation.y = Math.PI / 2; c3.position.set(-9.55, 0, 8.45); bay.add(c3);
      // lit red cross high on the wall
      const rc = new THREE.Group(); rc.position.set(LEFT_X + 0.06, 4.55, 7.15); room.add(rc);
      B(k, rc, 0.06, 1.0, 1.0, m.white, 0, 0, 0, { r: 0.04, cast: false });
      B(k, rc, 0.03, 0.72, 0.24, m.glowRed, 0.04, 0, 0, { cast: false }); B(k, rc, 0.03, 0.24, 0.72, m.glowRed, 0.04, 0, 0, { cast: false });
    }
    // sign over the board
    {
      // as long as the board under it; the two texts are measured so they never touch
      const W = 1600, H = 140;
      const bq = tex(k, W, H, (c) => {
        c.fillStyle = '#0f6f68'; rr(c, 0, 0, W, H, 16); c.fill();
        c.fillStyle = '#14a39a'; c.fillRect(0, H - 14, W, 14);
        c.fillStyle = '#ffffff'; rr(c, 22, 18, 96, 96, 14); c.fill(); crossIcon(c, 70, 66, 64, '#0f6f68');
        const right = 'Quirófanos 1–4  →', x0 = 150;
        c.font = '600 40px system-ui'; const rw = c.measureText(right).width;
        let fs = 60; c.font = `800 ${fs}px system-ui`;
        while (fs > 30 && x0 + c.measureText('BLOQUE QUIRÚRGICO · PLANTA 3').width > W - 40 - rw - 60) { fs -= 2; c.font = `800 ${fs}px system-ui`; }
        txt(c, 'BLOQUE QUIRÚRGICO · PLANTA 3', x0, 66, `800 ${fs}px system-ui`, '#ffffff');
        txt(c, right, W - 40, 66, '600 40px system-ui', '#bff3ea', 'right');
      });
      const p = signMesh(k, 8.2, 0.72, bq); p.rotation.y = Math.PI / 2; p.position.set(LEFT_X + 0.02, 6.2, -3.2); room.add(p);
    }

    // ===== back-left corner: medicine cabinet with glass doors (under the clock)
    {
      const c = new THREE.Group(); c.position.set(-11.75, 0, BACK_Z + 0.3); room.add(c);
      const W = 1.8, H = 3.3, D = 0.48;
      B(k, c, W, 0.95, D, m.white, 0, 0.475, 0, { r: 0.02 });
      for (let i = 0; i < 3; i++) { B(k, c, W - 0.08, 0.27, 0.01, m.offwhite, 0, 0.17 + i * 0.3, D / 2 + 0.005, { cast: false }); B(k, c, 0.3, 0.025, 0.03, m.steel, 0, 0.26 + i * 0.3, D / 2 + 0.02, { cast: false }); }
      B(k, c, W, 0.05, D, m.offwhite, 0, 0.97, 0, { cast: false });
      B(k, c, W, H - 1.0, 0.03, mat(0xeaf3f2), 0, 1.0 + (H - 1.0) / 2, -D / 2 + 0.015, { cast: false });
      for (const s of [-1, 1]) B(k, c, 0.05, H - 1.0, D, m.white, s * (W / 2 - 0.025), 1.0 + (H - 1.0) / 2, 0, { cast: false });
      B(k, c, W, 0.06, D, m.white, 0, H, 0, { cast: false });
      const boxT = ['#e23a46', '#2b6cb0', '#16a34a', '#f59e0b', '#7c3aed', '#0ea5e9'].map((col, i) => tex(k, 128, 64, (g2) => { g2.fillStyle = '#fbfcfd'; g2.fillRect(0, 0, 128, 64); g2.fillStyle = col; g2.fillRect(0, 0, 128, 14); g2.fillRect(0, 54, 128, 10); txt(g2, ['Paracetamol', 'Heparina', 'Amoxicilina', 'Ibuprofeno', 'Midazolam', 'Suero 0,9%'][i], 64, 32, '700 15px system-ui', '#1d2a33', 'center'); txt(g2, ['1 g', '5000 UI', '500 mg', '600 mg', '15 mg', '500 ml'][i], 64, 46, '600 11px system-ui', col, 'center'); }));
      const boxM = boxT.map((t) => new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.6 }));
      const amber = new THREE.MeshStandardMaterial({ color: 0xb4651d, roughness: 0.15, transparent: true, opacity: 0.85 });
      for (let r = 0; r < 4; r++) {
        const y = 1.03 + r * 0.56;
        B(k, c, W - 0.1, 0.025, D - 0.06, m.glass, 0, y, 0, { cast: false });
        let x = -W / 2 + 0.12, n = 0;
        while (x < W / 2 - 0.16) {
          const kind = (r * 5 + n * 3) % 7;
          if (kind < 4) { const w = 0.16 + (n % 3) * 0.04, h = 0.18 + ((r + n) % 3) * 0.06; B(k, c, w, h, 0.22, boxM[(r * 2 + n) % boxM.length], x + w / 2, y + 0.012 + h / 2, -0.02, { cast: false }); x += w + 0.03; }
          else if (kind < 6) { for (let j = 0; j < 3; j++) Cy(k, c, 0.035, 0.035, 0.13, amber, x + 0.04 + j * 0.08, y + 0.08, 0.05, { cast: false, seg: 10 }); x += 0.26; }
          else { Cy(k, c, 0.06, 0.06, 0.22, m.clear, x + 0.07, y + 0.12, 0, { cast: false, seg: 12 }); x += 0.18; }
          n++;
        }
      }
      for (const s of [-1, 1]) {
        const door = B(k, c, W / 2 - 0.04, H - 1.06, 0.015, m.glass, s * (W / 4), 1.0 + (H - 1.0) / 2, D / 2 + 0.01, { cast: false }); door.renderOrder = 3;
        B(k, c, 0.025, 0.3, 0.03, m.chrome, s * 0.07, 2.1, D / 2 + 0.04, { cast: false });
        for (const y of [1.0, H - 0.02]) B(k, c, W / 2 - 0.04, 0.03, 0.02, m.steel, s * (W / 4), y, D / 2 + 0.01, { cast: false });
      }
      const ft = tex(k, 256, 64, (g2) => { g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, 256, 64); crossIcon(g2, 32, 32, 40, '#16a34a'); txt(g2, 'FARMACIA', 62, 34, '800 34px system-ui', '#14532d'); });
      const fp = signMesh(k, 0.9, 0.22, ft); at(fp, 0, H - 0.2, D / 2 + 0.03); c.add(fp);
    }
    // waste bins along the left wall (general, biohazard, sharps)
    {
      const w = new THREE.Group(); w.position.set(LEFT_X + 0.38, 0, -7.8); room.add(w);
      [[0x9aa4ae, 0], [0xf5c518, 0.55], [0xd62839, 1.05]].forEach(([c, z], i) => {
        const col = mat(c, { roughness: 0.45 });
        B(k, w, 0.45, 0.7, 0.45, col, 0, 0.36, z, { r: 0.04 }); B(k, w, 0.48, 0.06, 0.48, i === 1 ? mat(0xd4a50e) : m.dark, 0, 0.74, z, { r: 0.02, cast: false });
        if (i === 1) { const bt = tex(k, 128, 128, (g2) => { g2.fillStyle = '#f5c518'; g2.fillRect(0, 0, 128, 128); g2.strokeStyle = '#111'; g2.lineWidth = 7; for (let j = 0; j < 3; j++) { const a = j * TAU / 3 - Math.PI / 2; g2.beginPath(); g2.arc(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18, 20, 0, TAU); g2.stroke(); } g2.beginPath(); g2.arc(64, 64, 9, 0, TAU); g2.stroke(); txt(g2, 'BIOPELIGRO', 64, 116, '800 15px system-ui', '#111', 'center'); }); const bp = signMesh(k, 0.3, 0.3, bt); bp.rotation.y = Math.PI / 2; bp.position.set(0.228, 0.42, z); w.add(bp); }
      });
    }

    // ===== back-right corner: crash cart with defibrillator; linen cart
    {
      // the crash cart stands clear of the last desk, along the right edge, its drawers turned to the room
      const c = new THREE.Group(); c.position.set(12.2, 0, -4.05); c.rotation.y = -Math.PI / 2 + 0.35; room.add(c);
      for (const [x, z] of [[-0.33, -0.24], [0.33, -0.24], [-0.33, 0.24], [0.33, 0.24]]) caster(k, c, x, z);
      B(k, c, 0.78, 0.95, 0.56, m.red, 0, 0.6, 0, { r: 0.03 });
      for (let i = 0; i < 5; i++) { B(k, c, 0.72, 0.006, 0.01, mat(0x8f1420), 0, 0.3 + i * 0.17, 0.283, { cast: false }); B(k, c, 0.26, 0.02, 0.03, m.chrome, 0, 0.38 + i * 0.17, 0.29, { cast: false }); }
      B(k, c, 0.84, 0.05, 0.62, m.grey, 0, 1.1, 0, { r: 0.015 });
      const lt = tex(k, 480, 72, (g2) => { g2.fillStyle = '#8f1420'; rr(g2, 0, 0, 480, 72, 10); g2.fill(); txt(g2, 'CARRO DE PARADAS', 240, 38, '900 42px system-ui', '#ffffff', 'center'); });
      const lp = signMesh(k, 0.74, 0.11, lt); at(lp, 0, 1.0, 0.288); c.add(lp);
      // defibrillator
      B(k, c, 0.46, 0.3, 0.32, mat(0xf2c230, { roughness: 0.4 }), -0.08, 1.28, -0.04, { r: 0.03 });
      B(k, c, 0.42, 0.04, 0.3, m.dark, -0.08, 1.45, -0.04, { r: 0.01, cast: false });
      const dt = k.my.defib = k.surface(256, 128); paintEcgFrame(dt.ctx, 256, 128, 'DEA · LISTO');
      const dp = plane(0.22, 0.12, new THREE.MeshBasicMaterial({ map: dt.tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) })); dp.position.set(-0.13, 1.31, 0.122); c.add(dp);
      k.my.defibDraw = sweeper(dt.ctx, 6, 250, [{ y0: 18, y1: 124, fn: (t) => ecgWave(t * 0.92, 80), color: '#39ff88', w: 3 }], 90);
      for (const s of [-1, 1]) { B(k, c, 0.1, 0.06, 0.16, m.dark, 0.25 + s * 0.06, 1.17, 0.05, { r: 0.02, cast: false }); }
      Cy(k, c, 0.03, 0.03, 0.03, m.glowGreen, 0.06, 1.38, 0.13, { rx: Math.PI / 2, cast: false });
      Cy(k, c, 0.08, 0.08, 0.75, m.white, 0.47, 0.6, 0.0); Cy(k, c, 0.08, 0.05, 0.1, mat(0x2f9e62), 0.47, 1.02, 0, { cast: false });
      B(k, c, 0.14, 0.22, 0.14, m.yellow, 0.25, 1.24, -0.18, { cast: false });
      const l = new THREE.Group(); l.position.set(12.25, 0, -7.7); room.add(l);
      for (const [x, z] of [[-0.28, -0.55], [0.28, -0.55], [-0.28, 0.55], [0.28, 0.55]]) { caster(k, l, x, z); Cy(k, l, 0.015, 0.015, 1.5, m.chrome, x, 0.85, z, { cast: false }); }
      const lin = [m.drapeBlue, m.sheet, m.drapeGreen, m.blanket];
      for (let r = 0; r < 3; r++) {
        B(k, l, 0.6, 0.02, 1.15, m.chrome, 0, 0.25 + r * 0.55, 0, { cast: false });
        for (let j = 0; j < 3; j++) for (let s = 0; s < 3 - ((r + j) % 2); s++) B(k, l, 0.44, 0.075, 0.3, lin[(r + j + s) % 4], 0.0, 0.3 + r * 0.55 + s * 0.08, -0.36 + j * 0.36, { r: 0.025, cast: false });
      }
    }

    // ===== nurses' station on the right (the break spot): counter, coffee machine, patient board, binders
    {
      // 1.5 m back from the whiteboard so it shows beside it; the coffee corner stays by the break spot (z 0.2..1.2)
      const n = new THREE.Group(); n.position.z = -1.5; room.add(n);
      const cnt = mat(0xf4f7f6, { roughness: 0.4 }), top = mat(0xcaa77a, { roughness: 0.45 });
      B(k, n, 0.14, 1.1, 3.7, cnt, 10.5, 0.55, 0.6); B(k, n, 0.5, 0.05, 3.8, top, 10.6, 1.13, 0.6, { r: 0.015 });
      B(k, n, 0.15, 0.12, 3.7, m.teal, 10.42, 0.85, 0.6, { cast: false });
      B(k, n, 2.4, 1.1, 0.14, cnt, 11.75, 0.55, 2.43); B(k, n, 2.5, 0.05, 0.5, top, 11.7, 1.13, 2.33, { r: 0.015 });
      const sgn = tex(k, 1024, 128, (c) => { c.fillStyle = '#f4f7f6'; c.fillRect(0, 0, 1024, 128); c.fillStyle = '#14a39a'; c.fillRect(0, 96, 1024, 32); c.fillStyle = '#0f6f68'; rr(c, 16, 12, 72, 72, 10); c.fill(); crossIcon(c, 52, 48, 48, '#ffffff'); txt(c, 'CONTROL DE ENFERMERÍA', 108, 50, '800 54px system-ui', '#0f2f2b'); });
      const sp = signMesh(k, 2.38, 0.3, sgn); at(sp, 11.75, 0.85, 2.502); n.add(sp);
      // behind: desk, chair, shelves with binders, a printer, a pinboard on a low partition
      B(k, n, 1.0, 0.04, 3.4, cnt, 11.55, 0.76, 0.55); B(k, n, 0.04, 0.74, 3.4, m.offwhite, 12.05, 0.38, 0.55, { cast: false });
      B(k, n, 0.08, 1.9, 3.9, mat(0xdfe9e7), 12.85, 0.95, 0.5);
      const pin = tex(k, 512, 256, (c) => { c.fillStyle = '#c49a6c'; c.fillRect(0, 0, 512, 256); const cols = ['#fff7a8', '#ffd0dc', '#c9f2ff', '#d6ffd0', '#ffffff']; for (let i = 0; i < 14; i++) { const x = 16 + (i * 97) % 470, y = 14 + (i * 61) % 190; c.save(); c.translate(x + 30, y + 26); c.rotate(((i * 37) % 13 - 6) / 60); c.fillStyle = cols[i % cols.length]; c.fillRect(-30, -26, 64, 56); c.fillStyle = 'rgba(40,50,60,.5)'; for (let j = 0; j < 4; j++) c.fillRect(-24, -14 + j * 11, 40 + (j * 7) % 14, 3); c.fillStyle = '#e23a46'; c.beginPath(); c.arc(0, -22, 4, 0, TAU); c.fill(); c.restore(); } txt(c, 'TURNOS', 470, 236, '800 22px system-ui', '#5b3a1e', 'right'); });
      const pp = signMesh(k, 2.2, 1.1, pin, { rough: 0.9 }); pp.rotation.y = -Math.PI / 2; pp.position.set(12.8, 1.35, -0.2); n.add(pp);
      const binders = [0xe23a46, 0x2b6cb0, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0ea5e9, 0xf4f7f6];
      B(k, n, 0.36, 0.03, 1.3, cnt, 12.6, 1.62, 1.55, { cast: false });
      for (let i = 0; i < 14; i++) B(k, n, 0.28, 0.32 + (i % 3) * 0.02, 0.06, mat(binders[i % binders.length], { roughness: 0.5 }), 12.6, 1.8, 0.98 + i * 0.085, { cast: false });
      B(k, n, 0.42, 0.24, 0.4, m.white, 11.6, 0.9, -0.75, { r: 0.03 }); B(k, n, 0.3, 0.03, 0.24, m.sheet, 11.6, 1.03, -0.75, { cast: false });
      const chairS = mat(0x2e8a82, { roughness: 0.6 });
      B(k, n, 0.5, 0.08, 0.5, chairS, 11.65, 0.56, 0.7, { r: 0.04 }); B(k, n, 0.08, 0.55, 0.48, chairS, 11.95, 0.88, 0.7, { r: 0.04 }); Cy(k, n, 0.03, 0.03, 0.5, m.steel, 11.65, 0.28, 0.7, { cast: false });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; caster(k, n, 11.65 + Math.sin(a) * 0.25, 0.7 + Math.cos(a) * 0.25); }
      // on the counter: coffee machine, cups, call bell, phone, sanitiser, charts, a monitor with the bed list
      B(k, n, 0.34, 0.42, 0.3, m.black, 10.62, 1.37, 2.05, { r: 0.03 }); B(k, n, 0.26, 0.04, 0.2, m.steel, 10.55, 1.18, 2.05, { cast: false });
      Cy(k, n, 0.04, 0.035, 0.08, m.white, 10.52, 1.21, 2.05, { cast: false }); Cy(k, n, 0.02, 0.02, 0.02, m.glowAmber, 10.45, 1.5, 2.15, { rx: Math.PI / 2, cast: false });
      for (let i = 0; i < 4; i++) Cy(k, n, 0.04, 0.032, 0.09, [m.white, m.teal, m.white, m.yellow][i], 10.6 + (i % 2) * 0.1, 1.2, 1.55 + Math.floor(i / 2) * 0.1, { cast: false });
      Cy(k, n, 0.05, 0.06, 0.04, m.chrome, 10.62, 1.18, -0.6, { cast: false }); const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, TAU, 0, Math.PI / 2), m.chrome); bell.position.set(10.62, 1.2, -0.6); n.add(bell);
      B(k, n, 0.2, 0.06, 0.26, m.dark, 10.62, 1.19, -0.25, { r: 0.02, cast: false });
      Cy(k, n, 0.04, 0.045, 0.18, m.clear, 10.62, 1.24, 0.12, { cast: false }); Cy(k, n, 0.015, 0.015, 0.06, m.white, 10.62, 1.36, 0.12, { cast: false });
      for (let i = 0; i < 4; i++) B(k, n, 0.3, 0.025, 0.22, mat(binders[i]), 10.65, 1.17 + i * 0.026, 0.45, { ry: i * 0.07, cast: false });
      const bl = tex(k, 256, 160, (c) => { c.fillStyle = '#071622'; c.fillRect(0, 0, 256, 160); txt(c, 'PACIENTES · PLANTA 3', 10, 14, '700 13px system-ui', '#8fb6c9'); [['CAMA 1', 'Estable', '#39ff88'], ['CAMA 2', 'Post-op', '#ffd23f'], ['CAMA 3', 'Alta hoy', '#3fe0ff'], ['CAMA 4', 'Libre', '#7b8a94'], ['Q1', 'En curso', '#ff5d6c']].forEach(([a, b, col], i) => { txt(c, a, 12, 40 + i * 25, '700 15px system-ui', '#e6eef3'); c.fillStyle = col; c.beginPath(); c.arc(112, 40 + i * 25, 5, 0, TAU); c.fill(); txt(c, b, 124, 40 + i * 25, '600 15px system-ui', col); }); });
      const mon = new THREE.Group(); mon.position.set(10.72, 1.42, 1.0); mon.rotation.y = -Math.PI / 2 + 0.25; n.add(mon);
      B(k, mon, 0.56, 0.36, 0.04, m.dark, 0, 0, 0, { r: 0.015 }); Cy(k, mon, 0.02, 0.02, 0.22, m.steel, 0, -0.24, -0.02, { cast: false }); B(k, mon, 0.2, 0.02, 0.16, m.dark, 0, -0.27, -0.02, { cast: false });
      const mp = plane(0.52, 0.32, new THREE.MeshBasicMaterial({ map: bl.tex, toneMapped: false })); mp.position.z = 0.022; mon.add(mp);
      // the station's sign stands on the front counter on two posts, turned to the room (not hung over the void)
      const hs = tex(k, 512, 128, (c) => { c.fillStyle = '#0f6f68'; rr(c, 0, 0, 512, 128, 14); c.fill(); c.fillStyle = '#ffffff'; rr(c, 16, 18, 92, 92, 12); c.fill(); crossIcon(c, 62, 64, 62, '#0f6f68'); txt(c, 'ENFERMERÍA', 300, 52, '800 54px system-ui', '#ffffff', 'center'); txt(c, 'Información · Planta 3', 300, 100, '600 27px system-ui', '#bff3ea', 'center'); });
      const hg = new THREE.Group(); hg.position.set(11.7, 2.12, 2.36); hg.rotation.y = -0.22; n.add(hg);
      B(k, hg, 1.72, 0.47, 0.05, m.white, 0, 0, -0.03, { r: 0.02, cast: false });
      const hp = signMesh(k, 1.64, 0.41, hs); hp.position.z = 0.004; hg.add(hp);
      for (const s of [-1, 1]) Cy(k, hg, 0.018, 0.018, 0.78, m.steel, s * 0.6, -0.6, -0.04, { cast: false });
      const nl = new THREE.PointLight(0xffe2b8, 4, 7.5, 1.6); nl.position.set(10.4, 2.5, 0.8); n.add(nl); k.my.lamps.push([nl, 14, 2.5]);
      // a warm LED strip under the counter's top edge: the station glows at night
      B(k, n, 0.02, 0.025, 3.6, m.glowWarm, 10.36, 1.08, 0.6, { cast: false }); B(k, n, 2.3, 0.025, 0.02, m.glowWarm, 11.75, 1.08, 2.51, { cast: false });
    }
    // wheelchair, water cooler, waiting bench, sanitiser totem, a plant
    {
      const w = new THREE.Group(); w.position.set(11.75, 0, 4.25); w.rotation.y = -2.3; room.add(w);
      const frameM = m.steel;
      for (const s of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 8, 28), m.rubber); wheel.rotation.y = Math.PI / 2; wheel.position.set(s * 0.3, 0.31, -0.05); wheel.castShadow = true; w.add(wheel);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.008, 6, 28), m.chrome); rim.rotation.y = Math.PI / 2; rim.position.set(s * 0.33, 0.31, -0.05); w.add(rim);
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 6; rodM(k, w, [s * 0.3, 0.31 + Math.sin(a) * 0.27, -0.05 + Math.cos(a) * 0.27], [s * 0.3, 0.31 - Math.sin(a) * 0.27, -0.05 - Math.cos(a) * 0.27], 0.004, m.chrome); }
        Cy(k, w, 0.05, 0.05, 0.03, m.rubber, s * 0.22, 0.05, 0.38, { rz: Math.PI / 2, cast: false });
        rodM(k, w, [s * 0.24, 0.5, -0.2], [s * 0.24, 1.0, -0.3], 0.014, frameM); rodM(k, w, [s * 0.24, 1.0, -0.3], [s * 0.24, 1.0, -0.42], 0.016, m.rubber);
        rodM(k, w, [s * 0.24, 0.5, -0.2], [s * 0.22, 0.12, 0.38], 0.012, frameM);
        B(k, w, 0.05, 0.03, 0.34, m.dark, s * 0.25, 0.72, 0.0, { cast: false });
        B(k, w, 0.14, 0.015, 0.12, m.dark, s * 0.09, 0.14, 0.44, { cast: false });
      }
      B(k, w, 0.46, 0.04, 0.42, m.dark, 0, 0.5, 0.02); B(k, w, 0.46, 0.4, 0.03, m.dark, 0, 0.75, -0.24, { rx: -0.12 });
      const wc = new THREE.Group(); wc.position.set(12.55, 0, 3.15); room.add(wc);
      B(k, wc, 0.36, 1.0, 0.36, m.white, 0, 0.5, 0, { r: 0.03 }); B(k, wc, 0.2, 0.04, 0.06, m.dark, 0, 0.75, 0.17, { cast: false });
      const bot = Cy(k, wc, 0.15, 0.15, 0.4, new THREE.MeshStandardMaterial({ color: 0x7cc4ff, roughness: 0.05, transparent: true, opacity: 0.55 }), 0, 1.24, 0, { cast: false }); bot.renderOrder = 2;
      Cy(k, wc, 0.06, 0.15, 0.06, new THREE.MeshStandardMaterial({ color: 0x7cc4ff, roughness: 0.05, transparent: true, opacity: 0.55 }), 0, 1.47, 0, { cast: false });
      const bn = new THREE.Group(); bn.position.set(12.45, 0, 6.9); bn.rotation.y = -Math.PI / 2; room.add(bn);
      B(k, bn, 2.1, 0.05, 0.08, m.steel, 0, 0.4, 0); for (const x of [-0.85, 0.85]) { B(k, bn, 0.06, 0.4, 0.5, m.steel, x, 0.2, 0, { cast: false }); }
      for (let i = 0; i < 3; i++) { B(k, bn, 0.56, 0.06, 0.48, m.teal, -0.68 + i * 0.68, 0.46, 0.04, { r: 0.03 }); B(k, bn, 0.56, 0.5, 0.06, m.teal, -0.68 + i * 0.68, 0.78, -0.22, { r: 0.03, rx: -0.12 }); }
      B(k, bn, 0.34, 0.03, 0.24, mat(0xf4a7b9), 0.68, 0.51, 0.06, { ry: 0.3, cast: false });
      const tt = new THREE.Group(); tt.position.set(6.6, 0, 8.55); room.add(tt);
      B(k, tt, 0.36, 0.04, 0.36, m.dark, 0, 0.02, 0, { cast: false }); Cy(k, tt, 0.04, 0.04, 1.1, m.white, 0, 0.57, 0); B(k, tt, 0.3, 0.42, 0.14, m.white, 0, 1.25, 0, { r: 0.03 });
      const ht = tex(k, 128, 160, (c) => { c.fillStyle = '#14a39a'; c.fillRect(0, 0, 128, 160); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(64, 20); c.quadraticCurveTo(100, 70, 64, 104); c.quadraticCurveTo(28, 70, 64, 20); c.fill(); txt(c, 'HIGIENE', 64, 126, '800 20px system-ui', '#ffffff', 'center'); txt(c, 'DE MANOS', 64, 146, '700 15px system-ui', '#d9fff9', 'center'); });
      const htp = signMesh(k, 0.26, 0.33, ht); at(htp, 0, 1.25, 0.072); tt.add(htp);
      const p = new THREE.Group(); p.position.set(12.25, 0, 8.45); room.add(p);
      Cy(k, p, 0.3, 0.24, 0.55, m.white, 0, 0.28, 0);
      for (let i = 0; i < 7; i++) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat([0x2f9e62, 0x3bb273, 0x268752][i % 3])); leaf.scale.set(0.5, 1.5, 0.5); leaf.position.set(Math.cos(i * 0.9) * 0.22, 0.95 + (i % 2) * 0.22, Math.sin(i * 0.9) * 0.22); leaf.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i * 0.9) * -0.45); leaf.castShadow = true; p.add(leaf); }
    }
    // a stretcher parked by the bay, and a dressing trolley
    {
      const st = new THREE.Group(); st.position.set(-6.3, 0, 7.45); st.rotation.y = 0.12; room.add(st);
      for (const [x, z] of [[-0.85, -0.3], [0.85, -0.3], [-0.85, 0.3], [0.85, 0.3]]) caster(k, st, x, z);
      B(k, st, 1.9, 0.06, 0.62, m.steel, 0, 0.18, 0); B(k, st, 0.12, 0.6, 0.12, m.offwhite, -0.6, 0.5, 0); B(k, st, 0.12, 0.6, 0.12, m.offwhite, 0.6, 0.5, 0);
      B(k, st, 1.95, 0.06, 0.66, m.offwhite, 0, 0.82, 0, { r: 0.02 });
      B(k, st, 1.85, 0.11, 0.6, mat(0x2e8a82, { roughness: 0.5 }), 0, 0.9, 0, { r: 0.04 });
      B(k, st, 1.0, 0.03, 0.62, m.sheet, 0.35, 0.97, 0, { r: 0.01 }); B(k, st, 0.36, 0.1, 0.5, m.white, -0.7, 1.0, 0, { r: 0.04 });
      B(k, st, 0.5, 0.08, 0.6, m.blanket, 0.6, 1.0, 0, { r: 0.03 });
      for (const s of [-1, 1]) B(k, st, 1.3, 0.03, 0.03, m.chrome, 0, 1.12, s * 0.33, { cast: false });
      for (const s of [-1, 1]) for (const x of [-0.6, 0.6]) B(k, st, 0.03, 0.2, 0.03, m.chrome, x, 1.02, s * 0.33, { cast: false });
      Cy(k, st, 0.06, 0.06, 0.5, m.white, 0.8, 0.45, 0.4, { rz: Math.PI / 2 - 0.15 }); // O2 bottle in its holder
      Cy(k, st, 0.06, 0.04, 0.06, mat(0x2f9e62), 1.06, 0.49, 0.4, { rz: Math.PI / 2 - 0.15, cast: false });
      const dt = new THREE.Group(); dt.position.set(-6.4, 0, 5.3); dt.rotation.y = 0.3; room.add(dt); (k.my.crowd = k.my.crowd || []).push(dt);
      for (const [x, z] of [[-0.35, -0.22], [0.35, -0.22], [-0.35, 0.22], [0.35, 0.22]]) { caster(k, dt, x, z); Cy(k, dt, 0.016, 0.016, 0.85, m.chrome, x, 0.53, z, { cast: false }); }
      B(k, dt, 0.78, 0.025, 0.5, m.steel, 0, 0.35, 0); B(k, dt, 0.78, 0.025, 0.5, m.steel, 0, 0.95, 0);
      for (let i = 0; i < 3; i++) B(k, dt, 0.18, 0.12, 0.14, [m.white, mat(0x9cc7f0), m.white][i], -0.24 + i * 0.22, 1.03, -0.1, { r: 0.02, cast: false });
      Cy(k, dt, 0.06, 0.06, 0.1, m.chrome, 0.24, 1.01, 0.12, { cast: false }); Cy(k, dt, 0.035, 0.04, 0.14, mat(0x8c3b2f, { transparent: true, opacity: 0.85, roughness: 0.15 }), -0.05, 1.03, 0.14, { cast: false });
      B(k, dt, 0.3, 0.05, 0.22, m.sheet, -0.24, 0.39, 0, { cast: false }); B(k, dt, 0.26, 0.18, 0.2, m.yellow, 0.22, 0.46, 0, { cast: false });
    }
    // a mobile C-arm (fluoroscopy) parked by the island, with its monitor cart
    {
      const ca = new THREE.Group(); ca.position.set(4.6, 0, 6.1); ca.rotation.y = -0.5; room.add(ca); (k.my.crowd = k.my.crowd || []).push(ca);
      for (const [x, z] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) caster(k, ca, x, z);
      B(k, ca, 0.7, 0.75, 1.2, m.white, 0, 0.5, 0, { r: 0.06 });
      B(k, ca, 0.72, 0.08, 1.22, m.teal, 0, 0.2, 0, { r: 0.03, cast: false });
      B(k, ca, 0.5, 0.2, 0.3, m.offwhite, 0, 0.95, -0.4, { r: 0.04 }); B(k, ca, 0.46, 0.02, 0.26, m.dark, 0, 1.06, -0.4, { cast: false });
      B(k, ca, 0.26, 0.9, 0.26, m.white, 0, 1.3, 0.25, { r: 0.04 });
      B(k, ca, 0.22, 0.2, 0.7, m.offwhite, 0, 1.68, 0.6, { r: 0.04 });
      const c = new THREE.Group(); c.position.set(0, 1.45, 1.05); ca.add(c);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 12, 40, Math.PI * 1.15), m.white); arc.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.075 + Math.PI); arc.scale.set(1, 1, 1.6); arc.castShadow = true; c.add(arc);
      B(k, c, 0.14, 0.24, 0.14, m.offwhite, 0, 0.0, -0.05, { r: 0.04 });
      Cy(k, c, 0.2, 0.2, 0.26, m.offwhite, 0, 0.55, 0.42, { seg: 28 }); Cy(k, c, 0.21, 0.21, 0.03, m.teal, 0, 0.42, 0.42, { seg: 28, cast: false });
      B(k, c, 0.3, 0.22, 0.28, m.offwhite, 0, -0.62, 0.42, { r: 0.04 }); B(k, c, 0.2, 0.02, 0.2, m.dark, 0, -0.5, 0.42, { cast: false });
      const ft = tex(k, 256, 64, (g2) => { g2.fillStyle = '#ffd400'; g2.fillRect(0, 0, 256, 64); g2.fillStyle = '#111'; g2.beginPath(); g2.moveTo(32, 8); g2.lineTo(58, 56); g2.lineTo(6, 56); g2.closePath(); g2.fill(); g2.fillStyle = '#ffd400'; g2.beginPath(); g2.arc(32, 40, 7, 0, TAU); g2.fill(); txt(g2, 'RAYOS X', 160, 34, '800 32px system-ui', '#111', 'center'); });
      for (const s of [-1, 1]) { const p = signMesh(k, 0.5, 0.125, ft); p.rotation.y = s * Math.PI / 2; p.position.set(s * 0.355, 0.62, 0); ca.add(p); }
      // monitor cart: two screens with a fluoroscopy image
      const mc = new THREE.Group(); mc.position.set(5.6, 0, 6.95); mc.rotation.y = -0.85; room.add(mc); k.my.crowd.push(mc);
      for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) caster(k, mc, x, z);
      B(k, mc, 0.72, 0.85, 0.55, m.white, 0, 0.55, 0, { r: 0.04 }); B(k, mc, 0.74, 0.06, 0.57, m.teal, 0, 0.98, 0, { cast: false });
      Cy(k, mc, 0.05, 0.05, 0.75, m.steel, 0, 1.38, -0.05);
      const fl = tex(k, 256, 192, (g2) => {
        g2.fillStyle = '#000'; g2.fillRect(0, 0, 256, 192);
        const gr = g2.createRadialGradient(128, 96, 10, 128, 96, 90); gr.addColorStop(0, '#5d6066'); gr.addColorStop(1, '#0a0a0c'); g2.fillStyle = gr; g2.beginPath(); g2.arc(128, 96, 88, 0, TAU); g2.fill();
        g2.fillStyle = 'rgba(230,232,236,.8)'; for (let i = 0; i < 5; i++) { g2.beginPath(); g2.roundRect(112, 20 + i * 32, 32, 26, 6); g2.fill(); }
        g2.fillStyle = 'rgba(160,220,255,.95)'; g2.fillRect(86, 70, 84, 6); g2.fillRect(96, 64, 6, 18); g2.fillRect(154, 64, 6, 18);
        txt(g2, 'ESCOPIA · L3-L4', 8, 10, '600 11px system-ui', '#9fb3c2'); txt(g2, '72 kV  2,1 mA', 248, 182, '600 11px system-ui', '#9fb3c2', 'right');
      });
      for (const s of [-1, 1]) {
        const mon = new THREE.Group(); mon.position.set(s * 0.36, 1.9, 0); mon.rotation.y = -s * 0.12; mc.add(mon);
        B(k, mon, 0.66, 0.5, 0.05, m.dark, 0, 0, -0.01, { r: 0.015 });
        const pp = plane(0.62, 0.465, new THREE.MeshBasicMaterial({ map: fl.tex, toneMapped: false })); pp.position.z = 0.017; mon.add(pp);
      }
      B(k, mc, 1.4, 0.06, 0.08, m.steel, 0, 1.7, -0.05, { cast: false });
    }
    // the SALIDA sign at the back-right end of the wall
    {
      const ex = tex(k, 256, 96, (c) => { c.fillStyle = '#0d9b4a'; c.fillRect(0, 0, 256, 96); txt(c, 'SALIDA', 150, 50, '800 44px system-ui', '#ffffff', 'center'); c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(20, 48); c.lineTo(62, 48); c.moveTo(44, 30); c.lineTo(64, 48); c.lineTo(44, 66); c.stroke(); });
      const p = signMesh(k, 0.85, 0.32, ex, { lit: 1.5 }); at(p, 12.55, 5.55, BACK_Z + 0.06); room.add(p);
    }
    // the pharmacy delivery robot that follows the blue line
    {
      const r = k.my.robot = new THREE.Group();
      B(k, r, 0.55, 0.62, 0.78, m.white, 0, 0.4, 0, { r: 0.08 });
      B(k, r, 0.57, 0.08, 0.8, m.teal, 0, 0.16, 0, { r: 0.03 });
      B(k, r, 0.5, 0.04, 0.7, m.offwhite, 0, 0.73, 0, { r: 0.02, cast: false });
      B(k, r, 0.42, 0.07, 0.02, m.black, 0, 0.52, 0.39, { cast: false });
      const eye = B(k, r, 0.3, 0.025, 0.01, m.glowCyan, 0, 0.52, 0.402, { cast: false }); eye.castShadow = false;
      const ft = tex(k, 256, 64, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 64); crossIcon(c, 30, 32, 36, '#16a34a'); txt(c, 'FARMACIA', 58, 34, '800 32px system-ui', '#14532d'); });
      for (const s of [-1, 1]) { const p = signMesh(k, 0.6, 0.15, ft); p.rotation.y = s * Math.PI / 2; p.position.set(s * 0.278, 0.42, 0); r.add(p); }
      Cy(k, r, 0.03, 0.03, 0.08, m.dark, 0.18, 0.78, -0.25, { cast: false });
      const bc = k.my.beacon = Cy(k, r, 0.045, 0.045, 0.07, k.glow(0xffa31a, 2), 0.18, 0.85, -0.25, { cast: false });
      bc.material = bc.material.clone();
      k.scene.add(r);
      k.my.rs = { d: 0, dir: 1, len: 0 };
      let L = 0; for (let i = 0; i < k.my.path.length - 1; i++) L += Math.hypot(k.my.path[i + 1][0] - k.my.path[i][0], k.my.path[i + 1][1] - k.my.path[i][1]);
      k.my.rs.len = L; k.my.rs.d = L * 0.15;
    }
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
    const hp = signMesh(k, 0.82, 0.154, ht); hp.position.z = 0.042; clip.add(hp);
    // rounded plastic corner guards, as on a real clipboard
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cg = k.box(0.24, 0.24, 0.13, 0, { m: m.teal, x: sx * 1.98, y: 2.35 + sy * 1.28, z: 0.0, r: 0.06, cast: false });
      fx.trace.group.add(cg);
    }
    k.my.traceMesh = fx.trace.mesh;
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
    txt(c, 'QUIRÓFANO 1', 128, 172, '700 12px system-ui', '#14a39a', 'center');
    const hand = (a, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(128 - Math.sin(a) * 14, 128 + Math.cos(a) * 14); c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); c.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 58, 10, '#13212a');
    hand(d.getMinutes() * (Math.PI / 30), 92, 6, '#13212a');
    c.fillStyle = '#e11d48'; c.beginPath(); c.arc(128, 128, 8, 0, TAU); c.fill();
  },

  // ------------------------------------------------------------ desks
  station(k, st) {
    const { group: g, props: p } = st, D = k.C.DESK_Z, role = (st.agent && st.agent.role) || '';
    const m = M(k), col = new THREE.Color(st.agent.color || '#14a39a');
    p.mats.wood.color.set(0xf4f7f7); p.mats.wood.roughness = 0.3;
    p.mats.frame.color.set(0x5f948c); // sage-teal body and modesty panel: the white desktops read against the floor
    if (p.bezel) { p.bezel.material.color.set(0xe9eef1); p.bezel.material.roughness = 0.35; }
    if (p.mat) p.mat.material.color.set(0xbcdcd6);
    // folders and a clipboard instead of books
    (p.books || []).forEach((b, i) => b.material.color.set([0xf9d77e, 0x9cc7f0, 0xf4a7b9][i % 3]));
    const cbT = k.my.cbT || (k.my.cbT = tex(k, 128, 160, (c) => { c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, 128, 160); txt(c, 'HISTORIA', 10, 16, '800 14px system-ui', '#14776f'); c.strokeStyle = '#cfd6dc'; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(10, 36 + i * 13); c.lineTo(118, 36 + i * 13); c.stroke(); } c.strokeStyle = '#e23a46'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < 12; i++) c.lineTo(12 + i * 9, 120 - Math.abs(Math.sin(i * 1.3)) * 30); c.stroke(); }).tex);
    const cb = new THREE.Group(); cb.position.set(-0.94, 1.235, D + 0.2); cb.rotation.y = 0.12; g.add(cb);
    cb.add(k.box(0.28, 0.012, 0.36, 0, { m: m.wood, cast: false }), k.box(0.12, 0.03, 0.04, 0, { m: m.chrome, y: 0.015, z: -0.16, cast: false }));
    const paper = plane(0.24, 0.3, new THREE.MeshStandardMaterial({ map: cbT, roughness: 0.8 })); paper.rotation.x = -Math.PI / 2; paper.position.set(0, 0.007, 0.01); cb.add(paper);
    // no plant: sanitiser and a box of gloves
    for (const x of p.plant || []) x.visible = false;
    const san = new THREE.Group(); san.position.set(-1.12, 1.04, D - 0.25); g.add(san);
    san.add(k.cyl(0.05, 0.055, 0.19, 0, { m: m.clear, y: 0.095 }), k.cyl(0.045, 0.05, 0.12, 0, { m: m.fluid, y: 0.07 }), k.cyl(0.02, 0.02, 0.05, 0, { m: m.white, y: 0.215 }), k.box(0.06, 0.015, 0.015, 0, { m: m.white, x: 0.025, y: 0.24, cast: false }));
    const gl = new THREE.Group(); gl.position.set(-0.6, 1.04, D + 0.2); gl.rotation.y = -0.2; g.add(gl);
    gl.add(k.box(0.26, 0.1, 0.13, 0, { m: m.white, y: 0.05, cast: false }), k.box(0.262, 0.04, 0.132, 0, { m: k.mat(0x2b6cb0), y: 0.05, cast: false }));
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), k.mat(0x6ea8ff, { roughness: 0.4 })); tuft.scale.set(1.2, 0.6, 0.8); tuft.position.y = 0.11; gl.add(tuft);
    // white exam lamp, teal chair
    if (p.lamp) {
      p.lamp.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) { o.material = o.material.clone(); o.material.color.set(0xeef2f4); o.material.metalness = 0.2; o.material.roughness = 0.3; } });
      // to the far front corner of the desktop, its head turned to the desk and away from the chair
      p.lamp.position.set(0.2, 0, 0.3);
    }
    // the status light's dark stand becomes a white call-light housing with a teal band (the light itself is world.js's)
    for (const o of st.info ? st.info.orb.children : g.children) {
      const q = o.geometry && o.geometry.parameters;
      if (o.isMesh && q && q.radiusTop === 0.07 && q.radiusBottom === 0.09 && Math.abs(o.position.x + 1.15) < 0.01) {
        o.material = m.white;
        const band = k.cyl(0.092, 0.092, 0.025, 0, { m: m.teal, x: o.position.x, y: o.position.y + 0.02, z: o.position.z }); band.castShadow = false; o.parent.add(band);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 24), m.chrome); ring.rotation.x = Math.PI / 2; ring.position.set(o.position.x, o.position.y + 0.11, o.position.z); o.parent.add(ring);
        break;
      }
    }
    if (p.chair) {
      const ch = p.chair.children;
      if (ch[0] && ch[0].material) ch[0].material.color.copy(col.clone().lerp(new THREE.Color(0x103a3f), 0.45));
      if (ch[2] && ch[2].material) ch[2].material.color.set(0xd9e0e4);
    }
    // a prop for the role, where the plant was (back right) and/or front middle
    const R = new THREE.Group(); R.position.set(0, 1.04, D); g.add(R);
    const put = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; R.add(o); return o; };
    if (/verif|diagn|research|investig/i.test(role)) { // microscope
      const ms = new THREE.Group(); const w = m.white, d2 = m.dark;
      ms.add(k.box(0.2, 0.04, 0.26, 0, { m: w, y: 0.02 }), k.box(0.06, 0.32, 0.08, 0, { m: w, y: 0.18, z: -0.09 }), k.box(0.16, 0.02, 0.14, 0, { m: d2, y: 0.17, z: 0.02, cast: false }));
      const tube = k.cyl(0.03, 0.03, 0.2, 0, { m: w, y: 0.36, z: -0.02 }); tube.rotation.x = 0.5; ms.add(tube);
      ms.add(k.cyl(0.02, 0.02, 0.07, 0, { m: d2, y: 0.47, z: -0.08 }), k.cyl(0.045, 0.045, 0.04, 0, { m: m.steel, y: 0.28, z: 0.03 }), k.cyl(0.012, 0.012, 0.06, 0, { m: m.chrome, y: 0.23, z: 0.03 }));
      const knob = k.cyl(0.03, 0.03, 0.12, 0, { m: d2, y: 0.12, z: -0.09 }); knob.rotation.z = Math.PI / 2; ms.add(knob);
      put(ms, 1.05, -0.45, -0.5);
    }
    if (/research|investig/i.test(role)) { // test tube rack and petri dishes
      const rk = new THREE.Group(); rk.add(k.box(0.34, 0.03, 0.1, 0, { m: m.white, y: 0.07 }), k.box(0.34, 0.02, 0.1, 0, { m: m.white, y: 0.01 }));
      [0xe23a46, 0xf5c518, 0x3fa7f5, 0x7c3aed, 0x16a34a].forEach((c, i) => { rk.add(k.cyl(0.016, 0.016, 0.16, 0, { m: m.clear, x: -0.13 + i * 0.065, y: 0.1 }), k.cyl(0.014, 0.014, 0.06, 0, { m: k.mat(c, { roughness: 0.2 }), x: -0.13 + i * 0.065, y: 0.06 }), k.cyl(0.018, 0.018, 0.02, 0, { m: k.mat(c), x: -0.13 + i * 0.065, y: 0.185 })); });
      put(rk, -0.25, 0.22, 0.1);
      for (let i = 0; i < 2; i++) { const pd = k.cyl(0.06, 0.06, 0.015, 0, { m: m.clear, x: 0.1 + i * 0.05, y: 0.01 + i * 0.016, z: 0.2 }); R.add(pd); }
    } else if (/verif|diagn/i.test(role)) { // stethoscope coiled on the desk
      const sc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 28, Math.PI * 1.7), m.dark); sc.rotation.x = -Math.PI / 2; sc.position.set(-0.2, 0.012, 0.22); R.add(sc);
      R.add(k.cyl(0.03, 0.03, 0.02, 0, { m: m.chrome, x: -0.07, y: 0.012, z: 0.2 }));
    } else if (/develop|ciruj/i.test(role)) { // instrument tray with a green towel
      const tr = new THREE.Group(); tr.add(k.box(0.42, 0.025, 0.28, 0, { m: m.steel, y: 0.013 }), k.box(0.3, 0.02, 0.2, 0, { m: m.drapeGreen, y: 0.03, x: 0.03, cast: false }));
      for (let i = 0; i < 4; i++) tr.add(k.box(0.012, 0.01, 0.2, 0, { m: m.chrome, x: -0.12 + i * 0.07, y: 0.045, cast: false }));
      put(tr, -0.2, 0.2, 0.15);
      const sc = new THREE.Group(); sc.add(k.box(0.06, 0.03, 0.04, 0, { m: m.white, y: 0.015 }), k.cyl(0.035, 0.035, 0.12, 0, { m: m.clear, y: 0.09 }));
      put(sc, 1.05, -0.5);
    } else if (/infra|técn|tecn/i.test(role)) { // toolbox and multimeter
      const tb = new THREE.Group(); tb.add(k.box(0.36, 0.16, 0.18, 0, { m: m.red, y: 0.08, r: 0.02 }), k.box(0.2, 0.03, 0.03, 0, { m: m.dark, y: 0.18 }));
      put(tb, 1.0, -0.45, -0.3);
      const mm = new THREE.Group(); mm.add(k.box(0.12, 0.04, 0.2, 0, { m: m.yellow, y: 0.02, r: 0.012 }), k.box(0.08, 0.005, 0.06, 0, { m: k.glow(0x9effc9, 1), y: 0.043, z: -0.05, cast: false }), k.cyl(0.03, 0.03, 0.01, 0, { m: m.dark, y: 0.045, z: 0.04 }));
      put(mm, -0.2, 0.2, 0.3);
      R.add(k.rod(new THREE.Vector3(-0.17, 0.03, 0.3), new THREE.Vector3(0.1, 0.01, 0.38), 0.006, m.red), k.rod(new THREE.Vector3(-0.23, 0.03, 0.3), new THREE.Vector3(0.05, 0.01, 0.42), 0.006, m.dark));
    } else if (/protot|resid/i.test(role)) { // anatomical skull and a fat textbook
      const sk = new THREE.Group(); const bone = k.mat(0xeee3cc, { roughness: 0.6 });
      const cr = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), bone); cr.scale.set(0.9, 0.95, 1.1); cr.position.y = 0.14; sk.add(cr);
      sk.add(k.box(0.12, 0.06, 0.1, 0, { m: bone, y: 0.05, z: 0.03, r: 0.02 }));
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), m.black); e.position.set(s * 0.04, 0.12, 0.085); sk.add(e); }
      put(sk, 1.05, -0.48, -0.4);
      put(new THREE.Group().add(k.box(0.3, 0.09, 0.22, 0, { m: k.mat(0x7a1d2c), y: 0.045 }), k.box(0.29, 0.08, 0.005, 0, { m: m.sheet, y: 0.045, z: 0.11, cast: false })), -0.2, 0.2, 0.2);
    } else if (/review|comit/i.test(role)) { // case files with a stamp
      for (let i = 0; i < 5; i++) R.add(k.box(0.3, 0.03, 0.22, 0, { m: k.mat([0xf9d77e, 0x9cc7f0, 0xf4a7b9, 0xbfe3dd, 0xfde68a][i]), x: -0.2, y: 0.015 + i * 0.032, z: 0.2, cast: false }));
      const stp = new THREE.Group(); stp.add(k.box(0.08, 0.03, 0.05, 0, { m: m.red, y: 0.015 }), k.cyl(0.012, 0.016, 0.06, 0, { m: m.wood, y: 0.06 }), k.cyl(0.022, 0.022, 0.02, 0, { m: m.wood, y: 0.095 }));
      put(stp, 1.05, -0.45);
    } else { // director, head of service, manager, others: stethoscope, pager and a framed photo
      const sc = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 28, Math.PI * 1.6), m.dark); sc.rotation.x = -Math.PI / 2; sc.position.set(-0.2, 0.012, 0.22); R.add(sc);
      R.add(k.cyl(0.028, 0.028, 0.02, 0, { m: m.chrome, x: -0.08, y: 0.012, z: 0.18 }));
      const pg = k.box(0.07, 0.025, 0.1, 0, { m: m.dark, x: 0.0, y: 0.013, z: 0.25, cast: false }); pg.rotation.y = 0.3; R.add(pg);
      const fr = new THREE.Group(); fr.add(k.box(0.2, 0.16, 0.02, 0, { m: m.wood, y: 0.08 }), k.box(0.17, 0.13, 0.005, 0, { m: k.mat(0x9cc7f0), y: 0.08, z: 0.012, cast: false }));
      fr.children[0].rotation.x = -0.15; fr.children[1].rotation.x = -0.15;
      put(fr, 1.05, -0.5, Math.PI - 0.4);
    }
  },

  plate(c, { name, title, color }) {
    c.clearRect(0, 0, 512, 128);
    c.fillStyle = '#ffffff'; rr(c, 2, 2, 508, 124, 18); c.fill();
    c.fillStyle = color; rr(c, 2, 2, 112, 124, 18); c.fill(); c.fillRect(90, 2, 24, 124);
    c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(58, 64, 36, 0, TAU); c.fill();
    crossIcon(c, 58, 64, 44, color);
    c.fillStyle = color; c.fillRect(114, 112, 396, 6);
    txt(c, name, 130, 46, '700 42px system-ui', '#0f2a2f');
    txt(c, title, 130, 92, '600 28px system-ui', color);
  },

  // ------------------------------------------------------------ people
  outfit(k, ch, a) {
    const { mats } = ch, role = (a && a.role) || '', m = M(k);
    const base = new THREE.Color((a && a.color) || '#14a39a'), hsl = {};
    base.getHSL(hsl);
    const scrub = new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.75), 0.5);
    const coat = /product|superadmin|lead|research/i.test(role);
    const visitor = !role;
    if (visitor) { // a visitor from another building: own clothes, a VISITA badge and blue shoe covers
      const vt = k.my.visT || (k.my.visT = tex(k, 64, 96, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 96); c.fillStyle = '#f59e0b'; c.fillRect(0, 0, 64, 30); txt(c, 'VISITA', 32, 16, '800 15px system-ui', '#ffffff', 'center'); c.fillStyle = '#cfd6dc'; c.fillRect(10, 40, 44, 8); c.fillRect(10, 56, 34, 8); }).tex);
      const b = plane(0.09, 0.135, new THREE.MeshStandardMaterial({ map: vt, roughness: 0.5 })); b.position.set(0.13, 0.48, 0.225); ch.upper.add(b);
      const cover = k.mat(0x7fb2e5, { roughness: 0.9 });
      for (const leg of [ch.legL, ch.legR]) { const s = leg.children[2]; if (s && s.children[0]) s.children[0].material = cover; }
      return;
    }
    mats.shirt.color.copy(coat ? new THREE.Color(0xf7f9fa) : scrub);
    mats.shirtDark.color.copy(coat ? new THREE.Color(0xe4e9ec) : scrub.clone().multiplyScalar(0.78));
    mats.pants.color.copy(scrub.clone().multiplyScalar(0.92));
    if (coat) { // long white sleeves, open coat skirt, lapels with the scrub top showing
      for (const arm of [ch.armL, ch.armR]) if (arm.children[1]) arm.children[1].material = mats.shirt;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.37, 0.42, 24, 1, true, 0.55, TAU - 1.1), new THREE.MeshStandardMaterial({ color: 0xf7f9fa, roughness: 0.8, side: THREE.DoubleSide }));
      skirt.position.y = -0.14; ch.wear(ch.upper, skirt);
      const v = new THREE.Shape(); v.moveTo(-0.1, 0.0); v.lineTo(0.1, 0.0); v.lineTo(0, -0.24); v.closePath();
      const vee = new THREE.Mesh(new THREE.ShapeGeometry(v), new THREE.MeshStandardMaterial({ color: scrub, roughness: 0.9 })); vee.position.set(0, 0.69, 0.218); vee.rotation.x = -0.2; ch.upper.add(vee);
      for (const s of [-1, 1]) { const lap = k.box(0.05, 0.3, 0.02, 0, { m: mats.shirtDark, x: s * 0.075, y: 0.56, z: 0.222, cast: false }); lap.rotation.z = s * 0.32; lap.rotation.x = -0.12; ch.upper.add(lap); }
      for (let i = 0; i < 3; i++) { const bt = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), m.offwhite); bt.position.set(0.03, 0.36 - i * 0.12, 0.222); ch.upper.add(bt); }
      ch.upper.add(k.box(0.12, 0.1, 0.012, 0, { m: mats.shirtDark, x: -0.13, y: 0.24, z: 0.215, cast: false }));
    } else { // scrubs: V-neck, chest pocket with a pen; surgical cap with the hair tucked in
      const v = new THREE.Shape(); v.moveTo(-0.07, 0.0); v.lineTo(0.07, 0.0); v.lineTo(0, -0.12); v.closePath();
      const vee = new THREE.Mesh(new THREE.ShapeGeometry(v), mats.skin); vee.position.set(0, 0.665, 0.2); vee.rotation.x = -0.35; ch.upper.add(vee);
      ch.upper.add(k.box(0.11, 0.1, 0.012, 0, { m: mats.shirtDark, x: -0.12, y: 0.48, z: 0.215, cast: false }), k.box(0.012, 0.06, 0.012, 0, { m: m.dark, x: -0.1, y: 0.54, z: 0.222, cast: false }));
      for (const h of ch.hair || []) h.visible = false;
      const pat = k.my.capT || (k.my.capT = (() => { const t = tex(k, 128, 128, paintCapPattern).tex; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.5); return t; })());
      // a bouffant cap in a deep, saturated version of the agent's colour (never a skin tone), wider than the head,
      // with a darker band at the brow, so it reads as fabric
      let capC;
      if (/develop|ciruj/i.test(role)) capC = new THREE.Color(0x2f7fc4);
      else { const skinish = hsl.h > 0.02 && hsl.h < 0.13; capC = new THREE.Color().setHSL(skinish ? 0.045 : hsl.h, skinish ? 0.9 : Math.max(0.6, hsl.s), skinish ? 0.45 : 0.42); }
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.355, 28, 14, 0, TAU, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: capC, map: pat, roughness: 0.92 }));
      cap.rotation.x = -0.28; cap.position.y = 0.02; cap.scale.set(1.1, 1.14, 1.1); ch.wear(ch.head, cap);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 8, 32), new THREE.MeshStandardMaterial({ color: capC.clone().multiplyScalar(0.62), roughness: 0.9 }));
      band.rotation.x = Math.PI / 2 - 0.28; band.position.set(0, 0.05, -0.02); band.scale.set(1.08, 1.0, 1.02); ch.head.add(band);
      const tie = k.box(0.05, 0.12, 0.02, 0, { m: band.material, y: -0.02, z: -0.33, cast: false }); tie.rotation.x = 0.4; ch.head.add(tie);
    }
    // stethoscope round the neck
    if (/product|lead|verif|protot|superadmin/i.test(role)) {
      const tubeM = k.mat(0x22303a, { roughness: 0.35 });
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.016, 6, 24, Math.PI), tubeM); arc.rotation.x = -Math.PI / 2; arc.position.y = 0.7; arc.scale.set(1, 0.85, 1); ch.upper.add(arc);
      for (const s of [-1, 1]) { ch.upper.add(k.rod(new THREE.Vector3(s * 0.2, 0.7, 0), new THREE.Vector3(s * 0.2, 0.6, 0.2), 0.014, tubeM), k.rod(new THREE.Vector3(s * 0.2, 0.6, 0.2), new THREE.Vector3(s * 0.12, 0.4, 0.24), 0.014, tubeM)); }
      const bell = k.cyl(0.04, 0.04, 0.025, 0, { m: m.chrome, x: 0.12, y: 0.38, z: 0.25 }); bell.rotation.x = Math.PI / 2; ch.upper.add(bell);
      ch.upper.add(k.cyl(0.012, 0.012, 0.05, 0, { m: m.chrome, x: -0.12, y: 0.38, z: 0.245 }));
    }
    // surgeons: a mask hanging at the neck and blue gloves
    if (/develop|ciruj/i.test(role)) {
      const mask = k.box(0.24, 0.12, 0.025, 0, { m: k.mat(0x9cc7f0, { roughness: 0.95 }), y: 0.62, z: 0.215, r: 0.01, cast: false }); mask.rotation.x = -0.3; ch.upper.add(mask);
      for (const s of [-1, 1]) ch.upper.add(k.rod(new THREE.Vector3(s * 0.12, 0.63, 0.2), new THREE.Vector3(s * 0.19, 0.7, 0.05), 0.006, m.white));
      const glove = k.mat(0x5b8def, { roughness: 0.4 });
      for (const arm of [ch.armL, ch.armR]) if (arm.children[2]) arm.children[2].material = glove;
    }
    // ID badge on the chest (the role colour on top)
    const bt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.105, 0.008), [m.white, m.white, m.white, m.white, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, map: (k.my.idT || (k.my.idT = tex(k, 64, 96, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 96); c.fillStyle = '#14a39a'; c.fillRect(0, 0, 64, 22); c.fillStyle = '#cbd5db'; c.beginPath(); c.arc(32, 46, 13, 0, TAU); c.fill(); c.fillRect(10, 68, 44, 7); c.fillRect(14, 80, 36, 6); }).tex)) }), m.white]);
    bt.position.set(0.13, 0.47, 0.228); ch.upper.add(bt);
    // clogs
    const clog = k.mat(coat ? 0xf3f5f6 : scrub.clone().lerp(new THREE.Color(0xffffff), 0.35), { roughness: 0.4 });
    for (const leg of [ch.legL, ch.legR]) { const s = leg.children[2]; if (s && s.children[0]) s.children[0].material = clog; }
  },

  // ------------------------------------------------------------ light
  daylight(k, f, gold) {
    const { scene, hemi, sun, mix: C } = k;
    scene.background = C(0x050a14, 0xd3e4ec, f).lerp(new THREE.Color(0xf2c29a), gold * 0.35);
    if (scene.fog) scene.fog.color.copy(scene.background);
    // night is a real night shift: ambient and sun cut hard, the room lit by its own warm pools (station, bay, signs)
    hemi.intensity = 0.32 + f * 1.1;
    hemi.color = C(0x7f93c8, 0xffffff, f);
    hemi.groundColor = C(0x141c26, 0x6f8580, f);
    sun.intensity = 0.15 + f * 2.2;
    sun.color = C(0x8798d8, 0xfff7ec, f).lerp(new THREE.Color(0xffa766), gold * 0.5);
    sun.position.set(-9 - gold * 5, 16 - gold * 7, 11);
    scene.environmentIntensity = 0.06 + f * 0.36;
    if (k.my.windowMat) {
      const night = f < 0.45, want = night ? k.my.skyNight : k.my.skyDay;
      if (want && k.my.windowMat.map !== want) { k.my.windowMat.map = want; k.my.windowMat.needsUpdate = true; }
      k.my.windowMat.color = night ? new THREE.Color(0.85, 0.85, 0.9) : C(0xb8c4e0, 0xffffff, f);
    }
    for (const [l, night, day] of k.my.lamps || []) l.intensity = night + (day - night) * f;
    if (k.my.spot) k.my.spot.intensity = 30 - f * 8;
    // the whiteboard's white face stays just under the glow threshold at night
    if (k.my.traceMesh) k.my.traceMesh.material.color.setScalar(0.86 + 0.12 * f);
  },

  // ------------------------------------------------------------ animation
  layout(k) { // the operating island in the middle gives way to the centre desk when someone sits there
    if (k.my.island) k.my.island.visible = !k.centre();
  },
  tick(k, dt, t) {
    const my = k.my;
    // monitors: the sweeping traces, about 25 updates a second
    if (!my.vAt || t - my.vAt > 0.04) {
      my.vAt = t;
      if (my.vitDraw) { my.vitDraw(t); my.vit.tex.needsUpdate = true; }
      if (my.ecgDraw) { my.ecgDraw(t); my.ecg.tex.needsUpdate = true; }
      if (my.defibDraw) { my.defibDraw(t); my.defib.tex.needsUpdate = true; }
    }
    // the vital-sign numbers drift a little every 3 s
    if (my.vit && (!my.nAt || t - my.nAt > 3)) { my.nAt = t; const hr = 70 + Math.round(Math.sin(t * 0.37) * 3 + Math.sin(t * 1.3)); paintVitalsNumbers(my.vit.ctx, hr, 98 + (Math.sin(t * 0.21) > 0.6 ? 1 : 0), 34 + Math.round(Math.sin(t * 0.5) * 2)); }
    // breathing bellows (16 a minute), the drip, the pump LED, the robot's beacon
    if (my.bellows) my.bellows.scale.y = 0.2 + 0.12 * (0.5 + 0.5 * Math.sin((t / 3.75) * TAU));
    if (my.drop) { const p = (t * 1.1) % 1; my.drop.position.y = 1.81 - p * 0.05; my.drop.visible = p < 0.85; }
    if (my.pumpLed) my.pumpLed.visible = (t % 1.6) < 0.25;
    if (my.beacon) my.beacon.material.color.setScalar(0).setRGB(2 * (0.35 + 0.65 * Math.max(0, Math.sin(t * 6))), 1.3 * (0.35 + 0.65 * Math.max(0, Math.sin(t * 6))), 0.1);
    // once a second: "QUIRÓFANO EN USO" lights while anyone works, the OR panel clock, the island's place
    if (!my.sAt || t - my.sAt > 1) {
      my.sAt = t;
      let busy = false;
      for (const d of k.desks()) if (d.agent && d.agent.online && d.agent.status === 'working') { busy = true; break; }
      if (my.usoMat && my.usoBusy !== busy) {
        my.usoBusy = busy; my.usoMat.map = my.usoTex[busy ? 1 : 0]; my.usoMat.color.setScalar(busy ? 2.1 : 1); my.usoMat.needsUpdate = true;
        if (my.usoGlow) my.usoGlow.visible = busy; if (my.usoLight) my.usoLight.intensity = busy ? 2.5 : 0;
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
      if (my.island) {
        // one row of desks: big and central; two rows: further forward; three: small, at the front edge
        const fz = k.frontZ(), z = fz < 0 ? ISLAND.z : fz < 3 ? fz + 3.9 : Math.min(7.3, fz + 1.8), s = fz < 0 ? 1.15 : fz < 3 ? 1.0 : 0.85;
        my.island.position.z = z; my.island.scale.setScalar(s);
        for (const o of my.crowd || []) o.visible = fz < 3; // free the front aisle of a third row
        if (my.greenLab) my.greenLab.visible = fz < 0; // the island moves over it with more rows
      }
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
