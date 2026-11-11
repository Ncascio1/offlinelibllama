// What the customer sees when things go wrong. Each case builds a variant of
// the test drive, starts the real app, and checks the message shown.
//
// Usage: node tests/e2e/error-cases.js "<good test drive>" "<work folder>"
'use strict';
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const GOOD = process.argv[2];
const WORK = process.argv[3];
fs.mkdirSync(WORK, { recursive: true });
const exe = path.join(GOOD, '_system', 'app', 'electron');
const extraArgs = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
async function waitFor(fn, ms = 30000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(200); } return null; }
const enginePids = label => { try { return execSync(`pgrep -f '${label}'`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number); } catch { return []; } };

// Make a variant drive: links to the good drive's big folders, then `tweak` it.
function variant(name, tweak) {
  const d = path.join(WORK, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(path.join(d, '_system'), { recursive: true });
  for (const sub of ['kiwix', 'llama']) fs.symlinkSync(path.join(GOOD, '_system', sub), path.join(d, '_system', sub));
  fs.mkdirSync(path.join(d, 'library')); fs.mkdirSync(path.join(d, 'models'));
  for (const f of fs.readdirSync(path.join(GOOD, 'library'))) fs.symlinkSync(path.join(GOOD, 'library', f), path.join(d, 'library', f));
  for (const f of fs.readdirSync(path.join(GOOD, 'models'))) fs.symlinkSync(path.join(GOOD, 'models', f), path.join(d, 'models', f));
  fs.copyFileSync(path.join(GOOD, 'START-HERE.html'), path.join(d, 'START-HERE.html'));
  if (tweak) tweak(d);
  return d;
}

async function launch(drive) {
  const app = await electron.launch({ executablePath: exe, args: extraArgs, env: { ...process.env, OL_DRIVE_ROOT: drive } });
  const content = await waitFor(() => app.context().pages().find(p => p.url().includes('home.html')), 20000);
  const bar = await waitFor(() => app.context().pages().find(p => p.url().includes('bar.html')), 20000);
  const state = () => content.evaluate(() => window.ol.getState());
  return { app, content, bar, state };
}
async function quit(app) { const c = app.waitForEvent('close').catch(() => {}); await app.evaluate(({ app }) => app.quit()).catch(() => {}); await c; await sleep(500); }

(async () => {
  // A. No books on the drive
  {
    const d = variant('no-books', d => { for (const f of fs.readdirSync(path.join(d, 'library'))) fs.unlinkSync(path.join(d, 'library', f)); });
    const { app, content, state } = await launch(d);
    const s = await waitFor(async () => { const s = await state(); return s.library.state === 'no-books' && s; });
    await content.screenshot({ path: path.join(WORK, 'A-no-books.png') });
    check('no books: plain "No books found" message on the home page', !!s && (await content.textContent('main')).includes('No books found on this drive'));
    check('no books: the AI is off with a reason', !!s && s.ai.state === 'off', s && s.ai.message);
    await quit(app);
  }
  // B. No AI files
  {
    const d = variant('no-models', d => { for (const f of fs.readdirSync(path.join(d, 'models'))) fs.unlinkSync(path.join(d, 'models', f)); });
    const { app, bar, state } = await launch(d);
    const s = await waitFor(async () => { const s = await state(); return s.library.state === 'ready' && s.ai.state !== 'starting' && s; });
    check('no AI files: Library still works', !!s && s.library.books.length === 3);
    check('no AI files: AI off with a clear message', !!s && s.ai.state === 'off' && /AI files are missing/.test(s.ai.message), s && s.ai.message);
    check('no AI files: bar says "AI off"', (await bar.textContent('#ai-text')) === 'AI off');
    await quit(app);
  }
  // C. Kiwix stops while a book is open (like the drive being unplugged)
  {
    const d = variant('kiwix-dies', null);
    const { app, content, bar, state } = await launch(d);
    await waitFor(async () => (await state()).library.state === 'ready');
    await bar.click('button[data-cmd=library]');
    await content.waitForURL(/library\.html/);
    await content.click('text=Ray Charles');
    await content.waitForURL(/\/viewer#/);
    const pid = enginePids(`${d}/_system/kiwix/kiwix-serve`)[0];
    process.kill(pid, 'SIGKILL');
    const msg = await waitFor(() => content.url().includes('message.html?kind=library-stopped') && content.textContent('main'), 10000);
    await content.screenshot({ path: path.join(WORK, 'C-library-stopped.png') });
    check('Kiwix killed: book view switches to a plain message', !!msg && msg.includes('If you unplugged the drive'), msg ? msg.slice(0, 80) : content.url());
    const s = await state();
    check('Kiwix killed: home page will explain it too', s.library.state === 'failed');
    check('Kiwix killed: the app itself keeps running (no crash)', !content.isClosed());
    await quit(app);
  }
  // D. The AI stops while running
  {
    const d = variant('ai-dies', null);
    const { app, bar, state } = await launch(d);
    await waitFor(async () => (await state()).ai.state === 'ready', 60000);
    const pid = enginePids(`${d}/_system/llama/llama-server`)[0];
    process.kill(pid, 'SIGKILL');
    const s = await waitFor(async () => { const s = await state(); return s.ai.state === 'failed' && s; }, 10000);
    check('AI killed: status becomes "unavailable" with a plain message', !!s && /Library and Maps still work/.test(s.ai.message), s && s.ai.message);
    check('AI killed: bar shows "AI unavailable"', (await bar.textContent('#ai-text')) === 'AI unavailable');
    check('AI killed: Library still works', (await state()).library.state === 'ready');
    await quit(app);
  }
  // E. Read-only drive (folder permissions; the test machine runs as root, so use a read-only bind mount)
  {
    const d = variant('read-only', null);
    const ro = path.join(WORK, 'RO mount');
    fs.mkdirSync(ro, { recursive: true });
    let mounted = false;
    try { execSync(`mount --bind "${d}" "${ro}" && mount -o remount,bind,ro "${ro}"`); mounted = true; } catch {}
    if (!mounted) check('read-only drive (skipped: cannot mount here)', true);
    else {
      const { app, state } = await launch(ro);
      const s = await waitFor(async () => { const s = await state(); return s.library.state === 'ready' && s; });
      check('read-only drive: the app runs and the library opens', !!s);
      check('read-only drive: the app knows it is read-only', !!s && s.driveReadOnly === true);
      await quit(app);
      execSync(`umount "${ro}"`);
    }
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR CASES CRASHED:', e); process.exit(2); });
