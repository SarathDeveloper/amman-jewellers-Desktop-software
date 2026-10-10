import { spawnSync } from 'node:child_process'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
  // Apple Silicon only, and always from the official nodejs.org build. Copying
  // process.execPath is not portable: a Homebrew Node links against Homebrew
  // dylibs and would not start on another Mac. The official darwin-arm64 tarball
  // ships a self-contained `bin/node`, so extract that instead.
  const archiveRoot = `node-v${nodeVersion}-darwin-arm64`
  targets.push({
    triple: 'aarch64-apple-darwin',
    output: join(binariesDir, 'jeweltrackerpro-api-aarch64-apple-darwin'),
    nodeUrl: `https://nodejs.org/dist/v${nodeVersion}/${archiveRoot}.tar.gz`,
    cacheName: `${archiveRoot}.tar.gz`,
    tarballMember: join(archiveRoot, 'bin', 'node'),
    samePlatform: false,
    darwin: true,
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

function runChecked(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

/// Extracts a single member (a path inside the archive) out of a .tar.gz.
function extractTarMember(archivePath, member, destPath) {
  const staging = join(cacheDir, `staging-${process.pid}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  try {
    runChecked('tar', ['-xzf', archivePath, '-C', staging, member])
    copyFileSync(join(staging, member), destPath)
  } finally {
    rmSync(staging, { recursive: true, force: true })
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
  } else if (target.tarballMember) {
    const cached = join(cacheDir, target.cacheName)
    await download(target.nodeUrl, cached)
    extractTarMember(cached, target.tarballMember, target.output)
  } else {
    const cached = join(cacheDir, target.cacheName)
    await download(target.nodeUrl, cached)
    copyFileSync(cached, target.output)
  }

  if (target.darwin) {
    // postject rewrites the Mach-O, which invalidates the existing code
    // signature. On Apple Silicon an invalid signature is a hard launch failure,
    // so strip the original (tolerating an already-unsigned binary) and ad-hoc
    // sign the result afterwards. `-` is the ad-hoc identity: no certificate.
    spawnSync('codesign', ['--remove-signature', target.output], { stdio: 'ignore' })
  }
  injectSea(target.output, blobPath)
  if (target.darwin) {
    runChecked('codesign', ['--sign', '-', '--force', target.output])
  }
  console.log(`Packaged sidecar ${target.triple} → ${target.output}`)
}
