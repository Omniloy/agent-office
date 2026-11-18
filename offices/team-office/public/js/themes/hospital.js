// Hospital: a bright, modern operating floor. STUB (phase 1): titles, texts, light and a few placeholder props so
// switching visibly works. The crafted look (operating suite, monitors with ECG, IV stands, cabinets, curtains,
// signage, scrubs and caps) is still to be built here: see the contract in themes/index.js.
import * as THREE from 'three';

export default {
  id: 'hospital',
  name: 'Hospital',
  roles: {
    Product: 'Director médico', Development: 'Cirujano', Verification: 'Médico de diagnóstico',
    Infrastructure: 'Técnico de equipos médicos', Lead: 'Jefe de servicio', Research: 'Investigador clínico',
    Prototyping: 'Médico residente', Review: 'Comité clínico', Superadmin: 'Gerente del hospital',
  },
  texts: { room: 'Quirófano 1', board: 'Tablón de guardia', trace: 'Historia clínica', composer: 'Indicación para @{name}, o @all para todo el equipo' },
  exposure: 1.12,
  bloom: { strength: 0.35, radius: 0.5, threshold: 1 },

  // Oficina's room, repainted: pale teal walls with a stripe, a glossy pale vinyl floor
  shell(k) {
    const { room, box, surface, C: { BACK_Z, LEFT_X } } = k;
    k.base.shell(k);
    k.my.wallMat.color.set(0xe3efec);
    const f = surface(512, 512), g = f.ctx;
    g.fillStyle = '#dfe7e4'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) { g.fillStyle = ['rgba(90,120,115,.10)', 'rgba(255,255,255,.35)', 'rgba(60,90,100,.08)'][i % 3]; g.fillRect((i * 151) % 512, (i * 263) % 512, 2 + (i % 3), 2); }
    g.strokeStyle = 'rgba(80,110,105,.18)'; g.lineWidth = 2;
    for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(512, x); g.stroke(); }
    f.tex.wrapS = f.tex.wrapT = THREE.RepeatWrapping; f.tex.repeat.set(6, 4);
    Object.assign(k.my.floor.material, { map: f.tex, roughness: 0.22, metalness: 0.05 });
    k.my.floor.material.needsUpdate = true;
    room.add(box(26, 0.28, 0.06, 0x2bb3a3, { y: 1.15, z: BACK_Z + 0.03, cast: false }), box(0.06, 0.28, 18, 0x2bb3a3, { x: LEFT_X + 0.03, y: 1.15, cast: false }));
  },

  // placeholder props: an operating table under a multi-head lamp, an IV stand, a red cross and an exit sign
  decor(k) {
    const { room, box, cyl, mat, glow, surface, C: { LEFT_X, BACK_Z } } = k;
    const steel = mat(0xc9d2d8, { roughness: 0.3, metalness: 0.7 });
    const table = new THREE.Group();
    table.add(cyl(0.35, 0.5, 0.9, 0, { m: steel, y: 0.45 }), box(2.4, 0.18, 0.9, 0x9ad4cf, { y: 1.0, r: 0.06 }), box(0.7, 0.12, 0.6, 0xffffff, { x: -0.8, y: 1.14, r: 0.05 }));
    table.position.set(-1, 0, 3.2);
    room.add(table);
    const arm = cyl(0.04, 0.04, 2.4, 0, { m: steel, x: -1, y: 5.9, z: 3.2 });
    room.add(arm);
    k.my.lampHeads = [];
    for (const [dx, dz] of [[-0.55, 0], [0.55, 0.2]]) {
      const head = new THREE.Group();
      head.add(cyl(0.45, 0.32, 0.18, 0, { m: steel }));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), glow(0xfff8e8, 2.2));
      lens.rotation.x = Math.PI / 2; lens.position.y = -0.1;
      head.add(lens);
      head.position.set(-1 + dx, 4.6, 3.2 + dz); head.rotation.z = dx * 0.5;
      room.add(head); k.my.lampHeads.push(lens);
    }
    const spot = new THREE.PointLight(0xfff4e0, 14, 9, 1.6);
    spot.position.set(-1, 4.2, 3.2); room.add(spot);
    k.my.roomLamps = [spot];
    // IV stand
    room.add(cyl(0.025, 0.025, 2.1, 0, { m: steel, x: 0.9, y: 1.05, z: 3.6 }), cyl(0.3, 0.3, 0.04, 0, { m: steel, x: 0.9, y: 0.04, z: 3.6 }),
      box(0.22, 0.32, 0.06, 0xd8f3ff, { x: 0.9, y: 1.95, z: 3.6, m: mat(0xd8f3ff, { transparent: true, opacity: 0.7, roughness: 0.1 }) }));
    // a monitor beside the table, its trace drawn in tick
    const mon = k.my.monitor = surface(256, 128);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: mon.tex, toneMapped: false }));
    screen.position.set(-2.9, 1.9, 2.6); screen.rotation.y = 0.6;
    room.add(screen, box(1.0, 0.55, 0.08, 0x2b3142, { x: -2.93, y: 1.9, z: 2.57, cast: false }), cyl(0.04, 0.04, 1.6, 0, { m: steel, x: -2.95, y: 0.8, z: 2.55 }));
    // red cross and green exit sign
    const cross = glow(0xe11d48, 1.6);
    room.add(box(0.06, 0.9, 0.28, 0, { m: cross, x: LEFT_X + 0.05, y: 5.6, z: 6.9, cast: false }), box(0.06, 0.28, 0.9, 0, { m: cross, x: LEFT_X + 0.05, y: 5.6, z: 6.9, cast: false }));
    const exit = surface(256, 96);
    exit.ctx.fillStyle = '#16a34a'; exit.ctx.fillRect(0, 0, 256, 96);
    exit.ctx.fillStyle = '#fff'; exit.ctx.font = '700 46px system-ui'; exit.ctx.textAlign = 'center'; exit.ctx.textBaseline = 'middle'; exit.ctx.fillText('SALIDA', 128, 50);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: exit.tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
    sign.position.set(8, 5.4, BACK_Z + 0.06);
    room.add(sign);
  },

  // scrubs in the role colour, a surgical cap; the medical director and the manager wear a white coat
  outfit(k, ch, a) {
    const { mats } = ch;
    if (/product|superadmin/i.test((a && a.role) || '')) { mats.shirt.color.set(0xf6f7f8); mats.shirtDark.color.copy(mats.pants.color.set(0x334155)); return; }
    const c = mats.shirt.color.clone().lerp(new THREE.Color(0x9ad4cf), 0.35);
    mats.shirt.color.copy(c); mats.pants.color.copy(c.clone().multiplyScalar(0.85));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    cap.rotation.x = -0.25; cap.position.y = 0.02;
    ch.wear(ch.head, cap);
  },

  tick(k, dt, t) { // the monitor's heart trace
    const m = k.my.monitor; if (!m || (k.my.ecgAt && t - k.my.ecgAt < 0.1)) return;
    k.my.ecgAt = t;
    const g = m.ctx, x0 = (t * 90) % 256;
    g.fillStyle = '#04110d'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#34d399'; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x < 256; x += 2) { const p = ((x - x0 + 256) % 64) / 64, y = 70 - (p > 0.4 && p < 0.46 ? 46 : p > 0.46 && p < 0.5 ? -24 : Math.sin(p * 9) * 3); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.fillStyle = '#34d399'; g.font = '700 26px system-ui'; g.fillText('72', 200, 30);
    m.tex.needsUpdate = true;
  },
};
