import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64

export function createSalt(): Buffer {
  return randomBytes(16)
}

export function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN)
}

export function verifyPassword(password: string, hashHex: string, saltHex: string): boolean {
  const expected = Buffer.from(hashHex, 'hex')
  const actual = hashPassword(password, Buffer.from(saltHex, 'hex'))
  if (expected.length !== actual.length) {
    return false
  }
  return timingSafeEqual(expected, actual)
}

export function hashPasswordToHex(password: string, salt = createSalt()): {
  hashHex: string
  saltHex: string
} {
  return {
    hashHex: hashPassword(password, salt).toString('hex'),
    saltHex: salt.toString('hex'),
  }
}
