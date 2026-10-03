module.exports = {
  appId: 'com.jeweltrackerpro.desktop',
  productName: 'JewelTrackerPro',
  copyright: 'Copyright © JewelTrackerPro',
  directories: {
    output: 'release',
  },
  files: ['electron-dist/**/*', 'dist/**/*', 'package.json', 'src/images/**/*'],
  extraResources: [
    {
      from: 'server/db/migrations',
      to: 'migrations',
    },
  ],
  asar: true,
  asarUnpack: ['**/*.node'],
  // better-sqlite3 ships N-API prebuilds. Rebuilding from macOS cannot
  // cross-compile the Windows addon, so keep the published win32-x64.node.
  npmRebuild: false,
  electronLanguages: ['en'],
  win: {
    icon: 'build/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: '${productName}-Setup-${version}.${ext}',
    requestedExecutionLevel: 'asInvoker',
    extraResources: [
      {
        from: 'node_modules/better-sqlite3/prebuilds/win32-x64.node',
        to: 'better-sqlite3/win32-x64.node',
      },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'JewelTrackerPro',
    uninstallDisplayName: 'JewelTrackerPro',
  },
  mac: {
    icon: 'build/icon.icns',
    target: ['dmg'],
    category: 'public.app-category.business',
    artifactName: '${productName}-${version}-${arch}.${ext}',
    identity: null,
    extraResources: [
      {
        from: 'node_modules/better-sqlite3/prebuilds/darwin-arm64.node',
        to: 'better-sqlite3/darwin-arm64.node',
      },
      {
        from: 'node_modules/better-sqlite3/prebuilds/darwin-x64.node',
        to: 'better-sqlite3/darwin-x64.node',
      },
    ],
  },
  dmg: {
    artifactName: '${productName}-${version}.${ext}',
  },
  linux: {
    icon: 'build/icon.png',
    target: ['AppImage'],
    category: 'Office',
    extraResources: [
      {
        from: 'node_modules/better-sqlite3/prebuilds/linux-x64.node',
        to: 'better-sqlite3/linux-x64.node',
      },
    ],
  },
}
