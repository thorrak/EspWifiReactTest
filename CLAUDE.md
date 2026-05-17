# ESP WiFi React Test

Example/test app for the [`esp-wifi-config-react-native`](https://github.com/thorrak/esp_wifi_config_react_native) library.

## Project Structure

```
.                          # Expo SDK 54 app
├── app/
│   ├── _layout.tsx        # Root layout — registers provision route as modal
│   ├── provision.tsx      # Renders ProvisioningNavigator with BLE guard + error boundary
│   └── (tabs)/
│       ├── _layout.tsx    # Home + Diagnostics tabs
│       ├── index.tsx      # Home screen with "Start WiFi Provisioning" button
│       └── diagnostics.tsx# Low-level BLE diagnostics that exercise GATT directly
├── metro.config.js        # Enables package-exports for the `/navigation` subpath
├── app.json               # BLE permissions and plugin config
└── package.json
```

## Key Architecture Decisions

### Library Install Source
The library is installed from GitHub via `git+https://github.com/thorrak/esp_wifi_config_react_native.git` in `package.json`. npm runs the library's `prepare` script (`bob build`) on install to generate the compiled `lib/` output. Metro still resolves to the TypeScript source via the package's `react-native` field.

### Metro Config (metro.config.js)
Minimal — just sets `resolver.unstable_enablePackageExports = true` so the `esp-wifi-config-react-native/navigation` subpath import resolves via the library's `package.json` "exports" field.

### BLE Manager Singleton Constraint
`react-native-ble-plx` only allows one `BleManager` instance at a time. The provisioning screen (`provision.tsx`) creates a temporary one to check BLE state, then awaits `manager.destroy()` before letting `ProvisioningNavigator` render (which creates its own internally via `BleTransport`). Never have two `BleManager` instances alive simultaneously.

### ProvisioningNavigator Import
Uses subpath export: `esp-wifi-config-react-native/navigation`. This requires `unstable_enablePackageExports` in Metro. If the library re-exports `ProvisioningNavigator` from its main entry, the import can change to `esp-wifi-config-react-native` and that Metro setting becomes unnecessary.

## Build & Run

```bash
npm install
npx expo prebuild          # generates ios/ and android/
npx expo run:ios --device  # physical device
npx expo run:android       # physical device (no BLE on emulator)
```

**Must use dev builds** (`expo run:ios` / `expo run:android`), not Expo Go (`expo start`). Native BLE modules aren't in Expo Go.

### Android Build Requirements
- **JDK 17 required** — Gradle 8.x does not support Java 25+. JDK 17 is installed via Homebrew at `/opt/homebrew/Cellar/openjdk@17/17.0.18/libexec/openjdk.jdk/Contents/Home` but is not symlinked into `java_home`, so it won't be found automatically.
- **`ANDROID_HOME` is not set** in shell profile. The SDK lives at `~/Library/Android/sdk`.
- Before building Android, export both:
  ```bash
  export JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.18/libexec/openjdk.jdk/Contents/Home
  export ANDROID_HOME=~/Library/Android/sdk
  ```

## Known Issues

- **Library teardown BleError**: When dismissing the provisioning flow, an unhandled promise rejection occurs (`BleError: Unknown error`). This is a library bug — in-flight BLE operations reject after `BleTransport.destroy()` is called. The error is logged but doesn't crash the app.
- **Simulator has no BLE**: The app shows "Bluetooth Unavailable" on simulators, which is correct behavior. Test BLE features on a physical device.

## Library Peer Dependencies

All configured in `app.json` and `package.json`:
- `react-native-ble-plx` — BLE communication (with `neverForLocation: true` plugin option)
- `expo-build-properties` — Sets iOS deployment target to 15.1 (Expo SDK 54 minimum)
- `@react-navigation/native` + `@react-navigation/native-stack` — Navigation (used by ProvisioningNavigator internally)
- `react-native-screens` + `react-native-safe-area-context` — Navigation peer deps

## Don't Forget

- iOS deployment target must be >= 15.1 for Expo SDK 54
- Android needs `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` permissions
- iOS needs `NSBluetoothAlwaysUsageDescription` in infoPlist
- The library's only prod dependency is `zustand` — everything else is a peer dep
