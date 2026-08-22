const assert = require('node:assert/strict');
const manifest = require('../src/data/noto-animated-emoji.json');

assert.equal(manifest.source, 'https://googlefonts.github.io/noto-emoji-animation/');
assert.equal(manifest.license, 'CC BY 4.0');
assert.equal(manifest.icons.length, 881, 'The generated catalog must expose all official animations.');

const codepoints = new Set();
for (const entry of manifest.icons) {
  assert.match(entry.codepoint, /^[0-9a-f]+(?:_[0-9a-f]+)*$/);
  assert.ok(entry.emoji, `Missing Unicode glyph for ${entry.codepoint}.`);
  assert.ok(entry.name, `Missing readable name for ${entry.codepoint}.`);
  assert.ok(entry.category, `Missing category for ${entry.codepoint}.`);
  assert.ok(!codepoints.has(entry.codepoint), `Duplicate codepoint ${entry.codepoint}.`);
  codepoints.add(entry.codepoint);
}

console.log(`Noto Animated Emoji manifest validated: ${manifest.icons.length} genuine animations.`);
