/** Household roster shared by every instance: ids, display names and default ports. */

export type HouseholdId = keyof typeof HOUSEHOLDS

export const HOUSEHOLDS = {
  ahmad: { name: 'Ahmad', family: 'the Ahmads', port: 4001 },
  park: { name: 'Park', family: 'the Parks', port: 4002 },
  lee: { name: 'Lee', family: 'the Lees', port: 4003 },
  chen: { name: 'Chen', family: 'the Chens', port: 4004 },
} as const

export const HOUSEHOLD_IDS = Object.keys(HOUSEHOLDS) as HouseholdId[]

export function isHouseholdId(value: string | undefined): value is HouseholdId {
  return value !== undefined && value in HOUSEHOLDS
}

/** "the Parks" / "Park" for any id we know, fall back to the raw id. */
export function familyOf(id: string): string {
  return isHouseholdId(id) ? HOUSEHOLDS[id].family : id
}

export function nameOf(id: string): string {
  return isHouseholdId(id) ? HOUSEHOLDS[id].name : id
}
