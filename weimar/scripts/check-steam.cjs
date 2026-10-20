// Native SDK diagnostic; no game window, no lobby creation and no messages sent.
const { app } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
app.whenReady().then(() => {
  const result = {
    electron: process.versions.electron,
    node: process.versions.node,
    appId: Number(process.env.WEIMAR_STEAM_APP_ID || 480),
  };
  try {
    const sdk = require('steamworks.js').init(result.appId);
    result.available = !!sdk.localplayer.getSteamId().steamId64;
  } catch (error) {
    result.available = false;
    result.error = error.message;
  }
  mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'artifacts/steam-sdk-check.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  app.exit(result.available ? 0 : 2);
});
