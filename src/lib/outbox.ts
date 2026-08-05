import { get, set } from 'idb-keyval'
import type { FillupInput } from './types'

/** Plein saisi hors ligne, en attente d'envoi vers Supabase */
export interface PendingFillup {
  localId: string
  input: FillupInput
  photo: Blob | null
}

const KEY = 'outbox:fillups'

export async function listOutbox(): Promise<PendingFillup[]> {
  return (await get<PendingFillup[]>(KEY)) ?? []
}

export async function addToOutbox(item: PendingFillup): Promise<void> {
  const items = await listOutbox()
  items.push(item)
  await set(KEY, items)
}

export async function removeFromOutbox(localId: string): Promise<void> {
  const items = await listOutbox()
  await set(KEY, items.filter((i) => i.localId !== localId))
}
