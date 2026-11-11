// "Ask the AI": runs one question from start to finish and keeps the conversation.
//
// Steps for each question:
//  1. Search words: ask the AI for keywords (short, with a time limit);
//     if that fails, remove filler words from the question instead.
//  2. Search the books (the retriever) and pick the best passages.
//  3. Build the prompt within the AI's memory budget.
//  4. Stream the answer word by word. Stop works at any moment.
//
// The conversation lives here (not in the page), so leaving the Ask page and
// coming back shows it again, even while an answer is still being written.
'use strict';
const { LlmClient } = require('./llm-client');
const { fallbackKeywords, parseKeywordReply, keywordPrompt, filterKeywords, isFollowUp } = require('./keywords');
const { buildAnswerPrompt, isSafetyTopic } = require('./prompt-builder');
const { checkGrounding, repairCitations } = require('./grounding');

const KEYWORD_TIMEOUT_MS = 20000;
const MAX_TURNS_KEPT = 20;

const TEXT = {
  keywords: 'Choosing search words…',
  searching: 'Searching the library…',
  reading: n => `Reading ${n} article${n === 1 ? '' : 's'}…`,
  writing: 'Writing the answer…',
  notFound: 'The library does not seem to cover this. Try different words, or look in the Library yourself.',
  aiNotReady: 'The AI is not ready yet. Wait until the light at the top turns green, then ask again.',
  libraryNotReady: 'The library is not ready yet. Wait a moment, then ask again.',
  failed: 'The AI could not answer this time. Try again, or ask in a different way.',
  stopped: '(Stopped.)',
};

class AskService {
  /**
   * @param {object} o
   * @param {function} o.getAi        () => { baseUrl, apiKey, contextSize } | null when not ready
   * @param {function} o.getRetriever () => retriever | null when the library is not ready
   * @param {function} o.onChange     called with the turn whenever it changes
   */
  constructor({ getAi, getRetriever, log, onChange }) {
    Object.assign(this, { getAi, getRetriever, log, onChange });
    this.turns = [];
    this.controller = null;
    this.nextId = 1;
  }

  get busy() { return !!this.controller; }

  // A plain copy of the conversation for the page.
  snapshot() {
    return this.turns.map(t => ({ id: t.id, question: t.question, answer: t.answer, status: t.status, state: t.state,
      safety: t.safety, unverified: !!t.unverified, sources: t.sources.map(s => ({ n: s.n, title: s.title, bookTitle: s.bookTitle })) }));
  }

  reset() { this.stop(); this.turns = []; this.changed(null); }

  stop() { if (this.controller) this.controller.abort(); }

  changed(turn) { if (this.onChange) this.onChange(turn); }

  // Which article does source number n of a turn point to?
  sourceLink(turnId, n) {
    const t = this.turns.find(x => x.id === turnId);
    const s = t && t.sources.find(x => x.n === n);
    return s ? s.link : null;
  }

  async ask(question) {
    question = String(question || '').trim().slice(0, 2000);
    if (!question) return;
    if (this.busy) this.stop();

    const turn = { id: this.nextId++, question, answer: '', status: '', state: 'working', sources: [], safety: isSafetyTopic(question) };
    const history = this.turns.filter(t => t.state === 'done' && t.answer).map(t => ({ question: t.question, answer: t.answer }));
    this.turns.push(turn);
    if (this.turns.length > MAX_TURNS_KEPT) this.turns.shift();
    const finish = (state, answer) => { turn.state = state; if (answer !== undefined) turn.answer = answer; turn.status = ''; this.changed(turn); };
    const status = s => { turn.status = s; this.changed(turn); };

    const ai = this.getAi();
    if (!ai) return finish('error', TEXT.aiNotReady);
    const retriever = this.getRetriever();
    if (!retriever) return finish('error', TEXT.libraryNotReady);

    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    const llm = new LlmClient(ai);
    const t0 = Date.now();
    try {
      // 1. Search words
      status(TEXT.keywords);
      let keywords = [];
      try {
        const reply = await llm.complete(keywordPrompt(question, history), { maxTokens: 32, signal: AbortSignal.any([signal, AbortSignal.timeout(KEYWORD_TIMEOUT_MS)]) });
        const followUp = isFollowUp(question) && history.length;
        const allowed = followUp ? `${question} ${history[history.length - 1].question}` : question;
        keywords = filterKeywords(parseKeywordReply(reply), allowed);
      } catch (e) { if (signal.aborted) throw e; this.log.warn('keyword step failed, using fallback:', e.message); }
      if (!keywords.length) keywords = fallbackKeywords(isFollowUp(question) && history.length ? `${question} ${history[history.length - 1].question}` : question);
      this.log.info(`ask: ${keywords.length} search words after ${Date.now() - t0} ms`); // never log the question or its words

      // 2. Search the books
      status(TEXT.searching);
      const { articles, passages } = await retriever.retrieve({ question, keywords, signal });
      this.log.info(`ask: ${articles.length} articles, ${passages.length} matching passages after ${Date.now() - t0} ms`);
      if (!passages.length) return finish('done', TEXT.notFound);

      // 3. Fit within the AI's memory window
      // Earlier turns are only given to the AI when this question refers back to them.
      const relevantHistory = isFollowUp(question) ? history.slice(-2) : [];
      const built = await buildAnswerPrompt({ question, passages, history: relevantHistory, contextSize: ai.contextSize,
        countTokens: text => llm.countTokens(text, signal) });
      turn.sources = built.sources;
      status(TEXT.reading(built.sources.length));
      this.log.info(`ask: prompt ${built.promptTokens} tokens, ${built.sources.length} sources, answer up to ${built.maxAnswerTokens} tokens`);

      // 4. Stream the answer
      let first = true;
      const result = await llm.stream(built.messages, {
        maxTokens: built.maxAnswerTokens, signal,
        onToken: piece => {
          if (first) { first = false; turn.status = TEXT.writing; this.log.info(`ask: first word after ${Date.now() - t0} ms`); }
          turn.answer += piece;
          this.changed(turn);
        },
      });
      if (result.stopped) return finish('stopped', (turn.answer ? turn.answer + '\n\n' : '') + TEXT.stopped);
      // Sources: show the ones the answer cites. If it cites none but did answer,
      // show all it was given (the AI sometimes forgets the [1] marks). If it says
      // the library doesn't cover this, show none.
      const notCovered = /does not seem to cover this/i.test(turn.answer) && turn.answer.length < 200;
      // Fix citation numbers that point at the wrong source.
      const repaired = repairCitations(turn.answer, built.sources);
      if (repaired.changes) { this.log.info(`ask: corrected ${repaired.changes} citation number(s)`); turn.answer = repaired.text; }
      const cited = new Set([...turn.answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])));
      if (notCovered) turn.sources = [];
      else if (cited.size) turn.sources = turn.sources.filter(s => cited.has(s.n));
      // Safety net: warn if much of the answer can't be found in the passages.
      if (!notCovered) {
        const g = checkGrounding(turn.answer, built.sources.flatMap(s => s.passages.map(p => `${s.title} ${p.section || ''} ${p.text}`)));
        turn.unverified = g.warn;
        this.log.info(`ask: grounding check ${g.checked - g.unsupported.length}/${g.checked} sentences supported${g.warn ? ' -> warning shown' : ''}`);
      }
      this.log.info(`ask: done in ${Date.now() - t0} ms, ${result.usage ? result.usage.completion_tokens : '?'} answer tokens`);
      return finish('done', turn.answer.trim() || TEXT.failed);
    } catch (e) {
      if (signal.aborted) return finish('stopped', (turn.answer ? turn.answer + '\n\n' : '') + TEXT.stopped);
      this.log.error('ask failed:', e.message);
      return finish('error', TEXT.failed);
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
}

module.exports = { AskService, TEXT };
