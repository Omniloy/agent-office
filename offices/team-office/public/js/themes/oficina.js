// Oficina: the office as it has always looked. It is also the base of every other theme: whatever a theme leaves
// out comes from here (see themes/index.js for the contract).
import * as THREE from 'three';

// Each floor served by this app has its own Oficina, picked by port (the guest listener is port + 1000): floor,
// colours, the neon name sign and a centrepiece. The other themes keep their own look.
const FLOORS = {
  dev: { floor: 'wood', wall: 0xf0e9dd, trim: 0x3a3f52, shelf: 0xcaa778, rug: 0x35406e, rugRing: 0xe9d9b8, sofa: [0x5b6ee1, 0x4f61cf],
    pillows: [0xfbbf24, 0xfb7185], bags: [0xfb7185, 0x34d399, 0xfbbf24], shade: 0xffe2a8, light: 0xffd9a0, sign: ['DEV', 'MarIA', '#7c9cff'] },
  crm: { floor: 'concrete', wall: 0xe2eeeb, trim: 0x1f3b3a, shelf: 0x7d8f8c, rug: 0x134e4a, rugRing: 0x5eead4, sofa: [0x0f766e, 0x115e59],
    pillows: [0xfda4af, 0xfcd34d], bags: [0x14b8a6, 0xf59e0b, 0x0ea5e9], shade: 0xe3fbf6, light: 0xdff4ff, sign: ['CRM', 'Omniloy CRM', '#2dd4bf'], prop: 'crm' },
  web: { floor: 'terrazzo', wall: 0xfaefe2, trim: 0x4a2c1d, shelf: 0x3f3f46, rug: 0x4c1d95, rugRing: 0xfb923c, sofa: [0xf97316, 0xea580c],
    pillows: [0xa78bfa, 0xfde047], bags: [0xec4899, 0xf97316, 0x8b5cf6], shade: 0xffd6a8, light: 0xffc48a, sign: ['WEB', 'omniloy.com', '#fb923c'], prop: 'web' },
  lab: { floor: 'epoxy', wall: 0xe9ecf7, trim: 0x1e1b4b, shelf: 0x334155, rug: 0x1e1b4b, rugRing: 0x818cf8, sofa: [0x4338ca, 0x3730a3],
    pillows: [0x22d3ee, 0xf0abfc], bags: [0x6366f1, 0x22d3ee, 0xa3e635], shade: 0xe0e7ff, light: 0xe6ecff, sign: ['LAB', 'I+D', '#818cf8'], prop: 'lab' },
};
const PROP = { x: 4.9, z: 6.6, r: 1.15 }; // where a floor's centrepiece stands, and half the side of the square it covers
const LOOK = FLOORS[{ 319: 'crm', 320: 'web', 321: 'lab' }[Number(globalThis.location?.port) % 1000]] || FLOORS.dev;

export default {
  id: 'oficina',
  name: 'Oficina',
  roles: {},
  texts: { room: '', board: 'Team board', trace: 'Traceability', traceEmpty: 'Traceability matrix', composer: 'Message @{name}, or @all for everyone' },
  exposure: 1.08,
  bloom: null,

  // floor, walls, skirting, clerestory windows on the back wall and a big one on the left wall
  shell(k) {
    const { room, box, mat, surface, C: { BACK_Z, LEFT_X, WALL_H } } = k;
    const windowMat = k.my.windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    {
      const sky = surface(256, 128), c = sky.ctx, gr = c.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, '#8fc7ff'); gr.addColorStop(1, '#e6f4ff'); c.fillStyle = gr; c.fillRect(0, 0, 256, 128);
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (const [x, y, r] of [[46, 52, 15], [66, 46, 21], [92, 54, 14], [176, 80, 13], [196, 73, 19], [220, 82, 12]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
      windowMat.map = sky.tex;
    }
    const f = surface(1024, 1024), g = f.ctx;
    if (LOOK.floor === 'concrete') { // polished concrete tiles
      g.fillStyle = '#9fa9a7'; g.fillRect(0, 0, 1024, 1024);
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        const s = 168 + ((tx * 31 + ty * 17) % 14);
        g.fillStyle = `rgb(${s - 6},${s + 4},${s + 2})`; g.fillRect(tx * 256 + 2, ty * 256 + 2, 252, 252);
      }
      for (let i = 0; i < 2600; i++) {
        const x = (i * 431) % 1024, y = (i * 769) % 1024, r = 1 + (i % 4);
        g.fillStyle = i % 3 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.06)'; g.fillRect(x, y, r * 3, r);
      }
    } else if (LOOK.floor === 'epoxy') { // a lab's slate epoxy floor with a faint measuring grid
      g.fillStyle = '#3b4256'; g.fillRect(0, 0, 1024, 1024);
      let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let i = 0; i < 4000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(rnd() * 1024, rnd() * 1024, 2, 2); }
      g.strokeStyle = 'rgba(129,140,248,.28)'; g.lineWidth = 2;
      for (let k = 0; k <= 1024; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 1024); g.moveTo(0, k); g.lineTo(1024, k); g.stroke(); }
    } else if (LOOK.floor === 'terrazzo') { // cream terrazzo with coloured chips
      g.fillStyle = '#efe3d2'; g.fillRect(0, 0, 1024, 1024);
      const chips = ['#f97316', '#fb923c', '#a78bfa', '#f472b6', '#9ca3af', '#fde68a', '#57534e'];
      let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); // same chips every load
      for (let i = 0; i < 1400; i++) {
        const x = rnd() * 1024, y = rnd() * 1024, r = 2 + rnd() * rnd() * 14;
        g.fillStyle = chips[Math.floor(rnd() * chips.length)]; g.beginPath();
        g.ellipse(x, y, r, r * (0.45 + rnd() * 0.5), rnd() * 3.2, 0, 7); g.fill();
      }
    } else {
    g.fillStyle = '#c59d74'; g.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < 16; row++) {
      let x = (row % 2) * -90;
      while (x < 1024) {
        const w = 150 + ((row * 37 + x) % 90);
        const shade = 190 + ((row * 53 + x * 7) % 26);
        g.fillStyle = `rgb(${shade + 8},${shade - 34},${shade - 76})`;
        g.fillRect(x + 1, row * 64 + 1, w - 2, 62);
        x += w;
      }
    }
    for (let i = 0; i < 520; i++) { // grain
      const gx = (i * 197) % 1024, gy = (i * 89) % 1024;
      g.fillStyle = i % 2 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
      g.fillRect(gx, gy, 40 + ((i * 13) % 90), 1.5);
    }
    }
    f.tex.wrapS = f.tex.wrapT = THREE.RepeatWrapping;
    f.tex.repeat.set(4, 3);
    const floor = k.my.floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), mat(0xffffff, { map: f.tex, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    room.add(floor, box(26.6, 0.6, 18.6, 0x1b1f2e, { y: -0.31, cast: false }));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), mat(0x141827, { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62;
    room.add(ground);

    const wall = k.my.wallMat = mat(LOOK.wall);
    room.add(box(26.6, WALL_H, 0.3, 0, { m: wall, y: WALL_H / 2, z: BACK_Z - 0.15 }));
    room.add(box(0.3, WALL_H, 18.3, 0, { m: wall, x: LEFT_X - 0.15, y: WALL_H / 2, z: 0.15 }));
    room.add(box(26, 0.22, 0.08, LOOK.trim, { y: 0.11, z: BACK_Z + 0.04, cast: false }), box(0.08, 0.22, 18, LOOK.trim, { x: LEFT_X + 0.04, y: 0.11, cast: false }));
    for (let i = 0; i < 5; i++) {
      const x = -10.4 + i * 5.2;
      room.add(box(4.4, 1.25, 0.1, 0x2d3246, { x, y: 6.25, z: BACK_Z + 0.03, cast: false }));
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(4.15, 1.0), windowMat);
      pane.position.set(x, 6.25, BACK_Z + 0.09);
      room.add(pane, box(0.06, 1.0, 0.04, 0x2d3246, { x, y: 6.25, z: BACK_Z + 0.11, cast: false }));
    }
    room.add(box(0.1, 3.9, 5.6, 0x2d3246, { x: LEFT_X + 0.03, y: 3.5, z: 5.3, cast: false }));
    for (let i = 0; i < 2; i++) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 3.6), windowMat);
      pane.rotation.y = Math.PI / 2;
      pane.position.set(LEFT_X + 0.09, 3.5, 3.95 + i * 2.7);
      room.add(pane);
    }
  },

  // bookshelf, sunlight on the floor, lounge, coffee bar, plants, floor lamps, a cleaning robot
  decor(k) {
    const { room, box, cyl, mat, surface, C: { BACK_Z, LEFT_X } } = k;
    const roomLamps = k.my.roomLamps = [], sunPatches = k.my.sunPatches = [];
    {
      const sx = -11.75, sz = BACK_Z + 0.3, shelfM = mat(LOOK.shelf, { roughness: 0.6 });
      room.add(box(1.8, 3.4, 0.05, 0, { m: shelfM, x: sx, y: 1.7, z: sz - 0.2 }), box(0.06, 3.4, 0.46, 0, { m: shelfM, x: sx - 0.9, y: 1.7, z: sz }), box(0.06, 3.4, 0.46, 0, { m: shelfM, x: sx + 0.9, y: 1.7, z: sz }));
      const bookM = [0x7c9cff, 0xfbbf24, 0xfb7185, 0x34d399, 0xf3ead9, 0x6b7489, 0xc084fc].map((c) => mat(c, { roughness: 0.8 }));
      for (let r = 0; r < 5; r++) {
        const y = 0.06 + r * 0.82;
        room.add(box(1.8, 0.05, 0.46, 0, { m: shelfM, x: sx, y, z: sz, cast: false }));
        if (r === 4) break;
        let x = sx - 0.82;
        for (let n = 0; x < sx + 0.66; n++) {
          const w = 0.075 + ((r * 7 + n * 3) % 5) * 0.02, h = 0.42 + ((r * 5 + n * 11) % 6) * 0.045;
          if ((r + n) % 7 !== 5) room.add(box(w, h, 0.3, 0, { m: bookM[(r * 3 + n) % bookM.length], x: x + w / 2, y: y + 0.025 + h / 2, z: sz + 0.02, cast: false }));
          x += w + 0.014;
        }
      }
    }

    // sunlight falling on the floor through the side window
    {
      const sp = surface(64, 128), c = sp.ctx, grad = c.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.25, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad; c.fillRect(6, 0, 52, 128);
      for (let i = 0; i < 2; i++) {
        const geo = new THREE.PlaneGeometry(2.3, 6.2);
        geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 2 - 0.38);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: sp.tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        m.position.set(LEFT_X + 3.6, 0.03, 3.6 + i * 2.7);
        room.add(m); sunPatches.push(m);
      }
    }

    // lounge
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48), mat(LOOK.rug, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-1, 0.012, 3.2); rug.receiveShadow = true;
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.85, 48), mat(LOOK.rugRing, { roughness: 1 }));
    rug2.rotation.x = -Math.PI / 2; rug2.position.set(-1, 0.016, 3.2);
    room.add(rug, rug2);
    const sofa = new THREE.Group(), [sofaA, sofaB] = LOOK.sofa, [pilA, pilB] = LOOK.pillows;
    sofa.add(box(3.4, 0.5, 1.2, sofaA, { y: 0.45, r: 0.12 }), box(3.4, 0.9, 0.35, sofaB, { y: 0.85, z: -0.5, r: 0.12 }),
      box(0.35, 0.75, 1.2, sofaB, { x: -1.6, y: 0.6, r: 0.1 }), box(0.35, 0.75, 1.2, sofaB, { x: 1.6, y: 0.6, r: 0.1 }),
      box(0.7, 0.3, 0.5, pilA, { x: -0.9, y: 0.85, z: -0.2, r: 0.1 }), box(0.7, 0.3, 0.5, pilB, { x: 0.95, y: 0.85, z: -0.2, r: 0.1 }));
    sofa.position.set(-10.6, 0, 3.6); sofa.rotation.y = Math.PI / 2;
    room.add(sofa, cyl(0.8, 0.8, 0.08, 0xf3ead9, { x: -8, y: 0.5, z: 3.6, seg: 32 }), cyl(0.08, 0.3, 0.5, 0x2d3246, { x: -8, y: 0.25, z: 3.6 }));
    for (const [x, z, c] of [[-2.6, 4.6, LOOK.bags[0]], [0.7, 4.9, LOOK.bags[1]], [-0.9, 1.6, LOOK.bags[2]]]) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), mat(c));
      bag.scale.y = 0.62; bag.position.set(x, 0.36, z); bag.castShadow = true;
      room.add(bag);
    }
    // coffee bar (idle people come here for a break: see k.spots.coffee)
    room.add(box(1.3, 1.05, 3.6, 0xf3ead9, { x: 10.6, y: 0.525, z: 0.6, r: 0.06 }), box(1.4, 0.08, 3.7, 0x6b4a33, { x: 10.6, y: 1.09, z: 0.6 }),
      box(0.62, 0.8, 0.6, 0x23283a, { x: 10.7, y: 1.53, z: -0.3, r: 0.06 }), box(0.3, 0.06, 0.3, 0xd1d5db, { x: 10.45, y: 1.2, z: -0.3 }),
      cyl(0.09, 0.07, 0.16, 0xffffff, { x: 10.4, y: 1.21, z: 0.7 }), cyl(0.09, 0.07, 0.16, 0xfbbf24, { x: 10.5, y: 1.21, z: 1.0 }),
      cyl(0.28, 0.28, 0.9, 0x9bd3ff, { x: 10.7, y: 1.6, z: 1.9, m: mat(0x9bd3ff, { transparent: true, opacity: 0.7, roughness: 0.2 }) }));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
    led.position.set(10.38, 1.75, -0.2);
    room.add(led);
    // plants + floor lamps
    for (const [x, z, s] of [[12, -8, 1.25], [-12.1, 8, 1.1], [12, 7.6, 1], [7.9, 7.9, 0.8]]) {
      const p = new THREE.Group();
      p.add(cyl(0.36, 0.27, 0.6, 0xe7dccb, { y: 0.3 }));
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mat([0x2f9e62, 0x3bb273, 0x268752][i % 3]));
        leaf.scale.set(0.55, 1.5, 0.55);
        leaf.position.set(Math.cos(i * 1.05) * 0.26, 1.05 + (i % 2) * 0.25, Math.sin(i * 1.05) * 0.26);
        leaf.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i * 1.05) * -0.45);
        leaf.castShadow = true;
        p.add(leaf);
      }
      p.position.set(x, 0, z); p.scale.setScalar(s);
      room.add(p);
    }
    for (const [x, z] of [[-11.6, 0.9], [11.8, 3.6], [-4.9, 6.9]]) {
      room.add(cyl(0.3, 0.34, 0.06, 0x23283a, { x, y: 0.03, z }), cyl(0.03, 0.03, 3.1, 0x23283a, { x, y: 1.55, z }));
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.5, 20, 1, true), new THREE.MeshBasicMaterial({ color: LOOK.shade, side: THREE.DoubleSide, toneMapped: false }));
      shade.position.set(x, 3.2, z);
      const l = new THREE.PointLight(LOOK.light, 8, 13, 1.7);
      l.position.set(x, 3.0, z);
      room.add(shade, l);
      roomLamps.push(l);
    }

    // the floor's name: a neon sign high on the left wall, above the team board
    {
      const [word, sub, col] = LOOK.sign, s = surface(1024, 160), c = s.ctx;
      c.clearRect(0, 0, 1024, 160);
      c.font = '800 112px system-ui, sans-serif'; c.textBaseline = 'middle';
      c.shadowColor = col; c.shadowBlur = 26; c.fillStyle = col; c.fillText(word, 24, 84);
      const w = c.measureText(word).width;
      c.shadowBlur = 10; c.font = '600 54px system-ui, sans-serif'; c.fillStyle = '#ffffff'; c.globalAlpha = 0.9; c.fillText(sub, 64 + w, 90);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, toneMapped: false }));
      sign.rotation.y = Math.PI / 2; sign.position.set(LEFT_X + 0.13, 6.35, -3.2);
      room.add(box(0.06, 1.2, 6.8, LOOK.trim, { x: LEFT_X + 0.06, y: 6.35, z: -3.2, cast: false }), sign);
    }

    // each floor's own centrepiece, front right, out of the walkways; people (k.block) and the robot (tick) go round it
    if (LOOK.prop) k.block(PROP.x - PROP.r, PROP.z - PROP.r, PROP.x + PROP.r, PROP.z + PROP.r);
    if (LOOK.prop === 'crm') { // the sales funnel and the bell rung when a deal closes
      const g = new THREE.Group(), brass = mat(0xd4a017, { roughness: 0.25, metalness: 0.85 });
      g.add(box(1.6, 0.5, 1.6, 0x1f3b3a, { y: 0.25, r: 0.05 }));
      [[0.24, 0x0d9488], [0.4, 0x14b8a6], [0.56, 0x2dd4bf], [0.72, 0x5eead4]].forEach(([r, c], i) => // narrow at the bottom: a funnel
        g.add(cyl(r, r * 0.72, 0.36, c, { y: 0.72 + i * 0.4, seg: 32 })));
      g.add(cyl(0.05, 0.05, 2.1, 0x1f3b3a, { x: 0.68, y: 1.55, z: 0.62 }), box(0.05, 0.05, 0.5, 0x1f3b3a, { x: 0.68, y: 2.58, z: 0.85 }));
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), brass);
      bell.position.set(0.68, 2.42, 1.05); bell.castShadow = true;
      g.add(bell);
      g.position.set(PROP.x, 0, PROP.z); g.rotation.y = -0.5;
      room.add(g);
    } else if (LOOK.prop === 'lab') { // a glowing molecule model on a plinth: ideas being taken apart
      const g = new THREE.Group();
      g.add(box(1.4, 0.7, 1.4, 0x1e1b4b, { y: 0.35, r: 0.05 }));
      const atoms = [[0, 1.75, 0, 0.26, 0x818cf8], [0.62, 2.2, 0.2, 0.18, 0x22d3ee], [-0.55, 2.25, -0.25, 0.18, 0x22d3ee],
        [0.15, 2.65, -0.45, 0.15, 0xf0abfc], [-0.2, 1.3, 0.5, 0.16, 0xa3e635], [0.5, 1.35, -0.4, 0.14, 0xf0abfc]];
      const glow = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.3 });
      for (const [x, y, z, r, c] of atoms) { const a = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), glow(c)); a.position.set(x, y, z); a.castShadow = true; g.add(a); }
      const bondM = mat(0xc7d2fe, { roughness: 0.4 });
      for (let i = 1; i < atoms.length; i++) {
        const a = new THREE.Vector3(...atoms[0].slice(0, 3)), b = new THREE.Vector3(...atoms[i].slice(0, 3)), len = a.distanceTo(b);
        const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), bondM);
        bond.position.copy(a).lerp(b, 0.5); bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(bond);
      }
      g.add(cyl(0.05, 0.05, 0.6, 0x1e1b4b, { y: 0.98 }));
      g.position.set(PROP.x, 0, PROP.z); g.rotation.y = -0.5;
      room.add(g);
    } else if (LOOK.prop === 'web') { // an easel with a page being designed
      const s = surface(512, 384), c = s.ctx;
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 512, 384);
      c.fillStyle = '#e7e5e4'; c.fillRect(0, 0, 512, 34);
      ['#f87171', '#fbbf24', '#34d399'].forEach((k, i) => { c.fillStyle = k; c.beginPath(); c.arc(20 + i * 22, 17, 7, 0, 7); c.fill(); });
      c.fillStyle = '#f5f5f4'; c.fillRect(90, 9, 330, 16);
      const grad = c.createLinearGradient(0, 40, 512, 220); grad.addColorStop(0, '#f97316'); grad.addColorStop(1, '#8b5cf6');
      c.fillStyle = grad; c.fillRect(20, 50, 472, 170);
      c.fillStyle = '#ffffff'; c.font = '800 40px system-ui, sans-serif'; c.fillText('omniloy', 46, 120);
      c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(46, 140, 220, 12); c.fillRect(46, 162, 170, 12);
      c.fillStyle = '#fde047'; c.fillRect(46, 186, 110, 24);
      ['#fed7aa', '#ddd6fe', '#fbcfe8'].forEach((k, i) => { c.fillStyle = k; c.fillRect(20 + i * 160, 236, 150, 128); });
      const g = new THREE.Group(), wood = mat(0x8b5a2b, { roughness: 0.6 });
      const leg = (x, rz, rx, z = 0) => { const l = cyl(0.05, 0.05, 3.2, 0, { m: wood, x, y: 1.55, z }); l.rotation.z = rz; l.rotation.x = rx; return l; };
      g.add(leg(-0.65, -0.12, 0), leg(0.65, 0.12, 0), leg(0, 0, 0.32, -0.5));
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.42), new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false }));
      canvas.position.set(0, 2.2, 0.09); canvas.rotation.x = -0.1;
      g.add(box(2.0, 1.52, 0.06, 0xfaf7f2, { y: 2.2, z: 0.04 }), canvas, box(1.9, 0.08, 0.3, 0, { m: wood, y: 1.42, z: 0.1 }));
      for (const [x, k] of [[-0.55, 0xf97316], [-0.3, 0x8b5cf6], [-0.05, 0xec4899]]) g.add(cyl(0.04, 0.04, 0.12, k, { x, y: 1.52, z: 0.12 }));
      g.position.set(PROP.x, 0, PROP.z); g.rotation.y = -0.5;
      room.add(g);
    }

    // a little cleaning robot that wanders the open floor (moved in tick)
    const robot = k.my.robot = new THREE.Group();
    robot.add(cyl(0.34, 0.36, 0.14, 0x23283a, { y: 0.09, seg: 28 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0x7c9cff }));
    eye.position.set(0, 0.17, 0.22);
    robot.add(eye);
    robot.position.set(3, 0, 2);
    k.my.robotDir = 0.7;
    k.scene.add(robot);
  },

  // sky, sun and lamps follow the clock; f: 0 night .. 1 day, gold: sunrise and sunset
  daylight(k, f, gold) {
    const { scene, hemi, sun, mix: C } = k;
    scene.background = C(0x0b1022, 0xc5dcf2, f).lerp(new THREE.Color(0xf2b98a), gold * 0.4);
    if (scene.fog) scene.fog.color.copy(scene.background);
    hemi.intensity = 1.3 + f * 0.35;
    hemi.color = C(0xaab4f5, 0xffffff, f);
    hemi.groundColor = C(0x2a2740, 0x6b5648, f);
    sun.intensity = 1.0 + f * 2.1;
    sun.color = C(0x9db0ff, 0xfff1d6, f).lerp(new THREE.Color(0xff9d5c), gold * 0.6);
    sun.position.set(-9 - gold * 5, 16 - gold * 7, 11); // lower sun, longer shadows
    for (const m of k.my.sunPatches || []) { m.material.opacity = f * 0.2; m.material.color.copy(C(0xfff0c8, 0xffc78a, gold)); }
    if (k.my.windowMat) k.my.windowMat.color = C(0x2b3b80, 0xffffff, f);
    scene.environmentIntensity = 0.14 + f * 0.22;
    for (const l of k.my.roomLamps || []) l.intensity = 24 - f * 20;
  },

  tick(k, dt) {
    const robot = k.my.robot;
    if (!robot) return;
    robot.position.x += Math.sin(k.my.robotDir) * dt * 0.9; robot.position.z += Math.cos(k.my.robotDir) * dt * 0.9;
    const rz = Math.min(5, k.frontZ() + 1.5);
    if (robot.position.x < -5.5 || robot.position.x > 7 || robot.position.z < rz || robot.position.z > 7.2) {
      robot.position.x = Math.min(7, Math.max(-5.5, robot.position.x)); robot.position.z = Math.min(7.2, Math.max(rz, robot.position.z));
      k.my.robotDir += 2 + Math.random() * 2;
    } else if (LOOK.prop && Math.abs(robot.position.x - PROP.x) < PROP.r + 0.35 && Math.abs(robot.position.z - PROP.z) < PROP.r + 0.35) {
      robot.position.x -= Math.sin(k.my.robotDir) * dt * 0.9; robot.position.z -= Math.cos(k.my.robotDir) * dt * 0.9; // back out of the centrepiece
      k.my.robotDir += 2 + Math.random() * 2;
    }
    robot.rotation.y = k.my.robotDir;
  },
};
