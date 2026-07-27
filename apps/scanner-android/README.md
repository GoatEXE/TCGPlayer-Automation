# TCGPlayer Automation Android Scanner Spike

Native Android companion scanner for the existing TCGPlayer Automation backend. This app is intentionally a scanner/intake client only; it does not replace the web dashboard and does not call `/api/cards` or mutate selling inventory.

## What is included

- Kotlin Android app under `apps/scanner-android`.
- Jetpack Compose UI with:
  - backend base URL setting,
  - connection test against `/health` with `/api/scanner/status` fallback,
  - scanner catalog readiness display from `/api/scanner/status` and a **Sync all sets** action using `POST /api/catalog/sync`,
  - full-screen CameraX preview,
  - ML Kit Latin text recognition on-device,
  - targeted bottom-left ID strip and bottom-right vertical ID strip OCR, plus full-frame exact-name fallback/debug,
  - bounded ImageAnalysis/ROI processing, capped 3x ID-crop upscale, and sequential natural/grayscale/contrast/inverted ROI OCR variants,
  - opt-in debug panel with ROI thumbnails so misses can be diagnosed from the actual crops sent to ML Kit without cluttering normal scanning,
  - throttled ImageAnalysis at roughly 1 FPS,
  - ROI OCR text posted to `POST /api/scanner/resolve-text` with region-specific values (`bottom-left`, `bottom-right`, `native`) and `setCodeHint` when inferred,
  - practical ID-based stabilization/dedupe before adding to the session; trusted IDs add after 2 stable samples, consecutive same-card auto-adds are blocked in favor of `+1 last`, and name-only fallback is shown as possible/low-trust and is not auto-added,
  - immersive app behavior while active (swipe from bottom to reveal system bars temporarily) and keep-screen-awake while the camera scanner is active,
  - compact scanner overlay with last scanned card, Normal/Shiny finish toggle, always-on success sound, Undo, `+1`, Done review, and grouped quantities,
  - sellability preview on Done using `POST /api/collections/scan-preview`, showing “Set aside to sell” before “Add to collection / keep”,
  - split collection commit using `POST /api/collections/split-scan`, sending sell rows to `To Be Sold` and keep rows to the normal owned collection with per-group finish preserved.
- Unit tests for detection stabilization, session grouping/undo, and API JSON mapping.

## Backend assumptions

The backend must be running on the same LAN and must have the Riftbound catalog populated.

Required endpoints:

- `GET /health` or `GET /api/scanner/status` for connection testing.
- `GET /api/scanner/status` for catalog readiness (`catalog.ready`, set/card counts, last sync).
- `POST /api/catalog/sync` with an empty JSON body (`{}`) for all-set catalog sync. This assumes the backend sync-all implementation returns `{ syncedSets, syncedCards }`; older backend builds may only sync set metadata and require a backend rebuild/restart.
- `POST /api/scanner/resolve-text` for read-only OCR text resolution.

  Request sent by this app:

  ```json
  { "rawText": "UNL • 209/219", "region": "bottom-left" }
  ```

  The app omits `confidence` unless a future analyzer supplies one. When the ID crop reveals a set code, the app may include `setCodeHint` for full-frame exact-name fallback. `rawText` is capped at 2000 characters.

- `POST /api/collections/scan-preview` with grouped `{ catalogCardId, quantity, finish, condition, language }` rows to preview sell/keep/excluded recommendations. Foil-swap opportunities are surfaced when the backend sends `primaryReasonCode: "foil_preference"`, `opportunityType: "foil_swap"`, or `keepTargetSatisfiedByNormal: true`.
- `POST /api/collections/split-scan` with reviewed `allocations` to write sell rows to `To Be Sold` and keep rows to the default/owned collection. This is a staging workflow only; it does not list cards or call `/api/cards`.

## Open/run in Android Studio

1. Start the backend from the repo root, for example:

   ```bash
   docker compose up
   ```

2. Open **Android Studio**.
3. Choose **Open** and select `E:/Repositories/TCGPlayer-Automation/apps/scanner-android`.
4. Let Gradle sync and install any prompted Android SDK components.
5. Run the `app` configuration on a device or emulator. If using Android Studio QR pairing, code changes require pressing **Play** again after Gradle sync/build to reinstall the app on the phone.
6. Confirm the actual published backend port:

   ```bash
   docker compose ps
   ```

   Use the left side of the port mapping, for example `0.0.0.0:3001->3000/tcp` means the phone must use port `3001`.

7. On first launch, set the backend URL:
   - Android emulator to host machine: `http://10.0.2.2:<host-port>`
   - Physical phone on LAN: `http://<server-lan-ip>:<host-port>`, for example `http://192.168.1.50:3001`
   - Tailscale, if the phone is connected to the same tailnet: `http://<tailscale-ip>:<host-port>`, for example `http://100.108.48.42:3001`
8. Tap **Test** or **Refresh status** to inspect catalog readiness. If not ready or card counts are low, tap **Sync all sets**, wait for completion, then **Refresh status** / **Start scanner**.

## Cleartext HTTP policy

Debug builds allow cleartext HTTP for local/LAN testing. Release builds set `android:usesCleartextTraffic="false"`. The app does not include trust-all HTTPS or custom unsafe certificate handling.

For Android HTTP testing, the backend must actually be serving HTTP. In `.env`, set `HTTPS_ENABLED=false` and leave `HTTPS_CERT_FILE=` / `HTTPS_KEY_FILE=` blank, then restart the app container. If cert/key paths are still populated and readable, the server may serve HTTPS on the published port; the Android app will not trust that self-signed certificate.

## Connection troubleshooting

Current Docker examples:

- Dev profile default: `DEV_APP_HOST_PORT=3000`, so phone URL is usually `http://<lan-ip>:3000`.
- Prod profile often uses `APP_HOST_PORT=3001` when dev already occupies `3000`, so phone URL is usually `http://<lan-ip>:3001`.

Quick checks from the host:

```bash
grep -E '^(COMPOSE_PROFILES|APP_HOST_PORT|DEV_APP_HOST_PORT|HTTPS_ENABLED|HTTPS_CERT_FILE|HTTPS_KEY_FILE)=' .env
docker compose ps
curl -i http://localhost:<host-port>/health
curl -i http://<lan-ip>:<host-port>/health
```

Then open the same `/health` URL in the phone browser before testing the app. If the host works but the phone times out, check Windows Defender Firewall/private-network inbound rules for the published TCP port, Wi-Fi client isolation, and whether the phone is on the same LAN. For Tailscale URLs, ensure the phone is connected to the same tailnet and Windows Firewall allows inbound traffic on the Tailscale interface/port.

## Phone scanning flow

1. On setup, confirm catalog status shows ready with expected set/card counts. Use **Sync all sets** before scanning new/future sets.
2. Point the camera at one Riftbound card at a time.
3. Normal scanning uses a compact translucent bottom overlay with concise status and the last scanned card with **Normal** / **Shiny** controls. Tap the gear icon in the top-right for settings/catalog sync. Tap **Debug** only when troubleshooting OCR.
4. In debug mode, watch the **BL ID** / **BR ID** lines and ROI thumbnails. For normal cards, **BL ID** should show values like `UNL • 002/219`; the BL/BR thumbnail itself should visibly contain the printed ID before trusting scan accuracy. If the ID is outside the crop or blurry, move the card lower/closer, improve lighting, or use torch/focus controls from the device camera stack when available.
5. If BL/BR are empty, the app still sends **Full** OCR text such as `2 / Inferna` as a `native` full-frame exact-name fallback without a set hint. This is diagnostic/low-trust only: name-only matches are not auto-added.
6. The same trusted ID-based resolved catalog card must appear in 2 stable samples before it is added. Sliding a new card into the stand can hand off from the old latch after the new ID is stable, without requiring a blank frame. Full paired token IDs such as `UNL T07 // T04` can auto-add when the backend resolves them exactly. Ambiguous bare token IDs such as `UNL T07` open a selection dialog (for example `Sprite // Buff` vs `Sprite // Gold`) and do not add or beep until you choose one. A short tone plays once for each accepted session add.
7. Consecutive identical copies never auto-add twice in a row, even after moving the card away; tap **+1 last** for another copy. The same card can auto-add again later after a different card has been accepted in between.
8. Use **Undo** to remove the last added card.
9. Use the scanner-screen **Shiny** toggle to mark the last scanned copy as canonical finish `Foil` before review, or use **Done** and then **Mark one Shiny** / **Mark one Normal** on reviewed rows. Changing finish moves one scanned copy at a time and can split or merge groups for the same card. **+1 last** copies the last scanned card with its current finish.
10. Tap **Done** to preview sellability. The review shows **Set aside to sell** cards first, then **Add to collection / keep** cards. You can move rows between sell/keep before committing.
11. Tap **Add split collections** to add sell rows to `To Be Sold` and keep rows to the normal owned collection. A successful submit clears the session so the same grouped rows cannot be submitted twice.

## Gradle commands

From `apps/scanner-android`:

```bash
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

If no Gradle wrapper is present yet, run these from Android Studio's Gradle tool window or create a wrapper with the IDE/local Gradle first.

## Known spike limitations

- ROI cropping is fixed-position for this spike; it does not yet detect precise card bounds. Use **Show debug** and the ROI thumbnails to confirm whether the printed ID is inside the crop.
- ROI bitmaps are capped to avoid memory spikes; thumbnails are downscaled debug images, not full-resolution exports.
- No finish/foil detection; collection rows default to Near Mint / Normal / EN.
- No instrumentation/UI tests yet.
