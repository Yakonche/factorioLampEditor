const assert = require('node:assert/strict');
const {
  listSystemFontFamilies,
  normalizeFontFamilies,
} = require('../electron/fonts.cjs');

assert.deepEqual(
  normalizeFontFamilies([' Verdana ', 'Arial', 'arial', '', null]),
  ['Arial', 'Verdana'],
);

void listSystemFontFamilies().then((families) => {
  assert.deepEqual(families, normalizeFontFamilies(families));
  if (process.platform === 'win32') {
    assert.ok(families.length > 20, 'Windows should expose its installed font collection.');
    assert.ok(families.some(family => family.toLocaleLowerCase() === 'segoe ui emoji'));
  }
  console.log(JSON.stringify({ platform: process.platform, detectedSystemFonts: families.length }));
});
