'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { searchLibrary, looksLikeProse } = require('../../app/src/main/library-search');

test('snippets: sentences are shown, name lists are hidden', () => {
  assert.ok(looksLikeProse('The water bowline is a type of knot designed for use in wet conditions where other knots may slip.'));
  assert.ok(!looksLikeProse('Water Zeppelin Bending Boa Bottle sling Constrictor Corned beef Granny Ground-line hitch Reef'));
  assert.ok(!looksLikeProse('"Rollin" "Made in Japan" "Love Is Strange" "Together Again" Collaboration singles'));
  assert.ok(!looksLikeProse('Too short'));
});

test('search: text books only, results interleaved by book, titles first', async () => {
  const calls = [];
  const xml = (book, n) => `<rss><channel><opensearch:totalResults>${n}</opensearch:totalResults>${Array.from({ length: n }, (_, i) =>
    `<item><title>${book} ${i}</title><link>/content/${book}/A${i}</link><description>The thing is a kind of object that is used in the field for many years.</description><book><title>${book}</title></book><wordCount>5</wordCount></item>`).join('')}</channel></rss>`;
  const fakeFetch = async url => {
    const u = new URL(url); calls.push(u.pathname + u.search);
    if (u.pathname === '/search') { const id = u.searchParams.get('books.id'); return { ok: true, text: async () => xml(id === 'w' ? 'wiki' : 'med', id === 'w' ? 5 : 2) }; }
    return { ok: true, json: async () => (u.searchParams.get('content') === 'med' ? [{ kind: 'path', value: 'Water &amp; health', path: 'Water_&amp;_health' }] : []) };
  };
  const books = [
    { id: 'w', slug: 'wiki', title: 'Wikipedia', isMap: false, hasFullTextIndex: true },
    { id: 'm', slug: 'med', title: 'Medicine', isMap: false, hasFullTextIndex: true },
    { id: 'x', slug: 'osm-x', title: 'OSM - X', isMap: true, hasFullTextIndex: true },
  ];
  const r = await searchLibrary({ baseUrl: 'http://k', books, query: 'water', fetchImpl: fakeFetch });
  assert.ok(!calls.some(c => c.includes('osm-x') || c.includes('books.id=x')), 'maps never searched');
  assert.deepStrictEqual(r.results.slice(0, 4).map(x => x.title), ['wiki 0', 'med 0', 'wiki 1', 'med 1'], 'one big book cannot crowd out the others');
  assert.strictEqual(r.total, 7);
  assert.deepStrictEqual(r.titleMatches.map(t => [t.title, t.path]), [['Water & health', 'Water_&_health']]);
  assert.strictEqual(r.results[0].path, 'A0');
});

test('search: empty query or no text books gives nothing, without calling Kiwix', async () => {
  let called = false;
  const f = async () => { called = true; };
  assert.deepStrictEqual(await searchLibrary({ baseUrl: 'http://k', books: [{ isMap: false }], query: '  ', fetchImpl: f }), { titleMatches: [], results: [], total: 0 });
  assert.deepStrictEqual(await searchLibrary({ baseUrl: 'http://k', books: [{ isMap: true }], query: 'x', fetchImpl: f }), { titleMatches: [], results: [], total: 0 });
  assert.strictEqual(called, false);
});
