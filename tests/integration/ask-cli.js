// Ask one question through the real pipeline (Kiwix + AI already running).
// Usage: node tests/integration/ask-cli.js <kiwixUrl> <aiUrl> <apiKey> <contextSize> "question"
'use strict';
const { parseCatalog } = require('../../app/src/main/kiwix-catalog');
const { KiwixRetriever } = require('../../app/src/main/ask/kiwix-retriever');
const { AskService } = require('../../app/src/main/ask/ask-service');
const [kiwixUrl, aiUrl, apiKey, ctx, ...q] = process.argv.slice(2);
const log = { info: m => process.stderr.write(`  · ${m}\n`), warn: m => process.stderr.write(`  ! ${m}\n`), error: m => process.stderr.write(`  X ${m}\n`) };
(async () => {
  const books = parseCatalog(await (await fetch(kiwixUrl + '/catalog/v2/entries?count=-1')).text());
  const retriever = new KiwixRetriever({ baseUrl: kiwixUrl, books, log });
  let last = '';
  const svc = new AskService({ getAi: () => ({ baseUrl: aiUrl, apiKey, contextSize: Number(ctx) }), getRetriever: () => retriever, log,
    onChange: t => { if (t && t.status !== last) { last = t.status; if (t.status) process.stderr.write(`  [${t.status}]\n`); } } });
  for (const question of q.join(' ').split(' || ')) {
    const t0 = Date.now();
    await svc.ask(question);
    const t = svc.turns[svc.turns.length - 1];
    console.log(`\nQ: ${question}\nA (${t.state}, ${((Date.now() - t0) / 1000).toFixed(1)} s): ${t.answer}\nSOURCES: ${t.sources.map(s => `[${s.n}] ${s.title} — ${s.link}`).join(' | ') || '(none)'}${t.safety ? '\n(safety note shown)' : ''}${t.unverified ? '\n(WARNING shown: parts may not come from the library)' : ''}\n`);
  }
})();
