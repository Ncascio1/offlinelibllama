// Choose which AI model to use, based on how much memory (RAM) the PC has.
//
// Tiers (from the brief): small 6 GB+, medium 12 GB+, large 24 GB+ (optional).
// Pick the best tier that the PC can run AND whose file exists on the drive.
// Below 6 GB the AI is switched off; the Library and Maps still work.
'use strict';

const GB = 1024 ** 3;

// Windows reports a little less than the installed memory (some is reserved for
// graphics and hardware), so an "8 GB" laptop shows about 7.7 to 7.9 GB.
// We allow this much slack so a 6 GB PC still counts as 6 GB.
const RESERVED_SLACK_GB = 0.5;

const TIERS = [
  // Larger AI memory (context) on bigger PCs: more passages fit, better answers.
  { name: 'large',  file: 'large.gguf',  minGb: 24, contextSize: 8192 },
  { name: 'medium', file: 'medium.gguf', minGb: 12, contextSize: 8192 },
  { name: 'small',  file: 'small.gguf',  minGb: 6,  contextSize: 4096 },
];

/**
 * @param {number} totalBytes   physical memory, as reported by os.totalmem()
 * @param {string[]} modelFiles file names found in models/
 * @param {object} [overrides]  from config.json: { forceTier, contextSize }
 * @returns {{ tier: object|null, reason: string, ramGb: number }}
 *   reason is one of: 'ok', 'not-enough-memory', 'no-model-files', 'forced-tier-missing'
 */
function selectModel(totalBytes, modelFiles, overrides = {}) {
  const ramGb = totalBytes / GB;
  const present = new Set(modelFiles.map(f => f.toLowerCase()));
  const withContext = t => ({ ...t, contextSize: overrides.contextSize || t.contextSize });

  // Owner override: use exactly this tier if its file exists (memory is not checked).
  if (overrides.forceTier) {
    const t = TIERS.find(x => x.name === overrides.forceTier);
    if (t && present.has(t.file)) return { tier: withContext(t), reason: 'ok', ramGb };
    return { tier: null, reason: 'forced-tier-missing', ramGb };
  }

  if (!TIERS.some(t => present.has(t.file))) return { tier: null, reason: 'no-model-files', ramGb };

  const fits = TIERS.filter(t => ramGb + RESERVED_SLACK_GB >= t.minGb);
  const chosen = fits.find(t => present.has(t.file));
  if (chosen) return { tier: withContext(chosen), reason: 'ok', ramGb };
  return { tier: null, reason: 'not-enough-memory', ramGb };
}

module.exports = { selectModel, TIERS, GB, RESERVED_SLACK_GB };
