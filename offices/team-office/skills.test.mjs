// node skills.test.mjs — the front matter parser, the checks on a floor's list and the PROTOCOL.md section.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter, readCatalogue, validateFocus, replaceBlock, protocolBlock, saveFocus, readFocus, BEGIN, END, MAX_SKILLS } from './skills.mjs';

// ---- front matter
assert.deepEqual(parseFrontmatter('---\nname: review-pr\ndescription: Drives a PR to green.\n---\n# body\ndescription: not this'), { name: 'review-pr', description: 'Drives a PR to green.' });
assert.equal(parseFrontmatter('---\nname: x\ndescription: >\n  Folded line one\n  and two.\n\n  New paragraph.\nother: 1\n---\n').description, 'Folded line one and two.\nNew paragraph.');
assert.equal(parseFrontmatter('---\ndescription: >-\n  a\n  b\n---').description, 'a b');
assert.equal(parseFrontmatter('---\ndescription: |\n  line 1\n  line 2\n---').description, 'line 1\nline 2');
assert.equal(parseFrontmatter('---\ndescription: "Quoted: with \\"escapes\\""\n---').description, 'Quoted: with "escapes"');
assert.equal(parseFrontmatter("---\ndescription: 'it''s single'\n---").description, "it's single");
assert.equal(parseFrontmatter('---\ndescription: plain that\n  goes on\n---').description, 'plain that goes on');
assert.equal(parseFrontmatter('﻿---\r\nname: crlf\r\n---\r\n').name, 'crlf');
assert.equal(parseFrontmatter('---\ntags:\n  - a\n  - b\nname: n\n---').tags, undefined);
assert.equal(parseFrontmatter('---\ntags:\n  - a\nname: n\n---').name, 'n');
assert.deepEqual(parseFrontmatter('# no front matter\nname: x'), {});
assert.deepEqual(parseFrontmatter('---\nname: unclosed'), {});

// ---- catalogue: symlinks followed, only name/description, codex flag, odd folder names skipped
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
try {
  const sk = path.join(tmp, 'claude-skills'), real = path.join(tmp, 'real'), codex = path.join(tmp, 'codex-skills');
  await fs.mkdir(path.join(sk, 'plain'), { recursive: true }); await fs.mkdir(path.join(real, 'linked'), { recursive: true }); await fs.mkdir(path.join(codex, 'linked'), { recursive: true });
  await fs.writeFile(path.join(sk, 'plain', 'SKILL.md'), '---\nname: Plain skill\ndescription: Does a thing.\n---\nSECRET BODY\n');
  await fs.writeFile(path.join(real, 'linked', 'SKILL.md'), '---\nname: linked\ndescription: >\n  Linked\n  one.\n---\n');
  await fs.symlink(path.join(real, 'linked'), path.join(sk, 'linked'));
  await fs.mkdir(path.join(sk, 'no-skill-md'));
  await fs.mkdir(path.join(sk, '.hidden')); await fs.writeFile(path.join(sk, '.hidden', 'SKILL.md'), '---\nname: h\n---\n');
  const cat = await readCatalogue({ skillsDir: sk, codexDirs: [codex] });
  assert.deepEqual(cat, [
    { id: 'linked', name: 'linked', description: 'Linked one.', codex: true },
    { id: 'plain', name: 'Plain skill', description: 'Does a thing.', codex: false },
  ]);
  assert.ok(!JSON.stringify(cat).includes('SECRET'));
  assert.deepEqual(await readCatalogue({ skillsDir: path.join(tmp, 'missing') }), []);

  // ---- validation
  assert.deepEqual(validateFocus({ skills: [{ id: 'plain', note: '  before\n asking  ' }, { id: 'linked' }] }, cat), { skills: [{ id: 'plain', note: 'before asking' }, { id: 'linked' }] });
  assert.deepEqual(validateFocus({ skills: ['linked'] }, cat), { skills: [{ id: 'linked' }] });
  assert.deepEqual(validateFocus({ skills: [] }, cat), { skills: [] });
  assert.ok(validateFocus({}, cat).error);
  assert.ok(validateFocus({ skills: [{ id: '../../etc/passwd' }] }, cat).error);
  assert.ok(validateFocus({ skills: [{ id: 'nope' }] }, cat).error);
  assert.ok(validateFocus({ skills: [{ id: 'plain' }, { id: 'plain' }] }, cat).error);
  assert.ok(validateFocus({ skills: [{ id: 'plain', note: 'x'.repeat(201) }] }, cat).error);
  assert.ok(!validateFocus({ skills: [{ id: 'plain', note: 'x'.repeat(200) }] }, cat).error);
  assert.ok(validateFocus({ skills: [{ id: 'plain', note: 5 }] }, cat).error);
  assert.equal(validateFocus({ skills: [{ id: 'plain', note: 'a <!-- skills:end --> b' }] }, cat).skills[0].note, 'a skills:end b');
  const many = Array.from({ length: MAX_SKILLS + 1 }, (_, i) => ({ id: `s${i}`, name: `s${i}`, description: '', codex: false }));
  assert.ok(validateFocus({ skills: many.map((x) => ({ id: x.id })) }, many).error);
  assert.ok(!validateFocus({ skills: many.slice(0, MAX_SKILLS).map((x) => ({ id: x.id })) }, many).error);

  // ---- PROTOCOL.md section
  const block = protocolBlock([{ id: 'review-pr', note: 'before asking for approval' }, { id: 'create-jira-work-items' }]);
  assert.equal(block, '## Skills destacadas en esta planta\nEstas skills son especialmente importantes en esta planta: úsalas siempre que la tarea encaje. Las demás skills siguen disponibles y puedes usarlas como siempre.\nAntes de hacer estas tareas, carga la skill (Skill tool, o lee su SKILL.md si no tienes la herramienta):\n- `review-pr`: before asking for approval\n- `create-jira-work-items`\n');
  const doc = '# Protocol\r\n\r\nRule 1 — keep “this” exactly.  \n\tTabbed\n';
  const once = replaceBlock(doc, block);
  assert.ok(once.startsWith(doc), 'the rest is kept byte for byte');
  assert.equal(once, `${doc}\n${BEGIN}\n${block}${END}\n`);
  assert.equal(replaceBlock(once, block), once, 'idempotent');
  const mid = `top\n${BEGIN}\nold stuff\n${END}\nbottom no newline`;
  assert.equal(replaceBlock(mid, block), `top\n${BEGIN}\n${block}${END}\nbottom no newline`);
  assert.equal(replaceBlock(replaceBlock(mid, block), ''), `top\n${BEGIN}\n${END}\nbottom no newline`);
  assert.equal(replaceBlock('no newline', ''), `no newline\n\n${BEGIN}\n${END}\n`);
  assert.equal(replaceBlock('', block), `${BEGIN}\n${block}${END}\n`);
  assert.throws(() => replaceBlock(`a ${END} b ${BEGIN}`, block));
  assert.throws(() => replaceBlock(`a ${BEGIN} b`, block));
  assert.throws(() => replaceBlock(`${BEGIN}${END}${BEGIN}${END}`, block));

  // ---- saving: focus file, protocol section, backup of the previous file
  const team = path.join(tmp, 'team');
  await fs.mkdir(team);
  await fs.writeFile(path.join(team, 'PROTOCOL.md'), doc);
  const r1 = await saveFocus(team, [{ id: 'plain', note: 'n' }]);
  assert.equal(r1.protocolChanged, true);
  assert.equal(await fs.readFile(path.join(team, 'PROTOCOL.md.bak-skills'), 'utf8'), doc);
  const p1 = await fs.readFile(path.join(team, 'PROTOCOL.md'), 'utf8');
  assert.ok(p1.startsWith(doc) && p1.includes('- `plain`: n'));
  assert.deepEqual((await readFocus(team)).skills, [{ id: 'plain', note: 'n' }]);
  const r2 = await saveFocus(team, [{ id: 'plain', note: 'n' }]);
  assert.equal(r2.protocolChanged, false);
  assert.equal(await fs.readFile(path.join(team, 'PROTOCOL.md'), 'utf8'), p1);
  await fs.writeFile(path.join(team, 'PROTOCOL.md'), `${doc}${BEGIN}\n`); // broken markers: nothing is written
  await assert.rejects(saveFocus(team, []));
  assert.deepEqual((await readFocus(team)).skills, [{ id: 'plain', note: 'n' }]);
  assert.ok(!(await fs.readdir(team)).some((f) => f.endsWith('.tmp')));
  assert.deepEqual(await readFocus(path.join(tmp, 'nowhere')), { version: 1, skills: [], updatedAt: null });
} finally { await fs.rm(tmp, { recursive: true, force: true }); }
console.log('skills.test.mjs: all good');
