// The Ask page: conversation with the AI, answers streamed word by word.
// All text goes in with textContent (never as HTML), so nothing in an answer
// can run as code.
'use strict';
const $ = id => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') el.addEventListener('click', v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

let busy = false;
let aiState = 'starting';

// ---- Turn the AI's plain text into paragraphs, lists, bold, and clickable [1] marks ----
function inline(text, turnId) {
  const frag = document.createDocumentFragment();
  // Split on **bold** and [n] citations, keep everything else as plain text.
  for (const part of text.split(/(\*\*[^*]+\*\*|\[\d+\])/g)) {
    if (!part) continue;
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    const cite = part.match(/^\[(\d+)\]$/);
    if (bold) frag.append(h('strong', {}, bold[1]));
    else if (cite) frag.append(h('button', { class: 'cite', title: `Open source ${cite[1]}`, 'aria-label': `Source ${cite[1]}`,
      onclick: () => window.ol.command('open-source', { turnId, n: Number(cite[1]) }) }, cite[1]));
    else frag.append(part);
  }
  return frag;
}

function renderAnswer(text, turnId) {
  const box = h('div', { class: 'answer-text' });
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) continue;
    const isList = lines.every(l => /^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/.test(l));
    if (isList) {
      const ordered = /^\s*\d+[.)]/.test(lines[0]);
      const list = h(ordered ? 'ol' : 'ul');
      for (const l of lines) list.append(h('li', {}, inline(l.replace(/^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/, ''), turnId)));
      box.append(list);
    } else {
      const p = h('p');
      lines.forEach((l, i) => { if (i) p.append(h('br')); p.append(inline(l.trim(), turnId)); });
      box.append(p);
    }
  }
  return box;
}

function renderTurn(t) {
  const el = h('article', { class: `turn ${t.state}`, 'data-id': t.id });
  el.append(h('p', { class: 'question' }, h('span', { class: 'who' }, 'You asked'), t.question));
  const answer = h('div', { class: 'answer', 'aria-live': t.state === 'working' ? 'polite' : 'off' });
  if (t.answer) answer.append(renderAnswer(t.answer, t.id));
  if (t.state === 'working') answer.append(h('p', { class: 'working', role: 'status' }, t.status || 'Working…'));
  el.append(answer);

  if (t.state !== 'working' && t.unverified) {
    el.append(h('div', { class: 'notice warn' },
      'Parts of this answer may not come from the library. Check the sources before relying on it.'));
  }
  if (t.state !== 'working' && t.safety && t.sources.length) {
    el.append(h('div', { class: 'notice warn' },
      'This is about health or safety. Check the cited articles, and get professional help if you can.'));
  }
  if (t.sources.length && t.state !== 'working') {
    el.append(h('h3', { class: 'sources-title' }, 'Sources'),
      h('ol', { class: 'sources' }, ...t.sources.map(s => h('li', { value: s.n },
        h('button', { class: 'source', onclick: () => window.ol.command('open-source', { turnId: t.id, n: s.n }) },
          h('strong', {}, s.title), h('span', {}, ` from ${s.bookTitle}`))))));
  }
  return el;
}

function renderConversation(data) {
  busy = data.busy;
  const list = $('turns');
  const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
  list.replaceChildren(...data.turns.map(renderTurn));
  $('empty').hidden = data.turns.length > 0;
  $('reset').hidden = data.turns.length === 0;
  updateButtons();
  if (nearBottom || busy) window.scrollTo(0, document.body.scrollHeight);
}

function updateButtons() {
  $('send').hidden = busy;
  $('stop').hidden = !busy;
  $('send').disabled = aiState !== 'ready';
}

function renderStatus(s) {
  if (!s) return;
  aiState = s.ai.state;
  const n = $('ai-notice');
  n.hidden = s.ai.state === 'ready';
  n.className = `notice ${s.ai.state === 'failed' ? 'bad' : 'warn'}`;
  n.textContent = s.ai.message;
  updateButtons();
}

function send() {
  const q = $('question').value.trim();
  if (!q || busy || aiState !== 'ready') return;
  window.ol.ask(q);
  $('question').value = '';
}

$('send').addEventListener('click', send);
$('stop').addEventListener('click', () => window.ol.askStop());
$('reset').addEventListener('click', () => { window.ol.askReset(); $('question').focus(); });
$('question').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

window.ol.onState(renderStatus);
window.ol.getState().then(renderStatus);
window.ol.onAsk(renderConversation);
window.ol.askGet().then(d => d && renderConversation(d));
$('question').focus();
