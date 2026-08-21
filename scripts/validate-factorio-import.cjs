const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pako = require('pako');

const blueprintPath = process.argv[2];
const factorioPath = process.argv[3]
  || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Factorio\\bin\\x64\\factorio.exe';
if (!blueprintPath) throw new Error('Usage: node scripts/validate-factorio-import.cjs BLUEPRINT.txt [factorio.exe]');

const blueprintString = fs.readFileSync(path.resolve(blueprintPath), 'utf8').trim();
assert.match(blueprintString, /^0[A-Za-z0-9+/=]+$/);
// Decoding a 100+ MB compressed Bad Apple string would recreate a JSON string
// beyond V8's single-string limit. Factorio itself remains the authoritative
// importer for those giant validation files.
const skipLocalDecode = blueprintString.length > 50_000_000;
const decodedJson = skipLocalDecode
  ? null
  : JSON.parse(new TextDecoder().decode(
      pako.inflate(Uint8Array.from(Buffer.from(blueprintString.slice(1), 'base64'))),
    ));
const expectedEntityCount = decodedJson?.blueprint.entities?.length;
const expectedTileCount = decodedJson?.blueprint.tiles?.length;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'factorio-lamp-import-'));
const scenarioDirectory = path.join(temporaryDirectory, 'scenarios', 'blueprint-validation');
fs.mkdirSync(scenarioDirectory, { recursive: true });

const normalizedWritePath = temporaryDirectory.replace(/\\/g, '/');
fs.writeFileSync(path.join(temporaryDirectory, 'config.ini'), [
  '[path]',
  'read-data=__PATH__executable__/../../data',
  `write-data=${normalizedWritePath}`,
  '',
].join('\n'));
fs.writeFileSync(path.join(scenarioDirectory, 'control.lua'), [
  `local blueprint_string = [========[${blueprintString}]========]`,
  'script.on_init(function()',
  '  local inventory = game.create_inventory(1)',
  '  local ok, import_result = pcall(function() return inventory[1].import_stack(blueprint_string) end)',
  '  local entity_ok, entities = pcall(function() return inventory[1].get_blueprint_entities() end)',
  '  local entity_count = entity_ok and entities and #entities or -1',
  '  local tile_ok, tiles = pcall(function() return inventory[1].get_blueprint_tiles() end)',
  '  local tile_count = tile_ok and tiles and #tiles or 0',
  '  log("LAMP_BLUEPRINT_VALIDATION|ok=" .. tostring(ok) .. "|result=" .. tostring(import_result) .. "|valid=" .. tostring(inventory[1].valid_for_read) .. "|entities=" .. tostring(entity_count) .. "|tiles=" .. tostring(tile_count))',
  'end)',
  '',
].join('\n'));

const markerPattern = /LAMP_BLUEPRINT_VALIDATION\|ok=(\w+)\|result=([^|\r\n]+)\|valid=(\w+)\|entities=(-?\d+)\|tiles=(-?\d+)/;

const waitForValidation = () => new Promise((resolve, reject) => {
  const child = spawn(factorioPath, [
    '--config', path.join(temporaryDirectory, 'config.ini'),
    '--disable-audio',
    '--start-server-load-scenario', 'blueprint-validation',
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let settled = false;
  const finish = (error, marker) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    const complete = () => {
      if (error) reject(error);
      else resolve(marker);
    };
    if (child.exitCode === null) {
      child.once('close', complete);
      if (!child.killed) child.kill();
    } else {
      complete();
    }
  };
  const consume = (chunk) => {
    output += chunk.toString();
    if (output.length > 128 * 1024 * 1024) output = output.slice(-64 * 1024 * 1024);
    const marker = output.match(markerPattern);
    if (marker) finish(null, marker);
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.on('error', error => finish(error));
  child.on('close', code => {
    if (!settled) finish(new Error(`Factorio exited with code ${code} before validation.\n${output}`));
  });
  const timeout = setTimeout(() => finish(new Error(`Factorio validation timed out.\n${output}`)), 300_000);
});

(async () => {
  try {
    const marker = await waitForValidation();
  assert.equal(marker[1], 'true', `Factorio import_stack failed: ${marker[2]}`);
  assert.equal(marker[2], '0', `Factorio returned blueprint import code ${marker[2]}`);
  assert.equal(marker[3], 'true');
  if (expectedEntityCount !== undefined) {
    assert.equal(Number(marker[4]), expectedEntityCount, 'Factorio did not retain every generated entity.');
  } else {
    assert.ok(Number(marker[4]) > 0, 'Factorio did not retain generated entities.');
  }
  if (expectedTileCount !== undefined) {
    assert.equal(Number(marker[5]), expectedTileCount, 'Factorio did not retain every generated background tile.');
  }
  console.log(JSON.stringify({
    blueprintCharacters: blueprintString.length,
    expectedEntities: expectedEntityCount,
    importedEntities: Number(marker[4]),
    importedTiles: Number(marker[5]),
    factorioImportResult: Number(marker[2]),
  }));
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
