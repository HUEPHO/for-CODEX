// Handoff-only adapter. Production continues to use the authenticated Sites Worker.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdir, readFile, stat} from 'node:fs/promises';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {roomApi} from '../server/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const staticRoot = resolve(root, 'dist');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function d1Adapter(sqlite) {
  return {prepare(sql) {return {bind(...values) {
    const statement = sqlite.prepare(sql);
    return {
      async first() {return statement.get(...values) ?? null;},
      async all() {return {results: statement.all(...values)};},
      async run() {return {meta: {changes: Number(statement.run(...values).changes)}};},
    };
  }};}};
}

async function migrate(sqlite) {
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
  const journal = JSON.parse(await readFile(resolve(root, 'drizzle/meta/_journal.json'), 'utf8'));
  for (const {tag} of journal.entries) {
    if (sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(tag)) continue;
    const sql = await readFile(resolve(root, 'drizzle', tag + '.sql'), 'utf8');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(tag);
      sqlite.exec('COMMIT');
    } catch (error) {sqlite.exec('ROLLBACK'); throw error;}
  }
}

async function send(res, response, head = false) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(head ? undefined : Buffer.from(await response.arrayBuffer()));
}

export async function startLocalServer({port = 8787, dataDirectory = resolve(root, '.local')} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid local port');
  const databasePath = resolve(dataDirectory, 'rooms.sqlite');
  await mkdir(dirname(databasePath), {recursive: true});
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    await migrate(sqlite);
  } catch (error) {sqlite.close(); throw error;}
  const env = {DB: d1Adapter(sqlite)};
  let origin;
  const server = createServer(async (req, res) => {
    try {
      // Loopback only. Host validation also prevents arbitrary DNS names reaching
      // the fixed development identity. This is not a public authentication service.
      if (req.headers.host !== new URL(origin).host) {
        return await send(res, new Response('Use ' + origin, {status: 403}));
      }
      const url = new URL(req.url, origin);
      if (url.origin !== origin) return await send(res, new Response('Forbidden', {status: 403}));
      if (url.pathname === '/__local-info') {
        if (!['GET', 'HEAD'].includes(req.method)) return await send(res, new Response('Method not allowed', {status: 405}));
        return await send(res, Response.json({application: 'world-order-local', sourceRoot: resolve(root), dbPath: databasePath}, {headers: {'Cache-Control': 'no-store'}}), req.method === 'HEAD');
      }
      if (url.pathname.startsWith('/api/rooms')) {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        // This identity exists only in this local adapter and its separate SQLite DB.
        // The production Worker and all per-tab token/seat checks are unchanged.
        headers.set('oai-authenticated-user-id', 'world-order-local-development');
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) return await send(res, new Response('Request too large', {status: 413}));
          chunks.push(chunk);
        }
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(url, {method: req.method, headers,
          ...(!['GET', 'HEAD'].includes(req.method) && body ? {body} : {})});
        return await send(res, await roomApi(request, env), req.method === 'HEAD');
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        return await send(res, new Response('Method not allowed', {status: 405}));
      }
      let pathname;
      try {pathname = decodeURIComponent(url.pathname);} catch {
        return await send(res, new Response('Invalid path', {status: 400}));
      }
      const parts = pathname.split(/[\\/]/).filter(Boolean);
      if (parts.some(part => part.startsWith('.')) || ['client', 'server'].includes(parts[0])) {
        return await send(res, new Response('Not found', {status: 404}));
      }
      const path = resolve(staticRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(staticRoot + sep) || !(await stat(path)).isFile()) {
        return await send(res, new Response('Not found', {status: 404}));
      }
      const bytes = req.method === 'HEAD' ? null : await readFile(path);
      return await send(res, new Response(bytes, {headers: {
        'Content-Type': mime[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      }}), req.method === 'HEAD');
    } catch (error) {
      if (res.headersSent) {res.destroy(); return;}
      const missing = ['ENOENT', 'ENOTDIR'].includes(error.code);
      if (!missing) console.error('Local server:', error.message);
      await send(res, new Response(missing ? 'Not found' : 'Local server error', {status: missing ? 404 : 500}));
    }
  });
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        origin = 'http://127.0.0.1:' + server.address().port;
        accept();
      });
    });
  } catch (error) {sqlite.close(); throw error;}
  let stopped = false;
  return {origin, databasePath, async close() {
    if (stopped) return;
    stopped = true;
    await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    sqlite.close();
  }};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const app = await startLocalServer({port: Number(process.env.WORLD_ORDER_PORT || 8787), dataDirectory: process.env.WORLD_ORDER_DATA || undefined});
    console.log(`World Order 本地开发：${app.origin}`);
    console.log('打开页面创建或加入房间。仅限本机开发。');
    console.log(`当前源码：${resolve(root)}`);
    console.log(`本地房间数据：${app.databasePath}`);
    const stop = () => app.close().catch(error => {console.error(error.message); process.exitCode = 1;});
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
