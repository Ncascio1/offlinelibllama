'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extractText } = require('../../app/src/main/ask/text-extract');
const { splitPassages, rankPassages, stem, PASSAGE_WORDS } = require('../../app/src/main/ask/passages');
const kw = require('../../app/src/main/ask/keywords');
const { checkGrounding, repairCitations } = require('../../app/src/main/ask/grounding');
const { buildAnswerPrompt, isSafetyTopic, budgetFor } = require('../../app/src/main/ask/prompt-builder');
const { KiwixRetriever } = require('../../app/src/main/ask/kiwix-retriever');

const fx = name => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'kiwix-3.8.1', name), 'utf8');

// ---------- text extraction ----------
test('extract: real Wikipedia page becomes clean text', () => {
  const { title, text } = extractText(fx('article-Bowline.html'));
  assert.strictEqual(title, 'Bowline');
  assert.match(text, /The bowline .* is an ancient and simple knot/);
  assert.match(text, /^## Usage$/m);
  assert.ok(!/<[a-z]/i.test(text), 'no HTML tags left');
  assert.ok(!/\[\d+\]/.test(text), 'no footnote markers');
  assert.ok(!/^## (References|External links|See also)$/m.test(text), 'end sections dropped');
  assert.ok(!/function\s*\(|window\./.test(text), 'no script text');
  assert.ok(text.length < 15000, `much shorter than the page (${text.length} chars)`);
});

test('extract: entities, lists and dropped sections', () => {
  const html = `<html><head><title>Water &amp; you</title></head><body>
    <h1>Water &amp; you</h1><p>Boil water for 1&nbsp;minute<sup class="reference">[3]</sup>.</p>
    <ul><li>Filter it</li><li>Boil it</li></ul>
    <script>alert(1)</script><style>p{}</style>
    <table class="navbox"><tr><td>Navigation junk</td></tr></table>
    <h2>See also</h2><p>Other stuff</p><h2>Storage</h2><p>Keep it covered.</p></body></html>`;
  const { title, text } = extractText(html);
  assert.strictEqual(title, 'Water & you');
  assert.match(text, /Boil water for 1 minute\./);
  assert.match(text, /- Filter it/);
  assert.ok(!/alert|Navigation junk|Other stuff/.test(text));
  assert.match(text, /## Storage\n\nKeep it covered\./, 'sections after a dropped one come back');
});

// ---------- passages ----------
test('split: passages keep their section and stay a sensible size', () => {
  const { text } = extractText(fx('article-Bowline.html'));
  const ps = splitPassages(text);
  assert.ok(ps.length >= 5);
  assert.ok(ps.every(p => p.words <= 230), 'no passage is huge');
  assert.ok(ps.some(p => p.section === 'Usage'));
  const long = 'Sentence number one is here. '.repeat(200);
  const parts = splitPassages(long);
  assert.ok(parts.length > 3 && parts.every(p => p.words <= PASSAGE_WORDS + 10), 'long paragraph cut at sentences');
});

test('rank: BM25 puts the relevant passage first', () => {
  const ps = [
    { title: 'Bread', text: 'Bread is baked from flour, water and yeast.' },
    { title: 'Water purification', section: 'Boiling', text: 'Boiling water for one minute kills most germs. At high altitude boil for three minutes.' },
    { title: 'Rope', text: 'Rope is made of fibres twisted together.' },
  ];
  const r = rankPassages(ps, 'how long should I boil water to purify it');
  assert.strictEqual(r[0].title, 'Water purification');
  assert.strictEqual(r[2].score, 0);
});

test('stemming joins word forms', () => {
  for (const [a, b] of [['tying', 'tie'], ['knots', 'knot'], ['boiling', 'boil'], ['purified', 'purify'], ['bitten', 'bite'], ['berries', 'berry'], ['running', 'run']])
    assert.strictEqual(stem(a), stem(b), `${a} ~ ${b}`);
  assert.strictEqual(stem('virus'), 'virus');
  assert.strictEqual(stem('moss'), 'moss');
});

// ---------- keywords ----------
test('keywords: fallback strips filler words', () => {
  assert.deepStrictEqual(kw.fallbackKeywords('How do I tie a bowline knot?'), ['tie', 'bowline', 'knot']);
  assert.deepStrictEqual(kw.fallbackKeywords('What should I do if someone is bleeding?'), ['bleeding']);
});
test('keywords: parse the AI reply', () => {
  assert.deepStrictEqual(kw.parseKeywordReply('Keywords: bowline, knot, "tying"'), ['bowline', 'knot', 'tying']);
  assert.deepStrictEqual(kw.parseKeywordReply('\nsnakebite, first aid\nExtra explanation here'), ['snakebite', 'first aid']);
  assert.deepStrictEqual(kw.parseKeywordReply(''), []);
});
test('keywords: guessed answers are dropped, one useful new word allowed', () => {
  assert.deepStrictEqual(kw.filterKeywords(['ray charles', 'georgia', '1930'], 'Where and when was Ray Charles born?'), ['ray charles', 'georgia']);
  assert.deepStrictEqual(kw.filterKeywords(['bowline', 'knot', 'ray charles'], 'Where was Ray Charles born?'), ['bowline', 'ray charles']);
  assert.deepStrictEqual(kw.filterKeywords(['snakebite', 'first aid', 'snake'], 'What do I do if a snake bites me?'), ['snakebite', 'snake']);
});
test('keywords: follow-up questions are recognised', () => {
  assert.ok(kw.isFollowUp('What instruments did he play?'));
  assert.ok(kw.isFollowUp('And for children?'));
  assert.ok(kw.isFollowUp('Why?'));
  assert.ok(!kw.isFollowUp('Where and when was Ray Charles born?'));
  assert.ok(!kw.isFollowUp('How do I purify drinking water?'));
  const p = kw.keywordPrompt('Where was Ray Charles born?', [{ question: 'How do I tie a bowline?' }]);
  assert.ok(!p[1].content.includes('bowline'), 'unrelated earlier question not shown');
  const f = kw.keywordPrompt('What did he play?', [{ question: 'Who was Ray Charles?' }]);
  assert.ok(f[1].content.includes('Ray Charles'), 'earlier question shown for a follow-up');
});

// ---------- grounding ----------
const SRC = [
  { n: 1, title: 'Bowline', passages: [{ text: 'The bowline forms a fixed loop at the end of a rope. It is used in sailing and rescue.' }] },
  { n: 2, title: 'Ray Charles', passages: [{ text: 'Ray Charles was born in Albany, Georgia, on September 23, 1930.' }] },
];
test('grounding: supported answer passes, invented answer warns', () => {
  const ok = checkGrounding('The bowline forms a fixed loop at the end of a rope [1]. It is used in sailing and rescue [1].', SRC.flatMap(s => s.passages.map(p => p.text)));
  assert.strictEqual(ok.warn, false);
  const bad = checkGrounding('Wrap the rope three times around the oak tree trunk. Then pull the lever firmly toward your chest. Finally soak everything overnight in salted vinegar.', SRC.flatMap(s => s.passages.map(p => p.text)));
  assert.strictEqual(bad.warn, true);
  assert.strictEqual(bad.unsupported.length, 3);
});
test('grounding: "not covered" sentences are not counted as invented facts', () => {
  const g = checkGrounding('The library does not seem to cover this.', ['anything']);
  assert.strictEqual(g.checked, 0); assert.strictEqual(g.warn, false);
});
test('citation repair: wrong number is corrected, right number kept', () => {
  const r = repairCitations('Ray Charles was born in Albany, Georgia [1]. The bowline forms a fixed loop [1].', SRC);
  assert.strictEqual(r.text, 'Ray Charles was born in Albany, Georgia [2]. The bowline forms a fixed loop [1].');
  assert.strictEqual(r.changes, 1);
});

// ---------- prompt budget ----------
const passage = (i, words = 120) => ({ link: `/content/b/A${i % 4}`, title: `Article ${i % 4}`, bookTitle: 'Book', section: '', text: `word${i} `.repeat(words).trim() });

test('budget: the prompt never overflows the memory window (estimate)', async () => {
  for (const ctx of [2048, 4096, 8192]) {
    const passages = Array.from({ length: 60 }, (_, i) => passage(i));
    const history = Array.from({ length: 6 }, () => ({ question: 'q '.repeat(50), answer: 'a '.repeat(600) }));
    const b = await buildAnswerPrompt({ question: 'What is this?', passages, history, contextSize: ctx });
    assert.ok(b.promptTokens + b.maxAnswerTokens <= ctx, `ctx ${ctx}: ${b.promptTokens} + ${b.maxAnswerTokens}`);
    assert.ok(b.promptTokens <= ctx - 200, 'room left for an answer');
    assert.ok(b.sources.length > 0);
  }
});
test('budget: an exact counter that disagrees with the estimate still cannot overflow', async () => {
  const passages = Array.from({ length: 40 }, (_, i) => passage(i));
  // A pessimistic counter: twice the estimate. Passages must be dropped until it fits.
  const countTokens = async text => Math.ceil(text.length / 1.75);
  const b = await buildAnswerPrompt({ question: 'Q?', passages, contextSize: 4096, countTokens });
  assert.ok(b.promptTokens + b.maxAnswerTokens <= 4096, `${b.promptTokens} + ${b.maxAnswerTokens}`);
});
test('budget: small tier keeps the passage text modest for speed', () => {
  assert.strictEqual(budgetFor(4096).passageCap, 1500);
  assert.ok(budgetFor(8192).passageCap > budgetFor(4096).passageCap);
});
test('budget: sources are numbered per article, passages grouped', async () => {
  const b = await buildAnswerPrompt({ question: 'Q?', passages: [passage(0, 20), passage(1, 20), passage(4, 20)], contextSize: 4096 });
  assert.deepStrictEqual(b.sources.map(s => [s.n, s.title, s.passages.length]), [[1, 'Article 0', 2], [2, 'Article 1', 1]]);
  assert.match(b.messages[b.messages.length - 1].content, /\[1\] Article 0 \(from Book\)/);
});
test('safety topics are recognised', () => {
  for (const q of ['How do I stop bleeding?', 'Is this mushroom edible?', 'snake bite treatment', 'How much bleach to disinfect water?'])
    assert.ok(isSafetyTopic(q), q);
  assert.ok(!isSafetyTopic('Who was Ray Charles?'));
});

// ---------- retriever (with a fake Kiwix) ----------
test('retriever: searches text books only, merges results, follows redirects once', async () => {
  const calls = [];
  const pages = {
    '/content/kn/Bowline': '<html><head><title>Bowline</title></head><body><p>The bowline makes a fixed loop at the end of a rope.</p><h2>Tying</h2><p>Make a small loop, pass the end up through it, around the standing part and back down.</p></body></html>',
  };
  const fakeFetch = async url => {
    const u = url.replace('http://k', '');
    calls.push(u);
    if (u.startsWith('/search')) {
      return { ok: true, url, text: async () => `<rss><channel><opensearch:totalResults>2</opensearch:totalResults>
        <item><title>Bowline</title><link>/content/kn/Bowline</link><description>x</description><book><title>Knots</title></book><wordCount>10</wordCount></item>
        <item><title>Bowline knot</title><link>/content/kn/Bowline_knot</link><description>x</description><book><title>Knots</title></book><wordCount>10</wordCount></item></channel></rss>` };
    }
    if (u.startsWith('/suggest')) return { ok: true, url, json: async () => [] };
    const path = u === '/content/kn/Bowline_knot' ? '/content/kn/Bowline' : u; // a redirect
    return { ok: true, url: 'http://k' + path, text: async () => pages[path] };
  };
  const books = [
    { id: 'k1', slug: 'kn', title: 'Knots', displayTitle: 'Knots', isMap: false, hasFullTextIndex: true },
    { id: 'm1', slug: 'osm-x', title: 'OSM - X', displayTitle: 'X', isMap: true, hasFullTextIndex: true },
  ];
  const r = new KiwixRetriever({ baseUrl: 'http://k', books, log: { warn() {}, info() {} }, fetchImpl: fakeFetch });
  const { articles, passages } = await r.retrieve({ question: 'How do I tie a bowline?', keywords: ['bowline'] });
  assert.ok(!calls.some(c => c.includes('m1') || c.includes('osm-x')), 'map book never searched');
  assert.strictEqual(articles.length, 1, 'redirect counted once');
  assert.strictEqual(passages[0].section, 'Tying', 'how-to section ranked first');
});
test('retriever: search plan tries all words, the question words, then fewer words', () => {
  const plan = KiwixRetriever.searchPlan(['bowline', 'knot', 'climbing'], ['tie', 'bowline', 'knot']).map(p => p.q);
  assert.deepStrictEqual(plan.slice(0, 3), ['bowline knot climbing', 'tie bowline knot', 'bowline knot']);
  assert.ok(plan.includes('bowline'));
});

test('retriever: PDFs and other non-web files are never fed to the AI as text', async () => {
  const fakeFetch = async url => {
    const u = url.replace('http://k', '');
    if (u.startsWith('/search')) return { ok: true, url, text: async () => '' };
    if (u.startsWith('/suggest')) return { ok: true, url, json: async () => [{ kind: 'path', value: 'Water guide', path: 'files/Water.pdf' }, { kind: 'path', value: 'Boiling', path: 'Boiling' }] };
    if (u.endsWith('.pdf')) return { ok: true, url, headers: new Map([['content-type', 'application/pdf']]), text: async () => '%PDF-1.4 binary water water water' };
    return { ok: true, url, headers: new Map([['content-type', 'text/html']]), text: async () => '<html><head><title>Boiling</title></head><body><p>Boil water for one minute to make it safe.</p></body></html>' };
  };
  const books = [{ id: 'w', slug: 'water', title: 'Water', isMap: false, hasFullTextIndex: false }];
  const r = new KiwixRetriever({ baseUrl: 'http://k', books, log: { warn() {}, info() {} }, fetchImpl: fakeFetch });
  const { articles, passages } = await r.retrieve({ question: 'How do I make water safe?', keywords: ['water'] });
  assert.deepStrictEqual(articles.map(a => a.title), ['Boiling']);
  assert.ok(!passages.some(p => p.text.includes('%PDF')));
});
