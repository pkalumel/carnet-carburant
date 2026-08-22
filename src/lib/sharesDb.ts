// Couche data du partage de véhicules. Comme adminDb : en ligne, sans
// cache ni outbox — le partage se gère connecté.
import { supabase } from './supabase'
import type { VehicleShare } from './types'

export interface InviteResult {
  user_exists: boolean
  invited: number
  email_sent?: boolean
  warning?: string
}

/** Tous les partages qui me concernent (émis et reçus — la RLS filtre) */
export async function listShares(): Promise<VehicleShare[]> {
  const { data, error } = await supabase
    .from('vehicle_shares')
    .select('*')
    .order('created_at')
  if (error) throw new Error(`Lecture des partages impossible : ${error.message}`)
  return (data ?? []) as VehicleShare[]
}

/** Invite une adresse sur des véhicules ; envoie l'e-mail si pas de compte */
export async function inviteGuest(email: string, vehicleIds: string[]): Promise<InviteResult> {
  const { data, error } = await supabase.functions.invoke('invite-guest', {
    body: { email, vehicle_ids: vehicleIds },
  })
  if (error) {
    // FunctionsHttpError : le corps JSON de la réponse porte le vrai message
    let detail = error.message
    if ('context' in error && error.context instanceof Response) {
      try {
        const body = (await error.context.json()) as { error?: string }
        if (body.error) detail = body.error
      } catch {
        // corps illisible : on garde le message générique
      }
    }
    throw new Error(`Invitation impossible : ${detail}`)
  }
  return data as InviteResult
}

/** Supprime un partage — révocation par le proprio ou départ de l'invité (la RLS arbitre) */
export async function revokeShare(id: string): Promise<void> {
  const { error } = await supabase.from('vehicle_shares').delete().eq('id', id)
  if (error) throw new Error(`Retrait du partage impossible : ${error.message}`)
}

/** Rattache à mon compte les invitations en attente portant mon adresse */
export async function claimShares(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('claim_shares')
    if (error) return 0
    return typeof data === 'number' ? data : 0
  } catch {
    return 0
  }
}
