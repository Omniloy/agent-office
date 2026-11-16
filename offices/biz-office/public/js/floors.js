// The building: zoom all the way out and the offices show as the floors of one building, in 3D.
//   look      each floor is a small copy of its room (floor colour, walls, rug, desks, people); the one you are in
//             glows and carries a pin; a floor where something waits for you carries a pulsing beacon and a count
//   touch     tap a floor or its label to go there · drag to turn the building · pinch out (or scroll in) to go back
//   city      other buildings (other machines that run an office, from /api/buildings) stand beside this one on the
//             same street; zoom out once more to see them all, tap one to look at its floors and to connect agents
// The same file runs in both office apps. It draws on its own canvas and only while it shows.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

if (!new URLSearchParams(location.search).has('embed')) start();

function start() {
  const office = () => window.office || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const here = location.port;
  // ground floor first; the colours echo each room
  const FLOORS = [
    { name: 'Dev', port: '4317', floor: 0xead7b4, wall: 0xf3efe6, line: 0x5b6ee1, desks: 4 },
    { name: 'Business', port: '4318', floor: 0x3f8f88, wall: 0xe9f1ee, line: 0xfb923c, desks: 3 },
  ];
  const PEOPLE = [0xf87171, 0x60a5fa, 0x34d399, 0xfbbf24, 0xa78bfa, 0xf472b6];
  const GAP = 4.0, FW = 10, FD = 7, MID = ((FLOORS.length - 1) * GAP) / 2 + 0.5;
  const GOD = -2, GODH = 4.4; // the superadmin: a small figure in the top right corner of the screen (GODH: his height in scene units, clouds to halo)
  let deity = null; // { person, live, working } once the server says there is one

  const css = document.createElement('style');
  css.textContent = `
#floors { position: fixed; inset: 0; z-index: 11; display: none; background: radial-gradient(ellipse at 50% 42%, rgba(16, 21, 44, .80), rgba(5, 7, 14, .95)); -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px); opacity: 0; transition: opacity .28s ease; touch-action: none; user-select: none; -webkit-user-select: none; overflow: hidden; }
#floors.on { display: block; }
#floors.in { opacity: 1; }
#floors canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#floors .title { position: absolute; left: 0; right: 0; top: calc(var(--bar, 48px) + 16px); text-align: center; color: #c9cfe0; font: 600 12.5px var(--sans, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; pointer-events: none; }
#floors .hint { position: absolute; left: 0; right: 0; bottom: calc(var(--tab, 0px) + 18px); text-align: center; color: #8d97b0; font: 500 12.5px var(--sans, system-ui, sans-serif); pointer-events: none; }
#floors .fl { position: absolute; left: 0; top: 0; display: grid; grid-template-columns: auto auto; column-gap: 8px; align-items: center; padding: 8px 12px 8px 11px; min-height: 44px; border: 1px solid rgba(255, 255, 255, .10); border-left: 3px solid var(--c); border-radius: 12px; background: rgba(15, 19, 34, .72); color: #e8eaf2; font-family: var(--sans, system-ui, sans-serif); text-align: left; cursor: pointer; will-change: transform; transition: opacity .25s ease, background .15s ease, border-color .15s ease; -webkit-tap-highlight-color: transparent; }
#floors .fl b { font-size: 14.5px; font-weight: 600; white-space: nowrap; }
#floors .fl small { grid-column: 1 / -1; font-size: 11.5px; color: #9aa4bd; white-space: nowrap; }
#floors .fl small:empty { display: none; }
#floors .fl small.w::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: #6b7280; vertical-align: 1px; }
#floors .fl small.w.busy::before { background: #34d399; box-shadow: 0 0 0 3px rgba(52, 211, 153, .2); }
#floors .fl em { font-style: normal; font-weight: 700; font-size: 11.5px; min-width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 99px; background: #fbbf24; color: #201600; animation: fl-pulse 1.6s ease-in-out infinite; }
#floors .fl em:empty { display: none; }
#floors .fl.here { background: rgba(28, 35, 62, .9); border-color: rgba(255, 255, 255, .28); border-left-color: var(--c); }
#floors .fl.hot, #floors .fl:active { background: rgba(40, 49, 84, .95); border-color: rgba(255, 255, 255, .4); border-left-color: var(--c); }
#floors.going .fl:not(.pick), #floors.going .hint, #floors.going .title { opacity: 0; }
#floors .fl.god { min-height: 0; padding: 4px 9px 4px 8px; border-left-width: 2px; border-radius: 10px; background: rgba(15, 19, 34, .55); }
#floors .fl.god b { font-size: 12px; }
#floors .fl.god small { font-size: 10.5px; }
@keyframes fl-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, .55); } 50% { box-shadow: 0 0 0 7px rgba(251, 191, 36, 0); } }
#floors[data-mode=city] .fl:not(.god):not(.pf), #floors[data-mode=peer] .fl:not(.god):not(.pf), #floors .fl.pf.hide, #floors .bl.hide { opacity: 0 !important; pointer-events: none; }
#floors .bl { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; max-width: 190px; padding: 7px 12px 8px; border: 1px solid rgba(255, 255, 255, .10); border-radius: 12px; background: rgba(15, 19, 34, .72); color: #e8eaf2; font-family: var(--sans, system-ui, sans-serif); text-align: center; cursor: pointer; will-change: transform; transition: opacity .25s ease, background .15s ease, border-color .15s ease; -webkit-tap-highlight-color: transparent; }
#floors .bl b, #floors .bl small { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#floors .bl b { font-size: 13.5px; font-weight: 600; }
#floors .bl small { font-size: 11px; color: #9aa4bd; }
#floors .bl small:empty { display: none; }
#floors .bl i { font-style: normal; font-size: 10.5px; font-weight: 600; margin-top: 2px; padding: 2px 8px; border-radius: 99px; background: rgba(255, 255, 255, .1); color: #aab3c9; white-space: nowrap; }
#floors .bl i.on { background: rgba(52, 211, 153, .16); color: #6ee7b7; }
#floors .bl i.in { background: #fbbf24; color: #201600; animation: fl-pulse 1.6s ease-in-out infinite; }
#floors .bl i.out { background: rgba(125, 211, 252, .16); color: #93d8fb; }
#floors .bl i.paused { background: rgba(251, 191, 36, .16); color: #fcd34d; }
#floors .bl.off b { color: #aab3c9; }
#floors .bl.me { border-color: rgba(255, 255, 255, .28); background: rgba(28, 35, 62, .9); }
#floors .bl.hot, #floors .bl.sel, #floors .bl:active { background: rgba(40, 49, 84, .95); border-color: rgba(255, 255, 255, .4); }
#floors .cbar { position: absolute; left: 0; right: 0; bottom: calc(var(--tab, 0px) + 46px); display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 0 12px; pointer-events: none; transition: opacity .25s ease; }
#floors[data-mode=home] .cbar { bottom: auto; top: calc(var(--bar, 48px) + 44px); }
#floors[data-mode=home] .cbar button { min-height: 36px; padding: 0 14px; font-size: 13px; }
#floors .cbar button { pointer-events: auto; min-height: 44px; padding: 0 18px; border-radius: 99px; border: 1px solid rgba(255, 255, 255, .18); background: rgba(15, 19, 34, .82); color: #e8eaf2; font: 600 14px var(--sans, system-ui, sans-serif); cursor: pointer; -webkit-tap-highlight-color: transparent; }
#floors .cbar button.pri { background: var(--accent, #6c7cff); border-color: transparent; color: var(--on-accent, #fff); }
#floors .cbar button:disabled { opacity: .55; cursor: default; }
#floors.going .bl, #floors.going .cbar { opacity: 0; }
body.embed #floors { display: none !important; }`;
  document.head.append(css);

  const el = document.createElement('div');
  el.id = 'floors';
  el.innerHTML = '<canvas></canvas><div class="title">Omniloy HQ</div><div class="hint"></div><div class="cbar"></div>';
  document.body.append(el);
  const touch = document.documentElement.classList.contains('touch');
  const HINT = touch ? 'Tap a floor · drag to turn · pinch out to go back' : 'Click a floor · drag to turn · scroll in or Esc to go back';
  el.querySelector('.hint').textContent = HINT;

  // ---------------------------------------------------------------- the scene (built the first time it shows)
  let three = null;
  function build() {
    const renderer = new THREE.WebGLRenderer({ canvas: el.querySelector('canvas'), antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 900);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3550, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.2); sun.position.set(-8, 18, 12); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x7aa2ff, 0.9); rim.position.set(10, 4, -10); scene.add(rim);
    const tower = new THREE.Group(); scene.add(tower);
    const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, transparent: true, ...extra });
    // one building: its floors, ground floor first (this one, and every other building of the city)
    const makeFloors = (DEFS, tower, mine) => DEFS.map((f, i) => {
      const g = new THREE.Group(), mats = [], add = (m) => { mats.push(m.material); g.add(m); return m; };
      const slab = add(new THREE.Mesh(new RoundedBoxGeometry(FW, 0.42, FD, 3, 0.12), mat(f.floor)));
      slab.position.y = -0.21;
      const edge = add(new THREE.Mesh(new RoundedBoxGeometry(FW + 0.22, 0.16, FD + 0.22, 2, 0.08), mat(f.line, { emissive: f.line, emissiveIntensity: f.dark ? 1.3 : 0.55 })));
      edge.position.y = -0.36;
      const back = add(new THREE.Mesh(new THREE.BoxGeometry(FW, 1.5, 0.16), mat(f.wall))); back.position.set(0, 0.75, -FD / 2 + 0.08);
      const side = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, FD), mat(f.wall))); side.position.set(-FW / 2 + 0.08, 0.75, 0);
      for (let k = 0; k < 4; k++) { const w = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.05), mat(f.dark ? f.line : 0x9fd2ff, { emissive: f.dark ? f.line : 0x9fd2ff, emissiveIntensity: f.dark ? 1.1 : 0.35 }))); w.position.set(-3.3 + k * 2.2, 0.95, -FD / 2 + 0.19); }
      const rug = add(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.04, 40), mat(f.dark ? 0x101a40 : f.line, f.dark ? { emissive: f.line, emissiveIntensity: 0.35 } : {}))); rug.position.set(-2.2, 0.03, 1.5);
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.045, 8, 48), mat(f.dark ? f.line : 0xffffff, f.dark ? { emissive: f.line, emissiveIntensity: 1.4 } : {}))); ring.rotation.x = Math.PI / 2; ring.position.set(-2.2, 0.07, 1.5);
      // the people: one desk each, as many as the room really has; those working are in colour and move, the rest sit grey
      const crowd = new THREE.Group(); g.add(crowd);
      const fl = { people: [], crowdMats: [], n: -1, w: -2 };
      const seat = (n, working) => {
        n = Math.max(0, Math.min(16, n | 0));
        if (n === fl.n && working === fl.w) return;
        fl.n = n; fl.w = working;
        for (const c of [...crowd.children]) { crowd.remove(c); c.geometry.dispose(); }
        for (const m of fl.crowdMats) m.dispose();
        fl.crowdMats.length = 0; fl.people.length = 0;
        const cadd = (m) => { fl.crowdMats.push(m.material); crowd.add(m); return m; };
        const rows = Math.max(1, Math.ceil(n / 4)), per = Math.ceil(n / rows) || 1;
        for (let k = 0; k < n; k++) {
          const busy = working == null || k < working, col = busy ? PEOPLE[k % PEOPLE.length] : 0x7c8499;
          const x = (k % per - (per - 1) / 2) * (per > 3 ? 1.9 : 2.2) + 1.0, z = -1.6 + Math.floor(k / per) * 1.45;
          const desk = cadd(new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.42, 0.62, 2, 0.06), mat(f.dark ? 0xdfe6ff : 0xffffff))); desk.position.set(x, 0.21, z);
          const strip = cadd(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.03), mat(col, { emissive: col, emissiveIntensity: busy ? 0.6 : 0 }))); strip.position.set(x, 0.2, z + 0.32);
          const body = cadd(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.2, 4, 10), mat(col, busy ? { emissive: col, emissiveIntensity: 0.25 } : {}))); body.position.set(x, 0.5, z - 0.5);
          const head = cadd(new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), mat(busy ? 0xf2c9a5 : 0xb9bfcc))); head.position.set(x, 0.88, z - 0.5);
          fl.people.push({ body, head, ph: k * 1.7, busy });
        }
      };
      seat(f.desks, null);
      const people = fl.people;
      for (const [px, pz] of [[-FW / 2 + 0.3, FD / 2 - 0.3], [FW / 2 - 0.3, FD / 2 - 0.3], [FW / 2 - 0.3, -FD / 2 + 0.3]]) if (i < DEFS.length - 1) { const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GAP - 0.4, 8), mat(0x8d97b0, { opacity: 0.5 }))); p.position.set(px, (GAP - 0.4) / 2, pz); }
      // "you are here": a pin that bobs over the floor
      let pin = null;
      if (mine && f.port === here) {
        pin = new THREE.Group();
        const cone = add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 20), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.5 }))); cone.rotation.x = Math.PI; cone.position.y = 0.31;
        const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), mat(f.line, { emissive: f.line, emissiveIntensity: 0.9 }))); ball.position.y = 0.82;
        pin.add(cone, ball); pin.scale.setScalar(0.85); pin.position.set(0.3, 0.7, 2.85); g.add(pin); // at the front edge, where the floor above never hides it
      }
      // "waiting for you": an amber beacon with a ring that spreads out
      const beacon = new THREE.Group();
      const dot = add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 12), mat(0xfbbf24, { emissive: 0xfbbf24, emissiveIntensity: 1.2 })));
      const wave = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true })); wave.rotation.x = Math.PI / 2;
      beacon.add(dot, wave); beacon.position.set(2.4, 1.0, 2.85); beacon.visible = false; g.add(beacon);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(FW + 0.6, GAP, FD + 0.6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = GAP / 2 - 0.5; hit.userData.i = i; g.add(hit);
      tower.add(g);
      return { ...f, i, g, mats, base: mats.map((m) => m.opacity), people, crowdMats: fl.crowdMats, seat, total: f.desks, working: null, pin, beacon, wave, hit, y: i * GAP, lift: 0, alpha: 0, count: 0, born: 0 };
    });
    const floors = makeFloors(FLOORS, tower, true);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(8.5, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.9; tower.add(shadow);
    // The company mark stands on the roof: the logo itself, cut out in 3D, turning slowly over a ring of light.
    const sign = new THREE.Group(), signMats = [];
    sign.position.y = (FLOORS.length - 1) * GAP + 4.3; sign.visible = false; tower.add(sign);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.035, 8, 64), new THREE.MeshBasicMaterial({ color: 0x3b9dff, transparent: true })); halo.rotation.x = Math.PI / 2; halo.position.y = -1.75; sign.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.25, 1.9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x3b9dff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = -2.0; sign.add(beam);
    const spin = new THREE.Group(); sign.add(spin);
    new SVGLoader().load('/logo.svg', (data) => {
      const box = new THREE.Box3(), parts = [];
      for (const p of data.paths) {
        const fill = new THREE.Color(p.userData && p.userData.style && p.userData.style.fill ? p.userData.style.fill : p.color);
        const dark = fill.r + fill.g + fill.b < 0.6; // the navy half would vanish against the night: it becomes white
        const m = new THREE.MeshStandardMaterial({ color: dark ? 0xffffff : fill, emissive: dark ? 0xffffff : fill, emissiveIntensity: dark ? 0.35 : 0.75, roughness: 0.35, metalness: 0.25, transparent: true });
        const geo = new THREE.ExtrudeGeometry(SVGLoader.createShapes(p), { depth: 90, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 3, curveSegments: 20 });
        const mesh = new THREE.Mesh(geo, m); parts.push(mesh); signMats.push(m); box.expandByObject(mesh);
      }
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), k = 2.7 / Math.max(sz.x, sz.y);
      const inner = new THREE.Group(); for (const mesh of parts) { mesh.position.sub(c); inner.add(mesh); }
      inner.scale.set(k, -k, k); spin.add(inner); // SVG runs downwards
      sign.visible = true;
    });
    // In the top right corner, on a small cloud: the superadmin. Tap him to talk; he can change the whole place.
    // He is not part of the tower: frame() pins him to the corner of the screen at a fixed size in pixels.
    const god = new THREE.Group(), godMats = [], gm = (color, extra) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, transparent: true, ...extra }); godMats.push(m); return m; };
    const gadd = (geo, m, x, y, z, parent = god) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
    const cloudM = gm(0xffffff, { emissive: 0xbfd4ff, emissiveIntensity: 0.35, roughness: 1 });
    const puffs = [];
    const cloud = (x, y, z, k) => { const c = new THREE.Group(); for (const [px, py, pz, r] of [[0, 0, 0, 1], [0.95, -0.08, 0.1, 0.72], [-0.95, -0.1, -0.05, 0.78], [0.4, 0.38, -0.2, 0.66], [-0.45, 0.3, 0.25, 0.6], [1.6, -0.2, 0, 0.45], [-1.6, -0.22, 0.1, 0.5]]) gadd(new THREE.SphereGeometry(r, 16, 12), cloudM, px, py, pz, c); c.position.set(x, y, z); c.scale.set(k, k * 0.62, k); god.add(c); puffs.push({ c, x, y, ph: puffs.length * 2.1 }); return c; };
    cloud(0, -0.55, 0, 1.0); cloud(1.5, -1.05, 0.9, 0.42); cloud(-1.5, -1.15, 0.8, 0.38);
    const fig = new THREE.Group(); god.add(fig);
    const robeM = gm(0xfdfdff, { emissive: 0xffffff, emissiveIntensity: 0.3 }), skinM = gm(0xf2c9a5), hairM = gm(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 1 }), goldM = gm(0xfbbf24, { emissive: 0xfbbf24, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.4 });
    gadd(new THREE.CylinderGeometry(0.42, 0.9, 1.7, 24), robeM, 0, 0.85, 0, fig);                      // robe
    gadd(new THREE.TorusGeometry(0.5, 0.07, 8, 24, Math.PI * 1.1), goldM, 0, 1.35, 0.05, fig).rotation.set(1.2, 0.5, 0.9); // sash
    gadd(new THREE.SphereGeometry(0.44, 20, 14), robeM, 0, 1.7, 0, fig).scale.set(1.25, 0.7, 1);        // shoulders
    gadd(new THREE.SphereGeometry(0.36, 22, 16), skinM, 0, 2.2, 0, fig);                               // head
    gadd(new THREE.SphereGeometry(0.39, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 2.24, -0.04, fig); // hair
    gadd(new THREE.ConeGeometry(0.3, 0.75, 16), hairM, 0, 1.86, 0.2, fig).rotation.x = Math.PI + 0.25;   // beard
    for (const sx of [-0.13, 0.13]) gadd(new THREE.SphereGeometry(0.045, 8, 8), gm(0x1b2030), sx, 2.25, 0.33, fig);
    const armL = gadd(new THREE.CapsuleGeometry(0.11, 0.6, 4, 10), robeM, -0.62, 1.45, 0.1, fig); armL.rotation.z = -0.5;
    const armR = new THREE.Group(); armR.position.set(0.55, 1.72, 0); fig.add(armR);                    // the arm that holds the bolt
    gadd(new THREE.CapsuleGeometry(0.11, 0.6, 4, 10), robeM, 0.22, 0.34, 0, armR).rotation.z = -0.55;
    const zig = new THREE.Shape(); [[0.16, 0.9], [-0.2, 0.12], [0.04, 0.12], [-0.16, -0.9], [0.22, -0.02], [-0.02, -0.02]].forEach(([x, y], i) => (i ? zig.lineTo(x, y) : zig.moveTo(x, y)));
    const bolt = gadd(new THREE.ExtrudeGeometry(zig, { depth: 0.08, bevelEnabled: false }), goldM, 0.5, 0.85, -0.04, armR); bolt.rotation.z = -0.25;
    const aura = gadd(new THREE.TorusGeometry(0.5, 0.045, 8, 40), goldM, 0, 2.78, 0, fig); aura.rotation.x = Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.1, depthWrite: false })); glow.position.y = 1.4; god.add(glow);
    const godHit = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), new THREE.MeshBasicMaterial({ visible: false })); godHit.position.y = 1.0; godHit.userData.i = GOD; god.add(godHit);
    god.visible = false; scene.add(god);
    three = { renderer, scene, camera, tower, floors, makeFloors, mat, shadow, sign, spin, halo, beam, signMats, ray: new THREE.Raycaster(), god, godMats, fig, armR, bolt, aura, glow, puffs, godHit, goldM };
  }

  // labels: one per floor, kept beside its slab
  const labels = FLOORS.map((f) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = `fl ${f.port === here ? 'here' : ''}`; b.dataset.port = f.port;
    b.style.setProperty('--c', `#${f.line.toString(16).padStart(6, '0')}`);
    b.innerHTML = `<b>${esc(f.name)}</b><em></em><small></small><small class="w"></small>`;
    el.append(b); return b;
  });
  const gl = document.createElement('button'); gl.type = 'button'; gl.className = 'fl god'; gl.style.setProperty('--c', '#fbbf24'); gl.innerHTML = '<b></b><small></small>'; gl.hidden = true; el.append(gl);
  function paintLabels() {
    gl.hidden = !deity;
    if (deity) { gl.querySelector('b').textContent = `⚡ ${deity.person.name}`; gl.querySelector('small').textContent = !deity.live ? 'asleep' : deity.working ? 'working…' : 'tap to talk'; gl.classList.toggle('busy', !!deity.working); }
    FLOORS.forEach((f, i) => {
      const n = three ? three.floors[i].count : 0, b = labels[i];
      b.querySelector('em').textContent = n || '';
      b.querySelector('small').textContent = [f.port === here ? 'you are here' : '', n ? `${n} waiting for you` : ''].filter(Boolean).join(' · ');
      const fl = three ? three.floors[i] : null, w = b.querySelector('small.w');
      w.textContent = fl && fl.working != null ? `${fl.working} of ${fl.total} working` : fl ? `${fl.total} people` : '';
      w.classList.toggle('busy', !!(fl && fl.working));
    });
  }
  async function counts() {
    const api = office().api; if (!api || !three) return;
    try { deity = await api('/api/chat/status'); } catch { deity = null; }
    let d; try { d = await api('/api/attention'); } catch { return; }
    for (const o of d.offices || []) {
      const f = three.floors.find((x) => x.port === String(o.port)); if (!f) continue;
      f.count = o.count || 0;
      if (o.people != null) { f.total = o.people; f.working = o.working ?? null; f.seat(o.people, f.working); } // a hire or a temp shows up here by itself
    }
    paintLabels();
  }

  // ---------------------------------------------------------------- the city: the other buildings, beside this one
  // A hit or a label is one number: a floor of this building (0..n), GOD, ME (this building, seen from the city),
  // or PB + building * 100 + floor (99: the building as a whole).
  const ME = 900, PB = 1000, CHIP = { none: 'not connected', out: 'request sent', in: 'wants to connect', on: 'connected', paused: 'paused' };
  let city = null; // { sig, me, list: [building], ground, mats, slab, road, dashes, frame }
  let mode = 'home', focus = -1, moving = false, ppick = null, tall = false, myVis = 1, shiftNow = 0, cityTimer = 0, acting = false, stepAt = 0;
  const cam = { x: 0, ty: 0, d: 0 };
  const titleEl = el.querySelector('.title'), hintEl = el.querySelector('.hint'), cbar = el.querySelector('.cbar');
  const myCap = document.createElement('button'); myCap.type = 'button'; myCap.className = 'bl me hide'; myCap.dataset.b = 'me'; myCap.innerHTML = '<b></b><small>My building</small>'; el.append(myCap);
  const hexOf = (c, d) => (c == null || c === '' ? d : new THREE.Color(c).getHex());
  const junk = (o) => o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
  const sigOf = (list) => JSON.stringify(list.map((b) => [b.id, (b.floors || []).map((f) => [f.name, f.colors, f.desks])]));
  const stateOf = (b) => (b.online ? b.status || 'none' : 'off');
  function dropCity() {
    if (!city) return;
    for (const tw of city.list) { three.scene.remove(tw.root, tw.link); junk(tw.root); junk(tw.link); tw.cap.remove(); for (const f of tw.floors) f.label.remove(); }
    three.scene.remove(city.ground); junk(city.ground);
    city = null; focus = -1; ppick = null; myCap.classList.add('hide');
    if (mode !== 'home') setMode('home');
  }
  function buildCity(list, sig) {
    dropCity();
    const { scene, mat, makeFloors } = three;
    if (!three.glowTex) { // a soft pool of light under every building
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(0.45, 'rgba(255,255,255,.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128); three.glowTex = new THREE.CanvasTexture(c);
    }
    const ground = new THREE.Group(), mats = [], keep = (m) => { mats.push([m, m.opacity]); return m; };
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 27), keep(mat(0x121831, { opacity: 0.72, roughness: 1 }))); slab.position.set(0, -1.6, 2.5); ground.add(slab);
    const road = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 4.6), keep(mat(0x1d2547, { roughness: 1 }))); road.position.set(0, -1.43, 11.5); ground.add(road);
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.03, 0.14), keep(new THREE.MeshBasicMaterial({ color: 0x8d97b0, transparent: true, opacity: 0.55 })), 64); dashes.position.set(0, -1.4, 11.5); ground.add(dashes);
    const plinth = (parent, line) => { // what a building stands on: a low round base, a ring in its colour, light on the ground around it
      const base = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 7.2, 0.5, 56), keep(mat(0x1c2342, { roughness: 0.9 }))); base.position.y = -1.2; parent.add(base);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.95, 0.05, 6, 72), keep(new THREE.MeshBasicMaterial({ color: line, transparent: true, opacity: 0.8 }))); ring.rotation.x = Math.PI / 2; ring.position.y = -0.95; parent.add(ring);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(27, 27), keep(new THREE.MeshBasicMaterial({ map: three.glowTex, color: line, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }))); glow.rotation.x = -Math.PI / 2; glow.position.y = -1.44; parent.add(glow);
    };
    const cut = mats.length; plinth(ground, FLOORS[0].line); const myMats = mats.splice(cut);
    scene.add(ground);
    const towers = list.map((b, bi) => {
      const defs = (b.floors || []).slice(0, 8).map((f) => { const c = f.colors || {}; return { name: f.name || `Floor ${f.port || ''}`, port: String(f.port ?? ''), door: f.door, floor: hexOf(c.floor, 0xead7b4), wall: hexOf(c.wall, 0xf3efe6), line: hexOf(c.line, 0x5b6ee1), dark: !!c.dark, desks: Math.max(0, Math.min(8, f.desks ?? f.people ?? 4)) }; });
      if (!defs.length) defs.push({ name: 'No floors yet', port: '', door: 0, floor: 0x3a4158, wall: 0x4a5270, line: 0x8d97b0, desks: 0 });
      const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
      const floors = makeFloors(defs, g, false);
      plinth(root, defs[0].line);
      const baseHit = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.1, 1.4, 16), new THREE.MeshBasicMaterial({ visible: false })); baseHit.position.y = -0.8; baseHit.userData = { b: bi, i: 99 }; root.add(baseHit); // the base counts as the building
      scene.add(root);
      const cap = document.createElement('button'); cap.type = 'button'; cap.className = 'bl hide'; cap.dataset.b = bi; cap.innerHTML = '<b></b><small></small><i></i>'; el.append(cap);
      floors.forEach((f, i) => {
        f.hit.userData.b = bi;
        const lb = document.createElement('button'); lb.type = 'button'; lb.className = 'fl pf hide'; lb.dataset.b = bi; lb.dataset.i = i;
        lb.style.setProperty('--c', `#${f.line.toString(16).padStart(6, '0')}`); lb.innerHTML = '<b></b><small></small><small class="w"></small>'; el.append(lb); f.label = lb;
      });
      // the link to this building: an arc from roof to roof, with two beads that travel it while the agents are connected
      const link = new THREE.Group(), lm = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0 });
      const line = new THREE.Line(new THREE.BufferGeometry(), lm), bm = new THREE.MeshBasicMaterial({ color: 0xc8f1ff, transparent: true, opacity: 0 });
      const beads = [0, 0.5].map(() => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), bm); link.add(s); return s; });
      link.add(line); link.visible = false; scene.add(link);
      return { b, bi, root, g, floors, baseHit, cap, link, line, lm, bm, beads, curve: null, x: 0, n: defs.length, top: (defs.length - 1) * GAP, mid: ((defs.length - 1) * GAP) / 2 + 0.5, vis: 0, linkA: 0, born: (performance.now() - t0) / 1000 };
    });
    city = { sig, me: {}, list: towers, ground, mats, myMats, slab, road, dashes, frame: [0, 0, 60] };
    layout();
  }
  function layout() { // where every building stands, and what the camera needs to see them all
    if (!city || !three) return;
    const S = tall ? 15.5 : 24, myTop = (FLOORS.length - 1) * GAP;
    let min = 0, max = 0, top = myTop + 6.5;
    city.list.forEach((tw, k) => {
      tw.x = (k % 2 ? -1 : 1) * (Math.floor(k / 2) + 1) * S; tw.root.position.x = tw.x; min = Math.min(min, tw.x); max = Math.max(max, tw.x); top = Math.max(top, tw.top + 3);
      const sg = Math.sign(tw.x), a = new THREE.Vector3(sg * 3.4, myTop + 1.7, 0), c = new THREE.Vector3(tw.x - sg * 3.4, tw.top + 1.7, 0);
      tw.curve = new THREE.QuadraticBezierCurve3(a, new THREE.Vector3(tw.x / 2, Math.max(a.y, c.y) + 3 + Math.abs(tw.x) * 0.22, 0), c);
      tw.line.geometry.setFromPoints(tw.curve.getPoints(36));
    });
    const span = max - min + 26, mid = (min + max) / 2, m4 = new THREE.Matrix4();
    city.slab.scale.x = span; city.slab.position.x = mid; city.road.scale.x = span; city.road.position.x = mid;
    const n = Math.min(64, Math.floor((span - 2) / 3.4)); city.dashes.count = n;
    for (let i = 0; i < n; i++) { m4.makeTranslation(mid + (i - (n - 1) / 2) * 3.4, 0, 0); city.dashes.setMatrixAt(i, m4); }
    city.dashes.instanceMatrix.needsUpdate = true;
    const v = THREE.MathUtils.degToRad(three.camera.fov) / 2, h = Math.atan(Math.tan(v) * three.camera.aspect);
    city.frame = [mid, top * 0.36, Math.max(((top / 2 + 5) / Math.tan(v)) * 1.3, ((max - min) / 2 + 8.5) / Math.tan(h) / 0.92)];
  }
  function peerFrame(tw, zoom) { // the camera for one other building: as this one is framed, at its own height
    const v = THREE.MathUtils.degToRad(three.camera.fov) / 2, h = Math.atan(Math.tan(v) * three.camera.aspect);
    return [tw.x, tw.mid + (tall ? -1.6 : 0.6), Math.max(((tw.mid + 4) / Math.tan(v)) * 1.42, 6.7 / Math.tan(h) / (tall ? 0.6 : 0.8), 40) * zoom];
  }
  function setMode(m, b = -1) {
    mode = m; focus = m === 'peer' ? b : -1; moving = true; hot = -1; stepAt = performance.now();
    el.dataset.mode = m; paintCity();
  }
  function paintCity() { // every word of the city: title, hint, the building labels and their chips, the action below
    const tw = mode === 'peer' && city ? city.list[focus] : null, n = city ? city.list.length : 0;
    titleEl.textContent = !city ? 'Omniloy HQ' : mode === 'city' ? 'The city' : tw ? tw.b.name || 'Building' : city.me.name || 'Omniloy HQ';
    hintEl.textContent = !city ? HINT
      : mode === 'home' ? (touch ? 'Tap a floor · drag to turn · pinch in for the city' : 'Click a floor · drag to turn · scroll out for the city')
      : mode === 'city' ? (touch ? 'Tap a building · drag to turn' : 'Click a building · drag to turn · Esc for your building')
      : (touch ? 'Tap a floor to go there · drag to turn' : 'Click a floor to go there · drag to turn · Esc for the city');
    let html = '';
    if (city && mode === 'home') html = `<button type="button" data-act="city">City · ${n} more building${n === 1 ? '' : 's'}</button>`;
    else if (city && mode === 'city') html = '<button type="button" data-act="home">My building</button>';
    else if (tw) {
      const s = tw.b.status || 'none', dis = acting ? ' disabled' : '';
      html = '<button type="button" data-act="home">My building</button>' + (
        s === 'on' ? '<button type="button" class="pri" data-act="settings">Connected · Settings</button>'
        : s === 'paused' ? '<button type="button" class="pri" data-act="settings">Paused · Settings</button>'
        : s === 'in' ? `<button type="button" class="pri" data-act="accept"${dis}>Accept</button><button type="button" data-act="decline"${dis}>Decline</button>`
        : s === 'out' ? '<button type="button" disabled>Request sent</button>'
        : !tw.b.online ? '<button type="button" disabled>Offline</button>'
        : `<button type="button" class="pri" data-act="request"${dis}>Connect agents</button>`);
    }
    if (cbar.innerHTML !== html) cbar.innerHTML = html;
    if (!city) return;
    myCap.querySelector('b').textContent = city.me.name || 'Omniloy HQ';
    for (const t of city.list) {
      const st = stateOf(t.b), chip = t.cap.querySelector('i');
      t.cap.querySelector('b').textContent = t.b.name || 'Building';
      t.cap.querySelector('small').textContent = [t.b.owner, t.b.machine].filter(Boolean).join(' · ');
      chip.textContent = st === 'off' ? 'offline' : CHIP[st] || CHIP.none; chip.className = st;
      t.cap.classList.toggle('off', st === 'off');
      t.floors.forEach((f, i) => {
        const d = (t.b.floors || [])[i] || {}, lb = f.label, w = lb.querySelector('small.w');
        lb.querySelector('b').textContent = f.name;
        lb.querySelector('small').textContent = d.lead && d.lead.name ? d.lead.name : '';
        w.textContent = d.people == null ? '' : `${d.people} ${d.people === 1 ? 'person' : 'people'}${d.working ? ` · ${d.working} working` : ''}`;
        w.classList.toggle('busy', !!d.working);
      });
    }
  }
  async function pollCity() {
    const api = office().api; if (!api || !three) return;
    let d; try { d = await api('/api/buildings'); } catch { return; } // an office without the city: the building alone, as before
    if (!on || !d) return;
    const list = (Array.isArray(d.buildings) ? d.buildings : []).filter((b) => b && b.id != null).slice(0, 8);
    if (!list.length) { dropCity(); paintCity(); return; }
    const sig = sigOf(list);
    if (!city || city.sig !== sig) { // a building came, went or changed its floors: build again, and stay on the one in view
      const was = mode, id = mode === 'peer' && city && city.list[focus] ? city.list[focus].b.id : null;
      buildCity(list, sig);
      const at = id == null ? -1 : list.findIndex((b) => b.id === id);
      if (at >= 0) setMode('peer', at); else if (was !== 'home') setMode('city');
    } else city.list.forEach((tw, i) => { tw.b = list[i]; });
    city.me = d.me || {};
    for (const tw of city.list) tw.floors.forEach((f, i) => { const s = (tw.b.floors || [])[i]; if (s && s.people != null) f.seat(Math.min(8, s.people), s.working ?? null); });
    paintCity();
  }
  async function act(what) { // the one action of the building in view
    const tw = city && city.list[focus]; if (!tw) return;
    if (what === 'settings') { const p = office().peers; if (p && p.open) p.open(tw.b.id); else say('Connections are not available here.'); return; }
    if (acting) return; acting = true; paintCity();
    try {
      const r = await office().api(`/api/peers/${what}`, { id: tw.b.id });
      if (r && r.error) throw new Error(r.error);
      tw.b.status = what === 'request' ? 'out' : what === 'accept' ? 'on' : 'none';
      say(what === 'request' ? `Request sent to ${esc(tw.b.name)}.` : what === 'accept' ? `Connected with ${esc(tw.b.name)}.` : 'Declined.');
    } catch (e) { say(esc(e.message || 'That did not work.')); }
    acting = false; paintCity(); pollCity();
  }
  const say = (html) => { if (office().toast) office().toast(html); };
  addEventListener('office-peers', () => { if (on) pollCity(); }); // the Connections sheet changed something

  // ---------------------------------------------------------------- showing, turning, choosing
  let on = false, armed = true, timer = 0, raf = 0, t0 = 0, last = 0;
  let yaw = -0.62, yawTo = -0.62, tilt = 0.5, hot = -1, pick = -1, pickAt = 0, dist = 30, W = 1, H = 1, shift = 0, godPx = 70, godTop = 44;
  function size() {
    if (!three) return;
    W = el.clientWidth; H = el.clientHeight;
    three.renderer.setSize(W, H, false);
    tall = W / H < 0.85;
    godPx = Math.max(48, Math.min(64, H * 0.075)); godTop = tall ? 48 : 38; // the superadmin: small, under the status bar
    three.camera.aspect = W / H; three.camera.fov = tall ? 34 : 30;
    shift = tall ? Math.round(W * 0.2) : Math.round(W * 0.07); // leave the right side to the labels
    shiftNow = mode === 'city' ? 0 : shift;
    three.camera.setViewOffset(W, H, shiftNow, 0, W, H);
    three.camera.updateProjectionMatrix();
    const v = THREE.MathUtils.degToRad(three.camera.fov) / 2, h = Math.atan(Math.tan(v) * three.camera.aspect);
    dist = Math.max(((MID + 6.2) / Math.tan(v)) * 1.42, 6.7 / Math.tan(h) / (tall ? 0.6 : 0.8)); // fit the height, and the width beside the labels
    layout();
  }
  const ease = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2); // settles with a small overshoot
  const v3 = new THREE.Vector3();
  const CORNERS = [[FW / 2, FD / 2], [FW / 2, -FD / 2], [-FW / 2, FD / 2], [-FW / 2, -FD / 2]];
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = (r) => 1 - Math.exp(-dt * r);
    const going = pick >= 0, gt = going ? Math.min(1, (now - pickAt) / 520) : 0, ge = gt * gt * (3 - 2 * gt);
    const pgt = ppick ? Math.min(1, (now - ppick.at) / 520) : 0, pge = pgt * pgt * (3 - 2 * pgt); // the same, for a floor of another building
    if (!drag && !going) yawTo += Math.sin(t * 0.35) * 0.0009; // a slow sway, so it never sits dead still
    yaw += (yawTo - yaw) * k(9);
    three.tower.rotation.y = yaw;
    // one building's floors: they drop in one by one, lift under the pointer, part when one is chosen
    const step = (floors, tt, pk, ke, hotI, mid, vis) => {
      const gg = pk >= 0;
      for (const f of floors) {
        const a = Math.min(1, Math.max(0, (tt - f.i * 0.075) / 0.55)), e = a <= 0 ? 0 : ease(a);
        const want = gg ? (f.i === pk ? 0.9 : 0) : hotI === f.i ? 0.5 : 0;
        f.lift += (want - f.lift) * k(12);
        const apart = gg ? (f.i === pk ? (mid - 0.5 - f.y) * ke : Math.sign(f.i - pk) * 9 * ke) : 0;
        f.g.position.y = f.y + (1 - e) * (7 + f.i * 1.4) + f.lift * 0.5 + apart + Math.sin(t * 1.1 + f.i * 0.9) * 0.05;
        const sc = (0.82 + 0.18 * Math.min(1, e)) * (1 + f.lift * 0.06);
        f.g.scale.setScalar(sc);
        const alpha = Math.min(1, a * 1.6) * (gg && f.i !== pk ? 1 - ke : 1) * (!gg && hotI >= 0 && hotI !== f.i ? 0.55 : 1);
        f.alpha += (alpha - f.alpha) * k(14);
        f.mats.forEach((m, j) => { m.opacity = f.base[j] * f.alpha * vis; });
        for (const m of f.crowdMats) m.opacity = f.alpha * vis;
        for (const p of f.people) { const b = p.busy ? Math.abs(Math.sin(t * 2.2 + p.ph)) * 0.07 : 0; p.body.position.y = 0.5 + b; p.head.position.y = 0.88 + b; }
        if (f.pin) { f.pin.position.y = 0.7 + Math.abs(Math.sin(t * 2.6)) * 0.35; f.pin.rotation.y = t * 1.5; }
        f.beacon.visible = f.count > 0 && f.alpha > 0.2;
        if (f.beacon.visible) { const w = (t * 0.8) % 1; f.wave.scale.setScalar(1 + w * 2.6); f.wave.material.opacity = (1 - w) * 0.9 * f.alpha; f.beacon.position.y = 1.0 + Math.sin(t * 3) * 0.08; }
      }
    };
    const alone = tall && mode === 'peer'; // on a phone the building in view stands alone: the others would sit under its labels
    myVis = city ? myVis + ((alone ? 0 : 1) - myVis) * k(7) : 1;
    step(three.floors, t, pick, ge, hot >= ME ? -1 : hot, MID, myVis);
    if (city) {
      const fade = going ? 1 - ge : 1;
      for (const tw of city.list) {
        const sel = mode === 'peer' && focus === tw.bi, mine = sel && hot >= PB && Math.floor((hot - PB) / 100) === tw.bi ? (hot - PB) % 100 : -1;
        tw.vis += ((tw.b.online ? 1 : 0.3) * ((mode === 'home' && tall) || (alone && !sel) ? 0 : 1) * fade - tw.vis) * k(7); // on a phone the street is too narrow to show them beside this one
        tw.root.visible = tw.vis > 0.01;
        tw.g.rotation.y = yaw;
        if (tw.root.visible) step(tw.floors, t - Math.max(tw.born, 0.3 + tw.bi * 0.18), ppick && ppick.tw === tw ? ppick.i : -1, pge, mine < 99 ? mine : -1, tw.mid, tw.vis);
        const la = (tw.b.status === 'on' && tw.b.online ? 1 : 0) * (tall && mode !== 'city' ? 0 : 1) * fade * (ppick ? 1 - pge : 1) * Math.min(1, Math.max(0, t - 1));
        tw.linkA += (la - tw.linkA) * k(5);
        tw.link.visible = tw.linkA > 0.01;
        if (tw.link.visible) { tw.lm.opacity = 0.55 * tw.linkA; tw.bm.opacity = tw.linkA; tw.beads.forEach((s, i) => { const u = (t * 0.22 + i * 0.5) % 1; tw.curve.getPoint(i ? 1 - u : u, s.position); s.scale.setScalar(0.75 + Math.sin(u * Math.PI) * 0.6); }); }
      }
      const ga = Math.min(1, t * 2) * fade;
      for (const [m, o] of city.mats) m.opacity = o * ga;
      for (const [m, o] of city.myMats) m.opacity = o * ga * myVis;
    }
    { // the mark arrives last: it drops in spinning, then turns slowly and breathes
      const a = Math.min(1, Math.max(0, (t - 0.55) / 0.8)), e = a <= 0 ? 0 : ease(a), fade = (going ? 1 - ge : 1) * myVis;
      three.sign.position.y = (FLOORS.length - 1) * GAP + 4.3 + (1 - e) * 5 + Math.sin(t * 1.3) * 0.12 + (going ? 9 * ge : 0);
      three.spin.rotation.y = t * 0.9 + (1 - Math.min(1, a)) * 7;
      three.spin.scale.setScalar(Math.max(0.001, e));
      for (const m of three.signMats) m.opacity = Math.min(1, a * 2) * fade;
      three.sign.visible = three.signMats.length > 0 && myVis > 0.02;
      const w = (t * 0.5) % 1;
      three.halo.scale.setScalar(0.7 + w * 0.6); three.halo.material.opacity = (1 - w) * 0.8 * Math.min(1, a * 2) * fade;
      three.beam.material.opacity = 0.13 * Math.min(1, a * 2) * fade;
    }
    let cx = 0, d = dist * (1 - 0.42 * ge) * (1.12 - 0.12 * Math.min(1, t / 0.6)), ty = MID - 0.5 + 4.0 * (1 - ge); // room for the mark on the roof
    if (city && (mode !== 'home' || moving)) { // away from this building, or on the way back: the camera glides to what the mode frames
      const to = mode === 'city' ? city.frame : mode === 'peer' && city.list[focus] ? peerFrame(city.list[focus], 1 - 0.42 * pge) : [0, ty, d];
      cam.x += (to[0] - cam.x) * k(5); cam.ty += (to[1] - cam.ty) * k(5); cam.d += (to[2] - cam.d) * k(5);
      if (mode === 'home' && Math.abs(to[0] - cam.x) < 0.02 && Math.abs(to[1] - cam.ty) < 0.02 && Math.abs(to[2] - cam.d) < 0.05) moving = false;
      cx = cam.x; ty = cam.ty; d = cam.d;
    } else { cam.x = 0; cam.ty = ty; cam.d = d; }
    const sTo = mode === 'city' ? 0 : shift; // the city sits in the middle of the screen: no labels at its right
    if (Math.abs(sTo - shiftNow) > 0.5) { shiftNow += (sTo - shiftNow) * k(6); three.camera.setViewOffset(W, H, shiftNow, 0, W, H); }
    three.camera.position.set(cx, ty + Math.sin(tilt) * d, Math.cos(tilt) * d);
    three.camera.lookAt(cx, ty, 0);
    three.camera.updateMatrixWorld();
    { // the superadmin: drifts into his corner after the mark; the bolt flares while he works
      const g = three.god, a = Math.min(1, Math.max(0, (t - 0.9) / 0.9)), e = a <= 0 ? 0 : ease(a), fade = (going ? 1 - ge : 1) * Math.min(1, a * 1.6), live = !!(deity && deity.live), work = !!(deity && deity.working);
      g.visible = !!deity && a > 0;
      if (g.visible) {
        const u = godPx / GODH, sx = W - godPx * 0.6 - 12, sy = godTop + 3.3 * u; // u: pixels per scene unit; (sx, sy): where his feet go on screen
        v3.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1, 0.5).unproject(three.camera).sub(three.camera.position).normalize();
        const sc = (u * 2 * d * Math.tan(THREE.MathUtils.degToRad(three.camera.fov) / 2)) / H; // the scale that makes one unit u pixels at that distance
        g.position.copy(three.camera.position).addScaledVector(v3, d); g.position.y += ((1 - e) * 6 + (going ? 9 * ge : 0)) * sc; g.scale.setScalar(sc);
        g.rotation.y = Math.sin(t * 0.5) * 0.25 - 0.35; // faces you, turned a little towards the building
        three.fig.position.y = Math.sin(t * 1.4) * 0.14; three.fig.scale.setScalar((hot === GOD ? 1.12 : 1) * 1.15);
        three.armR.rotation.z = work ? 0.25 + Math.sin(t * 7) * 0.22 : Math.sin(t * 1.1) * 0.08;
        three.aura.rotation.z = t * 1.2; three.aura.position.y = 2.78 + Math.sin(t * 2) * 0.03;
        three.goldM.emissiveIntensity = work ? 1.2 + Math.abs(Math.sin(t * 9)) * 2.2 : live ? 1.1 : 0.15;
        three.glow.material.opacity = (work ? 0.14 + Math.abs(Math.sin(t * 9)) * 0.12 : live ? 0.1 : 0.03) * fade; three.glow.scale.setScalar(0.72 + Math.sin(t * 1.7) * 0.04);
        for (const p of three.puffs) { p.c.position.x = p.x + Math.sin(t * 0.3 + p.ph) * 0.35; p.c.position.y = p.y + Math.sin(t * 0.7 + p.ph) * 0.08; }
        for (const m of three.godMats) m.opacity = fade * (live ? 1 : 0.55);
      }
    }
    three.shadow.material.opacity = 0.32 * (going ? 1 - ge : Math.min(1, t * 2)) * myVis;
    three.renderer.render(three.scene, three.camera);
    // labels follow the right-hand corner of their floor
    const place = (floors, btns, gg, hotI, pk) => {
      let lastY = 0;
      floors.forEach((f, i) => {
        let x = -1e9, y = 0;
        for (const [cx2, cz] of CORNERS) {
          v3.set(cx2, 0, cz).applyMatrix4(f.g.matrixWorld).project(three.camera);
          const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
          if (sx > x) { x = sx; y = sy; }
        }
        const b = btns[i], bw = b.offsetWidth, bh = b.offsetHeight;
        const lx = Math.min(x + 12, W - bw - 8);
        let ly = Math.max(8, Math.min(H - bh - 8, y - bh / 2));
        if (i > 0 && !gg) ly = Math.min(ly, lastY - bh - 6); // never one on top of another (floors run bottom to top)
        lastY = ly;
        b.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
        b.style.opacity = gg ? '' : String(Math.min(1, f.alpha * 1.2));
        b.classList.toggle('hot', hotI === i); b.classList.toggle('pick', pk === i);
      });
      return lastY;
    };
    const lastY = place(three.floors, labels, going, hot, pick);
    if (deity && three.god.visible) {
      const bw = gl.offsetWidth, bh = gl.offsetHeight; // his label sits under him, against the right edge
      gl.style.transform = `translate(${(W - bw - 8).toFixed(1)}px, ${Math.max(8, Math.min(mode === 'home' ? lastY - bh - 6 : 1e9, godTop + godPx + 8)).toFixed(1)}px)`;
      gl.style.opacity = going ? '0' : '1'; gl.classList.toggle('hot', hot === GOD);
    }
    if (city) { // every building has its name under it; the one in view shows its floors as well
      const floorY = hintEl.offsetTop - 62;
      const under = (b, x, show, isHot) => {
        if (show) { v3.set(x, -1.2, 7.4).project(three.camera); show = Math.abs(v3.x) < 1; } // off the screen: no label pressed against its edge
        b.classList.toggle('hide', !show); if (!show) return;
        const bw = b.offsetWidth, bh = b.offsetHeight, sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
        b.style.transform = `translate(${Math.max(6, Math.min(W - bw - 6, sx - bw / 2)).toFixed(1)}px, ${Math.max(8, Math.min(floorY - bh, sy + 6)).toFixed(1)}px)`;
        b.classList.toggle('hot', isHot);
      };
      under(myCap, 0, mode !== 'home' && !alone, hot === ME);
      for (const tw of city.list) {
        const sel = mode === 'peer' && focus === tw.bi, hb = hot >= PB ? Math.floor((hot - PB) / 100) : -1;
        under(tw.cap, tw.x, !(mode === 'home' && tall) && !(alone && !sel) && t > 0.4, hb === tw.bi && !sel);
        tw.cap.classList.toggle('sel', sel);
        for (const f of tw.floors) f.label.classList.toggle('hide', !sel);
        if (sel) place(tw.floors, tw.floors.map((f) => f.label), !!ppick, hb === tw.bi ? (hot - PB) % 100 : -1, ppick ? ppick.i : -1);
      }
    }
    if (going && gt >= 1) arrive();
    else if (ppick && pgt >= 1) { cancelAnimationFrame(raf); location.href = `${location.protocol}//${location.hostname}:${ppick.door}/`; }
  }
  function show(v) {
    if (v === on) return; on = v;
    clearInterval(timer); clearInterval(cityTimer);
    const w = office().world;
    if (v) {
      if (!three) { try { build(); } catch { on = false; return; } }
      pick = -1; hot = -1; yaw = yawTo = -0.62 - 0.5; yawTo = -0.62; for (const f of three.floors) { f.alpha = 0; f.lift = 0; }
      mode = 'home'; focus = -1; moving = false; ppick = null; el.dataset.mode = 'home';
      if (city) for (const tw of city.list) { tw.born = 0; tw.vis = 0; tw.linkA = 0; for (const f of tw.floors) { f.alpha = 0; f.lift = 0; } }
      el.classList.remove('going'); el.classList.add('on'); size(); paintCity();
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
      t0 = last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      counts(); timer = setInterval(counts, 5000);
      pollCity(); cityTimer = setInterval(pollCity, 10000);
      if (w && w.setPaused) w.setPaused(true); // the room is hidden behind this: stop drawing it
    } else {
      el.classList.remove('in');
      if (w && w.setPaused) w.setPaused(false);
      setTimeout(() => { if (!on) { el.classList.remove('on', 'going'); cancelAnimationFrame(raf); } }, 300);
    }
  }
  function back() { armed = false; show(false); if (office().focus) office().focus(null); } // into this room again
  function choose(i) {
    if (i === GOD && pick < 0) { hot = -1; if (office().chat) office().chat.open(); return; }
    if (pick >= 0 || ppick || i < 0) return;
    if (i >= PB) { // another building: the first tap goes to it, the next one on a floor goes in
      const b = Math.floor((i - PB) / 100), fi = (i - PB) % 100, tw = city && city.list[b]; if (!tw) return;
      if (mode !== 'peer' || focus !== b) return setMode('peer', b);
      if (fi >= 99) return;
      if (!tw.b.online) return say(`${esc(tw.b.name)} is offline.`);
      const door = ((tw.b.floors || [])[fi] || {}).door;
      if (!door) return say('That floor has no door yet.');
      ppick = { tw, i: fi, door, at: performance.now() }; el.classList.add('going'); return;
    }
    if (mode !== 'home') return setMode('home'); // this building, seen from the city
    pick = i; pickAt = performance.now(); el.classList.add('going');
  }
  function arrive() {
    const f = FLOORS[pick];
    if (f.port === here) return back();
    cancelAnimationFrame(raf);
    location.href = `${location.protocol}//${location.hostname}:${f.port}/`;
  }
  function floorAt(x, y) {
    if (!three) return -1;
    const r = el.getBoundingClientRect();
    three.ray.setFromCamera(new THREE.Vector2(((x - r.left) / W) * 2 - 1, -((y - r.top) / H) * 2 + 1), three.camera);
    const hits = [...(deity ? [three.godHit] : []), ...(myVis > 0.05 ? three.floors.map((f) => f.hit) : [])];
    if (city) for (const tw of city.list) if (tw.vis > 0.05) { hits.push(tw.baseHit); for (const f of tw.floors) hits.push(f.hit); }
    const h = three.ray.intersectObjects(hits, false)[0]; if (!h) return -1;
    const u = h.object.userData;
    if (u.b == null) return u.i === GOD || mode === 'home' ? u.i : ME;
    return PB + u.b * 100 + (mode === 'peer' && focus === u.b ? u.i : 99);
  }
  const ptrs = new Map(); let drag = false, down = null, pinch0 = 0, downIdx = -1, downAct = null;
  const labelOf = (e) => {
    const c = e.target.closest && e.target.closest('.bl'); if (c) return c === myCap ? ME : PB + Number(c.dataset.b) * 100 + 99;
    const b = e.target.closest && e.target.closest('.fl');
    return b === gl ? GOD : !b ? -1 : b.classList.contains('pf') ? PB + Number(b.dataset.b) * 100 + Number(b.dataset.i) : labels.indexOf(b);
  };
  // one step between the three views: out (room < building < city) or in
  function zoomStep(out) {
    if (pick >= 0 || ppick) return;
    if (!city) { if (!out) back(); return; }
    if (performance.now() - stepAt < 450) return;
    if (out) { if (mode !== 'city') setMode('city'); } else if (mode === 'city') setMode('home'); else if (mode === 'home') back();
  }
  el.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { down = [e.clientX, e.clientY, yawTo, tilt]; drag = false; downAct = e.target.closest ? e.target.closest('[data-act]') : null; const i = labelOf(e); hot = downIdx = downAct ? -1 : i >= 0 || i === GOD ? i : floorAt(e.clientX, e.clientY); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = true; hot = -1; }
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) { if (!touch && pick < 0) { const i = labelOf(e); hot = e.target.closest && e.target.closest('.cbar button') ? -1 : i >= 0 || i === GOD ? i : floorAt(e.clientX, e.clientY); el.style.cursor = hot >= 0 || hot === GOD ? 'pointer' : 'grab'; } return; }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dp = Math.hypot(a[0] - b[0], a[1] - b[1]) - pinch0; if (pick < 0 && (dp > 46 || (city && dp < -46))) { ptrs.clear(); zoomStep(dp < 0); } return; }
    if (!down || pick >= 0) return;
    const dx = e.clientX - down[0], dy = e.clientY - down[1];
    if (!drag && Math.hypot(dx, dy) > 9) { drag = true; hot = -1; }
    if (drag) { yawTo = down[2] + dx * 0.009; tilt = Math.max(0.18, Math.min(0.95, down[3] + dy * 0.004)); }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (e.type === 'pointerup' && !drag && down && ptrs.size === 0) {
      if (downAct) { const a = downAct.dataset.act; if (!downAct.disabled && downAct.isConnected) { if (a === 'city') setMode('city'); else if (a === 'home') setMode('home'); else act(a); } }
      else choose(downIdx); // the floor (or label) the press started on
    }
    if (ptrs.size === 0) { down = null; drag = false; downAct = null; if (touch && pick < 0) hot = -1; }
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  let wheel = 0;
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!city) { wheel = e.deltaY < 0 ? wheel + 1 : 0; if (wheel >= 3 && pick < 0) { wheel = 0; back(); } return; }
    const dir = e.deltaY < 0 ? 1 : -1; wheel = Math.sign(wheel) === dir ? wheel + dir : dir; // three notches the same way make one step
    if (Math.abs(wheel) >= 3) { wheel = 0; zoomStep(dir < 0); }
  }, { passive: false });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && on && pick < 0 && !ppick) { if (mode === 'peer') setMode('city'); else if (mode === 'city') setMode('home'); else back(); } });
  addEventListener('resize', () => { if (on) size(); });

  // The room says how far out the camera is; at the limit the building takes over.
  const busy = () => !!document.querySelector('#panel.open, #inbox.show, #cards.show, .psheet.on') || document.documentElement.classList.contains('reqs-open');
  setInterval(() => {
    const w = office().world; if (!w || !w.zoom || !office().ready) return;
    const z = w.zoom();
    if (z < 0.93) armed = true;
    if (!on && armed && z >= 0.985 && !busy()) show(true);
    else if (on && pick < 0 && busy()) { armed = false; show(false); }
  }, 180);
  window.office && (window.office.floors = { show: () => show(true), hide: back, refresh: pollCity, view: (m, id) => { if (m && city) { const b = city.list.findIndex((t) => t.b.id === id); setMode(m === 'peer' && b < 0 ? 'city' : m, b); } return mode; } }); // for tests, and for the Connections sheet
}

// ---------------------------------------------------------------- the top bar on a computer
// Floors and Buildings are one click away in the bar; Voice, Connections and the superadmin's chat live under More,
// as on the phone. (The other files add their own buttons to the bar; they are moved as they appear.)
(() => {
  const root = document.documentElement;
  if (root.classList.contains('phone') || window.__GUEST__) return;
  const tools = document.querySelector('.tools'), more = document.getElementById('more'), moreBtn = document.getElementById('btn-more');
  if (!tools || !more || !moreBtn) return;
  const fl = () => (window.office || {}).floors;
  const add = (id, text, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.title = title; b.onclick = fn; tools.insertBefore(b, moreBtn); return b; };
  add('btn-floors', 'Floors', 'The whole building: every floor and who is working', () => { const f = fl(); if (f) { f.show(); f.view('home'); } });
  const city = add('btn-city', 'Buildings', 'The other buildings (other computers that run an office)', () => { const f = fl(); if (!f) return; f.show(); let n = 0; const go = () => { if (f.view('city') !== 'city' && n++ < 12) setTimeout(go, 250); }; go(); });
  city.hidden = true;
  const ORDER = ['btn-chat', 'btn-voice', 'btn-peers'];
  const move = () => { for (const id of [...ORDER].reverse()) { const b = document.getElementById(id); if (b && b.parentNode === tools) more.insertBefore(b, more.firstElementChild); } };
  move(); new MutationObserver(move).observe(tools, { childList: true });
  const look = async (n = 0) => { const o = window.office || {}; if (!o.api) { if (n < 40) setTimeout(() => look(n + 1), 400); return; } try { const d = await o.api('/api/buildings'); city.hidden = !((d.buildings || []).length); } catch { if (n < 6) setTimeout(() => look(n + 1), 5000); } }; // a busy computer answers late: ask again a few times
  look(); setInterval(look, 60000);
})();
