# Office themes (Hospital, USS HERD) — design

## Intent
Noé wants the 3D office to change look by theme, switchable any day, starting with two themes:
**Hospital** (a medical team) and **USS HERD** (the bridge of an exploration starship). It is for the pleasure of
working in it: the room must look stunning in 3D, "even if it weighs a lot". The bar is Lluis's military theme
on this same office (Sala de operaciones: sandbags, camouflage net, bunks, lockers, radar, map table, helmets,
themed signs and texts), which shows the procedural approach can look spectacular.

## Goals
- A theme system in the team office (`offices/team-office`): Dev, CRM, Web and Lab floors.
- Three themes: **Oficina** (today's look, unchanged, the default), **Hospital**, **USS HERD**.
- Each theme changes: room shell (walls, floor, ceiling/windows), decor and props, lighting and mood,
  character outfits (clothes, headwear, accessories), desk props, signage and themed texts (room name, board
  name, composer placeholder), and the **role titles** shown in the UI.
- A theme picker in the top bar (owner only), plus **"Tema del día"**: rotates automatically every day.
- One choice for the whole building (all floors and phones see the same theme).
- Glow: post-processing bloom so screens, monitors, consoles and neon really shine (off on phones).

## Non-goals / anti-goals
- **Agents do not change.** Same instructions, same hierarchy, same names, same protocol, same Jira texts.
  The theme is purely what the office shows. Never touch PROTOCOL.md, team.json, agents' prompts.
- No external downloaded 3D models, textures or HDRIs (approach A below). Everything is built in code
  (geometry + canvas-painted textures), like today.
- Working information must stay readable in every theme: agent screens, card board, traceability matrix,
  status labels/colours, bubbles, menus, chat. A theme dresses them, never hides or recolours their meaning.
- The Business office (`offices/biz-office`, a different world.js) is out of scope for now.

## Approaches considered
- **A. Procedural, heavily crafted (picked by Noé).** Each theme is a JS module that builds its decor with
  three.js primitives and canvas textures, sets lights/fog/background, dresses characters, plus bloom.
  No external assets, consistent style, fits Lluis's theme system when he uploads it.
- B. Downloaded CC0 glTF models and PBR textures: more detail per object, but mismatched styles, tens of MB,
  every pack must be vetted; Noé works with health data and avoids external files.
- C. Mix of A with a few models: most of B's costs for little gain.

## Role titles
Agent names never change; the role shown next to the name does. Unknown roles fall back to the original.
Hospital shows service names rather than job titles, so nobody on the floor wears a gendered title that is not
theirs (decided 2026-11-20; `themes/hospital.js` is the source).

| team.json role | Hospital | USS HERD |
|---|---|---|
| Product | Dirección médica | Capitán |
| Development | Cirugía | Ingeniero de sistemas |
| Verification | Diagnóstico | Oficial científico |
| Infrastructure | Electromedicina | Jefe de máquinas |
| Lead | Jefatura de servicio | Primer oficial |
| Research | Investigación clínica | Oficial de exploración |
| Prototyping | Residente | Ingeniero de prototipos |
| Review | Comité clínico | Oficial táctico |
| Superadmin | Gerencia | Almirante |

## Theme look (direction for the builders)
**Hospital.** A bright modern hospital floor/operating suite: white and pale-teal walls with a coloured stripe,
glossy vinyl floor with reflections, ceiling light panels; an operating lamp (multi-head) over a central
operating table / stretcher instead of the rug; vital-sign monitors with animated ECG lines; IV stands, medicine
cabinet with glass doors, crash cart, wheelchair, hand-wash basin, privacy curtains on rails, X-ray light box
on a wall, hospital signage ("Quirófano 1", "UCI", green exit sign, red cross). Characters: scrubs in role
colours, surgical caps, white coat for the director, stethoscopes, masks hanging. Board = "Tablón de guardia",
traceability = "Historia clínica". Composer: "Indicación para @…, o @all para todo el equipo".

**USS HERD.** The bridge of an exploration starship (Star Trek-like, original design): dark metal hull panels
with emissive trim lines, a huge panoramic viewport with a starfield, nebula and a slowly turning planet;
captain's chair on a raised dais, curved glowing consoles with animated readouts, a holographic table
(rotating translucent planet/ship), ceiling light strips, floor grid lines, doors with lit frames.
Characters: uniforms with shoulder colours by role (command gold/red, engineering, science blue), insignia
badge, headsets. Board = "Registro de misiones", traceability = "Bitácora". Composer: "Orden para @…, o @all
para toda la tripulación". Bloom is essential here.

Both must keep day/night lighting (`dayFactor`) sensible: hospital windows show sky as today; the ship's
viewport is space at any hour.

## How it is built (decided)
- Theme modules in `offices/team-office/public/js/themes/<id>.js`, one file per theme, plus a small registry.
  The default "Oficina" theme is today's code path, untouched in look.
- world.js gets a theme contract: the theme can replace/extend the room shell and decor, lights, fog,
  background, outfits (a hook when a character is built), desk props (a hook when a station is built),
  texts/role titles, and per-frame animation (a tick hook). Exact API is the builder's call; keep it small.
- Changing the theme may reload the page (simplest, robust) or rebuild live: builder's call.
- Setting stored server-side, one for the whole building, shared by all floors of the same install:
  `{ mode: 'fixed' | 'daily', theme }`. Owner can change it; visitors from other buildings only read it.
  Daily mode picks by date (Europe/Madrid day), deterministic, cycling all themes including Oficina.
- Bloom via three's `EffectComposer` + `UnrealBloomPass` from the vendored `three/addons`, threshold set so
  only emissive things glow. Off on phones (`PHONE` class) and if FPS drops.
- Performance: Noé's Mac has 16 GB; keep static decor merged/instanced where it is many copies, shadows
  static as today (`shadowMap.autoUpdate = false`), textures painted once.
- Shared files rule from the handbook applies: if a changed file is shared with biz-office, keep them identical
  (`cmp`) unless it is a team-office-only file.

## Left to the builders
Exact geometry and composition, colours, the theme API shape, file split, the picker's look (match the
top bar), whether role titles also show in chat header/People/phone (yes where the role is shown today).
