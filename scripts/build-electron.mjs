import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')

const sharedAliasPlugin = {
  name: 'shared-alias',
  setup(build) {
    build.onResolve({ filter: /^@shared\// }, (args) => {
      const rel = args.path.slice('@shared/'.length)
      const base = join(root, 'shared', rel)
      for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
        if (existsSync(candidate)) {
          return { path: candidate }
        }
      }
      return { path: `${base}.ts` }
    })
  },
}

const mainOptions = {
  absWorkingDir: root,
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'electron-dist/main.js',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  plugins: [sharedAliasPlugin],
}

const preloadOptions = {
  absWorkingDir: root,
  entryPoints: ['electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'electron-dist/preload.cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
}

function copySplash() {
  const destDir = join(root, 'electron-dist')
  mkdirSync(destDir, { recursive: true })
  copyFileSync(join(root, 'electron', 'splash.html'), join(destDir, 'splash.html'))
}

if (watch) {
  const mainCtx = await esbuild.context(mainOptions)
  const preloadCtx = await esbuild.context(preloadOptions)
  copySplash()
  await Promise.all([mainCtx.watch(), preloadCtx.watch()])
  console.log('Watching electron main and preload…')
} else {
  await esbuild.build(mainOptions)
  await esbuild.build(preloadOptions)
  copySplash()
}
