const fs = require('node:fs/promises');
const path = require('node:path');

const API_URL = 'https://googlefonts.github.io/noto-emoji-animation/data/api.json';
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'noto-animated-emoji.json');

function codepointToEmoji(codepoint) {
  return String.fromCodePoint(...codepoint.split('_').map(value => Number.parseInt(value, 16)));
}

function readableName(icon) {
  const tag = icon.tags?.[0]?.replace(/^:+|:+$/g, '');
  return (tag || icon.name.replace(/^emoji_u/, ''))
    .split('-')
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

async function main() {
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error(`Noto Animated Emoji API returned HTTP ${response.status}.`);
  const source = await response.json();
  if (!Array.isArray(source.icons) || source.icons.length < 800) {
    throw new Error(`Unexpected Noto Animated Emoji catalog (${source.icons?.length ?? 0} icons).`);
  }

  const manifest = {
    source: 'https://googlefonts.github.io/noto-emoji-animation/',
    api: API_URL,
    license: 'CC BY 4.0',
    icons: source.icons.map(icon => ({
      codepoint: icon.codepoint,
      emoji: codepointToEmoji(icon.codepoint),
      name: readableName(icon),
      category: icon.categories?.[0] || 'Other',
      tags: icon.tags ?? [],
    })),
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${manifest.icons.length} official animated emoji to ${OUTPUT_PATH}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
