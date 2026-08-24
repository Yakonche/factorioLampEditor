const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
let temporaryRoot = null;
let sourceRoot;
if (process.argv[2]) {
  sourceRoot = path.resolve(process.argv[2]);
} else {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'factorio-lamp-fluent-meta-'));
  sourceRoot = path.join(temporaryRoot, 'fluentui-emoji');
  execFileSync('git', [
    'clone', '--filter=blob:none', '--no-checkout', '--depth', '1',
    'https://github.com/microsoft/fluentui-emoji.git', sourceRoot,
  ], { stdio: 'inherit' });
  execFileSync('git', ['-C', sourceRoot, 'sparse-checkout', 'init', '--no-cone'], { stdio: 'inherit' });
  execFileSync('git', [
    '-C', sourceRoot, 'sparse-checkout', 'set', '/assets/*/metadata.json', '/LICENSE',
  ], { stdio: 'inherit' });
  execFileSync('git', ['-C', sourceRoot, 'checkout'], { stdio: 'inherit' });
  process.on('exit', () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
}
const outputPath = path.join(repoRoot, 'src', 'data', 'fluent-emoji-assets.json');
const skinFolders = ['Default', 'Light', 'Medium-Light', 'Medium', 'Medium-Dark', 'Dark'];

const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' }).trim();
const revision = git('rev-parse', 'HEAD');
const paths = git('ls-tree', '-r', '--name-only', 'HEAD', '--', 'assets')
  .split(/\r?\n/u)
  .filter(Boolean);

const metadataPaths = paths.filter(filePath => filePath.endsWith('/metadata.json'));
const pathSet = new Set(paths);
const entries = {};

const glyphFromUnicode = value => String.fromCodePoint(
  ...String(value).trim().split(/\s+/u).map(codepoint => Number.parseInt(codepoint, 16)),
);

const findStylePath = (folder, skinFolder, style) => {
  const prefix = skinFolder
    ? `${folder}/${skinFolder}/${style}/`
    : `${folder}/${style}/`;
  const extension = style === '3D' ? '.png' : '.svg';
  return paths.find(filePath => filePath.startsWith(prefix) && filePath.endsWith(extension)) ?? null;
};

for (const metadataPath of metadataPaths) {
  const folder = metadataPath.slice(0, -'/metadata.json'.length);
  const metadata = JSON.parse(fs.readFileSync(path.join(sourceRoot, metadataPath), 'utf8'));
  const unicodeVariants = Array.isArray(metadata.unicodeSkintones) && metadata.unicodeSkintones.length
    ? metadata.unicodeSkintones
    : [metadata.unicode];
  const skinned = skinFolders.some(skinFolder => (
    pathSet.has(`${folder}/${skinFolder}/Flat/${path.basename(folder).toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '_')}_flat_${skinFolder.toLocaleLowerCase()}.svg`)
      || paths.some(filePath => filePath.startsWith(`${folder}/${skinFolder}/`))
  ));

  unicodeVariants.forEach((unicode, index) => {
    if (!unicode) return;
    const skinFolder = skinned ? (skinFolders[index] ?? skinFolders[0]) : null;
    const flat = findStylePath(folder, skinFolder, 'Flat');
    const color = findStylePath(folder, skinFolder, 'Color');
    const threeD = findStylePath(folder, skinFolder, '3D');
    if (!flat || !color || !threeD) return;
    entries[glyphFromUnicode(unicode)] = {
      flat: flat.slice('assets/'.length),
      color: color.slice('assets/'.length),
      threeD: threeD.slice('assets/'.length),
    };
  });
}

const manifest = {
  revision,
  source: 'https://github.com/microsoft/fluentui-emoji',
  entries: Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))),
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest)}\n`, 'utf8');
console.log(`Wrote ${Object.keys(entries).length} Fluent Emoji mappings to ${outputPath}.`);
