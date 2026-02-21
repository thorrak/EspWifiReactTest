# EspWifiReactTest

Example app demonstrating [esp-wifi-manager-react-native](https://github.com/your-org/esp-wifi-manager-react-native) — a React Native library for BLE-based WiFi provisioning of ESP32 devices.

## Prerequisites

- Node.js 18+
- Xcode 15+ (iOS) or Android Studio (Android)
- An iOS or Android device/simulator
- **Cannot run in Expo Go** — native BLE modules require a dev build

## Getting Started

```bash
cd EspWifiReactTest
npm install
npx expo prebuild
npx expo run:ios    # or: npx expo run:android
```

The first build compiles all native code and takes several minutes. Subsequent builds are incremental.

## How It Works

The app has two screens:

- **Home** (`app/(tabs)/index.tsx`) — A button to launch WiFi provisioning, plus a result display area.
- **Provisioning** (`app/provision.tsx`) — A modal screen that renders `ProvisioningNavigator` full-screen. The navigator handles the entire provisioning flow (device scanning, network selection, credentials, connection). On completion or dismissal, it navigates back to the home screen.

The root layout (`app/_layout.tsx`) registers the provisioning screen as a modal:

```tsx
<Stack.Screen
  name="provision"
  options={{ presentation: 'modal', headerShown: false }}
/>
```

## Local Library Development

This project references `esp-wifi-manager-react-native` as a local symlink (`file:../esp_wifi_manager_react_native` in `package.json`). This requires extra Metro configuration in `metro.config.js`:

- **`watchFolders`** — Tells Metro to watch the library's source directory for changes.
- **`unstable_enablePackageExports`** — Enables the `exports` field in `package.json`, required for the library's `/navigation` subpath export.
- **`blockList`** — Prevents Metro from resolving peer dependencies (`react`, `react-native`, etc.) from the library's own `node_modules`, which would cause version mismatches.
- **`extraNodeModules`** — Provides the project's `node_modules` as a fallback for blocked resolutions, since the library source isn't a descendant of this project directory.

**When the library is published to npm**, none of this is needed except `unstable_enablePackageExports` (for the `/navigation` subpath import). If the library re-exports `ProvisioningNavigator` from its main entry point, no Metro config changes are needed at all.

## Building Your Own App

### 1. Install dependencies

```bash
npx expo install esp-wifi-manager-react-native react-native-ble-plx expo-build-properties
npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

### 2. Configure BLE permissions in app.json

Add the config plugins for BLE:

```json
{
  "plugins": [
    ["react-native-ble-plx", { "neverForLocation": true }],
    ["expo-build-properties", { "ios": { "deploymentTarget": "15.1" } }]
  ]
}
```

Add the iOS Bluetooth usage description:

```json
{
  "ios": {
    "infoPlist": {
      "NSBluetoothAlwaysUsageDescription": "This app uses Bluetooth to communicate with ESP devices for WiFi provisioning."
    }
  }
}
```

Add Android BLE permissions:

```json
{
  "android": {
    "permissions": [
      "BLUETOOTH_SCAN",
      "BLUETOOTH_CONNECT",
      "ACCESS_FINE_LOCATION"
    ]
  }
}
```

### 3. Render ProvisioningNavigator

The simplest integration — render it in a screen and handle the callbacks:

```tsx
import { ProvisioningNavigator } from 'esp-wifi-manager-react-native/navigation';

function ProvisionScreen() {
  return (
    <ProvisioningNavigator
      onComplete={(result) => {
        // result: { success, ssid, ip, deviceName, deviceId }
        console.log('Provisioning complete:', result);
      }}
      onDismiss={() => {
        // User cancelled — navigate back
      }}
    />
  );
}
```

`ProvisioningNavigator` manages its own internal navigation stack — just give it a full-screen container.

### 4. Build and run

```bash
npx expo prebuild
npx expo run:ios
```

You must use `expo run:ios` or `expo run:android` (dev builds). **Expo Go does not work** because BLE requires native modules that aren't included in the Expo Go client.

### Key Points

- **Dev builds only** — `react-native-ble-plx` is a native module. Use `expo run:ios` / `expo run:android`, not `expo start`.
- **iOS deployment target** — Must be at least 15.1 for Expo SDK 54. Set via `expo-build-properties`.
- **`neverForLocation: true`** — The `react-native-ble-plx` plugin option tells iOS that BLE is not used for location tracking, avoiding a location permission prompt.
- **ProvisioningNavigator props** — Supports optional `theme` (color customization) and `config` (service configuration) props beyond `onComplete` and `onDismiss`.
- **Headless usage** — If you don't want the pre-built UI, the library exports hooks (`useProvisioning`, `useDeviceScanner`, `useBleConnection`, etc.) and service classes (`BleTransport`, `DeviceProtocol`, `ProvisioningManager`) for building a fully custom flow.
