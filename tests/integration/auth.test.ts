import { describe, expect, it } from 'vitest'
import type { AuthUser, User } from '@shared/types'
import { getTestAgent, loginAsAdmin, useIntegrationEnv } from './helpers/testEnv'
import { getDatabase } from '../../server/db'
import { hashPasswordToHex } from '../../server/auth/password'
import { replaceStaffPermissions } from '../../server/auth/users'

describe('auth and permissions', () => {
  useIntegrationEnv()

  it('logs in the default admin and returns me', async () => {
    const me = await getTestAgent().get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.username).toBe('admin')
    expect(me.body.role).toBe('admin')
  })

  it('rejects bad credentials', async () => {
    const response = await getTestAgent().post('/api/auth/login').send({
      username: 'admin',
      password: 'wrong-password',
    })
    expect(response.status).toBe(401)
    expect(response.body.error).toMatch(/Invalid username or password/)
  })

  it('changes password and requires the new one', async () => {
    const changed = await getTestAgent().post('/api/auth/change-password').send({
      currentPassword: 'admin123',
      newPassword: 'admin456',
    })
    expect(changed.status).toBe(200)
    expect(changed.body.mustChangePassword).toBe(false)

    await getTestAgent().post('/api/auth/logout')
    const oldLogin = await getTestAgent().post('/api/auth/login').send({
      username: 'admin',
      password: 'admin123',
    })
    expect(oldLogin.status).toBe(401)

    const newLogin = await getTestAgent().post('/api/auth/login').send({
      username: 'admin',
      password: 'admin456',
    })
    expect(newLogin.status).toBe(200)
  })

  it('lets admin create staff and enforce feature permissions', async () => {
    const created = await getTestAgent().post('/api/users').send({
      username: 'cashier',
      password: 'staff123',
      role: 'staff',
      features: ['billing'],
    })
    expect(created.status).toBe(201)
    expect(created.body.features).toEqual(['billing'])

    await getTestAgent().post('/api/auth/logout')
    const staffLogin = await getTestAgent().post('/api/auth/login').send({
      username: 'cashier',
      password: 'staff123',
    })
    expect(staffLogin.status).toBe(200)
    const staff = staffLogin.body as AuthUser
    expect(staff.features).toEqual(['billing'])

    const products = await getTestAgent().get('/api/products')
    expect(products.status).toBe(403)

    const invoices = await getTestAgent().get('/api/invoices')
    expect(invoices.status).toBe(200)
  })

  it('prevents deactivating the last admin', async () => {
    const users = await getTestAgent().get('/api/users')
    expect(users.status).toBe(200)
    const admin = (users.body as User[]).find((row) => row.role === 'admin')
    expect(admin).toBeTruthy()
    const response = await getTestAgent().delete(`/api/users/${admin!.id}`)
    expect(response.status).toBe(400)
  })

  it('updates staff permissions', async () => {
    const { hashHex, saltHex } = hashPasswordToHex('staff123')
    const result = getDatabase()
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, role, must_change_password, active)
         VALUES (?, ?, ?, 'staff', 0, 1)`,
      )
      .run('clerk', hashHex, saltHex)
    const userId = Number(result.lastInsertRowid)
    replaceStaffPermissions(getDatabase(), userId, ['customers'])

    await loginAsAdmin()
    const updated = await getTestAgent()
      .put(`/api/users/${userId}/permissions`)
      .send({ features: ['customers', 'dues'] })
    expect(updated.status).toBe(200)
    expect(updated.body.features).toEqual(['customers', 'dues'])
  })
})
