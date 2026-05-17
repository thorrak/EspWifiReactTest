# EspWifiReactTest

Example app demonstrating [esp-wifi-config-react-native](https://github.com/thorrak/esp_wifi_config_react_native) — a React Native library for BLE-based WiFi provisioning of ESP32 devices running [esp_wifi_config](https://github.com/thorrak/esp_wifi_config).

## Prerequisites

- Node.js 18+
- Xcode 15+ (iOS) or Android Studio (Android)
- An iOS or Android physical device (BLE is not available in simulators/emulators)
- **Cannot run in Expo Go** — native BLE modules require a dev build

## Getting Started

```bash
npm install
npx expo prebuild
npx expo run:ios --device      # or: npx expo run:android
```

The first build compiles all native code and takes several minutes. Subsequent builds are incremental.

## How It Works

The app has two tabs:

- **Home** (`app/(tabs)/index.tsx`) — A button that launches the WiFi provisioning flow and shows the result.
- **Diagnostics** (`app/(tabs)/diagnostics.tsx`) — A low-level BLE diagnostics screen that exercises the underlying GATT services directly.

Provisioning itself runs in a modal route at `app/provision.tsx`, which renders `ProvisioningNavigator` full-screen. The navigator handles the entire flow (device scanning, network selection, credentials, connection). On completion or dismissal, it navigates back to the home screen.

The root layout (`app/_layout.tsx`) registers the provisioning screen as a modal:

```tsx
<Stack.Screen
  name="provision"
  options={{ presentation: 'modal', headerShown: false }}
/>
```

## Building Your Own App

### 1. Install the library and its peer dependencies

```bash
npm install git+https://github.com/thorrak/esp_wifi_config_react_native.git
npx expo install react-native-ble-plx expo-build-properties
npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

### 2. Configure BLE permissions in `app.json`

```json
{
  "plugins": [
    ["react-native-ble-plx", { "neverForLocation": true }],
    ["expo-build-properties", { "ios": { "deploymentTarget": "15.1" } }]
  ],
  "ios": {
    "infoPlist": {
      "NSBluetoothAlwaysUsageDescription": "This app uses Bluetooth to communicate with ESP devices for WiFi provisioning."
    }
  },
  "android": {
    "permissions": [
      "BLUETOOTH_SCAN",
      "BLUETOOTH_CONNECT",
      "ACCESS_FINE_LOCATION"
    ]
  }
}
```

### 3. Enable package exports in `metro.config.js`

The library's `/navigation` subpath import requires Metro's package-exports support:

```js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
```

### 4. Render `ProvisioningNavigator`

```tsx
import { ProvisioningNavigator } from 'esp-wifi-config-react-native/navigation';

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

### 5. Build and run

```bash
npx expo prebuild
npx expo run:ios --device     # or: npx expo run:android
```

You must use `expo run:ios` or `expo run:android` (dev builds). **Expo Go does not work** because BLE requires native modules that aren't included in the Expo Go client.

## Key Points

- **Dev builds only** — `react-native-ble-plx` is a native module. Use `expo run:ios` / `expo run:android`, not `expo start`.
- **iOS deployment target** — Must be at least 15.1 for Expo SDK 54. Set via `expo-build-properties`.
- **`neverForLocation: true`** — The `react-native-ble-plx` plugin option tells iOS that BLE is not used for location tracking, avoiding a location permission prompt.
- **Android 12+ runtime permissions** — `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` are runtime permissions on API 31+; `app/provision.tsx` requests them before initialising BLE.
- **`ProvisioningNavigator` props** — Supports optional `theme` (color customization) and `config` (service/scan configuration) props beyond `onComplete` and `onDismiss`.
- **Headless usage** — If you don't want the pre-built UI, the library exports hooks (`useProvisioning`, `useDeviceScanner`, `useBleConnection`, etc.) and service classes (`BleTransport`, `DeviceProtocol`, `ProvisioningManager`) for building a fully custom flow.
