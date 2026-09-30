module.exports = {
  appId: 'com.jeweltrackerpro.desktop',
  productName: 'JewelTrackerPro',
  copyright: 'Copyright © JewelTrackerPro',
  directories: {
    output: 'release',
  },
  files: ['electron-dist/**/*', 'dist/**/*', 'package.json'],
  extraResources: [
    {
      from: 'server/db/migrations',
      to: 'migrations',
    },
  ],
  asar: true,
  asarUnpack: ['**/*.node', '**/better-sqlite3/**'],
  npmRebuild: true,
  electronLanguages: ['en'],
  win: {
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
    target: ['dmg'],
    category: 'public.app-category.business',
    artifactName: '${productName}-${version}-${arch}.${ext}',
    identity: null,
  },
  dmg: {
    artifactName: '${productName}-${version}.${ext}',
  },
  linux: {
    target: ['AppImage'],
    category: 'Office',
  },
}
