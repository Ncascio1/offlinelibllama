// Phase 2 (part 2) checks: book list with pictures and sizes, Kiwix language button
// hidden, and the "cannot draw maps" path on a computer without 3D drawing.
// Usage: node tests/e2e/phase2b.js "<test drive>" "<screenshot folder>"
'use strict';
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const [DRIVE, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(DRIVE, '_system', 'app', 'electron');
const root = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
async function waitFor(fn, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(150); } return null; }

async function start(env = {}) {
  const app = await electron.launch({ executablePath: exe, args: root, env: { ...process.env, ...env } });
  const pages = () => app.context().pages();
  const bar = await waitFor(() => pages().find(p => p.url().includes('bar.html')));
  const content = await waitFor(() => pages().find(p => p.url().includes('home.html')));
  await waitFor(() => content.evaluate(() => window.ol.getState().then(s => s.library.state === 'ready')), 30000);
  return { app, bar, content, notice: () => bar.evaluate(() => { const n = document.getElementById('notice'); return n.hidden ? '' : n.textContent; }) };
}
async function stop(app) { const c = app.waitForEvent('close').catch(() => {}); await app.evaluate(({ app }) => app.quit()).catch(() => {}); await c; await sleep(500); }

(async () => {
  // Normal computer
  {
    const { app, bar, content } = await start();
    await bar.click('button[data-cmd=library]');
    await content.waitForURL(/library\.html/);
    await waitFor(() => content.$('.item.book img'));
    const imgs = await content.$$eval('.item.book img', els => els.map(i => i.naturalWidth));
    check('each book shows its cover picture', imgs.length === 2 && imgs.every(w => w > 0), `widths ${imgs.join(',')}`);
    const details = await content.$$eval('.item.book .small', els => els.map(e => e.textContent));
    check('each book shows its size', details.some(d => d === '1,735 articles') && details.some(d => d === '340 articles'), details.join(' | '));
    const order = await content.$$eval('.item.book strong', els => els.map(e => e.textContent));
    check('biggest book first', order[0] === 'Knots by Wikipedia', order.join(', '));
    await content.screenshot({ path: path.join(OUT, '1-library-list.png'), fullPage: true });
    await content.click('text=Knots by Wikipedia');
    await waitFor(() => content.url().includes('/viewer#'));
    await sleep(1500);
    const langVisible = await content.evaluate(() => { const b = document.getElementById('uiLanguageSelectorButton'); return !!b && getComputedStyle(b).display !== 'none'; });
    const otherButtons = await content.evaluate(() => ['kiwix_serve_taskbar_random_button', 'kiwixsearchbox'].every(id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; }));
    check('Kiwix language button is hidden in the reader', !langVisible);
    check('Kiwix search box and random button still there', otherButtons);
    await content.screenshot({ path: path.join(OUT, '2-reader-toolbar.png'), clip: { x: 0, y: 0, width: 1200, height: 60 } });
    await bar.click('button[data-cmd=maps]');
    await content.waitForURL(/maps\.html/);
    check('maps can be opened on a normal computer', !(await content.$eval('.item.book', b => b.disabled)));
    await stop(app);
  }
  // Very old computer: no 3D drawing at all
  {
    const { app, bar, content, notice } = await start({ OL_TEST_NO_WEBGL: '1' });
    await bar.click('button[data-cmd=maps]');
    await content.waitForURL(/maps\.html/);
    await waitFor(() => content.$('.item.book'));
    const text = await content.textContent('main');
    check('no 3D drawing: Maps page says so plainly', text.includes('This computer cannot draw the maps'));
    check('no 3D drawing: map buttons are greyed out', await content.$eval('.item.book', b => b.disabled));
    await content.screenshot({ path: path.join(OUT, '3-maps-no-webgl.png') });
    // Opened another way (for example with Back): the top bar explains straight away.
    const url = await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => w.getURL()).find(u => u.includes('bar.html')));
    const kiwixBase = await content.evaluate(() => window.ol.getState().then(s => s.library.books.find(b => b.isMap).icon.replace(/\/catalog.*/, '')));
    await content.evaluate(u => { location.href = u; }, `${kiwixBase}/content/osm-bahrain-2026-11-09/`).catch(() => {});
    const msg = await waitFor(() => notice().then(t => /cannot draw the maps/.test(t) && t), 8000);
    check('no 3D drawing: opening a map anyway shows the message at once', !!msg, msg || '(none)');
    await stop(app);
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('PHASE 2B TEST CRASHED:', e); process.exit(2); });
