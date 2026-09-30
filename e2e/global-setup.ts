import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default function globalSetup(): void {
  const dist = resolve('dist/index.html')
  if (!existsSync(dist)) {
    execSync('npm run build', { stdio: 'inherit', cwd: resolve('.') })
  }
}
