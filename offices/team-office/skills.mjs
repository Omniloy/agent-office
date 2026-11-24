// Skills of the floor: the owner marks, out of every skill the agents have, the few that matter most on this floor.
//   catalogue   ~/.claude/skills/*/SKILL.md (symlinks followed): the front matter's name and description only, never
//               the rest of the file; "codex" when ~/.codex/skills/<id> or ~/.agents/skills/<id> exists too
//   focus       <team dir>/skill-focus.json  {"version":1,"skills":[{"id","note"}],"updatedAt"}
//   protocol    on save, <team dir>/PROTOCOL.md gets a generated section between the markers below (the rest of the file
//               is kept byte for byte; the previous file is kept as PROTOCOL.md.bak-skills). Only this save writes it,
//               and only the owner presses it.
// Team office only (server.mjs uses it); skills.test.mjs checks the parser, the checks and the marker replacement.
import fs from 'node:fs/promises';
import path from 'node:path';

export const BEGIN = '<!-- skills:begin -->';
export const END = '<!-- skills:end -->';
export const MAX_SKILLS = 15;
export const MAX_NOTE = 200;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

// ---------------------------------------------------------------- front matter (the small part of YAML a SKILL.md uses)
const unquote = (v) => {
  if (v.length >= 2 && v[0] === '"' && v.endsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.length >= 2 && v[0] === "'" && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
};
// Top-level keys as strings: plain, quoted, block (| and >, with -/+), and plain values that go on over indented lines.
export function parseFrontmatter(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(src);
  if (!m) return {};
  const lines = m[1].split('\n'), out = {};
  for (let i = 0; i < lines.length; i++) {
    const k = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/.exec(lines[i]);
    if (!k) continue;
    const raw = (k[2] || '').replace(/[ \t]+#.*$/, '').trim(), more = [];
    while (i + 1 < lines.length && (/^[ \t]+\S/.test(lines[i + 1]) || (lines[i + 1].trim() === '' && i + 2 < lines.length && /^[ \t]+\S/.test(lines[i + 2])))) more.push(lines[++i]);
    let v;
    if (/^[|>][-+0-9]*$/.test(raw)) {
      const ind = Math.min(...more.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length));
      const body = more.map((l) => l.slice(ind));
      v = raw[0] === '|' ? body.join('\n') : body.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ').replace(/\n(\n*)/g, '$1'); // folded: a line break is a space, a blank line a break
      v = v.replace(/\s+$/, '');
    } else if (!raw && more.length && /^[ \t]+-/.test(more[0])) continue; // a list: not a string
    else v = unquote([raw, ...more.map((l) => l.trim())].filter(Boolean).join(' '));
    out[k[1]] = v;
  }
  return out;
}

// ---------------------------------------------------------------- the catalogue
const exists = (p) => fs.stat(p).then(() => true, () => false);
async function head(file, max = 32_768) { // the front matter sits at the top: never read a whole big file
  const fh = await fs.open(file, 'r');
  try { const b = Buffer.alloc(max); const { bytesRead } = await fh.read(b, 0, max, 0); return b.toString('utf8', 0, bytesRead); } finally { await fh.close(); }
}
export async function readCatalogue({ skillsDir, codexDirs = [] }) {
  let names = []; try { names = await fs.readdir(skillsDir); } catch { return []; }
  const out = [];
  for (const id of names.sort()) {
    if (!ID.test(id)) continue;
    const file = path.join(skillsDir, id, 'SKILL.md');
    try { if (!(await fs.stat(file)).isFile()) continue; } catch { continue; } // stat follows the symlinks
    let fm = {}; try { fm = parseFrontmatter(await head(file)); } catch { /* unreadable: the folder name only */ }
    const one = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
    let codex = false; for (const d of codexDirs) if (await exists(path.join(d, id))) { codex = true; break; }
    out.push({ id, name: one(fm.name, 80) || id, description: one(fm.description, 400), codex });
  }
  return out;
}
export function catalogueCache(opts, ttl = 5 * 60_000) {
  let at = 0, list = null, pending = null;
  return async (fresh) => {
    if (!fresh && list && Date.now() - at < ttl) return list;
    if (!pending) pending = readCatalogue(opts).then((l) => { list = l; at = Date.now(); return l; }).finally(() => { pending = null; });
    return pending;
  };
}

// ---------------------------------------------------------------- the floor's list
// A note goes into PROTOCOL.md: one line, no markers or comments, at most MAX_NOTE characters.
export const cleanNote = (s) => String(s ?? '').replace(/<!--|-->/g, '').replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
export function validateFocus(body, catalogue) {
  const list = body && body.skills;
  if (!Array.isArray(list)) return { error: 'skills must be a list' };
  if (list.length > MAX_SKILLS) return { error: `Como mucho ${MAX_SKILLS} skills destacadas.` };
  const known = new Set(catalogue.map((x) => x.id)), seen = new Set(), skills = [];
  for (const x of list) {
    const id = x && typeof x === 'object' ? x.id : x;
    if (typeof id !== 'string' || !ID.test(id) || !known.has(id)) return { error: `No existe la skill ${JSON.stringify(String(id).slice(0, 80))}.` };
    if (seen.has(id)) return { error: `La skill ${id} está repetida.` };
    seen.add(id);
    const raw = x && typeof x === 'object' ? x.note : '';
    if (raw != null && typeof raw !== 'string') return { error: `La nota de ${id} no es texto.` };
    const note = cleanNote(raw);
    if (note.length > MAX_NOTE) return { error: `La nota de ${id} pasa de ${MAX_NOTE} caracteres.` };
    skills.push(note ? { id, note } : { id });
  }
  return { skills };
}
export async function readFocus(teamDir) {
  try {
    const d = JSON.parse(await fs.readFile(path.join(teamDir, 'skill-focus.json'), 'utf8'));
    const skills = (Array.isArray(d.skills) ? d.skills : []).filter((x) => x && typeof x.id === 'string' && ID.test(x.id))
      .map((x) => (x.note ? { id: x.id, note: cleanNote(x.note).slice(0, MAX_NOTE) } : { id: x.id }));
    return { version: 1, skills, updatedAt: d.updatedAt || null };
  } catch { return { version: 1, skills: [], updatedAt: null }; }
}

// ---------------------------------------------------------------- PROTOCOL.md
export function protocolBlock(skills) {
  if (!skills.length) return '';
  return '## Skills destacadas en esta planta\n'
    + 'Estas skills son especialmente importantes en esta planta: úsalas siempre que la tarea encaje. Las demás skills siguen disponibles y puedes usarlas como siempre.\n'
    + 'Antes de hacer estas tareas, carga la skill (Skill tool, o lee su SKILL.md si no tienes la herramienta):\n'
    + skills.map((x) => `- \`${x.id}\`${x.note ? `: ${x.note}` : ''}`).join('\n') + '\n';
}
// The text between the markers becomes `block`; everything else stays as it was. No markers: the block goes at the end.
export function replaceBlock(text, block) {
  const b = text.indexOf(BEGIN), e = text.indexOf(END);
  const inner = `${BEGIN}\n${block}${END}`;
  if (b === -1 && e === -1) return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${text === '' ? '' : '\n'}${inner}\n`;
  if (b === -1 || e === -1 || e < b || text.indexOf(BEGIN, b + 1) !== -1 || text.indexOf(END, e + 1) !== -1) throw new Error('PROTOCOL.md tiene los marcadores de skills rotos: arréglalos a mano.');
  return text.slice(0, b) + inner + text.slice(e + END.length);
}
async function writeAtomic(file, text, mode) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, text, { mode: mode ?? 0o644 });
  await fs.rename(tmp, file);
}
let chain = Promise.resolve(); // one save at a time in this process
export function saveFocus(teamDir, skills) {
  const job = chain.then(async () => {
    const focus = { version: 1, skills, updatedAt: new Date().toISOString() };
    const pf = path.join(teamDir, 'PROTOCOL.md');
    let old = '', mode; try { old = await fs.readFile(pf, 'utf8'); mode = (await fs.stat(pf)).mode & 0o777; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const next = replaceBlock(old, protocolBlock(skills)); // broken markers: nothing is written at all
    await writeAtomic(path.join(teamDir, 'skill-focus.json'), JSON.stringify(focus, null, 1) + '\n', 0o644);
    if (next !== old) {
      if (old) await writeAtomic(`${pf}.bak-skills`, old, mode);
      await writeAtomic(pf, next, mode);
    }
    return { focus, protocolChanged: next !== old };
  });
  chain = job.catch(() => {});
  return job;
}
