// Tests for the guest listener (peers.mjs): who may do what from another building. No real team, terminal or tool:
// a temporary HOME with stub `team-peer` / `team-ask` that only log, and the listener on a spare port.
//   node peers.test.mjs        (exit code 0 when every case passes)
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'peers-test-'));
process.env.HOME = HOME;
const T = path.join(HOME, '.omniloy-team'), BIN = path.join(HOME, '.local', 'bin'), APP = path.join(HOME, 'app'), LOG = path.join(HOME, 'calls.log');
for (const d of [T, BIN, path.join(APP, 'public', 'js')]) fs.mkdirSync(d, { recursive: true });
const stub = (name, out) => fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\necho "${name} $*" >> '${LOG}'\ncat > /dev/null\necho '${out}'\n`, { mode: 0o755 });
stub('team-peer', '{"ok":true}'); stub('team-ask', 'answered');
const PORT = 40000 + Math.floor(Math.random() * 5000), G = PORT + 1000;
fs.writeFileSync(path.join(T, 'team.json'), JSON.stringify({ name: 'Test', lead: 'ana', personas: [{ herdrName: 'ana', name: 'Ana' }, { herdrName: 'bob', name: 'Bob' }] }));
fs.writeFileSync(path.join(APP, 'public', 'index.html'), '<html><head></head><body>%%OFFICE_TOKEN%%</body></html>');
fs.writeFileSync(path.join(APP, 'public', 'js', 'main.js'), '// ok');
fs.writeFileSync(path.join(APP, 'public', 'js', 'main.js.bak-1'), '// a backup');
const peers = (status, extra = {}) => fs.writeFileSync(path.join(T, 'peers.json'), JSON.stringify({ me: { id: 'cccc3333', name: 'Here' }, ...extra,
  peers: { aaaa1111: { id: 'aaaa1111', name: 'There', owner: 'Tester', status, key: 'k1', chats: true, my: { [PORT]: { on: true, share: true } } } } }));
const requests = (items) => fs.writeFileSync(path.join(T, 'requests.json'), JSON.stringify({ next: 9, items }));
peers('none'); requests([]);
const agents = () => [{ herdrName: 'ana', name: 'Ana', status: 'idle', address: 't1', where: 'Dev / 1', turn: 7, runtime: 'claude', startedMs: 1, screen: ['secret'], color: '#888' },
  { herdrName: 'bob', name: 'Bob', status: 'blocked', address: 't2', turn: 3, runtime: 'codex' }];
const chatLog = async () => ({ file: '', messages: [], live: true, blocked: true, screen: 'raw screen with a password', menu: { id: 'm1' } });

const { createPeers } = await import('./peers.mjs');
createPeers({ port: PORT, agents, OFFICES: [{ name: 'Dev', port: PORT, dir: '.omniloy-team' }], APP, chatLog, theme: async () => ({ effective: 'oficina' }) });
await new Promise((r) => setTimeout(r, 400));

const P = { 'x-peer-id': 'aaaa1111', 'x-peer-key': 'k1' };
async function call(p, { body, headers = {}, type = 'application/json' } = {}) {
  const r = await fetch(`http://127.0.0.1:${G}${p}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'content-type': type }), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  return { code: r.status, body: j, text: t };
}
const calls = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '');
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

await test('a simple cross-site POST (text/plain) is refused', async () => assert.equal((await call('/peer/hello', { body: '{"from":{"id":"bbbb2222"},"key":"x"}', type: 'text/plain' })).code, 415));
await test("a foreign page's Origin cannot say hello", async () => assert.equal((await call('/peer/hello', { body: { from: { id: 'bbbb2222' }, key: 'x' }, headers: { origin: 'https://evil.example' } })).code, 403));
await test('a renamed Host (DNS rebinding) is refused', async () => { // fetch cannot set Host: plain http
  const code = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: G, path: '/api/state', headers: { ...P, host: 'evil.example' } }, (r) => { r.resume(); resolve(r.statusCode); }));
  assert.equal(code, 403);
});
await test('the room needs a known building', async () => assert.equal((await call('/api/state')).code, 401));
await test('a visitor never gets addresses, turns, runtimes or screens', async () => {
  const r = await call('/api/state', { headers: P }), a = r.body.agents[0];
  assert.equal(r.code, 200);
  for (const k of ['address', 'where', 'turn', 'runtime', 'startedMs']) assert.ok(!a[k], `${k} = ${a[k]}`);
  assert.deepEqual(a.screen, []);
});
await test('a hello cannot take over a building already asked to connect', async () => {
  peers('out');
  const r = await call('/peer/hello', { body: { from: { id: 'aaaa1111' }, key: 'other' } });
  assert.equal(r.code, 409); assert.ok(!calls().includes('incoming hello'));
});
await test('a hello from a building met but not agreed passes to team-peer', async () => {
  peers('none');
  assert.equal((await call('/peer/hello', { body: { from: { id: 'aaaa1111' }, key: 'other' } })).code, 200);
  assert.ok(calls().includes('team-peer incoming hello'));
});
await test('not connected: no message and no answer', async () => {
  peers('none');
  assert.equal((await call('/peer/message', { body: { floor: PORT, text: 'hi' }, headers: P })).code, 403);
  assert.equal((await call('/peer/answer', { body: { ref: { local: 1 }, text: 'yes' }, headers: P })).code, 403);
});
await test('connected: an answer only to an open request that went to that building (home)', async () => {
  requests([{ id: 1, kind: 'request', from: 'ana', to: '__OWNER_ID__', status: 'open', title: 'Deploy?' }, { id: 2, kind: 'request', from: 'ana', status: 'answered', title: 'Old' }]);
  peers('on');
  assert.equal((await call('/peer/answer', { body: { ref: { local: 1 }, text: 'yes' }, headers: P })).code, 403, 'not the home building');
  peers('on', { home: 'aaaa1111' });
  assert.equal((await call('/peer/answer', { body: { ref: { local: 2 }, text: 'yes' }, headers: P })).code, 403, 'already answered');
  assert.equal((await call('/peer/answer', { body: { ref: { agent: 'nobody' }, text: 'yes' }, headers: P })).code, 403, 'unknown agent');
  assert.equal((await call('/peer/answer', { body: { ref: { local: 1 }, text: 'yes' }, headers: P })).code, 403, 'open, but never forwarded there');
  peers('on', { home: 'aaaa1111', sent: { 1: 'bbbb2222' } });
  assert.equal((await call('/peer/answer', { body: { ref: { local: 1 }, text: 'yes' }, headers: P })).code, 403, 'forwarded to another building');
  peers('on', { home: 'aaaa1111', sent: { 1: 'aaaa1111' } });
  assert.equal((await call('/peer/answer', { body: { ref: { local: 1 }, text: 'yes' }, headers: P })).code, 200);
  peers('on', { home: 'bbbb2222', sent: { 1: 'aaaa1111' } });
  assert.equal((await call('/peer/answer', { body: { ref: { local: 1 }, text: 'yes' }, headers: P })).code, 200, 'home changed after it was forwarded');
});
await test('an answer for one of our people or for the owner: only against a message that went to that building', async () => {
  peers('on');
  assert.equal((await call('/peer/answer', { body: { ref: {}, text: 'hi' }, headers: P })).code, 403, 'empty ref, nothing sent there');
  assert.equal((await call('/peer/answer', { body: { ref: { agent: 'ana' }, text: 'hi' }, headers: P })).code, 403, 'ana sent nothing there');
  const ts = Date.now() / 1000;
  peers('on', { asked: [{ peer: 'bbbb2222', agent: 'ana', ts }, { peer: 'aaaa1111', agent: 'ana', ts: ts - 40 * 86400 }] });
  assert.equal((await call('/peer/answer', { body: { ref: { agent: 'ana' }, text: 'hi' }, headers: P })).code, 403, 'sent to another building, or too long ago');
  peers('on', { asked: [{ peer: 'aaaa1111', agent: 'ana', ts }, { peer: 'aaaa1111', agent: '', ts }] });
  assert.equal((await call('/peer/answer', { body: { ref: { agent: 'ana' }, text: 'hi' }, headers: P })).code, 200);
  assert.equal((await call('/peer/answer', { body: { ref: {}, text: 'hi' }, headers: P })).code, 200, 'the owner wrote there');
});
await test('a tool that fails here is "try again" (503); only its own refusal is a 400', async () => {
  peers('on', { asked: [{ peer: 'aaaa1111', agent: 'ana', ts: Date.now() / 1000 }] });
  fs.writeFileSync(path.join(BIN, 'team-peer'), '#!/bin/sh\ncat > /dev/null\necho "Traceback: boom" >&2\nexit 1\n', { mode: 0o755 });
  assert.equal((await call('/peer/answer', { body: { ref: { agent: 'ana' }, text: 'hi' }, headers: P })).code, 503);
  fs.writeFileSync(path.join(BIN, 'team-peer'), '#!/bin/sh\ncat > /dev/null\necho \'{"error": "nothing waiting"}\' >&2\nexit 1\n', { mode: 0o755 });
  const r = await call('/peer/answer', { body: { ref: { agent: 'ana' }, text: 'hi' }, headers: P });
  assert.equal(r.code, 400); assert.equal(r.body.error, 'nothing waiting');
  stub('team-peer', '{"ok":true}');
});
await test('a building that was connected once cannot be re-keyed by a hello', async () => {
  fs.writeFileSync(path.join(T, 'peers.json'), JSON.stringify({ me: { id: 'cccc3333', name: 'Here' }, peers: { aaaa1111: { id: 'aaaa1111', name: 'There', status: 'none', met: true, key: 'k1', my: {} } } }));
  const r = await call('/peer/hello', { body: { from: { id: 'aaaa1111', name: 'Evil' }, key: 'REPLACED' } });
  assert.equal(r.code, 409);
});
await test('shared requests: only this floor\'s, only while connected, and only those can be answered', async () => {
  requests([{ id: 3, kind: 'request', from: 'bob', status: 'open', title: 'Mine?' }, { id: 4, kind: 'request', from: 'zed', status: 'open', title: 'Another floor?' }]);
  peers('on');
  assert.deepEqual((await call('/api/requests', { headers: P })).body.items.map((x) => x.id), [3]);
  assert.equal((await call('/api/requests/answer', { body: { id: 4, text: 'no' }, headers: P })).code, 403);
  peers('paused');
  assert.deepEqual((await call('/api/requests', { headers: P })).body.items, []);
  assert.equal((await call('/api/requests/answer', { body: { id: 3, text: 'no' }, headers: P })).code, 403);
  peers('on'); fs.writeFileSync(LOG, '');
  assert.equal((await call('/api/requests/answer', { body: { id: 3, text: '--no, wait' }, headers: P })).code, 200);
  assert.ok(calls().includes('team-ask answer 3 ​--no, wait'), calls());
});
await test('visits say who comes and goes, never what was said', async () => {
  fs.writeFileSync(path.join(T, 'visits.json'), JSON.stringify([{ id: 'v', kind: 'in', floor: PORT, to: 'ana', text: 'health words', until: Date.now() + 60000 }]));
  assert.equal((await call('/api/visits')).code, 401);
  const v = (await call('/api/visits', { headers: P })).body;
  assert.equal(v.in.length, 1); assert.ok(!('text' in v.in[0]));
});
await test('a visitor reading a chat gets no screen and no menu', async () => {
  peers('on');
  const r = await call('/api/chat?name=bob', { headers: P });
  assert.equal(r.code, 200); assert.equal(r.body.screen, ''); assert.equal(r.body.menu, null); assert.equal(r.body.blocked, false);
  peers('paused');
  assert.equal((await call('/api/chat?name=bob', { headers: P })).code, 404);
});
await test('backups next to the page are never served', async () => {
  assert.equal((await call('/js/main.js')).code, 200);
  assert.equal((await call('/js/main.js.bak-1')).code, 404);
});

fs.rmSync(HOME, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
