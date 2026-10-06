import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resources = join(root, 'src-tauri', 'resources')
const dist = join(root, 'dist')
const migrations = join(root, 'server', 'db', 'migrations')

if (!existsSync(dist)) {
  console.error('Frontend dist/ is missing. Run npm run build first.')
  process.exit(1)
}

if (!existsSync(migrations)) {
  console.error('server/db/migrations is missing.')
  process.exit(1)
}

rmSync(resources, { recursive: true, force: true })
mkdirSync(join(resources, 'dist'), { recursive: true })
mkdirSync(join(resources, 'migrations'), { recursive: true })
cpSync(dist, join(resources, 'dist'), { recursive: true })
cpSync(migrations, join(resources, 'migrations'), { recursive: true })
cpSync(join(root, 'package.json'), join(resources, 'package.json'))
console.log('Prepared src-tauri/resources (dist, migrations, package.json)')
