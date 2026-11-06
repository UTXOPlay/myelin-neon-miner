# myelin-neon-miner

Independent game service for neon-miner. Source: https://github.com/UTXOPlay/myelin-neon-miner.

The browser client, native runtime, game rules, assets and tests live here. The game runs without a UTXOPlay store checkout. Original source attribution and licenses are retained; see PROVENANCE.md and the game directories. Myelin supplies off-chain native replay, not CKB settlement.

## Build and run

Requires Node 22.23+, Rust 1.92.0, Clang/libclang, C/C++ tooling, CMake, pkg-config and protobuf compiler for native builds.

The source release includes `framework/myelin-source.tar` beside this game
directory. `deploy/myelin-source.sha256` pins its exact bytes. For a native
developer build, verify and extract the package into a new sibling directory:

```sh
(cd ../framework && sha256sum --strict -c ../myelin-neon-miner/deploy/myelin-source.sha256)
mkdir ../Myelin && tar -xf ../framework/myelin-source.tar -C ../Myelin
```

Do not merge it into an existing framework tree. Cargo's explicit paths resolve
inside this unpacked release, without a framework Git or UTXOPlay store checkout.
Keep the accompanying `source.json`; it identifies the exact uncommitted framework
candidate rather than claiming a published upstream commit. Dependency upgrades
require an explicit checksum change.

```sh
npm ci
npm run build
npm test
npm run test:host
npm run build:native
RUNTIME_TOKEN=<stable-random-secret-at-least-32-characters> npm start
```

Open http://127.0.0.1:8886/games/neon-miner/. The host assigns a signed browser guest cookie; no wallet or store is required. Each configured game has its own `/games/<id>/` URL. `WEB_PORT` and `GAME_ORIGIN` configure the host. `DATA_DIR` holds native account saves; preserve it and the secret across restarts. Native services listen only on loopback. Use HTTPS and the exact `GAME_ORIGIN` when exposing the host publicly.

`RUNTIME_URL` can point to an already-running private native runtime; then the host does not start a child process. `RUNTIME_BINARY` overrides the native executable for a local build. `SESSION_SECRET` optionally separates cookie signing from the runtime token. Keep all secrets server-side. UTXOPlay integration uses authenticated `X-Runtime-Token` / `X-UTXOPlay-Account` requests to this host, preserving original account IDs. Independent browser guests have separate identities.

## Current command protocol

`tools/build-web.mjs` packages the browser and assets without a storefront
checkout. Native dependencies use the explicitly pinned framework source package.

`CommandExecutor`, `CommandJournal`, `RegisteredFinalityVerifier`,
`SessionAuthority` and shared local recovery implement admission, original
receipts and fencing. Every action requires `command_id`, `session_id`, `profile`,
`expected_block`, `expected_cursor` and `action`. The gateway authenticates the
account and signs it into the native original command; it is not a personal
wallet signature. First accepted work binds the expedition owner in replayable
state. Another actor, payload or construction context cannot reuse that identity.

A 1–60 sample five-bit input tape is one user command. Game physics advances at
30 Hz using the unchanged integer engine and Park–Miller sector RNG. Purchases,
next-sector and retry commands do not advance physics. Myelin's command clock
and game `tick` are separate; this profile does not claim one packet is one
fixed simulation tick. The signed result records the resulting game digest,
tick, level, coins, spent credits, stock and mode. The current game view is
returned separately, without duplicating the entire state in every journal result.

The browser persists the full request in session storage under its authenticated
account before sending. `GET /api/commands/<session>/<command>` returns the
original receipt and business outcome. A committed rejection remains a durable
outcome. After loss, the client queries the same ID; unresolved work pauses play
and spending. Speculative tail inputs are discarded after reconnect or another
tab advances the construction head. The unresolved original never receives a
new ID. Account changes use a different pending-command namespace.

`POST /api/new` requires the same envelope with exactly
`action: {"type":"new_game"}`. The original session records a deterministic target;
the target databases are closed/synced and renamed before the active pointer
switches. Restart finishes that same creation. A late retry returns its original
receipt and the current view without rewinding active history. A local namespace
lock excludes another local owner. This is fresh expedition creation, without
cross-session transfer or successor-state inheritance.

Only MREC 13, block 6, RocksDB schema 15, journal 2 and
`myelin-neon-miner-commands-v1` exports are accepted. There are no old command
aliases, storage imports or schema upgrades. Start this exact executable in a
new data namespace and preserve that binary with its exports. Missing active,
epoch or journal metadata fails instead of silently replacing history. The
profile binds the entire executable, command/authentication rules and entropy
policy. The journal explicitly allows 10,001 commands including terminal
creation, with a separate 32 MiB encoded-state budget; both limits apply.
The JSON export is also bounded and refuses oversized histories.

The export verifier checks application replay and ordinary PoA finality under
the export's self-declared authority, and reports `canonical_fencing: not-verified`.
Canonical acceptance requires an independently pinned fencing policy and
certificates. This export does not replace the complete portable bundle format.
The local administrator/canonical signer/worker roles are co-located; concurrent
cloned authorities require the upstream migration/fencing procedure. There is
no CKB settlement or VM execution claim.

Existing verification commands:

```sh
MINER_BIN="$PWD/target/release/myelin-neon-miner" node tests/miner-conformance.mjs
MINER_BIN="$PWD/target/release/myelin-neon-miner" node tests/miner-signed-campaign.mjs
```

Conformance checks 64 held/random tapes and two full 60-sector campaigns against
the browser engine. The signed campaign starts a real host/native service,
compares every command's game state, retries purchases, loses replies/status,
kills/restarts the runtime, rejects stale/cross-account requests and verifies the
export offline with the original executable after deleting the producing databases. It runs the existing controller
flow against that same service, with DOM and native Canvas test rendering.
The separate duplicate `live-miner` campaign and unrelated multi-game shell
suite are removed; the applicable shell checks run in the actual controller flow.
Test libraries are
pinned locally instead of imported from an unrelated checkout. These checks do
not claim physical-device or deployed-container coverage.

## Deploy

```sh
docker build --build-context myelin=../framework -f deploy/Standalone.Dockerfile -t myelin-neon-miner:standalone .
# Create the shared private network once, then provide an untracked runtime.env.
docker compose -f deploy/standalone-compose.yml up -d
```

The named context contains the pinned tar, not a mutable framework checkout.
The Dockerfile verifies SHA-256 before extraction, pins Rust/Node base image
digests and builds with Cargo/npm lockfiles. The final image retains the checksum
beside its exact executable, without developer build targets, data or credentials.

`deploy/runtime.env` supplies `RUNTIME_TOKEN` and `GAME_ORIGIN`; it is ignored by Git. Configure the store's service URL as `http://myelin-neon-miner:8080` on the private `utxoplay-games` network. Bind or proxy host port 8080 only when standalone public play is wanted. Mount the data namespace belonging to this exact release; old-format data is unsupported. The deployment does not expose native runtime ports.
