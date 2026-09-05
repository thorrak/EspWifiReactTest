# ESP WiFi React Test

Example/test app for the [`esp-wifi-config-react-native`](https://github.com/WiFiConfig/esp-wifi-config-react-native) library, tracking the **`main`** branch (v2.0.0+).

## Firmware compatibility

The library — and therefore this app — talks ESP-IDF Network Provisioning over BLE via `@orbital-systems/react-native-esp-idf-provisioning`. It requires ESP32 devices running [`esp_wifi_config`](https://github.com/WiFiConfig/esp_wifi_config) **≥ 0.2.0** (0.2.3 recommended). 0.1.0 provisions but cannot serve the `esp-wifi-config-network-info` endpoint (registered without its GATT characteristic). Older `0.0.x` firmware uses the v1 custom 0xFFE0 GATT protocol and will not be discoverable.

## Project Structure

```
.                          # Expo SDK 54 app
├── app/
│   ├── _layout.tsx        # Root layout — registers provision route as modal
│   ├── provision.tsx      # Renders ProvisioningNavigator with permission guard + error boundary
│   └── (tabs)/
│       ├── _layout.tsx    # Home + Diagnostics tabs
│       ├── index.tsx      # Home screen with "Start WiFi Provisioning" button
│       └── diagnostics.tsx# Step-based diagnostic for BleTransport / DeviceProtocol
├── metro.config.js        # Enables package-exports for the `/navigation` subpath
├── app.json               # BLE permissions and plugin config
└── package.json
```

## Key Architecture Decisions

### Library Install Source
Installed from GitHub: `github:WiFiConfig/esp-wifi-config-react-native` (default branch `main`). npm runs the library's `prepare` script (`bob build`) on install to generate `lib/`. Metro resolves to the TypeScript source via the package's `react-native` field, so library edits on `main` take effect after `npm update esp-wifi-config-react-native` (or a fresh `npm install` if the lockfile pins an older commit) plus a Metro restart.

### BLE peer dep
The library wraps `@orbital-systems/react-native-esp-idf-provisioning`, which in turn wraps Espressif's official iOS / Android provisioning SDKs. We declare it as a direct dependency. Its Expo config plugin is wired up in `app.json`:

```json
["@orbital-systems/react-native-esp-idf-provisioning", { "isBackgroundEnabled": false, "neverForLocation": true }]
```

`react-native-ble-plx` is **not** used anywhere — v2 replaced it entirely.

### Metro Config (metro.config.js)
Minimal — just sets `resolver.unstable_enablePackageExports = true` so the `esp-wifi-config-react-native/navigation` subpath import resolves via the library's `package.json` "exports" field.

### ProvisioningNavigator config
`app/provision.tsx` passes:
- `ble.deviceNamePrefix: 'PROV_'` — matches the firmware's runtime `prov_ble.device_name` default template `PROV_{id}` (there is no Kconfig option for it).
- `ble.security: 1` with `ble.proofOfPossession: 'abcd1234'` — set explicitly. The library has no implicit PoP anymore: unset → the wizard prompts (headless `connect()` throws `missing_credentials`); `''` → a device with no PoP. The value matches the firmware repo's `examples/with_ble`. Security and PoP are runtime `wifi_cfg_prov_config_t` fields, not Kconfig.
- `ble.promptForAuth: true` — enables the optional `enterDeviceAuth` step so the user types the PoP at runtime (right choice for per-device PoPs; with the PoP above set, the screen pre-fills it for fleet-wide testing).

### Pre-flight check
`provision.tsx` uses the library's `requestBluetoothPermissions()` helper instead of any direct BLE adapter API. The v1 "singleton BleManager + 200ms destroy delay" dance is gone — the SDK owns BLE lifecycle internally.

### Diagnostics tab (v2)
`app/(tabs)/diagnostics.tsx` instantiates `BleTransport` and `DeviceProtocol` directly to exercise each capability in isolation: permissions → scan (default + custom prefix) → connect → `getVersion()` / `getCapabilities()` / `getNetworkPolicy()` / `listVars()` / `scanWifi()` / `getNetworkInfo()` → disconnect. Useful for verifying that a firmware build exposes all five custom protocomm endpoints. `getNetworkInfo()` returns `{ connected: false }` before provisioning (the device has no IP yet), and errors on 0.1.0 firmware where the endpoint is unreachable.

## Build & Run

```bash
npm install
npx expo prebuild --clean  # regenerate ios/ and android/ for the new native module
npx expo run:ios --device  # physical device
npx expo run:android       # physical device (no BLE on emulator)
```

**Must use dev builds** (`expo run:ios` / `expo run:android`), not Expo Go (`expo start`). The orbital-systems native module isn't in Expo Go.

### Android Build Requirements
- **JDK 17 required** — Gradle 8.x does not support Java 25+ (`Unsupported class file major version 69`). JDK 17 is installed via Homebrew under `/opt/homebrew/Cellar/openjdk@17/` but is **not** registered with `/usr/libexec/java_home` (`java_home -v 17` returns the default openjdk 25), so `JAVA_HOME` must point at the Cellar path explicitly.
- Both `JAVA_HOME` and `ANDROID_HOME` are now set permanently in `~/.bash_profile` (the login shell's rc file — *not* `.bashrc`). `JAVA_HOME` is globbed (`openjdk@17/*/...`) so it auto-tracks brew upgrades. Note that line 107 of `.bash_profile` prepends the default openjdk 25 to `PATH`, so `java -version` reports 25 — Gradle honors `JAVA_HOME` regardless, so builds still use 17.
- If building from a shell that doesn't source `.bash_profile`, export both manually:
  ```bash
  export JAVA_HOME="$(ls -d /opt/homebrew/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home | sort -V | tail -1)"
  export ANDROID_HOME=~/Library/Android/sdk
  ```

## Known Issues

- **Simulator has no BLE**: provisioning needs a physical device. The home screen will load on a simulator but provisioning and diagnostics won't find anything.
- **New Arch**: `newArchEnabled: true` in `app.json`. If the orbital-systems SDK ever breaks under New Arch, flipping this to `false` and re-running `expo prebuild --clean` is the escape hatch.

## Library Peer Dependencies

All configured in `app.json` and `package.json`:
- `@orbital-systems/react-native-esp-idf-provisioning` — wraps Espressif's native provisioning SDK
- `expo-build-properties` — sets iOS deployment target to 15.1 (Expo SDK 54 minimum)
- `@react-navigation/native` + `@react-navigation/native-stack` — navigation (used internally by ProvisioningNavigator)
- `react-native-screens` + `react-native-safe-area-context` — navigation peer deps

## Don't Forget

- iOS deployment target must be >= 15.1 for Expo SDK 54
- Android needs `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` permissions
- iOS needs `NSBluetoothAlwaysUsageDescription` in infoPlist
- The library's only prod dependency is `zustand` — everything else is a peer dep
- The SDK's `provision()` does not return the device's IP, but the library reads it from the `esp-wifi-config-network-info` endpoint right after a join and surfaces it on `ProvisioningResult.networkInfo` (firmware 0.2.0+, best-effort). In practice this lands on iOS but not Android, where the BLE link drops as soon as `provision()` resolves — so treat `networkInfo` as iOS-mostly and fall back to mDNS or the firmware's HTTP API on the WiFi network.
