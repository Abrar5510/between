import type { Store, PeerRow } from './db.ts'
import type { Clock } from './dates.ts'
import { dayCountBetween } from './dates.ts'

/**
 * Demo data for the four households, all relative to the demo clock, so the
 * same scenario rehearses identically every day. Dates: the next Thursday is
 * the soccer run that needs covering; the Tuesday after it is what the Parks
 * trade; the Sunday after it is the Chens' swim run.
 */
export function seedStore(store: Store, household: string, opts: { clock: Clock; peers: PeerRow[] }): void {
  const { clock, peers } = opts
  store.clearAll()

  for (const peer of peers) store.upsertPeer(peer)

  const thursday = clock.nextWeekday(4, 16) // 4 PM
  const daysToThursday = dayCountBetween(clock.isoAt(0, 0), thursday)
  const tuesday = clock.isoAt(daysToThursday + 5, 16) // the Tuesday after the Thursday, 4 PM
  const sunday = clock.isoAt(daysToThursday + 3, 7) // the Sunday after the Thursday, 7 AM
  const busyStart = clock.isoAt(daysToThursday, 15.5) // 3:30 PM, runs into the 4 PM slot

  switch (household) {
    case 'ahmad': {
      store.insertEvent({
        id: 'evt-ahmad-soccer',
        title: "Maya's soccer practice at Lincoln Field",
        task: 'soccer run',
        start: thursday,
        mins: 60,
        kind: 'activity',
        would_trade: 0,
      })
      store.setPref('weekends', 'No early weekend mornings.')
      // The Lees owe Ahmad two from the weeks before the window.
      store.addLedger('lee', 1, 'seed-lee-1', 'You covered their school pickup in September', clock.isoAt(-21, 9))
      store.addLedger('lee', 1, 'seed-lee-2', 'You covered their Saturday morning run', clock.isoAt(-14, 9))
      break
    }
    case 'park': {
      store.insertEvent({
        id: 'evt-park-run',
        title: 'Park Tuesday soccer run',
        task: 'soccer run',
        start: tuesday,
        mins: 60,
        kind: 'run',
        would_trade: 1,
      })
      store.setPref('tuesdays', 'Tuesdays are hard for us.')
      break
    }
    case 'lee': {
      store.insertEvent({
        id: 'evt-lee-busy',
        title: 'Dentist appointment',
        task: 'appointment',
        start: busyStart,
        mins: 120,
        kind: 'busy',
        would_trade: 0,
      })
      // The mirror of Ahmad's ledger: the Lees owe the Ahmads two.
      store.addLedger('ahmad', -1, 'seed-lee-1', 'Ahmad covered our school pickup in September', clock.isoAt(-21, 9))
      store.addLedger('ahmad', -1, 'seed-lee-2', 'Ahmad covered our Saturday morning run', clock.isoAt(-14, 9))
      break
    }
    case 'chen': {
      store.insertEvent({
        id: 'evt-chen-swim',
        title: 'Sunday swim squad',
        task: 'swim run',
        start: sunday,
        mins: 60,
        kind: 'run',
        would_trade: 1,
      })
      break
    }
    default:
      throw new Error(`no seed for household "${household}"`)
  }
}
