// The app window: a fixed top bar plus a content area underneath.
//
// Both our own pages (app://local/...) and Kiwix's book and map pages load in
// the SAME content area, so Back and Forward work across all of them.
// The top bar is a separate view, so it is always visible and can't be scrolled
// away or covered by a book page.
'use strict';
const { BaseWindow, WebContentsView, session } = require('electron');
const path = require('path');
const { isAllowedUrl } = require('./network-rules');

const BAR_HEIGHT = 64;
const ZOOM_STEPS = [0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// One zoom level for every page (Chromium would otherwise remember it per site).
let currentZoom = 1;

// Apply the network rule and other lock-downs to a browsing session.
function lockDownSession(ses, log) {
  ses.webRequest.onBeforeRequest((details, cb) => {
    const ok = isAllowedUrl(details.url);
    if (!ok) log.warn('blocked request to', safeHost(details.url));
    cb({ cancel: !ok });
  });
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false)); // no camera, location, notifications...
  ses.setPermissionCheckHandler(() => false);
  ses.setSpellCheckerEnabled(false); // would otherwise download dictionaries
  ses.on('will-download', e => e.preventDefault()); // books are read in the app, never saved to the PC
}

function safeHost(url) { try { return new URL(url).host || url.slice(0, 40); } catch { return url.slice(0, 40); } }

function createMainWindow({ preload, isPackaged, log, onClose, onNavChanged }) {
  const win = new BaseWindow({
    width: 1200, height: 820, minWidth: 640, minHeight: 480,
    title: 'Offline Library', backgroundColor: '#e8ece9', show: false,
  });
  win.setMenu(null);

  // Content pages live in an in-memory session: no cache written to the drive.
  // Both views use in-memory sessions: no web cache is ever written to the drive.
  lockDownSession(session.defaultSession, log);
  lockDownSession(session.fromPartition('ui'), log);
  lockDownSession(session.fromPartition('content'), log);

  const common = { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
                   devTools: !isPackaged, preload, webviewTag: false, navigateOnDragDrop: false };
  const bar = new WebContentsView({ webPreferences: { ...common, partition: 'ui' } });
  const content = new WebContentsView({ webPreferences: { ...common, partition: 'content' } });
  win.contentView.addChildView(content);
  win.contentView.addChildView(bar);

  const layout = () => {
    const { width, height } = win.getContentBounds();
    bar.setBounds({ x: 0, y: 0, width, height: BAR_HEIGHT });
    content.setBounds({ x: 0, y: BAR_HEIGHT, width, height: Math.max(0, height - BAR_HEIGHT) });
  };
  win.on('resize', layout);
  layout();

  // --- Links: stay inside the app, never open the customer's browser ---
  for (const wc of [bar.webContents, content.webContents]) {
    wc.setWindowOpenHandler(({ url }) => {
      // "Open in new tab" style links from books: open them in the content area instead.
      if (isAllowedUrl(url) && !url.startsWith('blob:')) content.webContents.loadURL(url);
      else log.warn('blocked new window to', safeHost(url));
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => { if (!isAllowedUrl(url)) { e.preventDefault(); log.warn('blocked link to', safeHost(url)); } });
    wc.on('will-attach-webview', e => e.preventDefault());
    wc.on('before-input-event', (e, input) => { if (handleKeys(input, content, isPackaged)) e.preventDefault(); });
  }
  // The bar itself never navigates away.
  bar.webContents.on('will-navigate', e => e.preventDefault());

  // Mouse "back"/"forward" side buttons (Windows sends these as app commands).
  win.on('app-command', (_e, cmd) => {
    const h = content.webContents.navigationHistory;
    if (cmd === 'browser-backward' && h.canGoBack()) h.goBack();
    if (cmd === 'browser-forward' && h.canGoForward()) h.goForward();
  });

  const navChanged = () => { content.webContents.setZoomFactor(currentZoom); if (onNavChanged) onNavChanged(); };
  content.webContents.on('did-navigate', navChanged);
  content.webContents.on('did-navigate-in-page', navChanged);
  content.webContents.on('page-title-updated', navChanged);

  content.webContents.on('render-process-gone', (_e, d) => {
    log.error('content page crashed:', d.reason);
    content.webContents.loadURL('app://local/message.html?kind=page-crashed');
  });

  win.on('close', e => { if (onClose && onClose(e) === false) e.preventDefault(); });

  return { win, bar, content, layout };
}

// Keyboard shortcuts. Returns true if the key was handled.
function handleKeys(input, content, isPackaged) {
  if (input.type !== 'keyDown') return false;
  const wc = content.webContents;
  const ctrl = input.control || input.meta;
  const k = input.key;
  if (ctrl && (k === '+' || k === '=' || k === 'Add')) return zoom(wc, +1);
  if (ctrl && (k === '-' || k === '_' || k === 'Subtract')) return zoom(wc, -1);
  if (ctrl && (k === '0' || k === 'Insert')) { currentZoom = 1; wc.setZoomFactor(1); return true; }
  const h = wc.navigationHistory;
  if (input.alt && k === 'ArrowLeft') { if (h.canGoBack()) h.goBack(); return true; }
  if (input.alt && k === 'ArrowRight') { if (h.canGoForward()) h.goForward(); return true; }
  if (k === 'BrowserBack') { if (h.canGoBack()) h.goBack(); return true; }
  if (k === 'BrowserForward') { if (h.canGoForward()) h.goForward(); return true; }
  // In the finished app: no developer tools, no "view source", no printing dialogs to nowhere.
  if (isPackaged && (k === 'F12' || (ctrl && input.shift && /^[ijc]$/i.test(k)) || (ctrl && /^u$/i.test(k)))) return true;
  return false;
}

function zoom(wc, direction) {
  const now = wc.getZoomFactor();
  let i = ZOOM_STEPS.findIndex(z => z >= now - 0.001);
  if (i < 0) i = ZOOM_STEPS.length - 1;
  if (direction > 0) i = Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS[i] > now + 0.001 ? i : i + 1);
  else i = Math.max(0, ZOOM_STEPS[i] < now - 0.001 ? i : i - 1);
  currentZoom = ZOOM_STEPS[i];
  wc.setZoomFactor(currentZoom);
  return true;
}

module.exports = { createMainWindow, BAR_HEIGHT, ZOOM_STEPS };
