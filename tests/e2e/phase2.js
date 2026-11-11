// Phase 2 checks: search all books, internet-link message, map loading message,
// and dragging/zooming a map with a REAL mouse pointer (xdotool on the virtual screen).
// Usage: node tests/e2e/phase2.js "<test drive>" "<screenshot folder>"
'use strict';
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const [DRIVE, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(DRIVE, '_system', 'app', 'electron');
const extraArgs = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
async function waitFor(fn, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(150); } return null; }
const xdo = (...a) => execFileSync('xdotool', a.map(String), { encoding: 'utf8' }).trim();

(async () => {
  const app = await electron.launch({ executablePath: exe, args: extraArgs });
  const pages = () => app.context().pages();
  const bar = await waitFor(() => pages().find(p => p.url().includes('bar.html')));
  const content = await waitFor(() => pages().find(p => p.url().includes('home.html')));
  await waitFor(() => content.evaluate(() => window.ol.getState().then(s => s.library.state === 'ready')), 30000);
  const notice = () => bar.evaluate(() => { const n = document.getElementById('notice'); return n.hidden ? '' : n.textContent; });

  // ---- 1. Search all books ----
  await bar.click('button[data-cmd=library]');
  await content.waitForURL(/library\.html/);
  check('Library page has a "Search all books" box', await content.isVisible('#search'));
  await content.screenshot({ path: path.join(OUT, '1-library-with-search.png') });
  await content.fill('#search', 'water');
  await content.press('#search', 'Enter');
  await content.waitForURL(/search\.html\?q=water/);
  await waitFor(() => content.$('.results'), 15000);
  const titles = await content.$$eval('button.result strong', els => els.map(e => e.textContent));
  const books = await content.$$eval('button.result .from', els => [...new Set(els.map(e => e.textContent.trim()))]);
  check('results come from several books', books.length >= 2, books.join(' | '));
  check('title matches are listed first ("Water knot")', /water knot/i.test(titles[0] || ''), titles.slice(0, 3).join(', '));
  check('maps are not mixed into Library search', !books.some(b => /Bahrain/.test(b)));
  check('top bar highlights Library on the search page', (await bar.getAttribute('button[data-cmd=library]', 'aria-current')) === 'page');
  await content.screenshot({ path: path.join(OUT, '2-search-results.png'), fullPage: true });
  await content.click('button.result >> nth=0');
  await waitFor(() => content.url().includes('/viewer#'), 10000);
  check('a result opens the article in the reader', /\/viewer#wikipedia_en_knots[^/]*\/Water/i.test(content.url()), content.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, ''));
  await bar.click('#back');
  await content.waitForURL(/search\.html/, { timeout: 10000 }).catch(() => {});
  check('Back returns to the search results', content.url().includes('search.html'));
  await content.fill('#search', 'zzqqxx');
  await content.press('#search', 'Enter');
  await waitFor(() => content.textContent('#results').then(t => t.includes('Nothing found')), 10000);
  check('no results: plain message', (await content.textContent('#results')).includes('Nothing found for "zzqqxx"'));

  // ---- 2. Internet link inside a book ----
  await bar.click('button[data-cmd=library]');
  await content.waitForURL(/library\.html/);
  await content.click('text=Knots by Wikipedia');
  await waitFor(() => content.url().includes('/viewer#'));
  await content.evaluate(() => { location.hash = location.hash.replace(/\/[^/]*$/, '') + '/Bowline'; });
  const frame = await waitFor(() => content.frames().find(f => /\/content\/wikipedia_en_knots[^/]*\/Bowline$/.test(f.url())), 15000);
  await sleep(1000);
  const before = content.url();
  const link = await frame.$('a[href^="https://"], a[href^="http://"]:not([href*="127.0.0.1"])');
  check('test article has an internet link to click', !!link, link ? (await link.getAttribute('href')).slice(0, 50) : '');
  if (link) {
    // Click without waiting for the page change (the app cancels it, on purpose).
    await link.evaluate(a => a.click());
    const msg = await waitFor(() => notice(), 5000);
    check('clicking it shows "That link needs the internet..."', /needs the internet/.test(msg || ''), msg || '(no message)');
    await sleep(500);
    check('the book stays open (no broken page)', content.url() === before && frame.url().endsWith('/Bowline'), frame.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, ''));
    await bar.screenshot({ path: path.join(OUT, '3-internet-link-message.png') });
  }

  // ---- 3. Map: loading message, then a real mouse ----
  await bar.click('button[data-cmd=maps]');
  await content.waitForURL(/maps\.html/);
  await content.click('text=Bahrain');
  const loadingMsg = await waitFor(() => notice().then(t => /Loading the map/.test(t) && t), 5000);
  check('"Loading the map…" appears while the map opens', !!loadingMsg);
  const drawn = await waitFor(() => content.evaluate(() => window.__streetzim_map && window.__streetzim_map.loaded()), 30000);
  const cleared = await waitFor(async () => (await notice()) === '', 5000);
  check('the message goes away once the map is drawn', !!drawn && cleared !== null);
  await sleep(1500);

  const getView = () => content.evaluate(() => { const m = window.__streetzim_map; const c = m.getCenter(); return { lng: c.lng, lat: c.lat, zoom: m.getZoom() }; });
  const v0 = await getView();
  // Where is the window on the virtual screen? The content area starts 64 px below its top.
  const win = xdo('search', '--onlyvisible', '--name', 'Offline Library').split('\n')[0];
  const geo = Object.fromEntries(xdo('getwindowgeometry', '--shell', win).split('\n').map(l => l.split('=')));
  const cx = Number(geo.X) + 600, cy = Number(geo.Y) + 64 + 400;
  xdo('mousemove', cx, cy); await sleep(200);
  xdo('mousedown', 1);
  for (let i = 1; i <= 15; i++) { xdo('mousemove', cx - i * 20, cy - i * 8); await sleep(30); }
  xdo('mouseup', 1);
  await sleep(1500);
  const v1 = await getView();
  const moved = Math.abs(v1.lng - v0.lng) + Math.abs(v1.lat - v0.lat);
  check('dragging with a real mouse moves the map', moved > 0.001, `centre moved by ${moved.toFixed(4)}°`);
  for (let i = 0; i < 3; i++) { xdo('click', 4); await sleep(150); } // mouse wheel up
  await sleep(1500);
  const v2 = await getView();
  check('the mouse wheel zooms in', v2.zoom > v1.zoom + 0.3, `zoom ${v1.zoom.toFixed(2)} -> ${v2.zoom.toFixed(2)}`);
  await content.screenshot({ path: path.join(OUT, '4-map-after-drag-and-zoom.png') });

  const closed = app.waitForEvent('close', { timeout: 20000 }).then(() => true, () => false);
  await bar.click('#shutdown'); await bar.click('#yes');
  check('shuts down cleanly', await closed);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('PHASE 2 TEST CRASHED:', e); process.exit(2); });
