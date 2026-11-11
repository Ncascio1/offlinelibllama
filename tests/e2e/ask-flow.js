// End-to-end test of "Ask the AI" with a real model.
// Usage: node tests/e2e/ask-flow.js "<drive with app>" "<drive with real model>" "<screenshot folder>"
// (The first drive provides the app program; the second is the drive it runs on.)
'use strict';
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const [APP_DRIVE, DRIVE, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(APP_DRIVE, '_system', 'app', 'electron');
const extraArgs = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(250); } return null; }

(async () => {
  const app = await electron.launch({ executablePath: exe, args: extraArgs, env: { ...process.env, OL_DRIVE_ROOT: DRIVE } });
  const pages = () => app.context().pages();
  const bar = await waitFor(() => pages().find(p => p.url().includes('bar.html')), 20000);
  const content = await waitFor(() => pages().find(p => p.url().includes('home.html')), 20000);
  const t0 = Date.now();
  const ready = await waitFor(() => content.evaluate(() => window.ol.getState().then(s => s.ai.state === 'ready' && s.library.state === 'ready')), 180000);
  check('library and AI ready', !!ready, `${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const lastTurn = () => content.evaluate(() => window.ol.askGet().then(d => d.turns[d.turns.length - 1]));
  const waitDone = async (ms = 240000) => waitFor(async () => { const t = await lastTurn(); return t && t.state !== 'working' && t; }, ms);

  // 1. Ask from the Home page
  await content.fill('#question', 'Where and when was Ray Charles born?');
  const tAsk = Date.now();
  await content.click('.ask button');
  await content.waitForURL(/ask\.html/);
  const statusSeen = await waitFor(() => content.textContent('.working'), 20000);
  check('Ask page shows what the AI is doing', !!statusSeen, statusSeen || '');
  const firstWord = await waitFor(async () => { const t = await lastTurn(); return t && t.answer.length > 0 && Date.now(); }, 240000);
  const t1 = await waitDone();
  check('answer arrives', !!t1 && t1.state === 'done', t1 ? `first words after ${((firstWord - tAsk) / 1000).toFixed(1)} s, finished after ${((Date.now() - tAsk) / 1000).toFixed(1)} s` : 'timeout');
  check('answer is correct and grounded (Albany, Georgia, 1930)', !!t1 && /Albany/.test(t1.answer) && /1930/.test(t1.answer), t1 && t1.answer.slice(0, 120));
  check('answer shows at least one source', !!t1 && t1.sources.length >= 1, t1 && t1.sources.map(s => s.title).join(', '));
  check('the source is the Ray Charles article', !!t1 && t1.sources.some(s => s.title === 'Ray Charles'));
  await sleep(500);
  await content.screenshot({ path: path.join(OUT, '1-answer.png'), fullPage: true });

  // 2. Open a source inside the app, then come back
  await content.click('button.source');
  await waitFor(() => content.url().includes('/viewer#'), 15000);
  check('source opens inside the app', content.url().includes('/viewer#wikipedia_en_ray-charles'), content.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, ''));
  await sleep(2000);
  await content.screenshot({ path: path.join(OUT, '2-source-opened.png') });
  await bar.click('#back');
  await content.waitForURL(/ask\.html/, { timeout: 10000 }).catch(() => {});
  await waitFor(() => content.$('.turn'), 5000);
  check('Back returns to the conversation, still there', (await content.$$('.turn')).length === 1);

  // 3. Follow-up question
  await content.fill('#question', 'What instruments did he play?');
  await content.click('#send');
  await waitFor(async () => (await content.evaluate(() => window.ol.askGet().then(d => d.turns.length))) === 2, 5000);
  const t2 = await waitDone();
  check('follow-up understands "he" = Ray Charles', !!t2 && /piano/i.test(t2.answer), t2 && t2.answer.slice(0, 120).replace(/\n/g, ' '));
  await content.screenshot({ path: path.join(OUT, '3-follow-up.png'), fullPage: true });

  // 4. Stop in the middle of an answer
  await content.fill('#question', 'Explain the different kinds of bowline knots and what each one is used for.');
  await content.click('#send');
  // Wait until words are arriving, then press Stop while it is still writing.
  await waitFor(async () => { const t = await lastTurn(); return t && t.question.startsWith('Explain') && t.state === 'working' && t.answer.length > 20; }, 240000);
  const stopVisible = await content.isVisible('#stop');
  await content.click('#stop');
  const t3 = await waitDone(20000);
  check('Stop button appears while answering and stops it', stopVisible && !!t3 && t3.state === 'stopped', t3 && t3.state);
  check('Ask button comes back after Stop', await waitFor(() => content.isVisible('#send'), 5000));
  await content.screenshot({ path: path.join(OUT, '4-stopped.png'), fullPage: true });

  // 5. New question clears the conversation
  await content.click('#reset');
  await waitFor(async () => (await content.$$('.turn')).length === 0, 5000);
  check('New question clears the conversation', (await content.$$('.turn')).length === 0);

  // 6. A question the books don't cover
  await content.fill('#question', 'How do I purify drinking water?');
  await content.click('#send');
  await sleep(500);
  const t4 = await waitDone();
  check('says plainly when the library does not cover it', !!t4 && /does not seem to cover/i.test(t4.answer), t4 && t4.answer.slice(0, 100));
  check('no sources shown for "not covered"', !!t4 && t4.sources.length === 0);
  await content.screenshot({ path: path.join(OUT, '5-not-covered.png'), fullPage: true });

  // 7. Privacy: the questions must not appear in the log file
  const logText = fs.readFileSync(path.join(DRIVE, '_system', 'logs', 'app.log'), 'utf8');
  check('questions are never written to the log', !/Ray Charles born|instruments|purify/i.test(logText));
  check('no internet requests were attempted', !/blocked request/.test(logText));

  const closed = app.waitForEvent('close', { timeout: 20000 }).then(() => true, () => false);
  await bar.click('#shutdown'); await bar.click('#yes');
  check('shuts down cleanly', await closed);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ASK FLOW CRASHED:', e); process.exit(2); });
