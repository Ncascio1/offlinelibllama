// A simple, predictable check: does the answer actually come from the passages?
//
// Small AIs sometimes fill gaps from their own memory, even when told not to.
// For each sentence of the answer we look at its meaningful words and count how
// many appear anywhere in the passages the AI was given. Sentences where most
// words are missing are "unsupported". If too many are, the app shows a warning.
// This is a word check, not more AI: it is fast and never changes the answer.
'use strict';
const { terms } = require('./passages');

const MIN_WORDS = 4;            // ignore very short sentences ("Here's how:")
const SENTENCE_SUPPORT = 0.6;   // share of a sentence's words that must appear in the passages
const ANSWER_UNSUPPORTED = 0.3; // warn if more than this share of sentences is unsupported

function sentencesOf(answer) {
  return answer
    .replace(/\[\d+\]/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/**
 * @param {string} answer
 * @param {string[]} passageTexts  everything the AI was given
 * @returns {{ checked: number, unsupported: string[], warn: boolean }}
 */
function checkGrounding(answer, passageTexts) {
  const known = new Set(terms(passageTexts.join(' ')));
  let checked = 0;
  const unsupported = [];
  for (const s of sentencesOf(answer)) {
    // Sentences that talk about the library itself are not facts to check.
    if (/library|passage|does not (seem to )?cover|do not (contain|cover|provide)|not mention/i.test(s)) continue;
    const w = [...new Set(terms(s))].filter(t => !/^\d+$/.test(t));
    if (w.length < MIN_WORDS) continue;
    checked++;
    const found = w.filter(t => known.has(t)).length;
    if (found / w.length < SENTENCE_SUPPORT) unsupported.push(s);
  }
  return { checked, unsupported, warn: checked > 0 && unsupported.length / checked > ANSWER_UNSUPPORTED };
}

// How much of a sentence's meaningful words appear in one source's passages (0..1).
function support(sentence, sourceTerms) {
  const w = [...new Set(terms(sentence.replace(/\[\d+\]/g, ' ')))].filter(t => !/^\d+$/.test(t));
  if (!w.length) return 1;
  return w.filter(t => sourceTerms.has(t)).length / w.length;
}

/**
 * Citation repair: the small AI sometimes writes [1] when the fact came from [3].
 * For each sentence with citations, if the cited source supports it poorly but
 * another source supports it clearly better, the number is replaced.
 * @param {string} answer
 * @param {Array<{n:number, title:string, passages:Array<{text:string, section?:string}>}>} sources
 * @returns {{ text: string, changes: number }}
 */
function repairCitations(answer, sources) {
  const termsOf = new Map(sources.map(s => [s.n, new Set(terms(`${s.title} ${s.passages.map(p => `${p.section || ''} ${p.text}`).join(' ')}`))]));
  let changes = 0;
  // Work line by line, then sentence by sentence, keeping the original text otherwise.
  const text = answer.split('\n').map(line => line.split(/(?<=[.!?])(\s+)/).map(piece => {
    const cites = [...piece.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
    if (!cites.length || terms(piece).length < 3) return piece;
    const best = [...termsOf.entries()].map(([n, t]) => ({ n, s: support(piece, t) })).sort((a, b) => b.s - a.s)[0];
    return piece.replace(/\[(\d+)\]/g, (m, d) => {
      const n = Number(d);
      const own = termsOf.has(n) ? support(piece, termsOf.get(n)) : 0;
      if (best && best.n !== n && best.s >= SENTENCE_SUPPORT && best.s - own >= 0.2) { changes++; return `[${best.n}]`; }
      return m;
    });
  }).join('')).join('\n');
  return { text: text.replace(/(\[\d+\])\1+/g, '$1'), changes };
}

module.exports = { checkGrounding, repairCitations, sentencesOf, SENTENCE_SUPPORT, ANSWER_UNSUPPORTED };
