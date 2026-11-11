'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseCatalog, parseSearchXml, isMapBook, friendlyMapTitle } = require('../../app/src/main/kiwix-catalog');

const fx = name => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'kiwix-3.8.1', name), 'utf8');

test('catalog: reads both books with id, address name (slug) and catalog name', () => {
  const books = parseCatalog(fx('catalog-v2-entries.xml'));
  assert.strictEqual(books.length, 2);
  const knots = books.find(b => b.title === 'Knots by Wikipedia');
  assert.strictEqual(knots.id, 'b37270fd-f267-39ba-fc4f-9f3c720e5d8f');
  assert.strictEqual(knots.slug, 'wikipedia_en_knots_maxi_2026-10'); // what /content and /search accept
  assert.strictEqual(knots.name, 'wikipedia_en_knots');               // what /search does NOT accept
  assert.strictEqual(knots.isMap, false);
  assert.strictEqual(knots.hasFullTextIndex, true);
  assert.strictEqual(knots.articleCount, 1735);
});

test('catalog: the StreetZim map is recognised as a map, with a friendly name', () => {
  const books = parseCatalog(fx('catalog-with-map.xml'));
  assert.strictEqual(books.length, 3);
  const map = books.find(b => b.isMap);
  assert.ok(map, 'a map was found');
  assert.strictEqual(map.slug, 'osm-bahrain-2026-11-09');
  assert.strictEqual(map.title, 'OSM - Bahrain');
  assert.strictEqual(map.displayTitle, 'Bahrain');
  assert.strictEqual(books.filter(b => b.isMap).length, 1);
});

test('map detection rules', () => {
  assert.ok(isMapBook({ tags: 'maps;osm', name: 'x', slug: 'x', title: 'x' }));
  assert.ok(isMapBook({ tags: '', name: 'streetzim_ohio', slug: 'streetzim_ohio', title: 'Ohio' }));
  assert.ok(!isMapBook({ tags: 'wikipedia', name: 'wikipedia_en_maps', slug: 'wikipedia_en_maps', title: 'Maps on Wikipedia' }));
  assert.ok(!isMapBook({ tags: 'medicine', name: 'wikem', slug: 'wikem', title: 'WikEM' }));
});

test('friendly map titles', () => {
  assert.strictEqual(friendlyMapTitle('OSM - Bahrain'), 'Bahrain');
  assert.strictEqual(friendlyMapTitle('OpenStreetMap: Ohio'), 'Ohio');
  assert.strictEqual(friendlyMapTitle('Ohio'), 'Ohio');
});

test('search XML: results with title, link, slug, snippet and book title', () => {
  const r = parseSearchXml(fx('search-water-2books.xml'));
  assert.strictEqual(r.total, 238);
  assert.strictEqual(r.items.length, 3);
  assert.deepStrictEqual(
    { title: r.items[0].title, link: r.items[0].link, slug: r.items[0].slug, book: r.items[0].bookTitle, words: r.items[0].wordCount },
    { title: 'Water knot', link: '/content/wikipedia_en_knots_maxi_2026-10/Water_knot', slug: 'wikipedia_en_knots_maxi_2026-10', book: 'Knots by Wikipedia', words: 1107 });
  assert.ok(!r.items[0].snippet.includes('<b>'), 'bold tags removed from snippet');
});

test('catalog: empty or broken input gives an empty list, not a crash', () => {
  assert.deepStrictEqual(parseCatalog(''), []);
  assert.deepStrictEqual(parseCatalog('<feed><entry><title>no id</title></entry></feed>'), []);
});
