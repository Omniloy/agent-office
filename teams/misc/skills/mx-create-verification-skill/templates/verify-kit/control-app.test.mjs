// Tests for control-<<app>>.mjs: one test per command, run as the kit's own V0 step (`node --test control-<<app>>.test.mjs`).
// The template's copy drives a tiny fixture app; a generated kit replaces FIXTURE with the real app's launch
// (keep the shape: launch, every command once, cleanup, evidence survives).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = fs.readdirSync(HERE).find((f) => /^control-.*\.mjs$/.test(f) && !f.endsWith('.test.mjs'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-kit-test-'));
const checkout = path.join(tmp, 'checkout'); const out = path.join(tmp, 'evidence');
fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });
const FIXTURE = `import http from 'node:http';
const port = Number(process.argv[2]);
const page = \`<!doctype html><title>Fixture</title><main data-app="fixture"><h1>Board</h1>
<button aria-label="Add card" onclick="const c=document.querySelector('#count');c.textContent=Number(c.textContent)+1">Add</button>
<span id="count">0</span><input type="password" id="pw" aria-label="Password"><a href="/missing">broken</a></main>\`;
http.createServer((q, r) => { if (q.url === '/missing') { r.writeHead(404); return r.end('no'); } r.writeHead(200, {'content-type': 'text/html'}); r.end(page); })
  .listen(port, '127.0.0.1', () => console.log('fixture ready on ' + port));`;
fs.writeFileSync(path.join(checkout, 'fixture.mjs'), FIXTURE);
const ENV = { ...process.env, VERIFY_APP: 'fixture', VERIFY_LAUNCH: 'node fixture.mjs {port}', VERIFY_READY: 'fixture ready', VERIFY_MARKER: '[data-app=fixture]', VERIFY_SOURCES: 'src', VERIFY_BUILD: '' , EVIDENCE_OUT: out };
function cli(...args) {
  const r = spawnSync(process.execPath, [path.join(HERE, CLI), ...args, '--checkout', checkout, '--json'], { env: ENV, encoding: 'utf8', timeout: 90000 });
  let j = null; try { j = JSON.parse(r.stdout.trim().split('\n').pop()); } catch {}
  return { code: r.status, j, stderr: r.stderr };
}

before(() => { const r = cli('launch'); assert.equal(r.code, 0, JSON.stringify(r.j) + r.stderr); });
after(() => { cli('cleanup'); fs.rmSync(tmp, { recursive: true, force: true }); });

test('help prints the commands and exits 0', () => {
  const r = spawnSync(process.execPath, [path.join(HERE, CLI), '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0); assert.match(r.stdout, /probe-selectors/);
});
test('no --checkout is refused with exit 2', () => {
  const r = spawnSync(process.execPath, [path.join(HERE, CLI), 'info', '--json'], { env: { ...ENV, VERIFY_CHECKOUT: '' }, encoding: 'utf8' });
  assert.equal(r.status, 2);
});
test('a second launch on the same checkout is refused', () => { assert.equal(cli('launch').code, 2); });
test('doctor passes on the instance we started', () => { const r = cli('doctor'); assert.equal(r.code, 0, JSON.stringify(r.j)); });
test('info shows the page', () => { const r = cli('info'); assert.equal(r.code, 0); assert.match(r.j.result.title, /Fixture/); });
test('snapshot returns ARIA', () => { const r = cli('snapshot'); assert.equal(r.code, 0); assert.match(r.j.result.aria, /Add card/); });
test('record, click, assert text, record stop leaves a video', () => {
  assert.equal(cli('record', 'start').code, 0);
  assert.equal(cli('click', 'role=button[name="Add card"]').code, 0);
  const a = cli('assert', 'text', '#count', '1'); assert.equal(a.code, 0); assert.deepEqual(a.j.assertions, { run: 1, failed: 0 });
  const s = cli('record', 'stop', 'add-card'); assert.equal(s.code, 0, JSON.stringify(s.j));
  assert.ok(s.j.evidence.length >= 1 && fs.existsSync(s.j.evidence[0]));
});
test('a failing assertion exits 3 and counts the failure', () => {
  const a = cli('assert', 'count', '#count', '7'); assert.equal(a.code, 3); assert.deepEqual(a.j.assertions, { run: 1, failed: 1 });
});
test('assert visible, absent and attr', () => {
  assert.equal(cli('assert', 'visible', 'h1').code, 0);
  assert.equal(cli('assert', 'absent', '.no-such-thing').code, 0);
  assert.equal(cli('assert', 'attr', '#pw', 'type', 'password').code, 0);
});
test('type --secret-env never echoes the value', () => {
  ENV.KIT_TEST_PW = 'hunter2';
  const r = cli('type', '#pw', '--secret-env', 'KIT_TEST_PW'); assert.equal(r.code, 0, JSON.stringify(r.j)); assert.doesNotMatch(JSON.stringify(r.j), /hunter2/);
  const v = cli('eval', 'document.querySelector("#pw").value'); assert.equal(v.j.result.value, 'hunter2');
});
test('press and wait-settle', () => { assert.equal(cli('press', 'Tab').code, 0); assert.equal(cli('wait-settle', '2000').code, 0); });
test('screenshot writes a png into $EVIDENCE_OUT', () => { const r = cli('screenshot', 'board'); assert.equal(r.code, 0); assert.ok(r.j.evidence[0].startsWith(out) && fs.existsSync(r.j.evidence[0])); });
test('trace start and stop write a zip', () => { assert.equal(cli('trace', 'start').code, 0); const r = cli('trace', 'stop'); assert.equal(r.code, 0); assert.ok(fs.existsSync(r.j.evidence[0])); });
test('goto and network-log count the 404', () => { assert.equal(cli('goto', cli('info').j.result.url.replace(/\/$/, '') + '/missing').code, 0); const r = cli('network-log'); assert.equal(r.code, 0); assert.ok(r.j.result.failed >= 1); });
test('console writes its log', () => { const r = cli('console'); assert.equal(r.code, 0); assert.ok(fs.existsSync(r.j.evidence[0])); });
test('probe-selectors reports a missing selector as a failed assertion', () => {
  cli('goto', cli('info').j.result.url.replace(/missing$/, ''));
  assert.equal(cli('probe-selectors', '[data-app=fixture]').code, 0);
  assert.equal(cli('probe-selectors', '[data-app=other]').code, 3);
});
test('eval reads state', () => { const r = cli('eval', 'document.title'); assert.equal(r.code, 0); assert.equal(r.j.result.value, 'Fixture'); });
test('manual exits 5 with MANUAL:', () => { const r = cli('manual', 'native file drop'); assert.equal(r.code, 5); assert.match(r.j.error, /^MANUAL:/); });
test('an unknown intent is a usage error', () => { assert.equal(cli('do', 'nothing').code, 1); });
test('cleanup stops the instance and evidence survives', () => {
  const r = cli('cleanup'); assert.equal(r.code, 0);
  assert.equal(cli('doctor').code, 2);
  assert.ok(fs.readdirSync(out).some((f) => f.endsWith('.png')));
});
