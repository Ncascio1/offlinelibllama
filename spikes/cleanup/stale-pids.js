// Spike: clean up engines left behind by a crashed previous run.
// Only kills a PID if its executable path is one of OUR engine files on this drive.
// Linux reads /proc/<pid>/exe. Windows will need another lookup (see docs) - unverified here.
'use strict';
const fs = require('fs'), path = require('path');
function exePathOf(pid) {
  try { return fs.realpathSync(`/proc/${pid}/exe`); } catch { return null; } // null = not running
}
function cleanStale(pidsFile, allowedExes) {
  let list; try { list = JSON.parse(fs.readFileSync(pidsFile, 'utf8')); } catch { return []; }
  const allowed = allowedExes.map(p => fs.realpathSync(p));
  return list.map(({ label, pid }) => {
    const exe = exePathOf(pid);
    if (!exe) return `${label} ${pid}: not running`;
    if (!allowed.includes(exe)) return `${label} ${pid}: belongs to ${exe} -> left alone`;
    process.kill(pid, 'SIGKILL'); return `${label} ${pid}: stale engine -> stopped`;
  });
}
const [pidsFile, ...exes] = process.argv.slice(2);
console.log(cleanStale(pidsFile, exes).join('\n'));
