// Phase 0 spike: open a StreetZim map in Electron, try pan/zoom/search,
// save screenshots, and report blocked network requests. NOT production code.
'use strict';
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');

const URL_TO_OPEN = process.env.SPIKE_URL;
const OUT = process.env.SPIKE_OUT;
const T0 = Date.now();
const log = (...a) => fs.appendFileSync(path.join(OUT, 'log.txt'), `[${Date.now() - T0}ms] ${a.join(' ')}\n`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.setPath('userData', path.join(OUT, 'userdata'));
app.commandLine.appendSwitch('enable-unsafe-swiftshader'); // software WebGL fallback
// Network lock below the page level: every host name except 127.0.0.1 fails to resolve,
// so even Chromium's own background requests (spellcheck dictionaries etc.) cannot leave the PC.
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
if (process.env.SPIKE_SPELLCHECK !== '1') app.on('session-created', s => s.setSpellCheckerEnabled(false));

const blocked = [];
function allowed(u) {
  try { const x = new URL(u);
    if (['data:', 'blob:', 'file:', 'devtools:'].includes(x.protocol)) return true;
    return x.hostname === '127.0.0.1'; } catch { return false; }
}

app.whenReady().then(async () => {
  const ses = session.fromPartition('maps');
  ses.webRequest.onBeforeRequest((d, cb) => { const ok = allowed(d.url); if (!ok) blocked.push(d.url); cb({ cancel: !ok }); });
  const win = new BrowserWindow({ width: 1200, height: 800, show: true,
    webPreferences: { partition: 'maps', contextIsolation: true, sandbox: true } });
  const errors = [];
  win.webContents.on('console-message', (e) => { const m = e.message || ''; if (e.level === 'error' || /error|fail/i.test(m)) errors.push(m.slice(0, 200)); });
  win.webContents.on('render-process-gone', (_e, d) => log('RENDERER CRASHED', JSON.stringify(d)));

  const shot = async (name) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); log('screenshot', name); };
  const js = (code) => win.webContents.executeJavaScript(code, true);

  const tLoad = Date.now();
  await win.loadURL(URL_TO_OPEN);
  log('page loaded in', Date.now() - tLoad, 'ms');

  // Wait for the MapLibre map to report it has finished drawing.
  const info = await js(`new Promise(res => {
    const t0 = performance.now();
    (function poll() {
      const c = document.querySelector('canvas.maplibregl-canvas, canvas');
      const m = window.__streetzim_map || window.__szMap;
      const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
      if (m && m.loaded && m.loaded()) return res({ ok: true, ms: Math.round(performance.now() - t0), hasMapObj: true,
            zoom: m.getZoom(), center: m.getCenter(), canvas: !!c, glNull: !gl });
      if (performance.now() - t0 > 60000) return res({ ok: false, canvas: !!c, mapGlobals: Object.keys(window).filter(k => /map/i.test(k)).slice(0, 20),
            bodyText: document.body.innerText.slice(0, 300) });
      setTimeout(poll, 250);
    })();
  })`);
  log('map ready:', JSON.stringify(info));
  await sleep(1500);
  await shot('1-initial');

  // Pan: drag with the mouse across the map.
  const cx = 600, cy = 450;
  win.webContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: cx - i * 25, y: cy - i * 10, button: 'left' }); await sleep(30); }
  win.webContents.sendInputEvent({ type: 'mouseUp', x: cx - 250, y: cy - 100, button: 'left', clickCount: 1 });
  await sleep(1500);
  const afterPan = await js(`(window.__streetzim_map||window.__szMap)?.getCenter?.()`).catch(() => null);
  log('center after pan:', JSON.stringify(afterPan));

  // Zoom: mouse wheel in, and time how long redrawing takes.
  const tz = Date.now();
  for (let i = 0; i < 5; i++) { win.webContents.sendInputEvent({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -120, canScroll: true }); await sleep(80); }
  const zoomInfo = await js(`new Promise(res => { const m = window.__streetzim_map||window.__szMap; if (!m) return res(null);
      const t0 = performance.now(); (function p(){ if (m.loaded() && !m.isMoving()) return res({ zoom: m.getZoom(), settleMs: Math.round(performance.now()-t0) }); if (performance.now()-t0>30000) return res({zoom:m.getZoom(), settleMs:'>30000'}); setTimeout(p,100); })(); })`);
  log('after wheel zoom:', JSON.stringify(zoomInfo), 'total', Date.now() - tz, 'ms');
  await shot('2-pan-zoom');

  // Search: find a text box, type a place name, press Enter.
  const searchInfo = await js(`(() => {
    const inp = [...document.querySelectorAll('input[type=search], input[type=text], input:not([type])')].find(e => e.offsetParent);
    if (!inp) return { found: false };
    inp.focus(); return { found: true, id: inp.id, placeholder: inp.placeholder };
  })()`);
  log('search box:', JSON.stringify(searchInfo));
  if (searchInfo.found) {
    for (const ch of 'Manama') { win.webContents.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(40); }
    await sleep(1500);
    await shot('3-search-typed');
    const click = async (x, y) => { win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); };
    await click(480, 73);               // first search result ("Manama, city")
    await sleep(3000);
    const after = await js(`(() => { const m = window.__streetzim_map; return { center: m.getCenter(), zoom: m.getZoom() }; })()`);
    log('after clicking search result:', JSON.stringify(after));
    await shot('4-search-result');
    await click(1175, 25);              // the + zoom button
    await sleep(2000);
    log('zoom after clicking +:', await js(`window.__streetzim_map.getZoom()`));
    // Pan with the map's own control and time how long the redraw takes (software rendering).
    const pan = await js(`new Promise(res => { const m = window.__streetzim_map; const t0 = performance.now();
        m.panBy([400, 250], { duration: 0 }); m.once('idle', () => res({ center: m.getCenter(), redrawMs: Math.round(performance.now() - t0) })); })`);
    log('pan by 400x250 px:', JSON.stringify(pan));
    const fr = await js(`new Promise(res => { const m = window.__streetzim_map; let n = 0; const t0 = performance.now();
        m.on('render', () => n++); m.easeTo({ zoom: m.getZoom() + 2, duration: 2000 });
        m.once('moveend', () => res({ framesIn2s: n, fps: Math.round(n * 1000 / (performance.now() - t0)) })); })`);
    log('animated zoom (2 s) smoothness:', JSON.stringify(fr));
    await shot('4-search-result');
  }

  const mem = app.getAppMetrics().reduce((s, x) => s + x.memory.workingSetSize, 0);
  log('memory (all Electron processes, working set) ~', Math.round(mem / 1024), 'MB');
  log('blocked requests:', blocked.length, [...new Set(blocked.map(u => new URL(u).host))].join(', '));
  log('page errors:', errors.length, errors.slice(0, 6).join(' | '));
  app.quit();
});
