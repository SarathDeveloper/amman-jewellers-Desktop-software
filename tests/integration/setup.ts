import { afterEach } from 'vitest'
import { closeDatabase } from '../../server/db'

afterEach(() => {
  closeDatabase()
})
