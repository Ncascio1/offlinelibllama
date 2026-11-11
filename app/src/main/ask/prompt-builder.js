// Build what the AI reads for an answer, and make sure it fits.
//
// The AI has a fixed "memory window" (context): 4096 tokens on the small tier.
// Everything must fit inside it: the rules, the passages, a little earlier
// conversation, the question, AND room for the answer. We fill passages best
// first until the budget is used, then check the exact size with the AI's own
// counter and drop passages if needed. It never overflows.
'use strict';

// Rough size guess used while choosing passages (English is ~4 characters per
// token; 3.5 is deliberately cautious). The exact count is checked afterwards.
const estimateTokens = s => Math.ceil(s.length / 3.5);
const PER_MESSAGE_OVERHEAD = 8; // chat formatting tokens per message

const SYSTEM_PROMPT = [
  'You are the assistant in an offline library. You answer ONLY from the library passages the user gives you.',
  'Rules:',
  '- Use only facts that are written in the passages. Never add steps, numbers, names or advice from your own knowledge.',
  '- If the passages answer only part of the question, give that part and say plainly what the library does not cover.',
  '- If the passages do not answer the question at all, reply exactly: "The library does not seem to cover this."',
  '- Put the passage number in square brackets right after each fact, like [1] or [2][3].',
  '- Write clearly for a general reader: short paragraphs, or numbered steps when the passages describe steps.',
  '- For medical, first aid or safety topics, end with one sentence telling the reader to check the cited articles and to get professional help if they can.',
].join('\n');

// The reminder placed right after the passages (small AIs follow rules best when they are close to the question).
const REMINDER = 'Answer the question using only the passages above, with [number] citations. If they do not contain the answer, say so.';

const SAFETY_WORDS = /\b(bleed|bleeding|wound|burn|burns|fracture|broken bone|poison|poisoning|bite|bitten|sting|snake|spider|allerg|anaphyla|cpr|resuscitat|choking|heart attack|stroke|seizure|overdose|dose|dosage|medicine|medication|drug|pills?|antibiotic|infection|fever|pregnan|birth|baby|infant|hypotherm|heat ?stroke|dehydrat|unconscious|shock|injur|first aid|wild (plants?|mushrooms?)|mushroom|edible|toxic|carbon monoxide|gas leak|electric|explosive|firearm|gun|chainsaw|purif|drinking water|boil water|disinfect|bleach)\w*/i;

function isSafetyTopic(text) { return SAFETY_WORDS.test(text); }

/**
 * Budget numbers for a given context size.
 * Answer room and passage cap grow with bigger tiers; the passage cap also
 * keeps the wait before the first word reasonable on slow computers.
 */
function budgetFor(contextSize) {
  const answer = contextSize >= 8192 ? 768 : 512;
  const passageCap = contextSize >= 8192 ? 3200 : 1500;
  const history = contextSize >= 8192 ? 700 : 350;
  return { contextSize, answer, passageCap, history, margin: 64 };
}

// Group passages by article: each article gets one source number.
function numberSources(passages) {
  const sources = [];
  const byLink = new Map();
  for (const p of passages) {
    let s = byLink.get(p.link);
    if (!s) { s = { n: sources.length + 1, title: p.title, bookTitle: p.bookTitle, link: p.link, passages: [] }; byLink.set(p.link, s); sources.push(s); }
    s.passages.push(p);
  }
  return sources;
}

function passagesBlock(sources) {
  return sources.map(s => `[${s.n}] ${s.title} (from ${s.bookTitle})\n` +
    s.passages.map(p => (p.section ? `(${p.section}) ` : '') + p.text).join('\n...\n')).join('\n\n');
}

// Earlier turns, newest kept first, trimmed to the history budget.
function historyMessages(history, maxTokens) {
  const out = [];
  let used = 0;
  for (const t of history.slice().reverse()) {
    const answer = t.answer.length > 900 ? t.answer.slice(0, 900) + '…' : t.answer;
    const cost = estimateTokens(t.question + answer) + 2 * PER_MESSAGE_OVERHEAD;
    if (used + cost > maxTokens) break;
    out.unshift({ role: 'user', content: t.question }, { role: 'assistant', content: answer });
    used += cost;
  }
  return out;
}

function assemble(question, sources, history, budget) {
  const block = sources.length ? passagesBlock(sources) : '(no passages found)';
  const user = `Library passages:\n\n${block}\n\nQuestion: ${question}\n\n${REMINDER}`;
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...historyMessages(history, budget.history), { role: 'user', content: user }];
}

const messagesSize = msgs => msgs.reduce((s, m) => s + estimateTokens(m.content) + PER_MESSAGE_OVERHEAD, 0);

/**
 * @param {object} o
 * @param {string} o.question
 * @param {Array}  o.passages     ranked best first
 * @param {Array}  o.history      [{ question, answer }]
 * @param {number} o.contextSize
 * @param {function} [o.countTokens]  async exact counter; falls back to the estimate
 * @returns {Promise<{ messages, sources, promptTokens, maxAnswerTokens }>}
 */
async function buildAnswerPrompt({ question, passages, history = [], contextSize, countTokens }) {
  const budget = budgetFor(contextSize);
  const q = question.length > 1500 ? question.slice(0, 1500) : question;

  // 1. Choose passages by estimate.
  const fixed = messagesSize(assemble(q, [], history, budget));
  const room = Math.min(budget.passageCap, contextSize - budget.answer - budget.margin - fixed);
  const chosen = [];
  let used = 0;
  for (const p of passages) {
    const cost = estimateTokens(p.text) + 12;
    if (used + cost > room) continue; // try smaller ones further down
    chosen.push(p); used += cost;
  }

  // 2. Check the exact size; drop the weakest passage until it fits.
  for (;;) {
    const sources = numberSources(chosen);
    const messages = assemble(q, sources, history, budget);
    const text = messages.map(m => m.content).join('\n');
    let size;
    try { size = countTokens ? (await countTokens(text)) + messages.length * PER_MESSAGE_OVERHEAD : messagesSize(messages); }
    catch { size = messagesSize(messages); }
    const maxAnswerTokens = Math.min(budget.answer, contextSize - size - budget.margin);
    if (maxAnswerTokens >= 200 || chosen.length === 0) {
      return { messages, sources, promptTokens: size, maxAnswerTokens: Math.max(64, maxAnswerTokens) };
    }
    chosen.pop();
  }
}

module.exports = { buildAnswerPrompt, budgetFor, numberSources, isSafetyTopic, estimateTokens, SYSTEM_PROMPT, REMINDER };
