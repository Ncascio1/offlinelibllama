// End-to-end walkthrough of the real app on a test drive (Linux test machine).
// Clicks through the app like a customer and saves screenshots.
//
// Usage: node tests/e2e/walkthrough.js "<test drive folder>" "<screenshot folder>"
// Needs Playwright (pre-installed on the cloud test machine; not shipped on the drive).
'use strict';
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const DRIVE = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(DRIVE, '_system', 'app', process.platform === 'win32' ? 'OfflineLibrary.exe' : 'electron');
const extraArgs = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []; // Linux test machine runs as root

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const engines = () => { try { return execSync("pgrep -f '_system/(kiwix|llama)/'", { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch { return []; } };

async function waitFor(fn, ms = 30000, step = 200) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(step); }
  return null;
}

(async () => {
  const t0 = Date.now();
  const leftovers = engines();
  const app = await electron.launch({ executablePath: exe, args: extraArgs, env: { ...process.env, OL_LOG_TO_CONSOLE: '0' } });
  const ctx = app.context();
  const pageBy = async pred => waitFor(() => ctx.pages().find(p => pred(p.url())), 20000);

  const bar = await pageBy(u => u.includes('bar.html'));
  const content = await pageBy(u => u.includes('home.html'));
  if (leftovers.length) {
    await sleep(3000);
    const still = leftovers.filter(l => engines().includes(l));
    check('engines left over from a crash are stopped at the next start', still.length === 0, `${leftovers.length} left over, ${still.length} still running`);
  }
  check('window opens with top bar and home page', !!bar && !!content, `${Date.now() - t0} ms`);
  await content.waitForSelector('h1');
  await content.screenshot({ path: path.join(OUT, '01-home-first-view.png') });

  const libReady = await waitFor(() => content.evaluate(() => window.ol.getState().then(s => s.library.state === 'ready' && s)), 30000);
  check('library becomes ready', !!libReady, libReady ? `${libReady.library.books.length} books, ${Date.now() - t0} ms after launch` : '');
  const aiReady = await waitFor(() => content.evaluate(() => window.ol.getState().then(s => s.ai.state === 'ready' && s)), 60000);
  check('AI becomes ready (tiny test model)', !!aiReady, `${Date.now() - t0} ms after launch`);
  await bar.screenshot({ path: path.join(OUT, '02-bar-ai-ready.png') });
  check('bar shows "AI ready"', (await bar.textContent('#ai-text')) === 'AI ready');

  // Library -> open the Knots book -> follow a link -> Back
  await bar.click('button[data-cmd=library]');
  await content.waitForURL(/library\.html/);
  await content.screenshot({ path: path.join(OUT, '03-library.png') });
  const names = await content.$$eval('.item strong', els => els.map(e => e.textContent));
  check('Library lists the two books (not the map)', names.length === 2 && !names.includes('Bahrain'), names.join(', '));
  check('Library button is highlighted', (await bar.getAttribute('button[data-cmd=library]', 'aria-current')) === 'page');

  await content.click('text=Knots by Wikipedia');
  await content.waitForURL(/\/viewer#/, { timeout: 15000 });
  await sleep(2500);
  await content.screenshot({ path: path.join(OUT, '04-book-open.png') });
  check('book opens in the Kiwix reader', content.url().includes('/viewer#wikipedia_en_knots'), content.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, ''));
  check('bar still highlights Library inside a book', (await bar.getAttribute('button[data-cmd=library]', 'aria-current')) === 'page');

  // Kiwix's own search box inside the book
  const frame = await waitFor(() => content.frames().find(f => f.url().includes('/content/wikipedia_en_knots')), 10000);
  check('book article shows inside the reader', !!frame, frame ? frame.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '') : '');

  await bar.click('#back');
  await content.waitForURL(/library\.html/, { timeout: 10000 }).catch(() => {});
  check('Back returns to the Library list', content.url().includes('library.html'), content.url().slice(0, 60));
  await bar.click('#forward');
  await waitFor(() => content.url().includes('/viewer#'), 10000);
  check('Forward returns to the book', content.url().includes('/viewer#'));

  // Zoom: Ctrl + plus, then Ctrl + 0
  // Electron's own key simulation (goes through the same path as a real keyboard).
  const key = (code, mods) => app.evaluate(({ webContents }, [code, mods]) => {
    const wc = webContents.getAllWebContents().find(w => w.getURL().startsWith('http://127.0.0.1') || w.getURL().includes('home.html'));
    wc.focus(); wc.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers: mods }); wc.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers: mods });
  }, [code, mods]);
  await key('=', ['control']);
  await sleep(300);
  const zoomed = await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => w.getZoomFactor()));
  check('Ctrl + plus zooms the page', zoomed.some(z => z > 1.05), zoomed.join(','));
  await bar.click('button[data-cmd=home]');
  await content.waitForURL(/home\.html/);
  const zoomHome = await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => `${w.getURL().slice(0, 25)}=${w.getZoomFactor()}`));
  check('zoom level carries over to the next page', zoomHome.some(z => z.startsWith('app://local/home') && !z.endsWith('=1')), zoomHome.join(' '));
  await key('0', ['control']);

  // Maps -> Bahrain
  await bar.click('button[data-cmd=maps]');
  await content.waitForURL(/maps\.html/);
  await content.screenshot({ path: path.join(OUT, '05-maps-list.png') });
  const maps = await content.$$eval('.item strong', els => els.map(e => e.textContent));
  check('Maps lists Bahrain only', maps.length === 1 && maps[0] === 'Bahrain', maps.join(', '));
  await content.click('text=Bahrain');
  await content.waitForURL(/osm-bahrain/, { timeout: 15000 });
  const mapOk = await waitFor(() => content.evaluate(() => !!(window.__streetzim_map && window.__streetzim_map.loaded())), 30000);
  await sleep(1500);
  await content.screenshot({ path: path.join(OUT, '06-map-open.png') });
  check('map opens and draws', !!mapOk);
  check('bar highlights Maps inside a map', (await bar.getAttribute('button[data-cmd=maps]', 'aria-current')) === 'page');

  // Help and Ask
  await bar.click('button[data-cmd=help]');
  await content.waitForURL(/help.html/, { timeout: 10000 });
  check('Help opens the guide inside the app', content.url() === 'app://local/help.html');
  const helpHasBridge = await content.evaluate(() => typeof window.ol);
  check('the guide page gets no app controls', helpHasBridge === 'undefined');

  await bar.click('button[data-cmd=home]');
  await content.waitForURL(/home\.html/);
  await content.fill('#question', 'How do I tie a bowline?');
  await content.click('.ask button');
  await content.waitForURL(/ask\.html/);
  const asked = await waitFor(() => content.evaluate(() => window.ol.askGet().then(d => d.turns[0] && d.turns[0].question)), 5000);
  check('Home Ask box opens Ask and starts answering', asked === 'How do I tie a bowline?', asked || '');
  await waitFor(() => content.evaluate(() => window.ol.askGet().then(d => !d.busy)), 120000);
  await content.screenshot({ path: path.join(OUT, '07-ask-tiny-model.png') });

  // Book pages must not reach the app's controls, and the internet must be blocked
  await bar.click('button[data-cmd=library]');
  await content.waitForURL(/library\.html/);
  await content.click('text=Ray Charles');
  await content.waitForURL(/\/viewer#/);
  await sleep(1500);
  const bookBridge = await content.evaluate(() => typeof window.ol);
  check('book pages get no app controls', bookBridge === 'undefined');
  const ext = await content.evaluate(() => fetch('https://example.com').then(() => 'reached', () => 'blocked'));
  check('internet request from a book page is blocked', ext === 'blocked');

  // Second launch: must not start a second copy
  const second = spawnSync(exe, extraArgs, { timeout: 15000 });
  check('second launch exits by itself', second.status === 0 && !second.error, `exit ${second.status}`);
  check('still exactly one Kiwix and one AI running', engines().length === 2, engines().length + ' engine processes');

  // Shut down: click, confirm
  const before = engines();
  const closed = app.waitForEvent('close', { timeout: 20000 }).then(() => true, () => false);
  await bar.click('#shutdown');
  await bar.screenshot({ path: path.join(OUT, '08-shutdown-confirm.png') });
  await bar.click('#yes');
  check('app closes after Shut down', await closed);
  await sleep(1000);
  check('no Kiwix or AI left running after Shut down', engines().length === 0, `before: ${before.length}, after: ${engines().length}`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('WALKTHROUGH CRASHED:', e); process.exit(2); });
