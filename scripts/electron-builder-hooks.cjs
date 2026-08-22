const { chmod } = require('node:fs/promises');
const path = require('node:path');

exports.afterPack = async (context) => {
  if (context.electronPlatformName !== 'linux') return;
  await chmod(path.join(context.appOutDir, 'resources', 'ffmpeg', 'ffmpeg'), 0o755);
};
