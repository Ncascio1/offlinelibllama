// Home, Library, Maps, Ask and message pages.
// Each page is rebuilt from the app's state whenever it changes (books found,
// AI ready, and so on), so nothing is ever stuck on "loading".
// All text is set with textContent (never as HTML), so book titles can't inject code.
'use strict';

const page = document.body.dataset.page;
const main = document.getElementById('main');
const params = new URLSearchParams(location.search);

// Tiny helper to build elements: h('p', { class: 'small' }, 'text', child, ...)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') el.addEventListener('click', v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const cmd = (name, arg) => window.ol.command(name, arg);

function libraryNotice(s) {
  if (s.library.state === 'ready') return null;
  const kind = s.library.state === 'starting' ? '' : 'bad';
  return h('div', { class: `notice ${kind}`, role: 'status' }, s.library.message);
}

function aiNotice(s) {
  const kind = { ready: '', starting: 'warn', off: 'warn', failed: 'bad' }[s.ai.state] || '';
  return h('div', { class: `notice ${kind}`, role: 'status' }, s.ai.message);
}

function askBox(s, initial = '') {
  const area = h('textarea', { id: 'question', rows: 2, placeholder: 'For example: how do I purify water?', 'aria-describedby': 'ask-note' });
  area.value = initial;
  const send = () => { if (area.value.trim()) cmd('ask', area.value.trim()); };
  area.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  return h('form', { class: 'ask', onclick: null },
    h('label', { for: 'question' }, 'Ask a question'),
    h('div', { class: 'row' }, area, h('button', { type: 'button', onclick: send }, 'Ask')),
    h('p', { class: 'small', id: 'ask-note', style: 'margin:8px 0 0' },
      'The AI answers from the books on this drive and can still make mistakes. Check the sources it shows.'));
}

const PAGES = {
  home(s) {
    return [
      h('h1', {}, 'Offline Library'),
      h('p', {}, 'Books, maps and an assistant. No internet needed.'),
      libraryNotice(s),
      h('div', { class: 'tiles' },
        h('button', { class: 'tile', onclick: () => cmd('library') }, h('strong', {}, 'Library'), h('span', {}, 'Read Wikipedia and the other books.')),
        h('button', { class: 'tile', onclick: () => cmd('maps') }, h('strong', {}, 'Maps'), h('span', {}, 'Street maps you can search and zoom.')),
        h('button', { class: 'tile', onclick: () => cmd('help') }, h('strong', {}, 'Help'), h('span', {}, 'How to use this drive.'))),
      askBox(s),
      s.ai.state !== 'ready' ? h('p', { class: 'small', style: 'margin-top:12px' }, s.ai.message) : null,
    ];
  },

  library(s) {
    const books = s.library.books.filter(b => !b.isMap);
    return [
      h('h1', {}, 'Library'),
      libraryNotice(s),
      s.library.state === 'ready' && books.length === 0 ? h('div', { class: 'notice warn' }, 'There are no books on this drive, only maps.') : null,
      books.length ? h('p', {}, 'Choose a book. Inside a book, use the search box at the top to find a topic.') : null,
      h('div', { class: 'list' }, ...books.map(b =>
        h('button', { class: 'item', onclick: () => cmd('open-book', b.slug) }, h('strong', {}, b.title), b.summary ? h('span', {}, b.summary) : null))),
    ];
  },

  maps(s) {
    const maps = s.library.books.filter(b => b.isMap);
    return [
      h('h1', {}, 'Maps'),
      libraryNotice(s),
      !hasWebgl() ? h('div', { class: 'notice bad' }, 'This computer cannot draw the maps. The Library and the AI still work.') : null,
      s.library.state === 'ready' && maps.length === 0 ? h('div', { class: 'notice warn' }, 'There are no maps on this drive.') : null,
      maps.length ? h('p', {}, 'Choose a map. Drag to move around, use the mouse wheel or the + and − buttons to zoom, and type a place name in the search box.') : null,
      h('div', { class: 'list' }, ...maps.map(b =>
        h('button', { class: 'item', onclick: () => cmd('open-book', b.slug) }, h('strong', {}, b.title), h('span', {}, 'Street map')))),
    ];
  },

  ask(s) {
    const q = params.get('q') || '';
    return [
      h('h1', {}, 'Ask'),
      aiNotice(s),
      askBox(s, q),
      q ? h('div', { class: 'notice warn', style: 'margin-top:24px' },
        'Answering questions is still being built. In the finished app your answer and its sources appear here.') : null,
    ];
  },

  message() {
    const M = {
      'shutting-down': ['Shutting down', 'Closing the library and the AI. This window closes by itself in a moment.'],
      'library-stopped': ['The library stopped', 'If you unplugged the drive, plug it back in, then close the program and start it again.'],
      'library-not-ready': ['The library is not ready yet', 'Wait a moment, then try again from the Library button.'],
      'page-crashed': ['This page stopped working', 'Use the Back button, or the Home button, to continue.'],
      'no-help': ['The guide is missing', 'The file START-HERE.html should be on this drive. Contact the person who gave you this drive.'],
    };
    const [title, text] = M[params.get('kind')] || ['Something went wrong', 'Use the Home button to continue.'];
    return [h('h1', {}, title), h('p', {}, text)];
  },
};

// Maps need WebGL; check once.
let webgl = null;
function hasWebgl() {
  if (webgl === null) {
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { webgl = false; }
  }
  return webgl;
}

function render(s) {
  if (!s) return;
  // Keep what the person is typing when the page refreshes.
  const typing = document.getElementById('question');
  const draft = typing ? typing.value : null;
  const hadFocus = typing && document.activeElement === typing;
  main.replaceChildren(...PAGES[page](s).filter(Boolean));
  const again = document.getElementById('question');
  if (again && draft !== null) { again.value = draft; if (hadFocus) again.focus(); }
}

if (page === 'message') render({});
else { window.ol.onState(render); window.ol.getState().then(render); }
