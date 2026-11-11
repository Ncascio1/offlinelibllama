// Top bar: buttons send commands; the main process sends back the current state.
'use strict';
const $ = id => document.getElementById(id);
const AI_SHORT = { starting: 'AI starting', ready: 'AI ready', off: 'AI off', failed: 'AI unavailable' };

for (const b of document.querySelectorAll('[data-cmd]')) {
  b.addEventListener('click', () => window.ol.command(b.dataset.cmd));
}

// Shut down asks once, so a stray click doesn't close everything.
$('shutdown').addEventListener('click', () => { $('shutdown').hidden = true; $('confirm').hidden = false; $('no').focus(); });
$('no').addEventListener('click', () => { $('confirm').hidden = true; $('shutdown').hidden = false; $('shutdown').focus(); });
$('yes').addEventListener('click', () => window.ol.command('shutdown'));

function render(s) {
  if (!s) return;
  $('back').disabled = !s.nav.canGoBack;
  $('forward').disabled = !s.nav.canGoForward;
  for (const b of document.querySelectorAll('[data-section]')) {
    if (b.dataset.section === s.nav.section) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (s.nav.section === 'home') $('home').setAttribute('aria-current', 'page'); else $('home').removeAttribute('aria-current');
  const ai = $('ai');
  ai.className = 'ai ' + s.ai.state;
  $('ai-text').textContent = AI_SHORT[s.ai.state] || '';
  ai.title = s.ai.message;
}

let noticeTimer = null;
window.ol.onNotice(n => {
  const el = $('notice');
  clearTimeout(noticeTimer);
  el.textContent = n.text || '';
  el.title = n.text || '';
  el.className = `bar-notice ${n.kind || 'info'}`;
  el.hidden = !n.text;
  if (n.text && n.ms) noticeTimer = setTimeout(() => { el.hidden = true; }, n.ms);
});

window.ol.onState(render);
window.ol.getState().then(render);
