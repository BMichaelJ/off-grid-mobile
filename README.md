# EleBook Mobile

Android-first offline elephant identification for Project Ganesha.

EleBook detects an elephant in a field photo, extracts a MiewID v4.1 embedding
on the device, and compares it with a downloaded project pack using full cosine
similarity. Capture, identification, review, and local persistence work without
connectivity. Authentication is required only to download private artifacts or
sync queued observations.

## Field release

- Package: `org.ganesha.elebook`
- Current candidate: `0.1.0-field.1`
- Minimum Android: API 24
- Field architecture: `arm64-v8a`
- Runtime: ONNX Runtime CPU at 440 x 440
- Model: MiewID v4.1, downloaded after sign-in
- Pack: project-scoped, private Blob Storage download with a short-lived SAS URL

The APK does not bundle model weights or embedding packs.

## Verified Pixel 9a workflow

1. Install the signed APK.
2. Sign in with Microsoft Entra ID.
3. Download the MiewID model and Kariega embedding pack.
4. Disable connectivity.
5. Select or capture an elephant photo.
6. Review and approve a candidate match.
7. Add optional observation notes and save.
8. Force-stop and reopen the app; the observation remains local.
9. Restore connectivity and use **Sync All**.

The `0.1.0-field.1` candidate was verified on Android 16 with the full
60-individual Kariega pack. A Thomas test image returned Thomas at rank 1 with
cosine similarity `0.9540`. This is a workflow/parity check, not an accuracy
estimate.

## Build

Requirements:

- Node.js 20+
- JDK 17
- Android SDK 36
- Android NDK `27.1.12297006`

```powershell
npm ci
npx tsc --noEmit
npx eslint .
npx jest --coverage --forceExit

Set-Location android
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleRelease
```

Release builds require all four Gradle properties. The build fails instead of
falling back to the debug key when any value is missing:

```properties
ELEBOOK_RELEASE_STORE_FILE=elebook-release.keystore
ELEBOOK_RELEASE_STORE_PASSWORD=...
ELEBOOK_RELEASE_KEY_ALIAS=...
ELEBOOK_RELEASE_KEY_PASSWORD=...
```

Keep these values in user-level Gradle properties or CI secrets. Never commit
the keystore or passwords.

The signed APK is generated at:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Release workflow

`.github/workflows/release.yml` creates a manually dispatched GitHub
prerelease. It:

1. restores the release keystore from GitHub secrets;
2. runs TypeScript, ESLint, Jest, Android unit tests, and Android lint;
3. builds the signed ARM64 APK;
4. verifies its signature and APK zip alignment;
5. publishes the APK and SHA-256 checksum.

Required repository secrets:

- `ELEBOOK_RELEASE_KEYSTORE_BASE64`
- `ELEBOOK_RELEASE_STORE_PASSWORD`
- `ELEBOOK_RELEASE_KEY_ALIAS`
- `ELEBOOK_RELEASE_KEY_PASSWORD`

## Privacy

- Precise elephant locations are not included in embedding packs.
- Reference photos are re-encoded without EXIF metadata.
- Model and pack blobs remain private and are downloaded through expiring SAS
  URLs.
- Observation photos and GPS remain on-device until the user explicitly syncs.

## Known external gate

MiewID model-weight redistribution permission must be confirmed with Wild Me /
Conservation X Labs before distributing the field build beyond the controlled
test group.

Before broader device distribution, follow up on 16 KB ELF segment alignment
for the remaining native dependencies; `zipalign -P 16` alone does not prove
that compatibility.

## Project context

The mobile app is based on the Wild Me `off-grid-mobile` wildlife re-ID branch.
Project-level architecture, requirements, and field-test status live in the
Project Ganesha repository.
