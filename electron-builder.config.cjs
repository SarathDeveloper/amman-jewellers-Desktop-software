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
  asarUnpack: ['**/*.node', '**/better-sqlite3/**'],
  // better-sqlite3 ships N-API prebuilds, including win32-x64. Rebuilding from
  // macOS fails because node-gyp cannot cross-compile that addon.
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
  },
  dmg: {
    artifactName: '${productName}-${version}.${ext}',
  },
  linux: {
    icon: 'build/icon.png',
    target: ['AppImage'],
    category: 'Office',
  },
}
