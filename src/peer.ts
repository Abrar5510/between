import { ProtocolError, SIGNATURE_HEADER, open, seal, type Offer } from 'between-protocol'
import type { Store } from './db.ts'

export interface PeerTransportOptions {
  store: Store
  self: string
  privateKey: string
  timeoutMs: number
  now: () => Date
  log?: (message: string, extra?: Record<string, unknown>) => void
}

/**
 * The only channel between households: POST /peer/offers carrying one signed
 * offer. The receiver verifies the signature before the body is parsed, and
 * the offer id is the primary key, so replays are no-ops.
 */
export function createPeerTransport(opts: PeerTransportOptions) {
  const { store, self, privateKey, timeoutMs, now } = opts
  const log = opts.log ?? (() => {})

  async function deliver(id: string): Promise<void> {
    const message = store.getMessage(id)
    if (!message || message.delivered) return
    const peer = store.getPeer(message.peer)
    if (!peer) {
      log('no url for peer', { peer: message.peer })
      return
    }
    try {
      const response = await fetch(new URL('/peer/offers', peer.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'between-key-id': JSON.parse(message.body).from as string,
          'between-signature': message.sig,
        },
        body: message.body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.ok) store.markDelivered(id)
      else log('peer rejected the offer', { peer: peer.id, status: response.status })
    } catch (error) {
      log('peer unreachable', { peer: peer.id, error: String(error) })
    }
  }

  /** Seal, log, and hand to the network. Never awaited by the engine. */
  function send(offer: Offer, threadId: string): void {
    const sealed = seal(offer, privateKey)
    store.logMessage({
      id: offer.id,
      thread: threadId,
      direction: 'out',
      peer: offer.to,
      body: sealed.body,
      sig: String(sealed.headers[SIGNATURE_HEADER]),
      at: offer.sentAt,
    })
    void deliver(offer.id)
  }

  type ReceiveResult = { ok: true; offer: Offer; duplicate: boolean } | { ok: false; code: string }

  function receiveIncoming(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ReceiveResult {
    try {
      const body = rawBody.toString('utf8')
      const offer = open(body, headers, id => store.getPeer(id)?.public_key, now())
      if (offer.to !== self) return { ok: false, code: 'wrong_recipient' }
      const fresh = store.logMessage({
        id: offer.id,
        thread: offer.thread,
        direction: 'in',
        peer: offer.from,
        body,
        sig: String(headers[SIGNATURE_HEADER] ?? ''),
        at: offer.sentAt,
        delivered: 1,
      })
      return { ok: true, offer, duplicate: !fresh }
    } catch (error) {
      if (error instanceof ProtocolError) return { ok: false, code: error.code }
      throw error
    }
  }

  /** Retry everything that has not been acknowledged yet. */
  async function deliverPending(): Promise<number> {
    const pending = store.undeliveredMessages()
    for (const message of pending) await deliver(message.id)
    return pending.length
  }

  return { send, receiveIncoming, deliverPending }
}
