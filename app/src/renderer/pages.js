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
      books.length ? searchBox() : null,
      books.length ? h('h2', { style: 'margin-top:28px' }, 'Books') : null,
      books.length ? h('p', {}, 'Or choose a book. Inside a book, the search box at the top searches that book only.') : null,
      ...bookList(books),
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
        h('button', { class: 'item book', disabled: !hasWebgl(), onclick: () => cmd('open-book', b.slug) },
          b.icon ? h('img', { src: b.icon, alt: '', width: 48, height: 48 }) : h('span', { class: 'noicon', 'aria-hidden': 'true' }),
          h('span', { class: 'text' }, h('strong', {}, b.title), h('span', {}, 'Street map'))))),
    ];
  },

  search(s) {
    const q = params.get('q') || '';
    const box = searchBox();
    box.querySelector('input').value = q;
    const out = h('div', { id: 'results', role: 'status' }, q ? 'Searching…' : '');
    if (q && s.library.state === 'ready' && !searchStarted) {
      searchStarted = true;
      window.ol.searchLibrary(q).then(r => showResults(r, q));
    }
    return [h('h1', {}, 'Search all books'), libraryNotice(s), box, lastResults || out];
  },

  message() {
    const M = {
      'shutting-down': ['Shutting down', 'Closing the library and the AI. This window closes by itself in a moment.'],
      'library-stopped': ['The library stopped', 'If you unplugged the drive, plug it back in, then close the program and start it again.'],
      'library-not-ready': ['The library is not ready yet', 'Wait a moment, then try again from the Library button.'],
      'page-crashed': ['This page stopped working', 'Use the Back button, or the Home button, to continue.'],
    };
    const [title, text] = M[params.get('kind')] || ['Something went wrong', 'Use the Home button to continue.'];
    return [h('h1', {}, title), h('p', {}, text)];
  },
};

// ---- Library book list ----
// Groups are used only when there are many books; small drives get one simple list.
const GROUPS = [
  ['Encyclopedias', c => /^(wikipedia|wikinews)$/.test(c)],
  ['Dictionaries', c => /^wiktionary$/.test(c)],
  ['How-to books and guides', c => /^(wikibooks|wikihow|wikivoyage|stack_exchange|other_howto)$/.test(c)],
  ['Classic books', c => /^(gutenberg|wikisource)$/.test(c)],
  ['Talks and videos', c => /^(ted|youtube|videos?)$/.test(c)],
];
const GROUP_WHEN_MORE_THAN = 6;

function sizeText(n) {
  if (!n) return '';
  if (n >= 1e6) return `about ${(n / 1e6).toFixed(1).replace(/\.0$/, '')} million articles`;
  return `${n.toLocaleString('en-US')} article${n === 1 ? '' : 's'}`;
}

let languageNames = null;
function languageName(code) {
  try { languageNames = languageNames || new Intl.DisplayNames(['en'], { type: 'language' }); return languageNames.of(code) || code; }
  catch { return code; }
}

function bookButton(b, showLanguage) {
  const details = [sizeText(b.articleCount), showLanguage && b.language ? languageName(b.language.split(',')[0]) : ''].filter(Boolean).join(' · ');
  return h('button', { class: 'item book', onclick: () => cmd('open-book', b.slug) },
    b.icon ? h('img', { src: b.icon, alt: '', width: 48, height: 48 }) : h('span', { class: 'noicon', 'aria-hidden': 'true' }),
    h('span', { class: 'text' }, h('strong', {}, b.title), b.summary ? h('span', {}, b.summary) : null,
      details ? h('span', { class: 'small' }, details) : null));
}

function bookList(books) {
  // Show languages only when the books really are in different main languages
  // (a TED collection marked "eng,ara,..." is still an English book here).
  const showLanguage = new Set(books.map(b => (b.language || '').split(',')[0])).size > 1;
  const sorted = books.slice().sort((a, b) => b.articleCount - a.articleCount); // biggest (usually Wikipedia) first
  if (books.length <= GROUP_WHEN_MORE_THAN) return [h('div', { class: 'list' }, ...sorted.map(b => bookButton(b, showLanguage)))];
  const out = [];
  const used = new Set();
  for (const [name, test] of [...GROUPS, ['Other books', () => true]]) {
    const inGroup = sorted.filter(b => !used.has(b) && test((b.category || '').toLowerCase()));
    if (!inGroup.length) continue;
    inGroup.forEach(b => used.add(b));
    out.push(h('h3', { class: 'group' }, name), h('div', { class: 'list' }, ...inGroup.map(b => bookButton(b, showLanguage))));
  }
  return out;
}

// "Search all books" box (Library page).
function searchBox() {
  const input = h('input', { type: 'text', id: 'search', placeholder: 'For example: water filter', 'aria-label': 'Search all books' });
  const go = () => { if (input.value.trim()) cmd('search', input.value.trim()); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'ask' },
    h('label', { for: 'search' }, 'Search all books'),
    h('div', { class: 'row' }, input, h('button', { type: 'button', onclick: go }, 'Search')));
}

let searchStarted = false;
let lastResults = null;
const FIRST_RESULTS = 15;
function showResults(r, q) {
  const result = item => h('li', {}, h('button', { class: 'result', onclick: () => cmd('open-article', { slug: item.slug, path: item.path }) },
    h('strong', {}, item.title), h('span', { class: 'from' }, ` from ${item.bookTitle}`), item.snippet ? h('span', { class: 'snippet' }, item.snippet) : null));
  let content;
  if (!r || r.error) content = h('div', { class: 'notice bad' }, 'The search did not work this time. Try again in a moment.');
  else if (!r.results.length && !r.titleMatches.length) content = h('div', { class: 'notice warn' }, `Nothing found for "${q}". Try fewer or different words.`);
  else content = h('div', {},
    r.titleMatches.length ? h('h2', {}, 'Articles with this name') : null,
    r.titleMatches.length ? h('ul', { class: 'results' }, ...r.titleMatches.map(result)) : null,
    r.results.length ? h('h2', {}, 'Articles that mention it') : null,
    r.results.length ? h('ul', { class: 'results', id: 'mentions' }, ...r.results.slice(0, FIRST_RESULTS).map(result)) : null,
    r.results.length > FIRST_RESULTS ? h('button', { class: 'secondary', id: 'more', onclick: e => {
      // Show the rest, then put the keyboard focus on the first newly shown result.
      const list = document.getElementById('mentions');
      const extra = r.results.slice(FIRST_RESULTS).map(result);
      list.append(...extra);
      e.currentTarget.remove();
      extra[0].querySelector('button').focus();
    } }, `Show ${r.results.length - FIRST_RESULTS} more`) : null);
  lastResults = h('div', { id: 'results' }, content);
  const old = document.getElementById('results');
  if (old) old.replaceWith(lastResults);
}

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
  // The page is rebuilt when the app's status changes (for example the AI becomes
  // ready). Keep whatever the person is typing, and where the cursor is.
  const drafts = {};
  for (const el of main.querySelectorAll('input[id], textarea[id]')) drafts[el.id] = { value: el.value, start: el.selectionStart, end: el.selectionEnd };
  const focused = document.activeElement && document.activeElement.id;
  main.replaceChildren(...PAGES[page](s).filter(Boolean));
  for (const [id, d] of Object.entries(drafts)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = d.value;
    if (id === focused) { el.focus(); try { el.setSelectionRange(d.start, d.end); } catch {} }
  }
}

if (page === 'message') render({});
else { window.ol.onState(render); window.ol.getState().then(render); }
