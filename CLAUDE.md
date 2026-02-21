# ESP WiFi React Test 2

Example/test app for the `esp-wifi-manager-react-native` library.

## Project Structure

```
.                          # Expo SDK 54 app
├── app/
│   ├── _layout.tsx        # Root layout — registers provision route as modal
│   ├── provision.tsx      # Renders ProvisioningNavigator with BLE guard + error boundary
│   └── (tabs)/
│       ├── _layout.tsx    # Tab layout (Home only)
│       └── index.tsx      # Home screen with "Start WiFi Provisioning" button
├── metro.config.js        # Critical config for symlinked local library
├── app.json               # BLE permissions and plugin config
└── package.json
```

## Key Architecture Decisions

### Local Library Symlink
The library is at `/Users/jbeeler/VSCodeProjects/esp_wifi_manager_react_native` and installed via `file:` reference (creates a symlink). This requires extensive Metro config — see `metro.config.js` comments for details. When the library is published to npm, most of this config goes away.

### Metro Config (metro.config.js)
This is the most complex file in the project. It solves three problems:
1. **`watchFolders`** — Metro must watch the symlinked library directory
2. **`blockList`** — The library's own `node_modules/` must be blocked (except `zustand`) to prevent duplicate React/RN instances
3. **`extraNodeModules`** — Maps all project packages as fallback resolution targets since the library source isn't a descendant of this project directory
4. **`unstable_enablePackageExports`** — Required for the `/navigation` subpath import

### BLE Manager Singleton Constraint
`react-native-ble-plx` only allows one `BleManager` instance at a time. The provisioning screen (`provision.tsx`) creates a temporary one to check BLE state, then **destroys it with a 200ms delay** before `ProvisioningNavigator` renders (which creates its own internally via `BleTransport`). Never have two `BleManager` instances alive simultaneously.

### ProvisioningNavigator Import
Currently uses subpath export: `esp-wifi-manager-react-native/navigation`. This requires `unstable_enablePackageExports` in Metro. If the library adds this to its main export, the import can change to `esp-wifi-manager-react-native` and that Metro setting becomes unnecessary.

## Build & Run

```bash
npm install
npx expo prebuild          # generates ios/ and android/
npx expo run:ios           # simulator
npx expo run:ios --device  # physical device
```

**Must use dev builds** (`expo run:ios`), not Expo Go (`expo start`). Native BLE modules aren't in Expo Go.

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
