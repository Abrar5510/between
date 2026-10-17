import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { Offer, ProtocolError } from './schema.ts'

export const KEY_ID_HEADER = 'between-key-id'
export const SIGNATURE_HEADER = 'between-signature'
const MAX_SKEW_MS = 5 * 60_000

/** Ed25519 key pair, DER encoded as base64url strings. */
export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url'),
  }
}

/** Serialise and sign. Send `body` byte for byte: the signature covers the raw bytes. */
export function seal(offer: Offer, privateKey: string) {
  const body = JSON.stringify(Offer.parse(offer))
  const key = createPrivateKey({ key: Buffer.from(privateKey, 'base64url'), format: 'der', type: 'pkcs8' })
  const signature = sign(null, Buffer.from(body), key).toString('base64url')
  return { body, headers: { [KEY_ID_HEADER]: offer.from, [SIGNATURE_HEADER]: signature } }
}

/**
 * Verify and parse a received offer. `resolveKey` returns the public key of a
 * trusted sender, or undefined. Throws ProtocolError.
 */
export function open(
  body: string,
  headers: Record<string, string | string[] | undefined>,
  resolveKey: (id: string) => string | undefined,
  now = new Date(),
): Offer {
  const keyId = headers[KEY_ID_HEADER]
  const signature = headers[SIGNATURE_HEADER]
  if (typeof keyId !== 'string' || typeof signature !== 'string') throw new ProtocolError('unsigned')
  const publicKey = resolveKey(keyId)
  if (!publicKey) throw new ProtocolError('unknown_sender')
  const key = createPublicKey({ key: Buffer.from(publicKey, 'base64url'), format: 'der', type: 'spki' })
  if (!verify(null, Buffer.from(body), key, Buffer.from(signature, 'base64url'))) throw new ProtocolError('bad_signature')

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    throw new ProtocolError('bad_offer', 'not JSON')
  }
  const parsed = Offer.safeParse(json)
  if (!parsed.success) throw new ProtocolError('bad_offer', parsed.error.issues[0]?.message)
  const offer = parsed.data
  if (offer.from !== keyId) throw new ProtocolError('sender_mismatch')
  if (Date.parse(offer.expires) <= now.getTime()) throw new ProtocolError('expired')
  if (Math.abs(Date.parse(offer.sentAt) - now.getTime()) > MAX_SKEW_MS) throw new ProtocolError('clock_skew')
  return offer
}
