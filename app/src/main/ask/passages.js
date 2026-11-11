// Cut articles into passages and rank them against the question.
//
// Passages are built from whole paragraphs, about PASSAGE_WORDS long, each
// remembering the section heading it came from (useful context for the AI).
// Ranking uses BM25, the classic search-engine scoring: words that are rare
// across all passages and frequent in this passage count most.
'use strict';

const PASSAGE_WORDS = 130;
const MAX_PASSAGE_WORDS = 220;

// Very common words that say nothing about the topic.
const STOP = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by ' +
  'can could did do does doing done down during each few for from further had has have having he her here hers him his how i if in into ' +
  'is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such ' +
  'than that the their theirs them then there these they this those through to too under until up very was we were what when where ' +
  'which while who whom why will with would you your yours also may might must shall get got make made use used using way ways tell ' +
  'please thing things know want need someone something').split(' '));

function words(text) {
  return (text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+(?:'[a-z]+)?/g) || [])
    .map(w => w.replace(/'s$/, ''));
}

// Words whose endings don't follow the simple rules below.
const IRREGULAR = { tying: 'tie', tied: 'tie', ties: 'tie', untying: 'untie', untied: 'untie', dying: 'die', died: 'die',
  lying: 'lie', lies: 'lie', bitten: 'bite', bit: 'bite', bled: 'bleed', burnt: 'burn', ate: 'eat', eaten: 'eat',
  frozen: 'freeze', froze: 'freeze', children: 'child', women: 'woman', men: 'man', feet: 'foot', teeth: 'tooth',
  knives: 'knife', leaves: 'leaf', wolves: 'wolf', mice: 'mouse', geese: 'goose' };

// Light stemming so "knots"/"knot", "tying"/"tie", "purified"/"purify", "boiling"/"boil" match.
function stem(w) {
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3) return w;
  let s = w;
  if (/ies$/.test(s)) s = s.slice(0, -3) + 'y';          // berries -> berry
  else if (/ied$/.test(s)) s = s.slice(0, -3) + 'y';     // purified -> purify
  else if (/(?:ss|us|is)$/.test(s)) return s;            // moss, virus, tetanus, analysis
  else if (/(?:ches|shes|xes|sses)$/.test(s)) s = s.slice(0, -2); // matches -> match
  else if (/ing$/.test(s) && s.length > 5) s = s.slice(0, -3);    // boiling -> boil
  else if (/ed$/.test(s) && s.length > 4) s = s.slice(0, -2);     // boiled -> boil
  else if (/ly$/.test(s) && s.length > 5) s = s.slice(0, -2);
  else if (/s$/.test(s)) s = s.slice(0, -1);             // knots -> knot
  if (/(bb|dd|ff|gg|mm|nn|pp|rr|tt)$/.test(s)) s = s.slice(0, -1); // running -> runn -> run
  return s.length >= 2 ? s : w;
}

function terms(text) { return words(text).filter(w => !STOP.has(w)).map(stem); }

/** Split one article into passages: [{ section, text, words }] */
function splitPassages(articleText) {
  const out = [];
  let section = '';
  let buf = [];
  let count = 0;
  const flush = () => {
    if (count) out.push({ section, text: buf.join('\n\n'), words: count });
    buf = []; count = 0;
  };
  for (const block of articleText.split(/\n{2,}/)) {
    const head = block.match(/^## (.+)$/);
    if (head) { flush(); section = head[1].trim(); continue; }
    const n = block.split(/\s+/).filter(Boolean).length;
    if (n > MAX_PASSAGE_WORDS) {
      // A very long paragraph: cut it at sentence ends.
      flush();
      let part = [];
      let pc = 0;
      for (const sentence of block.split(/(?<=[.!?])\s+/)) {
        const sc = sentence.split(/\s+/).length;
        if (pc + sc > PASSAGE_WORDS && pc) { buf = [part.join(' ')]; count = pc; flush(); part = []; pc = 0; }
        part.push(sentence); pc += sc;
      }
      if (pc) { buf = [part.join(' ')]; count = pc; flush(); }
      continue;
    }
    if (count + n > PASSAGE_WORDS && count) flush();
    buf.push(block); count += n;
  }
  flush();
  return out;
}

/**
 * Rank passages for a query with BM25.
 * @param {Array<{text:string, title?:string, section?:string}>} passages
 * @param {string} query
 * @returns same objects with .score, best first (score 0 = no query word at all)
 */
function rankPassages(passages, query, { k1 = 1.2, b = 0.75 } = {}) {
  const q = [...new Set(terms(query))];
  if (!q.length || !passages.length) return passages.map(p => ({ ...p, score: 0 }));
  // Title and section words count too: a passage from "Bowline > Tying" is about bowlines.
  const docs = passages.map(p => terms(`${p.title || ''} ${p.section || ''} ${p.text}`));
  const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length || 1;
  const df = new Map(q.map(t => [t, docs.filter(d => d.includes(t)).length]));
  const N = docs.length;
  return passages.map((p, i) => {
    const d = docs[i];
    const tf = new Map();
    for (const t of d) if (df.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t) || 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / avg));
    }
    return { ...p, score };
  }).sort((a, b2) => b2.score - a.score);
}

module.exports = { splitPassages, rankPassages, terms, words, stem, STOP, PASSAGE_WORDS };
