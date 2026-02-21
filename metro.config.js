const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

const projectNodeModules = path.resolve(__dirname, 'node_modules');
// 
const libraryRoot = path.resolve(__dirname, '../esp_wifi_manager_react_native');

// The local library is symlinked — tell Metro to watch its source directory
config.watchFolders = [libraryRoot];

// Enable package.json "exports" field so subpath imports like
// 'esp-wifi-manager-react-native/navigation' resolve correctly.
config.resolver.unstable_enablePackageExports = true;

// Block the library's node_modules (except its own unique deps like zustand)
// so peer dependencies don't resolve from there.
const libNodeModules = libraryRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/node_modules';
config.resolver.blockList = [
  new RegExp(`${libNodeModules}/(?!zustand).*`),
];

// Provide the project's node_modules as a fallback so blocked deps resolve here.
// Build a map of all top-level packages in the project's node_modules.
const extraNodeModules = {};
for (const name of fs.readdirSync(projectNodeModules)) {
  if (name.startsWith('@')) {
    // Scoped packages
    const scopeDir = path.join(projectNodeModules, name);
    for (const pkg of fs.readdirSync(scopeDir)) {
      extraNodeModules[`${name}/${pkg}`] = path.join(scopeDir, pkg);
    }
  } else {
    extraNodeModules[name] = path.join(projectNodeModules, name);
  }
}
config.resolver.extraNodeModules = extraNodeModules;

module.exports = config;
