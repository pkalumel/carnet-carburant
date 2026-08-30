import { supabase } from './supabase'

/**
 * Trace d'un appel vers une API externe (Nominatim…), agrégée dans la
 * console d'administration. Feu-et-oublie absolu : jamais d'attente,
 * jamais d'erreur remontée — la télémétrie ne doit rien coûter.
 */
export function logApi(api: string, ok: boolean, status: number | null, ms: number) {
  try {
    void supabase
      .from('api_log')
      .insert({ api, ok, status, ms: Math.round(ms) })
      .then(() => undefined)
  } catch {
    // hors-ligne ou session absente : tant pis pour cette trace
  }
}
