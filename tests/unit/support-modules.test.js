'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, DEFAULTS } = require('../../app/src/main/config');
const { cleanStaleEngines } = require('../../app/src/main/processes');
const { resolveAppUrl, safeJoin } = require('../../app/src/main/app-protocol');
const messages = require('../../app/src/main/messages');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ol-unit-'));
const quietLog = { info() {}, warn() {}, error() {} };

// ---- config.json ----
test('config: missing file gives defaults', () => {
  assert.deepStrictEqual(loadConfig(path.join(tmp(), 'nope.json'), quietLog), DEFAULTS);
});
test('config: broken file is ignored, never crashes', () => {
  const f = path.join(tmp(), 'config.json'); fs.writeFileSync(f, '{ "forceTier": "small", oops');
  assert.deepStrictEqual(loadConfig(f, quietLog), DEFAULTS);
});
test('config: valid values are used, silly ones ignored', () => {
  const f = path.join(tmp(), 'config.json');
  fs.writeFileSync(f, JSON.stringify({ forceTier: 'medium', contextSize: 8192, aiEnabled: false, aiThreads: -3, kiwixStartSeconds: 'soon' }));
  const c = loadConfig(f, quietLog);
  assert.strictEqual(c.forceTier, 'medium'); assert.strictEqual(c.contextSize, 8192); assert.strictEqual(c.aiEnabled, false);
  assert.strictEqual(c.aiThreads, null); assert.strictEqual(c.kiwixStartSeconds, DEFAULTS.kiwixStartSeconds);
  fs.writeFileSync(f, JSON.stringify({ forceTier: 'huge', contextSize: 99999999 }));
  assert.strictEqual(loadConfig(f, quietLog).forceTier, null);
  assert.strictEqual(loadConfig(f, quietLog).contextSize, null);
});

// ---- crash leftovers ----
test('stale engines: only our own engine files are stopped; file is removed afterwards', async () => {
  const dir = tmp();
  const ourKiwix = path.join(dir, 'kiwix-serve'); fs.writeFileSync(ourKiwix, '');
  const pids = path.join(dir, 'pids.json');
  // A real, harmless process we are allowed to stop, pretending to be our engine:
  const { spawn } = require('child_process');
  const victim = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)']);
  const bystander = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)']);
  fs.writeFileSync(pids, JSON.stringify([
    { label: 'kiwix', pid: victim.pid }, { label: 'ai', pid: bystander.pid }, { label: 'ai', pid: 999999 }, { label: 'x', pid: 'bad' },
  ]));
  const lookup = async pid => (pid === victim.pid ? ourKiwix : pid === bystander.pid ? '/usr/bin/some-other-program' : null);
  const report = await cleanStaleEngines(pids, [ourKiwix], quietLog, lookup);
  await new Promise(r => setTimeout(r, 300));
  assert.match(report.join('\n'), /left over from last time, stopped/);
  assert.match(report.join('\n'), /another program, left alone/);
  assert.match(report.join('\n'), /not running/);
  assert.notStrictEqual(victim.exitCode === null && victim.signalCode === null, true, 'our leftover was stopped');
  assert.strictEqual(bystander.exitCode, null, 'the other program is still running');
  assert.ok(!fs.existsSync(pids), 'pids.json removed');
  bystander.kill();
});
test('stale engines: missing or broken pids.json is fine', async () => {
  assert.deepStrictEqual(await cleanStaleEngines(path.join(tmp(), 'none.json'), [], quietLog), []);
  const f = path.join(tmp(), 'pids.json'); fs.writeFileSync(f, 'garbage');
  assert.deepStrictEqual(await cleanStaleEngines(f, [], quietLog), []);
});

// ---- app:// addresses ----
test('app:// pages map to files inside the app only', () => {
  const opts = { rendererDir: '/app/renderer', paths: { startHere: '/drive/START-HERE.html', licenses: '/drive/LICENSES' } };
  assert.strictEqual(resolveAppUrl('app://local/home.html', opts), path.resolve('/app/renderer/home.html'));
  assert.strictEqual(resolveAppUrl('app://drive/START-HERE.html', opts), '/drive/START-HERE.html');
  assert.strictEqual(resolveAppUrl('app://drive/LICENSES/kiwix.txt', opts), path.resolve('/drive/LICENSES/kiwix.txt'));
  // Tricks that try to climb out of the app folder: the result must be refused (null)
  // or still land inside the allowed folders (where the file simply won't exist).
  const inside = f => f === null || f.startsWith(path.resolve('/app/renderer') + path.sep) ||
                      f.startsWith(path.resolve('/drive/LICENSES') + path.sep) || f === '/drive/START-HERE.html';
  for (const bad of ['app://local/../../etc/passwd', 'app://local/%2e%2e/%2e%2e/secret', 'app://local/..%2f..%2fsecret',
                     'app://local/..%5c..%5csecret', 'app://drive/LICENSES/..%2f..%2fmodels/small.gguf'])
    assert.ok(inside(resolveAppUrl(bad, opts)), `${bad} -> ${resolveAppUrl(bad, opts)}`);
  // Anything else on the drive or another host is refused outright.
  for (const bad of ['app://drive/library/book.zim', 'app://drive/models/small.gguf', 'app://other/x'])
    assert.strictEqual(resolveAppUrl(bad, opts), null, bad);
  assert.strictEqual(safeJoin('/a/b', '../c'), null);
});

// ---- wording rules for customer messages ----
test('customer messages avoid jargon and start with a capital letter', () => {
  const all = [];
  (function walk(o) { for (const v of Object.values(o)) typeof v === 'string' ? all.push(v) : walk(v); })(messages);
  for (const m of all) {
    assert.ok(!/\b(server|port|model|llama|kiwix|gguf|zim|error code)\b/i.test(m), `jargon in: ${m}`);
    assert.ok(/^[A-Z]/.test(m), `should start with a capital: ${m}`);
    assert.ok(!/sorry|apologi/i.test(m), `no apologies: ${m}`);
  }
});
