import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binariesDir = join(root, 'src-tauri', 'binaries')

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
    build.onResolve({ filter: /\.node$/ }, (args) => ({
      path: args.path,
      external: true,
    }))
  },
}

mkdirSync(join(root, 'sidecar-dist'), { recursive: true })
mkdirSync(binariesDir, { recursive: true })

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'sidecar-dist/jeweltrackerpro-api.cjs',
  sourcemap: false,
  logLevel: 'info',
  plugins: [sharedAliasPlugin],
})

const prebuilds = join(root, 'node_modules', 'better-sqlite3', 'prebuilds')
const addons = [
  ['win32-x64.node', 'better-sqlite3-win32-x64.node'],
  ['darwin-arm64.node', 'better-sqlite3-darwin-arm64.node'],
  ['darwin-x64.node', 'better-sqlite3-darwin-x64.node'],
  ['linux-x64.node', 'better-sqlite3-linux-x64.node'],
]

for (const [sourceName, destName] of addons) {
  const source = join(prebuilds, sourceName)
  if (!existsSync(source)) {
    continue
  }
  copyFileSync(source, join(binariesDir, destName))
  console.log(`Copied SQLite addon ${sourceName} → src-tauri/binaries/${destName}`)
}
