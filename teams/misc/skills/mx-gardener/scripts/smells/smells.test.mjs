// T9: every detector fires on its fixture and stays quiet on the clean one; the ledger reaches the Rule-card condition.
// Run: node --test smells.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL } from './detectors/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)); const CLI = path.join(HERE, 'smells.mjs'); const FIX = path.join(HERE, 'fixtures');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'smells-')); const REPO = path.join(T, 'repo'); const TEAM = path.join(T, 'team');
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { env, encoding: 'utf8' });
fs.cpSync(path.join(FIX, 'base'), REPO, { recursive: true }); git('init', '-q', '-b', 'main'); git('remote', 'add', 'origin', 'git@github.com:Omniloy/x.git'); git('add', '.'); git('commit', '-qm', 'base');
git('checkout', '-qb', 'dirty'); fs.cpSync(path.join(FIX, 'dirty'), REPO, { recursive: true }); git('add', '.'); git('commit', '-qm', 'dirty');
git('checkout', '-q', 'main'); git('checkout', '-qb', 'clean'); fs.cpSync(path.join(FIX, 'clean'), REPO, { recursive: true }); git('add', '.'); git('commit', '-qm', 'clean');
const KIT = path.join(T, 'kit'); fs.mkdirSync(path.join(KIT, 'references/features'), { recursive: true });
fs.writeFileSync(path.join(KIT, 'references/features/board.md'), '---\nsources: [src/board/**]\n---\n# board\n');
fs.mkdirSync(path.join(TEAM, 'verify'), { recursive: true }); fs.writeFileSync(path.join(TEAM, 'verify/registry.json'), JSON.stringify({ repos: { 'Omniloy/x': { kit: KIT } } }));
for (const [k, nb] of [['MSC-1', true], ['MSC-2', false]]) { fs.mkdirSync(path.join(TEAM, 'evidence', k), { recursive: true });
  fs.writeFileSync(path.join(TEAM, 'evidence', k, 'manifest.json'), JSON.stringify({ key: k, noBehavior: nb, claims: [{ id: 1, tier: 'V1' }] })); }
const smells = (...a) => { const r = spawnSync(process.execPath, [CLI, ...a, '--team', TEAM, '--json'], { encoding: 'utf8' }); return { code: r.status, j: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr }; };

test('help and list', () => { assert.equal(spawnSync(process.execPath, [CLI, '--help']).status, 0); });
test('every detector fires on the dirty fixture', () => {
  fs.mkdirSync(path.join(TEAM, 'board'), { recursive: true });
  fs.writeFileSync(path.join(TEAM, 'board/gate-overrides.jsonl'), JSON.stringify({ at: '2026-11-25T10:00:00', key: 'MSC-3', to: 'Done', reason: 'hotfix' }) + '\n');
  let r; try { r = smells('diff', 'main..dirty', '--repo', REPO, '--card', 'MSC-1'); } finally { fs.rmSync(path.join(TEAM, 'board/gate-overrides.jsonl')); }
  assert.equal(r.code, 1, r.err);
  const got = new Set(r.j.findings.map((f) => f.smell));
  for (const id of ALL) assert.ok(got.has(id), `${id} did not fire; got ${[...got]}`);
  assert.ok(r.j.findings.every((f) => f.fix && f.fix.length > 20), 'every finding says what to do instead');
});
test('the clean fixture has no findings', () => { const r = smells('diff', 'main..clean', '--repo', REPO, '--card', 'MSC-2'); assert.equal(r.code, 0, JSON.stringify(r.j)); assert.equal(r.j.count, 0); });
test('tree runs the line detectors', () => { const r = smells('tree', path.join(FIX, 'dirty')); assert.equal(r.code, 1); assert.ok(r.j.findings.some((f) => f.smell === 'suppression')); });
test('ledger: a smell seen twice is a Rule card', () => {
  const f = path.join(T, 'f.json');
  fs.writeFileSync(f, JSON.stringify([{ repo: 'Omniloy/x', pr: 41, smell: 'escape-cast', file: 'src/a.ts', line: 3, class: 'fix', card: 'MSC-1' }]));
  assert.equal(smells('ledger', 'add', '--file', f).code, 0);
  assert.equal(smells('ledger', 'count', '--smell', 'escape-cast', '--repo', 'Omniloy/x').j.ruleCard, false);
  fs.writeFileSync(f, JSON.stringify([{ repo: 'Omniloy/x', pr: 44, smell: 'escape-cast', file: 'src/b.ts', line: 9, class: 'fix', card: 'MSC-5' }]));
  smells('ledger', 'add', '--file', f);
  const c = smells('ledger', 'count', '--smell', 'escape-cast', '--repo', 'Omniloy/x').j; assert.equal(c.count, 2); assert.equal(c.ruleCard, true);
  fs.writeFileSync(f, JSON.stringify([{ repo: 'Omniloy/x', pr: 45, smell: 'not-a-smell' }])); assert.equal(smells('ledger', 'add', '--file', f).code, 2);
  const tsv = fs.readFileSync(path.join(TEAM, 'garden/ledger.tsv'), 'utf8'); assert.match(tsv.split('\n')[0], /^ts\trepo\tpr\tsmell\tfile_line\tclass\tcard$/);
});
test('a bad range is a usage error', () => { assert.equal(smells('diff', 'nope..alsonope', '--repo', REPO).code, 2); });
test.after(() => fs.rmSync(T, { recursive: true, force: true }));
test('a large --json result survives a slow pipe (no cut at 64 KiB)', () => {
  const big = path.join(T, 'big'); fs.mkdirSync(big, { recursive: true });
  for (let i = 0; i < 300; i++) fs.cpSync(path.join(FIX, 'dirty'), path.join(big, `copy${i}`), { recursive: true });
  const out = execFileSync('bash', ['-c', `"${process.execPath}" "${CLI}" tree "${big}" --json | (sleep 1; cat)`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.ok(out.length > 100 * 1024, `only ${out.length} bytes; the fixture must produce more than 100 KB`);
  const j = JSON.parse(out); assert.equal(j.count, j.findings.length);
});
