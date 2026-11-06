# Neon Prospector responsive layout release

Deployed on 2026-10-26 at 23:06 JST to https://store.utxoplay.io/play/neon-miner.

The mine retains its fixed 1000 × 700 rule coordinates and scales isotropically. Status and equipment occupy side rails within the scene. At 844 × 390 the mine grows from about 306 × 214 to 529 × 370 CSS pixels. The redundant Cast Claw button is removed; canvas touch/click and keyboard casting remain. Mobile portrait uses the rotation gate. Canvas backing pixels are capped and large-display HUD sizes scale with the viewport.

Only the independent miner service was recreated. The existing host, native executable, environment and persistent data mount were retained. The release adds or replaces seven browser files, with no rules, profile or saved-state migration.

- Release: `/data/utxoplay/releases/20261026-neon-miner-layout-1`
- Image: `myelin-neon-miner:layout-1`
- Image ID: `sha256:1f3fabd638e23a5def1eead4c23893bfa3c30490932874fad43f487bb91888e3`
- Native SHA-256 before and after: `3ac9e942569438c6ae643ccf0997b5945326d4dede2f91ae49627af69760260c`
- Stopped-writer backup: `/data/utxoplay/backups/neon-miner-layout-1/neon-miner.tar.gz`
- Existing data: `/data/utxoplay/shared/neon-miner-deep-expedition`

Validation: production build and 13 Node tests passed. Local browser acceptance covered the six required viewport sizes, isotropic rendering and inverse mapping, touch casting, portrait pause, in-scene store, touch targets and bounded backing resolution. Public HTTPS SHA-256 checks matched eight resources, including the unchanged browser engine. The deployed service returned HTTP 200 health and Docker healthy. All other running container IDs stayed unchanged. Browser interaction tests used a local API fixture; production verification used HTTPS assets and service health.

Local evidence: `artifacts/layout-review/`, with public hashes in `production/asset-hashes.json`. The server release retains the prior service definition and the exact distribution.

Rollback the image while retaining current player records:

```sh
docker compose -p utxoplay-independent \
  -f /data/utxoplay/releases/20261026-neon-miner-layout-1/rollback.compose.json \
  up -d --no-deps myelin-neon-miner
```

Do not restore the pre-release data backup over newer player saves during an ordinary image rollback.
