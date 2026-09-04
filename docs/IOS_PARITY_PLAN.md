# iOS Parity Plan — EleBook (Ganesha rebrand + on-device parity)

Goal: run the app **as it exists today on Android** (this branch's `EleBook` wildlife
re-identification build) on an **iOS device**, at feature parity.

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

## 2. Mac-required steps (cannot be done on Linux/CI without a macOS runner)

Do these on a Mac with **Xcode 15+** (project targets **iOS 17.0** minimum — raised for
the Core ML image-gen dependency). In order:

1. **Install pods**
   ```bash
   npm install
   cd ios && pod install && cd ..
   ```
   Confirm autolinking picks up `onnxruntime-react-native`, `op-sqlite`,
   `react-native-reanimated`, `react-native-app-auth`, `react-native-keychain`,
   geolocation, image-picker, vector-icons, etc. (`Podfile.lock` already lists them).

2. **Open the workspace, set signing.**
   Open `ios/OffgridMobile.xcworkspace`, select the `OffgridMobile` target →
   Signing & Capabilities → pick your Team, let Xcode manage a provisioning profile
   for `org.ganesha.elebook`. The `increased-memory-limit` entitlement is already set
   (needed for on-device ML) — verify your provisioning profile allows it.

3. **Build & run to a device** (not just the simulator — see §3):
   ```bash
   npm run ios -- --device
   ```

4. **Smoke-test the parity-critical paths** on-device:
   - Camera capture → animal detection → MiewID embedding → match review → save observation.
   - Entra sign-in returns to the app (URL scheme works).
   - Pack download + sync (`packDownloadService`, `syncEngine`).
   - Voice input (Whisper) and photo-library attach.

---

## 3. Parity risks to verify (things that "should" work but must be confirmed on iOS)

- **ONNX Runtime execution provider.** MiewID inference runs via
  `onnxruntime-react-native`. Confirm the iOS build uses an available EP (Core ML or
  CPU) and that the MiewID + detector models load and produce embeddings matching the
  Android `ganeshaparity` benchmark. There are Android instrumentation parity tests
  (`androidTest/.../ganeshaparity/MiewId*Test.kt`) but **no iOS XCTest equivalent yet** —
  re-ID accuracy/latency on iOS is currently unverified.
- **Simulator vs device.** The iOS Simulator is x86/arm64 without a real NPU/Neural
  Engine and can behave differently for ONNX Core ML EP and for the Core ML diffusion
  module. Validate on physical hardware (A17 Pro-class per the README perf table).
- **op-sqlite storage paths.** The embedding DB and observation storage must resolve to
  an iOS-writable dir (app sandbox / `RNFS.DocumentDirectoryPath`), not an Android
  external-storage path. Spot-check `services/database/connection.ts` and
  `observationStorage.ts` at runtime.
- **Geolocation authorization.** iOS may require an explicit
  `Geolocation.requestAuthorization()` before the first `getCurrentPosition`. Today the
  code only gates on Android via `PermissionsAndroid`; on iOS it relies on the library's
  auto-prompt. Confirm the prompt appears; if not, add an iOS `requestAuthorization` call
  in `getDeviceLocation()`.
- **Image generation split.** Android uses `LocalDreamModule` (QNN/MNN NPU); iOS uses
  `CoreMLDiffusionModule` (Core ML). This is an intentional platform split, not a gap —
  but if image-gen is in scope for parity, exercise it separately on iOS.

---

## 4. Cosmetic / non-blocking

- **App icon.** `ios/.../Images.xcassets/AppIcon.appiconset/` still holds the original
  Off Grid icons. Replace with EleBook artwork to match the Android rebrand (does not
  affect running the app).
- **Duplicate module files.** The iOS native modules exist both at `ios/<Module>.swift`
  and `ios/OffgridMobile/<Module>/<Module>.m`. The Xcode project references a consistent
  set; the loose copies are clutter and can be pruned.

---

## 5. Summary

Getting today's Android build running on iOS is **realistic and mostly done**. The
blocking source-level gaps (camera crash, OAuth redirect, identity) are fixed on this
branch. What remains genuinely needs a Mac: `pod install`, signing, an on-device build,
and verifying ONNX/Core ML inference parity for the wildlife models.
