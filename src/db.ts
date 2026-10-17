import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Thread } from 'between-protocol'

export type Direction = 'in' | 'out'
export type Role = 'initiator' | 'responder'
export type EventKind = 'activity' | 'run' | 'busy'
export type NegotiationStatus =
  | 'negotiating'
  | 'proposal_ready'
  | 'awaiting_other_family'
  | 'agreed'
  | 'declined'
  | 'no_help_found'

export interface PeerRow {
  id: string
  name: string
  url: string
  public_key: string
}

export interface EventRow {
  id: string
  title: string
  task: string
  start: string
  mins: number
  kind: EventKind
  would_trade: number
  covered_by: string | null
  covering_for: string | null
  thread: string | null
}

export interface NegotiationRow {
  id: string
  event_id: string
  status: NegotiationStatus
  chosen_thread: string | null
  why: string | null
  created_at: string
}

export interface ThreadRow {
  id: string
  negotiation_id: string | null
  peer: string
  role: Role
  state: Thread
  meta: ThreadMeta
  updated_at: string
}

export interface ThreadMeta {
  why?: string
  [key: string]: unknown
}

export interface MessageRow {
  id: string
  thread: string
  direction: Direction
  peer: string
  body: string
  sig: string
  at: string
  delivered: number
}

export interface LedgerRow {
  id: number
  peer: string
  delta: number
  thread: string
  note: string
  at: string
}

export type EventInput = Omit<EventRow, 'covered_by' | 'covering_for' | 'thread'> & {
  covered_by?: string | null
  covering_for?: string | null
  thread?: string | null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS peers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  public_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  task TEXT NOT NULL,
  start TEXT NOT NULL,
  mins INTEGER NOT NULL,
  kind TEXT NOT NULL,
  would_trade INTEGER NOT NULL DEFAULT 0,
  covered_by TEXT,
  covering_for TEXT,
  thread TEXT
);
CREATE TABLE IF NOT EXISTS prefs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS negotiations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  chosen_thread TEXT,
  why TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  negotiation_id TEXT,
  peer TEXT NOT NULL,
  role TEXT NOT NULL,
  state TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread TEXT NOT NULL,
  direction TEXT NOT NULL,
  peer TEXT NOT NULL,
  body TEXT NOT NULL,
  sig TEXT NOT NULL,
  at TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peer TEXT NOT NULL,
  delta INTEGER NOT NULL,
  thread TEXT NOT NULL,
  note TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE(thread, delta)
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread);
CREATE INDEX IF NOT EXISTS messages_undelivered ON messages(delivered) WHERE delivered = 0;
CREATE INDEX IF NOT EXISTS threads_negotiation ON threads(negotiation_id);
CREATE INDEX IF NOT EXISTS threads_role ON threads(role);
`

/**
 * One SQLite database per household. Nothing in here knows about HTTP or MCP;
 * the engine and the transport layer share it.
 */
export class Store {
  readonly db: DatabaseSync

  constructor(db: DatabaseSync = new DatabaseSync(':memory:')) {
    this.db = db
    this.db.exec(SCHEMA)
  }

  static open(path: string): Store {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    return new Store(new DatabaseSync(path))
  }

  close(): void {
    this.db.close()
  }

  // ── peers ────────────────────────────────────────────────────────────────

  upsertPeer(peer: PeerRow): void {
    this.db
      .prepare(
        `INSERT INTO peers (id, name, url, public_key) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, public_key = excluded.public_key`,
      )
      .run(peer.id, peer.name, peer.url, peer.public_key)
  }

  /** Insertion order is trust order: it is the tie-break for who gets asked first. */
  listPeers(): PeerRow[] {
    return this.db.prepare('SELECT * FROM peers ORDER BY rowid').all() as unknown as PeerRow[]
  }

  getPeer(id: string): PeerRow | undefined {
    return this.db.prepare('SELECT * FROM peers WHERE id = ?').get(id) as unknown as PeerRow | undefined
  }

  // ── events (the calendar) ────────────────────────────────────────────────

  insertEvent(event: EventInput): void {
    this.db
      .prepare(
        `INSERT INTO events (id, title, task, start, mins, kind, would_trade, covered_by, covering_for, thread)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.title,
        event.task,
        event.start,
        event.mins,
        event.kind,
        event.would_trade,
        event.covered_by ?? null,
        event.covering_for ?? null,
        event.thread ?? null,
      )
  }

  listEvents(): EventRow[] {
    return this.db.prepare('SELECT * FROM events ORDER BY start').all() as unknown as EventRow[]
  }

  /** Mark an event covered. Returns false when it was already covered (idempotent commit). */
  markCovered(eventId: string, peer: string, thread: string): boolean {
    const result = this.db
      .prepare('UPDATE events SET covered_by = ?, thread = ? WHERE id = ? AND covered_by IS NULL')
      .run(peer, thread, eventId)
    return Number(result.changes) > 0
  }

  /** Find an event of ours that a trade hands over (task + start identify it). */
  findOwnEvent(task: string, start: string): EventRow | undefined {
    return this.db
      .prepare('SELECT * FROM events WHERE task = ? AND start = ? LIMIT 1')
      .get(task, start) as unknown as EventRow | undefined
  }

  /** Events settled by a given thread; a marker for the idempotent commit. */
  eventsForThread(thread: string): EventRow[] {
    return this.db.prepare('SELECT * FROM events WHERE thread = ?').all(thread) as unknown as EventRow[]
  }

  // ── preferences ──────────────────────────────────────────────────────────

  setPref(key: string, value: string): void {
    this.db.prepare('INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  listPrefs(): { key: string; value: string }[] {
    return this.db.prepare('SELECT key, value FROM prefs ORDER BY rowid').all() as unknown as { key: string; value: string }[]
  }

  // ── negotiations ─────────────────────────────────────────────────────────

  insertNegotiation(row: NegotiationRow): void {
    this.db
      .prepare('INSERT INTO negotiations (id, event_id, status, chosen_thread, why, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.id, row.event_id, row.status, row.chosen_thread, row.why, row.created_at)
  }

  getNegotiation(id: string): NegotiationRow | undefined {
    return this.db.prepare('SELECT * FROM negotiations WHERE id = ?').get(id) as unknown as NegotiationRow | undefined
  }

  listNegotiations(): NegotiationRow[] {
    return this.db.prepare('SELECT * FROM negotiations ORDER BY created_at DESC').all() as unknown as NegotiationRow[]
  }

  /** The most recent negotiation that still needs attention from this household. */
  activeNegotiations(): NegotiationRow[] {
    return this.db
      .prepare(
        `SELECT * FROM negotiations WHERE status IN ('negotiating','proposal_ready','awaiting_other_family') ORDER BY created_at DESC`,
      )
      .all() as unknown as NegotiationRow[]
  }

  openNegotiationForEvent(eventId: string): NegotiationRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM negotiations WHERE event_id = ? AND status IN ('negotiating','proposal_ready','awaiting_other_family') ORDER BY created_at DESC LIMIT 1`,
      )
      .get(eventId) as unknown as NegotiationRow | undefined
  }

  setNegotiation(id: string, fields: Partial<Pick<NegotiationRow, 'status' | 'chosen_thread' | 'why'>>): void {
    const current = this.getNegotiation(id)
    if (!current) return
    this.db
      .prepare('UPDATE negotiations SET status = ?, chosen_thread = ?, why = ? WHERE id = ?')
      .run(
        fields.status ?? current.status,
        fields.chosen_thread ?? current.chosen_thread,
        fields.why ?? current.why,
        id,
      )
  }

  // ── threads ──────────────────────────────────────────────────────────────

  insertThread(row: Omit<ThreadRow, 'meta' | 'updated_at'> & { meta?: ThreadMeta; updated_at?: string }): void {
    this.db
      .prepare('INSERT INTO threads (id, negotiation_id, peer, role, state, meta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        row.id,
        row.negotiation_id,
        row.peer,
        row.role,
        JSON.stringify(row.state),
        JSON.stringify(row.meta ?? {}),
        row.updated_at ?? new Date().toISOString(),
      )
  }

  getThread(id: string): ThreadRow | undefined {
    const raw = this.db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as unknown as
      | (Omit<ThreadRow, 'state' | 'meta'> & { state: string; meta: string })
      | undefined
    if (!raw) return undefined
    return { ...raw, state: JSON.parse(raw.state) as Thread, meta: JSON.parse(raw.meta) as ThreadMeta }
  }

  saveThread(id: string, state: Thread, meta?: ThreadMeta, at = new Date().toISOString()): void {
    if (meta) {
      this.db.prepare('UPDATE threads SET state = ?, meta = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(state), JSON.stringify(meta), at, id)
    } else {
      this.db.prepare('UPDATE threads SET state = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(state), at, id)
    }
  }

  threadsForNegotiation(negotiationId: string): ThreadRow[] {
    const rows = this.db.prepare('SELECT * FROM threads WHERE negotiation_id = ? ORDER BY rowid').all(negotiationId) as unknown as (
      | (Omit<ThreadRow, 'state' | 'meta'> & { state: string; meta: string })
    )[]
    return rows.map(r => ({ ...r, state: JSON.parse(r.state) as Thread, meta: JSON.parse(r.meta) as ThreadMeta }))
  }

  /** Threads where another household opened a negotiation with us. */
  responderThreads(): ThreadRow[] {
    const rows = this.db.prepare('SELECT * FROM threads WHERE role = ? ORDER BY rowid DESC').all('responder') as unknown as (
      | (Omit<ThreadRow, 'state' | 'meta'> & { state: string; meta: string })
    )[]
    return rows.map(r => ({ ...r, state: JSON.parse(r.state) as Thread, meta: JSON.parse(r.meta) as ThreadMeta }))
  }

  allThreads(): ThreadRow[] {
    const rows = this.db.prepare('SELECT * FROM threads ORDER BY rowid').all() as unknown as (
      | (Omit<ThreadRow, 'state' | 'meta'> & { state: string; meta: string })
    )[]
    return rows.map(r => ({ ...r, state: JSON.parse(r.state) as Thread, meta: JSON.parse(r.meta) as ThreadMeta }))
  }

  /** Run `fn` in one SQLite transaction; roll back on any throw. */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // ── messages (the wire log) ──────────────────────────────────────────────

  /** Insert an offer. The primary key makes this replay protection: duplicates return false. */
  logMessage(row: Omit<MessageRow, 'delivered'> & { delivered?: number }): boolean {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO messages (id, thread, direction, peer, body, sig, at, delivered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.id, row.thread, row.direction, row.peer, row.body, row.sig, row.at, row.delivered ?? 0)
    return Number(result.changes) > 0
  }

  getMessage(id: string): MessageRow | undefined {
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as unknown as MessageRow | undefined
  }

  undeliveredMessages(): MessageRow[] {
    return this.db.prepare('SELECT * FROM messages WHERE direction = ? AND delivered = 0 ORDER BY at').all('out') as unknown as MessageRow[]
  }

  markDelivered(id: string): void {
    this.db.prepare('UPDATE messages SET delivered = 1 WHERE id = ?').run(id)
  }

  messagesForThread(thread: string): MessageRow[] {
    return this.db.prepare('SELECT * FROM messages WHERE thread = ? ORDER BY at').all(thread) as unknown as MessageRow[]
  }

  recentMessages(limit = 60): MessageRow[] {
    return this.db.prepare('SELECT * FROM messages ORDER BY at DESC LIMIT ?').all(limit) as unknown as MessageRow[]
  }

  countMessages(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM messages').get() as unknown as { n: number }
    return row.n
  }

  // ── ledger ───────────────────────────────────────────────────────────────

  /** +1 we covered for them, -1 they covered for us. */
  addLedger(peer: string, delta: number, thread: string, note: string, at: string): boolean {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO ledger (peer, delta, thread, note, at) VALUES (?, ?, ?, ?, ?)')
      .run(peer, delta, thread, note, at)
    return Number(result.changes) > 0
  }

  balanceFor(peer: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger WHERE peer = ?').get(peer) as unknown as {
      balance: number
    }
    return Number(row.balance)
  }

  ledgerEntries(): LedgerRow[] {
    return this.db.prepare('SELECT * FROM ledger ORDER BY at DESC, id DESC').all() as unknown as LedgerRow[]
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  isEmpty(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM peers').get() as unknown as { n: number }
    return row.n === 0
  }

  /** Wipe everything but keep the schema. Used by /api/reset and the seed. */
  clearAll(): void {
    for (const table of ['messages', 'ledger', 'threads', 'negotiations', 'events', 'prefs', 'peers']) {
      this.db.exec(`DELETE FROM ${table}`)
    }
    this.db.exec("DELETE FROM sqlite_sequence WHERE name = 'ledger'")
  }
}
