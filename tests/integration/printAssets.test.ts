import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getUploadsDir } from '../../server/lib/paths'
import { getTestAgent, useIntegrationEnv } from './helpers/testEnv'

describe('cached uploads', () => {
  useIntegrationEnv()

  it('serves an uploaded image from a long-lived immutable cache', async () => {
    // Uploads are named with a random UUID and never overwritten, so a URL
    // always means the same bytes. Shop logos are requested on every print
    // preview, which is why they are cached for a year.
    const name = '11111111-2222-3333-4444-555555555555.png'
    writeFileSync(join(getUploadsDir(), name), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const response = await getTestAgent().get(`/uploads/${name}`)

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toContain('immutable')
    expect(response.headers['cache-control']).toContain('max-age=31536000')
  })
})
