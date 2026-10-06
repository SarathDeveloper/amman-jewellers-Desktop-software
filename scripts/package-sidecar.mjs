import { spawnSync } from 'node:child_process'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'sidecar-dist', 'jeweltrackerpro-api.cjs')
const binariesDir = join(root, 'src-tauri', 'binaries')
const cacheDir = join(root, 'sidecar-dist', 'node-dist')

if (!existsSync(bundle)) {
  console.error('Sidecar bundle is missing. Run npm run sidecar:build first.')
  process.exit(1)
}

mkdirSync(binariesDir, { recursive: true })
mkdirSync(cacheDir, { recursive: true })

const nodeVersion = process.version.replace(/^v/, '')

const targets = [
  {
    triple: 'x86_64-pc-windows-msvc',
    output: join(binariesDir, 'jeweltrackerpro-api-x86_64-pc-windows-msvc.exe'),
    nodeUrl: `https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`,
    cacheName: `node-v${nodeVersion}-win-x64.exe`,
    samePlatform: process.platform === 'win32' && process.arch === 'x64',
  },
]

if (process.platform === 'darwin') {
  const triple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  targets.push({
    triple,
    output: join(binariesDir, `jeweltrackerpro-api-${triple}`),
    nodeUrl: null,
    cacheName: null,
    samePlatform: true,
  })
}

async function download(url, dest) {
  if (existsSync(dest)) {
    return
  }
  console.log(`Downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
  }
  await pipeline(response.body, createWriteStream(dest))
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`Command failed: node ${args.join(' ')}`)
  }
}

function injectSea(exePath, blobPath) {
  const postject = join(root, 'node_modules', 'postject', 'dist', 'cli.js')
  if (!existsSync(postject)) {
    throw new Error('postject is not installed. Run npm install.')
  }
  const args = [
    postject,
    exePath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    '--overwrite',
  ]
  if (process.platform === 'darwin') {
    args.push('--macho-segment-name', 'NODE_SEA')
  }
  runNode(args)
}

const configPath = join(root, 'sidecar-dist', 'sea-config.json')
const blobPath = join(root, 'sidecar-dist', 'sea-prep.blob')
writeFileSync(
  configPath,
  JSON.stringify(
    {
      main: bundle,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
    },
    null,
    2,
  ),
)
runNode(['--experimental-sea-config', configPath])

for (const target of targets) {
  if (target.samePlatform) {
    copyFileSync(process.execPath, target.output)
  } else {
    const cached = join(cacheDir, target.cacheName)
    await download(target.nodeUrl, cached)
    copyFileSync(cached, target.output)
  }
  injectSea(target.output, blobPath)
  console.log(`Packaged sidecar ${target.triple} → ${target.output}`)
}
