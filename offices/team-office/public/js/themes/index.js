// Office themes: the registry and the contract a theme file follows.
//
// One theme = one file here, themes/<id>.js, whose default export is a plain object (examples: oficina.js, the
// full room as it always was; hospital.js and nave.js). To add one: write the file, import it below and add it to
// THEMES. The server finds themes by file name for "Tema del día", so the file name is the id.
// The setting is one for the whole building: GET/POST /api/theme { mode: 'fixed'|'daily', theme } (server.mjs);
// every page gets the effective theme in its state and reloads when it changes.
//
// Everything is optional except id and name. Whatever a theme leaves out comes from Oficina, so a theme can start
// as a few lines and grow. Set a hook to null to switch that part off (decor: null = an empty room).
//
//   id, name            'hospital', 'Hospital' (the picker shows name)
//   roles               { Product: 'Director médico', ... }: team.json role -> title shown everywhere a role shows
//                       (3D tags, nameplates, screens, board, people list, panels, chat). Unknown roles keep their
//                       own text. Names never change, and the agents never see any of this.
//   texts               { room, board, trace, traceEmpty, composer }. room: shown after the floor name in the top
//                       bar ('' = nothing). board / trace: titles painted on the wall board and the whiteboard
//                       (trace gets " · <project>"; traceEmpty is used with no matrix, default = trace).
//                       composer: command bar placeholder, {name} = the first person's @name.
//                       Optional: boardSub (board line when there are no filter chips), noCards (empty board
//                       column), status { working, idle, blocked, offline, now } (status words on the wall screens).
//                       traceHint: ['line 1', 'line 2'], the whiteboard's text when the team has no matrix.
//   exposure            tone mapping exposure (Oficina 1.08).
//   bloom               { strength, radius = 0.4, threshold = 1 } or null. Glow, off on phones and when frames get
//                       slow. The picture is tone mapped before the glow, so only colours above `threshold` glow:
//                       make shining things with k.glow(color, 2.5) (toneMapped:false, colour pushed over 1).
//                       Screens, board and labels stay at 1 or below, so they stay sharp.
//   boardStyle          { bg, ink }: background and title colour of the wall board. Keep bg dark: the columns
//                       and their text are drawn light on it.
//   traceStyle          { bg, ink }: background and text colour of the whiteboard (title, row names, numbers).
//                       Cards, columns, bars and status colours never change: they carry meaning.
//   centre              { roles, x, z, yaw, lift, foot, side } or leave it out (Oficina has none). ONE person sits at
//                       a desk in the open floor in the middle of the room instead of in the rows: the first role of
//                       `roles` (default ['Product', 'Lead']; matched case-insensitively at the start of the team.json
//                       role, so 'Product Owner' counts) that someone on the floor has. Temps never take it; with none
//                       of the roles, or with more than 10 others (they must fit in two rows), nobody does. The others
//                       close up in the rows without a gap. Where it stands (the desk centre, world x/z; numbers, or
//                       functions of `rows`, 1 or 2): x default 0.6; z default 0.9 with one row, 4.0 with two;
//                       yaw (radians, turns the whole desk; 0 = the person faces the room's open front like the rows,
//                       Math.PI = faces the back wall). lift: the desk and its seat stand this high (a dais, default 0;
//                       build the dais in station() from local y -lift to 0; the person walks up to the seat from
//                       beside the chair). foot { x0, x1, z0, z1 }: what the desk covers, in its own coordinates
//                       around the desk centre (+z = towards the person's front; default -1.55..1.55, -1.85..0.85):
//                       nobody else walks through it. side: how far beside the desk centre the person steps in and
//                       out by the chair (default 1.9, kept outside foot). Everything works for them as for the rows:
//                       walks to coffee, board and whiteboard, talks (others come to the front of their desk), link
//                       arcs, visitors, temps, travel, clicks and camera. Their wall screen stays on the back wall in
//                       the middle of the (top) line of screens.
//   spots               { coffee: { x, z, yaw } } to move the coffee spot (default x 9.3, z 0.7, yaw Math.PI / 2 =
//                       facing +x). Keep it in the open floor or at a side, clear of the desk rows and aisles.
//
// Hooks, called with the kit `k` (below). Build hooks run once when the page opens, in this order:
//   shell(k)            walls, floor, ceiling, windows, wall decor. Add to k.room.
//   decor(k)            free-standing props (sofa, rug, plants, lamps, robot...). Add to k.room.
//   fixtures(k, fx)     restyle the working-information objects: fx.board { mesh, frame }, fx.trace { group, mesh,
//                       frame, legs }, fx.clock { face, rim }. Recolour or add trim; never move, scale or hide them.
//   clockFace(ctx, d)   paint the 256x256 wall clock for Date d (once a minute). Keep it readable.
//   station(k, st)      once per desk, after the default desk is built: build a desk that fits the role. st.group
//                       is the desk's group (local coordinates: desk centre at x 0, z k.C.DESK_Z, the chair at
//                       k.C.SEAT_Z behind it, the person facing +z; it moves as a whole). Who: st.agent (st.agent.role
//                       is the team.json role, st.agent.temp for a temp), st.title (the theme's title for the role),
//                       st.centre (true for the centre desk: see centre), st.lift. st.props holds the default props by
//                       name, to recolour, hide or replace freely: desk [top, modesty, legs...], laptop, mat, mug,
//                       books, pens, plant, lamp (group; st.lamp is its light), chair, bezel; props.mats { wood, frame,
//                       steel } are shared by that desk's parts. st.wall is the wall screen group (restyle the bezel
//                       only). The working information stays visible and is never scaled or hidden: st.info { front
//                       (status strip and nameplate, front face at y 0.64..0.93, z DESK_Z + 0.66), orb (status light,
//                       x -1.15, y 1.2, z DESK_Z + 0.5), tray (in-tray, one sheet per card and the count, x 0.42,
//                       y 1.06, z DESK_Z + 0.38), flags (pull request flags, x -1.3..-0.26, y 1.04, z DESK_Z + 0.56) }
//                       are groups at the desk's origin: move or turn each (position / rotation) so it sits on your
//                       own surfaces. The screen, pad and halo are world.js's. The person sits at (0, SEAT_Z) with
//                       hips at y 0.72: give the seat that height. Room per desk in the rows: neighbours can be 3.5
//                       apart (centre to centre) and people walk past the chair's side, so keep a row desk within
//                       x -1.6..1.6 and local z -7.25..-4.5 (the floor 0.4 in front of the plate is the aisle). The
//                       centre desk has the open floor: make it the room's hero piece, within its foot.
//   plate(ctx, p)       paint the 512x128 nameplate on the desk front: p { name, title, color }.
//   outfit(k, ch, a)    once per character (also visitors from other rooms, whose `a` has no role). ch.mats
//                       { shirt, shirtDark, pants, skin, skinDark, hair, dark, white } are that character's own
//                       materials (recolour freely), ch.hair = hair meshes, ch.head, ch.upper (torso group), ch.torso,
//                       ch.collar, ch.armL / armR / legL / legR (pivots), ch.look. ch.wear(parent, mesh) adds a
//                       piece of clothing (shadow, click target). Head top is at about y 0.32 in ch.head.
//   daylight(k, f, g)   every 5 s and when the light mode changes. f: 0 night .. 1 day, g: 0..1 near sunrise and
//                       sunset (0 outside auto mode). Set k.scene.background / fog / environmentIntensity, k.hemi,
//                       k.sun and your own lamps. Oficina's version also drives its windows and floor lamps.
//   layout(k)           after the desks move (first layout, a temp arrives or leaves, the team changes): follow
//                       them with decor (k.desks(), k.centre(), k.frontZ()). Not called when nothing moved.
//   tick(k, dt, t)      every drawn frame (30 to 60 a second): animate decor. dt in seconds, t = seconds clock.
//                       Keep it cheap: no allocation, no geometry or texture rebuilds per frame.
// A hook that throws is logged and skipped; the room keeps working.
//
// The kit `k`:
//   THREE, scene, room (group for your meshes), renderer, camera, hemi, sun, PHONE, TOUCH
//   C                   room constants: BACK_Z (back wall), LEFT_X (left wall), RIGHT_X, FRONT_Z (open sides),
//                       WALL_H, DESK_Z, SEAT_Z, AISLE_Z, ROW_D. Floor is 26 x 18, x -13..13, z -9..9.
//   mat(color, o)       MeshStandardMaterial (roughness .82); box(w, h, d, color, { x, y, z, r, m, cast });
//   cyl(rt, rb, h, color, { x, y, z, m, seg }); rod(a, b, r, m) a bar between two Vector3;
//   surface(w, h)       { canvas, ctx, tex } a canvas texture (set tex.needsUpdate after painting again);
//   wrap(ctx, text, maxW, maxLines), hex(color) '#rrggbb', mix(a, b, f) Color lerp, smooth(a, b, x), hashOf(s)
//   glow(color, k = 1)  MeshBasicMaterial, toneMapped:false, colour times k (over 1 = blooms where bloom is on)
//   dayFactor()         0 night .. 1 day, now
//   desks()             [{ slug, agent, x, z, row }] where each desk is now (world x, desk front-back centre z);
//                       the centre desk has row -1, centre true, yaw and lift
//   centre()            the centre desk now, { slug, agent, x, z, yaw, lift }, or null
//   frontZ()            z of the front aisle: the open floor is between it and z 9
//   block(x0, z0, x1, z1) an area of the floor (world x/z rectangle) people walk around, for solid decor in the open
//                       floor (a rocket's base, a counter, a dais). Never on the desk rows, the aisles in front of
//                       them, the spots below, or beside the walls (people go round its corners). Returns a handle:
//                       h.set(x0, z0, x1, z1) moves the area (decor that follows the desks), h.set() removes it.
//   spots               places people walk to; keep them free: board (in front of the left wall board), white
//                       (in front of the whiteboard), coffee { x, z, yaw } (idle break spot)
// Coffee break (keep it: the floor's life): every 70 to 190 s an idle person who is at their desk, not selected and
// not needed walks to spots.coffee, stands there 7 s with a mug (sipping, looking around), and walks back; a second
// one stands up to 0.5 m beside the spot, across the way it faces. It works the same from the centre desk. Make the
// coffee corner obvious and cosy right at that spot (machine, cups, a little table), facing the way people stand.
//   title(role), texts  role titles and texts of this theme
//   base                the Oficina theme, to reuse a part: base.shell(k), then recolour k.my.wallMat / k.my.floor
//   my                  {} scratch shared by this theme's hooks (Oficina keeps windowMat, wallMat, floor, robot...)
// Keep the working information where it is: the wall board, the whiteboard (x 9.4, z 5.6), the clock, the wall
// screens and the desks are placed by world.js; a theme dresses around them.
import oficina from './oficina.js';
import hospital from './hospital.js';
import nave from './nave.js';

export const THEMES = [oficina, hospital, nave];
export const DEFAULT_THEME = 'oficina';
const HOOKS = ['shell', 'decor', 'fixtures', 'clockFace', 'station', 'plate', 'outfit', 'daylight', 'layout', 'tick'];

// The theme with every missing part taken from Oficina.
export function themeById(id) {
  const t = THEMES.find((x) => x.id === id) || oficina;
  if (t === oficina) return { ...oficina, base: oficina, title: (r) => r };
  const out = { ...oficina, ...t, base: oficina };
  for (const h of HOOKS) if (!(h in t)) out[h] = oficina[h];
  out.texts = { ...oficina.texts, ...(t.texts || {}) };
  if (t.texts && t.texts.trace && !t.texts.traceEmpty) out.texts.traceEmpty = t.texts.trace;
  const roles = t.roles || {};
  const lower = Object.fromEntries(Object.entries(roles).map(([r, v]) => [r.toLowerCase(), v]));
  out.title = (role) => (role ? roles[role] || lower[String(role).trim().toLowerCase()] || role : role);
  return out;
}
export const isTheme = (id) => THEMES.some((x) => x.id === id);
