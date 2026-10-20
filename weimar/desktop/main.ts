import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { SteamService } from './steam-service.ts';
import type { DesktopStatus, RoomRequest } from '../src/multiplayer/protocol.ts';
import type { ScenarioId } from '../src/engine/types.ts';

const require = createRequire(import.meta.url);
const appId = Number(process.env.WEIMAR_STEAM_APP_ID ?? 480);
let window: BrowserWindow | null = null;
let steam: SteamService | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let unavailable = 'Steam尚未初始化';
let binding: typeof import('steamworks.js') | undefined;
try {
  binding = require('steamworks.js') as typeof import('steamworks.js');
  binding.electronEnableSteamOverlay();
} catch (error) {
  unavailable = String(error);
}
const status = (): DesktopStatus =>
  steam?.status() ?? {
    available: false,
    appId,
    self: null,
    canResume: false,
    snapshot: null,
    error: unavailable,
  };
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'weimar',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
function notify(value: DesktopStatus) {
  if (window && !window.isDestroyed()) window.webContents.send('weimar:steam-status', value);
}
const launchLobby = (args: string[]) => {
  const index = args.indexOf('+connect_lobby');
  return index >= 0 ? args[index + 1] : undefined;
};
function joinLaunch(args: string[]) {
  const lobby = launchLobby(args);
  if (lobby && steam)
    void steam.join(lobby).catch((e: Error) => notify({ ...status(), error: e.message }));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    joinLaunch(args);
    window?.focus();
  });
  void app.whenReady().then(async () => {
    const savePath = join(app.getPath('userData'), 'steam-host-save.json');
    try {
      if (!Number.isSafeInteger(appId) || appId <= 0)
        throw new Error('WEIMAR_STEAM_APP_ID 必须是正整数');
      // Keep native SDK and all authoritative/hidden game state in the main process.
      if (!binding) throw new Error(unavailable);
      const sdk = binding.init(appId);
      steam = new SteamService(
        sdk,
        appId,
        {
          read: () => (existsSync(savePath) ? readFileSync(savePath, 'utf8') : null),
          write: (text) => {
            writeFileSync(`${savePath}.tmp`, text, 'utf8');
            renameSync(`${savePath}.tmp`, savePath);
          },
        },
        notify,
      );
      timer = setInterval(() => {
        try {
          steam?.tick();
        } catch (error) {
          notify({ ...status(), error: String(error) });
        }
      }, 50);
    } catch (error) {
      unavailable = `Steam连接不可用。请安装并登录Steam后重启桌面版。${error instanceof Error ? error.message : String(error)}`;
    }
    const root = resolve(app.getAppPath(), 'dist');
    protocol.handle('weimar', (request) => {
      const url = new URL(request.url);
      const file = resolve(
        root,
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
      if (url.host !== 'app' || !file.startsWith(root + sep))
        return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    ipcMain.handle('weimar:steam', (event, method: string, ...args: unknown[]) => {
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw new Error('未知调用来源');
      if (method === 'status') return status();
      if (!steam) throw new Error(unavailable);
      switch (method) {
        case 'create':
          return steam.create(args[0] as ScenarioId);
        case 'resume':
          return steam.resume(args[0] as string | undefined);
        case 'list':
          return steam.list();
        case 'join':
          return steam.join(String(args[0]));
        case 'leave':
          return steam.leave();
        case 'invite':
          return steam.invite();
        case 'request':
          return steam.request(args[0] as RoomRequest);
        case 'exportSave':
          return steam.exportSave();
        default:
          throw new Error('未知Steam操作');
      }
    });
    window = new BrowserWindow({
      width: 1440,
      height: 960,
      title: 'WEIMAR · Steam联机',
      webPreferences: {
        preload: join(dirname(fileURLToPath(import.meta.url)), 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    await window.loadURL('weimar://app/index.html');
    joinLaunch(process.argv);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (timer) clearInterval(timer);
    steam?.dispose();
  });
}
