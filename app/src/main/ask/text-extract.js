// Turn a book page (HTML from Kiwix) into clean plain text for the AI.
//
// Keeps: headings and paragraphs, lists, table text, image captions.
// Drops: scripts, styles, footnote markers like [12], navigation boxes, and the
// end-of-article sections that are not useful for answering (References,
// External links, See also, ...).
// Simple and dependency-free on purpose: Kiwix pages are well-formed and similar.
'use strict';

const DROP_SECTIONS = /^(references|notes|external links|see also|further reading|bibliography|sources|citations|footnotes|works cited|literature|notes and references)$/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', times: '×', minus: '−', frac12: '½', frac14: '¼', frac34: '¾',
  middot: '·', bull: '•', copy: '©', reg: '®', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß' };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return ' '; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Remove a whole element (with everything inside), for simple non-nested cases.
const stripBlocks = (html, tags) => html.replace(new RegExp(`<(${tags})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'), ' ');

// Remove <table>/<div> elements whose class matches, handling nesting of the same tag.
function stripByClass(html, tag, classRe) {
  const open = new RegExp(`<${tag}\\b[^>]*class="[^"]*(?:${classRe})[^"]*"[^>]*>`, 'i');
  let m;
  let guard = 0;
  while ((m = open.exec(html)) && guard++ < 500) {
    let depth = 1;
    const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = m.index + m[0].length;
    let t;
    while (depth > 0 && (t = tagRe.exec(html))) depth += t[0][1] === '/' ? -1 : 1;
    const end = t ? t.index + t[0].length : html.length;
    html = html.slice(0, m.index) + ' ' + html.slice(end);
  }
  return html;
}

/**
 * @param {string} html  the article page
 * @returns {{ title: string, text: string }}  text uses "\n\n" between blocks and "## " for headings
 */
function extractText(html) {
  const title = decode(((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim());
  let h = html;
  const body = h.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (body) h = body[1];

  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  h = stripBlocks(h, 'script|style|noscript|svg|math|button|nav|footer|header');
  h = stripByClass(h, 'table', 'navbox|vertical-navbox|metadata|ambox|sistersitebox|mbox');
  h = stripByClass(h, 'div', 'navbox|reflist|refbegin|hatnote|thumbcaption-magnify|mw-references|shortdescription|printfooter');
  h = h.replace(/<sup\b[^>]*class="[^"]*(?:reference|noprint)[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, ''); // [1] markers
  h = h.replace(/<span\b[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');

  // Headings become "## Heading" lines; block elements become paragraph breaks.
  h = h.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, _n, inner) => `\n\n## ${inner.replace(/<[^>]+>/g, '')}\n\n`);
  h = h.replace(/<li\b[^>]*>/gi, '\n- ');
  h = h.replace(/<(?:td|th)\b[^>]*>/gi, ' | ');
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<\/?(?:p|div|section|ul|ol|dl|dd|dt|tr|table|blockquote|figure|figcaption|details|summary|pre)\b[^>]*>/gi, '\n\n');
  h = h.replace(/<[^>]+>/g, '');
  h = decode(h);

  // Tidy spaces, then drop the end-of-article sections.
  const blocks = h.split(/\n{2,}/).map(b => b.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/^(\s*\|\s*)+/, '').trim())
    .filter(b => b && !/^[|\s-]+$/.test(b));
  const kept = [];
  let dropping = false;
  for (const b of blocks) {
    const head = b.match(/^## (.+)$/);
    if (head) dropping = DROP_SECTIONS.test(head[1].trim());
    if (!dropping) kept.push(b.replace(/\[\d+\]|\[citation needed\]|\[edit\]/gi, '').trim());
  }
  // Drop a leading heading that only repeats the title.
  if (kept[0] && kept[0].replace(/^## /, '') === title) kept.shift();
  return { title, text: kept.filter(Boolean).join('\n\n') };
}

module.exports = { extractText, decode };
