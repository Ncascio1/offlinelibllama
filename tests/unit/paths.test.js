'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { findDriveRoot, drivePaths, chooseWritableDirs } = require('../../app/src/main/paths');

// Build a fake drive in a temp folder with the given name.
function fakeDrive(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ol-test-')) + path.sep + name;
  for (const d of ['library', '_system/app/resources/app/src/main', 'models']) fs.mkdirSync(path.join(root, d), { recursive: true });
  return root;
}

for (const name of ['USB', 'My USB Drive', 'Bücher Ünïcødé', 'диск 地图 (1)']) {
  test(`finds the drive root from deep inside the app: "${name}"`, () => {
    const root = fakeDrive(name);
    const deep = path.join(root, '_system', 'app', 'resources', 'app', 'src', 'main');
    assert.strictEqual(findDriveRoot(deep), root);
  });
}

test('returns null when no drive root is found', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ol-none-'));
  assert.strictEqual(findDriveRoot(dir), null);
});

test('drive letter changes and Windows paths: E:, G:, Z:, with spaces and accents', () => {
  const win = path.win32;
  for (const root of ['E:\\', 'G:\\', 'Z:\\', 'E:\\Prepper Kit Ü\\']) {
    const existing = new Set([win.join(root, 'library'), win.join(root, '_system')]);
    const start = win.join(root, '_system', 'app', 'resources', 'app', 'src', 'main');
    assert.strictEqual(findDriveRoot(start, f => existing.has(f), win), win.resolve(root));
  }
});

test('drivePaths keeps everything under the root', () => {
  const p = drivePaths(path.join('X', 'My Drive'));
  for (const v of Object.values(p)) assert.ok(v.startsWith(path.join('X', 'My Drive')), v);
});

test('read-only drive: data and logs move to the temp folder', () => {
  const p = drivePaths('/drive');
  const r = chooseWritableDirs(p, () => false, '/tmp');
  assert.strictEqual(r.driveReadOnly, true);
  assert.strictEqual(r.data, path.join('/tmp', 'offline-library', 'data'));
  const w = chooseWritableDirs(p, () => true, '/tmp');
  assert.deepStrictEqual(w, { data: p.data, logs: p.logs, driveReadOnly: false });
});
