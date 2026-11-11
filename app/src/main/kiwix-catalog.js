// Read Kiwix's list of books (/catalog/v2/entries) and the XML search results.
//
// Facts confirmed in Phase 0 (fixtures in tests/fixtures/kiwix-3.8.1/):
//  - The catalog <name> (e.g. "wikipedia_en_knots") is NOT accepted by /search.
//  - The address name from <link type="text/html" href="/content/<slug>"> IS
//    accepted, and so is the book's UUID (books.id). We search by UUID.
//  - StreetZim maps have tags containing "maps" / "osm".
//
// The feed is simple and machine-generated, so a small careful parser is enough;
// it avoids adding an XML library.
'use strict';

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1].trim()) : '';
}

// Map detection: tags first (reliable), then the prototype's name guess as backup.
function isMapBook({ tags, name, slug, title }) {
  const tagList = tags.toLowerCase().split(';').map(t => t.trim());
  if (tagList.includes('maps') || tagList.includes('osm')) return true;
  const text = `${name} ${slug} ${title}`.toLowerCase();
  if (text.includes('wikipedia')) return false;
  return /street|map|osm/.test(text);
}

// "OSM - Bahrain" -> "Bahrain": friendlier menu names for maps.
function friendlyMapTitle(title) {
  return title.replace(/^\s*(osm|openstreetmap|streetzim)\s*[-:–]\s*/i, '').trim() || title;
}

/** Parse the catalog feed into a list of books. */
function parseCatalog(xml) {
  const books = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const e of entries) {
    const idRaw = tagText(e, 'id');
    const contentHref = (e.match(/<link[^>]*type="text\/html"[^>]*href="([^"]+)"/) || [])[1] || '';
    const slugMatch = contentHref.match(/\/content\/([^/?#]+)/);
    const book = {
      id: idRaw.replace(/^urn:uuid:/, ''),
      title: tagText(e, 'title'),
      name: tagText(e, 'name'),
      slug: slugMatch ? decodeURIComponent(slugMatch[1]) : '',
      summary: tagText(e, 'summary'),
      language: tagText(e, 'language'),
      tags: tagText(e, 'tags'),
      articleCount: Number(tagText(e, 'articleCount')) || 0,
    };
    if (!book.id || !book.slug) continue; // unusable entry; skip it
    book.isMap = isMapBook(book);
    book.displayTitle = book.isMap ? friendlyMapTitle(book.title) : book.title;
    book.hasFullTextIndex = /(^|;)_ftindex:yes/.test(book.tags);
    books.push(book);
  }
  return books;
}

/** Parse /search?...&format=xml results (used by the AI in Phase 3). */
function parseSearchXml(xml) {
  const total = Number(tagText(xml, 'opensearch:totalResults')) || 0;
  const items = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map(it => {
    const link = tagText(it, 'link');
    const slug = (link.match(/^\/content\/([^/]+)\//) || [])[1] || '';
    return {
      title: tagText(it, 'title'),
      link,
      slug,
      snippet: tagText(it, 'description').replace(/<\/?b>/g, ''),
      bookTitle: decodeEntities(((it.match(/<book>\s*<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim()),
      wordCount: Number(tagText(it, 'wordCount').replace(/[^\d]/g, '')) || 0,
    };
  });
  return { total, items };
}

module.exports = { parseCatalog, parseSearchXml, isMapBook, friendlyMapTitle, decodeEntities };
