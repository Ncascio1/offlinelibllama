// Phase 2 (part 3): several maps, PDFs and videos inside books, "saving is off" message.
// Needs the extra test books: osm-tehran, zimgit-water (PDF guides), ted street-art (videos).
// Usage: node tests/e2e/phase2c.js "<drive with app>" "<drive with the extra books>" "<screenshot folder>"
'use strict';
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const [APP_DRIVE, DRIVE, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(APP_DRIVE, '_system', 'app', 'electron');
const root = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
async function waitFor(fn, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(150); } return null; }

(async () => {
  const app = await electron.launch({ executablePath: exe, args: root, env: { ...process.env, OL_DRIVE_ROOT: DRIVE } });
  const pages = () => app.context().pages();
  const bar = await waitFor(() => pages().find(p => p.url().includes('bar.html')));
  const content = await waitFor(() => pages().find(p => p.url().includes('home.html')));
  await waitFor(() => content.evaluate(() => window.ol.getState().then(s => s.library.state === 'ready')), 30000);
  const notice = () => bar.evaluate(() => { const n = document.getElementById('notice'); return n.hidden ? '' : n.textContent; });
  const base = await content.evaluate(() => window.ol.getState().then(s => s.library.books[0].icon.replace(/\/catalog.*/, '')));
  const mem = () => app.evaluate(({ app }) => Math.round(app.getAppMetrics().reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024));

  // ---- Several maps ----
  await bar.click('button[data-cmd=maps]');
  await content.waitForURL(/maps\.html/);
  const maps = await content.$$eval('.item.book strong', els => els.map(e => e.textContent));
  check('Maps lists every map by its place name', maps.length === 2 && maps.includes('Bahrain') && maps.includes('Tehran'), maps.join(', '));
  await content.screenshot({ path: path.join(OUT, '1-two-maps.png') });
  const centres = {};
  for (const name of ['Bahrain', 'Tehran', 'Bahrain']) {
    await bar.click('button[data-cmd=maps]');
    await content.waitForURL(/maps\.html/);
    await content.click(`text=${name}`);
    const ok = await waitFor(() => content.evaluate(() => window.__streetzim_map && window.__streetzim_map.loaded() && window.__streetzim_map.getCenter()), 30000);
    centres[name] = ok;
    check(`switching to ${name} draws that map`, !!ok && (name === 'Bahrain' ? ok.lng > 50 && ok.lng < 51 : ok.lng > 51 && ok.lng < 52), ok ? `centre ${ok.lng.toFixed(2)}, ${ok.lat.toFixed(2)}` : 'not drawn');
    console.log(`      memory after opening ${name}: ~${await mem()} MB (all Electron parts)`);
  }
  await content.screenshot({ path: path.join(OUT, '2-tehran-then-bahrain.png') });

  // ---- PDF guide inside a book ----
  await content.evaluate(u => { location.href = u; }, `${base}/content/zimgit-water_en_2024-08/files/Water%20(1).pdf`).catch(() => {});
  await sleep(4000);
  const frames = content.frames().map(f => f.url().slice(0, 60));
  const wcs = await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => w.getURL().slice(0, 60)));
  console.log('      frames:', frames.join(' | '), '|| webContents:', wcs.join(' | '));
  // The viewer draws the pages itself: a shown PDF makes the window mostly non-white.
  const shot = await content.screenshot({ path: path.join(OUT, '3-pdf.png') });
  const nonWhite = await app.evaluate(({ nativeImage }, b64) => {
    const bmp = nativeImage.createFromBuffer(Buffer.from(b64, 'base64')).toBitmap();
    let n = 0; for (let i = 0; i < bmp.length; i += 4 * 50) if (bmp[i] < 200 || bmp[i + 1] < 200 || bmp[i + 2] < 200) n++;
    return n / (bmp.length / (4 * 50));
  }, shot.toString('base64'));
  check('a PDF guide opens in the built-in viewer', content.url().endsWith('.pdf') && nonWhite > 0.2, `${Math.round(nonWhite * 100)}% of the window drawn`);
  const log = fs.readFileSync(path.join(DRIVE, '_system', 'logs', 'app.log'), 'utf8');
  check('nothing the PDF viewer needs is blocked', !/blocked request to (mhjfbmd|resources)/.test(log.split('\n').slice(-40).join('\n')));

  // Saving a file to the computer: blocked, with a message.
  await app.evaluate(({ webContents }, u) => { webContents.getAllWebContents().find(w => w.getURL().startsWith('http://127.0.0.1') || w.getURL().includes('Water')).downloadURL(u); },
    `${base}/content/zimgit-water_en_2024-08/files/Water%20(1).pdf`);
  const saveMsg = await waitFor(() => notice().then(t => /Saving files/.test(t) && t), 5000);
  check('saving to the computer is refused with a message', !!saveMsg, saveMsg || '(no message)');

  // ---- Video inside a book ----
  await content.evaluate(u => { location.href = u; }, `${base}/content/ted_mul_street-art_2026-09/how-yarn-bombing-grew-into-a-worldwide-movement`).catch(() => {});
  await waitFor(() => content.$('video'), 15000);
  const v = await content.evaluate(async () => {
    const vid = document.querySelector('video'); vid.muted = true; const t0 = vid.currentTime;
    await vid.play(); await new Promise(r => setTimeout(r, 3000)); vid.pause();
    return { advanced: vid.currentTime - t0, error: vid.error && vid.error.code };
  });
  check('a video inside a book plays', v.advanced > 1 && !v.error, `${v.advanced.toFixed(1)} s played in 3 s`);
  await content.screenshot({ path: path.join(OUT, '4-video.png') });

  // ---- Library list with the new books ----
  await bar.click('button[data-cmd=library]');
  await content.waitForURL(/library\.html/);
  const lang = await content.$$eval('.item.book .small', els => els.map(e => e.textContent).filter(t => /English|Arabic/.test(t)));
  check('no pointless "English" labels when all books are English', lang.length === 0, lang.join(' | '));
  await content.screenshot({ path: path.join(OUT, '5-library-4-books.png'), fullPage: true });

  const closed = app.waitForEvent('close', { timeout: 20000 }).then(() => true, () => false);
  await bar.click('#shutdown'); await bar.click('#yes');
  check('shuts down cleanly', await closed);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('PHASE 2C TEST CRASHED:', e); process.exit(2); });
