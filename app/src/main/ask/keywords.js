// Search keywords for a question.
//
// The AI is asked first (it understands "what do I do if I'm bitten by a snake"
// → "snakebite first aid"). If the AI is slow, busy or gives junk, we fall back
// to simply removing filler words from the question.
'use strict';
const { words, terms, STOP } = require('./passages');

const MAX_KEYWORDS = 5;

// Fallback: the question minus filler words, longest (usually most specific) first,
// but keeping the original order for the first few.
function fallbackKeywords(question) {
  const seen = new Set();
  const kept = words(question).filter(w => w.length > 1 && !STOP.has(w) && !seen.has(w) && seen.add(w));
  return kept.slice(0, MAX_KEYWORDS);
}

// Read the AI's reply: expects one line of comma-separated keywords.
function parseKeywordReply(reply) {
  if (!reply) return [];
  const line = reply.split('\n').map(l => l.trim()).find(l => l && !/^(keywords?|search)\s*:?\s*$/i.test(l)) || '';
  const cleaned = line.replace(/^(keywords?|search terms?)\s*:\s*/i, '');
  const parts = cleaned.split(/[,;]|\s+-\s+/).map(p => p.replace(/["'*()[\].]/g, '').trim().toLowerCase()).filter(Boolean);
  const seen = new Set();
  return parts.filter(p => p.length > 1 && p.length < 40 && p.split(/\s+/).length <= 3 && !seen.has(p) && seen.add(p)).slice(0, MAX_KEYWORDS);
}

// Does this question lean on the previous one? ("what about it?", "and for children?")
function isFollowUp(question) {
  return /\b(it|its|that|this|those|these|they|them|their|he|she|his|her|there|then|same|instead)\b/i.test(question) ||
    /^\s*(and|or|but|also|what about|how about|why|so)\b/i.test(question) ||
    words(question).filter(w => !STOP.has(w)).length <= 2;
}

// Keep only keywords grounded in the question (or the earlier question for a follow-up).
// The small AI sometimes slips guessed answers into its keywords ("Georgia, 1930");
// those are dropped. At most one genuinely new word is allowed (a useful synonym).
function filterKeywords(keywords, allowedText) {
  const allowed = new Set(terms(allowedText));
  let newOnes = 0;
  return keywords.filter(k => {
    const t = terms(k);
    if (t.length && t.every(x => allowed.has(x))) return true;
    if (newOnes === 0 && t.length === 1 && !/^\d+$/.test(t[0])) { newOnes++; return true; }
    return false;
  });
}

// The instruction for the AI. Kept short: it runs before every answer.
// Earlier questions are only shown when the new question refers back to them.
function keywordPrompt(question, history = []) {
  const context = isFollowUp(question) ? history.slice(-1).map(t => `Earlier question: ${t.question}`).join('\n') : '';
  return [
    { role: 'system', content: 'You pick encyclopedia search words for a question. Copy the main topic words and names from the question, and add at most one closely related word. Never guess or include the answer. Reply with 2 to 4 short keywords, comma-separated, on one line, main topic first. No other text.' },
    { role: 'user', content: `${context ? context + '\n' : ''}Question: ${question}` },
  ];
}

module.exports = { fallbackKeywords, parseKeywordReply, keywordPrompt, filterKeywords, isFollowUp, MAX_KEYWORDS };
