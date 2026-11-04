# Four-player rooms

The existing local hotseat table is preserved. Create a room from the header,
then open China, the EU and Russia from the lobby in separate tabs. The creating
tab is the host and starts the game when all four seats are occupied.

Rooms are server-backed, using the Site's logical D1 binding `DB`. Site audience
and authentication remain unchanged. A single signed-in account can occupy all
four seats through different tab tokens; no extra player accounts are needed.

## State and authority

- `server/rooms.js` owns room commands, per-seat views and ownership checks.
- `server/room-db.js` uses prepared D1 statements. Each write compares the stored
  revision so concurrent requests cannot overwrite each other. Drizzle owns schema
  migrations; the Worker never changes the schema at runtime.
- `dist/room-rules.js` identifies the player responsible for every phase, including
  card responders, focus, investments, prosperity and threats.
- Normal game actions require the latest game revision. Simultaneous opening
  choices use each seat's revision, allowing independent drafts to proceed.
- Command IDs deduplicate retries after lost responses. No optimistic game changes
  happen in the browser. Up to five preceding action states support immediate undo
  by the tab that performed the most recent action.
- Other players' hands, remaining decks, unconfirmed drafts and objectives are omitted from
  responses. Spy and country-search effects expose only the information required
  by the currently authorized effect. These views never feed back into the engine.
- Confirmed strategic assets remain public, as required by setup step 17 in the
  [base rulebook](https://bghub.org/r/worldorder.pdf). The public player panel also
  shows allies, growth, resources and face-up played cards without switching seats.

## Tabs and reconnection

The tab credential is stored in sessionStorage, never in a join URL. Web Locks
prevent a duplicated tab from silently sharing an existing live tab's credential
where supported. New-tab links use `noopener`. The server stores only token hashes.
Refreshing resumes the seat. Another tab of the same account can explicitly
recover an occupied seat; this revokes the original tab's seat and, if necessary,
recovers its host role. Closing a tab does not erase the shared game or free its
seat, so it can be recovered. Lobby labels mean occupied, not online presence.

Clients poll the shared state and also notify other local tabs after a write.
Unchanged revisions do not redraw forms. Actions are disabled during a save or
connection loss. A stale rejected command refreshes the view and asks the player
to choose again. Room data is separate from the original local-save key.

Existing manual card/phase features remain available to the appropriate player.
During shared manual settlement, each tab can adjust its own resources, production
and ally/commerce markers. The phase's first player confirms the shared step.

## Build and checks

Authored static files remain under `dist/` to preserve existing module and asset
paths. `scripts/build.mjs` creates ignored `dist/client/`, the bundled Worker at
`dist/server/index.js`, and hosting metadata/migrations. Publish through the
existing Site's Worker path, using its unchanged project identity.

`npm run test:rooms` exercises the production room reducer, SQLite prepared
statements, concurrent requests, hidden views, a cross-player BRICS resolution,
and four instances of the shipped asynchronous client. Existing rule-engine
checks remain available independently. This is not a browser end-to-end test.
