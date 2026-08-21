// Couche data de la console d'administration. Contrairement à db.ts,
// pas de cache IndexedDB ni d'outbox : l'admin travaille en ligne sur
// des données fraîches, servies par les RPC security definer.
import { supabase } from './supabase'

export interface WeekPoint {
  week: string // lundi de la semaine, YYYY-MM-DD
  n: number
}

export interface AdminOverview {
  users_total: number
  vehicles_total: number
  fillups_total: number
  drafts_total: number
  active_7d: number
  active_30d: number
  signed_in_30d: number
  signups_weekly: WeekPoint[]
  fillups_weekly: WeekPoint[]
  by_energy: Record<string, number>
  by_fuel: Record<string, number>
}

export interface AdminUserRow {
  user_id: string
  email: string
  user_created_at: string
  last_sign_in_at: string | null
  banned_until: string | null
  is_admin: boolean
  vehicle_count: number
  fillup_count: number
  last_fillup_at: string | null
  total_count: number
}

export interface AdminUserDetail {
  user: {
    id: string
    email: string
    created_at: string
    last_sign_in_at: string | null
    banned_until: string | null
    is_admin: boolean
  }
  vehicles: {
    id: string
    name: string
    plate: string | null
    fuel: string | null
    fillup_count: number
    last_fillup_at: string | null
    total_spent: number
  }[]
  recent_fillups: {
    id: string
    filled_at: string
    energy: 'fuel' | 'electric'
    liters: number | null
    total_price: number | null
    odometer_km: number | null
    is_draft: boolean
    vehicle_name: string
  }[]
  photo_count: number
  photo_bytes: number
}

export interface AdminHealth {
  photo_count: number
  photo_bytes: number
  orphan_photos: number
  missing_photos: number
  stale_drafts: number
  fillups_bytes: number
  vehicles_bytes: number
  orphan_vehicles: number
}

export interface AdminUsersQuery {
  search?: string
  status?: 'all' | 'active' | 'dormant'
  sort?: 'activity' | 'created' | 'fillups' | 'email'
  dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export type AccountAction = 'delete' | 'ban' | 'unban'

/** Décide de l'affichage de l'onglet Admin ; la vraie garde est côté serveur. */
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_admin')
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

export async function fetchOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw new Error(`Vue d'ensemble impossible : ${error.message}`)
  return data as AdminOverview
}

export async function fetchUsers(q: AdminUsersQuery = {}): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_users', {
    p_search: q.search ?? null,
    p_status: q.status ?? 'all',
    p_sort: q.sort ?? 'activity',
    p_dir: q.dir ?? 'desc',
    p_limit: q.limit ?? 50,
    p_offset: q.offset ?? 0,
  })
  if (error) throw new Error(`Liste des utilisateurs impossible : ${error.message}`)
  return (data ?? []) as AdminUserRow[]
}

export async function fetchUserDetail(userId: string): Promise<AdminUserDetail> {
  const { data, error } = await supabase.rpc('admin_user_detail', { p_user_id: userId })
  if (error) throw new Error(`Fiche utilisateur impossible : ${error.message}`)
  return data as AdminUserDetail
}

export async function fetchHealth(): Promise<AdminHealth> {
  const { data, error } = await supabase.rpc('admin_health')
  if (error) throw new Error(`État de santé impossible : ${error.message}`)
  return data as AdminHealth
}

/** Actions destructives : passent par l'Edge Function (clé service_role côté serveur). */
export async function adminAccountAction(action: AccountAction, userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-account', {
    body: { action, user_id: userId },
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
    throw new Error(`Action refusée : ${detail}`)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(`Action refusée : ${String(data.error)}`)
  }
}
