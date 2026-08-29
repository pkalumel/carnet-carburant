import { get as idbGet, set as idbSet } from 'idb-keyval'
import { supabase } from './supabase'
import { addToOutbox, listOutbox, removeFromOutbox, type PendingFillup } from './outbox'
import type { Fillup, FillupInput, Vehicle } from './types'

const CACHE_VEHICLES = 'cache:vehicles'
const CACHE_FILLUPS = 'cache:fillups'
const BUCKET = 'pump-photos'

// ------------------------------------------------------------
// Véhicules
// ------------------------------------------------------------

export async function loadVehicles(): Promise<Vehicle[]> {
  try {
    const { data, error } = await supabase.from('vehicles').select('*').order('created_at')
    if (error) throw error
    await idbSet(CACHE_VEHICLES, data)
    return data as Vehicle[]
  } catch {
    return ((await idbGet(CACHE_VEHICLES)) as Vehicle[] | undefined) ?? []
  }
}

export async function addVehicle(
  name: string,
  plate: string | null,
  fuel: string | null,
): Promise<Vehicle> {
  let { data, error } = await supabase
    .from('vehicles')
    .insert({ name, plate, fuel })
    .select()
    .single()
  if (error && error.message.includes('fuel')) {
    // Base pas encore migrée (colonne fuel absente) : on insère sans le carburant
    ;({ data, error } = await supabase.from('vehicles').insert({ name, plate }).select().single())
  }
  if (error) throw new Error(`Ajout du véhicule impossible : ${error.message}`)
  return data as Vehicle
}

export async function updateVehicle(
  id: string,
  patch: {
    name: string
    plate: string | null
    fuel: string | null
    home_kwh_price: number | null
    battery_kwh: number | null
  },
): Promise<void> {
  const { error } = await supabase.from('vehicles').update(patch).eq('id', id)
  if (error) throw new Error(`Modification impossible : ${error.message}`)
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) throw new Error(`Suppression impossible : ${error.message}`)
}

// ------------------------------------------------------------
// Pleins
// ------------------------------------------------------------

function pendingToFillup(p: PendingFillup): Fillup {
  const { input } = p
  const ppl =
    input.liters && input.total_price != null && input.liters > 0
      ? Math.round((input.total_price / input.liters) * 1000) / 1000
      : null
  return {
    id: p.localId,
    ...input,
    // entrées mises en file avant la migration : les nouveaux champs manquent
    battery_before_pct: input.battery_before_pct ?? null,
    battery_after_pct: input.battery_after_pct ?? null,
    liters_estimated: input.liters_estimated ?? false,
    price_per_liter: ppl,
    photo_path: null,
    created_by: null, // renseigné par le serveur à la synchronisation
    created_at: input.filled_at,
    pending: true,
  }
}

/** Tous les pleins (serveur ou cache local), pleins hors ligne inclus, du plus récent au plus ancien */
export async function loadFillups(): Promise<Fillup[]> {
  let rows: Fillup[]
  try {
    const { data, error } = await supabase
      .from('fillups')
      .select('*')
      .order('filled_at', { ascending: false })
    if (error) throw error
    rows = data as Fillup[]
    await idbSet(CACHE_FILLUPS, rows)
  } catch {
    rows = ((await idbGet(CACHE_FILLUPS)) as Fillup[] | undefined) ?? []
  }
  const pending = (await listOutbox()).map(pendingToFillup)
  return [...pending, ...rows]
    .map((f) => ({
      // lignes du cache ou du serveur d'avant les migrations
      ...f,
      energy: f.energy ?? ('fuel' as const),
      battery_before_pct: f.battery_before_pct ?? null,
      battery_after_pct: f.battery_after_pct ?? null,
      liters_estimated: f.liters_estimated ?? false,
    }))
    .sort((a, b) => new Date(b.filled_at).getTime() - new Date(a.filled_at).getTime())
}

/** Colonnes ajoutées par migrations : retirées une à une si la base n'est pas à jour */
const OPTIONAL_COLS = ['energy', 'battery_before_pct', 'battery_after_pct', 'liters_estimated']

/** Insertion avec repli si une colonne récente n'existe pas encore côté serveur */
async function insertFillup(row: Record<string, unknown>): Promise<void> {
  const attempt = { ...row }
  for (let i = 0; i <= OPTIONAL_COLS.length; i++) {
    const { error } = await supabase.from('fillups').insert(attempt)
    if (!error) return
    const missing = OPTIONAL_COLS.find((c) => c in attempt && error.message.includes(c))
    if (!missing) throw error
    delete attempt[missing]
  }
}

async function uploadPhoto(id: string, photo: Blob): Promise<string> {
  const webp = photo.type === 'image/webp'
  const path = `pump/${id}.${webp ? 'webp' : 'jpg'}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: webp ? 'image/webp' : 'image/jpeg', upsert: true })
  if (error) throw error
  return path
}

/**
 * Enregistre un plein. En ligne : envoi direct (photo comprise).
 * Hors ligne ou en cas d'échec réseau : mise en file d'attente locale.
 */
export async function saveFillup(
  input: FillupInput,
  photo: Blob | null,
): Promise<'synced' | 'queued'> {
  const id = crypto.randomUUID()
  if (navigator.onLine) {
    try {
      const photo_path = photo ? await uploadPhoto(id, photo) : null
      await insertFillup({ id, ...input, photo_path })
      return 'synced'
    } catch {
      // on retombe sur la file d'attente locale
    }
  }
  await addToOutbox({ localId: id, input, photo })
  return 'queued'
}

/** Envoie les pleins en attente ; renvoie le nombre synchronisé */
export async function flushOutbox(): Promise<number> {
  const items = await listOutbox()
  let synced = 0
  for (const item of items) {
    try {
      const photo_path = item.photo ? await uploadPhoto(item.localId, item.photo) : null
      try {
        await insertFillup({ id: item.localId, ...item.input, photo_path })
      } catch (err) {
        // 23505 : déjà inséré lors d'un essai précédent
        if ((err as { code?: string }).code !== '23505') throw err
      }
      await removeFromOutbox(item.localId)
      synced++
    } catch {
      break // réseau toujours indisponible : on réessaiera plus tard
    }
  }
  return synced
}

export async function updateFillup(
  id: string,
  patch: Partial<FillupInput>,
  newPhoto: Blob | null,
): Promise<void> {
  let photoPatch = {}
  if (newPhoto) {
    const photo_path = await uploadPhoto(id, newPhoto)
    photoPatch = { photo_path }
  }
  // Même repli « colonne absente » que l'insertion (base pas encore migrée)
  const attempt: Record<string, unknown> = { ...patch, ...photoPatch }
  for (let i = 0; i <= OPTIONAL_COLS.length; i++) {
    const { error } = await supabase.from('fillups').update(attempt).eq('id', id)
    if (!error) return
    const missing = OPTIONAL_COLS.find((c) => c in attempt && error.message.includes(c))
    if (!missing) throw new Error(`Modification impossible : ${error.message}`)
    delete attempt[missing]
  }
}

export async function deleteFillup(f: Fillup): Promise<void> {
  if (f.pending) {
    await removeFromOutbox(f.id)
    return
  }
  const { error } = await supabase.from('fillups').delete().eq('id', f.id)
  if (error) throw new Error(`Suppression impossible : ${error.message}`)
  if (f.photo_path) await supabase.storage.from(BUCKET).remove([f.photo_path])
}

// ------------------------------------------------------------
// Photos (URLs signées, mises en cache en mémoire)
// ------------------------------------------------------------

const urlCache = new Map<string, string>()

export async function getPhotoUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path)
  if (cached) return cached
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return null
  urlCache.set(path, data.signedUrl)
  return data.signedUrl
}
