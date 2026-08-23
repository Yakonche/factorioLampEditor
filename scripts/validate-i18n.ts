import assert from 'node:assert/strict';
import { formatUiColons, translateUiString } from '../src/i18n';

assert.equal(formatUiColons('Detected: Segoe UI Emoji'), 'Detected : Segoe UI Emoji');
assert.equal(formatUiColons('Original: 512 × 512 px'), 'Original : 512 × 512 px');
assert.equal(formatUiColons('X: 12 Y:34'), 'X : 12 Y :34');
assert.equal(formatUiColons('https://example.com:443'), 'https://example.com:443');
assert.equal(formatUiColons('C:\\Fonts\\font.ttf'), 'C:\\Fonts\\font.ttf');
assert.equal(formatUiColons('12:34'), '12:34');
assert.equal(translateUiString('Preview frame 2: demo', 'fr'), 'Afficher l’image 2 : demo');
assert.equal(translateUiString('Preview frame 2 : demo', 'fr'), 'Afficher l’image 2 : demo');
assert.equal(translateUiString('Afficher l’image 2 : demo', 'en'), 'Preview frame 2 : demo');
assert.equal(translateUiString('Detected: Segoe UI Emoji', 'en'), 'Detected : Segoe UI Emoji');

console.log(JSON.stringify({ colonSpacing: 'ok', protectedTechnicalColons: 3 }));
