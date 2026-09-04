# iOS Parity Plan — EleBook (Ganesha rebrand + on-device parity)

Goal: run the app **as it exists today on Android** (this branch's `EleBook` wildlife
re-identification build) on an **iOS device**, at feature parity.

## Current status

The iOS integration patch was merged into the EleBook feature branch as `069a524`.
Shared TypeScript/Jest checks and the Android unit, lint, and debug-build checks passed
against the proposed merge. The remaining work below is owned by the iOS contributor.

These known limitations do **not** block opening a draft pull request to Wild Me. They
do block describing iOS as field-ready:

- The repository's CocoaPods 1.17 lockfile requires `xcodeproj >= 1.28.1`, while the
  current `Gemfile` requires `xcodeproj < 1.26.0`; the Ruby toolchain must be reconciled
  and pinned with a committed `Gemfile.lock`.
- A clean macOS install, SwiftLint, XCTest, simulator build, and device/archive build
  have not been independently reproduced after the merge.
- Entra sign-in reaches Microsoft login, but the callback, token storage, and one
  authenticated EleBook API request still need an end-to-end device check.
- Model and pack download, offline inference, GPS, persistence after restart, and sync
  still need the full workflow check on a physical iPhone.
- Institutional signing ownership, supported iPhone/iOS versions, and distribution
  through TestFlight or the App Store remain operational decisions.
- The AppAuth URL callback should fall back to React Native linking when AppAuth does
  not consume a URL.
- Privacy descriptions must reflect elephant photo capture/selection and must not
  request microphone or speech access unless those capabilities are actually shipped.

This is not a port. The app is already a bare React Native 0.83.1 cross‑platform
project with a complete iOS target (Xcode project + workspace, Podfile, AppDelegate,
entitlements, launch screen, privacy manifest, and native Swift modules). The whole
wildlife pipeline (capture → detect → MiewID embedding → match review → observation
storage → sync) lives in the shared `src/` JS/TS layer and runs on cross‑platform
libraries (`onnxruntime-react-native`, `@op-engineering/op-sqlite`, `react-native-fs`).
The only custom native module the JS calls is `ImageTensorModule`, which already has a
Swift implementation. So the work is **finishing the iOS side of the rebrand + verifying
the new feature runs on-device**, not writing a new app.

---

## 1. Changes already made on this branch (source-level, no Mac required)

These are committed on `feat/ganesha-elebook-rebrand-and-ondevice-parity-ios`:

| Change | File | Why it matters for parity |
|---|---|---|
| Added `NSCameraUsageDescription` | `ios/OffgridMobile/Info.plist` | **Hard crash** on iOS the moment the camera is opened if absent. This is a camera-first wildlife-capture app. |
| Added `NSLocationWhenInUseUsageDescription` | `ios/OffgridMobile/Info.plist` | Android tags observations with GPS (`ACCESS_FINE_LOCATION`). Without this key, `Geolocation.getCurrentPosition` is denied on iOS and GPS silently returns `null`. |
| Registered `org.ganesha.elebook` URL scheme (`CFBundleURLTypes`) | `ios/OffgridMobile/Info.plist` | Entra sign-in (`react-native-app-auth`) redirects to `org.ganesha.elebook://oauthredirect`. Android registers this via the `appAuthRedirectScheme` manifest placeholder; iOS needs it in `CFBundleURLTypes` or the OAuth callback never returns to the app. |
| Bundle IDs `ai.offgridmobile` → `org.ganesha.elebook` (app + `.tests`) | `ios/OffgridMobile.xcodeproj/project.pbxproj` | Match the Android `applicationId` and the Entra redirect scheme. |
| Display name `Off Grid` → `EleBook` | `Info.plist` + `project.pbxproj` (`INFOPLIST_KEY_CFBundleDisplayName`) | Match the Android `app_name` (`EleBook`). |

Left intentionally untouched: internal string constants like the download-manager
dispatch-queue label and `UserDefaults` keys (`ai.offgridmobile.*`) and the background
download identifier. They are private namespaces, not the bundle ID, and renaming them
buys nothing while risking state-migration bugs. Optional cosmetic cleanup only.

---

## 2. iOS contributor follow-up (Mac required)

Do these on a Mac with a supported Xcode version. The project currently targets iOS
17.0; confirm that this includes the expected field devices before treating it as the
supported floor.

1. **Reconcile and install dependencies**
   ```bash
  npm ci
  bundle install
  cd ios && bundle exec pod install && cd ..
   ```
  Fix the incompatible CocoaPods/xcodeproj constraints first, commit `Gemfile.lock`,
  and verify that a second install produces no `Podfile.lock` diff.
   Confirm autolinking picks up `onnxruntime-react-native`, `op-sqlite`,
   `react-native-reanimated`, `react-native-app-auth`, `react-native-keychain`,
   geolocation, image-picker, vector-icons, etc. (`Podfile.lock` already lists them).

2. **Open the workspace, set signing.**
   Open `ios/OffgridMobile.xcworkspace`, select the `OffgridMobile` target →
   Signing & Capabilities → pick your Team, let Xcode manage a provisioning profile
  for `org.ganesha.elebook`. An increased-memory entitlement file exists, but its
  target wiring and provisioning support are not yet verified; enable it only if
  device measurements show it is required.

3. **Build & run to a device** (not just the simulator — see §3):
   ```bash
   npm run ios -- --device
   ```

4. **Smoke-test the parity-critical paths** on-device:
   - Camera capture → animal detection → MiewID embedding → match review → save observation.
   - Entra sign-in returns to the app (URL scheme works).
   - Pack download + sync (`packDownloadService`, `syncEngine`).
  - Photo-library selection, GPS consent, force-quit persistence, and reconnect sync.

---

## 3. Parity risks to verify (things that "should" work but must be confirmed on iOS)

- **ONNX Runtime execution provider.** MiewID inference runs via
  `onnxruntime-react-native`. Confirm the iOS build uses an available EP (Core ML or
  CPU) and that the MiewID + detector models load and produce embeddings matching the
  Android `ganeshaparity` benchmark. There are Android instrumentation parity tests
  (`androidTest/.../ganeshaparity/MiewId*Test.kt`) but **no iOS XCTest equivalent yet** —
  re-ID accuracy/latency on iOS is currently unverified.
- **Simulator vs device.** The iOS Simulator is x86/arm64 without the same hardware
  characteristics as a phone and can behave differently for ONNX execution providers.
  Validate on the physical iPhones expected in the field.
- **op-sqlite storage paths.** The embedding DB and observation storage must resolve to
  an iOS-writable dir (app sandbox / `RNFS.DocumentDirectoryPath`), not an Android
  external-storage path. Spot-check `services/database/connection.ts` and
  `observationStorage.ts` at runtime.
- **Geolocation authorization.** iOS may require an explicit
  `Geolocation.requestAuthorization()` before the first `getCurrentPosition`. Today the
  code only gates on Android via `PermissionsAndroid`; on iOS it relies on the library's
  auto-prompt. Confirm the prompt appears; if not, add an iOS `requestAuthorization` call
  in `getDeviceLocation()`.
---

## 4. Non-blocking follow-up

- **App icon.** `ios/.../Images.xcassets/AppIcon.appiconset/` still holds the original
  Off Grid icons. Replace with EleBook artwork to match the Android rebrand (does not
  affect running the app).
- **Duplicate module files.** The iOS native modules exist both at `ios/<Module>.swift`
  and `ios/OffgridMobile/<Module>/<Module>.m`. The Xcode project references a consistent
  set; the loose copies are clutter and can be pruned.

---

## 5. Acceptance boundary

The merged source-level changes are suitable for inclusion in a draft upstream pull
request with this document linked as a known-limitations record. iOS becomes field-ready
only after a clean Mac build and the complete physical-device workflow pass. Until then,
the supported field path remains Android and affected iPhone users need named Android
fallback devices.
