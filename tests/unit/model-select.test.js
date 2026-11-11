'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { selectModel, GB } = require('../../app/src/main/model-select');

const ALL = ['small.gguf', 'medium.gguf', 'large.gguf'];
const pick = (gb, files = ALL, o) => selectModel(gb * GB, files, o);

test('below 6 GB: AI off', () => {
  const r = pick(4, ALL);
  assert.strictEqual(r.tier, null);
  assert.strictEqual(r.reason, 'not-enough-memory');
});

test('exactly 6 GB -> small', () => assert.strictEqual(pick(6).tier.name, 'small'));
test('"6 GB" PC that Windows reports as 5.8 GB -> still small', () => assert.strictEqual(pick(5.8).tier.name, 'small'));
test('5.4 GB -> AI off', () => assert.strictEqual(pick(5.4).tier, null));
test('8 GB laptop reporting 7.8 GB -> small', () => assert.strictEqual(pick(7.8).tier.name, 'small'));
test('exactly 12 GB -> medium', () => assert.strictEqual(pick(12).tier.name, 'medium'));
test('exactly 24 GB -> large', () => assert.strictEqual(pick(24).tier.name, 'large'));
test('64 GB -> large', () => assert.strictEqual(pick(64).tier.name, 'large'));

test('16 GB but no medium file -> falls back to small', () =>
  assert.strictEqual(pick(16, ['small.gguf', 'large.gguf']).tier.name, 'small'));

test('only large.gguf present, 8 GB PC -> AI off (cannot run it)', () => {
  const r = pick(8, ['large.gguf']);
  assert.strictEqual(r.tier, null);
  assert.strictEqual(r.reason, 'not-enough-memory');
});

test('only large.gguf present, 32 GB PC -> large', () => assert.strictEqual(pick(32, ['large.gguf']).tier.name, 'large'));

test('no model files at all', () => assert.strictEqual(pick(16, ['readme.txt']).reason, 'no-model-files'));

test('file names are matched without caring about capital letters', () =>
  assert.strictEqual(pick(8, ['Small.GGUF']).tier.name, 'small'));

test('context size: 4096 on small, 8192 on medium, config override wins', () => {
  assert.strictEqual(pick(8).tier.contextSize, 4096);
  assert.strictEqual(pick(16).tier.contextSize, 8192);
  assert.strictEqual(pick(16, ALL, { contextSize: 2048 }).tier.contextSize, 2048);
});

test('owner can force a tier; missing forced file is reported', () => {
  assert.strictEqual(pick(4, ALL, { forceTier: 'small' }).tier.name, 'small');
  assert.strictEqual(pick(64, ['small.gguf'], { forceTier: 'large' }).reason, 'forced-tier-missing');
});
