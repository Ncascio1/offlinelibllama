// Where things are on the drive.
//
// The app never hard-codes a drive letter. It starts from its own program file
// and walks up the folders until it finds the drive root, recognised by having
// a "library" folder and a "_system" folder side by side.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_LEVELS_UP = 6; // _system/app/resources/app/src/main is 5 levels deep

// Is `dir` the drive root? (has both library/ and _system/)
// `p` is the path toolkit (tests pass path.win32 to check Windows paths on any computer).
function looksLikeDriveRoot(dir, exists = fs.existsSync, p = path) {
  return exists(p.join(dir, 'library')) && exists(p.join(dir, '_system'));
}

// Walk up from `startDir` until a drive root is found. Returns null if none.
// `exists` can be replaced in tests.
function findDriveRoot(startDir, exists = fs.existsSync, p = path) {
  let dir = p.resolve(startDir);
  for (let i = 0; i <= MAX_LEVELS_UP; i++) {
    if (looksLikeDriveRoot(dir, exists, p)) return dir;
    const parent = p.dirname(dir);
    if (parent === dir) break; // reached the top of the drive
    dir = parent;
  }
  return null;
}

// All the folders the app uses, worked out from the drive root.
function drivePaths(root) {
  const sys = path.join(root, '_system');
  const exe = process.platform === 'win32' ? '.exe' : '';
  return {
    root,
    library: path.join(root, 'library'),
    models: path.join(root, 'models'),
    system: sys,
    kiwixExe: path.join(sys, 'kiwix', 'kiwix-serve' + exe),
    llamaExe: path.join(sys, 'llama', 'llama-server' + exe),
    configFile: path.join(sys, 'config.json'),
    licenses: path.join(root, 'LICENSES'),
    // These two may move to the temp folder if the drive is read-only:
    data: path.join(sys, 'data'),
    logs: path.join(sys, 'logs'),
  };
}

// Can we write into `dir`? Creates it if needed, then writes and removes a tiny file.
function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

// Decide where data and logs go. On a write-protected drive, use the temp folder
// (allowed by the brief) so the app still runs.
function chooseWritableDirs(paths, writable = isWritable, tmp = os.tmpdir()) {
  if (writable(paths.data) && writable(paths.logs)) {
    return { data: paths.data, logs: paths.logs, driveReadOnly: false };
  }
  const base = path.join(tmp, 'offline-library');
  return { data: path.join(base, 'data'), logs: path.join(base, 'logs'), driveReadOnly: true };
}

module.exports = { findDriveRoot, looksLikeDriveRoot, drivePaths, chooseWritableDirs, isWritable };
