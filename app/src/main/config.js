// Optional owner settings in _system/config.json (customers never need it).
//
// Example:
//   { "forceTier": "small", "contextSize": 4096, "aiEnabled": true, "aiThreads": 4 }
//
// A missing file is normal. A broken file is logged and ignored, so a typo can
// never stop the app from starting.
'use strict';
const fs = require('fs');

const DEFAULTS = {
  aiEnabled: true,      // false = never start the AI
  forceTier: null,      // "small" | "medium" | "large" to skip the memory check
  contextSize: null,    // override the AI's memory window (tokens)
  aiThreads: null,      // number of CPU threads for the AI (null = automatic)
  // How the AI reads its file. "none" = read it in one go: measured on the owner's
  // USB stick (cold) 18 s, against 62 s for llama.cpp's default "mmap", which reads
  // in small pieces on demand and is slow on USB sticks. Other values: "mmap", "dio", "auto".
  aiLoadMode: 'none',
  kiwixStartSeconds: 90,   // how long to wait for the library before giving up
  aiStartSeconds: 600,     // how long to wait for the AI to load (slow USB 2 drives)
};

const ALLOWED_TIERS = new Set(['small', 'medium', 'large']);
const ALLOWED_LOAD_MODES = new Set(['none', 'mmap', 'dio', 'auto']);

function loadConfig(file, log) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT' && log) log.warn('config.json could not be read, using defaults:', e.message);
    return { ...DEFAULTS };
  }
  const cfg = { ...DEFAULTS };
  if (typeof raw.aiEnabled === 'boolean') cfg.aiEnabled = raw.aiEnabled;
  if (ALLOWED_TIERS.has(raw.forceTier)) cfg.forceTier = raw.forceTier;
  if (Number.isInteger(raw.contextSize) && raw.contextSize >= 512 && raw.contextSize <= 131072) cfg.contextSize = raw.contextSize;
  if (Number.isInteger(raw.aiThreads) && raw.aiThreads > 0 && raw.aiThreads <= 256) cfg.aiThreads = raw.aiThreads;
  if (ALLOWED_LOAD_MODES.has(raw.aiLoadMode)) cfg.aiLoadMode = raw.aiLoadMode;
  if (Number.isFinite(raw.kiwixStartSeconds) && raw.kiwixStartSeconds > 0) cfg.kiwixStartSeconds = raw.kiwixStartSeconds;
  if (Number.isFinite(raw.aiStartSeconds) && raw.aiStartSeconds > 0) cfg.aiStartSeconds = raw.aiStartSeconds;
  if (log) log.info('config.json loaded:', cfg);
  return cfg;
}

module.exports = { loadConfig, DEFAULTS };
