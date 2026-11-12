// The AI engine: choose a model by memory, start llama-server, and watch it.
//
// Status values shown in the top bar:
//   'off'      the AI is not used on this PC (with a reason message)
//   'starting' loading the model (can take a few minutes from a slow drive)
//   'ready'    answering questions
//   'failed'   it could not start or it stopped; Library and Maps still work
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EngineProcess } = require('./processes');
const { selectModel } = require('./model-select');
const messages = require('./messages');

const sleep = ms => new Promise(r => setTimeout(r, ms));

class AiService {
  constructor({ exe, modelsDir, port, config, log, onStatus, totalMemory = os.totalmem() }) {
    Object.assign(this, { exe, modelsDir, port, config, log, onStatus, totalMemory });
    this.engine = null;
    this.apiKey = crypto.randomBytes(24).toString('hex'); // fresh password every launch
    this.status = { state: 'starting', message: messages.ai.starting };
    this.tier = null;
  }

  get baseUrl() { return `http://127.0.0.1:${this.port}`; }

  setStatus(state, message, extra = {}) {
    this.status = { state, message, ...extra };
    this.log.info('AI status:', state, '-', message);
    if (this.onStatus) this.onStatus(this.status);
  }

  // Never throws; reports everything through setStatus. Runs in the background.
  async start() {
    if (!this.config.aiEnabled) return this.setStatus('off', messages.ai.disabledByOwner);
    if (!fs.existsSync(this.exe)) return this.setStatus('failed', messages.ai.engineMissing);

    let files = [];
    try { files = fs.readdirSync(this.modelsDir); } catch {}
    const pick = selectModel(this.totalMemory, files, { forceTier: this.config.forceTier, contextSize: this.config.contextSize });
    this.log.info(`memory ${pick.ramGb.toFixed(1)} GB, model files: ${files.join(', ') || '(none)'}, choice: ${pick.tier ? pick.tier.name : pick.reason}`);
    if (!pick.tier) {
      const msg = { 'not-enough-memory': messages.ai.notEnoughMemory, 'no-model-files': messages.ai.noModel,
                    'forced-tier-missing': messages.ai.noModel }[pick.reason];
      return this.setStatus('off', msg);
    }
    this.tier = pick.tier;

    const args = [
      '-m', path.join(this.modelsDir, files.find(f => f.toLowerCase() === pick.tier.file)),
      '--host', '127.0.0.1', '--port', String(this.port),
      '-c', String(pick.tier.contextSize),
      '-np', '1',            // one conversation at a time: all memory goes to it
      '--no-webui',          // we never use llama.cpp's own web page
      '--offline',           // never try to download anything
      '--api-key', this.apiKey,
    ];
    if (this.config.aiThreads) args.push('-t', String(this.config.aiThreads));
    // Read the model file in one go (much faster from a USB stick, see config.js).
    // Older llama.cpp builds called this --no-mmap; b12239 uses --load-mode.
    if (this.config.aiLoadMode) args.push('--load-mode', this.config.aiLoadMode);

    this.setStatus('starting', messages.ai.starting);
    this.engine = new EngineProcess('ai', this.exe, args, this.log);
    this.engine.start();
    this.engine.onceExit(info => {
      if (!info.expected) this.setStatus('failed', this.status.state === 'ready' ? messages.ai.stopped : messages.ai.couldNotStart);
    });

    // Poll /health until ready. 503 = still loading. No password needed for /health.
    const deadline = Date.now() + this.config.aiStartSeconds * 1000;
    while (Date.now() < deadline && this.engine.running) {
      try {
        const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) return this.setStatus('ready', messages.ai.ready, { tier: pick.tier.name, contextSize: pick.tier.contextSize });
      } catch { /* not listening yet */ }
      await sleep(500);
    }
    if (this.engine.running) {
      this.log.error(`AI not ready after ${this.config.aiStartSeconds} s; stopping it`);
      await this.engine.stop();
      this.setStatus('failed', messages.ai.tooSlow);
    }
  }

  // Details the Ask feature (Phase 3) needs to talk to the AI.
  connection() {
    return this.status.state === 'ready' ? { baseUrl: this.baseUrl, apiKey: this.apiKey, contextSize: this.tier.contextSize } : null;
  }

  stop() { return this.engine ? this.engine.stop() : Promise.resolve(); }
}

module.exports = { AiService };
