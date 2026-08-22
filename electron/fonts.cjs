const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const EXECUTION_OPTIONS = {
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
  timeout: 20_000,
  windowsHide: true,
};

function normalizeFontFamilies(families) {
  const unique = new Map();
  for (const value of families) {
    if (typeof value !== 'string') continue;
    const family = value.trim().replace(/\s+/g, ' ');
    if (!family) continue;
    const key = family.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, family);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  }));
}

async function listWindowsFonts(run) {
  const command = [
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    'Add-Type -AssemblyName System.Drawing',
    '$collection = New-Object System.Drawing.Text.InstalledFontCollection',
    '$collection.Families | ForEach-Object Name | Sort-Object -Unique | ConvertTo-Json -Compress',
  ].join('; ');
  const { stdout } = await run('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    command,
  ], EXECUTION_OPTIONS);
  const parsed = JSON.parse(stdout.trim() || '[]');
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function listLinuxFonts(run) {
  const { stdout } = await run('fc-list', ['--format=%{family}\\n'], EXECUTION_OPTIONS);
  return stdout
    .split(/\r?\n/)
    .flatMap(line => line.split(','));
}

async function listMacFonts(run) {
  const script = [
    'ObjC.import("AppKit")',
    'const manager = $.NSFontManager.sharedFontManager',
    'JSON.stringify(ObjC.deepUnwrap(manager.availableFontFamilies))',
  ].join('; ');
  const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', script], EXECUTION_OPTIONS);
  const parsed = JSON.parse(stdout.trim() || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function listSystemFontFamilies(platform = process.platform, run = execFileAsync) {
  try {
    const families = platform === 'win32'
      ? await listWindowsFonts(run)
      : platform === 'darwin'
        ? await listMacFonts(run)
        : await listLinuxFonts(run);
    return normalizeFontFamilies(families);
  } catch (error) {
    console.warn(`Unable to enumerate ${platform} system fonts.`, error);
    return [];
  }
}

module.exports = {
  listSystemFontFamilies,
  normalizeFontFamilies,
};
