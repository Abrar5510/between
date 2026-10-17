import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateKeyPair } from 'between-protocol'

export interface KeyPair {
  privateKey: string
  publicKey: string
}

const cache = new Map<string, KeyPair>()

/** Load a household key pair, generating it once per keys directory. */
export function loadOrCreateKeyPair(keysDir: string, household: string): KeyPair {
  const cached = cache.get(`${keysDir}:${household}`)
  if (cached) return cached
  mkdirSync(keysDir, { recursive: true })
  const file = join(keysDir, `${household}.json`)
  const pair: KeyPair = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as KeyPair)
    : generateKeyPair()
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(pair, null, 2), { mode: 0o600 })
  cache.set(`${keysDir}:${household}`, pair)
  return pair
}
