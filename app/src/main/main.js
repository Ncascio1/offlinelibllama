// Offline Library: main process.
//
// Order of events:
//  1. Find the drive root and decide where data/logs may be written.
//  2. Lock the network down (before anything can load).
//  3. Make sure only one copy runs; a second double-click focuses this one.
//  4. Show the window straight away with the home page ("Getting the library ready").
//  5. Clean up engines left over from a crash, start the Library (Kiwix), then
//     the AI in the background. The window never waits for the AI.
//  6. On Shut down or closing the window: stop both engines, then exit.
'use strict';
const { app, protocol, ipcMain, dialog, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const log = require('./logger');
const messages = require('./messages');
const { findDriveRoot, drivePaths, chooseWritableDirs } = require('./paths');
const { loadConfig } = require('./config');
const { HOST_RESOLVER_RULES } = require('./network-rules');
const { findFreePorts } = require('./ports');
const { KiwixService, findZimFiles } = require('./kiwix-service');
const { AiService } = require('./ai-service');
const { writePidsFile, removePidsFile, cleanStaleEngines } = require('./processes');
const { createMainWindow } = require('./window');
const { registerAppProtocol, APP_PARTITIONS } = require('./app-protocol');
const { AskService } = require('./ask/ask-service');
const { KiwixRetriever } = require('./ask/kiwix-retriever');
const { searchLibrary } = require('./library-search');

const START_TIME = Date.now();
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const APP_VERSION = require('../../package.json').version;

// ---------------------------------------------------------------- 1. Drive
// In the finished app the program file is <drive>/_system/app/OfflineLibrary.exe.
// For development and tests, OL_DRIVE_ROOT can point at a test drive folder.
const driveRoot = process.env.OL_DRIVE_ROOT ||
  findDriveRoot(app.isPackaged ? path.dirname(process.execPath) : app.getAppPath());
const paths = driveRoot ? drivePaths(driveRoot) : null;
const dirs = paths ? chooseWritableDirs(paths) :
  { data: path.join(os.tmpdir(), 'offline-library', 'data'), logs: path.join(os.tmpdir(), 'offline-library', 'logs'), driveReadOnly: true };

// Every folder Electron writes to lives on the drive (or temp if read-only).
app.setPath('userData', dirs.data);
app.setPath('sessionData', path.join(dirs.data, 'session'));
app.setPath('crashDumps', path.join(dirs.data, 'crashes'));
app.setPath('logs', dirs.logs);
log.init(dirs.logs);
log.info(`Offline Library ${APP_VERSION} starting. Electron ${process.versions.electron}, ${os.type()} ${os.release()}, ` +
  `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB memory, CPU: ${(os.cpus()[0] || {}).model || 'unknown'}`);
log.info('drive root:', driveRoot || '(not found)', '| writing to:', dirs.data, dirs.driveReadOnly ? '(drive is read-only: using temp folder)' : '');

// ---------------------------------------------------------------- 2. Network lock
app.commandLine.appendSwitch('host-resolver-rules', HOST_RESOLVER_RULES); // no internet names resolve
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('no-pings');
// Maps need WebGL. On PCs without a usable graphics card, draw it in software.
// (Automated tests can imitate a very old PC that has no 3D drawing at all.)
if (process.env.OL_TEST_NO_WEBGL === '1') app.commandLine.appendSwitch('disable-3d-apis');
else app.commandLine.appendSwitch('enable-unsafe-swiftshader');
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: false } },
]);

// ---------------------------------------------------------------- 3. One copy only
if (!app.requestSingleInstanceLock()) {
  log.info('another copy is already running: handing over and exiting');
  app.exit(0);
}

// ---------------------------------------------------------------- shared state
// Everything the pages need to know. Sent to the top bar and our own pages on every change.
const state = {
  version: APP_VERSION,
  driveReadOnly: dirs.driveReadOnly,
  library: { state: 'starting', message: messages.library.starting, books: [] },
  ai: { state: 'starting', message: messages.ai.starting },
  nav: { canGoBack: false, canGoForward: false, section: 'home' },
};
let ui = null;          // { win, bar, content }
let kiwix = null;       // KiwixService
let ai = null;          // AiService
let shuttingDown = false;
let retriever = null;   // searches the books for the AI (set once the library is ready)
const pidsFile = path.join(dirs.data, 'pids.json');

// "Ask the AI": the conversation lives here, so it survives leaving the Ask page.
const askService = new AskService({
  getAi: () => (ai ? ai.connection() : null),
  getRetriever: () => (state.library.state === 'ready' ? retriever : null),
  log,
  onChange: () => sendAskUpdate(),
});

// Send the conversation to the Ask page (if it is showing). Answers arrive word by
// word, so updates are bundled to at most ~12 per second.
let askUpdateTimer = null;
function sendAskUpdate() {
  if (askUpdateTimer) return;
  askUpdateTimer = setTimeout(() => {
    askUpdateTimer = null;
    if (!ui) return;
    const wc = ui.content.webContents;
    if (!wc.isDestroyed() && wc.getURL().startsWith('app://local/ask')) wc.send('ask-update', { turns: askService.snapshot(), busy: askService.busy });
  }, 80);
}

function broadcast() {
  if (!ui) return;
  for (const view of [ui.bar, ui.content]) {
    const wc = view.webContents;
    if (!wc.isDestroyed() && wc.getURL().startsWith('app://local/')) wc.send('state', state);
  }
}

function publicBooks(books) {
  return books.map(b => ({ id: b.id, slug: b.slug, title: b.displayTitle, summary: b.summary, isMap: b.isMap, language: b.language,
    articleCount: b.articleCount, category: b.category,
    icon: b.illustration && kiwix ? kiwix.baseUrl + b.illustration : '' }));
}

// Which top-bar section is the content area showing?
function sectionFor(url) {
  if (url.startsWith('app://local/home')) return 'home';
  if (url.startsWith('app://local/library') || url.startsWith('app://local/search')) return 'library';
  if (url.startsWith('app://local/maps')) return 'maps';
  if (url.startsWith('app://local/ask')) return 'ask';
  if (url.startsWith('app://drive/') || url.startsWith('app://local/help')) return 'help';
  if (kiwix && url.startsWith(kiwix.baseUrl + '/')) {
    const slug = decodeURIComponent((url.slice(kiwix.baseUrl.length).match(/^\/(?:content|viewer#?)\/?([^/?#]+)/) || [])[1] || '');
    const book = kiwix.books.find(b => b.slug === slug);
    return book && book.isMap ? 'maps' : 'library';
  }
  return '';
}

// A short message in the top bar (internet links, map loading).
function showNotice(n) {
  if (ui && !ui.bar.webContents.isDestroyed()) ui.bar.webContents.send('notice', n);
}

// Maps can take a while to appear from a slow drive: say so until the map is drawn.
let mapWatch = 0;
async function watchMapLoading(url) {
  const id = ++mapWatch;
  const wc = ui.content.webContents;
  showNotice({ text: 'Loading the map…', kind: 'info', ms: 0 });
  const started = Date.now();
  let warned = false;
  const NO_MAPS = 'This computer cannot draw the maps. The Library and the AI still work.';
  while (id === mapWatch && !wc.isDestroyed() && wc.getURL() === url) {
    // Very old computers without any 3D drawing support: say so straight away.
    const noWebgl = await wc.executeJavaScript("(() => { try { const c = document.createElement('canvas'); return !(c.getContext('webgl2') || c.getContext('webgl')); } catch { return true; } })()", true).catch(() => false);
    if (noWebgl) { log.warn('map opened but this computer has no WebGL'); return showNotice({ text: NO_MAPS, kind: 'warn', ms: 0 }); }
    const drawn = await wc.executeJavaScript('!!(window.__streetzim_map && window.__streetzim_map.loaded && window.__streetzim_map.loaded())', true).catch(() => false);
    if (drawn) { log.info(`map drawn after ${Date.now() - started} ms`); return showNotice({ text: '', ms: 0 }); }
    if (!warned && Date.now() - started > 60000) {
      warned = true;
      log.warn('map not drawn after 60 s');
      showNotice({ text: 'The map is taking a long time to open. On some older computers maps do not work.', kind: 'warn', ms: 0 });
    }
    await new Promise(r => setTimeout(r, 300));
  }
  if (id === mapWatch) showNotice({ text: '', ms: 0 }); // moved away: clear the message
}

function onNavChanged() {
  const wc = ui.content.webContents;
  const url = wc.getURL();
  if (kiwix && url.startsWith(kiwix.baseUrl + '/content/') && sectionFor(url) === 'maps') {
    if (url !== onNavChanged.lastMapUrl) { onNavChanged.lastMapUrl = url; watchMapLoading(url); }
  } else if (onNavChanged.lastMapUrl) { onNavChanged.lastMapUrl = null; mapWatch++; showNotice({ text: '', ms: 0 }); }
  state.nav = { canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward(), section: sectionFor(wc.getURL()) };
  broadcast();
}

// ---------------------------------------------------------------- commands from our pages
function go(url) { ui.content.webContents.loadURL(url); }

function handleCommand(name, arg) {
  const h = ui.content.webContents.navigationHistory;
  switch (name) {
    case 'home': return go('app://local/home.html');
    case 'back': return h.canGoBack() && h.goBack();
    case 'forward': return h.canGoForward() && h.goForward();
    case 'library': return go('app://local/library.html');
    case 'maps': return go('app://local/maps.html');
    case 'ask': {
      // From the Home page box: open the Ask page and start answering straight away.
      if (typeof arg === 'string' && arg.trim()) askService.ask(arg);
      return go('app://local/ask.html');
    }
    case 'search': {
      const q = typeof arg === 'string' ? arg.trim().slice(0, 200) : '';
      return go('app://local/search.html' + (q ? '?q=' + encodeURIComponent(q) : ''));
    }
    case 'open-article': {
      // A search result: only articles in books we know, opened in the reader.
      const book = kiwix && arg && kiwix.books.find(b => b.slug === arg.slug && !b.isMap);
      if (!book || typeof arg.path !== 'string' || !arg.path || arg.path.length > 1000) return;
      return go(`${kiwix.baseUrl}/viewer#${encodeURIComponent(book.slug)}/${arg.path.split('/').map(encodeURIComponent).join('/')}`);
    }
    case 'open-source': {
      // A numbered source under an answer: open that article in the reader.
      const link = arg && askService.sourceLink(Number(arg.turnId), Number(arg.n));
      const m = link && kiwix && link.match(/^\/content\/([^/]+)\/(.+)$/);
      if (!m) return;
      return go(`${kiwix.baseUrl}/viewer#${m[1]}/${m[2]}`);
    }
    case 'help': return go('app://local/help.html'); // the guide is part of the app, so it is never missing
    case 'open-book': {
      const book = kiwix && kiwix.books.find(b => b.slug === arg);
      if (!book || state.library.state !== 'ready') return go('app://local/message.html?kind=library-not-ready');
      // Books open in Kiwix's reader (it has a search box). Maps open directly, full size.
      return go(book.isMap ? `${kiwix.baseUrl}/content/${encodeURIComponent(book.slug)}/`
                           : `${kiwix.baseUrl}/viewer#${encodeURIComponent(book.slug)}`);
    }
    case 'shutdown': return shutdown('Shut down button');
    default: log.warn('unknown command', name);
  }
}

ipcMain.handle('get-state', e => (isOurPage(e) ? state : null));
ipcMain.handle('search-library', async (e, q) => {
  if (!isOurPage(e) || state.library.state !== 'ready') return null;
  try { return await searchLibrary({ baseUrl: kiwix.baseUrl, books: kiwix.books, query: q }); }
  catch (err) { log.warn('library search failed:', err.message); return { error: true, titleMatches: [], results: [], total: 0 }; }
});
ipcMain.handle('ask-get', e => (isOurPage(e) ? { turns: askService.snapshot(), busy: askService.busy } : null));
ipcMain.on('ask', (e, q) => { if (isOurPage(e) && typeof q === 'string') askService.ask(q); });
ipcMain.on('ask-stop', e => { if (isOurPage(e)) askService.stop(); });
ipcMain.on('ask-reset', e => { if (isOurPage(e)) askService.reset(); });
ipcMain.on('command', (e, name, arg) => { if (isOurPage(e)) handleCommand(String(name), arg); });
// Only our own pages may send commands (never a book page).
function isOurPage(e) {
  const url = (e.senderFrame && e.senderFrame.url) || '';
  return url.startsWith('app://local/');
}

// ---------------------------------------------------------------- 5. Engines
async function startEngines() {
  if (!paths) return;
  await cleanStaleEngines(pidsFile, [paths.kiwixExe, paths.llamaExe], log);

  const zims = findZimFiles(paths.library);
  log.info(`found ${zims.length} book file(s) in library/`);
  let ports;
  try { ports = await findFreePorts(2); }
  catch (e) { log.error('no free ports', e); return setLibrary('failed', messages.library.couldNotStart); }
  const config = loadConfig(paths.configFile, log);

  // Start order (measured on the owner's USB stick, see docs/progress.md):
  // 1. the library, 2. the AI once the library is up, 3. the search warm-up once
  // the AI has finished loading. Run at the same time, all three read the stick
  // together and each takes several times longer (library 65 s, AI 2 min 39 s).
  ai = new AiService({ exe: paths.llamaExe, modelsDir: paths.models, port: ports[1], config, log,
    onStatus: s => { state.ai = { state: s.state, message: s.message }; savePids(); broadcast(); } });
  if (zims.length === 0) {
    ai.setStatus('off', messages.ai.noBooks);
    return setLibrary('no-books', messages.library.noBooks);
  }

  kiwix = new KiwixService({ exe: paths.kiwixExe, port: ports[0], zims, log, startSeconds: config.kiwixStartSeconds });
  let libraryReady = false;
  try {
    const books = await kiwix.start();
    savePids();
    state.library = { state: 'ready', message: '', books: publicBooks(books) };
    retriever = new KiwixRetriever({ baseUrl: kiwix.baseUrl, books, log });
    log.info(`library ready after ${Date.now() - START_TIME} ms`);
    broadcast();
    libraryReady = true;
    kiwix.engine.onceExit(info => {
      if (info.expected || shuttingDown) return;
      setLibrary('failed', messages.library.stopped);
      if (ui && ui.content.webContents.getURL().startsWith(kiwix.baseUrl)) go('app://local/message.html?kind=library-stopped');
    });
  } catch (e) {
    log.error('library failed to start:', e.message);
    const msg = { 'engine-missing': messages.library.engineMissing, 'no-readable-books': messages.library.noReadableBooks }[e.code]
      || messages.library.couldNotStart;
    setLibrary('failed', msg);
  }

  if (shuttingDown) return;
  // The AI starts even if the library failed (its status light then explains itself).
  // ai.start() never throws and returns once the AI is ready, off or failed.
  await ai.start().catch(e => log.error('AI start crashed', e));
  log.info(`AI start finished after ${Date.now() - START_TIME} ms (${ai.status.state})`);
  if (libraryReady && !shuttingDown) kiwix.warmUp().catch(() => {}); // background head start for the first search
}

function setLibrary(st, message) { state.library = { state: st, message, books: [] }; broadcast(); }
function savePids() { writePidsFile(pidsFile, [kiwix && kiwix.engine, ai && ai.engine].filter(Boolean)); }

// ---------------------------------------------------------------- 6. Shut down
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down:', reason);
  askService.stop();
  if (ui && !ui.content.webContents.isDestroyed()) ui.content.webContents.loadURL('app://local/message.html?kind=shutting-down');
  await Promise.all([kiwix && kiwix.stop(), ai && ai.stop()]);
  removePidsFile(pidsFile);
  log.info('all engines stopped; goodbye');
  app.exit(0);
}

// ---------------------------------------------------------------- startup
app.on('second-instance', () => {
  if (!ui) return;
  if (ui.win.isMinimized()) ui.win.restore();
  ui.win.show(); ui.win.focus();
});

app.whenReady().then(() => {
  for (const p of APP_PARTITIONS) registerAppProtocol(session.fromPartition(p), { rendererDir: RENDERER_DIR, paths, log });
  registerAppProtocol(session.defaultSession, { rendererDir: RENDERER_DIR, paths, log });

  if (!paths) {
    log.error('drive root not found; exiting');
    dialog.showMessageBoxSync({ type: 'warning', title: 'Offline Library', message: messages.app.noDrive });
    return app.exit(1);
  }

  ui = createMainWindow({
    preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    isPackaged: app.isPackaged, log, onNavChanged, onNotice: showNotice,
    onClose: () => { if (!shuttingDown) { shutdown('window closed'); return false; } return true; },
  });
  ui.bar.webContents.loadURL('app://local/bar.html');
  ui.content.webContents.loadURL('app://local/home.html');
  ui.win.show();
  log.info(`window shown after ${Date.now() - START_TIME} ms`);

  startEngines().catch(e => { log.error('engine start crashed', e); setLibrary('failed', messages.library.couldNotStart); });
});

// Windows log-off / shutdown, or the app being asked to quit some other way.
app.on('before-quit', e => { if (!shuttingDown) { e.preventDefault(); shutdown('quit requested'); } });
app.on('window-all-closed', () => shutdown('all windows closed'));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => shutdown(sig));
