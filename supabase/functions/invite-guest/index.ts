// Invitation d'un invité sur des véhicules : la RPC invite_guest
// (appelée avec le JWT de l'appelant, qui porte toutes les gardes)
// crée les partages ; si l'adresse n'a pas encore de compte, l'e-mail
// d'invitation Supabase est envoyé avec la clé service_role.
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://carnet-carburant.vercel.app'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'méthode non autorisée' })

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return reply(401, { error: 'non authentifié' })

  let email: unknown, vehicleIds: unknown
  try {
    ;({ email, vehicle_ids: vehicleIds } = await req.json())
  } catch {
    return reply(400, { error: 'corps JSON invalide' })
  }
  if (
    typeof email !== 'string' ||
    !Array.isArray(vehicleIds) ||
    vehicleIds.length === 0 ||
    vehicleIds.some((v) => typeof v !== 'string')
  ) {
    return reply(400, { error: 'e-mail ou véhicules invalides' })
  }

  // Toutes les gardes (possession des véhicules, auto-invitation…)
  // sont dans la RPC, exécutée avec les droits de l'appelant.
  const { data, error } = await caller.rpc('invite_guest', {
    p_email: email,
    p_vehicle_ids: vehicleIds,
  })
  if (error) return reply(400, { error: error.message })

  const result = data as { user_exists: boolean; invited: number }
  let emailSent = false

  if (!result.user_exists) {
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: APP_URL,
    })
    if (!inviteErr) {
      emailSent = true
    } else if (!/already.*registered|already.*exists/i.test(inviteErr.message)) {
      // Course bénigne si le compte vient d'apparaître (claim_shares
      // rattachera) ; toute autre erreur d'envoi n'annule pas le
      // partage créé — ré-inviter est idempotent.
      return reply(200, { ...result, email_sent: false, warning: inviteErr.message })
    }
  }

  return reply(200, { ...result, email_sent: emailSent })
})
