import { copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
// Current Electron installs its binary on first use; ensure it exists before packaging.
const electron = require('electron');
if (!existsSync(electron)) throw new Error('Electron运行时未安装完整');
copyFileSync('desktop/preload.cjs', 'desktop-dist/desktop/preload.cjs');
const nativeRoot = dirname(require.resolve('steamworks.js'));
const library = join(nativeRoot, 'dist/win64/steam_api64.dll');
if (process.platform === 'win32' && !existsSync(library))
  throw new Error('steamworks.js安装中缺少steam_api64.dll');
console.log('桌面入口与Steam原生库检查完成。');
