// The 3D office: room, one station per teammate, animated characters, wall screens.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { themeById, DEFAULT_THEME } from './themes/index.js';

const BACK_Z = -9, LEFT_X = -13, DESK_Z = -5.4, SEAT_Z = -6.55, AISLE_Z = -3.3, WALL_H = 7.2, ROW_D = 4.4;
const STAND_Y = 0.53, SEAT_Y = 0.72;
const STATUS_COLOR = { working: 0x34d399, idle: 0xa3aec4, blocked: 0xfbbf24, offline: 0x3a4256 };
const STATUS_TEXT = { working: 'working', idle: 'idle', blocked: 'needs you', offline: 'offline' };
const LOOKS = {
  'lucia-product': { skin: 0xe8b894, hair: 0x3b2416, style: 'long' },
  'daniel-dev': { skin: 0x8d5a3b, hair: 0x17110e, style: 'short' },
  'marta-qa': { skin: 0xf0c7a4, hair: 0xa3482a, style: 'bun' },
  'kenji-infra': { skin: 0xe6bd98, hair: 0x15151a, style: 'fringe', glasses: true },
};
const FALLBACK_LOOKS = [
  { skin: 0xe8b894, hair: 0x2a1c14, style: 'short' }, { skin: 0xc68a5e, hair: 0x101014, style: 'long' },
  { skin: 0xf0c7a4, hair: 0xc9a15a, style: 'bun' }, { skin: 0x7a4b30, hair: 0x0e0e10, style: 'fringe', glasses: true },
];
const GLYPHS = [[/product/i, ['✎', '☑', '◆']], [/dev/i, ['</>', '{ }', '#']], [/verif|qa/i, ['✓', '◎', '✗']], [/infra|platform/i, ['☁', '⚙', '▲']]];

// What someone is doing, read from their latest tool calls. It decides where they are and how they move:
// code = typing at the desk, read = leaning back reading, call = on the phone (mail, chat),
// plan = standing at the wall board (cards, plans), verify = at the whiteboard (tests, checks).
const KIND_RULES = [
  ['verify', /playwright|browser|screenshot|verif|pytest|jest|vitest|e2e|\bqa\b|\btests?\b/i],
  ['call', /gmail|e-?mail|whatsapp|slack|calendar|draft|inbox|granola/i],
  ['plan', /jira|atlassian|confluence|\bcards?\b|tickets?|\bplan|board|\bspec\b|clients?\.json|register/i],
  ['read', /^(read|grep|glob|websearch|webfetch|search)\b|reading|searching|exploring/i],
];
const PLACE = { plan: 'board', verify: 'white' };
function workKind(a) {
  if (a.status !== 'working') return 'code';
  const recent = (a.activity || []).filter((x) => x.kind === 'tool' && Date.now() - x.ts < 180000).slice(-5);
  const votes = {};
  for (const x of recent) {
    const text = `${x.tool || ''} ${x.text || ''}`, hit = KIND_RULES.find(([, re]) => re.test(text));
    const k = hit ? hit[0] : 'code';
    votes[k] = (votes[k] || 0) + 1;
  }
  let best = 'code', n = 0;
  for (const k in votes) if (votes[k] > n) { best = k; n = votes[k]; }
  return best;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...o });
function box(w, h, d, color, { x = 0, y = 0, z = 0, r = 0, m, cast = true } = {}) {
  const g = r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m || mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}
function cyl(rt, rb, h, color, { x = 0, y = 0, z = 0, m, seg = 20 } = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m || mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function surface(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, '…'); }
  return lines;
}
const hashOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const ago = (ms) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (c) => `#${new THREE.Color(c).getHexString()}`;

export function createWorld(sceneEl, labelsEl, { onSelect, format, onBoard, theme: th }) {
  const theme = th && th.base ? th : themeById(th || DEFAULT_THEME); // the look of the room: themes/index.js
  const title = theme.title, texts = theme.texts;
  const escText = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const fmt = format || escText;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme.exposure != null ? theme.exposure : 1.08;
  sceneEl.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer({ element: labelsEl });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1022);
  scene.fog = new THREE.Fog(0x0b1022, 45, 95);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  const HOME = { pos: new THREE.Vector3(5.5, 15.5, 25.5), target: new THREE.Vector3(-1.2, 1.2, -1.6) };
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.48;
  controls.minDistance = 5;
  controls.maxDistance = 42;
  controls.screenSpacePanning = false;
  // Touch screens (phone.js sets the classes): one finger turns the room, two fingers move over the floor and pinch to zoom.
  const TOUCH = document.documentElement.classList.contains('touch'), PHONE = document.documentElement.classList.contains('phone');
  const HOME_TALL = { pos: new THREE.Vector3(19.5, 26, 22), target: new THREE.Vector3(1.9, 0.6, 0.3) }; // phone held upright: from the open corner, high up, so no wall stands in front and the whole room fits
  let tall = false, inset = 0;
  const home = () => (PHONE && tall ? HOME_TALL : HOME);
  if (TOUCH) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }; controls.maxDistance = 60; controls.panSpeed = 1.1; }
  if (PHONE) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // a phone screen is small: this is a third fewer pixels to fill than 1.75 and looks the same
  // Two fingers move the room; the zoom only joins in once they clearly pinch (more than the wobble of two fingers dragging together).
  if (TOUCH && controls._handleTouchMoveDolly && controls._getSecondPointerPosition) {
    const dolly = controls._handleTouchMoveDolly.bind(controls);
    let d0 = 0, pinching = false;
    const reset = () => { d0 = 0; pinching = false; };
    for (const ev of ['pointerdown', 'pointerup', 'pointercancel']) renderer.domElement.addEventListener(ev, reset, true);
    controls._handleTouchMoveDolly = (event) => {
      const q = controls._getSecondPointerPosition(event), d = Math.hypot(event.pageX - q.x, event.pageY - q.y);
      if (!pinching) { if (!d0) d0 = d; controls._dollyStart.set(0, d); if (Math.abs(d - d0) < Math.max(26, d0 * 0.16)) return; pinching = true; }
      dolly(event);
    };
  }

  // ---------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a3b33, 1.6);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-9, 16, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 16, bottom: -16, near: 1, far: 50 });
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(hemi, sun);
  let lightMode = 'auto', dayNow = -1;
  const C = (a, b, f) => new THREE.Color(a).lerp(new THREE.Color(b), f);
  function dayFactor() {
    if (lightMode !== 'auto') return lightMode === 'day' ? 1 : 0;
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    return Math.min(smooth(6.5, 8.5, h), 1 - smooth(18, 20.5, h));
  }
  function applyLight() {
    const f = dayFactor();
    if (Math.abs(f - dayNow) < 0.002) return;
    dayNow = f;
    const gold = lightMode === 'auto' ? Math.max(0, 1 - Math.abs(f - 0.45) / 0.45) : 0; // sunrise and sunset
    hook('daylight', f, gold); // sky, fog, sun, ambient and the room's own lamps (themes/oficina.js)
    for (const s of stations.values()) s.lamp.intensity = s.online ? 10 - f * 7 : 0;
  }

  // wall clock: shows the real time
  const wallClock = surface(256, 256);
  let clockMinute = -1;
  function drawClock() {
    const d = new Date();
    if (d.getMinutes() === clockMinute) return;
    clockMinute = d.getMinutes();
    const c = wallClock.ctx;
    if (theme.clockFace) { try { theme.clockFace(c, d); wallClock.tex.needsUpdate = true; return; } catch (e) { console.warn('theme clockFace', e); } }
    c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#23283a'; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6, big = i % 3 === 0;
      c.lineWidth = big ? 7 : 3;
      c.beginPath(); c.moveTo(128 + Math.sin(a) * (big ? 94 : 100), 128 - Math.cos(a) * (big ? 94 : 100)); c.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112); c.stroke();
    }
    const hand = (a, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); c.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 58, 10, '#23283a');
    hand(d.getMinutes() * (Math.PI / 30), 88, 6, '#23283a');
    c.fillStyle = '#fb7185'; c.beginPath(); c.arc(128, 128, 9, 0, 7); c.fill();
    wallClock.tex.needsUpdate = true;
  }
  drawClock();

  // ---------------------------------------------------------------- room
  // The room itself comes from the theme (themes/index.js has the contract; themes/oficina.js is the default look).
  const room = new THREE.Group();
  scene.add(room);
  const myTheme = {};
  // The centre desk (theme.centre): one person, by role, sits in the open floor in the middle of the room instead of
  // in the rows. Its place can follow the number of rows: x, z and yaw may be numbers or functions of `rows`.
  const CENTRE = theme.centre ? { roles: ['Product', 'Lead'], side: 1.9, lift: 0, foot: { x0: -1.55, x1: 1.55, z0: -1.85, z1: 0.85 }, ...theme.centre } : null;
  if (CENTRE) CENTRE.side = Math.max(CENTRE.side, CENTRE.foot.x1 + 0.4); // the step beside the desk is outside its footprint
  // The coffee spot: idle people walk there, stand with a mug for a while and go back (theme.spots.coffee may move it).
  const tc = theme.spots && theme.spots.coffee;
  const COFFEE = tc ? { x: 9.3, z: 0.7, yaw: Math.PI / 2, ...tc } : { x: 9.3, z: 0.7, yaw: Math.PI / 2 };
  // Areas of the open floor nobody walks through: the centre desk and whatever the theme blocks (k.block). Each is a
  // rectangle in world x/z; people walk around it with a body's width to spare.
  const BODY = 0.3, blocks = [];
  let obs = [], centreFoot = null;
  const rect = (x0, z0, x1, z1) => {
    const r = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
    r.ex = { x0: r.x0 - BODY, z0: r.z0 - BODY, x1: r.x1 + BODY, z1: r.z1 + BODY };
    return r;
  };
  const rebuildObs = () => { obs = centreFoot ? [...blocks, centreFoot] : blocks.slice(); };
  const k = {
    THREE, scene, room, renderer, camera, hemi, sun, PHONE, TOUCH, texts, title, base: theme.base, my: myTheme,
    C: { BACK_Z, LEFT_X, RIGHT_X: 13, FRONT_Z: 9, WALL_H, DESK_Z, SEAT_Z, AISLE_Z, ROW_D },
    mat, box, cyl, rod: (a, b, r, m) => rod(a, b, r, m), surface, wrap, hex, smooth, hashOf, mix: C,
    glow: (color, n = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(n), toneMapped: false }),
    dayFactor,
    desks: () => { try { return [...stations.values()].map((s) => (s.centre ? { slug: s.slug, agent: s.agent, ...xz(deskAt(s)), row: -1, centre: true, yaw: s.yaw, lift: s.lift } : { slug: s.slug, agent: s.agent, x: s.x, z: DESK_Z + s.z, row: s.row })); } catch { return []; } },
    frontZ: () => { try { return zA(lastAisle()); } catch { return AISLE_Z; } },
    centre: () => { try { const s = [...stations.values()].find((x) => x.centre); return s ? { slug: s.slug, agent: s.agent, ...xz(deskAt(s)), yaw: s.yaw, lift: s.lift } : null; } catch { return null; } },
    // k.block(x0, z0, x1, z1) returns a handle: h.set(x0, z0, x1, z1) moves the area, h.set() takes it away
    block: (x0, z0, x1, z1) => {
      const h = { r: null, set(a, b, c, d) {
        const i = blocks.indexOf(h.r); if (i >= 0) blocks.splice(i, 1);
        h.r = [a, b, c, d].every(Number.isFinite) ? rect(a, b, c, d) : null; if (h.r) blocks.push(h.r);
        rebuildObs(); return h;
      } };
      return h.set(x0, z0, x1, z1);
    },
    spots: { board: { x: LEFT_X + 1.5, z: -2.1 }, white: { x: 8.54, z: 6.58 }, coffee: { x: COFFEE.x, z: COFFEE.z, yaw: COFFEE.yaw } },
  };
  const xz = (v) => ({ x: v.x, z: v.z });
  const hookFail = new Set();
  function hook(name, ...args) { // a theme part that throws is skipped (and said once), the room keeps working
    const fn = theme[name];
    if (typeof fn !== 'function') return undefined;
    try { return fn.call(theme, k, ...args); } catch (e) { if (!hookFail.has(name)) { hookFail.add(name); console.warn(`theme ${theme.id}: ${name}`, e); } return undefined; }
  }
  hook('shell');
  hook('decor');
  // the wall clock in the back corner: shows the real time
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.56, 40), new THREE.MeshBasicMaterial({ map: wallClock.tex, toneMapped: false }));
  clockFace.position.set(-11.75, 4.55, BACK_Z + 0.075);
  const clockRim = cyl(0.62, 0.62, 0.07, 0x23283a, { x: -11.75, y: 4.55, z: BACK_Z + 0.035, seg: 40 });
  clockRim.rotation.x = Math.PI / 2;
  room.add(clockRim, clockFace);

  // team board (left wall) + traceability whiteboard (free standing)
  let boardMesh = null, traceMesh = null;
  const fx = {}; // the frames a theme may restyle (hook 'fixtures')
  const board = surface(1600, 800);
  {
    const m = boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.1), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false }));
    m.rotation.y = Math.PI / 2; m.position.set(LEFT_X + 0.1, 3.55, -3.2);
    fx.board = { mesh: m, frame: box(0.1, 4.3, 8.4, 0x23283a, { x: LEFT_X + 0.04, y: 3.55, z: -3.2, cast: false }) };
    room.add(m, fx.board.frame);
  }
  const traceBoard = surface(1000, 640);
  {
    const g = new THREE.Group();
    const m = traceMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.5), new THREE.MeshBasicMaterial({ map: traceBoard.tex, toneMapped: false }));
    m.position.set(0, 2.35, 0.06);
    const frame = box(4.1, 2.7, 0.1, 0xd9dde6, { y: 2.35 }), legs = [cyl(0.05, 0.05, 2.2, 0x8891a5, { x: -1.8, y: 1.1 }), cyl(0.05, 0.05, 2.2, 0x8891a5, { x: 1.8, y: 1.1 }),
      box(0.12, 0.08, 1.1, 0x8891a5, { x: -1.8, y: 0.04 }), box(0.12, 0.08, 1.1, 0x8891a5, { x: 1.8, y: 0.04 })];
    g.add(m, frame, ...legs);
    g.position.set(9.4, 0, 5.6); g.rotation.y = -0.72;
    room.add(g);
    fx.trace = { group: g, mesh: m, frame, legs };
  }
  fx.clock = { face: clockFace, rim: clockRim };
  hook('fixtures', fx);
  // The wall board. Cards and filter chips are clickable: every rectangle drawn is kept in boardHits
  // (canvas coordinates) and a click on the wall is matched against them.
  let boardHits = [], boardModel = null, boardLast = null;
  // Columns with more cards than fit scroll: the wheel over the column, or a finger dragged along it (see boardColAt).
  // boardScroll: where each column is going (in cards); boardAt: where it is drawn right now, gliding there (tickBoard).
  const boardScroll = new Map(), boardAt = new Map(); let boardCols = [], redrawBoard = () => {}, boardT = 0;
  const scrollOf = (id, len, shown) => {
    const max = Math.max(0, len - shown), t = Math.max(0, Math.min(max, boardScroll.get(id) || 0)); boardScroll.set(id, t);
    const d = Math.max(0, Math.min(max, boardAt.has(id) ? boardAt.get(id) : t)); boardAt.set(id, d); return d;
  };
  function tickBoard() {
    const now = performance.now(), dt = Math.min(0.1, (now - boardT) / 1000); boardT = now; let moved = false;
    for (const c of boardCols) {
      const t = boardScroll.get(c.id) || 0, d = boardAt.has(c.id) ? boardAt.get(c.id) : t;
      if (Math.abs(t - d) > 0.004) { boardAt.set(c.id, Math.abs(t - d) < 0.012 ? t : d + (t - d) * Math.min(1, dt * 12)); moved = true; }
    }
    if (moved) redrawBoard();
  }
  const moreText = (up, down) => [(up = Math.round(up)) > 0 ? `↑ ${up}` : '', (down = Math.round(down)) > 0 ? `↓ ${down} more` : ''].filter(Boolean).join('    ');
  function drawBoard(agents, jira) {
    redrawBoard = () => drawBoard(agents, jira); boardCols = [];
    boardLast = [agents, jira];
    const g = board.ctx, W = 1600, H = 800, M = boardModel || {};
    boardHits = [];
    const bs = theme.boardStyle || {};
    g.fillStyle = bs.bg || '#10131f'; g.fillRect(0, 0, W, H);
    g.fillStyle = bs.ink || '#eceff7'; g.font = '600 40px system-ui'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(texts.board, 44, 56);
    // text cut to a width, with an ellipsis
    const fit = (text, maxW) => {
      text = String(text || '');
      if (g.measureText(text).width <= maxW) return text;
      while (text.length > 1 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
      return text.trimEnd() + '…';
    };
    // filter chips, right of the title (a theme's longer title pushes them right)
    let cx = Math.max(276, Math.ceil(44 + g.measureText(texts.board).width + 20)); const cx0 = cx;
    g.font = '600 21px system-ui';
    for (const c of M.chips || []) {
      const label = `${c.label} ${c.n}`, w = g.measureText(label).width + 30;
      g.fillStyle = c.on ? '#3b4a8a' : '#1b2031'; g.beginPath(); g.roundRect(cx, 36, w, 40, 20); g.fill();
      if (c.on) { g.strokeStyle = '#7c9cff'; g.lineWidth = 2; g.stroke(); }
      g.fillStyle = c.on ? '#fff' : '#9aa5bd'; g.fillText(label, cx + 15, 57);
      boardHits.push({ x: cx, y: 30, w, h: 52, id: `filter:${c.id}` });
      cx += w + 10;
    }
    if (!(M.chips || []).length) { g.fillStyle = '#7f8aa3'; g.font = '26px system-ui'; g.fillText(texts.boardSub || 'open cards by who has to move them', cx0 - 6, 59); }
    const TONE = { approval: ['#ddd6fe', '#5b21b6'], waiting: ['#fde68a', '#8a6a12'], caught: ['#fecaca', '#991b1b'], working: ['#d9f99d', '#3f6212'], idle: ['#fff3c4', '#7a6a2c'], done: ['#dcfce7', '#166534'] };
    const card = (t, x, y, w, tone) => {
      const [bg, fg] = TONE[tone] || TONE.idle;
      g.fillStyle = bg; g.beginPath(); g.roundRect(x, y, w, 102, 10); g.fill();
      if (M.selected === t.key) { g.strokeStyle = '#7c9cff'; g.lineWidth = 5; g.stroke(); }
      g.fillStyle = '#1f2433'; g.font = '700 21px Menlo, monospace'; g.fillText(t.key, x + 10, y + 22);
      const kw = g.measureText(t.key).width;
      const tag = tone === 'approval' ? 'your approval' : tone === 'waiting' ? 'waiting' : tone === 'caught' ? '⚡ stopped' : tone === 'working' ? 'working' : (t.status || '');
      g.fillStyle = fg; g.font = '19px system-ui'; g.textAlign = 'right'; g.fillText(fit(tag, w - 36 - kw), x + w - 10, y + 22); g.textAlign = 'left';
      g.fillStyle = '#2b3142'; g.font = '21px system-ui';
      wrap(g, t.summary || t.title || '', w - 22, 2).forEach((l, j) => g.fillText(l, x + 10, y + 54 + j * 26));
      boardHits.push({ x, y, w, h: 102, id: `card:${t.key}` });
    };
    if (M.flat) { // finished cards: no holder any more, so one plain grid
      const cols = 5, cw = (W - 88 - (cols - 1) * 16) / cols, rows = 6, max = cols * rows;
      const rowsAll = Math.ceil(M.flat.length / cols), offR = scrollOf('@flat', rowsAll, rows), o0 = Math.floor(offR), fr = offR - o0, off = Math.round(offR) * cols; boardCols.push({ id: '@flat', x: 44, y: 100, w: W - 88, h: H - 100, len: rowsAll, shown: rows });
      g.save(); g.beginPath(); g.rect(0, 92, W, rows * 114 + 4); g.clip(); // rows slide behind the grid's own window
      M.flat.slice(o0 * cols, o0 * cols + max + cols).forEach((t, i) => card(t, 44 + (i % cols) * (cw + 16), 100 + (Math.floor(i / cols) - fr) * 114, cw, 'done'));
      g.restore();
      if (M.flat.length > max) { g.fillStyle = '#7f8aa3'; g.font = '24px system-ui'; g.textAlign = 'right'; g.fillText(moreText(off, M.flat.length - max - off), W - 44, 57); g.textAlign = 'left'; }
      if (!M.flat.length) { g.fillStyle = '#5d6780'; g.font = '26px system-ui'; g.fillText('Nothing finished in this period.', 44, 150); }
      board.tex.needsUpdate = true; return;
    }
    const n = Math.max(1, agents.length), bands = n <= 6 ? 1 : 2, per = Math.ceil(n / bands);
    const cw = (W - 88 - (per - 1) * 20) / per, bh = (H - 122 - (bands - 1) * 18) / bands, shown = bands === 1 ? 5 : 2;
    agents.forEach((a, i) => {
      const tickets = M.show ? a.tickets.filter((t) => M.show.has(t.key)) : a.tickets;
      const x = 44 + (i % per) * (cw + 20), y0 = 100 + Math.floor(i / per) * (bh + 18);
      g.save(); g.beginPath(); g.roundRect(x, y0, cw, bh, 18); g.clip();
      g.fillStyle = '#191d2c'; g.fillRect(x, y0, cw, bh);
      g.fillStyle = a.color; g.fillRect(x, y0, cw, 66);
      const count = String(tickets.length);
      g.fillStyle = '#fff'; g.font = '700 27px system-ui';
      const cwid = g.measureText(count).width;
      g.textAlign = 'right'; g.fillText(count, x + cw - 16, y0 + 24); g.textAlign = 'left';
      g.fillText(fit(a.name.replace(/\s*\(temp\)/i, '').split(' ').slice(0, a.temp ? 2 : 1).join(' '), cw - 44 - cwid), x + 16, y0 + 24);
      g.font = '500 19px system-ui'; g.globalAlpha = 0.85;
      g.fillText(fit(title(a.role), cw - 32), x + 16, y0 + 49); g.globalAlpha = 1;
      if (!tickets.length) {
        g.fillStyle = '#5d6780'; g.font = '22px system-ui';
        g.fillText(fit(jira && jira.error ? 'Jira not reachable' : M.show ? 'None' : texts.noCards || 'No open cards', cw - 32), x + 16, y0 + 102);
      }
      const off = scrollOf(a.slug, tickets.length, shown); boardCols.push({ id: a.slug, x, y: y0, w: cw, h: bh, len: tickets.length, shown });
      const o0 = Math.floor(off), fr = off - o0;
      g.save(); g.beginPath(); g.rect(x, y0 + 72, cw, shown * 114 - 2); g.clip(); // cards slide behind the column's own window
      tickets.slice(o0, o0 + shown + 1).forEach((t, k) => card(t, x + 12, y0 + 80 + (k - fr) * 114, cw - 24, (M.tone && M.tone[t.key]) || 'idle'));
      g.restore();
      if (tickets.length > shown) { g.fillStyle = '#7f8aa3'; g.font = '20px system-ui'; g.fillText(moreText(off, tickets.length - shown - off), x + 16, y0 + bh - 20); }
      g.restore();
    });
    board.tex.needsUpdate = true;
  }
  let traceHash = '';
  function drawTrace(trace) {
    const th = JSON.stringify(trace || null);
    if (th === traceHash) return;
    traceHash = th;
    const g = traceBoard.ctx, W = 1000, H = 640, ts = theme.traceStyle || {};
    g.fillStyle = ts.bg || '#fbfbf8'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = ts.ink || '#1f2433'; g.font = '600 38px system-ui';
    const t = trace && trace[0];
    g.fillText(t ? `${texts.trace} · ${t.project}` : texts.traceEmpty, 40, 58);
    if (!t) { g.fillStyle = '#8891a5'; g.font = '28px system-ui'; const th = texts.traceHint || ['This team has no matrix yet.', 'Click the board to show another team\'s.']; g.fillText(th[0] || '', 40, 130); g.fillText(th[1] || '', 40, 172); traceBoard.tex.needsUpdate = true; return; }
    g.fillStyle = '#6b7489'; g.font = '26px system-ui';
    g.fillText(`${t.total} active requirements · ${t.noVerif} without a verification ticket`, 40, 108);
    const rows = [['To develop', t.counts.todo, '#94a3b8'], ['In development', t.counts.doing, '#2563eb'], ['Implemented', t.counts.built, '#d97706'], ['Verified', t.counts.verified, '#16a34a'], ['Other', t.counts.other, '#c4c9d6']];
    rows.forEach(([name, v, c], i) => {
      const y = 180 + i * 84;
      g.fillStyle = ts.ink || '#1f2433'; g.font = '28px system-ui'; g.fillText(name, 40, y);
      g.fillStyle = '#eceef3'; g.beginPath(); g.roundRect(300, y - 20, 560, 40, 10); g.fill();
      if (v) { g.fillStyle = c; g.beginPath(); g.roundRect(300, y - 20, Math.max(14, 560 * v / Math.max(1, t.total)), 40, 10); g.fill(); }
      g.fillStyle = ts.ink || '#1f2433'; g.font = '600 30px system-ui'; g.fillText(String(v), 884, y);
    });
    g.fillStyle = '#8891a5'; g.font = '22px system-ui';
    g.fillText(`local copy built ${String(t.built || '').replace('T', ' ')}`, 40, H - 36);
    traceBoard.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- stations + characters
  // a thin bar between two points (lamp arms, pens)
  function rod(a, b, r, m) {
    const dir = b.clone().sub(a), mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), m);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    return mesh;
  }
  const stations = new Map();
  const pickables = [], zaps = [], ZAP_WARN = 2.4;
  // The wall board and the whiteboard are clickable too: they zoom the camera in.
  boardMesh.userData.slug = '@board'; traceMesh.userData.slug = '@trace';
  pickables.push(boardMesh, traceMesh);
  const SPOTS = {
    '@board': [new THREE.Vector3(-1.2, 4.7, -2.0), new THREE.Vector3(-12.9, 3.5, -2.0)], // off-centre: the roster and feed sit on the left
    '@trace': [new THREE.Vector3(4.87, 3.1, 9.86), new THREE.Vector3(8.95, 2.35, 5.2)], // pulled back and off-centre so the team list does not cover the title
  };
  let selected = null, hovered = null, order = [];

  function buildCharacter(agent, idx) {
    const lk = agent.lookSlug || agent.slug; // a temp looks like the person it copies
    const look = LOOKS[lk] || FALLBACK_LOOKS[(hashOf(lk) + idx) % FALLBACK_LOOKS.length];
    const root = new THREE.Group(), body = new THREE.Group(), hips = new THREE.Group(), upper = new THREE.Group();
    root.add(body); body.add(hips); hips.add(upper);
    const shirtC = new THREE.Color(agent.color), skinC = new THREE.Color(look.skin);
    const shirt = mat(shirtC, { roughness: 0.9 }), shirtDark = mat(shirtC.clone().multiplyScalar(0.7), { roughness: 0.9 });
    const skin = mat(skinC, { roughness: 0.6 }), skinDark = mat(skinC.clone().multiplyScalar(0.84), { roughness: 0.6 });
    const pants = mat(0x2b3142, { roughness: 0.9 }), hair = mat(look.hair, { roughness: 0.5 }), dark = mat(0x1a1c26, { roughness: 0.4 }), white = mat(0xffffff, { roughness: 0.3 });
    const add = (parent, mesh) => { mesh.castShadow = true; mesh.userData.slug = agent.slug; parent.add(mesh); pickables.push(mesh); return mesh; };
    const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };
    // torso: rounded, wider at the shoulders, with a collar and a neck
    const hairs = [], hairy = (m) => { hairs.push(m); return m; };
    const torso = add(upper, new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.26, 6, 18), shirt));
    torso.position.y = 0.37; torso.scale.set(1.2, 1, 0.84);
    at(add(upper, new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.12, 20), pants)), 0, 0.05, 0).scale.z = 0.82;
    at(add(upper, new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.16, 12), skin)), 0, 0.72, 0);
    const collar = at(add(upper, new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.04, 8, 20), shirtDark)), 0, 0.66, 0);
    collar.rotation.x = Math.PI / 2;
    const head = new THREE.Group();
    head.position.y = 0.98;
    upper.add(head);
    add(head, new THREE.Mesh(new THREE.SphereGeometry(0.31, 28, 20), skin)).scale.set(1, 1.04, 0.97);
    for (const sx of [-1, 1]) at(add(head, new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), skinDark)), sx * 0.3, -0.02, 0);
    const eyes = [-1, 1].map((sx) => {
      const e = new THREE.Group(), ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), white), pupil = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), dark);
      ball.scale.z = 0.5; pupil.position.z = 0.022; pupil.scale.z = 0.6;
      e.add(ball, pupil); e.position.set(sx * 0.118, 0.025, 0.268);
      head.add(e);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.02), hair);
      brow.position.set(sx * 0.118, 0.125, 0.278); brow.rotation.z = sx * -0.12;
      head.add(brow);
      return e;
    });
    at(add(head, new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), skinDark)), 0, -0.045, 0.3);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.02), dark);
    mouth.position.set(0, -0.145, 0.282);
    head.add(mouth);
    // hair
    const cap = hairy(add(head, new THREE.Mesh(new THREE.SphereGeometry(0.335, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hair)));
    cap.rotation.x = -0.3; cap.scale.set(1, 1.04, 1);
    if (look.style === 'long') {
      at(hairy(add(head, new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.66, 0.24, 3, 0.11), hair))), 0, -0.24, -0.2);
      for (const sx of [-1, 1]) at(hairy(add(head, new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), hair))), sx * 0.285, -0.2, 0.0);
    } else if (look.style === 'bun') {
      at(hairy(add(head, new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), hair))), 0, 0.33, -0.18);
      at(hairy(add(head, new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.1, 0.12, 2, 0.045), hair))), 0, 0.22, 0.25).rotation.z = 0.1;
    } else if (look.style === 'fringe') {
      at(hairy(add(head, new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.13, 0.15, 2, 0.055), hair))), 0, 0.2, 0.24).rotation.z = -0.1;
    } else {
      at(hairy(add(head, new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), hair))), 0.03, 0.27, 0.13).scale.set(1.5, 0.55, 0.9);
    }
    if (look.glasses) {
      for (const sx of [-1, 1]) at(add(head, new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.013, 8, 22), dark)), sx * 0.118, 0.025, 0.3);
      at(add(head, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.014), dark)), 0, 0.03, 0.3);
    }
    // limbs: one pivot each, two-tone so sleeves and forearms read apart
    const limb = (parent, x, y, radius, len, top, bottom, endMesh) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      add(pivot, new THREE.Mesh(new THREE.CapsuleGeometry(radius, len / 2, 4, 12), top)).position.y = -(len / 4 + radius * 0.6);
      add(pivot, new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.92, len / 2, 4, 12), bottom)).position.y = -(len * 0.75 + radius * 0.6);
      endMesh.position.y = -(len + radius * 1.9);
      add(pivot, endMesh);
      parent.add(pivot);
      return pivot;
    };
    const hand = () => new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 10), skin);
    const armL = limb(upper, 0.39, 0.6, 0.085, 0.3, shirt, skin, hand());
    const armR = limb(upper, -0.39, 0.6, 0.085, 0.3, shirt, skin, hand());
    const shoe = () => {
      const s = new THREE.Group(), topPart = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.1, 0.32, 2, 0.045), dark), sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.035, 0.33), white);
      topPart.castShadow = true; topPart.position.z = 0.05; sole.position.set(0, -0.06, 0.05);
      s.add(topPart, sole);
      return s;
    };
    const legL = limb(hips, 0.15, 0, 0.105, 0.26, pants, pants, shoe());
    const legR = limb(hips, -0.15, 0, 0.105, 0.26, pants, pants, shoe());
    const mug = cyl(0.07, 0.06, 0.13, 0xffffff, { y: -0.5, z: 0.1 });
    mug.visible = false;
    armR.add(mug);
    const phone = box(0.08, 0.17, 0.03, 0x1a1c26, { y: -0.5, z: 0.07, cast: false });
    phone.visible = false; armR.add(phone);
    const card = box(0.3, 0.02, 0.22, 0xfff3c4, { y: -0.52, z: 0.16, cast: false });
    card.visible = false; armL.add(card);
    const ch = { root, body, hips, upper, head, eyes, mouth, armL, armR, legL, legR, mug, phone, card, torso, collar, look, hair: hairs,
      mats: { shirt, shirtDark, pants, skin, skinDark, hair, dark, white }, wear: add };
    hook('outfit', ch, agent); // the theme dresses them: caps, coats, uniforms, badges
    return ch;
  }

  function glyphSprite(text, color) {
    const s = surface(128, 128);
    s.ctx.font = '700 64px Menlo, monospace'; s.ctx.textAlign = 'center'; s.ctx.textBaseline = 'middle';
    s.ctx.fillStyle = color; s.ctx.fillText(text, 64, 68);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: s.tex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.scale.setScalar(0.42);
    return sp;
  }

  function createStation(agent, idx, centre = false) {
    const g = new THREE.Group();
    // the working information, in groups a theme may move onto its own desk surface (st.info): front (status strip
    // and nameplate), orb (status light), tray (in-tray, sheets and count), flags (pull request flags and count)
    const info = { front: new THREE.Group(), orb: new THREE.Group(), tray: new THREE.Group(), flags: new THREE.Group() };
    const color = new THREE.Color(agent.color);
    const reg = (m) => { m.userData.slug = agent.slug; pickables.push(m); return m; };
    // desk: wooden top on a white frame with steel feet
    const wood = mat(0xd8b88a, { roughness: 0.5 }), frame = mat(0xf7f4ee, { roughness: 0.6 }), steel = mat(0x8b93a6, { roughness: 0.35, metalness: 0.7 });
    const props = { mats: { wood, frame, steel } }; // the default desk props by name, for the theme's station hook
    props.desk = [reg(box(3.0, 0.08, 1.5, 0, { m: wood, y: 1.0, z: DESK_Z, r: 0.035 })), reg(box(2.74, 0.56, 0.05, 0, { m: frame, y: 0.68, z: DESK_Z + 0.63 })),
      box(0.06, 0.92, 1.26, 0, { m: frame, x: -1.37, y: 0.5, z: DESK_Z }), box(0.06, 0.92, 1.26, 0, { m: frame, x: 1.37, y: 0.5, z: DESK_Z }),
      box(0.1, 0.05, 1.42, 0, { m: steel, x: -1.37, y: 0.025, z: DESK_Z }), box(0.1, 0.05, 1.42, 0, { m: steel, x: 1.37, y: 0.025, z: DESK_Z })];
    g.add(...props.desk);
    const strip = box(2.74, 0.06, 0.03, 0, { y: 0.93, z: DESK_Z + 0.67, cast: false, m: new THREE.MeshBasicMaterial({ color: STATUS_COLOR.idle, toneMapped: false }) });
    const plate = surface(512, 128);
    let painted = false;
    if (theme.plate) { try { theme.plate(plate.ctx, { name: agent.name, title: title(agent.role), color: hex(color) }); painted = true; } catch (e) { console.warn('theme plate', e); plate.ctx.reset && plate.ctx.reset(); } }
    if (!painted) {
      plate.ctx.fillStyle = hex(color); plate.ctx.beginPath(); plate.ctx.roundRect(0, 0, 512, 128, 22); plate.ctx.fill();
      plate.ctx.fillStyle = '#fff'; plate.ctx.textAlign = 'center'; plate.ctx.textBaseline = 'middle';
      plate.ctx.font = '700 46px system-ui'; plate.ctx.fillText(agent.name, 256, 48);
      plate.ctx.font = '500 30px system-ui'; plate.ctx.globalAlpha = 0.85; plate.ctx.fillText(title(agent.role), 256, 96);
    }
    const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({ map: plate.tex, toneMapped: false, transparent: true }));
    plateMesh.position.set(0, 0.64, DESK_Z + 0.66);
    info.front.add(strip, reg(plateMesh));
    g.add(info.front);
    // on the desk: mat, laptop, mug, books, pen cup, a small plant, an arm lamp
    g.add(props.mat = box(1.5, 0.012, 0.72, 0, { m: mat(0x2f3447, { roughness: 0.95 }), y: 1.047, z: DESK_Z - 0.3, cast: false }));
    const lap = new THREE.Group(), alu = mat(0xc9ced9, { roughness: 0.35, metalness: 0.5 });
    lap.add(box(0.76, 0.03, 0.5, 0, { m: alu, y: 0.015, r: 0.012 }));
    const lid = box(0.76, 0.5, 0.025, 0, { m: alu, y: 0.26, z: 0.26, r: 0.012 });
    lid.rotation.x = 0.22;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    glow.position.set(0, 0.275, 0.283); glow.rotation.x = 0.22;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.44), new THREE.MeshBasicMaterial({ color: 0x0c1220, toneMapped: false }));
    face.position.set(0, 0.26, 0.244); face.rotation.set(0.22, Math.PI, 0);
    lap.add(lid, glow, face);
    lap.position.set(0, 1.053, DESK_Z - 0.42);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 14), mat(0xffffff));
    handle.position.set(0.84, 1.12, DESK_Z - 0.2);
    props.laptop = lap; props.mug = [cyl(0.09, 0.075, 0.15, 0xffffff, { x: 0.75, y: 1.12, z: DESK_Z - 0.2 }), handle];
    props.books = [box(0.42, 0.07, 0.3, [0x7c9cff, 0xfbbf24, 0xfb7185, 0x34d399][idx % 4], { x: -0.95, y: 1.08, z: DESK_Z + 0.2, r: 0.012 }),
      box(0.38, 0.06, 0.27, 0xf3ead9, { x: -0.93, y: 1.145, z: DESK_Z + 0.2, r: 0.012 }),
      box(0.34, 0.05, 0.24, [0x34d399, 0xfb7185, 0x7c9cff, 0xfbbf24][idx % 4], { x: -0.96, y: 1.2, z: DESK_Z + 0.21, r: 0.012 })];
    props.pens = [cyl(0.065, 0.055, 0.14, 0x2b3142, { x: -0.5, y: 1.115, z: DESK_Z - 0.5 })];
    g.add(lap, ...props.mug, ...props.books, props.pens[0]);
    for (let i = 0; i < 3; i++) g.add(props.pens[i + 1] = rod(new THREE.Vector3(-0.5 + (i - 1) * 0.025, 1.15, DESK_Z - 0.5), new THREE.Vector3(-0.5 + (i - 1) * 0.07, 1.33, DESK_Z - 0.5 + (i - 1) * 0.02), 0.011, mat([0xfbbf24, 0xfb7185, 0x7c9cff][i])));
    props.plant = [cyl(0.1, 0.075, 0.14, 0xe7dccb, { x: 1.08, y: 1.115, z: DESK_Z - 0.5 })];
    g.add(props.plant[0]);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat([0x2f9e62, 0x3bb273, 0x268752][i % 3]));
      leaf.scale.set(0.5, 1.5, 0.5);
      leaf.position.set(1.08 + Math.cos(i * 1.26) * 0.07, 1.3 + (i % 2) * 0.05, DESK_Z - 0.5 + Math.sin(i * 1.26) * 0.07);
      leaf.rotation.set(Math.sin(i * 1.26) * 0.5, 0, Math.cos(i * 1.26) * -0.5);
      g.add(leaf); props.plant.push(leaf);
    }
    const lampM = mat(0x23283a, { roughness: 0.4, metalness: 0.4 }), elbow = new THREE.Vector3(1.2, 1.5, DESK_Z + 0.3), tip = new THREE.Vector3(0.98, 1.68, DESK_Z + 0.22);
    const lampG = props.lamp = new THREE.Group(); // the desk lamp: base, arm, shade, bulb and its light
    g.add(lampG);
    lampG.add(cyl(0.13, 0.15, 0.04, 0, { m: lampM, x: 1.12, y: 1.065, z: DESK_Z + 0.25 }), rod(new THREE.Vector3(1.12, 1.08, DESK_Z + 0.25), elbow, 0.018, lampM), rod(elbow, tip, 0.018, lampM));
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.17, 18, 1, true), mat(color.clone().lerp(new THREE.Color(0x1b1f2e), 0.25), { side: THREE.DoubleSide, roughness: 0.5 }));
    shade.position.copy(tip).add(new THREE.Vector3(-0.03, -0.04, 0)); shade.rotation.z = -0.45; shade.castShadow = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false }));
    bulb.position.set(0.93, 1.6, DESK_Z + 0.22);
    const lamp = new THREE.PointLight(0xffd9a0, 0, 7, 1.8);
    lamp.position.set(0.8, 2.1, DESK_Z + 0.1);
    lampG.add(shade, bulb, lamp);
    // status orb on the desk corner
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: STATUS_COLOR.idle, toneMapped: false }));
    orb.position.set(-1.15, 1.2, DESK_Z + 0.5);
    info.orb.add(orb, cyl(0.07, 0.09, 0.1, 0x23283a, { x: -1.15, y: 1.09, z: DESK_Z + 0.5 }));
    g.add(info.orb);
    // chair: cushions in the owner's colour, arms, a five-star base on wheels
    const chair = new THREE.Group();
    const cushion = mat(color.clone().lerp(new THREE.Color(0x1b1f2e), 0.5), { roughness: 0.95 }), shell = mat(0x23283a, { roughness: 0.5 });
    chair.add(box(0.7, 0.13, 0.66, 0, { m: cushion, y: 0.58, r: 0.055 }), box(0.66, 0.82, 0.12, 0, { m: cushion, y: 1.08, z: -0.32, r: 0.055 }),
      box(0.07, 0.3, 0.07, 0, { m: shell, y: 0.72, z: -0.34 }), cyl(0.045, 0.045, 0.46, 0, { m: steel, y: 0.29 }));
    for (const sx of [-1, 1]) chair.add(box(0.07, 0.05, 0.42, 0, { m: shell, x: sx * 0.39, y: 0.86, z: -0.04, r: 0.02 }), box(0.05, 0.26, 0.05, 0, { m: shell, x: sx * 0.39, y: 0.72, z: -0.14 }));
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5, leg = box(0.07, 0.05, 0.36, 0, { m: shell, x: Math.sin(a) * 0.18, y: 0.075, z: Math.cos(a) * 0.18, cast: false });
      leg.rotation.y = a;
      const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), shell);
      wheel.position.set(Math.sin(a) * 0.35, 0.045, Math.cos(a) * 0.35);
      chair.add(leg, wheel);
    }
    chair.position.set(0, 0, SEAT_Z - 0.04);
    g.add(chair); props.chair = chair;
    // wall screen
    const scr = surface(960, 560);
    const screen = reg(new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.275), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false })));
    screen.position.set(0, 0, BACK_Z + 0.16);
    const wall = new THREE.Group();
    props.bezel = box(4.1, 2.47, 0.12, 0x151926, { y: 0, z: BACK_Z + 0.08 });
    wall.add(screen, props.bezel, box(4.1, 0.07, 0.14, 0, { y: -1.25, z: BACK_Z + 0.08, m: new THREE.MeshBasicMaterial({ color, toneMapped: false }), cast: false }));
    wall.position.y = 3.75;
    scene.add(wall);
    // selection pad
    const pad = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.02, DESK_Z - 0.4);
    g.add(pad);
    // workload: a dark in-tray with one sheet per open ticket (up to ten) and the number above it;
    // the top sheet turns red when a ticket is blocked
    const stack = [], TRAY_X = 0.42, TRAY_Z = DESK_Z + 0.38;
    g.add(info.tray, info.flags);
    info.tray.add(box(0.56, 0.035, 0.42, 0x2b3142, { x: TRAY_X, y: 1.058, z: TRAY_Z, r: 0.015, cast: false }));
    for (let i = 0; i < 10; i++) {
      const c = box(0.46, 0.05, 0.33, 0xffffff, { x: TRAY_X + Math.sin(i * 2.1) * 0.03, y: 1.1 + i * 0.054, z: TRAY_Z + Math.cos(i * 1.7) * 0.025 });
      c.rotation.y = Math.sin(i * 1.3 + idx) * 0.2; c.visible = false;
      info.tray.add(c); stack.push(c);
    }
    // pull requests: a little flag per open one on the left of the desk (green approved, amber waiting
    // for review, red changes requested or checks failing, grey draft)
    const flags = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Group(), cloth = box(0.2, 0.13, 0.014, 0xfbbf24, { x: 0.11, y: 0.3, cast: false, m: new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false }) });
      f.add(cyl(0.012, 0.012, 0.4, 0x2b3142, { y: 0.2 }), cyl(0.05, 0.06, 0.03, 0x2b3142, { y: 0.015 }), cloth);
      f.position.set(-1.3 + i * 0.26, 1.04, DESK_Z + 0.56); f.visible = false; f.userData.cloth = cloth;
      info.flags.add(f); flags.push(f);
    }
    const load = glyphSprite('', '#fff');
    load.scale.setScalar(0.5); load.userData.n = -1;
    info.tray.add(load);
    // the count over the pull request flags, like the one over the pile: "2 PR", coloured by the worst state
    const prLoad = glyphSprite('', '#fff');
    prLoad.scale.setScalar(0.62); prLoad.userData.n = '';
    info.flags.add(prLoad);
    // a soft ring on the floor while this person is waiting for you
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.12, 64), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.set(0, 0.026, DESK_Z - 0.35);
    g.add(halo);
    scene.add(g);

    const ch = buildCharacter(agent, idx);
    ch.root.userData.slug = agent.slug;
    scene.add(ch.root);
    // label above the head
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = '<div class="bubble"></div><div class="doing"></div><div class="chip"><i class="dot"></i><b></b><span></span></div>';
    tag.querySelector('b').textContent = agent.temp ? agent.name.replace(/\s*\(temp\)/, '') : agent.name.split(' ')[0];
    if (agent.temp) { const c = tag.querySelector('.chip'); c.style.borderStyle = 'dashed'; c.style.borderColor = '#fbbf24'; }
    tag.querySelector('span').textContent = title(agent.role);
    tag.querySelector('.chip').addEventListener('click', () => onSelect(agent.slug));
    const label = new CSS2DObject(tag);
    label.center.set(0.5, 1);
    label.position.set(0, 2.25 + (idx % 2) * 0.85, 0); // neighbours sit at two heights so their labels do not collide
    ch.root.add(label);
    const glyphSet = (GLYPHS.find(([re]) => re.test(agent.role)) || [0, ['•', '◦', '∙']])[1];
    const glyphs = glyphSet.map((t) => glyphSprite(t, hex(color.clone().lerp(new THREE.Color(0xffffff), 0.45))));
    const zs = [0, 1].map(() => glyphSprite('z', '#c7d2fe'));
    const alert = glyphSprite('!', '#fbbf24');
    alert.scale.setScalar(0.7);
    const ask = glyphSprite('?', '#fbbf24');
    ask.scale.setScalar(0.78);
    const note = glyphSprite('✉', '#e8ecf5');
    note.scale.setScalar(0.34);
    const draft = glyphSprite('', '#2dd4bf'); // a message they wrote in your name, waiting for you to check: a teal envelope
    { const c = draft.material.map.image.getContext('2d');
      c.fillStyle = '#2dd4bf'; c.beginPath(); c.roundRect(12, 30, 104, 70, 12); c.fill();
      c.strokeStyle = '#06231f'; c.lineWidth = 7; c.lineJoin = 'round'; c.beginPath(); c.moveTo(20, 40); c.lineTo(64, 72); c.lineTo(108, 40); c.stroke();
      c.fillStyle = '#fbbf24'; c.beginPath(); c.arc(108, 32, 14, 0, 7); c.fill();
      draft.material.map.needsUpdate = true; }
    [...glyphs, ...zs, alert, ask, note, draft].forEach((s) => scene.add(s));
    if (agent.temp) { // a floating amber ring over the head tells a temp from the person it copies
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false }));
      band.rotation.x = Math.PI / 2; band.position.set(0, 2.05, 0); ch.root.add(band);
    }

    const st = {
      slug: agent.slug, agent, group: g, wall, x: 0, z: 0, row: 0, ch, tag, bubble: tag.querySelector('.bubble'), doing: tag.querySelector('.doing'),
      strip, orb, lamp, bulb, pad, scr, screenHash: '', glyphs, zs, alert, online: false, status: 'offline',
      seed: (hashOf(agent.slug) % 1000) / 100, steps: [], pending: [], mode: 'seat', pose: '', phase: 0, hurry: false,
      listenUntil: 0, talkingUntil: 0, nextBreak: 40 + Math.random() * 90, bubbleTimer: 0, cur: {},
      idx, stack, load, prLoad, flags, halo, ask, note, draft, askReq: 0, askNote: 0, askDraft: 0, at: 'desk', kind: 'code', kindWant: 'code', kindSince: 0, placeSince: -99, carry: false, sip: false,
      props, screen, info, centre: !!centre, title: title(agent.role), yaw: 0, lift: centre ? CENTRE.lift : 0,
    };
    ch.root.position.set(0, 0, SEAT_Z);
    stations.set(agent.slug, st);
    hook('station', st); // the theme's desk props and look
    return st;
  }

  function drawScreen(st) {
    const a = st.agent, g = st.scr.ctx, W = 960, H = 560;
    const hash = `${a.status}|${Math.floor((Date.now() - a.statusSince) / 60000)}|${a.screen.join('\n')}`;
    if (hash === st.screenHash) return;
    st.screenHash = hash;
    g.fillStyle = a.online ? '#090c15' : '#05060a'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = a.online ? a.color : '#1c2030'; g.fillRect(0, 0, W, 52);
    g.fillStyle = '#fff'; g.font = '600 25px system-ui';
    g.fillText(`${a.name}  ·  ${title(a.role)}`, 20, 27);
    g.textAlign = 'right'; g.font = '600 22px system-ui';
    const sw = texts.status || {}; // a theme may translate the status words (texts.status { working, idle, blocked, offline, now })
    g.fillText(a.online ? `${sw[a.status] || STATUS_TEXT[a.status]} · ${ago(a.statusSince).replace(/^now$/, sw.now || 'now')}` : sw.offline || 'offline', W - 20, 27);
    g.textAlign = 'left';
    if (!a.online) {
      g.fillStyle = '#3a4256'; g.font = '30px system-ui'; g.textAlign = 'center';
      g.fillText('Not running in Herdr', W / 2, H / 2 + 20);
    } else {
      g.font = '21px Menlo, monospace';
      a.screen.slice(-14).forEach((l, i) => {
        g.fillStyle = /^\s*[⏺●•]/.test(l) ? '#e8edf7' : /^\s*[❯›>]/.test(l) ? '#8fb0ff' : /^[\s─━]+\S*[\s─━]*$/.test(l) && l.includes('─') ? '#2c3550' : '#8ea0bd';
        g.fillText(l.slice(0, 74), 16, 80 + i * 34);
      });
    }
    st.scr.tex.needsUpdate = true;
  }

  // Desks sit in rows. Aisle k runs in front of row k, which is also right behind row k + 1.
  const plan = { rows: 1, side: 1.9, rowX: [[]] };
  const V = (x, z) => new THREE.Vector3(x, 0, z);
  const zA = (k) => AISLE_Z + k * ROW_D;
  const lastAisle = () => plan.rows - 1;
  // A point given in a desk's own coordinates (as in its group: desk centre at x 0, z DESK_Z), in the room. Only the
  // centre desk can be turned (st.yaw) or raised (st.lift); the rows never are.
  function loc(st, lx, lz, y = 0, out = new THREE.Vector3()) {
    const a = st.yaw || 0;
    if (!a) return out.set(st.x + lx, y, st.z + lz);
    const c = Math.cos(a), s = Math.sin(a);
    return out.set(st.x + lx * c + lz * s, y, st.z - lx * s + lz * c);
  }
  const deskAt = (st) => (st.centre ? loc(st, 0, DESK_Z) : V(st.x, DESK_Z + st.z));
  const seatOf = (st) => (st.centre ? loc(st, 0, SEAT_Z, st.lift) : V(st.x, SEAT_Z + st.z));
  const sideOf = (st) => (st.centre ? loc(st, CENTRE.side, SEAT_Z) : V(st.x + plan.side, SEAT_Z + st.z));
  const nearSeat = (st, p, r) => { const s = seatOf(st); return Math.hypot(p.x - s.x, p.z - s.z) < r; };
  // ---- walking around blocked areas (the centre desk, k.block): a straight walk that would cross one goes round
  // it by its corners instead. A walk that starts or ends inside an area (their own desk) may cross that one.
  const inR = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  function segHit(ax, az, bx, bz, r) { // where the segment enters the rectangle's inside (0..1), or -1
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az, P = [-dx, dx, -dz, dz], Q = [ax - r.x0, r.x1 - ax, az - r.z0, r.z1 - az];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(P[i]) < 1e-9) { if (Q[i] <= 0) return -1; continue; }
      const t = Q[i] / P[i];
      if (P[i] < 0) { if (t > t1) return -1; if (t > t0) t0 = t; } else { if (t < t0) return -1; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 1e-6 ? t0 : -1;
  }
  function detour(a, b) {
    let best = null, bt = 2, bandA = false, bandB = false;
    for (const o of obs) {
      if (inR(a.x, a.z, o) || inR(b.x, b.z, o)) continue;
      const ia = inR(a.x, a.z, o.ex), ib = inR(b.x, b.z, o.ex), t = segHit(a.x, a.z, b.x, b.z, ia || ib ? o : o.ex);
      if (t >= 0 && t < bt) { bt = t; best = o; bandA = ia; bandB = ib; }
    }
    if (!best) return [];
    const e = best.ex, E = 0.06, cs = [[e.x0 - E, e.z0 - E], [e.x1 + E, e.z0 - E], [e.x1 + E, e.z1 + E], [e.x0 - E, e.z1 + E]];
    const inRoom = (c) => c[0] > LEFT_X + 0.45 && c[0] < 12.6 && c[1] > BACK_Z + 0.45 && c[1] < 8.9;
    const clear = (p, q, band) => segHit(p[0], p[1], q[0], q[1], band ? best : e) < 0;
    const A = [a.x, a.z], Bp = [b.x, b.z], d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    let way = null, wl = Infinity;
    for (let i = 0; i < 4; i++) for (const path of [[cs[i]], [cs[i], cs[(i + 1) % 4]], [cs[i], cs[(i + 3) % 4]]]) {
      if (!path.every(inRoom)) continue;
      const pts = [A, ...path, Bp];
      let ok = true, len = 0;
      for (let j = 0; j < pts.length - 1 && ok; j++) { ok = clear(pts[j], pts[j + 1], (j === 0 && bandA) || (j === pts.length - 2 && bandB)); len += d(pts[j], pts[j + 1]); }
      if (ok && len < wl) { wl = len; way = path; }
    }
    return way ? way.map((c) => V(c[0], c[1])) : [];
  }
  // A place to stand, moved out of any blocked area it falls in: to its nearest edge that is still on the floor (a
  // desk near the front wall is left by a side, never through the wall).
  const onFloor = (x, z) => x > LEFT_X + 0.45 && x < 12.6 && z > BACK_Z + 0.45 && z < 8.6;
  function freeSpot(v) {
    for (const o of obs) {
      const e = o.ex;
      if (!inR(v.x, v.z, e)) continue;
      const ms = [[v.x - e.x0, e.x0 - 0.06, null], [e.x1 - v.x, e.x1 + 0.06, null], [v.z - e.z0, null, e.z0 - 0.06], [e.z1 - v.z, null, e.z1 + 0.06]].sort((p, q) => p[0] - q[0]);
      const m = ms.find((c) => onFloor(c[1] ?? v.x, c[2] ?? v.z)) || ms[0];
      if (m[1] != null) v.x = m[1]; else v.z = m[2];
    }
    return v;
  }
  // Before a walk starts: round any blocked area on the way (a few levels deep at most).
  function guardSteps(st) {
    for (let n = 0; n < 4; n++) {
      const s = st.steps[0];
      if (!s || s.type !== 'walk' || s.ck) return;
      s.ck = true;
      const depth = s.dd || 0;
      if (depth >= 4) return;
      const w = detour(st.ch.root.position, s.to);
      if (!w.length) return;
      // the rest of the way, from the last corner on, is checked again when it starts: another area may lie on it
      // (the walk round goes one level deeper each time, so it always ends)
      s.ck = false; s.dd = depth + 1;
      st.steps.unshift(...w.map((p) => ({ type: 'walk', to: p, dd: depth + 1 })));
    }
  }
  const walk = (to) => ({ type: 'walk', to });
  const nearAisle = (z) => Math.max(0, Math.min(lastAisle(), Math.round((z - AISLE_Z) / ROW_D)));
  // You cross a row of desks through the nearest gap between two of them.
  const gapX = (row, x) => {
    const xs = plan.rowX[row] || [];
    if (!xs.length) return x;
    return [xs[0] - plan.side, ...xs.map((v) => v + plan.side)].reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b));
  };
  function cross(x, a, b) {
    const out = [], d = Math.sign(b - a);
    for (let k = a; k !== b; k += d) { x = gapX(d > 0 ? k + 1 : k, x); out.push(walk(V(x, zA(k))), walk(V(x, zA(k + d)))); }
    return out;
  }
  // Out from the desk to aisle `dest`: sideways first when seated, otherwise straight to the nearest aisle.
  // The centre desk stands in the open floor in front of the rows: out of it by its side, then straight on in the
  // open floor, or back through the rows when going further back.
  function leave(st, dest = st.row) {
    dest = Math.max(0, Math.min(lastAisle(), dest));
    const p = st.ch.root.position;
    if (st.centre && nearSeat(st, p, 1.3)) {
      const s = sideOf(st), last = lastAisle();
      return dest >= last ? [walk(s)] : [walk(s), walk(V(s.x, zA(last))), ...cross(s.x, last, dest)];
    }
    const atSeat = !st.centre && Math.abs(p.z - (SEAT_Z + st.z)) < 1.3 && Math.abs(p.x - st.x) < 2.6;
    if (atSeat) { const a = dest < st.row ? st.row - 1 : st.row; return [walk(sideOf(st)), walk(V(st.x + plan.side, zA(a))), ...cross(st.x + plan.side, a, dest)]; }
    const a = nearAisle(p.z);
    return [walk(V(p.x, zA(a))), ...cross(p.x, a, dest)];
  }
  // Back to the desk from aisle `from` (near x); without them, from wherever the character is now.
  function homeSteps(st, from, x) {
    if (from == null) { from = nearAisle(st.ch.root.position.z); x = st.ch.root.position.x; }
    from = Math.max(0, Math.min(lastAisle(), from));
    if (st.centre) return [...cross(x, from, lastAisle()), walk(sideOf(st)), walk(seatOf(st)), { type: 'arrive', at: 'desk' }];
    const a = from < st.row ? st.row - 1 : st.row;
    return [...cross(x, from, a), walk(V(st.x + plan.side, zA(a))), walk(sideOf(st)), walk(seatOf(st)), { type: 'arrive', at: 'desk' }];
  }
  const placeAisle = (at) => (at === 'board' ? 0 : lastAisle());
  const WHITE = { x: 8.54, z: 6.58, tx: 0.75, tz: 0.66 }; // in front of the whiteboard, and the direction it runs in
  function placeSpot(st, at) {
    const slot = st.idx % 4;
    if (at === 'board') return new THREE.Vector3(LEFT_X + 1.5, 0, -0.6 - slot * 1.0);
    return new THREE.Vector3(WHITE.x + (slot - 1.5) * 0.8 * WHITE.tx, 0, WHITE.z + (slot - 1.5) * 0.8 * WHITE.tz);
  }
  // where this person stands for their coffee: side by side across the way the spot faces, out of blocked areas
  function coffeeSpot(st) {
    const v = tc ? new THREE.Vector3(COFFEE.x - Math.cos(COFFEE.yaw) * ((st.seed % 2) - 0.5), 0, COFFEE.z + Math.sin(COFFEE.yaw) * ((st.seed % 2) - 0.5))
      : new THREE.Vector3(9.3, 0, 0.2 + (st.seed % 2));
    return obs.length ? freeSpot(v) : v;
  }
  const placeYaw = (at) => (at === 'board' ? -Math.PI / 2 : Math.atan2(0.66, -0.75));

  // ---- the centre desk
  let layoutKey = '';
  const roleIs = (role, want) => new RegExp(`^\\s*${String(want).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(role || ''));
  function pickCentre(agents) {
    if (!CENTRE || agents.length - 1 > 10) return null; // the others must fit in two rows in front of the back wall
    for (const want of [].concat(CENTRE.roles || [])) {
      const a = agents.find((x) => !x.temp && roleIs(x.role, want));
      if (a) return a.slug;
    }
    return null;
  }
  // Where it stands for this many rows: theme numbers or functions of `rows`, else the middle of the open floor.
  function centrePlace(rows) {
    const val = (v, d) => { const r = typeof v === 'function' ? v(rows) : v; return Number.isFinite(r) ? r : d; };
    return { x: val(CENTRE.x, 0.6), z: val(CENTRE.z, rows === 1 ? 0.9 : 4.0), yaw: val(CENTRE.yaw, 0) };
  }
  // its footprint (desk, chair and whatever the theme says it covers), as a world rectangle
  function footOf(c) {
    const f = CENTRE.foot, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), xs = [], zs = [];
    for (const [lx, lz] of [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]]) { xs.push(c.x + lx * cs + lz * sn); zs.push(c.z - lx * sn + lz * cs); }
    return rect(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
  }

  // a thin arc between two desks while their owners talk
  const links = [];
  function linkDesks(a, b, dur) {
    const p0 = deskAt(a).setY(1.3 + a.lift), p1 = deskAt(b).setY(1.3 + b.lift);
    const mid = p0.clone().lerp(p1, 0.5); mid.y += 1.5 + Math.abs(a.x - b.x) * 0.1; mid.z += 1.3;
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.02, 6), new THREE.MeshBasicMaterial({ color: a.agent.color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    scene.add(m, bead);
    links.push({ m, bead, curve, t: 0, dur });
  }
  function tickLinks(dt) {
    for (let i = links.length - 1; i >= 0; i--) {
      const l = links[i];
      l.t += dt;
      const u = l.t / l.dur;
      l.m.material.opacity = Math.max(0, Math.min(1, u * 8, (1 - u) * 5)) * 0.7;
      l.bead.position.copy(l.curve.getPoint((l.t * 0.45) % 1));
      if (u >= 1) { scene.remove(l.m, l.bead); l.m.geometry.dispose(); links.splice(i, 1); }
    }
  }

  // Name tags never sit on top of each other: the ones behind move up.
  let tidyN = 0;
  function tidyLabels() {
    if (++tidyN % 3) return;
    const placed = [];
    const tags = [];
    for (const el of labelsEl.querySelectorAll('.tag')) {
      const chip = el.querySelector('.chip'); if (!chip) continue;
      const r = chip.getBoundingClientRect(); if (!r.width) continue;
      const off = el._dy || 0; tags.push({ el, l: r.left, r: r.right, t: r.top - off, b: r.bottom - off });
    }
    tags.sort((a, b) => b.b - a.b || a.l - b.l); // the ones lowest on the screen keep their place; the ones behind move up
    for (const g of tags) {
      let dy = 0;
      for (let k = 0; k < 8; k++) { const hit = placed.find((p) => g.l < p.r - 2 && g.r > p.l + 2 && g.t + dy < p.b + 3 && g.b + dy > p.t - 3); if (!hit) break; dy = hit.t - 3 - g.b; }
      placed.push({ l: g.l, r: g.r, t: g.t + dy, b: g.b + dy });
      if (Math.abs(dy - (g.el._dy || 0)) > 1.5) { g.el._dy = dy; g.el.style.translate = dy ? `0 ${Math.round(dy)}px` : ''; }
    }
  }
  function showBubble(st, text, ms, who, cls) {
    st.bubble.className = `bubble show ${cls || ''}`;
    st.bubble.innerHTML = (who ? `<small>${escText(who)}</small>` : '') + fmt(text.length > 220 ? `${text.slice(0, 218)}…` : text);
    clearTimeout(st.bubbleTimer);
    st.bubbleTimer = setTimeout(() => { st.bubble.className = 'bubble'; }, ms);
  }

  // Where talker number `n` stands to speak to `to`, right now: in front of their desk while they sit at it,
  // around them anywhere else (the board, the whiteboard, someone else's desk, on their way somewhere).
  const DESK_ROW = [0, -0.9, 0.9, -1.8, 1.8], RING = [[0.95, 0], [-0.95, 0], [0.7, 0.65], [-0.7, 0.65], [0, 1.1], [1.8, 0.1], [-1.8, 0.1], [1.5, 0.9], [-1.5, 0.9]];
  const seatedAt = (to) => { const p = to.ch.root.position; if (to.centre) { const s = seatOf(to); return Math.abs(p.z - s.z) < 0.5 && Math.abs(p.x - s.x) < 0.5; } return Math.abs(p.z - (SEAT_Z + (to.z || 0))) < 0.5 && Math.abs(p.x - to.x) < 0.5; };
  function talkSpot(to, n) {
    if (seatedAt(to)) {
      if (to.centre) { // in front of the centre desk, or (when its footprint reaches the front wall) along its sides,
        // the outer ones further back so the group does not pile up on one spot
        const v = loc(to, DESK_ROW[n % 5], AISLE_Z - 0.35 + (n >= 5 ? 0.8 : 0)), x0 = v.x;
        freeSpot(v);
        if (Math.abs(v.x - x0) > 0.01) { v.z -= Math.abs(DESK_ROW[n % 5]) * 0.75; freeSpot(v); }
        return v;
      }
      return new THREE.Vector3(to.x + DESK_ROW[n % 5], 0, AISLE_Z + (to.z || 0) - 0.35 + (n >= 5 ? 0.8 : 0));
    }
    const p = to.ch.root.position, o = RING[n % RING.length];
    const v = new THREE.Vector3(Math.max(LEFT_X + 0.9, p.x + o[0]), 0, p.z + o[1]);
    return obs.length ? freeSpot(v) : v;
  }
  function startConversation(from, to, text) {
    const dur = Math.min(11, Math.max(5, 3 + text.length * 0.045));
    const toName = to.agent.name.split(' ')[0];
    linkDesks(from, to, dur + 5);
    // Nobody waits for anybody: you walk to wherever they are and say it. Each talker takes a free place in the
    // group around them, so several messages arriving at once show as a crowd instead of one pile.
    const t0 = performance.now() / 1000;
    to.crowd = to.crowd || new Map();
    for (const [f, c] of to.crowd) if (f.talkTo !== to || !f.steps.length || c.until < t0) to.crowd.delete(f);
    const used = new Set([...to.crowd.values()].map((c) => c.n)); let n = 0; while (used.has(n)) n++;
    to.crowd.set(from, { n, until: t0 + 90 }); from.talkTo = to;
    const spot = () => talkSpot(to, n);
    const face = () => { const a = from.ch.root.position, b = to.ch.root.position; return Math.atan2(b.x - a.x, b.z - a.z); };
    const route = (p, g) => { const a = nearAisle(p.z), b = nearAisle(g.z); return a !== b ? [walk(V(p.x, zA(a))), ...cross(p.x, a, b)] : null; };
    const out = leave(from, nearAisle(spot().z));
    const say = { type: 'wait', dur, pose: 'talk', yaw: face,
      onStart: () => { const t = performance.now() / 1000; showBubble(from, text, dur * 1000, `to ${toName}`); to.listenUntil = t + dur; from.talkingUntil = to.talkingUntil = t + dur; to.holdUntil = Math.max(to.holdUntil || 0, t + dur); },
      onEnd: () => { if (from.talkTo === to) from.talkTo = null; to.crowd.delete(from); } };
    from.steps = [...out, { type: 'chase', to: spot, who: to, max: 30, tries: 0, route }, say, { type: 'plan', make: () => homeSteps(from) }];
  }

  function tickCharacter(st, dt, t) {
    const ch = st.ch, root = ch.root;
    ch.body.visible = st.online;
    if (st.trip) { if (!st.online) endTrip(st); else if (st.trip.hold) { ch.body.visible = !st.trip.gone; return; } } // teleported to another room (travel)
    if (!st.online) { st.steps = []; st.pending = []; st.at = 'desk'; st.carry = false; root.position.copy(seatOf(st)); root.rotation.y = st.yaw || 0; return; }
    const needs = st.status === 'blocked' || st.askReq > 0;
    // Where the work happens. A new kind has to hold for a few seconds, and nobody moves more than once every 20s.
    if (st.kind !== st.kindWant && t - st.kindSince > 6 && t - st.placeSince > 20) { st.kind = st.kindWant; st.placeSince = t; }
    const wantAt = st.status === 'working' && !needs ? (PLACE[st.kind] || 'desk') : 'desk';
    if (!st.steps.length && !st.pending.length && wantAt !== st.at && !(st.holdUntil > t)) {
      st.steps = wantAt === 'desk' ? homeSteps(st) : [...leave(st, placeAisle(wantAt)), walk(placeSpot(st, wantAt)), { type: 'arrive', at: wantAt }];
    }
    if (!st.steps.length && st.pending.length) { const p = st.pending.shift(); startConversation(st, p.to, p.text); }
    // idle people wander to the coffee bar now and then
    if (st.status === 'idle' && !needs && st.at === 'desk' && !st.steps.length && selected !== st.slug && !(st.holdUntil > t)) {
      st.nextBreak -= dt;
      if (st.nextBreak <= 0) {
        st.nextBreak = 70 + Math.random() * 120;
        const spot = coffeeSpot(st);
        st.steps = [...leave(st, lastAisle()), walk(spot), { type: 'wait', dur: 7, pose: 'coffee', yaw: COFFEE.yaw }, ...homeSteps(st, lastAisle(), spot.x)];
      }
    }
    if (st.status !== 'idle' && st.steps.some((s) => s.pose === 'coffee')) { st.steps = st.steps.filter((s) => s.pose !== 'coffee'); st.hurry = true; }

    for (let k = 0; k < 4 && st.steps[0] && (st.steps[0].type === 'arrive' || st.steps[0].type === 'plan'); k++) { const s0 = st.steps.shift(); if (s0.type === 'arrive') st.at = s0.at; else st.steps.unshift(...s0.make()); } // 'plan': a route worked out when its turn comes
    if (obs.length) guardSteps(st);
    const step = st.steps[0];
    let yawTarget = 0;
    if (!step) {
      st.hurry = false;
      if (st.at === 'desk') { st.mode = 'seat'; root.position.lerp(seatOf(st), Math.min(1, dt * 12)); yawTarget = st.yaw || 0; }
      else { st.mode = 'stand'; st.pose = st.at; yawTarget = placeYaw(st.at); }
    } else if (step.type === 'walk') {
      st.mode = 'walk';
      const d = step.to.clone().sub(root.position);
      const dist = d.length(), sp = (st.hurry ? 8.5 : 5.4) * dt;
      yawTarget = Math.atan2(d.x, d.z);
      if (dist <= sp) { root.position.copy(step.to); st.steps.shift(); } else root.position.addScaledVector(d.normalize(), sp);
      st.phase += dt * (st.hurry ? 21 : 15);
    } else if (step.type === 'chase') { // after someone who may be moving: the place to stand is worked out again every frame
      st.mode = 'walk';
      const goal = step.to(), d = goal.clone().sub(root.position), dist = d.length(), sp = 8.5 * dt;
      const more = step.route && step.tries < 3 && dist > 2.4 ? step.route(root.position, goal) : null;
      const round = !more && obs.length && (step.dtries || 0) < 6 && dist > 0.3 ? detour(root.position, goal) : null;
      if (more) { step.tries++; st.steps.unshift(...more); yawTarget = root.rotation.y; }
      else if (round && round.length) { step.dtries = (step.dtries || 0) + 1; st.steps.unshift(...round.map((p) => walk(p))); yawTarget = root.rotation.y; }
      else {
        if (dist < 5 && step.who) step.who.holdUntil = Math.max(step.who.holdUntil || 0, t + 1.5); // they do not wander off as you reach them
        yawTarget = dist > 0.01 ? Math.atan2(d.x, d.z) : root.rotation.y; step.max -= dt;
        if (dist <= sp || step.max <= 0) { if (dist <= sp) root.position.copy(goal); st.steps.shift(); } else root.position.addScaledVector(d.normalize(), sp);
        st.phase += dt * 21;
      }
    } else {
      st.mode = 'stand'; st.pose = step.pose; yawTarget = typeof step.yaw === 'function' ? step.yaw() : step.yaw;
      if (!step.started) { step.started = true; step.onStart && step.onStart(); }
      step.dur -= dt;
      if (step.until && step.until()) step.dur = 0;
      if (step.dur <= 0) { step.onEnd && step.onEnd(); st.steps.shift(); }
    }
    let dy = yawTarget - root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    root.rotation.y += dy * Math.min(1, dt * 10);

    const s = st.seed, listening = st.listenUntil > t;
    const P = { hips: STAND_Y, lean: 0, aLx: 0, aRx: 0, aLz: 0.1, aRz: -0.1, lLx: 0, lRx: 0, yaw: 0, pitch: 0, mouth: 0 };
    st.sip = false;
    let onPhone = false;
    if (st.mode === 'seat' && needs && !listening) {
      // on their feet behind the desk, one hand up, until you answer
      P.hips = STAND_Y + 0.02; P.aRz = -2.7 + Math.sin(t * 2.4 + s) * 0.2; P.aLx = -0.25; P.pitch = -0.14; P.yaw = Math.sin(t * 0.7 + s) * 0.12; P.mouth = 0.25;
    } else if (st.mode === 'seat') {
      P.hips = SEAT_Y; P.lLx = P.lRx = -1.5;
      if (listening) { P.pitch = -0.12 + Math.sin(t * 3.2) * 0.07; P.aLx = P.aRx = -0.55; }
      else if (st.status === 'working' && st.kind === 'read') {
        P.lean = -0.12; P.aLx = -0.35; P.aRx = -2.25; P.aRz = 0.38; P.pitch = 0.1 + Math.sin(t * 0.5 + s) * 0.04; P.yaw = Math.sin(t * 0.6 + s) * 0.2;
      } else if (st.status === 'working' && st.kind === 'call') {
        onPhone = true;
        P.lean = -0.18; P.aRx = -2.5; P.aRz = 0.5; P.aLx = -0.5 + Math.sin(t * 2.1 + s) * 0.18; P.yaw = Math.sin(t * 0.4 + s) * 0.4;
        P.mouth = (t + s) % 7 < 4 ? Math.abs(Math.sin(t * 9)) * 0.8 : 0;
      } else if (st.status === 'working') {
        P.lean = 0.14; P.pitch = 0.16 + Math.sin(t * 1.3 + s) * 0.03; P.yaw = Math.sin(t * 0.45 + s) * 0.1;
        P.aLx = -1.12 + Math.sin(t * 17 + s) * 0.08; P.aRx = -1.12 + Math.sin(t * 21 + s * 2) * 0.08; P.aLz = -0.16; P.aRz = 0.16;
      } else if (st.status === 'blocked') {
        P.aRz = -2.55 + Math.sin(t * 8) * 0.32; P.aLx = -0.5; P.pitch = -0.16; P.mouth = 0.6;
      } else {
        P.lean = -0.16; P.aLx = P.aRx = -0.4; P.yaw = Math.sin(t * 0.33 + s) * 0.55; P.pitch = Math.sin(t * 0.21 + s) * 0.08;
        if ((t + s * 7) % 26 < 1.8) { P.aLz = 2.6; P.aRz = -2.6; P.lean = -0.28; P.pitch = -0.25; }
        else if ((t + s * 3) % 37 < 2.6) { st.sip = true; P.aRx = -2.15; P.aRz = 0.22; P.pitch = -0.1; P.yaw = 0; } // a sip
        else if ((t + s * 5) % 53 < 4) { P.yaw = (st.idx % 2 ? -1 : 1) * 1.05; P.lean = 0.06; } // a look at the neighbour's screen
      }
    } else if (st.mode === 'walk') {
      const sw = Math.sin(st.phase);
      P.lLx = sw * 0.75; P.lRx = -sw * 0.75; P.aLx = -sw * 0.55; P.aRx = sw * 0.55;
      P.hips = STAND_Y + Math.abs(Math.cos(st.phase)) * 0.05; P.lean = 0.08;
      if (st.carry) { P.aLx = -1.25; P.aLz = -0.12; }
    } else if (st.pose === 'board' || st.pose === 'white') {
      // writing on the board, stepping back now and then to think
      if ((t + s * 2) % 11 < 3) { P.aRx = -2.25; P.aRz = 0.38; P.lean = -0.06; P.pitch = -0.08; P.yaw = Math.sin(t * 0.8) * 0.25; }
      else { P.aRx = -1.85 + Math.sin(t * 6 + s) * 0.13; P.aRz = -0.15 + Math.sin(t * 1.3 + s) * 0.28; P.pitch = -0.1; P.lean = 0.05; }
    } else if (st.pose === 'pin') {
      P.aLx = -2.5; P.aLz = -0.1; P.pitch = -0.15; P.lean = 0.06;
    } else if (st.pose === 'talk') {
      P.aRx = -1.05 + Math.sin(t * 5.2) * 0.35; P.aRz = -0.3 + Math.sin(t * 3.1) * 0.22; P.aLx = -0.35 + Math.sin(t * 2.3) * 0.12;
      P.pitch = Math.sin(t * 4) * 0.06; P.mouth = Math.abs(Math.sin(t * 11));
    } else if (st.pose === 'coffee') {
      P.aRx = -1.35 + Math.sin(t * 0.9) * 0.25; P.yaw = Math.sin(t * 0.5) * 0.3;
    }
    const c = st.cur, k = Math.min(1, dt * 11);
    for (const key in P) c[key] = c[key] === undefined ? P[key] : c[key] + (P[key] - c[key]) * k;
    ch.hips.position.y = c.hips;
    ch.upper.rotation.x = c.lean;
    ch.armL.rotation.set(c.aLx, 0, c.aLz); ch.armR.rotation.set(c.aRx, 0, c.aRz);
    ch.legL.rotation.x = c.lLx; ch.legR.rotation.x = c.lRx;
    ch.head.rotation.set(c.pitch, c.yaw, 0);
    ch.mouth.scale.y = 1 + c.mouth * 3.2;
    const blink = (t * 0.9 + s) % 4 < 0.12 ? 0.1 : 1;
    ch.eyes.forEach((e) => { e.scale.y = blink; });
    ch.upper.scale.y = 1 + Math.sin(t * 1.6 + s) * 0.012; // breathing
    ch.mug.visible = (st.mode === 'stand' && st.pose === 'coffee') || st.sip;
    ch.phone.visible = onPhone;
    ch.card.visible = st.carry;
  }

  function tickStation(st, t) {
    const needs = st.online && (st.status === 'blocked' || st.askReq > 0), eff = needs ? 'blocked' : st.status;
    const pulse = 0.5 + 0.5 * Math.sin(t * (needs ? 2.6 : 3.2) + st.seed);
    const col = new THREE.Color(STATUS_COLOR[eff]);
    const live = eff === 'working' || eff === 'blocked';
    st.halo.material.opacity += ((needs ? 0.22 + pulse * 0.4 : 0) - st.halo.material.opacity) * 0.12;
    st.halo.scale.setScalar(1 + pulse * 0.035);
    st.lamp.color.set(needs ? 0xffb347 : 0xffd9a0);
    st.orb.material.color.copy(col).multiplyScalar(live ? 0.55 + pulse * 0.6 : 0.8);
    st.orb.scale.setScalar(live ? 1 + pulse * 0.25 : 1);
    st.strip.material.color.copy(col).multiplyScalar(live ? 0.6 + pulse * 0.5 : 0.7);
    st.bulb.material.color.set(st.online ? 0xffe2a8 : 0x3a3f52);
    const want = selected === st.slug ? 0.2 : hovered === st.slug ? 0.1 : 0;
    st.pad.material.opacity += (want - st.pad.material.opacity) * 0.15;
    const seated = st.mode === 'seat';
    st.glyphs.forEach((sp, i) => {
      const ph = (t * 0.32 + i / st.glyphs.length + st.seed) % 1;
      const on = st.status === 'working' && !needs && seated && st.kind === 'code' && st.listenUntil < t;
      sp.material.opacity = on ? Math.sin(ph * Math.PI) * 0.9 : 0;
      if (st.centre) loc(st, Math.sin(ph * 5 + i * 2) * 0.35 + (i - 1) * 0.3, DESK_Z - 0.2, 1.45 + ph * 1.25 + st.lift, sp.position);
      else sp.position.set(st.x + Math.sin(ph * 5 + i * 2) * 0.35 + (i - 1) * 0.3, 1.45 + ph * 1.25, DESK_Z - 0.2 + st.z);
    });
    const sleepy = st.status === 'idle' && !needs && seated && Date.now() - st.agent.statusSince > 15 * 60000;
    st.zs.forEach((sp, i) => {
      const ph = (t * 0.25 + i * 0.5) % 1;
      sp.material.opacity = sleepy ? Math.sin(ph * Math.PI) * 0.85 : 0;
      if (st.centre) loc(st, 0.35 + ph * 0.5, SEAT_Z, 2.0 + ph * 0.9 + st.lift, sp.position);
      else sp.position.set(st.x + 0.35 + ph * 0.5, 2.0 + ph * 0.9, SEAT_Z + st.z);
      sp.scale.setScalar(0.25 + ph * 0.25);
    });
    const sign = st.askReq > 0 ? st.ask : st.alert, off = sign === st.ask ? st.alert : st.ask;
    off.material.opacity = 0;
    sign.material.opacity = needs ? 1 : 0;
    sign.position.set(st.ch.root.position.x - 0.55, 2.55 + Math.sin(t * 2.2) * 0.08 + st.ch.root.position.y, st.ch.root.position.z + 0.2);
    st.note.material.opacity = st.online && st.askNote > 0 ? 0.95 : 0;
    const ob = st.info.orb.position; // the envelope floats over the status light, wherever the theme put it
    if (st.centre || ob.x || ob.y || ob.z) loc(st, ob.x - 1.15, DESK_Z + 0.5 + ob.z, 1.62 + Math.sin(t * 1.7 + st.seed) * 0.04 + ob.y + st.lift, st.note.position);
    else st.note.position.set(st.x - 1.15, 1.62 + Math.sin(t * 1.7 + st.seed) * 0.04, DESK_Z + 0.5 + st.z);
    // a draft waiting for you: a pen hops over the desk and the desk light beats teal
    const hasDraft = st.askDraft > 0, hop = Math.abs(Math.sin(t * 3.1 + st.seed));
    st.draft.material.opacity = hasDraft ? 1 : 0;
    if (st.centre) loc(st, 1.0, DESK_Z + 0.45, 2.0 + hop * 0.4 + st.lift, st.draft.position);
    else st.draft.position.set(st.x + 1.0, 2.0 + hop * 0.4, DESK_Z + 0.45 + st.z);
    st.draft.scale.setScalar(0.8 + hop * 0.14);
    if (hasDraft && !needs) st.strip.material.color.set(0x2dd4bf).multiplyScalar(0.55 + hop * 0.6);
    st.flags.forEach((f, j) => { if (f.visible) f.userData.cloth.rotation.y = Math.sin(t * (f.userData.state === 'approved' ? 5 : 1.6) + j) * (f.userData.state === 'approved' ? 0.5 : 0.12); });
    const talking = st.talkingUntil > t;
    const ds = talking ? 'talking' : eff;
    if (st.tag.dataset.status !== ds) st.tag.dataset.status = ds;
    const hot = hovered === st.slug || selected === st.slug;
    if (st.tag.classList.contains('hot') !== hot) st.tag.classList.toggle('hot', hot);
  }

  // paper planes for messages you send
  const planes = [];
  function planeTo(slug, text) {
    const st = stations.get(slug);
    if (!st) return;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 4), new THREE.MeshBasicMaterial({ color: 0x9db4ff, toneMapped: false }));
    m.scale.z = 0.35;
    scene.add(m);
    const from = camera.position.clone().lerp(controls.target, 0.25).add(new THREE.Vector3(0, -1.5, 0));
    planes.push({ m, from, st, t: 0, text });
  }
  function tickPlanes(dt) {
    for (let i = planes.length - 1; i >= 0; i--) {
      const p = planes[i];
      p.t += dt / 0.95;
      const to = p.st.ch.root.position.clone().add(new THREE.Vector3(0, 1.9, 0));
      const mid = p.from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 3, 0));
      const u = Math.min(1, p.t), a = p.from.clone().lerp(mid, u), b = mid.clone().lerp(to, u), pos = a.lerp(b, u);
      p.m.lookAt(pos); p.m.rotateX(Math.PI / 2); p.m.position.copy(pos);
      if (p.t >= 1) {
        scene.remove(p.m); planes.splice(i, 1);
        if (p.st.online) { showBubble(p.st, p.text, 7000, 'from you', 'you'); p.st.listenUntil = performance.now() / 1000 + 3; }
      }
    }
  }

  // ---------------------------------------------------------------- camera + picking
  let tween = null;
  function flyTo(pos, target) { tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0 }; }
  // `centered` is for the Herdr view, which has no side panel to leave room for.
  let before = null; // the view the camera had before it went to a board
  function focus(slug, centered) {
    if (!slug && tween && tween.back) { selected = null; return; } // already on the way back from a board
    const was = selected && SPOTS[selected];
    if (slug && SPOTS[slug] && !was) before = { pos: camera.position.clone(), target: controls.target.clone() };
    spotMode(!!(slug && SPOTS[slug]));
    selected = slug;
    if (!slug && was && before) { const b = before; before = null; flyTo(b.pos, b.target); tween.back = true; return; }
    if (!(slug && SPOTS[slug])) before = null;
    if (slug && SPOTS[slug]) return flyTo(SPOTS[slug][0].clone(), SPOTS[slug][1].clone());
    const st = slug && stations.get(slug);
    if (!st) return flyTo(home().pos.clone(), home().target.clone());
    if (st.centre) { // the same view as of a desk in the rows, turned with the desk
      const c = centered || (PHONE && tall), lz = DESK_Z, y = st.lift;
      return flyTo(loc(st, c ? 1.8 : 3.4, lz + (c ? 10.6 : 10.0), y + (c ? 5.2 : 5.4)), loc(st, c ? 0 : 1.1, lz - 1.0, y + (c ? 2.5 : 2.3)));
    }
    if (centered || (PHONE && tall)) return flyTo(new THREE.Vector3(st.x + 1.8, 5.2, 5.2 + st.z), new THREE.Vector3(st.x, 2.5 - st.row * 0.5, -6.4 + st.z));
    flyTo(new THREE.Vector3(st.x + 3.4, 5.4, 4.6 + st.z), new THREE.Vector3(st.x + 1.1, 2.3 - st.row * 0.5, -6.4 + st.z));
  }
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  // Which board column is under the pointer, when it has more cards than it shows.
  function boardColAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit || hit.object !== boardMesh || !hit.uv) return null;
    const x = hit.uv.x * 1600, y = (1 - hit.uv.y) * 800;
    return boardCols.find((c) => c.len > c.shown && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) || null;
  }
  const boardStep = (c, n, snap) => { const v = Math.max(0, Math.min(c.len - c.shown, (boardScroll.get(c.id) || 0) + n)); boardScroll.set(c.id, snap ? Math.round(v) : v); };
  let wheelAcc = 0, boardDrag = null;
  sceneEl.addEventListener('wheel', (e) => { // over a full column the wheel moves its cards instead of the zoom
    const c = boardColAt(e); if (!c) return;
    e.preventDefault(); e.stopPropagation();
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; const n = Math.trunc(wheelAcc / 50);
    if (n) { wheelAcc -= n * 50; boardStep(c, n); }
  }, { capture: true, passive: false });
  sceneEl.addEventListener('pointerdown', (e) => { // a finger on a full column drags its cards instead of turning the room
    if (boardDrag) { controls.enabled = boardDrag.was; boardDrag = null; return; } // a second finger: back to moving the room
    if (e.pointerType !== 'touch') return;
    const c = boardColAt(e); if (!c) return;
    boardDrag = { c, y: e.clientY, id: e.pointerId, was: controls.enabled }; controls.enabled = false; // put back as it was: the board view keeps the room still
  }, true);
  addEventListener('pointermove', (e) => { if (!boardDrag || e.pointerId !== boardDrag.id) return; boardStep(boardDrag.c, (boardDrag.y - e.clientY) / 34); boardDrag.y = e.clientY; }, true); // the cards follow the finger
  const endBoardDrag = (e) => { if (boardDrag && e.pointerId === boardDrag.id) { boardStep(boardDrag.c, 0, true); controls.enabled = boardDrag.was; boardDrag = null; } }; // let go: settle on a whole card
  addEventListener('pointerup', endBoardDrag, true); addEventListener('pointercancel', endBoardDrag, true);
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    lastHit = hit || null;
    if (!hit && TOUCH) { // a finger is not a mouse: take the nearest person within reach of the tap
      let best = null, bd = 40; const v = new THREE.Vector3();
      for (const st of stations.values()) {
        v.copy(st.ch.root.position); v.y += 1.3; v.project(camera);
        const d = Math.hypot((v.x - ptr.x) * r.width / 2, (v.y - ptr.y) * r.height / 2);
        if (v.z < 1 && d < bd) { bd = d; best = st.slug; }
      }
      return best;
    }
    return hit ? hit.object.userData.slug : null;
  }
  // what on the wall board is under the last pick: 'card:KEY', 'filter:ID' or null
  let lastHit = null;
  function boardTarget() {
    if (!lastHit || lastHit.object !== boardMesh || !lastHit.uv) return null;
    const x = lastHit.uv.x * 1600, y = (1 - lastHit.uv.y) * 800;
    const h = boardHits.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    return h ? h.id : null;
  }
  let down = null, multi = false; const fingers = new Set(); // a pinch that ends must not count as a tap
  renderer.domElement.addEventListener('pointerdown', (e) => { fingers.add(e.pointerId); if (fingers.size > 1) multi = true; else { multi = false; down = [e.clientX, e.clientY]; } tween = null; });
  renderer.domElement.addEventListener('pointercancel', (e) => { fingers.delete(e.pointerId); down = null; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    fingers.delete(e.pointerId);
    if (multi || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > (TOUCH ? 14 : 6)) return;
    if (TOUCH && selected && SPOTS[selected] && pick(e) !== selected) { focus(null); return onSelect(null); } // off the board: back to the view from before
    const slug = pick(e), on = slug === '@board' && selected === '@board' ? boardTarget() : null; // a card opens only once you are at the board: the first tap goes there
    if (on && onBoard) return onBoard(on);
    onSelect(slug);
  });
  // At a board on a touch screen nothing turns: one finger slides along the board (and up or down once zoomed in),
  // two fingers zoom, and a tap anywhere off the board goes back to the view from before.
  function spotMode(on) { if (TOUCH) controls.enabled = !on; }
  function spotClamp() {
    const m = pickables.find((x) => x.userData.slug === selected); if (!m) return;
    const c = m.getWorldPosition(new THREE.Vector3()), g = m.geometry.parameters || {}, dir = controls.target.clone().sub(camera.position), dist = dir.length(); dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, camera.up).setY(0).normalize();
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
    const L = Math.max(0, (g.width || 8) / 2 - halfW * 0.8), V = Math.max(0, (g.height || 4) / 2 - halfH * 0.8); // how far the view may go before the board's edge
    const rel = controls.target.clone().sub(c), u = rel.dot(right), v = rel.y;
    const fix = right.multiplyScalar(Math.max(-L, Math.min(L, u)) - u); fix.y = Math.max(-V, Math.min(V, v)) - v;
    camera.position.add(fix); controls.target.add(fix);
  }
  {
    const el = renderer.domElement, pts = new Map(); let pinch = 0;
    el.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
      if (!TOUCH || !selected || !SPOTS[selected] || boardDrag) return; // a finger moving a column's cards does not slide the view too
      tween = null;
      const dir = controls.target.clone().sub(camera.position), dist = dir.length(); dir.normalize();
      if (pts.size === 1) {
        const k = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / el.clientHeight; // one pixel of finger, in metres at the board
        const mv = new THREE.Vector3().crossVectors(dir, camera.up).setY(0).normalize().multiplyScalar(-dx * k); mv.y = dy * k;
        camera.position.add(mv); controls.target.add(mv);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch && d > 0) camera.position.copy(controls.target).addScaledVector(dir, -Math.max(5, Math.min(26, dist * pinch / d)));
        pinch = d;
      }
      spotClamp();
    });
  }
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    hovered = pick(e);
    renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
  });
  renderer.domElement.addEventListener('wheel', () => { tween = null; }, { passive: true });

  // Glow (bloom), for themes that ask for it (theme.bloom), never on phones. The scene is drawn into an offscreen
  // picture that three treats like the screen (tone mapping and sRGB done in each material, so toneMapped:false
  // screens keep their exact colours), the bright parts are blurred on top, and a plain copy puts it on screen.
  // If pictures come too slowly with it, it switches itself off for this page.
  let composer = null, bloomPass = null;
  const B = theme.bloom;
  if (!PHONE && B && B.strength > 0) {
    try {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.isXRRenderTarget = true; // three 0.170: "like the screen" for tone mapping and colour space (WebGLRenderer getProgram)
      composer = new EffectComposer(renderer, rt);
      composer.renderTarget2.isXRRenderTarget = true; composer.renderTarget2.texture.colorSpace = THREE.SRGBColorSpace;
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), B.strength, B.radius != null ? B.radius : 0.4, B.threshold != null ? B.threshold : 1);
      composer.addPass(bloomPass);
      composer.addPass(new ShaderPass(CopyShader)); // already tone mapped and sRGB: copied as is (OutputPass would do both twice)
    } catch (e) { console.warn('bloom off', e); composer = null; }
  }
  let slowFor = 0, slowN = 0, lastFrameAt = 0;
  const KEEP_BLOOM = /[?&]bloom=1\b/.test(location.search); // ?bloom=1: never switch it off (tests on slow software GL)
  // A paused or hidden page draws nothing for a while: the first picture after it has no gap worth judging.
  const resumeSpeed = () => { lastFrameAt = 0; };
  document.addEventListener('visibilitychange', resumeSpeed);
  function watchSpeed(nowMs) { // more than 1.5 s of pictures over 70 ms apart (at least 4 of them): the glow costs too much here
    const gap = lastFrameAt ? nowMs - lastFrameAt : 0; lastFrameAt = nowMs;
    if (!composer || !gap || KEEP_BLOOM || document.hidden) return;
    if (gap > 70) { slowFor += Math.min(gap, 2000); slowN++; } // a very slow picture counts too (one long stall alone is not enough)
    else { slowFor = Math.max(0, slowFor - gap * 0.5); if (!slowFor) slowN = 0; }
    if (slowFor > 1500 && slowN >= 4) { console.info('office: bloom switched off, frames were slow'); composer.dispose(); composer = null; bloomPass = null; }
  }

  function resize() {
    const w = sceneEl.clientWidth, h = sceneEl.clientHeight;
    renderer.setSize(w, h); labels.setSize(w, h);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 58 : w / h < 1.5 ? 44 : 36;
    camera.updateProjectionMatrix();
    if (inset > 0 && h - inset > 120) camera.setViewOffset(w, h, 0, Math.round(inset / 2), w, h); else camera.clearViewOffset(); // a sheet covers the bottom: centre the room in what is left
    const wasTall = tall; tall = w / h < 0.8;
    if (PHONE && wasTall !== tall && !selected) { camera.position.copy(home().pos); controls.target.copy(home().target); tween = null; }
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let lightAt = 0;
  // Drawing is the expensive part (soft shadows, every person, every label). People idling or walking look the same at
  // 30 pictures a second; turning or zooming the room wants 60. A 120 Hz screen no longer makes it draw 120.
  let lastDraw = 0, busyUntil = 0, shadowTick = 0;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  const wake = () => { busyUntil = performance.now() + 2500; };
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchmove']) addEventListener(ev, wake, { passive: true, capture: true });
  addEventListener('pointermove', (e) => { if (e.buttons) wake(); }, { passive: true, capture: true });
  const frame = () => {
    const nowMs = performance.now();
    if (nowMs - lastDraw < (nowMs < busyUntil ? 15 : 31)) return;
    lastDraw = nowMs;
    if (++shadowTick % 3 === 0) renderer.shadowMap.needsUpdate = true; // shadows are half the drawing: they are worked out again 10 to 20 times a second, not every picture
    const dt = Math.min(0.05, clock.getDelta()), t = performance.now() / 1000;
    if (t - lightAt > 5) { lightAt = t; applyLight(); drawClock(); }
    for (const st of stations.values()) { tickCharacter(st, dt, t); tickStation(st, t); }
    tickPlanes(dt);
    // Watchdog zap, about 6.5 s: a storm cloud gathers over the desk and a ring closes in on the floor (warning),
    // then three strikes, then it clears.
    for (let i = zaps.length - 1; i >= 0; i--) {
      const z = zaps[i]; z.age = t - z.t0; z.flick += dt;   // wall-clock, so it stays in step with the sound
      const a = z.age, W = ZAP_WARN, S = 1.6, F = 2.4, r = Math.random();
      if (a < W) {
        const k = a / W, spark = r < 0.03 + k * 0.12;
        z.cm.opacity = Math.min(0.96, k * 1.6); z.cloud.scale.setScalar(0.35 + 0.65 * k);
        z.cm.emissiveIntensity = spark ? 1.4 : 0; z.light.intensity = spark ? 14 : 0; z.light.position.y = 4;
        z.ring.material.opacity = 0.45 + 0.4 * Math.sin(a * (6 + k * 16)); z.ring.scale.setScalar(2.6 - 1.6 * k);
        z.bolt.visible = false;
      } else if (a < W + S) {
        const q = a - W, on = q < 0.45 || (q > 0.62 && q < 1.0) || q > 1.18;
        if (on && z.flick > 0.06) { z.flick = 0; z.bolt.geometry.dispose(); z.bolt.geometry = z.mk(); }
        z.bolt.visible = on; z.bolt.material.opacity = r > 0.2 ? 1 : 0.4;
        z.light.position.y = 3; z.light.intensity = on ? 90 * (0.55 + r * 0.45) : 6;
        z.cm.opacity = 0.96; z.cm.emissiveIntensity = on ? 0.9 + r : 0.1;
        z.ring.material.opacity = on ? 1 : 0.5; z.ring.scale.setScalar(1 + (on ? r * 0.06 : 0));
      } else {
        const k = Math.max(0, 1 - (a - W - S) / F);
        z.bolt.visible = false; z.light.intensity = 0; z.cm.emissiveIntensity = 0;
        z.cm.opacity = 0.96 * k; z.cloud.position.y += dt * 0.2;
        z.ring.material.opacity = k * 0.9; z.ring.scale.setScalar(1 + (1 - k) * 1.8);
        if (k <= 0) {
          scene.remove(z.group); z.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
          z.cm.dispose(); z.bolt.material.dispose(); z.ring.material.dispose(); zaps.splice(i, 1);
        }
      }
    }
    tickLinks(dt);
    tickTravel(dt, t);
    hook('tick', dt, t); // the theme's moving decor (Oficina: the cleaning robot)
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      const e = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (tween.t >= 1) tween = null;
    }
    if (TOUCH && !tween) { // keep the room in sight: the point the camera looks at stays inside it
      const tx = Math.min(13, Math.max(-13, controls.target.x)), tz = Math.min(11, Math.max(-9, controls.target.z));
      camera.position.x += tx - controls.target.x; camera.position.z += tz - controls.target.z; controls.target.x = tx; controls.target.z = tz;
    }
    controls.update();
    if (composer) composer.render(dt); else renderer.render(scene, camera);
    watchSpeed(nowMs);
    labels.render(scene, camera);
    tickBoard();
    tidyLabels();
  };
  renderer.setAnimationLoop(frame);

  // ---------------------------------------------------------------- public API
  const byName = (name) => [...stations.values()].find((s) => s.agent.herdrName === name);
  let boardHash = '', needsMap = {};
  const applyNeeds = (st) => { const n = needsMap[st.agent.herdrName] || {}; st.askReq = n.req || 0; st.askNote = n.note || 0; st.askDraft = n.draft || 0; };
  // ---------------------------------------------------------------- travel: teleporting to and from other rooms
  // teleportOut: someone here goes to see a person on another floor or in another building, and a sign over
  // their desk says where they are. visitor: someone from elsewhere beams in beside the person they came to see.
  // (travel.js polls /api/visits and calls these.) This block is the same in both offices.
  const trips = [], visitors = new Map(), fxs = [], FX_DUR = 1.7, FX_GONE = 0.6, BEAM = 0x38d6ff;
  let kit = null; // textures and geometries shared by every effect: made on first use, kept for the life of the page
  function travelKit() {
    if (kit) return kit;
    const css = document.createElement('style');
    css.textContent = `
.holo { position: relative; overflow: hidden; max-width: 230px; padding: 5px 12px 6px; border-radius: 9px; text-align: center; pointer-events: none;
  font: 600 12px/1.25 system-ui, sans-serif; color: #e2fbff; text-shadow: 0 0 8px rgba(56, 214, 255, .8);
  background: linear-gradient(180deg, rgba(6, 38, 58, .8), rgba(10, 24, 50, .72)); border: 1px solid rgba(94, 234, 255, .75);
  box-shadow: 0 0 16px rgba(56, 214, 255, .5), inset 0 0 12px rgba(56, 214, 255, .22); animation: holo-in .45s ease-out, holo-pulse 2.6s ease-in-out .45s infinite; }
.holo small { display: block; font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #7de8ff; }
.holo b { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.holo::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(125, 232, 255, .13) 0 1px, transparent 1px 3px); }
.holo::after { content: ''; position: absolute; left: 0; right: 0; top: -40%; height: 40%; background: linear-gradient(180deg, transparent, rgba(160, 240, 255, .38), transparent); animation: holo-scan 2.6s linear infinite; }
@keyframes holo-in { from { opacity: 0; transform: scaleY(.1); } }
@keyframes holo-pulse { 50% { opacity: .8; box-shadow: 0 0 26px rgba(56, 214, 255, .75), inset 0 0 14px rgba(56, 214, 255, .3); } }
@keyframes holo-scan { to { top: 110%; } }
.tag.visitor .chip { border: 1px dashed rgba(94, 234, 255, .85); box-shadow: 0 0 12px rgba(56, 214, 255, .45); }
.tag.visitor .vfrom { margin-top: -2px; padding: 1px 8px; border-radius: 99px; background: rgba(8, 30, 50, .78); color: #a5f0ff; font-size: 10px; font-weight: 600; letter-spacing: .03em; white-space: nowrap; }
html.phone .holo { font-size: 11px; max-width: 170px; padding: 4px 9px 5px; }
@media (prefers-reduced-motion: reduce) { .holo, .holo::after { animation: none; } }`;
    document.head.appendChild(css);
    const col = surface(8, 128), g = col.ctx; // the light column: solid at the floor, fading out towards the top, with faint bands
    for (let y = 0; y < 128; y++) { const a = Math.pow(y / 127, 1.35) * (y % 9 < 2 ? 1 : 0.72); g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.fillRect(0, y, 8, 1); }
    const dot = surface(64, 64), gr = dot.ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    dot.ctx.fillStyle = gr; dot.ctx.fillRect(0, 0, 64, 64);
    kit = {
      colTex: col.tex, dotTex: dot.tex,
      col: new THREE.CylinderGeometry(0.62, 0.62, 3.6, 28, 1, true).translate(0, 1.8, 0),
      ring: new THREE.TorusGeometry(1, 0.035, 8, 56).rotateX(Math.PI / 2),
      disc: new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
    };
    return kit;
  }
  const glowMat = (color, o) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, ...o });

  // One transporter effect at a point on the floor. dir 'out' takes `body` away, 'in' brings it: the same timeline run
  // backwards. onFlip fires at the instant the body goes (or shows up), onDone when the last light has faded.
  function teleportFx(pos, color, dir, body, onFlip, onDone) {
    const k = travelKit(), N = 40, group = new THREE.Group();
    const mats = [glowMat(BEAM, { map: k.colTex, side: THREE.DoubleSide }), glowMat(0xd6f8ff, { map: k.colTex, side: THREE.DoubleSide }),
      glowMat(color), glowMat(BEAM), glowMat(BEAM), glowMat(BEAM, { map: k.dotTex })];
    const column = new THREE.Mesh(k.col, mats[0]), core = new THREE.Mesh(k.col, mats[1]), floor = new THREE.Mesh(k.ring, mats[2]);
    const up = [new THREE.Mesh(k.ring, mats[3]), new THREE.Mesh(k.ring, mats[4])], disc = new THREE.Mesh(k.disc, mats[5]);
    floor.position.y = 0.05; disc.position.y = 0.035; disc.scale.setScalar(1.7);
    up[0].scale.setScalar(0.66); up[1].scale.setScalar(0.66);
    const geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { seed[i * 4] = Math.random() * 6.283; seed[i * 4 + 1] = 0.12 + Math.random() * 0.5; seed[i * 4 + 2] = 0.55 + Math.random() * 0.7; seed[i * 4 + 3] = Math.random(); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pm = new THREE.PointsMaterial({ color: 0x8ff0ff, map: k.dotTex, size: 0.26, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const points = new THREE.Points(geo, pm); points.frustumCulled = false;
    const fm = new THREE.SpriteMaterial({ color: 0xe6fbff, map: k.dotTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const flash = new THREE.Sprite(fm); flash.position.y = 1.15;
    group.add(disc, floor, column, core, up[0], up[1], points, flash);
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);
    const fx = { group, mats, pm, fm, geo, arr, seed, N, column, core, floor, up, flash, points, dir, body, onFlip, onDone, age: 0, flipped: false };
    fxs.push(fx);
    return fx;
  }
  function tickFx(dt) {
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i]; f.age += dt;
      const u = Math.min(1, f.age / FX_DUR), w = f.dir === 'out' ? u : 1 - u, G = FX_GONE, a = f.age;
      const env = Math.min(smooth(0, 0.16, w), 1 - smooth(0.8, 1, w)), thin = 1 - 0.9 * smooth(G, 1, w), bump = Math.max(0, 1 - Math.abs(w - G) / 0.14);
      f.column.scale.set(thin, 1, thin); f.mats[0].opacity = env * 0.72;
      const cs = thin * (0.3 + bump * 0.45); f.core.scale.set(cs, 1 + bump * 0.08, cs); f.mats[1].opacity = env * (0.7 + 0.25 * Math.sin(a * 34));
      f.floor.scale.setScalar(w < G ? 2.4 - 1.8 * smooth(0, G, w) : 0.6 + 2.2 * smooth(G, 1, w));
      f.mats[2].opacity = (w < G ? smooth(0, 0.12, w) : 1 - smooth(G, 1, w)) * 0.95;
      f.floor.rotation.y = a * 2;
      for (let j = 0; j < 2; j++) { const ph = (a * 1.15 + j * 0.5) % 1; f.up[j].position.y = 0.1 + ph * 2.9; f.mats[3 + j].opacity = env * 0.85 * (1 - ph) * thin; f.up[j].scale.setScalar(0.66 * thin); }
      f.mats[5].opacity = env * 0.6;
      f.flash.scale.setScalar(0.4 + bump * 3.2); f.fm.opacity = bump * bump * 0.95;
      const arr = f.arr, sd = f.seed;
      for (let j = 0; j < f.N; j++) {
        const ph = (sd[j * 4 + 3] + a * sd[j * 4 + 2]) % 1, r = sd[j * 4 + 1] * (1 - ph * 0.55) * (0.35 + 0.65 * thin), an = sd[j * 4] + a * 2.4;
        arr[j * 3] = Math.cos(an) * r; arr[j * 3 + 1] = ph * 3.3; arr[j * 3 + 2] = Math.sin(an) * r;
      }
      f.geo.attributes.position.needsUpdate = true; f.pm.opacity = env * 0.95;
      if (f.body) { // stretched thin and lifted into the light
        const kb = smooth(G - 0.32, G, w);
        f.body.scale.set(1 - 0.9 * kb, 1 + 0.75 * kb, 1 - 0.9 * kb); f.body.position.y = kb * 0.45;
      }
      if (!f.flipped && u >= (f.dir === 'out' ? G : 1 - G)) { f.flipped = true; if (f.onFlip) try { f.onFlip(); } catch {} }
      if (u >= 1) {
        fxs.splice(i, 1); scene.remove(f.group);
        for (const m of f.mats) m.dispose();
        f.pm.dispose(); f.fm.dispose(); f.geo.dispose();
        if (f.body) { f.body.scale.set(1, 1, 1); f.body.position.y = 0; }
        if (f.onDone) try { f.onDone(); } catch {}
      }
    }
  }

  // ---- a person of this room, away
  function tripSign(st, label) {
    const tr = st.trip, text = String(label || 'Away').slice(0, 80);
    if (!tr.sign) {
      const el = document.createElement('div'); // CSS2DRenderer owns this element's transform; the look lives one level in
      el.innerHTML = '<div class="holo"><small>teleported</small><b></b></div>';
      tr.sign = new CSS2DObject(el); tr.sign.visible = false;
      if (PHONE) { tr.sign.center.set(0.5, 0); tr.sign.position.set(0, 1.0, DESK_Z + 0.75); } // small screen: hang it under the desk edge, clear of their name
      else { tr.sign.center.set(0.5, 1); tr.sign.position.set(0, 1.5, DESK_Z + 0.6); }
      st.group.add(tr.sign);
    }
    tr.label = text; tr.sign.element.querySelector('b').textContent = text;
  }
  function endTrip(st) {
    const tr = st.trip; if (!tr) return;
    st.trip = null;
    const i = trips.indexOf(st); if (i >= 0) trips.splice(i, 1);
    if (tr.sign) { st.group.remove(tr.sign); tr.sign.element.remove(); }
    if (tr.beam) { st.group.remove(tr.beam, tr.pad); tr.beam.material.dispose(); tr.pad.material.dispose(); }
    st.ch.body.scale.set(1, 1, 1); st.ch.body.position.y = 0;
    st.cur = {}; st.mode = 'seat'; st.hurry = false;
  }
  function tripLeave(st) {
    const tr = st.trip;
    tr.phase = 'out'; tr.hold = true;
    teleportFx(st.ch.root.position, st.agent.color, 'out', st.ch.body, () => {
      if (st.trip !== tr) return;
      tr.gone = true; tr.phase = 'away';
      // the tag moves to their chair and stays readable; whatever they were on the way to is dropped
      st.steps = []; st.at = 'desk'; st.carry = false; st.hurry = false; st.mode = 'away';
      st.ch.root.position.copy(seatOf(st)); st.ch.root.rotation.y = st.yaw || 0;
      const c = st.ch; // sitting, hands down, for when they come back
      c.hips.position.y = SEAT_Y; c.legL.rotation.x = c.legR.rotation.x = -1.5; c.armL.rotation.set(-0.4, 0, 0.1); c.armR.rotation.set(-0.4, 0, -0.1);
      c.upper.rotation.x = 0; c.head.rotation.set(0, 0, 0); c.mug.visible = c.phone.visible = c.card.visible = false;
      clearTimeout(st.bubbleTimer); st.bubble.className = 'bubble';
      const k = travelKit();
      tr.beam = new THREE.Mesh(k.col, glowMat(BEAM, { map: k.colTex, side: THREE.DoubleSide }));
      tr.beam.scale.set(0.5, 0.62, 0.5); tr.beam.position.set(0, 0, SEAT_Z);
      tr.pad = new THREE.Mesh(k.ring, glowMat(st.agent.color));
      tr.pad.scale.setScalar(0.5); tr.pad.position.set(0, 0.05, SEAT_Z);
      st.group.add(tr.beam, tr.pad);
      tr.sign.visible = true;
    });
  }
  function tripOut(st, o) {
    if (!st || !st.online) return false;
    const dur = Number(o.dur) > 0 ? Number(o.dur) : 12, now = performance.now() / 1000;
    if (st.trip) { // already away, or on the way out or back: stay longer, say the new place
      const tr = st.trip;
      if (tr.phase === 'in') { tr.next = { label: o.label, dur }; return true; }
      tr.until = now + dur + (tr.gone ? 0 : FX_DUR); tripSign(st, o.label);
      return true;
    }
    const tr = st.trip = { phase: 'say', hold: false, gone: false, at: now, until: now + dur + FX_DUR, sign: null, beam: null, pad: null, label: '', next: null };
    trips.push(st);
    tripSign(st, o.label);
    if (o.text) { showBubble(st, String(o.text), 2600); tr.at = now + 1.7; }
    return true;
  }
  function tripBack(st) { if (!st || !st.trip) return false; st.trip.until = 0; st.trip.next = null; return true; }
  function tickTrips(t) {
    for (let i = trips.length - 1; i >= 0; i--) {
      const st = trips[i], tr = st.trip;
      if (!tr) { trips.splice(i, 1); continue; }
      if (stations.get(st.slug) !== st) { endTrip(st); continue; } // their desk was taken out of the room
      if (tr.phase === 'say') { if (t >= tr.at) tripLeave(st); }
      else if (tr.phase === 'away') {
        const p = 0.5 + 0.5 * Math.sin(t * 2.6 + st.seed);
        tr.beam.material.opacity = 0.14 + p * 0.16; tr.pad.material.opacity = 0.35 + p * 0.5; tr.pad.scale.setScalar(0.5 + p * 0.06);
        if (t >= tr.until) {
          tr.phase = 'in'; tr.sign.visible = false; tr.beam.visible = tr.pad.visible = false;
          teleportFx(seatOf(st), st.agent.color, 'in', st.ch.body, () => { if (st.trip === tr) tr.gone = false; }, () => {
            if (st.trip !== tr) return;
            const next = tr.next;
            endTrip(st);
            if (next) tripOut(st, next);
          });
        }
      }
    }
  }

  // ---- someone from another room, here for a moment
  function removeVisitor(id) {
    const v = visitors.get(id); if (!v) return;
    visitors.delete(id);
    clearTimeout(v.st.bubbleTimer);
    scene.remove(v.ch.root); v.tag.remove();
    v.ch.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  function addVisitor(o) {
    const id = String(o.id != null ? o.id : `${o.name || ''}>${o.to || ''}`);
    if (o.id == null && !o.name) return false;
    if (visitors.has(id)) return true;
    const now = performance.now() / 1000, dur = Number(o.dur) > 0 ? Number(o.dur) : 10, side = plan.side || 1.9;
    const found = o.to ? byName(o.to) : null, host = found && found.online && !(found.trip && found.trip.hold) ? found : null;
    let n = 0; for (const x of visitors.values()) if (x.host === host) n++;
    let spot, yaw = 0;
    if (host) {
      // beside them wherever they are, or are heading (as startConversation does): their desk, the board or the whiteboard
      const last = [...host.steps].reverse().find((s) => s.type === 'arrive'), at = last ? last.at : host.at;
      if (at !== 'desk') { const ps = placeSpot(host, at); yaw = placeYaw(at); spot = new THREE.Vector3(ps.x - Math.sin(yaw) * (0.95 + n * 0.9), 0, ps.z - Math.cos(yaw) * (0.95 + n * 0.9)); }
      else if (host.centre) { spot = freeSpot(loc(host, (n % 2 ? -1 : 1) * CENTRE.side * (1 + (n >> 1) * 0.45), SEAT_Z + 0.25)); yaw = host.yaw + (n % 2 ? Math.PI / 2 : -Math.PI / 2); }
      else { spot = new THREE.Vector3(host.x + (n % 2 ? -1 : 1) * Math.min(1.9, side) * (1 + (n >> 1) * 0.45), 0, SEAT_Z + (host.z || 0) + 0.25); yaw = n % 2 ? Math.PI / 2 : -Math.PI / 2; }
      host.holdUntil = Math.max(host.holdUntil || 0, now + FX_DUR + dur + 1);
      if (host.steps.length) { host.steps = host.steps.filter((s) => s.pose !== 'coffee'); host.hurry = true; }
    } else spot = freeSpot(new THREE.Vector3(2.4 + (n % 4) * 1.2, 0, AISLE_Z + (plan.rows - 1) * ROW_D + 1.9 + (n >> 2) * 1.2)); // nobody to stand beside: the open floor in front of the desks
    const slug = `@visitor:${id}`, name = String(o.name || 'Visitor');
    const ch = buildCharacter({ slug, lookSlug: o.slug || name, color: o.color || '#38d6ff' }, 0);
    for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData.slug === slug) pickables.splice(i, 1); // a visitor is not someone you can open
    ch.root.position.copy(spot); ch.root.rotation.y = yaw; ch.body.visible = false;
    const tag = document.createElement('div');
    tag.className = 'tag visitor'; tag.dataset.status = 'talking';
    tag.innerHTML = '<div class="bubble"></div><div class="chip"><i class="dot"></i><b></b></div><div class="vfrom"></div>';
    tag.querySelector('b').textContent = name;
    const from = tag.querySelector('.vfrom'); from.textContent = String(o.from || ''); if (!o.from) from.style.display = 'none';
    const label = new CSS2DObject(tag);
    label.center.set(0.5, 1); label.position.set(0, host && !(host.idx % 2) ? 3.1 : 2.25, 0); // not at the height of the host's own label
    label.visible = false;
    ch.root.add(label);
    scene.add(ch.root);
    const step = { type: 'wait', dur: 1e9, pose: '', yaw, started: true };
    // just enough of a station for tickCharacter to pose them: always standing on this one step
    const st = { slug, agent: { name, color: o.color }, ch, tag, bubble: tag.querySelector('.bubble'), bubbleTimer: 0, online: true, status: 'working', askReq: 0,
      kind: 'code', kindWant: 'code', kindSince: 0, placeSince: 0, steps: [step], pending: [], at: 'desk', mode: 'stand', pose: '', phase: 0, hurry: false,
      listenUntil: 0, talkingUntil: 0, holdUntil: 0, nextBreak: 1e9, carry: false, sip: false, cur: {}, seed: (hashOf(id) % 1000) / 100, idx: 0, x: spot.x, z: spot.z - SEAT_Z, row: 0, trip: null };
    const v = { id, ch, tag, label, st, step, host, text: String(o.text || ''), dur, until: Infinity, phase: 'in', shown: false };
    visitors.set(id, v);
    teleportFx(spot, o.color || BEAM, 'in', ch.body, () => { v.shown = true; label.visible = true; }, () => {
      if (visitors.get(id) !== v) return;
      const t = performance.now() / 1000;
      v.phase = 'talk'; v.until = t + dur; step.pose = 'talk';
      if (v.text) showBubble(st, v.text, dur * 1000, host ? `to ${host.agent.name.split(' ')[0]}` : '');
      if (host) { host.listenUntil = t + dur; host.talkingUntil = t + dur; host.holdUntil = Math.max(host.holdUntil || 0, t + dur); }
    });
    return true;
  }
  function tickVisitors(dt, t) {
    for (const v of visitors.values()) {
      const root = v.ch.root;
      if (v.host) { const hp = v.host.ch.root.position, dx = hp.x - root.position.x, dz = hp.z - root.position.z; if (dx * dx + dz * dz > 0.04) v.step.yaw = Math.atan2(dx, dz); }
      v.step.dur = 1e9;
      tickCharacter(v.st, dt, t);
      v.ch.body.visible = v.shown;
      if (v.phase === 'talk' && t >= v.until) {
        v.phase = 'out'; v.step.pose = '';
        clearTimeout(v.st.bubbleTimer); v.st.bubble.className = 'bubble';
        teleportFx(root.position, v.st.agent.color || BEAM, 'out', v.ch.body, () => { v.shown = false; v.label.visible = false; }, () => removeVisitor(v.id));
      }
    }
  }
  // What a departed person's desk, character, wall screen and signs held on the GPU is freed, except what the rest
  // of the room still shows (a theme shares some materials and textures between desks; three uploads again
  // anything disposed that a later desk reuses).
  function freeUnused(roots) {
    const geos = new Set(), mats = new Set(), texs = new Set();
    const take = (o, G, M, T) => {
      if (o.geometry) G.add(o.geometry);
      for (const m of [].concat(o.material || [])) {
        M.add(m);
        for (const v of Object.values(m)) if (v && v.isTexture) T.add(v);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) T.add(u.value);
      }
    };
    for (const r of roots) r.traverse((o) => take(o, geos, mats, texs));
    const used = { g: new Set(), m: new Set(), t: new Set() };
    scene.traverse((o) => take(o, used.g, used.m, used.t));
    for (const t of [scene.background, scene.environment]) if (t && t.isTexture) used.t.add(t);
    geos.forEach((g) => used.g.has(g) || g.dispose());
    mats.forEach((m) => used.m.has(m) || m.dispose());
    texs.forEach((t) => used.t.has(t) || t.dispose());
    renderer.shadowMap.needsUpdate = true;
  }
  function tickTravel(dt, t) {
    if (!trips.length && !visitors.size && !fxs.length) return;
    try { tickTrips(t); tickVisitors(dt, t); tickFx(dt); } catch (e) { console.warn('travel', e); }
  }
  return {
    setArtifacts(counts) { // a sheet of paper standing on each desk: how many pages that person has published (chat.js)
      for (const [slug, st] of stations) {
        const n = counts[slug] || 0;
        if (!st.art) {
          if (!n) continue;
          const el = document.createElement('button'); el.type = 'button'; el.className = 'artbadge'; el.title = 'Pages they have published';
          el.addEventListener('click', (e) => { e.stopPropagation(); dispatchEvent(new CustomEvent('office-artifacts', { detail: slug })); });
          st.art = new CSS2DObject(el); st.art.center.set(0.5, 1); st.art.position.set(0.66, 1.3, DESK_Z - 0.3); st.group.add(st.art);
        }
        if (st.art.n !== n) { st.art.n = n; st.art.element.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/></svg>${n}`; }
        st.art.visible = n > 0;
      }
    },
    setAgents(agents, extra = {}) {
      // Who sits at the centre desk (theme.centre): the first role of its list that someone here has, never a temp,
      // and only while everybody else still fits in two rows.
      const centreSlug = pickCentre(agents);
      // people who left (a temp that was released), and a desk that moves between the rows and the centre (the theme
      // dresses the two differently, so it is built again): take their desk and character out of the room
      const here = new Set(agents.map((a) => a.slug));
      for (const [slug, st] of [...stations]) {
        if (here.has(slug) && st.centre === (slug === centreSlug)) continue;
        try {
          const parts = [st.group, st.ch.root, st.wall, ...st.glyphs, ...st.zs, st.alert, st.ask, st.note, st.draft];
          parts.forEach((o) => scene.remove(o)); st.tag.remove(); if (st.art) st.art.element.remove();
          for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData.slug === slug) pickables.splice(i, 1);
          freeUnused(parts);
        } catch (e) { console.warn('desk removal', e); }
        stations.delete(slug);
        if (here.has(slug)) continue; // built again below, still selected
        if (selected === slug) selected = null;
        if (hovered === slug) hovered = null;
      }
      // Up to six desks share one row; bigger teams sit in rows of up to five, one behind the other. The centre desk
      // is not in the rows: the others close up without a gap.
      const n = Math.max(1, agents.length), inRows = centreSlug ? agents.filter((a) => a.slug !== centreSlug) : agents;
      const m = Math.max(1, inRows.length), rows = m <= 6 ? 1 : Math.ceil(m / 5), per = Math.ceil(m / rows);
      const gap = rows === 1 ? Math.min(5.2, 21 / m) : Math.min(4.4, 19 / per), cx = rows === 1 ? 0.6 : 0.2;
      // Wall screens: one line, or two smaller ones when the team is big. The centre person's screen stays on the
      // wall with the others, in the middle of the (top) line.
      const tiers = n <= 6 ? 1 : 2, perTier = Math.ceil(n / tiers);
      const cell = tiers === 1 ? Math.max(Math.min(5.2, 21 / n), Math.min(4.35, 22 / n)) : Math.min(4.35, 22 / perTier);
      const sScale = Math.min(1, (cell - 0.22) / 4.1, tiers === 1 ? 1 : 0.76);
      const onWall = inRows.slice();
      if (centreSlug) onWall.splice(Math.floor(((tiers === 1 ? n : perTier) - 1) / 2), 0, agents.find((a) => a.slug === centreSlug));
      labelsEl.classList.toggle('crowded', n > 6); // big team: name only on the tags, the role shows on hover
      plan.rows = rows; plan.side = rows === 1 ? 1.9 : gap / 2;
      plan.rowX = Array.from({ length: rows }, () => []);
      centreFoot = null;
      let ri = 0;
      agents.forEach((a, idx) => {
        const isC = a.slug === centreSlug;
        const st = stations.get(a.slug) || createStation(a, idx, isC);
        st.agent = a; st.status = a.status; st.online = a.online;
        if (isC) {
          const c = centrePlace(rows), x = c.x - DESK_Z * Math.sin(c.yaw), z = c.z - DESK_Z * Math.cos(c.yaw);
          centreFoot = footOf(c);
          if (st.x !== x || st.z !== z || st.yaw !== c.yaw || st.row !== rows - 1) {
            st.x = x; st.z = z; st.yaw = c.yaw; st.row = rows - 1;
            st.group.position.set(x, st.lift, z); st.group.rotation.y = c.yaw;
            st.steps = []; st.pending = []; st.at = 'desk'; st.carry = false; st.ch.root.position.copy(seatOf(st)); st.ch.root.rotation.y = c.yaw;
          }
        } else {
          const i = ri++;
          const row = Math.floor(i / per), inRow = Math.min(per, m - row * per), z = row * ROW_D;
          const x = (i % per - (inRow - 1) / 2) * gap + cx;
          plan.rowX[row].push(x);
          if (st.x !== x || st.z !== z) {
            st.x = x; st.z = z; st.row = row; st.group.position.set(x, 0, z);
            st.steps = []; st.pending = []; st.at = 'desk'; st.carry = false; st.ch.root.position.copy(seatOf(st));
          }
        }
        const i = onWall.indexOf(a), tier = Math.floor(i / perTier), inTier = Math.min(perTier, n - tier * perTier);
        st.wall.position.set((i % perTier - (inTier - 1) / 2) * cell + 0.6, tiers === 1 ? 3.75 : 4.62 - tier * 2.02, 0);
        st.wall.scale.set(sScale, sScale, 1);
        st.doing.textContent = a.nowDoing || '';
        applyNeeds(st);
        const k = workKind(a);
        if (k !== st.kindWant) { st.kindWant = k; st.kindSince = performance.now() / 1000; }
        const tickets = a.tickets || [], nCards = Math.min(10, tickets.length), red = tickets.some((x) => /block/i.test(x.status || ''));
        st.stack.forEach((c, j) => { c.visible = j < nCards; c.material.color.set(red && j === nCards - 1 ? 0xf87171 : [0xffffff, 0xfff3c4, 0xfde68a][j % 3]); });
        const prl = a.prs || [], PRC = { approved: 0x22c55e, changes: 0xef4444, failing: 0xef4444, review: 0xfbbf24, draft: 0x9ca3af };
        st.flags.forEach((f, j) => { const x = prl[j]; f.visible = !!x; if (x) { f.userData.state = x.state; f.userData.cloth.material.color.set(PRC[x.state] || 0xfbbf24); } });
        const prKey = prl.map((x) => x.state).join(',');
        if (st.prLoad.userData.n !== prKey) {
          st.prLoad.userData.n = prKey;
          const c = st.prLoad.material.map.image.getContext('2d'), bad = prl.some((x) => x.state === 'changes' || x.state === 'failing'), ok = prl.length && prl.every((x) => x.state === 'approved');
          c.clearRect(0, 0, 128, 128);
          c.fillStyle = bad ? '#b91c1c' : ok ? '#15803d' : '#b45309'; c.beginPath(); c.roundRect(6, 30, 116, 68, 34); c.fill();
          c.fillStyle = '#fff'; c.font = '700 40px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${prl.length} PR`, 64, 66);
          st.prLoad.material.map.needsUpdate = true;
          st.prLoad.material.opacity = prl.length ? 1 : 0;
          st.prLoad.position.set(-1.3 + (Math.min(5, prl.length) - 1) * 0.13 + 0.08, 1.72, DESK_Z + 0.56);
        }
        if (st.load.userData.n !== tickets.length) { // the count over the pile
          st.load.userData.n = tickets.length;
          const c = st.load.material.map.image.getContext('2d'), t = String(tickets.length);
          c.clearRect(0, 0, 128, 128);
          c.fillStyle = red ? '#b91c1c' : '#1f2433'; c.beginPath(); c.roundRect(64 - (t.length > 1 ? 50 : 38), 26, t.length > 1 ? 100 : 76, 76, 38); c.fill();
          c.fillStyle = '#fff'; c.font = '700 54px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 64, 67);
          st.load.material.map.needsUpdate = true;
          st.load.material.opacity = tickets.length ? 1 : 0;
          st.load.position.set(0.42, 1.36 + nCards * 0.054, DESK_Z + 0.38);
        }
        drawScreen(st);
      });
      order = agents.map((a) => a.slug);
      rebuildObs();
      const lk = [...stations.values()].map((s) => `${s.slug}:${s.x.toFixed(2)},${s.z.toFixed(2)},${s.centre ? 1 : 0}`).join('|');
      if (lk !== layoutKey) { layoutKey = lk; hook('layout'); } // the theme may follow the desks (k.desks(), k.centre(), k.frontZ())
      const h = JSON.stringify([agents.map((a) => [a.slug, a.tickets]), extra.jira && extra.jira.error, new Date().getMinutes()]);
      if (h !== boardHash) { boardHash = h; drawBoard(agents, extra.jira); }
      drawTrace(extra.trace);
      dayNow = -1; applyLight();
    },
    focus,
    // what the wall board shows: { chips, show:Set|null, tone:{KEY:state}, flat:[cards]|null, selected }
    setBoard(model) { boardModel = model; if (boardLast) drawBoard(boardLast[0], boardLast[1]); },
    planeTo,
    // { herdrName: { req, note } }: who has an open question or message for the person
    setNeeds(map) { needsMap = map || {}; for (const st of stations.values()) applyNeeds(st); },
    // Someone updated a card: they carry it to the wall board and pin it.
    // The watchdog caught this person stopped while it was their move: a lightning bolt hits their desk.
    zap(name, text) {
      const st = byName(name); if (!st) return;
      const p = st.ch.root.position.clone(), top = new THREE.Vector3(p.x, p.y + 4.3, p.z - 0.2);
      const group = new THREE.Group();
      const cm = new THREE.MeshStandardMaterial({ color: 0x353a47, roughness: 1, transparent: true, opacity: 0, emissive: 0xffe066, emissiveIntensity: 0, depthWrite: false });
      const cloud = new THREE.Group(); cloud.position.copy(top).setY(p.y + 4.7);
      for (const [x, y, z, r] of [[0, 0, 0, 1.15], [-1, -0.1, 0.2, 0.85], [1, -0.05, -0.1, 0.9], [0.4, 0.35, 0.3, 0.7], [-0.5, 0.3, -0.3, 0.75], [1.75, -0.2, 0.1, 0.55], [-1.75, -0.2, 0, 0.5]]) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), cm); m.position.set(x, y, z); m.scale.y = 0.6; cloud.add(m);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.5, 56), new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y + 0.05, p.z);
      const mk = () => {
        const pts = [], n = 10;
        for (let i = 0; i <= n; i++) { const k = i / n, j = i === 0 || i === n ? 0 : 0.6; pts.push(new THREE.Vector3(top.x + (p.x - top.x) * k + (Math.random() - 0.5) * j * 2, top.y + (p.y + 2.1 - top.y) * k, top.z + (p.z - top.z) * k + (Math.random() - 0.5) * j)); }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 44, 0.075, 5, false);
      };
      const bolt = new THREE.Mesh(mk(), new THREE.MeshBasicMaterial({ color: 0xfff7c2, transparent: true, opacity: 1, toneMapped: false })); bolt.visible = false;
      const light = new THREE.PointLight(0xffe066, 0, 16); light.position.set(p.x, 4, p.z);
      group.add(cloud, ring, bolt, light); scene.add(group);
      zaps.push({ group, cloud, cm, ring, bolt, light, mk, age: 0, flick: 0, t0: performance.now() / 1000 });
      setTimeout(() => showBubble(st, `⚡ Watchdog: ${text || 'caught idle'}`, 8000), 4200);   // after the strikes: the bubble would cover them
    },
    pinCard(name, text) {
      const st = byName(name);
      if (!st || !st.online || st.steps.length || st.askReq > 0) return;
      st.carry = true;
      st.steps = [...leave(st, 0), walk(placeSpot(st, 'board')),
        { type: 'wait', dur: 2.4, pose: 'pin', yaw: -Math.PI / 2, onStart: () => { if (text) showBubble(st, text, 2400); }, onEnd: () => { st.carry = false; } },
        ...homeSteps(st, 0, LEFT_X + 1.5)];
    },
    converse(fromName, toName, text) {
      const from = byName(fromName), to = byName(toName);
      if (!from || !to || from === to || !from.online) return;
      if (from.steps.length) { from.steps = from.steps.filter((s) => s.pose !== 'coffee'); if (!from.pending.some((x) => x.to === to && x.text === text)) from.pending.push({ to, text }); if (from.pending.length > 12) from.pending.splice(0, from.pending.length - 12); } else startConversation(from, to, text);
    },
    // Travel (travel.js): this person beams out to see someone in another room, and a sign over the desk says where they are.
    teleportOut(name, o) { try { return tripOut(byName(name), o || {}); } catch (e) { console.warn('teleportOut', e); return false; } },
    teleportBack(name) { try { return tripBack(byName(name)); } catch { return false; } },
    // Someone from another room beams in beside `to`, says `text`, and leaves: { id, name, color, from, to, text, dur }
    visitor(o) { try { return addVisitor(o || {}); } catch (e) { console.warn('visitor', e); return false; } },
    setLight(mode) { lightMode = mode; dayNow = -1; applyLight(); },
    order: () => order,
    // Stops drawing entirely (used when the Herdr tab showing the office is not on screen).
    setPaused(paused) { renderer.setAnimationLoop(paused ? null : frame); resumeSpeed(); },
    setBottomInset(px) { px = Math.max(0, Math.round(px || 0)); if (px !== inset) { inset = px; resize(); } },
    view(pos, target) { flyTo(new THREE.Vector3(...pos), new THREE.Vector3(...target)); },
    zoom() { return camera.position.distanceTo(controls.target) / controls.maxDistance; }, // 1 = as far out as it goes (floors.js shows the building there)
    cameraPosition: () => camera.position.toArray().map((v) => Math.round(v * 100) / 100),
  };
}
