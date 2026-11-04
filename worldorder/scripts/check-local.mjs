// One bounded transport/persistence smoke test for the handoff-only adapter.
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startLocalServer} from './dev-local.mjs';

const directory = await mkdtemp(join(tmpdir(), 'world-order-local-check-'));
const tokens = Object.fromEntries(['US', 'CN', 'EU', 'RU'].map(seat => [seat, randomUUID()]));
let app;
try {
  app = await startLocalServer({port: 0, dataDirectory: directory});
  async function api(seat, path = '', command) {
    const response = await fetch(app.origin + '/api/rooms' + path, {
      method: command ? 'POST' : 'GET',
      headers: {'X-Room-Token': tokens[seat], ...(command ? {'Content-Type': 'application/json'} : {})},
      ...(command ? {body: JSON.stringify(command)} : {}),
    });
    const result = await response.json();
    assert.ok(response.ok, JSON.stringify(result));
    return result;
  }
  const page = await fetch(app.origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /app\.js/);
  const asset = await fetch(app.origin + '/assets/board-US.webp');
  assert.equal(asset.headers.get('content-type'), 'image/webp');
  assert.ok((await asset.arrayBuffer()).byteLength > 1000);
  assert.equal((await fetch(app.origin + '/server/index.js')).status, 404);
  assert.equal((await fetch(app.origin + '/api/rooms')).status, 401);
  assert.equal((await fetch(app.origin + '/api/rooms', {headers: {
    'X-Room-Token': tokens.US, Origin: 'https://other.example',
  }})).status, 403);
  const created = (await api('US', '', {code: 'CDEX22', config: {dd: false, wit: false}})).room;
  assert.equal(created.seat, 'US');
  await Promise.all(['CN', 'EU', 'RU'].map(async seat => {
    const result = await api(seat, '/CDEX22', {id: randomUUID(), op: 'join', seat});
    assert.equal(result.room.seat, seat);
  }));
  const playing = (await api('US', '/CDEX22', {id: randomUUID(), op: 'start'})).room;
  assert.equal(playing.status, 'playing');
  assert.ok(Object.values(playing.seats).every(seat => seat.occupied));
  await Promise.all(Object.keys(tokens).map(async seat => {
    const view = (await api(seat, '/CDEX22')).room;
    const next = (await api(seat, '/CDEX22', {id: randomUUID(), op: 'action',
      gameRevision: view.gameRevision, seatRevision: view.seatRevision,
      action: {type: 'selectAssetDiscard', id: view.state.players[seat].assetChoices[0].id}})).room;
    assert.equal(next.state.current, seat);
    assert.equal(next.state.players[seat].hand.length, 6);
  }));
  const before = (await api('US', '/CDEX22')).room;
  assert.ok(before.state.players.US.hand.every(Boolean));
  assert.deepEqual(before.state.players.CN.hand, Array(6).fill(null));
  await app.close();
  app = await startLocalServer({port: 0, dataDirectory: directory});
  const resumed = (await api('US', '/CDEX22')).room;
  assert.equal(resumed.revision, before.revision);
  assert.deepEqual(resumed.state.players.US.hand, before.state.players.US.hand);
  console.log('Passed local HTTP: static assets, four seats, concurrent asset discards, fixed beginner hands, hidden hands, auth/origin checks, SQLite restart.');
} finally {
  if (app) await app.close();
  await rm(directory, {recursive: true, force: true});
}
