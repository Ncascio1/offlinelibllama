// "Search all books" for the Library page.
//
// Facts confirmed on kiwix-serve 3.8.1:
//  - Searching without naming books also searches the maps (StreetZim maps contain
//    place pages), so we always name the text books we want.
//  - Kiwix refuses to search books in different languages together, so each book
//    is searched on its own and the lists are merged (like the AI's retriever).
'use strict';
const { parseSearchXml, decodeEntities } = require('./kiwix-catalog');

const PER_BOOK = 25;

/**
 * @param {object} o
 * @param {string} o.baseUrl   Kiwix address
 * @param {Array}  o.books     catalog books
 * @param {string} o.query     what the customer typed
 * @returns {Promise<{ titleMatches: Array, results: Array, total: number }>}
 *   each item: { title, bookTitle, slug, path, snippet }
 */
async function searchLibrary({ baseUrl, books, query, fetchImpl = fetch }) {
  const q = String(query || '').trim().slice(0, 200);
  const textBooks = books.filter(b => !b.isMap);
  if (!q || !textBooks.length) return { titleMatches: [], results: [], total: 0 };
  const get = async (path, json) => {
    const res = await fetchImpl(baseUrl + path, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? res.json() : res.text();
  };

  const perBook = await Promise.all(textBooks.map(async book => {
    const [xml, sugg] = await Promise.all([
      book.hasFullTextIndex
        ? get(`/search?books.id=${encodeURIComponent(book.id)}&format=xml&pageLength=${PER_BOOK}&pattern=${encodeURIComponent(q)}`).catch(() => '')
        : Promise.resolve(''),
      get(`/suggest?content=${encodeURIComponent(book.slug)}&term=${encodeURIComponent(q)}&count=5`, true).catch(() => []),
    ]);
    const { items, total } = parseSearchXml(xml);
    const bookTitle = book.displayTitle || book.title;
    const results = items.map(it => ({
      title: it.title, bookTitle, slug: book.slug,
      path: decodeURIComponent(it.link.slice(`/content/${book.slug}/`.length)), snippet: shorten(it.snippet),
    })).filter(r => r.path);
    const titles = (Array.isArray(sugg) ? sugg : []).filter(s => s.kind === 'path' && s.path)
      .map(s => ({ title: decodeEntities(s.value || s.path), bookTitle, slug: book.slug, path: decodeEntities(s.path), snippet: '' }));
    return { results, titles, total };
  }));

  // Merge: take the 1st result of each book, then the 2nd of each, and so on,
  // so one huge book (Wikipedia) doesn't push every other book off the page.
  const results = [];
  for (let i = 0; i < PER_BOOK; i++) for (const b of perBook) if (b.results[i]) results.push(b.results[i]);
  const seen = new Set();
  const titleMatches = perBook.flatMap(b => b.titles).filter(t => {
    const k = `${t.slug}/${t.path}`; if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 8);
  return { titleMatches, results, total: perBook.reduce((s, b) => s + b.total, 0) };
}

// Kiwix often takes snippets from navigation boxes and lists ("Water Zeppelin Bending
// Boa Bottle sling ..." or song titles in quotes). Those mean nothing to a reader,
// so a snippet is only shown if it reads like a sentence.
function looksLikeProse(s) {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  const capitalised = words.filter(w => /^[A-Z]/.test(w)).length / words.length;
  const quotes = (s.match(/["“”]/g) || []).length;
  const smallWords = words.filter(w => /^(the|a|an|is|was|are|of|to|in|and|for|it|with|as|by|on|that)$/i.test(w)).length / words.length;
  return capitalised < 0.4 && quotes < 4 && smallWords > 0.12;
}

// Snippets can be long; keep about two lines. Empty if it doesn't read like a sentence.
function shorten(s) {
  if (!looksLikeProse(s)) return '';
  const t = s.replace(/\s+/g, ' ').replace(/^\.\.\./, '').trim();
  return t.length > 240 ? t.slice(0, 240).replace(/\s\S*$/, '') + '…' : t;
}

module.exports = { searchLibrary, looksLikeProse };
