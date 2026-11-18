// USS HERD: the bridge of an exploration starship. STUB (phase 1): titles, texts, a dark bridge with lit trim,
// a starfield viewport, a captain's chair and a holo table, uniforms by division, so switching visibly works.
// The crafted look (hull panels, curved consoles, animated readouts, dais, doors, light strips) is still to be
// built here: see the contract in themes/index.js. Bloom is essential: shining things use k.glow(color, >1).
import * as THREE from 'three';

const DIVISION = { command: 0xd4a017, ops: 0xb3262e, science: 0x2f6fd6 };
const divisionOf = (role) => (/product|lead|superadmin|review/i.test(role || '') ? 'command' : /verif|research/i.test(role || '') ? 'science' : 'ops');

function starfield(k, w, h, planet) {
  const s = k.surface(w, h), g = s.ctx;
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#02030a'); bg.addColorStop(1, '#070a1c');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const neb = g.createRadialGradient(w * 0.7, h * 0.4, 0, w * 0.7, h * 0.4, w * 0.35);
  neb.addColorStop(0, 'rgba(140,60,200,.35)'); neb.addColorStop(1, 'rgba(140,60,200,0)');
  g.fillStyle = neb; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 900; i++) { const b = (k.hashOf(`s${i}`) % 100) / 100; g.fillStyle = `rgba(255,255,255,${0.3 + b * 0.7})`; g.fillRect((i * 7919) % w, (i * 104729) % h, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1); }
  if (planet) {
    const [px, py, pr] = planet, pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, '#7fd1c7'); pg.addColorStop(0.6, '#2c6f8f'); pg.addColorStop(1, '#0b1630');
    g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill();
  }
  return s;
}

export default {
  id: 'nave',
  name: 'USS HERD',
  roles: {
    Product: 'Capitán', Development: 'Ingeniero de sistemas', Verification: 'Oficial científico',
    Infrastructure: 'Jefe de máquinas', Lead: 'Primer oficial', Research: 'Oficial de exploración',
    Prototyping: 'Ingeniero de prototipos', Review: 'Oficial táctico', Superadmin: 'Almirante',
  },
  texts: { room: 'Puente de mando', board: 'Registro de misiones', trace: 'Bitácora', composer: 'Orden para @{name}, o @all para toda la tripulación' },
  exposure: 1.0,
  bloom: { strength: 0.9, radius: 0.55, threshold: 1 },
  boardStyle: { bg: '#060b16', ink: '#7dd3fc' },

  shell(k) {
    const { room, box, mat, glow, surface, C: { BACK_Z, LEFT_X, WALL_H } } = k;
    // deck: dark plates with a faint grid
    const f = surface(512, 512), g = f.ctx;
    g.fillStyle = '#1a1f2b'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(120,170,220,.16)'; g.lineWidth = 3;
    for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(512, x); g.stroke(); }
    f.tex.wrapS = f.tex.wrapT = THREE.RepeatWrapping; f.tex.repeat.set(6, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), mat(0xffffff, { map: f.tex, roughness: 0.35, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    room.add(floor, box(26.6, 0.6, 18.6, 0x0b0e16, { y: -0.31, cast: false }));
    // hull walls
    const hull = mat(0x262d3b, { roughness: 0.55, metalness: 0.45 });
    room.add(box(26.6, WALL_H, 0.3, 0, { m: hull, y: WALL_H / 2, z: BACK_Z - 0.15 }), box(0.3, WALL_H, 18.3, 0, { m: hull, x: LEFT_X - 0.15, y: WALL_H / 2, z: 0.15 }));
    // panoramic viewport above the screens, and one on the left wall
    const sky = starfield(k, 2048, 160, [1500, 240, 220]);
    const view = new THREE.Mesh(new THREE.PlaneGeometry(25, 1.75), new THREE.MeshBasicMaterial({ map: sky.tex, toneMapped: false }));
    view.position.set(0, 6.05, BACK_Z + 0.05);
    const side = starfield(k, 512, 640, [380, 200, 120]);
    const view2 = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.6), new THREE.MeshBasicMaterial({ map: side.tex, toneMapped: false }));
    view2.rotation.y = Math.PI / 2; view2.position.set(LEFT_X + 0.05, 3.5, 5.3);
    room.add(view, view2);
    // emissive trim lines
    const trim = glow(0x38d6ff, 2.4);
    room.add(box(26, 0.05, 0.04, 0, { m: trim, y: 5.1, z: BACK_Z + 0.04, cast: false }), box(26, 0.05, 0.04, 0, { m: trim, y: 0.08, z: BACK_Z + 0.04, cast: false }),
      box(0.04, 0.05, 18, 0, { m: trim, x: LEFT_X + 0.04, y: 0.08, cast: false }), box(0.04, 0.05, 18, 0, { m: trim, x: LEFT_X + 0.04, y: 6.95, cast: false }));
  },

  decor(k) {
    const { room, box, cyl, mat, glow } = k;
    // captain's chair on a lit dais
    const dais = cyl(2.2, 2.4, 0.22, 0x2a3242, { x: -1, y: 0.11, z: 3.4, seg: 48 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.03, 8, 64), glow(0xd4a017, 2.2));
    ring.rotation.x = Math.PI / 2; ring.position.set(-1, 0.23, 3.4);
    const chair = new THREE.Group(), seat = mat(0x3b1f24, { roughness: 0.6 });
    chair.add(box(1.0, 0.18, 0.9, 0, { m: seat, y: 0.75, r: 0.06 }), box(1.0, 1.3, 0.2, 0, { m: seat, y: 1.4, z: -0.4, r: 0.08 }), cyl(0.2, 0.32, 0.6, 0x1b2130, { y: 0.4 }),
      box(0.16, 0.12, 0.8, 0x1b2130, { x: -0.55, y: 1.0 }), box(0.16, 0.12, 0.8, 0x1b2130, { x: 0.55, y: 1.0 }));
    chair.position.set(-1, 0.22, 3.6); chair.rotation.y = Math.PI;
    room.add(dais, ring, chair);
    // holo table: a slowly turning wireframe planet over a glowing ring
    const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x38d6ff).multiplyScalar(1.6), wireframe: true, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }));
    holo.position.set(4.6, 2.1, 5.2);
    const top = cyl(1.1, 1.1, 0.12, 0x1b2130, { x: 4.6, y: 1.0, z: 5.2, seg: 40 }), base = cyl(0.4, 0.6, 1.0, 0x262d3b, { x: 4.6, y: 0.5, z: 5.2 });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.025, 8, 64), glow(0x38d6ff, 2.6));
    halo.rotation.x = Math.PI / 2; halo.position.set(4.6, 1.08, 5.2);
    room.add(top, base, halo, holo);
    k.my.holo = holo;
    const l = new THREE.PointLight(0x38d6ff, 6, 8, 1.8); l.position.set(4.6, 2.2, 5.2); room.add(l);
    k.my.roomLamps = [];
  },

  fixtures(k, fx) { // dark frames with a lit edge
    fx.board.frame.material = k.mat(0x151a26, { roughness: 0.5, metalness: 0.5 });
    fx.trace.frame.material = k.mat(0x1f2633, { roughness: 0.5, metalness: 0.5 });
    fx.clock.rim.material = k.glow(0x38d6ff, 1.8);
  },

  clockFace(c, d) {
    c.fillStyle = '#060b16'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#38d6ff'; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; c.lineWidth = i % 3 ? 3 : 7; c.beginPath(); c.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); c.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112); c.stroke(); }
    const hand = (a, len, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); c.stroke(); };
    c.strokeStyle = '#e2f6ff'; hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 58, 10); hand(d.getMinutes() * (Math.PI / 30), 88, 6);
  },

  station(k, st) {
    const p = st.props;
    p.mats.wood.color.set(0x2a3242); p.mats.wood.metalness = 0.5; p.mats.wood.roughness = 0.4;
    p.mats.frame.color.set(0x1b2130);
    p.lamp.visible = false; for (const m of p.plant) m.visible = false;
    p.bezel.material = k.mat(0x0d1220, { roughness: 0.4, metalness: 0.6 });
    st.group.add(k.box(2.9, 0.025, 0.03, 0, { m: k.glow(0x38d6ff, 2.2), y: 1.045, z: k.C.DESK_Z + 0.76, cast: false }));
  },

  plate(ctx, p) {
    ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 128, 14); ctx.fill();
    ctx.fillStyle = p.color; ctx.fillRect(0, 0, 14, 128);
    ctx.fillStyle = '#e2f6ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 44px system-ui'; ctx.fillText(p.name, 263, 48);
    ctx.fillStyle = '#7dd3fc'; ctx.font = '500 28px system-ui'; ctx.fillText(p.title || '', 263, 96);
  },

  outfit(k, ch, a) { // uniform in the division colour, dark trousers, a gold badge
    const div = a && a.role ? divisionOf(a.role) : 'ops';
    ch.mats.shirt.color.set(DIVISION[div]); ch.mats.shirtDark.color.set(0x111827); ch.mats.pants.color.set(0x111827);
    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), k.glow(0xffd166, 1.3));
    badge.scale.set(1, 1.4, 0.5); badge.position.set(-0.14, 0.5, 0.21);
    ch.wear(ch.upper, badge);
  },

  daylight(k) { // space at any hour
    const { scene, hemi, sun } = k;
    scene.background = new THREE.Color(0x03050c);
    if (scene.fog) scene.fog.color.copy(scene.background);
    hemi.intensity = 1.1; hemi.color.set(0x9fb6ff); hemi.groundColor.set(0x1a1f2b);
    sun.intensity = 1.4; sun.color.set(0xcfe3ff); sun.position.set(-9, 16, 11);
    scene.environmentIntensity = 0.25;
  },

  tick(k, dt) { if (k.my.holo) k.my.holo.rotation.y += dt * 0.35; },
};
