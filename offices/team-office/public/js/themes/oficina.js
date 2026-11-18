// Oficina: the office as it has always looked. It is also the base of every other theme: whatever a theme leaves
// out comes from here (see themes/index.js for the contract).
import * as THREE from 'three';

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
    f.tex.wrapS = f.tex.wrapT = THREE.RepeatWrapping;
    f.tex.repeat.set(4, 3);
    const floor = k.my.floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), mat(0xffffff, { map: f.tex, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    room.add(floor, box(26.6, 0.6, 18.6, 0x1b1f2e, { y: -0.31, cast: false }));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), mat(0x141827, { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62;
    room.add(ground);

    const wall = k.my.wallMat = mat(0xf0e9dd);
    room.add(box(26.6, WALL_H, 0.3, 0, { m: wall, y: WALL_H / 2, z: BACK_Z - 0.15 }));
    room.add(box(0.3, WALL_H, 18.3, 0, { m: wall, x: LEFT_X - 0.15, y: WALL_H / 2, z: 0.15 }));
    room.add(box(26, 0.22, 0.08, 0x3a3f52, { y: 0.11, z: BACK_Z + 0.04, cast: false }), box(0.08, 0.22, 18, 0x3a3f52, { x: LEFT_X + 0.04, y: 0.11, cast: false }));
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
      const sx = -11.75, sz = BACK_Z + 0.3, shelfM = mat(0xcaa778, { roughness: 0.6 });
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
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48), mat(0x35406e, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-1, 0.012, 3.2); rug.receiveShadow = true;
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.85, 48), mat(0xe9d9b8, { roughness: 1 }));
    rug2.rotation.x = -Math.PI / 2; rug2.position.set(-1, 0.016, 3.2);
    room.add(rug, rug2);
    const sofa = new THREE.Group();
    sofa.add(box(3.4, 0.5, 1.2, 0x5b6ee1, { y: 0.45, r: 0.12 }), box(3.4, 0.9, 0.35, 0x4f61cf, { y: 0.85, z: -0.5, r: 0.12 }),
      box(0.35, 0.75, 1.2, 0x4f61cf, { x: -1.6, y: 0.6, r: 0.1 }), box(0.35, 0.75, 1.2, 0x4f61cf, { x: 1.6, y: 0.6, r: 0.1 }),
      box(0.7, 0.3, 0.5, 0xfbbf24, { x: -0.9, y: 0.85, z: -0.2, r: 0.1 }), box(0.7, 0.3, 0.5, 0xfb7185, { x: 0.95, y: 0.85, z: -0.2, r: 0.1 }));
    sofa.position.set(-10.6, 0, 3.6); sofa.rotation.y = Math.PI / 2;
    room.add(sofa, cyl(0.8, 0.8, 0.08, 0xf3ead9, { x: -8, y: 0.5, z: 3.6, seg: 32 }), cyl(0.08, 0.3, 0.5, 0x2d3246, { x: -8, y: 0.25, z: 3.6 }));
    for (const [x, z, c] of [[-2.6, 4.6, 0xfb7185], [0.7, 4.9, 0x34d399], [-0.9, 1.6, 0xfbbf24]]) {
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
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.5, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe2a8, side: THREE.DoubleSide, toneMapped: false }));
      shade.position.set(x, 3.2, z);
      const l = new THREE.PointLight(0xffd9a0, 8, 13, 1.7);
      l.position.set(x, 3.0, z);
      room.add(shade, l);
      roomLamps.push(l);
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
    }
    robot.rotation.y = k.my.robotDir;
  },
};
