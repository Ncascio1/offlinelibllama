// The Library retriever: find the passages in the books that best match a question.
//
// "Retriever" is a swappable part (the brief asks for this): anything with a
// retrieve({ question, keywords, signal }) method returning the same shape can
// replace it later, for example a vector index.
//
// How it searches (facts confirmed on kiwix-serve 3.8.1):
//  - Kiwix full-text search needs EVERY word to match, so we try all keywords
//    together first, then smaller combinations, and merge the result lists.
//  - Title lookup (/suggest, keyed by the book's address name) finds articles
//    whose title matches, a strong signal ("Bowline" for "bowline").
//  - Map books are never searched.
'use strict';
const { parseSearchXml, decodeEntities } = require('../kiwix-catalog');
const { extractText } = require('./text-extract');
const { splitPassages, rankPassages } = require('./passages');
const { fallbackKeywords } = require('./keywords');

const RRF_K = 10;               // rank-fusion constant: higher = flatter
const MAX_ARTICLE_WORDS = 6000; // very long articles: only the first part is used
const MAX_PASSAGES_PER_ARTICLE = 3;

// "How do I ...?" questions: the answer usually sits in a section with one of these names.
const HOW_TO_QUESTION = /^\s*(how (do|can|should|to|would)|what('s| is) the (best )?way|steps|instructions)\b|\bhow to\b/i;
const HOW_TO_SECTION = /\b(tying|tie|method|methods|instructions?|procedure|technique|how to|steps?|treatment|first aid|making|preparation|construction|use|usage|uses|application|management)\b/i;

class KiwixRetriever {
  /**
   * @param {object} o
   * @param {string} o.baseUrl   e.g. http://127.0.0.1:12345
   * @param {Array}  o.books     catalog books (id, slug, title, isMap, hasFullTextIndex)
   */
  constructor({ baseUrl, books, log, maxArticles = 10, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.books = books.filter(b => !b.isMap);
    this.log = log;
    this.maxArticles = maxArticles;
    this.fetch = fetchImpl;
  }

  async get(path, signal, asJson = false) {
    const res = await this.fetch(this.baseUrl + path, { signal: anySignal(signal, 15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.slice(0, 80)}`);
    return asJson ? res.json() : res.text();
  }

  // Read an article, following redirects (alternate names). Returns the final address too.
  async getArticle(path, signal) {
    const res = await this.fetch(this.baseUrl + path, { signal: anySignal(signal, 15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.slice(0, 80)}`);
    const finalPath = res.url && res.url.startsWith(this.baseUrl) ? res.url.slice(this.baseUrl.length) : path;
    // Only web pages can be read as text. PDFs, videos and pictures are skipped
    // (otherwise raw file data would reach the AI as if it were text).
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || 'text/html';
    if (!/html|text\/plain/i.test(type)) throw Object.assign(new Error(`not a web page (${type.split(';')[0]})`), { skip: true });
    return { html: await res.text(), finalLink: normLink(finalPath) };
  }

  // Which search phrases to try, best first, with how much each one counts.
  // `questionWords` are the question's own words (filler removed): always searched too,
  // so a poor keyword choice by the AI can't hide the obvious articles.
  static searchPlan(keywords, questionWords = []) {
    const k = keywords.filter(Boolean);
    const plan = [];
    if (k.length) plan.push({ q: k.join(' '), w: 1.0 });
    const qw = questionWords.join(' ');
    if (qw && qw !== k.join(' ')) plan.push({ q: qw, w: 0.9 });
    if (k.length > 2) plan.push({ q: k.slice(0, 2).join(' '), w: 0.8 });
    for (const one of k.slice(0, 3)) if (k.length > 1) plan.push({ q: one, w: 0.5 });
    return plan;
  }

  async searchBook(book, keywords, signal, questionWords = []) {
    const found = new Map(); // link -> { score, item }
    const add = (link, title, score) => {
      const cur = found.get(link);
      if (cur) cur.score += score; else found.set(link, { link, title, score, book });
    };
    if (book.hasFullTextIndex) {
      for (const { q, w } of KiwixRetriever.searchPlan(keywords, questionWords)) {
        const xml = await this.get(`/search?books.id=${encodeURIComponent(book.id)}&format=xml&pageLength=${this.maxArticles}&pattern=${encodeURIComponent(q)}`, signal)
          .catch(e => { this.log.warn('search failed:', e.message); return ''; });
        const { items } = parseSearchXml(xml);
        items.forEach((it, i) => add(it.link, it.title, w / (RRF_K + i)));
        if (found.size >= this.maxArticles * 2) break; // plenty already
      }
    }
    // Title matches for the main keyword and for the whole phrase.
    for (const term of [...new Set([keywords[0], keywords.slice(0, 2).join(' ')])].filter(Boolean)) {
      const list = await this.get(`/suggest?content=${encodeURIComponent(book.slug)}&term=${encodeURIComponent(term)}&count=3`, signal, true)
        .catch(() => []);
      (Array.isArray(list) ? list : []).filter(s => s.kind === 'path' && s.path).forEach((s, i) => {
        const path = decodeEntities(s.path);
        add(`/content/${book.slug}/${path.split('/').map(encodeURIComponent).join('/')}`, decodeEntities(s.value || path), 1.2 / (RRF_K + i));
      });
    }
    return [...found.values()];
  }

  /**
   * @returns {Promise<{ articles: Array, passages: Array }>}
   *   passages are ranked best first; each has { text, section, title, bookTitle, link, score }
   */
  async retrieve({ question, keywords, signal }) {
    const questionWords = fallbackKeywords(question);
    const perBook = await Promise.all(this.books.map(b => this.searchBook(b, keywords, signal, questionWords).catch(e => {
      this.log.warn(`search in ${b.slug} failed:`, e.message); return [];
    })));
    // Merge, normalising links so the same article found twice counts once.
    const merged = new Map();
    for (const r of perBook.flat()) {
      const key = normLink(r.link);
      const cur = merged.get(key);
      if (cur) cur.score += r.score; else merged.set(key, { ...r, link: key });
    }
    const top = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, this.maxArticles);

    // Read the articles (in parallel) and cut them into passages.
    const articles = (await Promise.all(top.map(async a => {
      try {
        const { html, finalLink } = await this.getArticle(a.link, signal);
        const { title, text } = extractText(html);
        return { title: title || a.title, bookTitle: a.book.displayTitle || a.book.title, link: finalLink,
                 text: truncateWords(text, MAX_ARTICLE_WORDS), searchScore: a.score };
      } catch (e) {
        if (signal && signal.aborted) throw e;
        if (!e.skip) this.log.warn('could not read article', a.link.slice(0, 80), e.message);
        return null;
      }
    }))).filter(a => a && a.text)
      // Two names for the same article (a redirect): keep it once.
      .filter((a, i, list) => list.findIndex(b => b.link === a.link) === i);

    // Score each passage: how well its words match (BM25), plus how well its whole
    // article matched the search, plus a small bonus for the opening summary of the
    // best articles (key facts such as dates and places are usually there).
    const bestArticle = Math.max(...articles.map(a => a.searchScore), 1e-9);
    const all = articles.flatMap((a, rank) => splitPassages(a.text).map((p, i) => ({
      ...p, title: a.title, bookTitle: a.bookTitle, link: a.link,
      articlePrior: a.searchScore / bestArticle, isLead: i === 0, articleRank: rank })));
    const ranked = rankPassages(all, [question, question, ...keywords].join(' '));
    const bestBm25 = Math.max(...ranked.map(p => p.score), 1e-9);
    const howTo = HOW_TO_QUESTION.test(question);
    for (const p of ranked) {
      p.bm25 = p.score;
      p.score = 0.6 * (p.bm25 / bestBm25) + 0.4 * p.articlePrior + (p.isLead && p.articleRank < 3 ? 0.15 : 0)
        + (howTo && p.bm25 > 0 && HOW_TO_SECTION.test(p.section || '') ? 0.25 : 0);
    }
    ranked.sort((x, y) => y.score - x.score);
    // Keep variety: at most a few passages from any one article. Drop passages that match
    // nothing, unless they open one of the best articles.
    const perArticle = new Map();
    const passages = ranked.filter(p => p.bm25 > 0 || (p.isLead && p.articleRank < 3)).filter(p => {
      const n = (perArticle.get(p.link) || 0) + 1;
      perArticle.set(p.link, n);
      return n <= MAX_PASSAGES_PER_ARTICLE;
    });
    return { articles, passages };
  }
}

function normLink(link) {
  try { return decodeURI(link).replace(/#.*$/, ''); } catch { return link.replace(/#.*$/, ''); }
}
function truncateWords(text, n) { return text.split(/(\s+)/).slice(0, n * 2).join(''); }

// Combine the caller's Stop signal with a time limit.
function anySignal(signal, ms) {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

module.exports = { KiwixRetriever };
